// Wire types shared by the pipeline agent backend and its frontend. Names and
// shapes follow the prototype's lib/ui-events.ts; the frontend never receives
// a type from the Anthropic SDK, only these events.

export type Fase =
  | 'investigando'
  | 'aguardando_aprovacao'
  | 'abrindo_mr'
  | 'pipeline'
  | 'verde'
  | 'vermelho'
  | 'encerrado'
  | 'erro';

export type ArquivoDiff = { caminho: string; novo: boolean; diff: string };

export type JobResumo = { id: number; nome: string };

// One event of an investigation's SSE stream. The SSE `id` of each frame is the
// index of the event in the investigation log.
export type UiEvent =
  | { tipo: 'fase'; fase: Fase }
  | { tipo: 'passo'; id: string; texto: string }
  | { tipo: 'comando'; id: string; resumo: string; comando: string }
  | { tipo: 'comando_saida'; id: string; saida: string }
  | {
      tipo: 'diagnostico';
      ferramentaId: string;
      titulo: string;
      causa: string;
      tentativa: number;
      arquivos: ArquivoDiff[];
    }
  | { tipo: 'orientacao'; texto: string }
  | { tipo: 'recusa'; motivo: string }
  | { tipo: 'mr_aberto'; iid: number; titulo: string; url: string }
  | {
      tipo: 'pipeline_mr';
      pipelineId: number;
      status: string;
      url: string | null;
      jobs: string[];
      jobFalho: string | null;
    }
  | { tipo: 'verde'; segundos: number }
  | {
      tipo: 'uso';
      tokensEntrada: number;
      tokensSaida: number;
      tokensCacheLeitura: number;
      tokensCacheEscrita: number;
      segundosAtivos: number;
      custoUsd: number;
    }
  | { tipo: 'encerrado'; motivo: string }
  | { tipo: 'erro'; mensagem: string };

export type Banner = {
  projeto: string;
  pipeline: {
    id: number;
    ref: string;
    criadoEm: string;
    haMinutos: number;
    job: { id: number; nome: string };
    commit: { sha: string; titulo: string };
  } | null;
};

export type ItemHistorico = {
  id: string;
  titulo: string;
  criadoEm: string;
  status: string;
  custoUsd: number | null;
};

// The proposal of a past investigation: its last abrir_mr with a valid input. mr is
// set when that proposal opened a merge request, and statusPipeline is the status of
// the merge request's pipeline as the session recorded it.
export type PropostaHistorico = {
  tentativa: number;
  titulo: string;
  causa: string;
  arquivos: string[];
  mr: { iid: number; url: string; statusPipeline: string } | null;
};

export type IniciarResposta = { id: string; iniciadoEm: string };
