import { DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import type {
  BackstageCredentials,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { mockCredentials } from '@backstage/backend-test-utils';
import type { AppSecretsDependencies } from '../dependencies';
import {
  exampleAppRef,
  exampleComponent,
  exampleUserRef,
  fakeWorld,
} from '../fixtures';
import type { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { registerListAppSecretsAction } from './listAppSecrets';

const exampleCredentials = () => mockCredentials.user(exampleUserRef);

const mockStsSend = jest.fn();
const mockSecretsSend = jest.fn();

jest.mock('@aws-sdk/client-sts', () => ({
  ...jest.requireActual('@aws-sdk/client-sts'),
  STSClient: jest.fn(() => ({ send: mockStsSend })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  ...jest.requireActual('@aws-sdk/client-secrets-manager'),
  SecretsManagerClient: jest.fn(() => ({ send: mockSecretsSend })),
}));

const devDeclarationUrl =
  'https://git.example.com/example-org/example-app/blob/main/apps/example-component/config/dev.yaml';
const stagingDeclarationUrl =
  'https://git.example.com/example-org/example-app/blob/main/apps/example-component/config/staging.yaml';
const exampleCredentialsResponse = {
  Credentials: {
    AccessKeyId: 'example-access-key-id',
    SecretAccessKey: 'example-secret-access-key',
    SessionToken: 'example-session-token',
    Expiration: new Date('2030-01-01T00:00:00Z'),
  },
};

function awsError(name: string): Error {
  return Object.assign(new Error(`example ${name}`), { name });
}

/** Secret metadata by path. A path missing from the map does not exist. */
function secretsByPath(metadata: Record<string, object>) {
  mockSecretsSend.mockImplementation(async command => {
    const path = (command as DescribeSecretCommand).input.SecretId as string;
    if (!(path in metadata)) {
      throw awsError('ResourceNotFoundException');
    }
    return metadata[path];
  });
}

const devPath = (name: string) =>
  `/example-cluster/apps/example-app/dev/${name}`;
const stagingPath = (name: string) =>
  `/example-cluster/apps/example-app/staging/${name}`;

const logger = { warn: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockStsSend.mockReset();
  mockSecretsSend.mockReset();
  mockStsSend.mockResolvedValue(exampleCredentialsResponse);
});

function registeredOptions(deps: AppSecretsDependencies) {
  const register = jest.fn();
  registerListAppSecretsAction(
    { register } as unknown as ActionsRegistryService,
    deps,
  );
  return register.mock.calls[0][0];
}

async function list(
  deps: AppSecretsDependencies,
  options: { app?: string; credentials?: BackstageCredentials } = {},
) {
  return registeredOptions(deps).action({
    input: { app: options.app ?? exampleAppRef },
    credentials: options.credentials ?? exampleCredentials(),
    logger: logger as unknown as LoggerService,
  });
}

async function failureOf(pending: Promise<unknown>): Promise<Error> {
  const outcome = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(outcome instanceof Error)) {
    throw new Error('expected the action to fail');
  }
  return outcome;
}

function fakeWorldWithTwoEnvironments() {
  return fakeWorld({
    components: [exampleComponent('example-component')],
    files: {
      [devDeclarationUrl]: 'secrets:\n  - DATABASE_PASSWORD\n  - API_TOKEN\n',
      [stagingDeclarationUrl]: 'secrets:\n  - DATABASE_PASSWORD\n',
    },
  });
}

describe('list-app-secrets', () => {
  it('reports, for each configured environment, each declared name with whether it has a value and when it last changed', async () => {
    secretsByPath({
      [devPath('DATABASE_PASSWORD')]: {
        LastChangedDate: new Date('2026-10-01T08:00:00.000Z'),
      },
    });
    const world = fakeWorldWithTwoEnvironments();

    const result = await list(world.deps);

    expect(result).toEqual({
      output: {
        environments: {
          dev: {
            API_TOKEN: { hasValue: false },
            DATABASE_PASSWORD: {
              hasValue: true,
              lastChangedDate: '2026-10-01T08:00:00.000Z',
            },
          },
          staging: {
            DATABASE_PASSWORD: { hasValue: false },
          },
        },
      },
    });
  });

  it('asks Secrets Manager only for metadata of each declared path', async () => {
    secretsByPath({});
    const world = fakeWorldWithTwoEnvironments();

    await list(world.deps);

    const commands = mockSecretsSend.mock.calls.map(([command]) => command);
    expect(commands.length).toBeGreaterThan(0);
    expect(
      commands.every(command => command instanceof DescribeSecretCommand),
    ).toBe(true);
    expect(commands.map(command => command.input.SecretId)).toEqual(
      expect.arrayContaining([
        devPath('API_TOKEN'),
        stagingPath('DATABASE_PASSWORD'),
      ]),
    );
  });

  it('counts a secret scheduled for deletion as having no value', async () => {
    secretsByPath({
      [devPath('DATABASE_PASSWORD')]: {
        DeletedDate: new Date('2026-10-20T00:00:00.000Z'),
        LastChangedDate: new Date('2026-10-01T08:00:00.000Z'),
      },
    });
    const world = fakeWorldWithTwoEnvironments();

    const result = await list(world.deps);

    expect(result.output.environments.dev.DATABASE_PASSWORD).toEqual({
      hasValue: false,
    });
  });

  it('does not describe a declared name the register action would refuse, and says so in the log', async () => {
    secretsByPath({});
    const world = fakeWorld({
      components: [exampleComponent('example-component')],
      files: {
        [devDeclarationUrl]: 'secrets:\n  - PORT\n  - database-password\n',
        [stagingDeclarationUrl]: 'secrets: []\n',
      },
    });

    const result = await list(world.deps);

    expect(result.output.environments.dev).toEqual({});
    expect(mockSecretsSend).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'skipped the declared name "PORT" of system:default/example-app: name "PORT" is reserved for the platform',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped the declared name "database-password"'),
    );
  });

  it('reads through the writer role with the list session name and the user as source identity', async () => {
    secretsByPath({});
    const world = fakeWorldWithTwoEnvironments();

    await list(world.deps);

    const assume = mockStsSend.mock.calls[0][0];
    expect(assume).toBeInstanceOf(AssumeRoleCommand);
    expect(assume.input).toEqual({
      RoleArn: 'arn:aws:iam::123456789012:role/example-secret-writer',
      RoleSessionName: 'list-app-secrets',
      SourceIdentity: 'example.user',
    });
  });

  it('refuses an app the user does not own, before any AWS call', async () => {
    const world = fakeWorld({
      ownershipRefs: ['group:default/other-team'],
      components: [exampleComponent('example-component')],
      files: { [devDeclarationUrl]: 'secrets: [API_TOKEN]\n' },
    });

    const error = await failureOf(list(world.deps));

    expect(error.message).toBe(
      `the user does not own System "system:default/example-app"`,
    );
    expect(world.catalog.getEntityByRef).toHaveBeenCalledWith(exampleAppRef, {
      credentials: expect.anything(),
    });
    expect(mockStsSend).not.toHaveBeenCalled();
    expect(mockSecretsSend).not.toHaveBeenCalled();
  });

  it('refuses a caller that is not a user', async () => {
    const world = fakeWorldWithTwoEnvironments();

    const error = await failureOf(
      list(world.deps, { credentials: mockCredentials.service() }),
    );

    expect(error.message).toBe(
      'only a signed-in user can work with app secrets',
    );
    expect(mockStsSend).not.toHaveBeenCalled();
  });

  it('is registered as a read-only, idempotent action', () => {
    const options = registeredOptions(fakeWorld().deps);

    expect(options.name).toBe('list-app-secrets');
    expect(options.attributes).toEqual({ readOnly: true, idempotent: true });
  });
});
