import { createDeckGenerateAction } from './deckGenerate';
import { ConfigReader } from '@backstage/config';

describe('createDeckGenerateAction', () => {
  const mockConfig = new ConfigReader({});

  it('should create an action with correct ID', () => {
    const action = createDeckGenerateAction({ config: mockConfig });
    expect(action.id).toBe('veecode:kong:deck:generate');
  });

  it('should have the correct description', () => {
    const action = createDeckGenerateAction({ config: mockConfig });
    expect(action.description).toBe('Generates a Kong YAML configuration from an OpenAPI specification using deck');
  });

  it('should define required input schema', () => {
    const action = createDeckGenerateAction({ config: mockConfig });
    expect(action.schema?.input).toBeDefined();
  });

  it('should define output schema', () => {
    const action = createDeckGenerateAction({ config: mockConfig });
    expect(action.schema?.output).toBeDefined();
  });
});
