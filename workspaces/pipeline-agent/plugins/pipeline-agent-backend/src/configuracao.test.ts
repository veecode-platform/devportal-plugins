import { lerConfiguracao, type Leitor } from './configuracao';

function leitor(valores: Record<string, string | string[]>): Leitor {
  return {
    getOptionalString: chave =>
      typeof valores[chave] === 'string'
        ? (valores[chave] as string)
        : undefined,
    getOptionalStringArray: chave =>
      Array.isArray(valores[chave]) ? (valores[chave] as string[]) : undefined,
  };
}

const CHAVES_REAIS = {
  'pipelineAgent.mode': 'real',
  'pipelineAgent.anthropic.apiKey': 'chave-de-teste',
  'pipelineAgent.agentId': 'agent_teste',
  'pipelineAgent.environmentId': 'env_teste',
  'pipelineAgent.gitlab.token': 'token-de-teste',
};

describe('lerConfiguracao', () => {
  it('is fake by default and allows the demo project', () => {
    const cfg = lerConfiguracao(leitor({}));
    expect(cfg).toEqual({
      modo: 'fake',
      projetosPermitidos: ['veecode-demos/pedidos-api'],
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

  it('denies every project in real mode when the allowlist is missing', () => {
    const cfg = lerConfiguracao(leitor(CHAVES_REAIS));
    expect(cfg.faltando).toEqual([]);
    expect(cfg.projetosPermitidos).toEqual([]);
    expect(cfg.real).toMatchObject({
      agentId: 'agent_teste',
      gitlabBaseUrl: 'https://gitlab.com',
    });
  });

  it('uses the configured allowlist and strips a trailing slash from the GitLab base URL', () => {
    const cfg = lerConfiguracao(
      leitor({
        ...CHAVES_REAIS,
        'pipelineAgent.allowedProjects': ['veecode-demos/*'],
        'pipelineAgent.gitlab.baseUrl': 'https://gl.example.com/',
      }),
    );
    expect(cfg.projetosPermitidos).toEqual(['veecode-demos/*']);
    expect(cfg.real?.gitlabBaseUrl).toBe('https://gl.example.com');
  });

  it('reports an unknown mode as a missing key instead of throwing', () => {
    const cfg = lerConfiguracao(leitor({ 'pipelineAgent.mode': 'producao' }));
    expect(cfg.faltando).toEqual(['pipelineAgent.mode']);
  });
});
