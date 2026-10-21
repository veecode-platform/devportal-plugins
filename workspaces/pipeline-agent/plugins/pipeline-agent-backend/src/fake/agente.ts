import type { BetaManagedAgentsAgentCustomToolUseEvent } from '@anthropic-ai/sdk/resources/beta/sessions/events';
import { Canal } from '../agente/canal';
import type {
  AgentRuntime,
  ArquivoSessao,
  EventoUsuario,
  FluxoEventos,
  SdkEvent,
  SessaoResumo,
} from '../agente/types';
import {
  CAMINHO_ALVO,
  CAMINHO_TESTE,
  DIFF_COMMIT,
  JAVA_DEPOIS,
  LISTAGEM_UPLOADS,
  SAIDA_MVN,
  TRACE_TEST,
  TRECHO_TESTE,
} from './cenario';

// Scripted agent for the bug-1 story of pedidos-api (commit 6b2d2c79). It answers
// refusal, guidance and approval through the same input channel the real mode uses.

type Uso = {
  input: number;
  output: number;
  cacheLeitura: number;
  cacheEscrita: number;
};

type Sessao = {
  id: string;
  criadaEm: string;
  title: string | null;
  metadata: Record<string, string>;
  inicioMs: number;
  segundosFixos: number | null;
  status: 'idle' | 'running' | 'terminated';
  entrada: Canal<EventoUsuario>;
  saida: Canal<SdkEvent>;
  uso: Uso;
};

const PAUSA_CURTA_MS = 700;
const PAUSA_FERRAMENTA_MS = 900;

function textoDoEvento(content: { type: 'text'; text: string }[]): string {
  return content.map(b => b.text).join('\n');
}

function sessaoPassada(
  id: string,
  criadaEm: string,
  metadata: Record<string, string>,
  title: string,
  segundos: number,
): Sessao {
  const entrada = new Canal<EventoUsuario>();
  const saida = new Canal<SdkEvent>();
  entrada.fechar();
  saida.fechar();
  return {
    id,
    criadaEm,
    title,
    metadata,
    inicioMs: Date.parse(criadaEm),
    segundosFixos: segundos,
    status: 'idle',
    entrada,
    saida,
    uso: {
      input: 52_000,
      output: 4_100,
      cacheLeitura: 260_000,
      cacheEscrita: 6_000,
    },
  };
}

export class AgenteFake implements AgentRuntime {
  private readonly sessoes = new Map<string, Sessao>();
  private readonly projetosSemeados = new Set<string>();
  private contador = 0;
  private eventos = 0;
  private readonly esperar: (ms: number) => Promise<void>;

  constructor(opcoes: { esperar: (ms: number) => Promise<void> }) {
    this.esperar = opcoes.esperar;
  }

  // Two finished investigations per project, so the history list is not empty
  // on first use. Seeded once per project, on the first listing.
  private semear(projeto: string): void {
    if (this.projetosSemeados.has(projeto)) return;
    this.projetosSemeados.add(projeto);
    const anteontem = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    const base = { app: 'pipeline-agent', projeto };
    const n = this.projetosSemeados.size;
    const passadas = [
      sessaoPassada(
        `sesn_fake_hist_${n}a`,
        anteontem,
        { ...base, pipeline_id: '8842' },
        'Pipeline 8842 · job build · MR !2 aberto',
        412,
      ),
      sessaoPassada(
        `sesn_fake_hist_${n}b`,
        ontem,
        { ...base, pipeline_id: '8810' },
        'Pipeline 8810 · job test · recusado',
        287,
      ),
    ];
    for (const s of passadas) this.sessoes.set(s.id, s);
  }

  private nomeEvento(prefixo: string): string {
    this.eventos += 1;
    return `${prefixo}_fake_${String(this.eventos).padStart(4, '0')}`;
  }

  // The session status follows the status events, as in the real API.
  private emitir(sessao: Sessao, evento: SdkEvent): void {
    if (evento.type === 'session.status_running') sessao.status = 'running';
    if (evento.type === 'session.status_idle') sessao.status = 'idle';
    sessao.saida.enviar(evento);
  }

  private mensagem(sessao: Sessao, texto: string): void {
    sessao.uso.output += 240;
    sessao.uso.input += 900;
    this.emitir(sessao, {
      id: this.nomeEvento('evt'),
      type: 'agent.message',
      content: [{ type: 'text', text: texto }],
      processed_at: new Date().toISOString(),
    });
  }

  private ocioso(
    sessao: Sessao,
    stop:
      | { type: 'end_turn' }
      | { type: 'requires_action'; event_ids: string[] },
  ): void {
    this.emitir(sessao, {
      id: this.nomeEvento('evt'),
      type: 'session.status_idle',
      stop_reason: stop,
      processed_at: new Date().toISOString(),
    });
  }

