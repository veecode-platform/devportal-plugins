import { lerConfiguracao, lerVinculos, type Leitor } from './configuracao';

function leitor(valores: Record<string, unknown>): Leitor {
  return {
    getOptionalString: chave =>
      typeof valores[chave] === 'string'
        ? (valores[chave] as string)
        : undefined,
    getOptional: chave => valores[chave],
  };
}

const CHAVES_REAIS = {
  'pipelineAgent.mode': 'real',
  'pipelineAgent.anthropic.apiKey': 'chave-de-teste',
  'pipelineAgent.agentId': 'agent_teste',
  'pipelineAgent.environmentId': 'env_teste',
  'pipelineAgent.gitlab.token': 'token-de-teste',
};
const VINCULO = {
  project: 'veecode-demos/pedidos-api',
  entityRef: 'component:default/pedidos-api',
};

describe('lerConfiguracao', () => {
  it('is fake by default and binds the demo project to its entity', () => {
    const cfg = lerConfiguracao(leitor({}));
    expect(cfg).toEqual({
      modo: 'fake',
      vinculos: [VINCULO],
      vinculosInvalidos: 0,
      faltando: [],
      real: null,
    });
  });

  it('names only the missing keys in real mode, and never reads a value into the report', () => {
    const cfg = lerConfiguracao(
      leitor({
        'pipelineAgent.mode': 'real',
        'pipelineAgent.agentId': 'agent_teste',
      }),
    );
    expect(cfg.faltando).toEqual([
      'pipelineAgent.anthropic.apiKey',
      'pipelineAgent.environmentId',
      'pipelineAgent.gitlab.token',
    ]);
    expect(cfg.real).toBeNull();
    expect(JSON.stringify(cfg)).not.toContain('agent_teste');
  });

  it('binds nothing in real mode when the list is missing', () => {
    const cfg = lerConfiguracao(leitor(CHAVES_REAIS));
    expect(cfg.faltando).toEqual([]);
    expect(cfg.vinculos).toEqual([]);
    expect(cfg.real).toMatchObject({
      agentId: 'agent_teste',
      gitlabBaseUrl: 'https://gitlab.com',
    });
  });

  it('uses the configured bindings and strips a trailing slash from the GitLab base URL', () => {
    const cfg = lerConfiguracao(
      leitor({
        ...CHAVES_REAIS,
        'pipelineAgent.allowedProjects': [VINCULO],
        'pipelineAgent.gitlab.baseUrl': 'https://gl.example.com/',
      }),
    );
    expect(cfg.vinculos).toEqual([VINCULO]);
    expect(cfg.real?.gitlabBaseUrl).toBe('https://gl.example.com');
  });

  it('reports an unknown mode as a missing key instead of throwing', () => {
    const cfg = lerConfiguracao(leitor({ 'pipelineAgent.mode': 'producao' }));
    expect(cfg.faltando).toEqual(['pipelineAgent.mode']);
  });
});

describe('lerVinculos', () => {
  it('canonicalizes the entity ref and drops malformed entries, so a bad entry only removes access', () => {
    const { vinculos, invalidos } = lerVinculos([
      {
        project: 'veecode-demos/pedidos-api',
        entityRef: 'Component:Default/pedidos-api',
      },
      { project: 'veecode-demos/*', entityRef: 'component:default/x' },
      { project: 'veecode-demos/outro' },
      { project: 'sem-barra', entityRef: 'component:default/y' },
      'texto-solto',
    ]);
    expect(vinculos).toEqual([
      {
        project: 'veecode-demos/pedidos-api',
        entityRef: 'component:default/pedidos-api',
      },
    ]);
    expect(invalidos).toBe(4);
  });

  it('treats a value that is not a list as one invalid entry', () => {
    expect(lerVinculos('veecode-demos/pedidos-api')).toEqual({
      vinculos: [],
      invalidos: 1,
    });
  });
});
