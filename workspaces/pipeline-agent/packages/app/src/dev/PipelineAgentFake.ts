import {
  PipelineAgentError,
  type Banner,
  type DetalheHistorico,
  type Fase,
  type IniciarResposta,
  type ItemHistorico,
  type PipelineAgentApi,
  type PropostaHistorico,
  type UiEvent,
} from '@veecode-platform/backstage-plugin-pipeline-agent';
import {
  CAMINHO_ALVO,
  CAMINHO_TESTE,
  CAUSA_DIAGNOSTICO,
  DIFF_COMMIT,
  DIFF_PROPOSTA,
  HISTORICO_INICIAL,
  JOB_TESTE_ID,
  MR_IID,
  MR_TITULO,
  MR_URL,
  PIPELINE_FALHO_ID,
  PIPELINE_MR_ID,
  PIPELINE_MR_URL,
  SAIDA_MVN,
  SHA_FALHO,
  TITULO_COMMIT,
  TRACE_TESTE,
  TRECHO_TESTE,
} from './pipelineAgentFixtures';

// Dev-only stand-in for the backend. It plays the same story on every run, and
// its decisions behave like the backend's: a stale toolUseId gets a 409.

type Decisao =
  | { tipo: 'aprovar' }
  | { tipo: 'recusar'; motivo: string }
  | { tipo: 'orientar'; texto: string };

type Sessao = {
  id: string;
  iniciadoEm: number;
  eventos: UiEvent[];
  encerrada: boolean;
  ouvintes: Set<(evento: UiEvent) => void>;
  pendente: {
    ferramentaId: string;
    decidir: (decisao: Decisao) => void;
  } | null;
};

export type OpcoesPipelineAgentFake = { passoMs?: number };

const pausa = (ms: number) =>
  new Promise<void>(resolver => setTimeout(resolver, ms));

const CUSTO_USD = 0.04;

// The proposals of the two seeded history items. A run of this fake answers from the
// events it kept instead (see propostaDoRoteiro).
const PROPOSTAS_HISTORICO: Record<string, PropostaHistorico | undefined> = {
  'historico-2': {
    tentativa: 1,
    titulo: MR_TITULO,
    causa: CAUSA_DIAGNOSTICO,
    arquivos: [CAMINHO_ALVO],
    mr: {
      iid: 2,
      url: 'https://gitlab.com/veecode-demos/pedidos-api/-/merge_requests/2',
      statusPipeline: 'success',
    },
  },
  'historico-1': {
    tentativa: 1,
    titulo: MR_TITULO,
    causa: CAUSA_DIAGNOSTICO,
    arquivos: [CAMINHO_ALVO],
    mr: null,
  },
};

// The last diagnosis of a run, and the merge request and pipeline that followed it.
function propostaDoRoteiro(eventos: UiEvent[]): PropostaHistorico | null {
  let diagnostico: Extract<UiEvent, { tipo: 'diagnostico' }> | null = null;
  let mr: { iid: number; url: string } | null = null;
  let statusPipeline: string | null = null;
  for (const evento of eventos) {
    if (evento.tipo === 'diagnostico') {
      diagnostico = evento;
      mr = null;
      statusPipeline = null;
    }
    if (evento.tipo === 'mr_aberto') mr = { iid: evento.iid, url: evento.url };
    if (evento.tipo === 'pipeline_mr') statusPipeline = evento.status;
  }
  if (diagnostico === null) return null;
  return {
    tentativa: diagnostico.tentativa,
    titulo: diagnostico.titulo,
    causa: diagnostico.causa,
    arquivos: diagnostico.arquivos.map(arquivo => arquivo.caminho),
    mr:
      mr === null || statusPipeline === null
        ? null
        : { iid: mr.iid, url: mr.url, statusPipeline },
  };
}

export class PipelineAgentFake implements PipelineAgentApi {
  private readonly passoMs: number;
  private readonly sessoes = new Map<string, Sessao>();
  private readonly itensHistorico: ItemHistorico[] = [];
  private contador = 0;

  constructor(opcoes: OpcoesPipelineAgentFake = {}) {
    this.passoMs = opcoes.passoMs ?? 200;
    const agora = Date.now();
    for (const item of HISTORICO_INICIAL) {
      this.itensHistorico.push({
        id: `historico-${item.diasAtras}`,
        titulo: item.titulo,
        criadoEm: new Date(agora - item.diasAtras * 86_400_000).toISOString(),
        status: 'idle',
        custoUsd: item.custoUsd,
      });
    }
  }

  async banner(_entityRef: string): Promise<Banner> {
    return {
      projeto: 'veecode-demos/pedidos-api',
      pipeline: {
        id: PIPELINE_FALHO_ID,
        ref: 'main',
        criadoEm: new Date(Date.now() - 14 * 60_000).toISOString(),
        haMinutos: 14,
        job: { id: JOB_TESTE_ID, nome: 'test' },
        commit: { sha: SHA_FALHO, titulo: TITULO_COMMIT },
      },
    };
  }

