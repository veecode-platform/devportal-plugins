import { AuthenticationError } from '@backstage/errors';
import { ErroEstado, statusDoErro } from './erros';

describe('statusDoErro', () => {
  it('tells the person to sign in again on 401', () => {
    expect(statusDoErro(new AuthenticationError())).toEqual({
      status: 401,
      erro: 'Entre no portal para usar o agente.',
    });
  });

  it('answers 409 with the message of the state error it was given', () => {
    expect(
      statusDoErro(new ErroEstado('Esta proposta já foi respondida.')),
    ).toEqual({ status: 409, erro: 'Esta proposta já foi respondida.' });
  });

  it('hides an unknown upstream message behind the generic 502 text', () => {
    expect(
      statusDoErro(new Error('connect ECONNREFUSED gitlab.local')),
    ).toEqual({
      status: 502,
      erro: 'O portal não conseguiu falar com o GitLab ou com o agente.',
    });
  });
});
