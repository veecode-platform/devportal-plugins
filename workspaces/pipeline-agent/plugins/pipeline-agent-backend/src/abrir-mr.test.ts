import {
  escolherBranch,
  executarAbrirMr,
  parseAbrirMrEntrada,
} from './abrir-mr';
import type { GitLab } from './gitlab/types';

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
  it('gives the agent the MR number and sends the full URL only to the card', async () => {
    const url =
      'https://gitlab.example.com/veecode-demos/pedidos-api/-/merge_requests/7';
    const gitlab = {
      listBranches: async () => [],
      createBranch: async () => undefined,
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

  it.each([
    [
      'the pipeline url GitLab gives',
      'https://gitlab.example.com/veecode-demos/pedidos-api/-/pipelines/90',
    ],
    ['null when GitLab gives none', null],
  ])('sends %s with every pipeline update', async (_nome, url) => {
    const gitlab = {
      listBranches: async () => [],
      createBranch: async () => undefined,
      commit: async () => undefined,
      createMR: async () => ({
        iid: 7,
        titulo: 't',
        url: 'https://gitlab.example.com/veecode-demos/pedidos-api/-/merge_requests/7',
      }),
      getMRPipeline: async () => ({
        id: 90,
        status: 'success',
        ref: 'agente/fix-9001-1',
        sha: 'x',
        criadoEm: 'c',
        url,
      }),
      listJobs: async () => [],
      listFailedJobs: async () => [],
      getJobTrace: async () => '',
    } as unknown as GitLab;
    const atualizacoes: Array<string | null> = [];
    await executarAbrirMr({
      gitlab,
      pipelineId: 9001,
      ref: 'main',
      tentativa: 1,
      entrada: { titulo: 't', causa: 'c', arquivos: [] },
      arquivos: [],
      intervaloMs: 0,
      prazoMs: 1000,
      dormir: async () => undefined,
      aoAbrirMr: () => undefined,
      aoMudarPipeline: p => atualizacoes.push(p.url),
    });
    expect(atualizacoes.length).toBeGreaterThan(0);
    expect(atualizacoes.every(u => u === url)).toBe(true);
  });
});