  async historico(_entityRef: string): Promise<ItemHistorico[]> {
    return [...this.itensHistorico];
  }

  async detalheHistorico(
    _entityRef: string,
    id: string,
  ): Promise<DetalheHistorico> {
    const sessao = this.sessoes.get(id);
    const proposta = sessao
      ? propostaDoRoteiro(sessao.eventos)
      : PROPOSTAS_HISTORICO[id] ?? null;
    return { id, proposta };
  }

  async iniciar(_entityRef: string): Promise<IniciarResposta> {
    this.contador += 1;
    const sessao: Sessao = {
      id: `fake-${this.contador}`,
      iniciadoEm: Date.now(),
      eventos: [],
      encerrada: false,
      ouvintes: new Set(),
      pendente: null,
    };
    this.sessoes.set(sessao.id, sessao);
    void this.roteiro(sessao).catch(erro =>
      this.emitir(
        sessao,
        {
          tipo: 'erro',
          mensagem: erro instanceof Error ? erro.message : 'falha no roteiro',
        },
        false,
      ),
    );
    return {
      id: sessao.id,
      iniciadoEm: new Date(sessao.iniciadoEm).toISOString(),
    };
  }

  async acompanhar(
    id: string,
    aoEvento: (evento: UiEvent) => void,
    sinal: AbortSignal,
  ): Promise<void> {
    const sessao = this.porId(id);
    await new Promise<void>(resolver => {
      if (sinal.aborted) {
        resolver();
        return;
      }
      const ouvinte = (evento: UiEvent) => {
        aoEvento(evento);
        if (evento.tipo === 'encerrado') {
          sessao.ouvintes.delete(ouvinte);
          resolver();
        }
      };
      for (const evento of [...sessao.eventos]) ouvinte(evento);
      if (sessao.encerrada) return;
      sessao.ouvintes.add(ouvinte);
      sinal.addEventListener(
        'abort',
        () => {
          sessao.ouvintes.delete(ouvinte);
          resolver();
        },
        { once: true },
      );
    });
  }

  async aprovar(id: string, toolUseId: string): Promise<Fase> {
    this.decidir(id, toolUseId, { tipo: 'aprovar' });
    return 'abrindo_mr';
  }

  async recusar(id: string, toolUseId: string, motivo: string): Promise<Fase> {
    this.decidir(id, toolUseId, { tipo: 'recusar', motivo });
    return 'encerrado';
  }

  async orientar(id: string, toolUseId: string, texto: string): Promise<Fase> {
    this.decidir(id, toolUseId, { tipo: 'orientar', texto });
    return 'investigando';
  }

  private porId(id: string): Sessao {
    const sessao = this.sessoes.get(id);
    if (!sessao) {
      throw new PipelineAgentError(404, 'Esta investigação não existe mais.');
    }
    return sessao;
  }

  private decidir(id: string, toolUseId: string, decisao: Decisao) {
    const sessao = this.porId(id);
    const pendente = sessao.pendente;
    if (!pendente || pendente.ferramentaId !== toolUseId) {
      throw new PipelineAgentError(
        409,
        'A investigação não está em um estado que aceita esta ação.',
      );
    }
    sessao.pendente = null;
    pendente.decidir(decisao);
  }

  private aguardarDecisao(sessao: Sessao, ferramentaId: string) {
    return new Promise<Decisao>(resolver => {
      sessao.pendente = { ferramentaId, decidir: resolver };
    });
  }

  private emitir(sessao: Sessao, evento: UiEvent, pausar = true) {
    sessao.eventos.push(evento);
    if (evento.tipo === 'encerrado') sessao.encerrada = true;
    for (const ouvinte of [...sessao.ouvintes]) ouvinte(evento);
    return pausar ? pausa(this.passoMs) : Promise.resolve();
  }

  private async passo(sessao: Sessao, id: string, texto: string) {
    await this.emitir(sessao, { tipo: 'passo', id, texto });
  }

  private async comando(
    sessao: Sessao,
    id: string,
    resumo: string,
    comando: string,
    saida: string,
  ) {
    await this.emitir(sessao, { tipo: 'comando', id, resumo, comando });
    await this.emitir(sessao, { tipo: 'comando_saida', id, saida });
  }

