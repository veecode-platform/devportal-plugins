import { createApiRef } from '@backstage/core-plugin-api';
import type {
  Banner,
  DetalheHistorico,
  Fase,
  IniciarResposta,
  ItemHistorico,
  UiEvent,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';

// The frontend's view of the backend contract. The dev shell registers a fake
// implementation of this same interface.
export interface PipelineAgentApi {
  banner(entityRef: string): Promise<Banner>;
  historico(entityRef: string): Promise<ItemHistorico[]>;
  // id is the session id of an item from historico.
  detalheHistorico(entityRef: string, id: string): Promise<DetalheHistorico>;
  iniciar(entityRef: string): Promise<IniciarResposta>;
  // Calls aoEvento for every event of the investigation, replaying from the
  // start. Resolves when the investigation ends or the signal aborts.
  acompanhar(
    id: string,
    aoEvento: (evento: UiEvent) => void,
    sinal: AbortSignal,
  ): Promise<void>;
  aprovar(id: string, toolUseId: string): Promise<Fase>;
  recusar(id: string, toolUseId: string, motivo: string): Promise<Fase>;
  orientar(id: string, toolUseId: string, texto: string): Promise<Fase>;
}

export const pipelineAgentApiRef = createApiRef<PipelineAgentApi>({
  id: 'plugin.pipeline-agent.service',
});
