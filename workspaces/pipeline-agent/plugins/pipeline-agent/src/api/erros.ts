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

export const MENSAGEM_SEM_PERMISSAO = 'Você não tem permissão para esta ação.';
export const MENSAGEM_NAO_CONFIGURADO =
  'O agente de pipeline ainda não foi configurado neste portal.';
const MENSAGEM_REDE =
  'Não consegui falar com o agente. Verifique a conexão e tente de novo.';

export function mensagemPara(status: number): string {
  switch (status) {
    case 0:
      return MENSAGEM_REDE;
    case 400:
      return 'O pedido não foi aceito pelo agente.';
    case 401:
      return 'Sua sessão expirou. Entre de novo para continuar.';
    case 403:
      return MENSAGEM_SEM_PERMISSAO;
    case 404:
      return 'Esta investigação não existe mais.';
    case 409:
      return 'A investigação não está em um estado que aceita esta ação.';
    case 501:
      return 'Esta ação ainda não está disponível.';
    case 502:
      return 'O agente não conseguiu falar com o GitLab. Tente de novo.';
    case 503:
      return MENSAGEM_NAO_CONFIGURADO;
    default:
      return `Falha ao falar com o agente (${status}).`;
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

export async function erroDaResposta(
  resposta: Response,
): Promise<PipelineAgentError> {
  const corpo: unknown = await resposta.json().catch(() => undefined);
  return new PipelineAgentError(
    resposta.status,
    mensagemPara(resposta.status),
    detalheDoCorpo(corpo),
  );
}

// The server answered, so reconnecting cannot change the result.
export const ehErroHttp = (erro: unknown): boolean =>
  erro instanceof PipelineAgentError && erro.status >= 400;
