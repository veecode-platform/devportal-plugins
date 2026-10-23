import type Anthropic from '@anthropic-ai/sdk';
import { NotFoundError } from '@anthropic-ai/sdk';
import { ErroNaoEncontrado } from '../erros';
import { AnthropicRuntime } from './real';

// The SDK client is mocked at the seam the adapter uses: beta.sessions.*.
function clienteFalso(
  sessoes: unknown[] = [],
  eventos: unknown[] = [],
  falhaAoRecuperar?: unknown,
) {
  const send = jest.fn(async () => ({}));
  const create = jest.fn(async () => ({ id: 'sesn_real_1' }));
  const stream = jest.fn(async () => ({
    controller: { abort: jest.fn() },
    [Symbol.asyncIterator]: async function* vazio() {},
  }));
  const list = jest.fn(() => ({
    [Symbol.asyncIterator]: async function* sessoesDaFila() {
      for (const s of sessoes) yield s;
    },
  }));
  const retrieve = jest.fn(async () => {
    if (falhaAoRecuperar) throw falhaAoRecuperar;
    return {
      id: 'sesn_real_1',
      status: 'idle',
      title: 't',
      created_at: 'c',
      metadata: {},
      usage: {},
    };
  });
  const listarEventos = jest.fn(() => ({
    [Symbol.asyncIterator]: async function* eventosDaFila() {
      for (const e of eventos) yield e;
    },
  }));
  let enviados = 0;
  const upload = jest.fn(async (_params: unknown) => ({
    id: `file_${++enviados}`,
  }));
  const cliente = {
    beta: {
      files: { upload },
      sessions: {
        create,
        retrieve,
        list,
        events: { send, stream, list: listarEventos },
      },
    },
  };
  return {
    cliente: cliente as unknown as Anthropic,
    create,
    send,
    stream,
    list,
    listarEventos,
    upload,
  };
}

describe('AnthropicRuntime (mocked SDK client)', () => {
  it('creates a session with the agent, environment, metadata and title it was given', async () => {
    const { cliente, create } = clienteFalso();
    const id = await new AnthropicRuntime(cliente).createSession({
      agentId: 'agent_x',
      environmentId: 'env_x',
      metadata: { app: 'pipeline-agent', projeto: 'veecode-demos/pedidos-api' },
      title: 'Pipeline 9001 · job test',
      arquivos: [],
    });
    expect(id).toBe('sesn_real_1');
    expect(create).toHaveBeenCalledWith({
      agent: 'agent_x',
      environment_id: 'env_x',
      metadata: { app: 'pipeline-agent', projeto: 'veecode-demos/pedidos-api' },
      title: 'Pipeline 9001 · job test',
      resources: [],
    });
  });

  it('uploads each file with the managed-agents beta and mounts it in the session', async () => {
    const { cliente, create, upload } = clienteFalso();
    await new AnthropicRuntime(cliente).createSession({
      agentId: 'agent_x',
      environmentId: 'env_x',
      metadata: {},
      title: 't',
      arquivos: [
        {
          nome: 'trace.log',
          tipo: 'text/plain',
          conteudo: new TextEncoder().encode('$ mvn -B test'),
          caminho: '/pipeline/trace.log',
        },
        {
          nome: 'repo.tar.gz',
          tipo: 'application/gzip',
          conteudo: new Uint8Array([0x1f, 0x8b]),
          caminho: '/pipeline/repo.tar.gz',
        },
      ],
    });
    expect(upload).toHaveBeenCalledTimes(2);
    const primeiro = upload.mock.calls[0][0] as unknown as {
      file: File;
      betas: string[];
    };
    expect(primeiro.betas).toEqual(['managed-agents-2026-04-01']);
    expect(primeiro.file.name).toBe('trace.log');
    expect(await primeiro.file.text()).toBe('$ mvn -B test');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: [
          {
            type: 'file',
            file_id: 'file_1',
            mount_path: '/pipeline/trace.log',
          },
          {
            type: 'file',
            file_id: 'file_2',
            mount_path: '/pipeline/repo.tar.gz',
          },
        ],
      }),
    );
  });

  it('sends user events in the events.send shape', async () => {
    const { cliente, send } = clienteFalso();
    await new AnthropicRuntime(cliente).enviar('sesn_real_1', [
      { type: 'user.interrupt' },
    ]);
    expect(send).toHaveBeenCalledWith('sesn_real_1', {
      events: [{ type: 'user.interrupt' }],
    });
  });

  it('lists only the sessions of the project it was asked for', async () => {
    const sessoes = [
      {
        id: 'a',
        status: 'idle',
        title: 'A',
        created_at: 'c1',
        metadata: { projeto: 'veecode-demos/pedidos-api' },
        usage: {},
      },
      {
        id: 'b',
        status: 'idle',
        title: 'B',
        created_at: 'c2',
        metadata: { projeto: 'interno/outro' },
        usage: {},
      },
    ];
    const { cliente, list } = clienteFalso(sessoes);
    const itens = await new AnthropicRuntime(cliente).listarSessoes(
      'agent_x',
      'veecode-demos/pedidos-api',
    );
    expect(list).toHaveBeenCalledWith({
      agent_id: 'agent_x',
      order: 'desc',
      limit: 50,
    });
    expect(itens.map(s => s.id)).toEqual(['a']);
  });

  it('lists the events of a session in order, asking the API only for the types it names', async () => {
    const eventos = [
      { id: 'toolu_1', type: 'agent.custom_tool_use', name: 'abrir_mr' },
      {
        id: 'evt_2',
        type: 'user.custom_tool_result',
        custom_tool_use_id: 'toolu_1',
      },
    ];
    const { cliente, listarEventos } = clienteFalso([], eventos);
    const tipos = ['agent.custom_tool_use', 'user.custom_tool_result'];

    const itens = await new AnthropicRuntime(cliente).listarEventos(
      'sesn_real_1',
      tipos,
    );

    expect(listarEventos).toHaveBeenCalledWith('sesn_real_1', {
      order: 'asc',
      types: tipos,
    });
    expect(itens).toEqual(eventos);
  });

  it('answers the domain not-found for a session the API does not know', async () => {
    const { cliente } = clienteFalso(
      [],
      [],
      new NotFoundError(404, undefined, 'not found', new Headers()),
    );

    await expect(
      new AnthropicRuntime(cliente).obterSessao('sesn_nao_existe'),
    ).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });

  it('lets any other failure of the session lookup through unchanged', async () => {
    const falha = new Error('rede indisponível');
    const { cliente } = clienteFalso([], [], falha);

    await expect(
      new AnthropicRuntime(cliente).obterSessao('sesn_real_1'),
    ).rejects.toBe(falha);
  });
});
