import { createDeckPingAction } from './deckPing';

describe('createDeckPingAction', () => {
  it('should create an action with correct ID', () => {
    const action = createDeckPingAction();
    expect(action.id).toBe('veecode:kong:deck:ping');
  });

  it('should have the correct description', () => {
    const action = createDeckPingAction();
    expect(action.description).toBe('Tests connectivity to Kong Gateway control plane using deck gateway ping');
  });

  it('should define input schema', () => {
    const action = createDeckPingAction();
    expect(action.schema?.input).toBeDefined();
  });

  it('should define output schema', () => {
    const action = createDeckPingAction();
    expect(action.schema?.output).toBeDefined();
  });
});
