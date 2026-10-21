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

describe('GitLabHttp commit diff and archive (mocked fetch)', () => {
  const SHA = 'abc123';
  const RAIZ = 'https://gitlab.example.com/api/v4';

  it('renders the commit diff as unified text, one git header per file, and reads the first page', async () => {
    const buscar = jest.fn(async () =>
      respostaJson([
        {
          old_path: 'a.java',
          new_path: 'a.java',
          new_file: false,
          deleted_file: false,
          diff: '@@ -1 +1 @@\n-x\n+y\n',
        },
        {
          old_path: 'novo.txt',
          new_path: 'novo.txt',
          new_file: true,
          deleted_file: false,
          diff: '@@ -0,0 +1 @@\n+oi\n',
        },
      ]),
    );
    const gitlab = new GitLabHttp({
      base: RAIZ,
      token: TOKEN,
      projeto: 'g/p',
      buscar,
    });
    await expect(gitlab.getCommitDiff(SHA)).resolves.toBe(
      [
        'diff --git a/a.java b/a.java',
        '--- a/a.java',
        '+++ b/a.java',
        '@@ -1 +1 @@',
        '-x',
        '+y',
        'diff --git a/novo.txt b/novo.txt',
        '--- /dev/null',
        '+++ b/novo.txt',
        '@@ -0,0 +1 @@',
        '+oi',
        '',
      ].join('\n'),
    );
    expect((buscar.mock.calls[0] as unknown as [string])[0]).toBe(
      `${RAIZ}/projects/g%2Fp/repository/commits/abc123/diff?per_page=100&page=1`,
    );
  });

  it('keeps asking for pages while a page is full', async () => {
    const pagina = Array.from({ length: 100 }, (_, i) => ({
      old_path: `f${i}.txt`,
      new_path: `f${i}.txt`,
      diff: '',
    }));
    const buscar = jest
      .fn()
      .mockResolvedValueOnce(respostaJson(pagina))
      .mockResolvedValueOnce(respostaJson([]));
    const gitlab = new GitLabHttp({
      base: RAIZ,
      token: TOKEN,
      projeto: 'g/p',
      buscar,
    });
    const diff = await gitlab.getCommitDiff(SHA);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect((buscar.mock.calls[1] as unknown as [string])[0]).toContain(
      'page=2',
    );
    expect(
      diff.split('\n').filter(l => l.startsWith('diff --git')),
    ).toHaveLength(100);
  });

  it('returns the archive bytes, and throws on a missing commit instead of answering empty', async () => {
    const bytes = new Uint8Array([0x1f, 0x8b, 0x08]);
    const ok = new GitLabHttp({
      base: RAIZ,
      token: TOKEN,
      projeto: 'g/p',
      buscar: async () => new Response(bytes, { status: 200 }),
    });
    await expect(ok.getArchive(SHA)).resolves.toEqual(Buffer.from(bytes));

    const ausente = new GitLabHttp({
      base: RAIZ,
      token: TOKEN,
      projeto: 'g/p',
      buscar: async () => respostaJson({}, 404),
    });
    await expect(ausente.getArchive(SHA)).rejects.toThrow(
      'GitLab respondeu 404 em GET /projects/:id/repository/archive.tar.gz',
    );
  });
});
