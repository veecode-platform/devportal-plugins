import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import type { LambdaTarget } from '../config';
import { type Clock, createLambdaInvokeAction } from './lambdaInvoke';

type LambdaInvokeContext = Parameters<
  ReturnType<typeof createLambdaInvokeAction>['handler']
>[0];

const mockStsSend = jest.fn();
const mockLambdaSend = jest.fn();

jest.mock('@aws-sdk/client-sts', () => ({
  ...jest.requireActual('@aws-sdk/client-sts'),
  STSClient: jest.fn(() => ({ send: mockStsSend })),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  ...jest.requireActual('@aws-sdk/client-lambda'),
  LambdaClient: jest.fn(() => ({ send: mockLambdaSend })),
}));

const exampleTarget: LambdaTarget = {
  alias: 'example-target',
  roleArn: 'arn:aws:iam::123456789012:role/example-scaffolder-role',
  functionArn:
    'arn:aws:lambda:us-east-1:123456789012:function:example-function',
  region: 'us-east-1',
};

const otherTarget: LambdaTarget = {
  alias: 'other-target',
  roleArn: 'arn:aws:iam::123456789012:role/other-scaffolder-role',
  functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:other-function',
  region: 'us-east-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStsSend.mockReset();
  mockLambdaSend.mockReset();
  mockStsSend.mockResolvedValue({
    Credentials: {
      AccessKeyId: 'example-access-key-id',
      SecretAccessKey: 'example-secret-access-key',
      SessionToken: 'example-session-token',
      Expiration: new Date('2030-01-01T00:00:00Z'),
    },
  });
});

function fakeClock(): Clock {
  let now = 0;
  return {
    now: () => now,
    sleep: async ms => {
      now += ms;
    },
  };
}

function actionFor(...targets: LambdaTarget[]) {
  return createLambdaInvokeAction({
    targets: new Map(targets.map(target => [target.alias, target])),
    clock: fakeClock(),
  });
}

function contextWith(input: LambdaInvokeContext['input']): LambdaInvokeContext {
  return {
    ...createMockActionContext(),
    input,
  } as unknown as LambdaInvokeContext;
}

function encode(body: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(body));
}

function lambdaInputs(): Array<Record<string, unknown>> {
  return mockLambdaSend.mock.calls.map(([command]) => command.input);
}

function assumeRoleInputs(): Array<Record<string, unknown>> {
  return mockStsSend.mock.calls.map(([command]) => command.input);
}

async function failureOf(run: Promise<unknown>): Promise<Error> {
  const outcome = await run.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(outcome instanceof Error)) {
    throw new Error('expected the step to fail');
  }
  return outcome;
}

