import { createDeckPingAction } from './deckPing';
import { ConfigReader } from '@backstage/config';
import { resolveKongInstance } from './kongConfig';

describe('createDeckPingAction', () => {
  const mockConfig = new ConfigReader({});

  it('should create an action with correct ID', () => {
    const action = createDeckPingAction({ config: mockConfig });
    expect(action.id).toBe('veecode:kong:deck:ping');
  });

  it('should have the correct description', () => {
    const action = createDeckPingAction({ config: mockConfig });
    expect(action.description).toBe('Tests connectivity to Kong Gateway control plane using deck gateway ping');
  });

  it('should define input schema', () => {
    const action = createDeckPingAction({ config: mockConfig });
    expect(action.schema?.input).toBeDefined();
  });

  it('should define output schema', () => {
    const action = createDeckPingAction({ config: mockConfig });
    expect(action.schema?.output).toBeDefined();
  });
});

describe('resolveKongInstance (ping context)', () => {
  it('should resolve a valid kong instance with kongAdmin auth', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'staging',
            apiBaseUrl: 'http://kong-staging:8001',
            workspace: 'staging-ws',
            auth: { kongAdmin: 'staging-token' },
          },
        ],
      },
    });

    const result = resolveKongInstance(config, 'staging');
    expect(result.kongAddr).toBe('http://kong-staging:8001/staging-ws');
    expect(result.headers).toBe('Kong-Admin-Token:staging-token');
  });

  it('should return empty headers when no auth is configured', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'noauth',
            apiBaseUrl: 'http://kong:8001',
          },
        ],
      },
    });

    const result = resolveKongInstance(config, 'noauth');
    expect(result.kongAddr).toBe('http://kong:8001');
    expect(result.headers).toBe('');
  });

  it('should throw for missing instance', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          { id: 'existing', apiBaseUrl: 'http://kong:8001' },
        ],
      },
    });

    expect(() => resolveKongInstance(config, 'nonexistent')).toThrow(
      "Kong instance 'nonexistent' not found in kong.instances config",
    );
  });
});
