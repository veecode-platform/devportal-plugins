import {
  AuthenticationError,
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';

// Domain errors of the investigation flow. Each maps to one status in the contract.

export class ErroEstado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroEstado';
  }
}

export class ErroNaoEncontrado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroNaoEncontrado';
  }
}

// Status and the one-line ErroResposta text for an error. Anything unknown is a
// 502 with a generic text: upstream messages may carry details we do not show.
export function statusDoErro(erro: unknown): { status: number; erro: string } {
  if (erro instanceof InputError) return { status: 400, erro: erro.message };
  if (erro instanceof AuthenticationError)
    return { status: 401, erro: 'Entre no portal para usar o agente.' };
  if (erro instanceof NotAllowedError)
    return { status: 403, erro: erro.message };
  if (erro instanceof NotFoundError || erro instanceof ErroNaoEncontrado)
    return { status: 404, erro: erro.message };
  if (erro instanceof ConflictError || erro instanceof ErroEstado)
    return { status: 409, erro: erro.message };
  return {
    status: 502,
    erro: 'O portal não conseguiu falar com o GitLab ou com o agente.',
  };
}
