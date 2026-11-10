import {
  CreateSecretCommand,
  PutSecretValueCommand,
  TagResourceCommand,
} from '@aws-sdk/client-secrets-manager';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import { mockCredentials } from '@backstage/backend-test-utils';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import {
  exampleAppRef,
  exampleComponent,
  exampleSettings,
  exampleSystem,
  exampleTeamRef,
  exampleUserRef,
  fakeWorld,
} from '../fixtures';
import { createRegisterAppSecretAction } from './registerAppSecret';

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

const exampleMarker = 'example-marker-value-7f3a9c';
const examplePath = '/example-cluster/apps/example-app/dev/DATABASE_PASSWORD';
const exampleDeclarationUrl =
  'https://git.example.com/example-org/example-app/blob/main/apps/example-component/config/dev.yaml';
const exampleDeclaration = 'secrets:\n  - DATABASE_PASSWORD\n';
const exampleInput = {
  app: exampleAppRef,
  environment: 'dev',
  name: 'DATABASE_PASSWORD',
};
const exampleTags = [
  { Key: 'veecode.io/registered-by', Value: 'user:default/example.user' },
  { Key: 'veecode.io/registered-at', Value: '2026-11-04T12:00:00.000Z' },
  { Key: 'veecode.io/app', Value: 'example-app' },
  { Key: 'veecode.io/environment', Value: 'dev' },
];

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

beforeEach(() => {
  jest.clearAllMocks();
  mockStsSend.mockReset();
  mockSecretsSend.mockReset();
  mockStsSend.mockResolvedValue(exampleCredentialsResponse);
  mockSecretsSend.mockResolvedValue({ VersionId: 'example-version-id' });
});

type RegisterContext = Parameters<
  ReturnType<typeof createRegisterAppSecretAction>['handler']
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
    secrets?: Record<string, string> | undefined;
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
    secrets: options.secrets,
    task: { id: options.taskId ?? 'example-task-id' },
    logger,
    getInitiatorCredentials: async () =>
      options.credentials ?? exampleCredentials(),
  } as unknown as RegisterContext;
  return { ctx, logger, output };
}

