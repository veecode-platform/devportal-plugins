import type { AgentRuntime, ArquivoSessao } from './agente/types';
import { SHA_COMMIT } from './fake/cenario';
import { GitLabFake } from './fake/gitlab';
import { criarServico } from './servico';

const HOST = 'gitlab.example.com';
const ENTIDADE = {
  entityRef: 'component:default/pedidos-api',
  projectSlug: 'veecode-demos/pedidos-api',
};
const TRACE = [
  '\x1b[0Ksection_start:1700000000:prepare_executor\r\x1b[0K\x1b[0;mPreparing the "docker" executor',
  'Running with gitlab-runner 17.4.0 (abc123) on runner-1 (abc123)',
  'section_end:1700000001:prepare_executor\r\x1b[0K',
  '\x1b[32;1m$ mvn -B test\x1b[0;m',
  '[ERROR] Failed to clone https://gitlab.example.com/veecode-demos/pedidos-api.git',
].join('\n');

// Stub runtime: records what the service hands over, and its stream ends at once.
function runtimeRegistrador() {
  const createSession = jest.fn(async (_entrada: unknown) => 'sesn_1');
  const enviar = jest.fn(async (_id: string, _eventos: unknown) => undefined);
  const runtime = {
    createSession,
    enviar,
    abrirFluxo: async () => ({
      eventos: (async function* vazio() {})(),
      fechar: () => undefined,
    }),
    obterSessao: async () => ({}),
    listarSessoes: async () => [],
  } as unknown as AgentRuntime;
  return { runtime, createSession, enviar };
}

describe('criarServico.iniciar', () => {
  it('uploads the sanitized trace and diff, the archive as it is, and mounts them under /pipeline', async () => {
    const gitlab = new GitLabFake('veecode-demos/pedidos-api', {
      duracaoPipelineMs: 0,
    });
    jest.spyOn(gitlab, 'getJobTrace').mockResolvedValue(TRACE);
    jest
      .spyOn(gitlab, 'getCommitDiff')
      .mockResolvedValue(`+ see https://${HOST}/x/-/blob/main/y`);
    const { runtime, createSession } = runtimeRegistrador();

    const servico = criarServico({
      runtime,
      gitlabPara: () => gitlab,
      gitlabHost: HOST,
      agentId: 'agent_x',
      environmentId: 'env_x',
      ritmo: { intervaloPollMs: 0, prazoPollMs: 1000, dormir: async () => {} },
    });
    await servico.iniciar(ENTIDADE);

    const entrada = createSession.mock.calls[0][0] as unknown as {
      arquivos: ArquivoSessao[];
    };
    const porNome = Object.fromEntries(entrada.arquivos.map(a => [a.nome, a]));
    expect(Object.keys(porNome).sort()).toEqual([
      'commit.diff',
      'repo.tar.gz',
      'trace.log',
    ]);
    expect(porNome['trace.log'].caminho).toBe('/pipeline/trace.log');
    expect(porNome['commit.diff'].caminho).toBe('/pipeline/commit.diff');
    expect(porNome['repo.tar.gz'].caminho).toBe('/pipeline/repo.tar.gz');

    const trace = new TextDecoder().decode(porNome['trace.log'].conteudo);
    expect(trace).toBe(
      '$ mvn -B test\n[ERROR] Failed to clone https://gitlab.local/veecode-demos/pedidos-api.git',
    );
    const diff = new TextDecoder().decode(porNome['commit.diff'].conteudo);
    expect(diff).toBe(`+ see https://gitlab.local/x/-/blob/main/y`);
    expect(porNome['repo.tar.gz'].conteudo).toEqual(
      await gitlab.getArchive(SHA_COMMIT),
    );
  });

  it('sends the agent an initial message with no host', async () => {
    const gitlab = new GitLabFake('veecode-demos/pedidos-api', {
      duracaoPipelineMs: 0,
    });
    jest.spyOn(gitlab, 'getJobTrace').mockResolvedValue(TRACE);
    const { runtime, enviar } = runtimeRegistrador();
    const servico = criarServico({
      runtime,
      gitlabPara: () => gitlab,
      gitlabHost: HOST,
      agentId: 'agent_x',
      environmentId: 'env_x',
      ritmo: { intervaloPollMs: 0, prazoPollMs: 1000, dormir: async () => {} },
    });
    await servico.iniciar(ENTIDADE);

    const primeira = enviar.mock.calls[0][1] as unknown as Array<{
      content: Array<{ text: string }>;
    }>;
    const texto = primeira[0].content[0].text;
    expect(texto).toContain('Projeto veecode-demos/pedidos-api (id 4242).');
    expect(texto).toContain('Pipeline 9001 falhou no job test (id 5531).');
    expect(texto).not.toContain(HOST);
    expect(texto).not.toMatch(/https?:\/\//);
  });
});