  private async ferramentaBash(
    sessao: Sessao,
    comando: string,
    saida: string,
  ): Promise<void> {
    const idUso = this.nomeEvento('toolu_bash');
    sessao.uso.input += 2_400;
    sessao.uso.cacheLeitura += 18_000;
    this.emitir(sessao, {
      id: idUso,
      type: 'agent.tool_use',
      name: 'bash',
      input: { command: comando },
      processed_at: new Date().toISOString(),
    });
    await this.esperar(PAUSA_FERRAMENTA_MS);
    this.emitir(sessao, {
      id: this.nomeEvento('evt'),
      type: 'agent.tool_result',
      tool_use_id: idUso,
      content: [{ type: 'text', text: saida }],
      is_error: false,
      processed_at: new Date().toISOString(),
    });
  }

  private pedirAbrirMr(sessao: Sessao, causa: string): string {
    const id = this.nomeEvento('toolu_mr');
    const evento: BetaManagedAgentsAgentCustomToolUseEvent = {
      id,
      type: 'agent.custom_tool_use',
      name: 'abrir_mr',
      input: {
        titulo: 'fix: cupom e faixa somam sobre o valor bruto',
        causa,
        arquivos: [{ caminho: CAMINHO_ALVO, conteudo: JAVA_DEPOIS }],
      },
      processed_at: new Date().toISOString(),
    };
    this.emitir(sessao, evento);
    this.ocioso(sessao, { type: 'requires_action', event_ids: [id] });
    return id;
  }

  private async roteiro(sessao: Sessao): Promise<void> {
    const inicial = await sessao.entrada.pegar();
    if (!inicial || inicial.type !== 'user.message') return;
    this.emitir(sessao, {
      id: this.nomeEvento('evt'),
      type: 'session.status_running',
      processed_at: new Date().toISOString(),
    });
    await this.esperar(PAUSA_CURTA_MS);
    this.mensagem(sessao, 'Vou ver os arquivos que a sessão recebeu.');
    await this.ferramentaBash(
      sessao,
      'ls -R /mnt/session/uploads',
      LISTAGEM_UPLOADS,
    );
    await this.esperar(PAUSA_CURTA_MS);
    this.mensagem(
      sessao,
      'Vou começar pelo log do job test, que falhou no pipeline 9001 da main.',
    );
    await this.ferramentaBash(
      sessao,
      'cat /mnt/session/uploads/pipeline/trace.log',
      TRACE_TEST,
    );
    await this.esperar(PAUSA_CURTA_MS);
    this.mensagem(
      sessao,
      'O teste esperava 900,00 e recebeu 902,50 em DescontoService.calcularTotal. Vou ver o commit suspeito.',
    );
    await this.ferramentaBash(
      sessao,
      'cat /mnt/session/uploads/pipeline/commit.diff',
      DIFF_COMMIT,
    );
    await this.esperar(PAUSA_CURTA_MS);
    this.mensagem(
      sessao,
      'O commit calcula o cupom primeiro: comCupom vira 950,00, e a faixa de 5% sai sobre esse valor. O teste espera os dois descontos somados sobre o bruto, 1000,00.',
    );
    await this.esperar(PAUSA_CURTA_MS);
    this.mensagem(
      sessao,
      'Vou extrair o código em /tmp/repo para reproduzir a falha.',
    );
    await this.ferramentaBash(
      sessao,
      'mkdir -p /tmp/repo && tar -xzf /mnt/session/uploads/pipeline/repo.tar.gz -C /tmp/repo --strip-components=1 && cd /tmp/repo && git init -q && git add -A && git -c user.name=agente -c user.email=agente@sandbox commit -qm base',
      '',
    );
    await this.ferramentaBash(
      sessao,
      'cd /tmp/repo && mvn -B test -Dtest=DescontoServiceTest',
      SAIDA_MVN,
    );
    await this.esperar(PAUSA_CURTA_MS);
    this.mensagem(
      sessao,
      'Reproduzi a falha no sandbox com o mesmo valor. A correção é somar os dois descontos sobre o bruto.',
    );
    await this.esperar(PAUSA_CURTA_MS);
    let pendente = this.pedirAbrirMr(
      sessao,
      'Causa: DescontoService.calcularTotal calcula a faixa sobre o valor já descontado pelo cupom (comCupom). Evidência: expected 900,00 mas foi 902,50 no teste faixaECupomSomamSobreOValorBruto. A mudança soma o percentual de faixa e o de cupom e aplica sobre o valor bruto.',
    );
    for (;;) {
      const evento = await sessao.entrada.pegar();
      if (!evento) return;
      if (
        evento.type === 'user.custom_tool_result' &&
        evento.custom_tool_use_id === pendente
      ) {
        if (evento.is_error) {
          this.mensagem(
            sessao,
            `Entendi. Não abro o MR. Motivo registrado: ${textoDoEvento(
              evento.content,
            )}`,
          );
        } else {
          const resultado = JSON.parse(textoDoEvento(evento.content)) as {
            pipeline_status?: string;
          };
          await this.esperar(PAUSA_CURTA_MS);
          this.mensagem(
            sessao,
            resultado.pipeline_status === 'success'
              ? 'MR aberto e o pipeline do MR passou. Encerro aqui com o diagnóstico.'
              : 'O pipeline do MR falhou. Leio o log final antes de propor outra correção.',
          );
        }
        this.ocioso(sessao, { type: 'end_turn' });
        return;
      }
      if (evento.type === 'user.interrupt') {
        this.ocioso(sessao, { type: 'end_turn' });
        const orientacao = await sessao.entrada.pegar();
        if (!orientacao || orientacao.type !== 'user.message') return;
        this.emitir(sessao, {
          id: this.nomeEvento('evt'),
          type: 'session.status_running',
          processed_at: new Date().toISOString(),
        });
        this.mensagem(
          sessao,
          'Certo. Vou olhar o teste antes de propor de novo, com a sua orientação em mente.',
        );
        await this.ferramentaBash(
          sessao,
          `sed -n '36,46p' ${CAMINHO_TESTE}`,
          TRECHO_TESTE,
        );
        pendente = this.pedirAbrirMr(
          sessao,
          `Causa: a faixa é aplicada sobre o valor já descontado. Orientação recebida: ${textoDoEvento(
            orientacao.content,
          )}. A mudança fica só em DescontoService.`,
        );
      }
    }
  }

