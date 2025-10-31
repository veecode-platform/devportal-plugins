import { createDeckGenerateAction } from './deckGenerate';

describe('createDeckGenerateAction', () => {
  it('should create an action with correct ID', () => {
    const action = createDeckGenerateAction();
    expect(action.id).toBe('veecode:kong:deck:generate');
  });

  it('should have the correct description', () => {
    const action = createDeckGenerateAction();
    expect(action.description).toBe('Generates a Kong YAML configuration from an OpenAPI specification using deck');
  });

  it('should define required input schema', () => {
    const action = createDeckGenerateAction();
    expect(action.schema?.input).toBeDefined();
  });

  it('should define output schema', () => {
    const action = createDeckGenerateAction();
    expect(action.schema?.output).toBeDefined();
  });
});
