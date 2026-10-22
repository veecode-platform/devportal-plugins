import type { BetaManagedAgentsStreamSessionEvents } from '@anthropic-ai/sdk/resources/beta/sessions/events';

// The only place where the backend speaks the Managed Agents event format. The
// fake runtime produces objects of the same type, so the mapping runs the same
// way in both modes.

export type SdkEvent = BetaManagedAgentsStreamSessionEvents;

export type TextoBloco = { type: 'text'; text: string };

export type EventoUsuario =
  | { type: 'user.message'; content: TextoBloco[] }
  | { type: 'user.interrupt' }
  | {
      type: 'user.custom_tool_result';
      custom_tool_use_id: string;
      content: TextoBloco[];
      is_error: boolean;
    };

export type SessaoResumo = {
  id: string;
  status: string;
  title: string | null;
  criadaEm: string;
  metadata: Record<string, string>;
  usage: unknown;
};

export type FluxoEventos = {
  eventos: AsyncIterable<SdkEvent>;
  fechar: () => void;
};

// A file the session receives: the real runtime uploads it and mounts it at
// caminho inside the session. The fake runtime keeps nothing.
export type ArquivoSessao = {
  nome: string;
  tipo: string;
  conteudo: Uint8Array;
  caminho: string;
};

export interface AgentRuntime {
  createSession(entrada: {
    agentId: string;
    environmentId: string;
    metadata: Record<string, string>;
    title: string;
    arquivos: ArquivoSessao[];
  }): Promise<string>;
  abrirFluxo(sessionId: string): Promise<FluxoEventos>;
  enviar(sessionId: string, eventos: EventoUsuario[]): Promise<void>;
  // Throws ErroNaoEncontrado for an id the runtime does not know.
  obterSessao(sessionId: string): Promise<SessaoResumo>;
  listarSessoes(agentId: string, projeto: string): Promise<SessaoResumo[]>;
  // Every event of the session in order, restricted to the given event types.
  listarEventos(sessionId: string, tipos: string[]): Promise<SdkEvent[]>;
}