  // The files are accepted and ignored: the scripted agent reads no mount.
  async createSession(entrada: {
    agentId: string;
    environmentId: string;
    metadata: Record<string, string>;
    title: string;
    arquivos: ArquivoSessao[];
  }): Promise<string> {
    this.contador += 1;
    const id = `sesn_fake_${String(this.contador).padStart(3, '0')}`;
    const sessao: Sessao = {
      id,
      criadaEm: new Date().toISOString(),
      title: entrada.title,
      metadata: { ...entrada.metadata },
      inicioMs: Date.now(),
      segundosFixos: null,
      status: 'idle',
      entrada: new Canal<EventoUsuario>(),
      saida: new Canal<SdkEvent>(),
      uso: { input: 0, output: 0, cacheLeitura: 0, cacheEscrita: 0 },
    };
    this.sessoes.set(id, sessao);
    void this.roteiro(sessao);
    return id;
  }

  private porId(id: string): Sessao {
    const sessao = this.sessoes.get(id);
    if (!sessao) throw new Error(`sessão fake ${id} não existe`);
    return sessao;
  }

  async abrirFluxo(sessionId: string): Promise<FluxoEventos> {
    const sessao = this.porId(sessionId);
    return {
      eventos: sessao.saida,
      fechar: () => sessao.saida.fechar(),
    };
  }

  async enviar(sessionId: string, eventos: EventoUsuario[]): Promise<void> {
    const sessao = this.porId(sessionId);
    for (const evento of eventos) sessao.entrada.enviar(evento);
  }

  async obterSessao(sessionId: string): Promise<SessaoResumo> {
    const sessao = this.porId(sessionId);
    const segundos =
      sessao.segundosFixos ?? Math.round((Date.now() - sessao.inicioMs) / 1000);
    return {
      id: sessao.id,
      status: sessao.status,
      title: sessao.title,
      criadaEm: sessao.criadaEm,
      metadata: sessao.metadata,
      usage: {
        input_tokens: sessao.uso.input,
        output_tokens: sessao.uso.output,
        cache_read_input_tokens: sessao.uso.cacheLeitura,
        cache_creation: {
          ephemeral_5m_input_tokens: sessao.uso.cacheEscrita,
          ephemeral_1h_input_tokens: 0,
        },
        active_seconds: segundos,
      },
    };
  }

  async listarSessoes(
    _agentId: string,
    projeto: string,
  ): Promise<SessaoResumo[]> {
    this.semear(projeto);
    const itens: SessaoResumo[] = [];
    for (const sessao of this.sessoes.values()) {
      if (sessao.metadata.projeto !== projeto) continue;
      itens.push(await this.obterSessao(sessao.id));
    }
    return itens.reverse();
  }
}
