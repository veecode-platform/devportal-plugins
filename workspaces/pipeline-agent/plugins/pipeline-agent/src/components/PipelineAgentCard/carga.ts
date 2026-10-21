import { PipelineAgentError } from '../../api';

// Outcome of a read the card makes on load. 503 and 404 change what the card
// shows, so they stay distinct instead of becoming a message.
export type Falha =
  | { tipo: 'nao_configurado' }
  | { tipo: 'ausente' }
  | { tipo: 'mensagem'; texto: string };

export type Carga<T> =
  | { estado: 'carregando' }
  | { estado: 'pronta'; dados: T }
  | { estado: 'falhou'; falha: Falha };

export const CARREGANDO: { estado: 'carregando' } = { estado: 'carregando' };

export const MENSAGEM_INESPERADA =
  'Algo inesperado aconteceu com o agente. Recarregue a página para tentar de novo.';

export function falhaDe(erro: unknown): Falha {
  if (!(erro instanceof PipelineAgentError)) {
    return { tipo: 'mensagem', texto: MENSAGEM_INESPERADA };
  }
  if (erro.status === 503) return { tipo: 'nao_configurado' };
  if (erro.status === 404) return { tipo: 'ausente' };
  return { tipo: 'mensagem', texto: erro.message };
}

// Messages for an action or a stream. PipelineAgentError already carries the
// pt-BR text for each status; anything else is a bug the user cannot act on.
export function mensagemDe(erro: unknown): string {
  return erro instanceof PipelineAgentError
    ? erro.message
    : MENSAGEM_INESPERADA;
}
