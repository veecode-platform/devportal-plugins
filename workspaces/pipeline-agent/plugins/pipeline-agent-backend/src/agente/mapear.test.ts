import type { SdkEvent } from './types';
import { mapSessionEvent, resumoComando } from './mapear';

describe('mapSessionEvent', () => {
  it('turns a bash tool use into a command step with a short summary', () => {
    const evento = {
      id: 'toolu_1',
      type: 'agent.tool_use',
      name: 'bash',
      input: { command: 'mvn -B test -Dtest=DescontoServiceTest' },
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(evento)).toEqual([
      {
        tipo: 'ui',
        evento: {
          tipo: 'comando',
          id: 'toolu_1',
          resumo: 'Rodou o teste Maven no sandbox',
          comando: 'mvn -B test -Dtest=DescontoServiceTest',
        },
      },
    ]);
  });

  it('asks for an answer on a custom tool use and on an idle session with requires_action', () => {
    const ferramenta = {
      id: 'toolu_mr',
      type: 'agent.custom_tool_use',
      name: 'abrir_mr',
      input: {},
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(ferramenta)).toEqual([
      {
        tipo: 'pedido_ferramenta',
        toolUseId: 'toolu_mr',
        nome: 'abrir_mr',
        entrada: {},
      },
    ]);
    const ocioso = {
      id: 'evt_1',
      type: 'session.status_idle',
      stop_reason: { type: 'requires_action', event_ids: ['toolu_mr'] },
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(ocioso)).toEqual([
      { tipo: 'ocioso', motivo: 'requires_action', eventIds: ['toolu_mr'] },
    ]);
  });

  it('shows an empty agent message as nothing', () => {
    const vazio = {
      id: 'evt_2',
      type: 'agent.message',
      content: [{ type: 'text', text: '   ' }],
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(vazio)).toEqual([]);
  });
});

describe('resumoComando', () => {
  it('cuts a long unknown command to 80 characters', () => {
    const longo = 'x'.repeat(120);
    expect(resumoComando(longo)).toHaveLength(80);
    expect(resumoComando(longo).endsWith('...')).toBe(true);
  });
});
