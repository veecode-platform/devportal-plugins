import type { UiEvent } from '@veecode-platform/backstage-plugin-pipeline-agent-common';

// The card's state is built from the investigation's event log. The reducer is
// pure: the same events always give the same view.

type EventoDo<T extends UiEvent['tipo']> = Extract<UiEvent, { tipo: T }>;
type SemTipo<T extends UiEvent['tipo']> = Omit<EventoDo<T>, 'tipo'>;

export type Passo =
  | { tipo: 'passo'; id: string; texto: string }
  | {
      tipo: 'comando';
      id: string;
      resumo: string;
      comando: string;
      saida: string | null;
    };

export type Diagnostico = SemTipo<'diagnostico'>;
export type PipelineMr = SemTipo<'pipeline_mr'>;
export type UsoSessao = SemTipo<'uso'>;
export type MrAberto = SemTipo<'mr_aberto'>;

export type Visao = {
  fase: EventoDo<'fase'>['fase'];
  passos: Passo[];
  diagnostico: Diagnostico | null;
  // The last diagnosis that became an MR. It stays on screen, collapsed.
  aprovado: Diagnostico | null;
  orientacoes: string[];
  recusa: string | null;
  mr: MrAberto | null;
  pipeline: PipelineMr | null;
  verdeSegundos: number | null;
  uso: UsoSessao | null;
  erro: string | null;
  encerrado: string | null;
};

export const VISAO_INICIAL: Visao = {
  fase: 'investigando',
  passos: [],
  diagnostico: null,
  aprovado: null,
  orientacoes: [],
  recusa: null,
  mr: null,
  pipeline: null,
  verdeSegundos: null,
  uso: null,
  erro: null,
  encerrado: null,
};

export function reduzir(visao: Visao, evento: UiEvent): Visao {
  switch (evento.tipo) {
    case 'fase':
      return { ...visao, fase: evento.fase };
    case 'passo':
      return {
        ...visao,
        passos: [
          ...visao.passos,
          { tipo: 'passo', id: evento.id, texto: evento.texto },
        ],
      };
    case 'comando':
      return {
        ...visao,
        passos: [
          ...visao.passos,
          {
            tipo: 'comando',
            id: evento.id,
            resumo: evento.resumo,
            comando: evento.comando,
            saida: null,
          },
        ],
      };
    case 'comando_saida':
      return {
        ...visao,
        passos: visao.passos.map(passo =>
          passo.tipo === 'comando' && passo.id === evento.id
            ? { ...passo, saida: evento.saida }
            : passo,
        ),
      };
    case 'diagnostico':
      return {
        ...visao,
        diagnostico: {
          ferramentaId: evento.ferramentaId,
          titulo: evento.titulo,
          causa: evento.causa,
          tentativa: evento.tentativa,
          arquivos: evento.arquivos,
        },
      };
    case 'orientacao':
      return {
        ...visao,
        diagnostico: null,
        orientacoes: [...visao.orientacoes, evento.texto],
      };
    case 'recusa':
      return { ...visao, diagnostico: null, recusa: evento.motivo };
    case 'mr_aberto':
      return {
        ...visao,
        diagnostico: null,
        aprovado: visao.diagnostico ?? visao.aprovado,
        mr: { iid: evento.iid, titulo: evento.titulo, url: evento.url },
        pipeline: null,
      };
    case 'pipeline_mr':
      return {
        ...visao,
        pipeline: {
          pipelineId: evento.pipelineId,
          status: evento.status,
          url: evento.url,
          jobs: evento.jobs,
          jobFalho: evento.jobFalho,
        },
      };
    case 'verde':
      return { ...visao, verdeSegundos: evento.segundos };
    case 'uso':
      return {
        ...visao,
        uso: {
          tokensEntrada: evento.tokensEntrada,
          tokensSaida: evento.tokensSaida,
          tokensCacheLeitura: evento.tokensCacheLeitura,
          tokensCacheEscrita: evento.tokensCacheEscrita,
          segundosAtivos: evento.segundosAtivos,
          custoUsd: evento.custoUsd,
        },
      };
    case 'encerrado':
      return { ...visao, encerrado: evento.motivo };
    case 'erro':
      return { ...visao, erro: evento.mensagem };
    default: {
      // An event the card does not know must fail loudly, not be dropped.
      const desconhecido: never = evento;
      throw new Error(`Evento sem tratamento: ${JSON.stringify(desconhecido)}`);
    }
  }
}
