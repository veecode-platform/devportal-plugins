// Status 0 means the request never got an answer from the backend.
export class PipelineAgentError extends Error {
  readonly status: number;
  readonly detalhe?: string;

  constructor(status: number, mensagem: string, detalhe?: string) {
    super(mensagem);
    this.name = 'PipelineAgentError';
    this.status = status;
    this.detalhe = detalhe;
  }
}

export const MENSAGEM_SEM_PERMISSAO =
  'Você não tem permissão para usar o agente neste serviço.';
export const MENSAGEM_NAO_CONFIGURADO =
  'O agente de pipeline ainda não foi configurado neste portal.';
export const MENSAGEM_CONFLITO =
  'Esta proposta já foi respondida, ou outra investigação está em andamento.';
const MENSAGEM_REDE =
  'Não foi possível falar com o agente. Confira a conexão e tente de novo.';

export function mensagemPara(status: number): string {
  switch (status) {
    case 0:
      return MENSAGEM_REDE;
    case 400:
      return 'O agente não aceitou o pedido. Recarregue a página e tente de novo.';
    case 401:
      return 'Sua sessão no portal expirou. Entre de novo para continuar.';
    case 403:
      return MENSAGEM_SEM_PERMISSAO;
    case 404:
      return 'Esta investigação não existe mais.';
    case 409:
      return MENSAGEM_CONFLITO;
    case 501:
      return 'Esta ação ainda não está disponível.';
    case 502:
      return 'O portal não conseguiu falar com o GitLab ou com o agente. Tente de novo em instantes.';
    case 503:
      return MENSAGEM_NAO_CONFIGURADO;
    default:
      return `Erro inesperado ao falar com o agente (HTTP ${status}).`;
  }
}

export function erroDeRede(): PipelineAgentError {
  return new PipelineAgentError(0, MENSAGEM_REDE);
}

// Reads the ErroResposta body, which the backend sends for every non-2xx answer.
function detalheDoCorpo(corpo: unknown): string | undefined {
  if (typeof corpo !== 'object' || corpo === null || !('erro' in corpo)) {
    return undefined;
  }
  return typeof corpo.erro === 'string' ? corpo.erro : undefined;
}

// A 409 names the conflict in the backend's text when it has one. No other
// status shows the backend text; it stays in `detalhe` for debugging.
function mensagemDaResposta(status: number, detalhe: string | undefined) {
  if (status === 409 && detalhe !== undefined && detalhe.trim() !== '') {
    return detalhe;
  }
  return mensagemPara(status);
}

export async function erroDaResposta(
  resposta: Response,
): Promise<PipelineAgentError> {
  const corpo: unknown = await resposta.json().catch(() => undefined);
  const detalhe = detalheDoCorpo(corpo);
  return new PipelineAgentError(
    resposta.status,
    mensagemDaResposta(resposta.status, detalhe),
    detalhe,
  );
}

// The server answered, so reconnecting cannot change the result.
export const ehErroHttp = (erro: unknown): boolean =>
  erro instanceof PipelineAgentError && erro.status >= 400;
