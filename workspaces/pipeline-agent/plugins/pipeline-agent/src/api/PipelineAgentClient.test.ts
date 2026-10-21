import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  MENSAGEM_NAO_CONFIGURADO,
  MENSAGEM_SEM_PERMISSAO,
  PipelineAgentError,
} from './erros';
import { PipelineAgentClient } from './PipelineAgentClient';

const BASE = 'http://portal.test/api/pipeline-agent';

function respostaJson(status: number, corpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

function criarCliente(fetch: jest.Mock) {
  const discoveryApi = {
    getBaseUrl: jest.fn(async () => BASE),
  } as unknown as DiscoveryApi;
  const fetchApi = { fetch } as unknown as FetchApi;
  return new PipelineAgentClient({ discoveryApi, fetchApi });
}

describe('PipelineAgentClient', () => {
  it('starts an investigation by posting the entity reference', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(
        respostaJson(201, { id: 'inv-1', iniciadoEm: '2026-10-21T12:00:00Z' }),
      );

    const resultado = await criarCliente(fetch).iniciar(
      'component:default/pedidos-api',
    );

    expect(resultado).toEqual({
      id: 'inv-1',
      iniciadoEm: '2026-10-21T12:00:00Z',
    });
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/investigations`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ entityRef: 'component:default/pedidos-api' }),
      }),
    );
  });

  it('sends the entity reference as a query parameter, encoded, and never a project', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(respostaJson(200, { projeto: 'x', pipeline: null }));

    await criarCliente(fetch).banner('component:default/pedidos-api');

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/project?entityRef=component%3Adefault%2Fpedidos-api`,
      expect.anything(),
    );
  });

  it('returns the history items from the history answer', async () => {
    const item = {
      id: 'inv-0',
      titulo: 'Pipeline 8842',
      criadoEm: '2026-10-19T12:00:00Z',
      status: 'idle',
      custoUsd: 0.19,
    };
    const fetch = jest
      .fn()
      .mockResolvedValue(respostaJson(200, { itens: [item] }));

    const itens = await criarCliente(fetch).historico('component:default/x');

    expect(itens).toEqual([item]);
  });

  it('sends the toolUseId with an approval and returns the new phase', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(respostaJson(200, { fase: 'abrindo_mr' }));

    const fase = await criarCliente(fetch).aprovar('inv-1', 'toolu_9');

    expect(fase).toBe('abrindo_mr');
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/investigations/inv-1/aprovar`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ toolUseId: 'toolu_9' }),
      }),
    );
  });

  it('sends the reason with a refusal and the text with guidance', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(respostaJson(200, { fase: 'encerrado' }));
    const cliente = criarCliente(fetch);

    await cliente.recusar('inv-1', 'toolu_9', 'Muda o contrato');
    await cliente.orientar('inv-1', 'toolu_9', 'Olhe o teste');

    expect(fetch.mock.calls[0][1].body).toBe(
      JSON.stringify({ toolUseId: 'toolu_9', motivo: 'Muda o contrato' }),
    );
    expect(fetch.mock.calls[1][1].body).toBe(
      JSON.stringify({ toolUseId: 'toolu_9', texto: 'Olhe o teste' }),
    );
  });

  it('turns a 403 into the permission message', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(respostaJson(403, { erro: 'forbidden' }));

    await expect(
      criarCliente(fetch).aprovar('inv-1', 'toolu_9'),
    ).rejects.toMatchObject({
      status: 403,
      message: MENSAGEM_SEM_PERMISSAO,
    });
  });

  it('turns a 503 into the calm not-configured message and keeps the backend detail', async () => {
    const fetch = jest.fn().mockResolvedValue(
      respostaJson(503, {
        erro: 'não configurado: pipelineAgent.anthropic.apiKey',
      }),
    );

    const erro = await criarCliente(fetch)
      .iniciar('component:default/x')
      .catch(e => e);

    expect(erro).toBeInstanceOf(PipelineAgentError);
    expect(erro.message).toBe(MENSAGEM_NAO_CONFIGURADO);
    expect(erro.detalhe).toBe(
      'não configurado: pipelineAgent.anthropic.apiKey',
    );
  });

  it('reports a request that never reached the backend as a network error', async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      criarCliente(fetch).iniciar('component:default/x'),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('shows a readable message for an unknown status instead of the raw error text', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(respostaJson(418, { erro: 'teapot' }));

    await expect(
      criarCliente(fetch).iniciar('component:default/x'),
    ).rejects.toMatchObject({
      message: 'Falha ao falar com o agente (418).',
      detalhe: 'teapot',
    });
  });
});
