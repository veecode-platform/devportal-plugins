import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicRuntime } from './real';

// The SDK client is mocked at the seam the adapter uses: beta.sessions.*.
function clienteFalso(sessoes: unknown[] = []) {
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
  const retrieve = jest.fn(async () => ({
    id: 'sesn_real_1',
    status: 'idle',
    title: 't',
    created_at: 'c',
    metadata: {},
    usage: {},
  }));
  const cliente = {
    beta: { sessions: { create, retrieve, list, events: { send, stream } } },
  };
  return {
    cliente: cliente as unknown as Anthropic,
    create,
    send,
    stream,
    list,
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
    });
    expect(id).toBe('sesn_real_1');
    expect(create).toHaveBeenCalledWith({
      agent: 'agent_x',
      environment_id: 'env_x',
      metadata: { app: 'pipeline-agent', projeto: 'veecode-demos/pedidos-api' },
      title: 'Pipeline 9001 · job test',
    });
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
});
