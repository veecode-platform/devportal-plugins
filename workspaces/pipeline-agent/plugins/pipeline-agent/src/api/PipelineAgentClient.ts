import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  PIPELINE_AGENT_EVENTS_CONTENT_TYPE,
  PIPELINE_AGENT_PLUGIN_ID,
  PIPELINE_AGENT_ROUTES,
  type AprovarCorpo,
  type Banner,
  type DetalheHistorico,
  type Fase,
  type FaseResposta,
  type HistoricoResposta,
  type IniciarCorpo,
  type IniciarResposta,
  type ItemHistorico,
  type OrientarCorpo,
  type RecusarCorpo,
  type UiEvent,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { acompanharFluxo } from './fluxo';
import { pedacosDoCorpo } from './corpo';
import { erroDaResposta, erroDeRede } from './erros';
import type { PipelineAgentApi } from './PipelineAgentApi';

type Dependencias = { discoveryApi: DiscoveryApi; fetchApi: FetchApi };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const rota = (modelo: string, id: string) =>
  modelo.replace(':id', encodeURIComponent(id));

// Calls the plugin's backend through fetchApi, which adds the user's token.
// Every non-2xx answer becomes a PipelineAgentError with a pt-BR message.
export class PipelineAgentClient implements PipelineAgentApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor({ discoveryApi, fetchApi }: Dependencias) {
    this.discoveryApi = discoveryApi;
    this.fetchApi = fetchApi;
  }

  private async pedir(
    caminho: string,
    init: RequestInit = {},
    query: Record<string, string> = {},
  ): Promise<Response> {
    const base = await this.discoveryApi.getBaseUrl(PIPELINE_AGENT_PLUGIN_ID);
    const busca = new URLSearchParams(query).toString();
    const url = `${base}${caminho}${busca ? `?${busca}` : ''}`;

    let resposta: Response;
    try {
      resposta = await this.fetchApi.fetch(url, init);
    } catch {
      throw erroDeRede();
    }
    if (!resposta.ok) throw await erroDaResposta(resposta);
    return resposta;
  }

  private async pedirJson<T>(
    caminho: string,
    init: RequestInit = {},
    query: Record<string, string> = {},
  ): Promise<T> {
    const resposta = await this.pedir(caminho, init, query);
    return (await resposta.json()) as T;
  }

  private postar<T>(caminho: string, corpo: unknown): Promise<T> {
    return this.pedirJson<T>(caminho, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(corpo),
    });
  }

  banner(entityRef: string): Promise<Banner> {
    return this.pedirJson<Banner>(
      PIPELINE_AGENT_ROUTES.project,
      {},
      { entityRef },
    );
  }

  async historico(entityRef: string): Promise<ItemHistorico[]> {
    const { itens } = await this.pedirJson<HistoricoResposta>(
      PIPELINE_AGENT_ROUTES.history,
      {},
      { entityRef },
    );
    return itens;
  }

  detalheHistorico(entityRef: string, id: string): Promise<DetalheHistorico> {
    return this.pedirJson<DetalheHistorico>(
      rota(PIPELINE_AGENT_ROUTES.historyItem, id),
      {},
      { entityRef },
    );
  }

  iniciar(entityRef: string): Promise<IniciarResposta> {
    const corpo: IniciarCorpo = { entityRef };
    return this.postar<IniciarResposta>(
      PIPELINE_AGENT_ROUTES.investigations,
      corpo,
    );
  }

  acompanhar(
    id: string,
    aoEvento: (evento: UiEvent) => void,
    sinal: AbortSignal,
  ): Promise<void> {
    // EventSource cannot send the Authorization header, so the stream is read
    // from a fetch body. Each frame's id is the event's index in the log.
    return acompanharFluxo({
      abrir: async (ultimoId, sinalDoFluxo) => {
        const resposta = await this.pedir(
          rota(PIPELINE_AGENT_ROUTES.investigationEvents, id),
          {
            headers: {
              Accept: PIPELINE_AGENT_EVENTS_CONTENT_TYPE,
              ...(ultimoId === undefined ? {} : { 'Last-Event-ID': ultimoId }),
            },
            signal: sinalDoFluxo,
          },
        );
        return pedacosDoCorpo(resposta);
      },
      aoQuadro: quadro => {
        const evento = JSON.parse(quadro.data) as UiEvent;
        aoEvento(evento);
        return evento.tipo === 'encerrado';
      },
      sinal,
    });
  }

  async aprovar(id: string, toolUseId: string): Promise<Fase> {
    const corpo: AprovarCorpo = { toolUseId };
    const { fase } = await this.postar<FaseResposta>(
      rota(PIPELINE_AGENT_ROUTES.aprovar, id),
      corpo,
    );
    return fase;
  }

  async recusar(id: string, toolUseId: string, motivo: string): Promise<Fase> {
    const corpo: RecusarCorpo = { toolUseId, motivo };
    const { fase } = await this.postar<FaseResposta>(
      rota(PIPELINE_AGENT_ROUTES.recusar, id),
      corpo,
    );
    return fase;
  }

  async orientar(id: string, toolUseId: string, texto: string): Promise<Fase> {
    const corpo: OrientarCorpo = { toolUseId, texto };
    const { fase } = await this.postar<FaseResposta>(
      rota(PIPELINE_AGENT_ROUTES.orientar, id),
      corpo,
    );
    return fase;
  }
}
