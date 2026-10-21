// Reads pipelineAgent.* once at startup. Reading never throws: a missing key in real
// mode is reported in faltando, and the router answers 503 until it is set. Values
// are returned to the caller only; nothing here logs or prints them.

export type Leitor = {
  getOptionalString(chave: string): string | undefined;
  getOptionalStringArray(chave: string): string[] | undefined;
};

export type CredenciaisReais = {
  anthropicApiKey: string;
  agentId: string;
  environmentId: string;
  gitlabToken: string;
  gitlabBaseUrl: string;
};

export type Configuracao = {
  modo: 'fake' | 'real';
  projetosPermitidos: string[];
  faltando: string[];
  real: CredenciaisReais | null;
};

const CHAVES_REAIS = {
  anthropicApiKey: 'pipelineAgent.anthropic.apiKey',
  agentId: 'pipelineAgent.agentId',
  environmentId: 'pipelineAgent.environmentId',
  gitlabToken: 'pipelineAgent.gitlab.token',
} as const;

const GITLAB_PADRAO = 'https://gitlab.com';
const PROJETO_FAKE_PADRAO = 'veecode-demos/pedidos-api';

export function lerConfiguracao(config: Leitor): Configuracao {
  const modo = config.getOptionalString('pipelineAgent.mode') ?? 'fake';
  if (modo !== 'fake' && modo !== 'real') {
    return {
      modo: 'real',
      projetosPermitidos: [],
      faltando: ['pipelineAgent.mode'],
      real: null,
    };
  }
  const listaConfigurada = config.getOptionalStringArray(
    'pipelineAgent.allowedProjects',
  );
  // Fake mode allows the demo project by default. Real mode allows nothing until
  // the allowlist is written.
  const projetosPermitidos =
    listaConfigurada ?? (modo === 'fake' ? [PROJETO_FAKE_PADRAO] : []);
  if (modo === 'fake')
    return { modo, projetosPermitidos, faltando: [], real: null };

  const valores: Partial<Record<keyof typeof CHAVES_REAIS, string>> = {};
  const faltando: string[] = [];
  for (const [nome, chave] of Object.entries(CHAVES_REAIS) as Array<
    [keyof typeof CHAVES_REAIS, string]
  >) {
    const valor = (config.getOptionalString(chave) ?? '').trim();
    if (valor) valores[nome] = valor;
    else faltando.push(chave);
  }
  if (faltando.length > 0)
    return { modo, projetosPermitidos, faltando, real: null };
  const gitlabBaseUrl = (
    config.getOptionalString('pipelineAgent.gitlab.baseUrl') ?? GITLAB_PADRAO
  ).replace(/\/$/, '');
  return {
    modo,
    projetosPermitidos,
    faltando: [],
    real: {
      anthropicApiKey: valores.anthropicApiKey ?? '',
      agentId: valores.agentId ?? '',
      environmentId: valores.environmentId ?? '',
      gitlabToken: valores.gitlabToken ?? '',
      gitlabBaseUrl,
    },
  };
}
