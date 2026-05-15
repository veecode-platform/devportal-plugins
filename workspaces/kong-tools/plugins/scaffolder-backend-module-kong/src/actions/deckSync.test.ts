import { createDeckSyncAction } from './deckSync';
import { ConfigReader } from '@backstage/config';
import { resolveKongInstance } from './kongConfig';

describe('createDeckSyncAction', () => {
  const mockConfig = new ConfigReader({});

  it('should create an action with correct ID', () => {
    const action = createDeckSyncAction({ config: mockConfig });
    expect(action.id).toBe('veecode:kong:deck:sync');
  });

  it('should have the correct description', () => {
    const action = createDeckSyncAction({ config: mockConfig });
    expect(action.description).toBe('Syncs a Kong YAML configuration to Kong Gateway using deck');
  });

  it('should define required input schema', () => {
    const action = createDeckSyncAction({ config: mockConfig });
    expect(action.schema?.input).toBeDefined();
  });

  it('should define output schema', () => {
    const action = createDeckSyncAction({ config: mockConfig });
    expect(action.schema?.output).toBeDefined();
  });
});

describe('resolveKongInstance (sync context)', () => {
  it('should resolve a valid kong instance with kongAdmin auth', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'development',
            apiBaseUrl: 'http://kong-admin:8001',
            workspace: 'default',
            auth: { kongAdmin: 'my-token' },
          },
        ],
      },
    });

    const result = resolveKongInstance(config, 'development');
    expect(result.kongAddr).toBe('http://kong-admin:8001/default');
    expect(result.headers).toBe('Kong-Admin-Token:my-token');
  });

  it('should resolve instance without workspace', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'prod',
            apiBaseUrl: 'http://kong:8001',
            auth: { kongAdmin: 'token' },
          },
        ],
      },
    });

    const result = resolveKongInstance(config, 'prod');
    expect(result.kongAddr).toBe('http://kong:8001');
  });

  it('should resolve instance with custom auth', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'custom',
            apiBaseUrl: 'http://kong:8001',
            auth: { custom: { header: 'X-Api-Key', value: 'secret' } },
          },
        ],
      },
    });

    const result = resolveKongInstance(config, 'custom');
    expect(result.headers).toBe('X-Api-Key:secret');
  });

  it('should throw for missing instance', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          { id: 'dev', apiBaseUrl: 'http://kong:8001' },
        ],
      },
    });

    expect(() => resolveKongInstance(config, 'missing')).toThrow(
      "Kong instance 'missing' not found in kong.instances config",
    );
  });

  it('should strip trailing slash from apiBaseUrl before appending workspace', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'slashed',
            apiBaseUrl: 'http://kong:8001/',
            workspace: 'ws',
          },
        ],
      },
    });

    const result = resolveKongInstance(config, 'slashed');
    expect(result.kongAddr).toBe('http://kong:8001/ws');
  });
});