  private async roteiro(sessao: Sessao): Promise<void> {
    await this.emitir(sessao, { tipo: 'fase', fase: 'investigando' }, false);
    await this.passo(
      sessao,
      'p1',
      'Vou começar pelo log do job test, que falhou no pipeline 9001 da main.',
    );
    await this.comando(
      sessao,
      'c1',
      'Consultou a API do GitLab',
      `curl -s "$GITLAB_API/projects/$PROJETO/jobs/${JOB_TESTE_ID}/trace" | tail -n 40`,
      TRACE_TESTE,
    );
    await this.passo(
      sessao,
      'p2',
      'O teste esperava 900,00 e recebeu 902,50 em DescontoService.calcularTotal. Vou ver o commit suspeito.',
    );
    await this.comando(
      sessao,
      'c2',
      'Consultou o histórico do Git',
      `git show ${SHA_FALHO.slice(0, 8)} -- ${CAMINHO_ALVO}`,
      DIFF_COMMIT,
    );
    await this.passo(
      sessao,
      'p3',
      'O commit calcula o cupom primeiro: comCupom vira 950,00, e a faixa de 5% sai sobre esse valor. O teste espera os dois descontos somados sobre o bruto, 1000,00.',
    );
    await this.comando(
      sessao,
      'c3',
      'Rodou o teste Maven no sandbox',
      'mvn -B test -Dtest=DescontoServiceTest',
      SAIDA_MVN,
    );
    await this.passo(
      sessao,
      'p4',
      'Reproduzi a falha no sandbox com o mesmo valor. A correção é somar os dois descontos sobre o bruto.',
    );

    for (let tentativa = 1; ; tentativa += 1) {
      const ferramentaId = `toolu_${sessao.id}_${tentativa}`;
      await this.emitir(sessao, {
        tipo: 'diagnostico',
        ferramentaId,
        titulo: MR_TITULO,
        causa: CAUSA_DIAGNOSTICO,
        tentativa,
        arquivos: [{ caminho: CAMINHO_ALVO, novo: false, diff: DIFF_PROPOSTA }],
      });
      const decisao = this.aguardarDecisao(sessao, ferramentaId);
      await this.emitir(
        sessao,
        { tipo: 'fase', fase: 'aguardando_aprovacao' },
        false,
      );
      const escolha = await decisao;

      if (escolha.tipo === 'recusar') {
        await this.emitir(sessao, { tipo: 'recusa', motivo: escolha.motivo });
        await this.passo(
          sessao,
          `p-recusa-${tentativa}`,
          `Entendi. Não abro o MR. Motivo registrado: ${escolha.motivo}`,
        );
        return this.encerrar(sessao, 'recusado');
      }

      if (escolha.tipo === 'orientar') {
        await this.emitir(sessao, { tipo: 'orientacao', texto: escolha.texto });
        await this.passo(
          sessao,
          `p-orientacao-${tentativa}`,
          'Certo. Vou olhar o teste antes de propor de novo, com a sua orientação em mente.',
        );
        await this.comando(
          sessao,
          `c-orientacao-${tentativa}`,
          'Releu o teste',
          `sed -n '36,46p' ${CAMINHO_TESTE}`,
          TRECHO_TESTE,
        );
        continue;
      }

      await this.emitir(sessao, { tipo: 'fase', fase: 'abrindo_mr' });
      await this.emitir(sessao, {
        tipo: 'mr_aberto',
        iid: MR_IID,
        titulo: MR_TITULO,
        url: MR_URL,
      });
      await this.emitir(sessao, { tipo: 'fase', fase: 'pipeline' });
      await this.emitir(sessao, {
        tipo: 'pipeline_mr',
        pipelineId: PIPELINE_MR_ID,
        status: 'running',
        url: null,
        jobs: [],
        jobFalho: null,
      });
      await this.emitir(sessao, {
        tipo: 'pipeline_mr',
        pipelineId: PIPELINE_MR_ID,
        status: 'success',
        url: PIPELINE_MR_URL,
        jobs: ['build', 'test'],
        jobFalho: null,
      });
      await this.passo(
        sessao,
        'p-fim',
        'MR aberto e o pipeline do MR passou. Encerro aqui com o diagnóstico.',
      );
      await this.emitir(sessao, {
        tipo: 'verde',
        segundos: Math.max(
          1,
          Math.round((Date.now() - sessao.iniciadoEm) / 1000),
        ),
      });
      return this.encerrar(sessao, 'aprovado');
    }
  }

  private async encerrar(sessao: Sessao, resultado: 'aprovado' | 'recusado') {
    const segundos = Math.max(
      1,
      Math.round((Date.now() - sessao.iniciadoEm) / 1000),
    );
    await this.emitir(
      sessao,
      {
        tipo: 'uso',
        tokensEntrada: 52_000,
        tokensSaida: 4_100,
        tokensCacheLeitura: 260_000,
        tokensCacheEscrita: 6_000,
        segundosAtivos: segundos,
        custoUsd: CUSTO_USD,
      },
      false,
    );
    await this.emitir(
      sessao,
      { tipo: 'encerrado', motivo: 'agente encerrou o turno' },
      false,
    );
    this.itensHistorico.unshift({
      id: sessao.id,
      titulo:
        resultado === 'aprovado'
          ? `Pipeline ${PIPELINE_FALHO_ID} · job test · MR !${MR_IID} aberto`
          : `Pipeline ${PIPELINE_FALHO_ID} · job test · recusado`,
      criadoEm: new Date(sessao.iniciadoEm).toISOString(),
      status: 'idle',
      custoUsd: CUSTO_USD,
    });
  }
}
