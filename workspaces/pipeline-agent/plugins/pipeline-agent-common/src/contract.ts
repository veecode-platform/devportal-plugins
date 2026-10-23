import type { Fase, ItemHistorico, PropostaHistorico } from './types';

// HTTP contract between the frontend and the pipeline agent backend. Paths are
// relative to the plugin's API prefix, /api/pipeline-agent. The routes and
// bodies mirror the prototype's app/api routes; the only addition is entity
// anchoring: every call that starts or lists work names a catalog entity, and
// the backend resolves the GitLab project from that entity's annotation. The
// browser never sends a project.
export const PIPELINE_AGENT_ROUTES = {
  health: '/health',
  // POST, body IniciarCorpo, answers 201 with IniciarResposta.
  investigations: '/investigations',
  // GET, text/event-stream of UiEvent frames. Frame ids are log indexes, and a
  // reconnect sends Last-Event-ID to resume after that index.
  investigationEvents: '/investigations/:id/events',
  // POST, body AprovarCorpo, answers FaseResposta.
  aprovar: '/investigations/:id/aprovar',
  // POST, body RecusarCorpo, answers FaseResposta.
  recusar: '/investigations/:id/recusar',
  // POST, body OrientarCorpo, answers FaseResposta.
  orientar: '/investigations/:id/orientar',
  // GET with the EntidadeQuery parameter, answers Banner.
  project: '/project',
  // GET with the EntidadeQuery parameter, answers HistoricoResposta.
  history: '/history',
  // GET with the EntidadeQuery parameter, answers DetalheHistorico. The id is the
  // session id of an item in the history answer.
  historyItem: '/history/:id',
} as const;

export const PIPELINE_AGENT_EVENTS_CONTENT_TYPE = 'text/event-stream';

// Entity reference in the stringifyEntityRef form, for example
// `component:default/pedidos-api`.
export type EntidadeQuery = { entityRef: string };

export type IniciarCorpo = { entityRef: string };

// toolUseId names the pending proposal the decision applies to.
export type AprovarCorpo = { toolUseId: string };

export type RecusarCorpo = { toolUseId: string; motivo: string };

export type OrientarCorpo = { toolUseId: string; texto: string };

export type FaseResposta = { fase: Fase };

export type HistoricoResposta = { itens: ItemHistorico[] };

// proposta is null when the session has no usable proposal: that is an empty
// detail, answered with 200, not an error.
export type DetalheHistorico = {
  id: string;
  proposta: PropostaHistorico | null;
};

// Error body for every non-2xx answer. 400 invalid input, 404 unknown or hidden
// entity or investigation, 409 wrong state, 502 upstream failure, 503 the plugin is not
// configured (real mode, missing keys). 401 and 403 come from the portal: 403 is
// an RBAC or allowlist denial.
export type ErroResposta = { erro: string };
