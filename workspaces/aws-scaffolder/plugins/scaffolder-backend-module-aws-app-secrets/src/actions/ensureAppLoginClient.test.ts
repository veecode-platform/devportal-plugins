import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  ListUserPoolClientsCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  CreateSecretCommand,
  DescribeSecretCommand,
  SecretsManagerClient,
  type Tag,
} from '@aws-sdk/client-secrets-manager';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import { mockCredentials } from '@backstage/backend-test-utils';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import {
  exampleAppRef,
  exampleLoginSettings,
  exampleSettings,
  exampleSystem,
  exampleUserRef,
  fakeWorld,
} from '../fixtures';
import { createEnsureAppLoginClientAction } from './ensureAppLoginClient';

const exampleCredentials = () => mockCredentials.user(exampleUserRef);

const mockStsSend = jest.fn();
const mockSecretsSend = jest.fn();
const mockCognitoSend = jest.fn();

jest.mock('@aws-sdk/client-sts', () => ({
  ...jest.requireActual('@aws-sdk/client-sts'),
  STSClient: jest.fn(() => ({ send: mockStsSend })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  ...jest.requireActual('@aws-sdk/client-secrets-manager'),
  SecretsManagerClient: jest.fn(() => ({ send: mockSecretsSend })),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  ...jest.requireActual('@aws-sdk/client-cognito-identity-provider'),
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
}));

const exampleClientSecret = 'example-client-secret-7f3a9c';
const base64PlusAndSlashBytes = (size: number) => Buffer.alloc(size, 0xfb);
const exampleCookieSecret = `${'-_v7'.repeat(10)}-_s=`;
const exampleAdminScope = 'aws.cognito.signin.user.admin';
const examplePoolId = 'us-east-1_ExamplePool';
const exampleClientName = 'example-app.dev';
const exampleAppUrl = 'https://example-app.example.test';
const exampleCallbackUrl = `${exampleAppUrl}/oauth2/callback`;
const otherCallbackUrl = 'https://other.example.test/oauth2/callback';
const exampleNames = [
  'OAUTH2_PROXY_CLIENT_ID',
  'OAUTH2_PROXY_CLIENT_SECRET',
  'OAUTH2_PROXY_COOKIE_SECRET',
];
const examplePath = (name: string, environment = 'dev') =>
  `/example-cluster/apps/example-app/${environment}/${name}`;
const exampleInput = { app: exampleAppRef, environment: 'dev' };
const exampleClientInput = {
  UserPoolId: examplePoolId,
  ClientName: exampleClientName,
  GenerateSecret: true,
  AllowedOAuthFlows: ['code'],
  AllowedOAuthFlowsUserPoolClient: true,
  AllowedOAuthScopes: ['openid', 'email', 'profile'],
  SupportedIdentityProviders: ['Google'],
  ReadAttributes: ['email', 'email_verified'],
  WriteAttributes: ['email'],
  RefreshTokenValidity: 8,
  AccessTokenValidity: 60,
  IdTokenValidity: 60,
  TokenValidityUnits: {
    RefreshToken: 'hours',
    AccessToken: 'minutes',
    IdToken: 'minutes',
  },
  ExplicitAuthFlows: ['ALLOW_REFRESH_TOKEN_AUTH'],
  PreventUserExistenceErrors: 'ENABLED',
  EnableTokenRevocation: true,
  CallbackURLs: [`${exampleAppUrl}/oauth2/callback`],
  LogoutURLs: [`${exampleAppUrl}/`],
};
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

interface FakePool {
  clients: {
    id: string;
    name: string;
    secret: string;
    callbackUrls: string[];
  }[];
  secrets: Map<string, { value: string; tags: Tag[]; deleted?: boolean }>;
  pageSize: number;
  failures: Record<string, Error>;
  calls: string[];
}

let pool: FakePool;

function installFakeAws(): void {
  pool = {
    clients: [],
    secrets: new Map(),
    pageSize: 60,
    failures: {},
    calls: [],
  };
  mockSecretsSend.mockImplementation(async command => {
    const name = command.constructor.name;
    pool.calls.push(name);
    if (command instanceof DescribeSecretCommand) {
      const path = command.input.SecretId as string;
      const failure = pool.failures[`${name} ${path}`];
      if (failure) throw failure;
      const stored = pool.secrets.get(path);
      if (!stored) throw awsError('ResourceNotFoundException');
      return {
        Name: path,
        Tags: stored.tags,
        ...(stored.deleted ? { DeletedDate: new Date() } : {}),
      };
    }
    if (command instanceof CreateSecretCommand) {
      const path = command.input.Name as string;
      const failure = pool.failures[`${name} ${path}`];
      if (failure) throw failure;
      if (pool.secrets.has(path)) throw awsError('ResourceExistsException');
      pool.secrets.set(path, {
        value: command.input.SecretString as string,
        tags: command.input.Tags ?? [],
      });
      return { VersionId: 'example-version-id' };
    }
    throw new Error(`the action must not send ${name} to Secrets Manager`);
  });
  mockCognitoSend.mockImplementation(async command => {
    const name = command.constructor.name;
    pool.calls.push(name);
    if (pool.failures[name]) throw pool.failures[name];
    if (command instanceof ListUserPoolClientsCommand) {
      const start = Number(command.input.NextToken ?? 0);
      const page = pool.clients.slice(start, start + pool.pageSize);
      const next = start + pool.pageSize;
      return {
        UserPoolClients: page.map(client => ({
          ClientId: client.id,
          ClientName: client.name,
          UserPoolId: examplePoolId,
        })),
        ...(next < pool.clients.length ? { NextToken: String(next) } : {}),
      };
    }
    if (command instanceof DescribeUserPoolClientCommand) {
      const found = pool.clients.find(
        client => client.id === command.input.ClientId,
      );
      if (!found) throw awsError('ResourceNotFoundException');
      return {
        UserPoolClient: {
          ClientId: found.id,
          ClientSecret: found.secret,
          CallbackURLs: found.callbackUrls,
        },
      };
    }
    if (command instanceof CreateUserPoolClientCommand) {
      const id = `example-client-${pool.clients.length + 1}`;
      pool.clients.push({
        id,
        name: command.input.ClientName as string,
        secret: exampleClientSecret,
        callbackUrls: command.input.CallbackURLs ?? [],
      });
      return {
        UserPoolClient: { ClientId: id, ClientSecret: exampleClientSecret },
      };
    }
    throw new Error(`the action must not send ${name} to Cognito`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStsSend.mockReset();
  mockSecretsSend.mockReset();
  mockCognitoSend.mockReset();
  mockStsSend.mockResolvedValue(exampleCredentialsResponse);
  installFakeAws();
});

type EnsureContext = Parameters<
  ReturnType<typeof createEnsureAppLoginClientAction>['handler']
>[0];

interface LoggerMock {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

function contextWith(
  input: Record<string, unknown>,
  options: {
    taskId?: string;
    credentials?: BackstageCredentials;
  } = {},
) {
  const logger: LoggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const output = jest.fn();
  const ctx = {
    ...createMockActionContext(),
    input,
    output,
    task: { id: options.taskId ?? 'example-task-id' },
    logger,
    getInitiatorCredentials: async () =>
      options.credentials ?? exampleCredentials(),
  } as unknown as EnsureContext;
  return { ctx, logger, output };
}

async function run(
  deps: Parameters<typeof createEnsureAppLoginClientAction>[0],
  ctx: EnsureContext,
) {
  return createEnsureAppLoginClientAction(deps).handler(ctx);
}

async function failureOf(pending: Promise<unknown>): Promise<Error> {
  const outcome = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(outcome instanceof Error)) {
    throw new Error('expected the step to fail');
  }
  return outcome;
}

function expectNoAwsCall() {
  expect(mockStsSend).not.toHaveBeenCalled();
  expect(mockSecretsSend).not.toHaveBeenCalled();
  expect(mockCognitoSend).not.toHaveBeenCalled();
}

function expectNothingWritten() {
  expect(pool.calls).not.toContain('CreateUserPoolClientCommand');
  expect(pool.calls).not.toContain('CreateSecretCommand');
}

function withTag(tags: Tag[], key: string, value: string): Tag[] {
  return [...tags.filter(tag => tag.Key !== key), { Key: key, Value: value }];
}

function createdClientInput() {
  const command = mockCognitoSend.mock.calls
    .map(([sent]) => sent)
    .find(sent => sent instanceof CreateUserPoolClientCommand);
  return (command as CreateUserPoolClientCommand).input;
}

function tagsOf(path: string): Record<string, string> {
  return Object.fromEntries(
    (pool.secrets.get(path)?.tags ?? []).map(tag => [tag.Key, tag.Value]),
  );
}

function givenClientWith(secretNames: string[], clientId = 'example-client-1') {
  pool.clients.push({
    id: clientId,
    name: exampleClientName,
    secret: exampleClientSecret,
    callbackUrls: [exampleCallbackUrl],
  });
  for (const name of secretNames) {
    pool.secrets.set(examplePath(name), {
      value: `stored-${name}`,
      tags: [
        { Key: 'veecode.io/registered-by', Value: exampleUserRef },
        { Key: 'veecode.io/registered-at', Value: '2026-11-04T12:00:00.000Z' },
        { Key: 'veecode.io/app', Value: 'example-app' },
        { Key: 'veecode.io/environment', Value: 'dev' },
        { Key: 'veecode.io/cognito-client-id', Value: clientId },
      ],
    });
  }
}

describe('aws:cognito:app-login-client:ensure', () => {
  describe('creating', () => {
    it('creates the client and the three secrets for an app that is not in the catalog yet', async () => {
      const world = fakeWorld({
        system: undefined,
        randomBytes: base64PlusAndSlashBytes,
      });
      const { ctx, output } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('clientId', 'example-client-1');
      expect(output).toHaveBeenCalledWith('created', true);
      expect(output).toHaveBeenCalledWith('secretNames', exampleNames);
      expect(createdClientInput()).toEqual(exampleClientInput);
      expect(
        Object.fromEntries(
          [...pool.secrets].map(([path, secret]) => [path, secret.value]),
        ),
      ).toEqual({
        [examplePath('OAUTH2_PROXY_CLIENT_ID')]: 'example-client-1',
        [examplePath('OAUTH2_PROXY_CLIENT_SECRET')]: exampleClientSecret,
        [examplePath('OAUTH2_PROXY_COOKIE_SECRET')]: exampleCookieSecret,
      });
    });

    it('looks before it writes: lists the clients and describes the three secrets, then creates the client, then the secrets', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(pool.calls).toEqual([
        'ListUserPoolClientsCommand',
        'DescribeSecretCommand',
        'DescribeSecretCommand',
        'DescribeSecretCommand',
        'CreateUserPoolClientCommand',
        'CreateSecretCommand',
        'CreateSecretCommand',
        'CreateSecretCommand',
      ]);
    });

    it('tags each secret with who registered it, when, and the client it belongs to', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      await run(world.deps, ctx);

      for (const name of exampleNames) {
        expect(tagsOf(examplePath(name))).toEqual({
          'veecode.io/registered-by': exampleUserRef,
          'veecode.io/registered-at': '2026-11-04T12:00:00.000Z',
          'veecode.io/app': 'example-app',
          'veecode.io/environment': 'dev',
          'veecode.io/cognito-client-id': 'example-client-1',
        });
      }
    });

    it('creates the client for a System in the catalog that the user owns', async () => {
      const world = fakeWorld();
      const { ctx, output } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('created', true);
      expect(pool.secrets.size).toBe(3);
    });

    it('asks for the code flow and the three scopes only, never the admin scope', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      await run(world.deps, ctx);

      const input = createdClientInput();
      expect(input.AllowedOAuthFlows).toEqual(['code']);
      expect(input.AllowedOAuthScopes).toEqual(['openid', 'email', 'profile']);
      expect(input.AllowedOAuthScopes).not.toContain(exampleAdminScope);
      expect(input.WriteAttributes).toEqual(['email']);
    });

    it('writes the cookie secret as URL-safe base64 of 32 bytes, which oauth2-proxy decodes to an AES-256 key', async () => {
      const world = fakeWorld({
        system: undefined,
        randomBytes: base64PlusAndSlashBytes,
      });
      const { ctx } = contextWith(exampleInput);

      await run(world.deps, ctx);

      const cookie = pool.secrets.get(examplePath('OAUTH2_PROXY_COOKIE_SECRET'))
        ?.value as string;
      expect(cookie).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
      expect(Buffer.from(cookie, 'base64url')).toHaveLength(32);
    });

    it('takes the environment, the client name and the URLs from the configuration', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith({ ...exampleInput, environment: 'staging' });

      await run(
        {
          ...world.deps,
          settings: {
            ...exampleSettings,
            login: {
              ...exampleLoginSettings,
              appUrlPattern: 'https://{app}-{environment}.example.test',
              clientNamePattern: 'portal.{app}.{environment}',
              identityProviders: ['Google', 'ExampleIdp'],
            },
          },
        },
        ctx,
      );

      expect(createdClientInput()).toMatchObject({
        ClientName: 'portal.example-app.staging',
        SupportedIdentityProviders: ['Google', 'ExampleIdp'],
        CallbackURLs: [
          'https://example-app-staging.example.test/oauth2/callback',
        ],
        LogoutURLs: ['https://example-app-staging.example.test/'],
      });
      expect([...pool.secrets.keys()]).toEqual(
        exampleNames.map(name => examplePath(name, 'staging')),
      );
    });

    it('gives two apps whose names run together two different clients', async () => {
      const settings = { ...exampleSettings, environments: ['c', 'b-c'] };
      const first = fakeWorld({
        system: undefined,
        appRef: 'system:default/a-b',
      });
      await run(
        { ...first.deps, settings },
        contextWith({ app: 'system:default/a-b', environment: 'c' }).ctx,
      );
      const second = fakeWorld({
        system: undefined,
        appRef: 'system:default/a',
      });
      const { ctx, output } = contextWith({
        app: 'system:default/a',
        environment: 'b-c',
      });

      await run({ ...second.deps, settings }, ctx);

      expect(pool.clients.map(client => client.name)).toEqual([
        'a-b.c',
        'a.b-c',
      ]);
      expect(output).toHaveBeenCalledWith('created', true);
    });

    it('uses the first configured environment when none is given', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith({ app: exampleAppRef });

      await run(world.deps, ctx);

      expect([...pool.secrets.keys()]).toEqual(
        exampleNames.map(name => examplePath(name, 'dev')),
      );
    });

    it('creates the client of a System outside the default namespace when both patterns carry {namespace}', async () => {
      const world = fakeWorld({
        appRef: 'system:other-ns/example-app',
        system: exampleSystem({
          metadata: { name: 'example-app', namespace: 'other-ns' },
        }),
      });
      const { ctx } = contextWith({
        app: 'system:other-ns/example-app',
        environment: 'dev',
      });

      await run(
        {
          ...world.deps,
          settings: {
            ...exampleSettings,
            pathPattern:
              '/{cluster}/{namespace}/apps/{app}/{environment}/{name}',
            login: {
              ...exampleLoginSettings,
              clientNamePattern: '{namespace}.{app}.{environment}',
            },
          },
        },
        ctx,
      );

      expect(pool.clients.map(client => client.name)).toEqual([
        'other-ns.example-app.dev',
      ]);
      expect([...pool.secrets.keys()][0]).toBe(
        '/example-cluster/other-ns/apps/example-app/dev/OAUTH2_PROXY_CLIENT_ID',
      );
    });
  });

  describe('running again', () => {
    it('changes nothing when the client and its three secrets are already there', async () => {
      const world = fakeWorld({ system: undefined });
      await run(world.deps, contextWith(exampleInput).ctx);
      const clientsBefore = structuredClone(pool.clients);
      const secretsBefore = structuredClone([...pool.secrets]);
      pool.calls.length = 0;
      const world2 = fakeWorld();
      const second = contextWith(exampleInput);

      await run(world2.deps, second.ctx);

      expect(second.output).toHaveBeenCalledWith(
        'clientId',
        'example-client-1',
      );
      expect(second.output).toHaveBeenCalledWith('created', false);
      expect(second.output).toHaveBeenCalledWith('secretNames', exampleNames);
      expectNothingWritten();
      expect(pool.clients).toEqual(clientsBefore);
      expect([...pool.secrets]).toEqual(secretsBefore);
      expect(second.logger.info).toHaveBeenCalledWith(
        `app login client ${exampleClientName} for ${exampleAppRef} in dev: existing, nothing to write`,
      );
    });

    it('adopts its own client on a rerun while the System is still not in the catalog, and changes nothing', async () => {
      const first = fakeWorld({ system: undefined });
      await run(first.deps, contextWith(exampleInput).ctx);
      const clientsBefore = structuredClone(pool.clients);
      const secretsBefore = structuredClone([...pool.secrets]);
      pool.calls.length = 0;
      const second = fakeWorld({ system: undefined });
      const rerun = contextWith(exampleInput);

      await run(second.deps, rerun.ctx);

      expect(rerun.output).toHaveBeenCalledWith('clientId', 'example-client-1');
      expect(rerun.output).toHaveBeenCalledWith('created', false);
      expectNothingWritten();
      expect(pool.clients).toEqual(clientsBefore);
      expect([...pool.secrets]).toEqual(secretsBefore);
      expect(second.catalog.getEntityByRef).toHaveBeenCalled();
    });

    it('writes only the secrets that are missing, reading the client secret back from Cognito', async () => {
      givenClientWith(['OAUTH2_PROXY_CLIENT_ID']);
      const world = fakeWorld({ randomBytes: base64PlusAndSlashBytes });
      const { ctx, output } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('created', false);
      expect(pool.calls).toContain('DescribeUserPoolClientCommand');
      expect(
        pool.calls.filter(call => call === 'CreateSecretCommand'),
      ).toHaveLength(2);
      expect(pool.calls).not.toContain('CreateUserPoolClientCommand');
      expect(
        pool.secrets.get(examplePath('OAUTH2_PROXY_CLIENT_ID'))?.value,
      ).toBe('stored-OAUTH2_PROXY_CLIENT_ID');
      expect(
        pool.secrets.get(examplePath('OAUTH2_PROXY_CLIENT_SECRET'))?.value,
      ).toBe(exampleClientSecret);
      expect(
        pool.secrets.get(examplePath('OAUTH2_PROXY_COOKIE_SECRET'))?.value,
      ).toBe(exampleCookieSecret);
      expect(
        tagsOf(examplePath('OAUTH2_PROXY_COOKIE_SECRET'))[
          'veecode.io/cognito-client-id'
        ],
      ).toBe('example-client-1');
    });

    it('writes only the cookie secret when it is the only one missing', async () => {
      givenClientWith(['OAUTH2_PROXY_CLIENT_ID', 'OAUTH2_PROXY_CLIENT_SECRET']);
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(
        pool.calls.filter(call => call === 'CreateSecretCommand'),
      ).toHaveLength(1);
      expect(
        pool.secrets.get(examplePath('OAUTH2_PROXY_CLIENT_SECRET'))?.value,
      ).toBe('stored-OAUTH2_PROXY_CLIENT_SECRET');
      expect([...pool.secrets.keys()]).toHaveLength(3);
    });

    it('finishes a run that failed after the client was created, without a second client', async () => {
      const world = fakeWorld({ randomBytes: base64PlusAndSlashBytes });
      pool.failures[
        `CreateSecretCommand ${examplePath('OAUTH2_PROXY_CLIENT_SECRET')}`
      ] = awsError('InternalServiceError');
      const failed = await failureOf(
        run(world.deps, contextWith(exampleInput).ctx),
      );
      expect(pool.clients).toHaveLength(1);
      expect([...pool.secrets.keys()]).toEqual([
        examplePath('OAUTH2_PROXY_CLIENT_ID'),
      ]);
      delete pool.failures[
        `CreateSecretCommand ${examplePath('OAUTH2_PROXY_CLIENT_SECRET')}`
      ];

      const rerun = contextWith(exampleInput);
      await run(world.deps, rerun.ctx);

      expect(failed.message).toContain('InternalServiceError');
      expect(pool.clients).toHaveLength(1);
      expect([...pool.secrets.keys()].sort()).toEqual(
        exampleNames.map(name => examplePath(name)).sort(),
      );
      expect(rerun.output).toHaveBeenCalledWith('created', false);
    });

    it('finds the client on a later page of the list', async () => {
      pool.pageSize = 2;
      for (const name of ['other-a.dev', 'other-b.dev', 'other-c.dev']) {
        pool.clients.push({
          id: `id-${name}`,
          name,
          secret: 'other',
          callbackUrls: [otherCallbackUrl],
        });
      }
      givenClientWith(exampleNames, 'example-client-9');
      const world = fakeWorld();
      const { ctx, output } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('clientId', 'example-client-9');
      expect(
        pool.calls.filter(call => call === 'ListUserPoolClientsCommand'),
      ).toHaveLength(2);
      expectNothingWritten();
    });

    it('does not take a client whose name only starts with the app name', async () => {
      pool.clients.push({
        id: 'id-longer',
        name: 'example-app.dev-extra',
        secret: 'other',
        callbackUrls: [otherCallbackUrl],
      });
      const world = fakeWorld({ system: undefined });
      const { ctx, output } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('created', true);
      expect(pool.clients).toHaveLength(2);
    });
  });

  describe('refusals', () => {
    it('refuses without the appSecrets.login block, before any AWS call', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(
        run(
          { ...world.deps, settings: { ...exampleSettings, login: undefined } },
          ctx,
        ),
      );

      expect(error.message).toBe(
        'appSecrets.login is not configured: set appSecrets.login.userPoolId and appSecrets.login.appUrlPattern to create app login clients',
      );
      expectNoAwsCall();
    });

    it('refuses an app the user does not own, even when no client exists yet', async () => {
      const world = fakeWorld({ ownershipRefs: ['group:default/other-team'] });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'the user does not own System "system:default/example-app"',
      );
      expectNoAwsCall();
    });

    it('refuses a user who does not own the System whose client already exists, and touches nothing', async () => {
      givenClientWith(exampleNames);
      const world = fakeWorld({ ownershipRefs: ['group:default/other-team'] });
      const { ctx } = contextWith(exampleInput);
      const before = structuredClone([...pool.secrets]);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'the user does not own System "system:default/example-app"',
      );
      expectNoAwsCall();
      expect([...pool.secrets]).toEqual(before);
    });

    it('refuses a System that another team owns and the user cannot see, instead of treating it as new', async () => {
      const world = fakeWorld({
        systemHiddenFromUsers: true,
        ownershipRefs: ['group:default/other-team'],
      });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'the user does not own System "system:default/example-app"',
      );
      expectNoAwsCall();
    });

    it('reads the catalog with the plugin credentials, so a hidden System is not mistaken for a missing one', async () => {
      const world = fakeWorld({ systemHiddenFromUsers: true });
      const { ctx, output } = contextWith(exampleInput);

      await run(world.deps, ctx);

      expect(world.catalog.getEntityByRef).toHaveBeenCalledWith(exampleAppRef, {
        credentials: expect.objectContaining({
          principal: expect.objectContaining({ type: 'service' }),
        }),
      });
      expect(output).toHaveBeenCalledWith('created', true);
    });

    it('refuses a client whose callback URL is not the one of this app, naming no secret and writing nothing', async () => {
      givenClientWith(exampleNames);
      pool.clients[0].callbackUrls = [otherCallbackUrl];
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `the client named "${exampleClientName}" in the user pool does not belong to this app: its callback URL is not the one of this app; refusing to use it`,
      );
      expect(error.message).not.toContain('OAUTH2_PROXY');
      expectNothingWritten();
    });

    it('refuses such a client before it writes any missing secret', async () => {
      givenClientWith(['OAUTH2_PROXY_CLIENT_ID']);
      pool.clients[0].callbackUrls = [otherCallbackUrl];
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toContain('does not belong to this app');
      expectNothingWritten();
      expect([...pool.secrets.keys()]).toHaveLength(1);
    });

    it.each([
      ['another URL next to its own', [exampleCallbackUrl, otherCallbackUrl]],
      ['no callback URL', []],
    ])('refuses a client with %s', async (_, callbackUrls) => {
      givenClientWith(exampleNames);
      pool.clients[0].callbackUrls = callbackUrls;
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toContain('does not belong to this app');
      expectNothingWritten();
    });

    it.each([
      [
        'a secret is missing',
        ['OAUTH2_PROXY_CLIENT_ID', 'OAUTH2_PROXY_CLIENT_SECRET'],
      ],
      ['no secret exists', []],
    ])(
      'refuses to use an existing client when the System is not in the catalog and %s',
      async (_, present) => {
        givenClientWith(present);
        const world = fakeWorld({ system: undefined });
        const { ctx } = contextWith(exampleInput);

        const error = await failureOf(run(world.deps, ctx));

        expect(error.message).toBe(
          `a client named "${exampleClientName}" already exists in the user pool, and its three secrets were not all written for it by this user for this app, so the System must be in the catalog and owned by the user before this step can use it`,
        );
        expectNothingWritten();
      },
    );

    it.each([
      [
        'a secret is tagged for another client',
        (secret: { tags: Tag[] }) => {
          secret.tags = [
            { Key: 'veecode.io/cognito-client-id', Value: 'another-client' },
          ];
        },
      ],
      [
        'a secret has no client tag',
        (secret: { tags: Tag[] }) => {
          secret.tags = [];
        },
      ],
      [
        'a secret was registered by another user',
        (secret: { tags: Tag[] }) => {
          secret.tags = withTag(
            secret.tags,
            'veecode.io/registered-by',
            'user:default/other.user',
          );
        },
      ],
      [
        'a secret is for another app',
        (secret: { tags: Tag[] }) => {
          secret.tags = withTag(secret.tags, 'veecode.io/app', 'other-app');
        },
      ],
      [
        'a secret is for another environment',
        (secret: { tags: Tag[] }) => {
          secret.tags = withTag(
            secret.tags,
            'veecode.io/environment',
            'staging',
          );
        },
      ],
      [
        'a secret is scheduled for deletion',
        (secret: { deleted?: boolean }) => {
          secret.deleted = true;
        },
      ],
    ])(
      'refuses to adopt a client when the System is not in the catalog and %s',
      async (_, spoil) => {
        givenClientWith(exampleNames);
        spoil(pool.secrets.get(examplePath('OAUTH2_PROXY_COOKIE_SECRET'))!);
        const world = fakeWorld({ system: undefined });
        const { ctx } = contextWith(exampleInput);

        const error = await failureOf(run(world.deps, ctx));

        expect(error.message).toMatch(
          /^a client named ".*" already exists in the user pool, and its three secrets were not all written for it by this user for this app/,
        );
        expectNothingWritten();
      },
    );

    it('refuses a second user who tries to adopt the fresh client of a first user', async () => {
      const first = fakeWorld({ system: undefined });
      await run(first.deps, contextWith(exampleInput).ctx);
      const clientsBefore = structuredClone(pool.clients);
      const secretsBefore = structuredClone([...pool.secrets]);
      pool.calls.length = 0;
      const second = fakeWorld({
        system: undefined,
        userRef: 'user:default/other.user',
      });
      const { ctx, output } = contextWith(exampleInput, {
        credentials: mockCredentials.user('user:default/other.user'),
      });

      const error = await failureOf(run(second.deps, ctx));

      expect(error.message).toBe(
        `a client named "${exampleClientName}" already exists in the user pool, and its three secrets were not all written for it by this user for this app, so the System must be in the catalog and owned by the user before this step can use it`,
      );
      expect(output).not.toHaveBeenCalled();
      expectNothingWritten();
      expect(pool.clients).toEqual(clientsBefore);
      expect([...pool.secrets]).toEqual(secretsBefore);
    });

    it('refuses to adopt a client with another callback URL when the System is not in the catalog', async () => {
      givenClientWith(exampleNames);
      pool.clients[0].callbackUrls = [otherCallbackUrl];
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toContain('does not belong to this app');
      expectNothingWritten();
    });

    it('refuses to write over secrets that exist when no client does', async () => {
      pool.secrets.set(examplePath('OAUTH2_PROXY_COOKIE_SECRET'), {
        value: 'stored-value',
        tags: [],
      });
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `no client named "${exampleClientName}" exists in the user pool, but OAUTH2_PROXY_COOKIE_SECRET already exist for this app; refusing to overwrite them`,
      );
      expectNothingWritten();
    });

    it('refuses a secret that was written for another client, naming the secret and no value', async () => {
      givenClientWith(exampleNames);
      pool.secrets.set(examplePath('OAUTH2_PROXY_CLIENT_ID'), {
        value: 'stored-value',
        tags: [
          { Key: 'veecode.io/cognito-client-id', Value: 'another-client' },
        ],
      });
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `OAUTH2_PROXY_CLIENT_ID was not written for the client named "${exampleClientName}"; refusing to overwrite it`,
      );
      expect(error.message).not.toContain('stored-value');
      expect(error.message).not.toContain('another-client');
      expectNothingWritten();
    });

    it('refuses a secret that carries no client tag, such as one registered by hand', async () => {
      givenClientWith(['OAUTH2_PROXY_CLIENT_ID', 'OAUTH2_PROXY_CLIENT_SECRET']);
      pool.secrets.set(examplePath('OAUTH2_PROXY_COOKIE_SECRET'), {
        value: 'stored-value',
        tags: [{ Key: 'veecode.io/app', Value: 'example-app' }],
      });
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `OAUTH2_PROXY_COOKIE_SECRET was not written for the client named "${exampleClientName}"; refusing to overwrite it`,
      );
      expectNothingWritten();
    });

    it('refuses a secret that is scheduled for deletion', async () => {
      givenClientWith(exampleNames);
      const secret = pool.secrets.get(
        examplePath('OAUTH2_PROXY_CLIENT_SECRET'),
      );
      if (secret) secret.deleted = true;
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'OAUTH2_PROXY_CLIENT_SECRET is scheduled for deletion; restore or remove it first',
      );
      expectNothingWritten();
    });

    it('refuses when two clients in the pool carry the name', async () => {
      givenClientWith(exampleNames, 'example-client-1');
      pool.clients.push({
        id: 'example-client-2',
        name: exampleClientName,
        secret: 'other',
        callbackUrls: [exampleCallbackUrl],
      });
      const world = fakeWorld();
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `2 clients in the user pool are named "${exampleClientName}"; remove the extra ones before running this step again`,
      );
      expectNothingWritten();
    });

    it('refuses an environment that is not configured, before any AWS call', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith({
        ...exampleInput,
        environment: 'production',
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'environment "production" is not configured; configured: dev, staging',
      );
      expect(world.catalog.getEntityByRef).not.toHaveBeenCalled();
      expectNoAwsCall();
    });

    it('refuses an app that is not a System', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith({
        ...exampleInput,
        app: 'component:default/example-component',
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toMatch(/^app must be a System entity reference/);
      expectNoAwsCall();
    });

    it('refuses a caller that is not a user', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput, {
        credentials: mockCredentials.service(),
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'only a signed-in user can work with app secrets',
      );
      expectNoAwsCall();
    });

    it.each([
      ['uppercase letters', 'system:default/Example-App'],
      ['an underscore', 'system:default/example_app'],
      ['a dot', 'system:default/example.app'],
      ['a leading hyphen', 'system:default/-example'],
      ['more than 63 characters', `system:default/a${'b'.repeat(63)}`],
    ])('refuses an app name that cannot be a host name: %s', async (_, app) => {
      const world = fakeWorld({ system: undefined, appRef: app });
      const { ctx } = contextWith({ ...exampleInput, app });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toMatch(
        /^the app name ".*" cannot be used for a login client/,
      );
      expectNoAwsCall();
    });

    it('refuses a System outside the default namespace when the secret path has no {namespace}', async () => {
      const world = fakeWorld({
        appRef: 'system:other-ns/example-app',
        system: undefined,
      });
      const { ctx } = contextWith({
        ...exampleInput,
        app: 'system:other-ns/example-app',
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toMatch(
        /^System "system:other-ns\/example-app" is outside the "default" namespace, and appSecrets\.pathPattern has no \{namespace\}/,
      );
      expectNoAwsCall();
    });

    it('refuses a System outside the default namespace when the client name has no {namespace}, so it cannot share the client of the System of the same name in default', async () => {
      const world = fakeWorld({
        appRef: 'system:other-ns/example-app',
        system: exampleSystem({
          metadata: { name: 'example-app', namespace: 'other-ns' },
        }),
      });
      const { ctx } = contextWith({
        ...exampleInput,
        app: 'system:other-ns/example-app',
      });

      const error = await failureOf(
        run(
          {
            ...world.deps,
            settings: {
              ...exampleSettings,
              pathPattern:
                '/{cluster}/{namespace}/apps/{app}/{environment}/{name}',
            },
          },
          ctx,
        ),
      );

      expect(error.message).toMatch(
        /^System "system:other-ns\/example-app" is outside the "default" namespace, and appSecrets\.login\.clientNamePattern has no \{namespace\}/,
      );
      expectNoAwsCall();
    });
  });

  describe('credentials', () => {
    it('assumes the writer role with a sanitized session name and the user as source identity', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput, { taskId: 'example task/1' });

      await run(world.deps, ctx);

      const assume = mockStsSend.mock.calls[0][0];
      expect(assume).toBeInstanceOf(AssumeRoleCommand);
      expect(mockStsSend).toHaveBeenCalledTimes(1);
      expect(assume.input).toEqual({
        RoleArn: 'arn:aws:iam::123456789012:role/example-secret-writer',
        RoleSessionName: 'task-example-task-1',
        SourceIdentity: 'example.user',
        Policy: expect.any(String),
      });
    });

    it('narrows the session to this pool and to the three secrets, with create-only secret actions', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      await run(world.deps, ctx);

      const raw = mockStsSend.mock.calls[0][0].input.Policy as string;
      expect(JSON.parse(raw)).toEqual({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'cognito-idp:ListUserPoolClients',
              'cognito-idp:DescribeUserPoolClient',
              'cognito-idp:CreateUserPoolClient',
            ],
            Resource: [
              `arn:aws:cognito-idp:us-east-1:*:userpool/${examplePoolId}`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'secretsmanager:CreateSecret',
              'secretsmanager:DescribeSecret',
              'secretsmanager:TagResource',
            ],
            Resource: exampleNames.map(
              name =>
                `arn:aws:secretsmanager:us-east-1:*:secret:${examplePath(
                  name,
                )}-??????`,
            ),
          },
        ],
      });
      expect(raw).not.toContain('PutSecretValue');
      expect(raw).not.toContain('GetSecretValue');
      expect(raw.length).toBeLessThan(2048);
    });

    it('builds both clients from the one session, each with a single attempt', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      await run(world.deps, ctx);

      const credentials = {
        accessKeyId: 'example-access-key-id',
        secretAccessKey: 'example-secret-access-key',
        sessionToken: 'example-session-token',
      };
      expect(CognitoIdentityProviderClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        maxAttempts: 1,
        credentials,
      });
      expect(SecretsManagerClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        maxAttempts: 1,
        credentials,
      });
    });

    it('uses the region of the login block for the user pool and the region of appSecrets for the secrets', async () => {
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      await run(
        {
          ...world.deps,
          settings: {
            ...exampleSettings,
            login: {
              ...exampleLoginSettings,
              userPoolId: 'eu-west-1_ExamplePool',
              region: 'eu-west-1',
            },
          },
        },
        ctx,
      );

      expect(CognitoIdentityProviderClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-west-1' }),
      );
      expect(SecretsManagerClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-east-1' }),
      );
      const policy = JSON.parse(mockStsSend.mock.calls[0][0].input.Policy);
      expect(policy.Statement[0].Resource).toEqual([
        'arn:aws:cognito-idp:eu-west-1:*:userpool/eu-west-1_ExamplePool',
      ]);
      expect(policy.Statement[1].Resource[0]).toContain(
        'arn:aws:secretsmanager:us-east-1:*:secret:',
      );
    });

    it('fails without a Cognito or Secrets Manager call when the writer role cannot be assumed', async () => {
      mockStsSend.mockRejectedValueOnce(awsError('AccessDenied'));
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'Could not assume the writer role: AccessDenied',
      );
      expect(mockCognitoSend).not.toHaveBeenCalled();
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('creates no secret when the client cannot be created', async () => {
      pool.failures.CreateUserPoolClientCommand = awsError(
        'LimitExceededException',
      );
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'CreateUserPoolClient failed: LimitExceededException',
      );
      expect(pool.calls).not.toContain('CreateSecretCommand');
    });

    it('fails when the clients cannot be listed, before anything is created', async () => {
      pool.failures.ListUserPoolClientsCommand = awsError(
        'AccessDeniedException',
      );
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'ListUserPoolClients failed: AccessDeniedException',
      );
      expectNothingWritten();
    });

    it('fails when a secret cannot be inspected, before the client is created', async () => {
      pool.failures[
        `DescribeSecretCommand ${examplePath('OAUTH2_PROXY_CLIENT_SECRET')}`
      ] = awsError('AccessDeniedException');
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `DescribeSecret failed for ${examplePath(
          'OAUTH2_PROXY_CLIENT_SECRET',
        )}: AccessDeniedException`,
      );
      expectNothingWritten();
    });

    it('names the failed secret and tells the user to run the step again when a write fails after the client exists', async () => {
      pool.failures[
        `CreateSecretCommand ${examplePath('OAUTH2_PROXY_CLIENT_SECRET')}`
      ] = awsError('AccessDeniedException');
      const world = fakeWorld({ system: undefined });
      const { ctx, output } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `CreateSecret failed for ${examplePath(
          'OAUTH2_PROXY_CLIENT_SECRET',
        )}: AccessDeniedException. The client named "${exampleClientName}" exists; run the step again to write the values still missing`,
      );
      expect(output).not.toHaveBeenCalled();
    });

    it('never puts a new version on a secret that appeared after it looked', async () => {
      pool.failures[
        `CreateSecretCommand ${examplePath('OAUTH2_PROXY_COOKIE_SECRET')}`
      ] = awsError('ResourceExistsException');
      const world = fakeWorld({ system: undefined });
      const { ctx } = contextWith(exampleInput);

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toContain('ResourceExistsException');
      expect(pool.calls).not.toContain('PutSecretValueCommand');
    });
  });

  describe('the client secret and the cookie secret', () => {
    it('never appear in a log line, an output or an error message, and do reach Secrets Manager', async () => {
      const seen: string[] = [];
      const record = (attempt: { logger: LoggerMock; output: jest.Mock }) => {
        for (const level of ['info', 'warn', 'error', 'debug'] as const) {
          seen.push(JSON.stringify(attempt.logger[level].mock.calls));
        }
        seen.push(JSON.stringify(attempt.output.mock.calls));
      };
      const withRandom = () =>
        fakeWorld({ system: undefined, randomBytes: base64PlusAndSlashBytes });

      const created = contextWith(exampleInput);
      await run(withRandom().deps, created.ctx);
      record(created);

      const adopted = contextWith(exampleInput);
      await run(withRandom().deps, adopted.ctx);
      record(adopted);

      const existing = contextWith(exampleInput);
      await run(
        fakeWorld({ randomBytes: base64PlusAndSlashBytes }).deps,
        existing.ctx,
      );
      record(existing);

      pool.secrets.delete(examplePath('OAUTH2_PROXY_CLIENT_SECRET'));
      pool.secrets.delete(examplePath('OAUTH2_PROXY_COOKIE_SECRET'));
      const completed = contextWith(exampleInput);
      await run(
        fakeWorld({ randomBytes: base64PlusAndSlashBytes }).deps,
        completed.ctx,
      );
      record(completed);

      pool.secrets.delete(examplePath('OAUTH2_PROXY_COOKIE_SECRET'));
      pool.failures[
        `CreateSecretCommand ${examplePath('OAUTH2_PROXY_COOKIE_SECRET')}`
      ] = awsError('InternalServiceError');
      const failed = contextWith(exampleInput);
      seen.push(
        (
          await failureOf(
            run(
              fakeWorld({ randomBytes: base64PlusAndSlashBytes }).deps,
              failed.ctx,
            ),
          )
        ).message,
      );
      record(failed);

      const refused = contextWith(exampleInput);
      pool.secrets.get(examplePath('OAUTH2_PROXY_CLIENT_ID'))!.tags = [];
      seen.push(
        (
          await failureOf(
            run(
              fakeWorld({ randomBytes: base64PlusAndSlashBytes }).deps,
              refused.ctx,
            ),
          )
        ).message,
      );
      record(refused);

      for (const text of seen) {
        expect(text).not.toContain(exampleClientSecret);
        expect(text).not.toContain(exampleCookieSecret);
      }
      const sentToAws = JSON.stringify(
        mockSecretsSend.mock.calls.map(([command]) => command.input),
      );
      expect(sentToAws).toContain(exampleClientSecret);
      expect(sentToAws).toContain(exampleCookieSecret);
    });
  });

  describe('the input', () => {
    it('takes an app and an optional environment, and refuses any other key', () => {
      const action = createEnsureAppLoginClientAction(fakeWorld().deps);

      expect(action.schema?.input).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['app'],
      });
    });

    it('declares the client ID, the created flag and the secret names as its output, and nothing secret', () => {
      const action = createEnsureAppLoginClientAction(fakeWorld().deps);

      expect(
        Object.keys(
          (action.schema?.output as { properties: object }).properties,
        ),
      ).toEqual(['clientId', 'created', 'secretNames']);
    });
  });
});