async function run(
  deps: Parameters<typeof createRegisterAppSecretAction>[0],
  ctx: RegisterContext,
) {
  return createRegisterAppSecretAction(deps).handler(ctx);
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

function secretsCommands(): unknown[] {
  return mockSecretsSend.mock.calls.map(([command]) => command);
}

function expectNoAwsCall() {
  expect(mockStsSend).not.toHaveBeenCalled();
  expect(mockSecretsSend).not.toHaveBeenCalled();
}

describe('aws:secrets-manager:app-secret:register', () => {
  describe('writing', () => {
    it('creates a missing secret from the task secret and reports its path, version and created flag', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx, output } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('path', examplePath);
      expect(output).toHaveBeenCalledWith('versionId', 'example-version-id');
      expect(output).toHaveBeenCalledWith('created', true);
      expect(secretsCommands()).toHaveLength(1);
      expect(secretsCommands()[0]).toBeInstanceOf(CreateSecretCommand);
      expect((secretsCommands()[0] as CreateSecretCommand).input).toEqual({
        Name: examplePath,
        SecretString: exampleMarker,
        Tags: exampleTags,
      });
    });

    it('updates an existing secret with a new version and then retags it', async () => {
      mockSecretsSend.mockImplementation(async command => {
        if (command instanceof CreateSecretCommand) {
          throw awsError('ResourceExistsException');
        }
        if (command instanceof PutSecretValueCommand) {
          return { VersionId: 'example-version-id-2' };
        }
        return {};
      });
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx, output } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('created', false);
      expect(output).toHaveBeenCalledWith('versionId', 'example-version-id-2');
      const commands = secretsCommands();
      expect(
        commands.map(command => (command as object).constructor.name),
      ).toEqual([
        'CreateSecretCommand',
        'PutSecretValueCommand',
        'TagResourceCommand',
      ]);
      expect((commands[1] as PutSecretValueCommand).input).toEqual({
        SecretId: examplePath,
        SecretString: exampleMarker,
      });
      expect((commands[2] as TagResourceCommand).input).toEqual({
        SecretId: examplePath,
        Tags: exampleTags,
      });
    });

    it('fails when CreateSecret fails for another reason, naming the error and the path but not the value', async () => {
      mockSecretsSend.mockRejectedValueOnce(awsError('AccessDeniedException'));
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `CreateSecret failed for ${examplePath}: AccessDeniedException`,
      );
      expect(mockSecretsSend).toHaveBeenCalledTimes(1);
    });

    it('fails the step when tagging fails after the new version was written', async () => {
      mockSecretsSend.mockImplementation(async command => {
        if (command instanceof CreateSecretCommand) {
          throw awsError('ResourceExistsException');
        }
        if (command instanceof TagResourceCommand) {
          throw awsError('InternalServiceError');
        }
        return { VersionId: 'example-version-id-2' };
      });
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx, output } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `TagResource failed for ${examplePath}: InternalServiceError`,
      );
      expect(output).not.toHaveBeenCalled();
    });

    it('fails without writing when the writer role cannot be assumed', async () => {
      mockStsSend.mockRejectedValueOnce(awsError('AccessDenied'));
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'Could not assume the writer role: AccessDenied',
      );
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });

    it('assumes the writer role with a sanitized session name and the user as source identity', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
        taskId: 'example task/1',
      });

      await run(world.deps, ctx);

      const assume = mockStsSend.mock.calls[0][0];
      expect(assume).toBeInstanceOf(AssumeRoleCommand);
      expect(assume.input).toEqual({
        RoleArn: 'arn:aws:iam::123456789012:role/example-secret-writer',
        RoleSessionName: 'task-example-task-1',
        SourceIdentity: 'example.user',
        Policy: expect.any(String),
      });
    });

    it('narrows the session to the one secret it writes, with the four actions it uses', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      await run(world.deps, ctx);

      const policy = JSON.parse(mockStsSend.mock.calls[0][0].input.Policy);
      expect(policy).toEqual({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'secretsmanager:CreateSecret',
              'secretsmanager:PutSecretValue',
              'secretsmanager:TagResource',
              'secretsmanager:DescribeSecret',
            ],
            Resource: [
              `arn:aws:secretsmanager:us-east-1:*:secret:${examplePath}-??????`,
            ],
          },
        ],
      });
      expect(mockStsSend.mock.calls[0][0].input.Policy.length).toBeLessThan(
        2048,
      );
    });

    it('cuts a long task id to the 64 characters a session name allows', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
        taskId: 'a'.repeat(80),
      });

      await run(world.deps, ctx);

      const roleSessionName =
        mockStsSend.mock.calls[0][0].input.RoleSessionName;
      expect(roleSessionName).toHaveLength(64);
      expect(roleSessionName).toBe(`task-${'a'.repeat(59)}`);
    });

    it('reads the value from the key the template names in valueSecret', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(
        { ...exampleInput, valueSecret: 'database_password_value' },
        { secrets: { database_password_value: exampleMarker, value: 'other' } },
      );

      await run(world.deps, ctx);

      expect(
        (secretsCommands()[0] as CreateSecretCommand).input.SecretString,
      ).toBe(exampleMarker);
    });

    it('writes under the namespace of the System when the path pattern names it', async () => {
      const world = fakeWorld({
        appRef: 'system:other-ns/example-app',
        system: exampleSystem({
          metadata: { name: 'example-app', namespace: 'other-ns' },
        }),
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx, output } = contextWith(
        { ...exampleInput, app: 'system:other-ns/example-app' },
        { secrets: { value: exampleMarker } },
      );

      await run(
        {
          ...world.deps,
          settings: {
            ...exampleSettings,
            pathPattern:
              '/{cluster}/{namespace}/apps/{app}/{environment}/{name}',
          },
        },
        ctx,
      );

      expect(output).toHaveBeenCalledWith(
        'path',
        '/example-cluster/other-ns/apps/example-app/dev/DATABASE_PASSWORD',
      );
    });

    it('accepts an owner written without its namespace', async () => {
      const world = fakeWorld({
        system: exampleSystem({ spec: { owner: 'group:example-team' } }),
        ownershipRefs: [exampleTeamRef],
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx, output } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      await run(world.deps, ctx);

      expect(output).toHaveBeenCalledWith('created', true);
    });
  });

  describe('refusals, each before any AWS call', () => {
    const declaring = () =>
      fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });

    it('refuses an environment that is not configured', async () => {
      const world = declaring();
      const { ctx } = contextWith(
        { ...exampleInput, environment: 'production' },
        { secrets: { value: exampleMarker } },
      );

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'environment "production" is not configured; configured: dev, staging',
      );
      expect(world.catalog.getEntityByRef).not.toHaveBeenCalled();
      expectNoAwsCall();
    });

    it('refuses a name that is not upper case', async () => {
      const world = declaring();
      const { ctx } = contextWith(
        { ...exampleInput, name: 'database-password' },
        { secrets: { value: exampleMarker } },
      );

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toContain('must be upper case letters');
      expectNoAwsCall();
    });

    it('refuses a reserved name even when a component declares it', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: 'secrets:\n  - PORT\n' },
      });
      const { ctx } = contextWith(
        { ...exampleInput, name: 'PORT' },
        { secrets: { value: exampleMarker } },
      );

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe('name "PORT" is reserved for the platform');
      expectNoAwsCall();
    });

    it('refuses a name with a reserved prefix', async () => {
      const world = declaring();
      const { ctx } = contextWith(
        { ...exampleInput, name: 'OTEL_EXPORTER_TOKEN' },
        { secrets: { value: exampleMarker } },
      );

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'name "OTEL_EXPORTER_TOKEN" starts with the reserved prefix "OTEL_"',
      );
      expectNoAwsCall();
    });

    it('refuses an app that is not a System', async () => {
      const world = declaring();
      const { ctx } = contextWith(
        { ...exampleInput, app: 'component:default/example-component' },
        { secrets: { value: exampleMarker } },
      );

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toMatch(/^app must be a System entity reference/);
      expectNoAwsCall();
    });

    it('refuses an app the user does not own', async () => {
      const world = fakeWorld({
        ownershipRefs: ['group:default/other-team'],
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'the user does not own System "system:default/example-app"',
      );
      expect(world.catalog.getEntityByRef).toHaveBeenCalledWith(exampleAppRef, {
        credentials: expect.anything(),
      });
      expectNoAwsCall();
    });

    it('refuses a System outside the default namespace when the path pattern has no {namespace}, before any AWS call', async () => {
      const world = fakeWorld({
        appRef: 'system:other-ns/example-app',
        system: exampleSystem({
          metadata: { name: 'example-app', namespace: 'other-ns' },
        }),
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(
        { ...exampleInput, app: 'system:other-ns/example-app' },
        { secrets: { value: exampleMarker } },
      );

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toMatch(
        /^System "system:other-ns\/example-app" is outside the "default" namespace, and appSecrets\.pathPattern has no \{namespace\}/,
      );
      expectNoAwsCall();
    });

    it('refuses an app the user cannot read, as if it did not exist', async () => {
      const world = fakeWorld({
        system: undefined,
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'System "system:default/example-app" was not found, or the user cannot read it',
      );
      expectNoAwsCall();
    });

    it('refuses a System the catalog hides from the user, as one that cannot be read', async () => {
      const world = fakeWorld({
        systemHiddenFromUsers: true,
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'System "system:default/example-app" was not found, or the user cannot read it',
      );
      expectNoAwsCall();
    });

    it('refuses a caller that is not a user', async () => {
      const world = declaring();
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
        credentials: mockCredentials.service(),
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'only a signed-in user can work with app secrets',
      );
      expectNoAwsCall();
    });

    it('refuses a name no component declares for the environment', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: 'secrets:\n  - API_TOKEN\n' },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        'name "DATABASE_PASSWORD" is not declared for environment "dev" by any component of "system:default/example-app"; add it to "secrets" in config/{environment}.yaml',
      );
      expectNoAwsCall();
    });

    it('treats a missing declaration file as declaring nothing', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toMatch(/is not declared for environment "dev"/);
      expect(world.urlReader.readUrl).toHaveBeenCalledWith(
        exampleDeclarationUrl,
      );
      expectNoAwsCall();
    });

    it('fails with the file URL when a declaration is not valid YAML', async () => {
      const world = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: 'secrets: [DATABASE_PASSWORD\n' },
      });
      const { ctx } = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe(
        `The declaration ${exampleDeclarationUrl} is not valid YAML`,
      );
      expectNoAwsCall();
    });

    it('refuses a missing value, naming the key it looked for', async () => {
      const world = declaring();
      const { ctx } = contextWith(exampleInput, { secrets: undefined });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe('the task secret "value" holds no value');
      expectNoAwsCall();
    });

    it('refuses an empty value', async () => {
      const world = declaring();
      const { ctx } = contextWith(exampleInput, { secrets: { value: '' } });

      const error = await failureOf(run(world.deps, ctx));

      expect(error.message).toBe('the task secret "value" holds no value');
      expectNoAwsCall();
    });

    it('refuses an input key it does not declare, so a value cannot come in through the input', () => {
      const world = fakeWorld();
      const action = createRegisterAppSecretAction(world.deps);

      expect(action.schema?.input).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['app', 'environment', 'name'],
      });
    });
  });

  describe('the value', () => {
    it('never appears in a log line, an output or an error message, and is sent to AWS', async () => {
      const declared = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: exampleDeclaration },
      });
      const undeclared = fakeWorld({
        components: [exampleComponent('example-component')],
        files: { [exampleDeclarationUrl]: 'secrets:\n  - API_TOKEN\n' },
      });
      const seen: string[] = [];
      const record = (attempt: { logger: LoggerMock; output: jest.Mock }) => {
        seen.push(JSON.stringify(attempt.logger.info.mock.calls));
        seen.push(JSON.stringify(attempt.logger.warn.mock.calls));
        seen.push(JSON.stringify(attempt.output.mock.calls));
      };

      const created = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });
      await run(declared.deps, created.ctx);
      record(created);

      mockSecretsSend.mockImplementation(async command => {
        if (command instanceof CreateSecretCommand) {
          throw awsError('ResourceExistsException');
        }
        return { VersionId: 'example-version-id-2' };
      });
      const updated = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });
      await run(declared.deps, updated.ctx);
      record(updated);

      const refused = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });
      const refusal = await failureOf(run(undeclared.deps, refused.ctx));
      record(refused);
      seen.push(refusal.message);

      mockSecretsSend.mockReset();
      mockSecretsSend.mockRejectedValueOnce(awsError('AccessDeniedException'));
      const failed = contextWith(exampleInput, {
        secrets: { value: exampleMarker },
      });
      const failure = await failureOf(run(declared.deps, failed.ctx));
      record(failed);
      seen.push(failure.message);

      for (const text of seen) {
        expect(text).not.toContain(exampleMarker);
      }
      const sentToAws = JSON.stringify(
        mockSecretsSend.mock.calls.map(([command]) => command.input),
      );
      expect(sentToAws).toContain(exampleMarker);
    });
  });
});
