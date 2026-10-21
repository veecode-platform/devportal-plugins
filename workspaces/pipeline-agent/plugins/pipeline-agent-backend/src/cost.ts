// Custo da sessão a partir do campo usage do Managed Agents, com os preços
// do Sonnet 5.5 e o custo de execução por hora (valores do DESIGN.md).

export const PRECOS = {
  entradaPorMTok: 2,
  saidaPorMTok: 10,
  cacheLeituraPorMTok: 0.1,
  execucaoPorHora: 0.08,
} as const;

export type Usage = {
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheLeitura: number;
  tokensCacheEscrita: number;
  segundosAtivos: number | null;
};

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
    ? valor
    : 0;
}

function registro(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
    ? (valor as Record<string, unknown>)
    : {};
}

// Campo usage vindo da API. Campos ausentes valem zero; active_seconds só
// aparece quando a API o informa, e o chamador decide o fallback.
export function parseUsage(bruto: unknown): Usage {
  const u = registro(bruto);
  const cache = registro(u.cache_creation);
  const ativos = u.active_seconds;
  return {
    tokensEntrada: numero(u.input_tokens),
    tokensSaida: numero(u.output_tokens),
    tokensCacheLeitura: numero(u.cache_read_input_tokens),
    tokensCacheEscrita:
      numero(cache.ephemeral_5m_input_tokens) +
      numero(cache.ephemeral_1h_input_tokens),
    segundosAtivos:
      typeof ativos === 'number' && Number.isFinite(ativos) && ativos >= 0
        ? ativos
        : null,
  };
}

// Tokens de criação de cache entram pelo preço de entrada: a lista de preços
// do DESIGN não tem essa linha. Ver o README para o limite dessa conta.
export function custoUsd(u: Usage, segundosSemInformacao: number): number {
  const segundos = u.segundosAtivos ?? segundosSemInformacao;
  const tokens =
    ((u.tokensEntrada + u.tokensCacheEscrita) * PRECOS.entradaPorMTok) /
      1_000_000 +
    (u.tokensSaida * PRECOS.saidaPorMTok) / 1_000_000 +
    (u.tokensCacheLeitura * PRECOS.cacheLeituraPorMTok) / 1_000_000;
  return tokens + (segundos / 3600) * PRECOS.execucaoPorHora;
}
