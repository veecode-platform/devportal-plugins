import { createDeckSyncAction } from './deckSync';

describe('createDeckSyncAction', () => {
  it('should create an action with correct ID', () => {
    const action = createDeckSyncAction();
    expect(action.id).toBe('veecode:kong:deck:sync');
  });

  it('should have the correct description', () => {
    const action = createDeckSyncAction();
    expect(action.description).toBe('Syncs a Kong YAML configuration to Kong Gateway using deck');
  });

  it('should define required input schema', () => {
    const action = createDeckSyncAction();
    expect(action.schema?.input).toBeDefined();
  });

  it('should define output schema', () => {
    const action = createDeckSyncAction();
    expect(action.schema?.output).toBeDefined();
  });
});