describe('aws:lambda:invoke', () => {
  it('invokes the target function with the payload and returns its answer', async () => {
    mockLambdaSend.mockResolvedValue({
      StatusCode: 200,
      Payload: encode({ status: 'created' }),
    });
    const ctx = contextWith({
      target: 'example-target',
      payload: { name: 'demo' },
    });

    await actionFor(exampleTarget, otherTarget).handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('result', { status: 'created' });
    expect(ctx.output).toHaveBeenCalledWith('statusCode', 200);
    expect(assumeRoleInputs()[0].RoleArn).toBe(exampleTarget.roleArn);
    expect(lambdaInputs()).toEqual([
      {
        FunctionName: exampleTarget.functionArn,
        InvocationType: 'RequestResponse',
        Payload: '{"name":"demo"}',
      },
    ]);
  });

  it('refuses an unknown alias before any AWS call, without listing the configured aliases', async () => {
    const ctx = contextWith({ target: 'missing-target', payload: {} });

    const error = await failureOf(
      actionFor(exampleTarget, otherTarget).handler(ctx),
    );

    expect(error.message).toBe(
      'Unknown Lambda target alias "missing-target": it is not listed under aws.lambdaTargets.',
    );
    expect(mockStsSend).not.toHaveBeenCalled();
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('fails the step with the function error message', async () => {
    mockLambdaSend.mockResolvedValue({
      StatusCode: 200,
      FunctionError: 'Unhandled',
      Payload: encode({
        errorMessage: 'Customer record is missing',
        errorType: 'Error',
      }),
    });
    const ctx = contextWith({ target: 'example-target', payload: {} });

    const error = await failureOf(actionFor(exampleTarget).handler(ctx));

    expect(error.message).toBe(
      'Lambda function for target "example-target" failed: Customer record is missing',
    );
    expect(ctx.output).not.toHaveBeenCalled();
  });

  it('fails the step with the AWS error name and message when the role cannot be assumed', async () => {
    mockStsSend.mockRejectedValue(
      Object.assign(
        new Error('User is not authorized to perform: sts:AssumeRole'),
        {
          name: 'AccessDenied',
        },
      ),
    );
    const ctx = contextWith({ target: 'example-target', payload: {} });

    const error = await failureOf(actionFor(exampleTarget).handler(ctx));

    expect(error.message).toBe(
      'Could not assume the role for target "example-target": AccessDenied: User is not authorized to perform: sts:AssumeRole',
    );
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('stops polling at the first matching answer and logs each poll', async () => {
    mockLambdaSend
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ status: 'created' }),
      })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ state: 'pending' }),
      })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ state: 'pending' }),
      })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ state: 'ready', id: 'abc' }),
      });
    const ctx = contextWith({
      target: 'example-target',
      payload: {},
      poll: {
        payload: { id: 'abc' },
        until: { state: 'ready' },
        intervalSeconds: 10,
        timeoutSeconds: 60,
      },
    });
    const info = jest.spyOn(ctx.logger, 'info');

    await actionFor(exampleTarget).handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('result', {
      state: 'ready',
      id: 'abc',
    });
    expect(ctx.output).toHaveBeenCalledWith('statusCode', 200);
    const invocations = lambdaInputs();
    expect(invocations).toHaveLength(4);
    expect(invocations[1].Payload).toBe('{"id":"abc"}');
    expect(info.mock.calls.map(call => call[0])).toEqual([
      'Poll 1 at 10s: unmatched state=pending',
      'Poll 2 at 20s: unmatched state=pending',
      'Poll 3 at 30s: matched state=ready',
    ]);
  });

  it('logs only the until keys of each poll, never the rest of the answer', async () => {
    mockLambdaSend
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ status: 'created' }),
      })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ state: 'pending', secret: 'do-not-log' }),
      })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode(null),
      })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ state: 'ready', attempts: 3, secret: 'do-not-log' }),
      });
    const ctx = contextWith({
      target: 'example-target',
      payload: {},
      poll: {
        payload: {},
        until: { state: 'ready', attempts: 3 },
        intervalSeconds: 10,
        timeoutSeconds: 60,
      },
    });
    const info = jest.spyOn(ctx.logger, 'info');

    await actionFor(exampleTarget).handler(ctx);

    expect(info.mock.calls.map(call => call[0])).toEqual([
      'Poll 1 at 10s: unmatched state=pending attempts=<missing>',
      'Poll 2 at 20s: unmatched state=<missing> attempts=<missing>',
      'Poll 3 at 30s: matched state=ready attempts=3',
    ]);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('do-not-log');
  });

  it('fails the step when no poll matches before the timeout', async () => {
    mockLambdaSend.mockResolvedValue({
      StatusCode: 200,
      Payload: encode({ state: 'pending' }),
    });
    const ctx = contextWith({
      target: 'example-target',
      payload: {},
      poll: {
        payload: {},
        until: { state: 'ready' },
        intervalSeconds: 10,
        timeoutSeconds: 30,
      },
    });
    const info = jest.spyOn(ctx.logger, 'info');

    const error = await failureOf(actionFor(exampleTarget).handler(ctx));

    expect(error.message).toBe(
      'Lambda poll for target "example-target" did not match within 30s',
    );
    // The first invoke, then polls at 10, 20 and 30 seconds.
    expect(mockLambdaSend).toHaveBeenCalledTimes(4);
    expect(info).toHaveBeenCalledTimes(3);
    expect(ctx.output).not.toHaveBeenCalled();
  });

  it('passes the external ID when the target configures one', async () => {
    mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: encode({}) });
    const externalTarget: LambdaTarget = {
      ...exampleTarget,
      alias: 'external-target',
      externalId: 'example-external-id',
    };

    await actionFor(externalTarget).handler(
      contextWith({ target: 'external-target', payload: {} }),
    );

    expect(assumeRoleInputs()[0].ExternalId).toBe('example-external-id');
  });

  it('sends no external ID when the target does not configure one', async () => {
    mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: encode({}) });

    await actionFor(exampleTarget).handler(
      contextWith({ target: 'example-target', payload: {} }),
    );

    expect(assumeRoleInputs()[0].ExternalId).toBeUndefined();
  });
});
