import type Anthropic from '@anthropic-ai/sdk';
import { toFile } from '@anthropic-ai/sdk';
import type {
  AgentRuntime,
  ArquivoSessao,
  EventoUsuario,
  FluxoEventos,
  SdkEvent,
  SessaoResumo,
} from './types';

// Managed Agents client (SDK, beta sessions). The API key is passed in from the
// plugin configuration and is never printed or returned in an answer.

const LIMITE_LISTAGEM = 100;
const BETA_MANAGED_AGENTS = 'managed-agents-2026-04-01';

type SessaoSdk = {
  id: string;
  status: string;
  title: string | null;
  created_at: string;
  metadata: Record<string, string>;
  usage: unknown;
};

function paraResumo(s: SessaoSdk): SessaoResumo {
  return {
    id: s.id,
    status: s.status,
    title: s.title,
    criadaEm: s.created_at,
    metadata: s.metadata,
    usage: s.usage,
  };
}

export class AnthropicRuntime implements AgentRuntime {
  private readonly cliente: Anthropic;

  constructor(cliente: Anthropic) {
    this.cliente = cliente;
  }

  // Files are uploaded before the session exists, so a failed upload leaves no session.
  async createSession(entrada: {
    agentId: string;
    environmentId: string;
    metadata: Record<string, string>;
    title: string;
    arquivos: ArquivoSessao[];
  }): Promise<string> {
    const recursos: Array<{
      type: 'file';
      file_id: string;
      mount_path: string;
    }> = [];
    for (const arquivo of entrada.arquivos) {
      const enviado = await this.cliente.beta.files.upload({
        file: await toFile(arquivo.conteudo, arquivo.nome, {
          type: arquivo.tipo,
        }),
        betas: [BETA_MANAGED_AGENTS],
      });
      recursos.push({
        type: 'file',
        file_id: enviado.id,
        mount_path: arquivo.caminho,
      });
    }
    const sessao = await this.cliente.beta.sessions.create({
      agent: entrada.agentId,
      environment_id: entrada.environmentId,
      metadata: entrada.metadata,
      title: entrada.title,
      resources: recursos,
    });
    return sessao.id;
  }

  // Opens the stream before any send: the docs say a stream only receives events
  // emitted after it was opened.
  async abrirFluxo(sessionId: string): Promise<FluxoEventos> {
    const fluxo = await this.cliente.beta.sessions.events.stream(sessionId);
    return {
      eventos: fluxo as AsyncIterable<SdkEvent>,
      fechar: () => fluxo.controller?.abort(),
    };
  }

  async enviar(sessionId: string, eventos: EventoUsuario[]): Promise<void> {
    await this.cliente.beta.sessions.events.send(sessionId, {
      events: eventos,
    });
  }

  async obterSessao(sessionId: string): Promise<SessaoResumo> {
    return paraResumo(await this.cliente.beta.sessions.retrieve(sessionId));
  }

  async listarSessoes(
    agentId: string,
    projeto: string,
  ): Promise<SessaoResumo[]> {
    const itens: SessaoResumo[] = [];
    for await (const s of this.cliente.beta.sessions.list({
      agent_id: agentId,
      order: 'desc',
      limit: 50,
    })) {
      if (s.metadata.projeto !== projeto) continue;
      itens.push(paraResumo(s));
      if (itens.length >= LIMITE_LISTAGEM) break;
    }
    return itens;
  }
}
