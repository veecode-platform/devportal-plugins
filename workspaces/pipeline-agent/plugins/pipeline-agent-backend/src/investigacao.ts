import type {
  ArquivoDiff,
  Fase,
  UiEvent,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import {
  executarAbrirMr,
  LIMITE_TENTATIVAS,
  parseAbrirMrEntrada,
  type AbrirMrEntrada,
  type ArquivoProposto,
} from './abrir-mr';
import { mapSessionEvent, type Sinal } from './agente/mapear';
import type { AgentRuntime, FluxoEventos } from './agente/types';
import { custoUsd, parseUsage } from './cost';
import { diffArquivo } from './diff';
import { ErroEstado } from './erros';
import type { GitLab } from './gitlab/types';
import { ocultarHost } from './sanitizar';

// One investigation = one agent session. It reads the event flow, shows what
// happens, and holds the abrir_mr tool call until a person decides.

export type Dependencias = {
  runtime: AgentRuntime;
  gitlab: GitLab;
  // The GitLab hostname: every text sent to the agent loses it.
  host: string;
  intervaloPollMs: number;
  prazoPollMs: number;
  dormir: (ms: number) => Promise<void>;
};

type Pendente = {
  toolUseId: string;
  entrada: AbrirMrEntrada;
  arquivos: ArquivoProposto[];
  anuncio: UiEvent;
};

export type Ouvinte = (indice: number, evento: UiEvent) => void;

function descrever(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'erro desconhecido';
}

export class Investigacao {
  readonly id: string;
  readonly entityRef: string;
  readonly iniciadoEm: number;
  readonly pipelineId: number;
  readonly ref: string;
  private readonly dep: Dependencias;
  private fase: Fase = 'investigando';
  private pendente: Pendente | null = null;
  private tentativas = 0;
  private ultimoVermelho = false;
  private verdeEm: number | null = null;
  private motivoFim: string | null = null;
  private custo: number | null = null;
  private fluxo: FluxoEventos | null = null;
  private readonly log: UiEvent[] = [];
  private readonly ouvintes = new Set<Ouvinte>();

  constructor(
    dep: Dependencias,
    opcoes: {
      id: string;
      entityRef: string;
      pipelineId: number;
      ref: string;
      iniciadoEm: number;
    },
  ) {
    this.dep = dep;
    this.id = opcoes.id;
    this.entityRef = opcoes.entityRef;
    this.pipelineId = opcoes.pipelineId;
    this.ref = opcoes.ref;
    this.iniciadoEm = opcoes.iniciadoEm;
  }

  get faseAtual(): Fase {
    return this.fase;
  }

  get encerrada(): boolean {
    return this.motivoFim !== null;
  }

  // Active means not finished and not failed. A failed stream frees the entity.
  get ativa(): boolean {
    return this.motivoFim === null && this.fase !== 'erro';
  }

  // Opens the flow before sending the first message (the docs say a stream only
  // receives events emitted after it was opened).
  async comecar(fluxo: FluxoEventos, mensagemInicial: string): Promise<void> {
    this.fluxo = fluxo;
    void this.correr();
    await this.dep.runtime.enviar(this.id, [
      {
        type: 'user.message',
        content: [{ type: 'text', text: mensagemInicial }],
      },
    ]);
  }

  ouvir(desde: number, ouvinte: Ouvinte): () => void {
    for (let i = desde; i < this.log.length; i++) ouvinte(i, this.log[i]);
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  }

  private emitir(evento: UiEvent): void {
    const indice = this.log.length;
    this.log.push(evento);
    for (const ouvinte of this.ouvintes) ouvinte(indice, evento);
  }

  private setFase(fase: Fase): void {
    this.fase = fase;
    this.emitir({ tipo: 'fase', fase });
  }

  private async correr(): Promise<void> {
    const fluxo = this.fluxo;
    if (!fluxo) return;
    try {
      for await (const evento of fluxo.eventos) {
        for (const sinal of mapSessionEvent(evento)) {
          await this.tratar(sinal);
          if (this.motivoFim !== null) break;
        }
        if (this.motivoFim !== null) break;
      }
    } catch (erro) {
      this.emitir({
        tipo: 'erro',
        mensagem: `Falha no fluxo do agente: ${descrever(erro)}`,
      });
      this.setFase('erro');
    } finally {
      fluxo.fechar();
    }
  }

  private async tratar(sinal: Sinal): Promise<void> {
    switch (sinal.tipo) {
      case 'ui':
        this.emitir(sinal.evento);
        return;
      case 'pedido_ferramenta':
        await this.pedido(sinal.toolUseId, sinal.nome, sinal.entrada);
        return;
      case 'ocioso':
        await this.ocioso(sinal.motivo);
        return;
      case 'rodando':
        return;
      case 'terminou':
        this.encerrar('a sessão foi encerrada antes do fim');
        return;
      default: {
        // A new signal type fails to compile here until it is handled.
        const semCaso: never = sinal;
        throw new Error(`sinal sem tratamento: ${JSON.stringify(semCaso)}`);
      }
    }
  }

  private async pedido(
    toolUseId: string,
    nome: string,
    bruto: unknown,
  ): Promise<void> {
    if (nome !== 'abrir_mr') {
      await this.responder(
        toolUseId,
        `Ferramenta desconhecida: ${nome}.`,
        true,
      );
      return;
    }
    const entrada = parseAbrirMrEntrada(bruto);
    if (!entrada.ok) {
      await this.responder(
        toolUseId,
        `Entrada inválida: ${entrada.erro}. Corrija e chame a ferramenta de novo.`,
        true,
      );
      return;
    }
    if (this.ultimoVermelho && this.tentativas >= LIMITE_TENTATIVAS) {
      await this.responder(
        toolUseId,
        'Limite de tentativas atingido. Não abra outro MR: escreva o diagnóstico e passe o caso para uma pessoa.',
        false,
      );
      return;
    }
    let arquivos: ArquivoProposto[];
    try {
      arquivos = await Promise.all(
        entrada.valor.arquivos.map(async a => ({
          ...a,
          existente: await this.dep.gitlab.getFile(a.caminho, this.ref),
        })),
      );
    } catch (erro) {
      await this.responder(
        toolUseId,
        `Não consegui ler os arquivos no main: ${descrever(erro)}.`,
        true,
      );
      return;
    }
    const diffs: ArquivoDiff[] = arquivos.map(a => ({
      caminho: a.caminho,
      novo: a.existente === null,
      diff: diffArquivo(a.caminho, a.existente ?? '', a.conteudo),
    }));
    const anuncio: UiEvent = {
      tipo: 'diagnostico',
      ferramentaId: toolUseId,
      titulo: entrada.valor.titulo,
      causa: entrada.valor.causa,
      tentativa: this.tentativas + 1,
      arquivos: diffs,
    };
    this.pendente = { toolUseId, entrada: entrada.valor, arquivos, anuncio };
    this.emitir(anuncio);
    this.setFase('aguardando_aprovacao');
  }

  private async ocioso(
    motivo: 'end_turn' | 'requires_action' | 'outro',
  ): Promise<void> {
    await this.atualizarUso();
    if (motivo !== 'end_turn') return;
    this.encerrar('o agente terminou');
  }

  private async atualizarUso(): Promise<void> {
    try {
      const sessao = await this.dep.runtime.obterSessao(this.id);
      const uso = parseUsage(sessao.usage);
      const segundos = (Date.now() - this.iniciadoEm) / 1000;
      this.custo = custoUsd(uso, segundos);
      this.emitir({
        tipo: 'uso',
        tokensEntrada: uso.tokensEntrada,
        tokensSaida: uso.tokensSaida,
        tokensCacheLeitura: uso.tokensCacheLeitura,
        tokensCacheEscrita: uso.tokensCacheEscrita,
        segundosAtivos: Math.round(uso.segundosAtivos ?? segundos),
        custoUsd: this.custo,
      });
    } catch (erro) {
      this.emitir({
        tipo: 'erro',
        mensagem: `Não consegui ler o uso da sessão: ${descrever(erro)}`,
      });
    }
  }

  private encerrar(motivo: string): void {
    if (this.motivoFim !== null) return;
    this.motivoFim = motivo;
    this.emitir({ tipo: 'encerrado', motivo });
    this.setFase('encerrado');
  }

  // The one exit toward the agent for tool results and error messages, which can
  // carry GitLab text (log_final, a network error naming the host).
  private paraAgente(texto: string): string {
    return ocultarHost(texto, this.dep.host);
  }

  private async responder(
    toolUseId: string,
    texto: string,
    erro: boolean,
  ): Promise<void> {
    await this.dep.runtime.enviar(this.id, [
      {
        type: 'user.custom_tool_result',
        custom_tool_use_id: toolUseId,
        content: [{ type: 'text', text: this.paraAgente(texto) }],
        is_error: erro,
      },
    ]);
  }

  private exigirPendente(toolUseId: string): Pendente {
    const p = this.pendente;
    if (!p || p.toolUseId !== toolUseId)
      throw new ErroEstado('Esta proposta já foi respondida.');
    return p;
  }

  // Returns as soon as the phase is set: creating the MR and waiting for its
  // pipeline run in the background, and progress arrives over SSE.
  async aprovar(toolUseId: string): Promise<void> {
    const p = this.exigirPendente(toolUseId);
    this.pendente = null;
    this.tentativas += 1;
    const tentativa = this.tentativas;
    this.setFase('abrindo_mr');
    void this.executarAprovacao(toolUseId, p, tentativa);
  }

  private async executarAprovacao(
    toolUseId: string,
    p: Pendente,
    tentativa: number,
  ): Promise<void> {
    try {
      const { resultado, sucesso } = await executarAbrirMr({
        gitlab: this.dep.gitlab,
        pipelineId: this.pipelineId,
        ref: this.ref,
        tentativa,
        entrada: p.entrada,
        arquivos: p.arquivos,
        intervaloMs: this.dep.intervaloPollMs,
        prazoMs: this.dep.prazoPollMs,
        dormir: this.dep.dormir,
        aoAbrirMr: mr => {
          this.emitir({
            tipo: 'mr_aberto',
            iid: mr.iid,
            titulo: mr.titulo,
            url: mr.url,
          });
          this.setFase('pipeline');
        },
        aoMudarPipeline: pl => {
          this.emitir({
            tipo: 'pipeline_mr',
            pipelineId: pl.id,
            status: pl.status,
            url: pl.url,
            jobs: pl.jobs,
            jobFalho: pl.jobFalho,
          });
          if (pl.status === 'success' && this.verdeEm === null) {
            this.verdeEm = Date.now();
            this.emitir({
              tipo: 'verde',
              segundos: Math.round((this.verdeEm - this.iniciadoEm) / 1000),
            });
          }
        },
      });
      this.ultimoVermelho = !sucesso;
      this.setFase(sucesso ? 'verde' : 'vermelho');
      await this.responder(toolUseId, JSON.stringify(resultado), false);
    } catch (erro) {
      this.emitir({
        tipo: 'erro',
        mensagem: `Não consegui abrir o MR: ${descrever(erro)}`,
      });
      this.setFase('investigando');
      await this.responder(
        toolUseId,
        `Falha ao abrir o MR: ${descrever(erro)}.`,
        true,
      );
    }
  }

  async recusar(toolUseId: string, motivo: string): Promise<void> {
    await this.responderDecisao(
      toolUseId,
      { tipo: 'recusa', motivo },
      `A pessoa recusou a proposta. Motivo: ${motivo}. Não abra MR com a mesma proposta.`,
    );
  }

  // The session waits in requires_action for the abrir_mr result and rejects a user
  // message until that call is answered, so the guidance goes in the tool result.
  async orientar(toolUseId: string, texto: string): Promise<void> {
    await this.responderDecisao(
      toolUseId,
      { tipo: 'orientacao', texto },
      `A pessoa orientou o agente antes de aprovar: ${texto}. Siga a orientação, diga em um passo o que mudou por causa dela e chame abrir_mr de novo com a proposta revista.`,
    );
  }

  // Answers the pending proposal without opening the MR. The decision is announced
  // before the send, so it reaches the card ahead of the agent's next steps. If the
  // send fails, the proposal is pending and announced again, so the person can retry.
  private async responderDecisao(
    toolUseId: string,
    decisao: UiEvent,
    texto: string,
  ): Promise<void> {
    const p = this.exigirPendente(toolUseId);
    this.pendente = null;
    this.emitir(decisao);
    this.setFase('investigando');
    try {
      await this.responder(toolUseId, texto, true);
    } catch (erro) {
      this.pendente = p;
      this.emitir(p.anuncio);
      this.setFase('aguardando_aprovacao');
      throw erro;
    }
  }
}
