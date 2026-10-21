import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';

// Reads pipelineAgent.* once at startup. Reading never throws: a missing key in real
// mode is reported in faltando, and the router answers 503 until it is set. Values
// are returned to the caller only; nothing here logs or prints them.

export type Leitor = {
  getOptionalString(chave: string): string | undefined;
  getOptional(chave: string): unknown;
};

// One binding: a GitLab project and the single entity allowed to use it.
export type Vinculo = { project: string; entityRef: string };

export type CredenciaisReais = {
  anthropicApiKey: string;
  agentId: string;
  environmentId: string;
  gitlabToken: string;
  gitlabBaseUrl: string;
};

export type Configuracao = {
  modo: 'fake' | 'real';
  vinculos: Vinculo[];
  vinculosInvalidos: number;
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
const SLUG_VALIDO = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/;
const VINCULO_FAKE_PADRAO: Vinculo = {
  project: 'veecode-demos/pedidos-api',
  entityRef: 'component:default/pedidos-api',
};

// Malformed entries are dropped, so a bad entry can only remove access, never add it.
export function lerVinculos(bruto: unknown): {
  vinculos: Vinculo[];
  invalidos: number;
} {
  const itens = Array.isArray(bruto) ? bruto : [bruto];
  const vinculos: Vinculo[] = [];
  let invalidos = 0;
  for (const item of itens) {
    const registro: Record<string, unknown> =
      typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>)
        : {};
    const { project, entityRef } = registro;
    if (
      typeof project !== 'string' ||
      typeof entityRef !== 'string' ||
      !SLUG_VALIDO.test(project.trim())
    ) {
      invalidos += 1;
      continue;
    }
    try {
      vinculos.push({
        project: project.trim(),
        entityRef: stringifyEntityRef(parseEntityRef(entityRef.trim())),
      });
    } catch {
      invalidos += 1;
    }
  }
  return { vinculos, invalidos };
}

export function lerConfiguracao(config: Leitor): Configuracao {
  const modo = config.getOptionalString('pipelineAgent.mode') ?? 'fake';
  if (modo !== 'fake' && modo !== 'real') {
    return {
      modo: 'real',
      vinculos: [],
      vinculosInvalidos: 0,
      faltando: ['pipelineAgent.mode'],
      real: null,
    };
  }
  const bruto = config.getOptional('pipelineAgent.allowedProjects');
  // Fake mode binds the demo project by default. Real mode binds nothing until the list is written.
  const lidos = bruto === undefined ? null : lerVinculos(bruto);
  const vinculos =
    lidos?.vinculos ?? (modo === 'fake' ? [VINCULO_FAKE_PADRAO] : []);
  const vinculosInvalidos = lidos?.invalidos ?? 0;
  if (modo === 'fake')
    return { modo, vinculos, vinculosInvalidos, faltando: [], real: null };

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
    return { modo, vinculos, vinculosInvalidos, faltando, real: null };
  const gitlabBaseUrl = (
    config.getOptionalString('pipelineAgent.gitlab.baseUrl') ?? GITLAB_PADRAO
  ).replace(/\/$/, '');
  return {
    modo,
    vinculos,
    vinculosInvalidos,
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
