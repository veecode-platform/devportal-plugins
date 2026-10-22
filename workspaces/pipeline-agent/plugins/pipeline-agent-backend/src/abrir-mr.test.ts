import {
  escolherBranch,
  executarAbrirMr,
  parseAbrirMrEntrada,
} from './abrir-mr';
import type { GitLab } from './gitlab/types';
import { GitLabFake } from './fake/gitlab';
import { CAMINHO_ALVO } from './fake/cenario';

describe('parseAbrirMrEntrada', () => {
  const valida = {
    titulo: 'fix: cupom e faixa somam sobre o valor bruto',
    causa: 'A faixa era aplicada sobre o valor já descontado.',
    arquivos: [
      { caminho: 'src/main/java/Desconto.java', conteudo: 'class D {}' },
    ],
  };

  it('accepts a well-formed proposal', () => {
    expect(parseAbrirMrEntrada(valida)).toEqual({ ok: true, valor: valida });
  });

  it.each([
    [
      'a path that leaves the repository',
      { ...valida, arquivos: [{ caminho: '../segredo', conteudo: 'x' }] },
    ],
    [
      'an absolute path',
      { ...valida, arquivos: [{ caminho: '/etc/passwd', conteudo: 'x' }] },
    ],
    ['no files', { ...valida, arquivos: [] }],
    ['a missing title', { causa: valida.causa, arquivos: valida.arquivos }],
  ])('rejects %s', (_nome, entrada) => {
    expect(parseAbrirMrEntrada(entrada).ok).toBe(false);
  });
});

describe('escolherBranch', () => {
  it('takes the next free number when the first name is already used', async () => {
    const gitlab = {
      listBranches: async () => ['agente/fix-9001-1'],
    } as unknown as GitLab;
    await expect(escolherBranch(gitlab, 9001, 1)).resolves.toBe(
      'agente/fix-9001-2',
    );
  });
});

describe('executarAbrirMr', () => {
  it('makes one commit request that creates the MR branch from the failed pipeline ref', async () => {
    const commits: unknown[] = [];
    const gitlab = {
      listBranches: async () => [],
      commit: async (entrada: unknown) => {
        commits.push(entrada);
      },
      createMR: async () => ({ iid: 7, titulo: 't', url: 'u' }),
      getMRPipeline: async () => ({
        id: 90,
        status: 'success',
        ref: 'agente/fix-9001-1',
        sha: 'x',
        criadoEm: 'c',
        url: 'u',
      }),
      listJobs: async () => [],
      listFailedJobs: async () => [],
      getJobTrace: async () => '',
    } as unknown as GitLab;
    await executarAbrirMr({
      gitlab,
      pipelineId: 9001,
      ref: 'main',
      tentativa: 1,
      entrada: {
        titulo: 'fix: cupom',
        causa: 'c',
        arquivos: [{ caminho: 'a.java', conteudo: 'class A {}' }],
      },
      arquivos: [
        { caminho: 'a.java', conteudo: 'class A {}', existente: 'class A {' },
      ],
      intervaloMs: 0,
      prazoMs: 1000,
      dormir: async () => undefined,
      aoAbrirMr: () => undefined,
      aoMudarPipeline: () => undefined,
    });
    expect(commits).toEqual([
      {
        branch: 'agente/fix-9001-1',
        base: 'main',
        mensagem: 'fix: cupom',
        acoes: [{ acao: 'update', caminho: 'a.java', conteudo: 'class A {}' }],
      },
    ]);
  });

  it('gives the agent the MR number and sends the full URL only to the card', async () => {
    const url =
      'https://gitlab.example.com/veecode-demos/pedidos-api/-/merge_requests/7';
    const gitlab = {
      listBranches: async () => [],
      commit: async () => undefined,
      createMR: async () => ({ iid: 7, titulo: 't', url }),
      getMRPipeline: async () => ({
        id: 90,
        status: 'success',
        ref: 'agente/fix-9001-1',
        sha: 'x',
        criadoEm: 'c',
        url: 'u',
      }),
      listJobs: async () => [],
      listFailedJobs: async () => [],
      getJobTrace: async () => '',
    } as unknown as GitLab;
    const cartao: string[] = [];
    const { resultado, sucesso } = await executarAbrirMr({
      gitlab,
      pipelineId: 9001,
      ref: 'main',
      tentativa: 1,
      entrada: { titulo: 't', causa: 'c', arquivos: [] },
      arquivos: [],
      intervaloMs: 0,
      prazoMs: 1000,
      dormir: async () => undefined,
      aoAbrirMr: mr => cartao.push(mr.url),
      aoMudarPipeline: () => undefined,
    });
    expect(sucesso).toBe(true);
    expect(resultado).toEqual({ mr_iid: 7, pipeline_status: 'success' });
    expect(cartao).toEqual([url]);
  });
});

describe('GitLabFake commit', () => {
  it('creates the branch from the base in the commit, and refuses a second commit to the same name', async () => {
    const fake = new GitLabFake('g/p', { duracaoPipelineMs: 0 });
    const entrada = {
      branch: 'agente/fix-9001-1',
      base: 'main',
      mensagem: 'fix: cupom',
      acoes: [
        { acao: 'update' as const, caminho: CAMINHO_ALVO, conteudo: 'novo' },
      ],
    };
    await fake.commit(entrada);
    await expect(fake.getFile(CAMINHO_ALVO, 'agente/fix-9001-1')).resolves.toBe(
      'novo',
    );
    await expect(fake.commit(entrada)).rejects.toMatchObject({ status: 400 });
  });
});
