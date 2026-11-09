/**
 * @jest-environment node
 */
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { UiEvent } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { PipelineAgentError } from './erros';
import { PipelineAgentClient } from './PipelineAgentClient';

// The stream tests need a real ReadableStream and TextDecoder, so they run in
// the node environment, not in jsdom.

const BASE = 'http://portal.test/api/pipeline-agent';

function corpoDe(
  ...pedacos: (string | Uint8Array)[]
): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controlador) {
      for (const pedaco of pedacos) {
        controlador.enqueue(
          typeof pedaco === 'string' ? codificador.encode(pedaco) : pedaco,
        );
      }
      controlador.close();
    },
  });
}

function respostaStream(body: ReadableStream<Uint8Array>) {
  return { ok: true, status: 200, body } as unknown as Response;
}

function criarCliente(fetch: jest.Mock) {
  const discoveryApi = {
    getBaseUrl: jest.fn(async () => BASE),
  } as unknown as DiscoveryApi;
  const fetchApi = { fetch } as unknown as FetchApi;
  return new PipelineAgentClient({ discoveryApi, fetchApi });
}

describe('PipelineAgentClient.acompanhar', () => {
  it('replays the events in order and resolves when the investigation ends', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(
        respostaStream(
          corpoDe(
            'id: 0\ndata: {"tipo":"fase","fase":"investigando"}\n\n',
            ': ping\n\n',
            'id: 1\ndata: {"tipo":"passo","id":"p1","texto":"Vou ver o log."}\n\n',
            'id: 2\ndata: {"tipo":"encerrado","motivo":"agente encerrou o turno"}\n\n',
          ),
        ),
      );
    const recebidos: UiEvent[] = [];

    await criarCliente(fetch).acompanhar(
      'inv-1',
      evento => recebidos.push(evento),
      new AbortController().signal,
    );

    expect(recebidos.map(e => e.tipo)).toEqual(['fase', 'passo', 'encerrado']);
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/investigations/inv-1/events`,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
      }),
    );
  });

  it('decodes a multi-byte character split across two chunks', async () => {
    const bytes = new TextEncoder().encode(
      'id: 0\ndata: {"tipo":"passo","id":"p","texto":"ação"}\n\n',
    );
    const corte = bytes.indexOf(0xc3) + 1;
    const fetch = jest
      .fn()
      .mockResolvedValue(
        respostaStream(
          corpoDe(
            bytes.slice(0, corte),
            bytes.slice(corte),
            'id: 1\ndata: {"tipo":"encerrado","motivo":"ok"}\n\n',
          ),
        ),
      );
    const textos: string[] = [];

    await criarCliente(fetch).acompanhar(
      'inv-1',
      evento => {
        if (evento.tipo === 'passo') textos.push(evento.texto);
      },
      new AbortController().signal,
    );

    expect(textos).toEqual(['ação']);
  });

  it('reconnects with Last-Event-ID after the stream drops', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        respostaStream(
          corpoDe('id: 0\ndata: {"tipo":"fase","fase":"investigando"}\n\n'),
        ),
      )
      .mockResolvedValueOnce(
        respostaStream(
          corpoDe('id: 1\ndata: {"tipo":"encerrado","motivo":"fim"}\n\n'),
        ),
      );
    const recebidos: string[] = [];

    await criarCliente(fetch).acompanhar(
      'inv-1',
      evento => recebidos.push(evento.tipo),
      new AbortController().signal,
    );

    expect(recebidos).toEqual(['fase', 'encerrado']);
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Last-Event-ID');
    expect(fetch.mock.calls[1][1].headers).toHaveProperty('Last-Event-ID', '0');
  });

  it('rejects with the backend message when the stream cannot be opened', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ erro: 'investigação desconhecida' }),
    });

    await expect(
      criarCliente(fetch).acompanhar(
        'inv-x',
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(PipelineAgentError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
