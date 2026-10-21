import { GitLabHttp } from './http';

const TOKEN = 'token-de-teste-nao-real';

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GitLabHttp (mocked fetch)', () => {
  it('sends the token only in PRIVATE-TOKEN and encodes the project and the file path', async () => {
    const buscar = jest.fn(async () =>
      respostaJson({ content: Buffer.from('conteudo').toString('base64') }),
    );
    const gitlab = new GitLabHttp({
      base: 'https://gitlab.example.com/api/v4/',
      token: TOKEN,
      projeto: 'veecode-demos/pedidos-api',
      buscar,
    });
    await expect(
      gitlab.getFile('src/main/Desconto.java', 'main'),
    ).resolves.toBe('conteudo');
    const [url, init] = buscar.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://gitlab.example.com/api/v4/projects/veecode-demos%2Fpedidos-api/repository/files/src%2Fmain%2FDesconto.java?ref=main',
    );
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe(
      TOKEN,
    );
  });

  it('answers null for a missing file, and throws an error that carries status and route, never the token', async () => {
    const naoEncontrado = new GitLabHttp({
      base: 'https://gitlab.example.com/api/v4',
      token: TOKEN,
      projeto: 'g/p',
      buscar: async () => respostaJson({}, 404),
    });
    await expect(
      naoEncontrado.getFile('x.java', 'agente/fix-1-1'),
    ).resolves.toBeNull();

    const falha = new GitLabHttp({
      base: 'https://gitlab.example.com/api/v4',
      token: TOKEN,
      projeto: 'g/p',
      buscar: async () => respostaJson({ message: 'negado' }, 403),
    });
    const erro = await falha
      .createBranch('agente/fix-1-1', 'main')
      .catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe(
      'GitLab respondeu 403 em POST /projects/g%2Fp/repository/branches',
    );
    expect((erro as Error).message).not.toContain(TOKEN);
  });
});
