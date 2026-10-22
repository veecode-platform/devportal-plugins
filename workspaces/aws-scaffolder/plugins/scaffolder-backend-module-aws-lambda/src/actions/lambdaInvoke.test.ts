import { LambdaClient } from '@aws-sdk/client-lambda';
import { STSClient } from '@aws-sdk/client-sts';
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

const exampleTaskId = 'example-task-id';

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

type FakeClock = Clock & { advance(ms: number): void };

let clock: FakeClock;

beforeEach(() => {
  let now = 0;
  clock = {
    now: () => now,
    sleep: async ms => {
      now += ms;
    },
    advance: ms => {
      now += ms;
    },
  };
});

function actionFor(...targets: LambdaTarget[]) {
  return createLambdaInvokeAction({
    targets: new Map(targets.map(target => [target.alias, target])),
    clock,
  });
}

function contextWith(
  input: LambdaInvokeContext['input'],
  options: { signal?: AbortSignal; taskId?: string | null } = {},
): LambdaInvokeContext {
  const taskId = options.taskId === undefined ? exampleTaskId : options.taskId;
  return {
    ...createMockActionContext(),
    input,
    task: taskId === null ? undefined : { id: taskId },
    signal: options.signal,
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
      'Poll 1 at 10s: unmatched state="pending"',
      'Poll 2 at 20s: unmatched state="pending"',
      'Poll 3 at 30s: matched state="ready"',
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
      'Poll 1 at 10s: unmatched state="pending" attempts=<missing>',
      'Poll 2 at 20s: unmatched state=<missing> attempts=<missing>',
      'Poll 3 at 30s: matched state="ready" attempts=3',
    ]);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('do-not-log');
  });

  it('escapes a multi-line until value in the poll log', async () => {
    mockLambdaSend
      .mockResolvedValueOnce({ StatusCode: 200, Payload: encode({}) })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ note: 'line one\nline two\u0007' }),
      });
    const ctx = contextWith({
      target: 'example-target',
      payload: {},
      poll: {
        payload: {},
        until: { note: 'line one\nline two\u0007' },
        intervalSeconds: 10,
        timeoutSeconds: 60,
      },
    });
    const info = jest.spyOn(ctx.logger, 'info');

    await actionFor(exampleTarget).handler(ctx);

    expect(info.mock.calls.map(call => call[0])).toEqual([
      'Poll 1 at 10s: matched note="line one\\nline two\\u0007"',
    ]);
  });

  it('clips a long until value to 200 characters with an ellipsis', async () => {
    const long = 'x'.repeat(300);
    mockLambdaSend
      .mockResolvedValueOnce({ StatusCode: 200, Payload: encode({}) })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: encode({ blob: long }),
      });
    const ctx = contextWith({
      target: 'example-target',
      payload: {},
      poll: {
        payload: {},
        until: { blob: long },
        intervalSeconds: 10,
        timeoutSeconds: 60,
      },
    });
    const info = jest.spyOn(ctx.logger, 'info');

    await actionFor(exampleTarget).handler(ctx);

    // 200 characters of the JSON-encoded value, the opening quote included.
    expect(info.mock.calls.map(call => call[0])).toEqual([
      `Poll 1 at 10s: matched blob="${'x'.repeat(199)}…`,
    ]);
  });

  it('refuses a poll whose until object has no keys, before any AWS call', async () => {
    const ctx = contextWith({
      target: 'example-target',
      payload: {},
      poll: {
        payload: {},
        until: {},
        intervalSeconds: 10,
        timeoutSeconds: 60,
      },
    });

    const error = await failureOf(actionFor(exampleTarget).handler(ctx));

    expect(error.message).toBe(
      'poll.until must name at least one key of the answer, for example { "state": "ready" }.',
    );
    expect(mockStsSend).not.toHaveBeenCalled();
    expect(mockLambdaSend).not.toHaveBeenCalled();
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

  it('counts the poll timeout from the AssumeRole call, so a slow first invoke shortens the polling', async () => {
    mockLambdaSend.mockImplementationOnce(async () => {
      clock.advance(25_000);
      return { StatusCode: 200, Payload: encode({ state: 'pending' }) };
    });
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
    // The first invoke, then one poll at 30 seconds, the deadline. No poll follows it.
    expect(mockLambdaSend).toHaveBeenCalledTimes(2);
    expect(info.mock.calls.map(call => call[0])).toEqual([
      'Poll 1 at 30s: unmatched state="pending"',
    ]);
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

  it('builds the clients with the assumed credentials, the target region, and no SDK retries', async () => {
    mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: encode({}) });

    await actionFor(exampleTarget).handler(
      contextWith({ target: 'example-target', payload: {} }),
    );

    expect(jest.mocked(STSClient)).toHaveBeenCalledWith({
      region: 'us-east-1',
    });
    expect(jest.mocked(LambdaClient)).toHaveBeenCalledWith({
      region: 'us-east-1',
      maxAttempts: 1,
      credentials: {
        accessKeyId: 'example-access-key-id',
        secretAccessKey: 'example-secret-access-key',
        sessionToken: 'example-session-token',
        expiration: new Date('2030-01-01T00:00:00Z'),
      },
    });
  });

  it('names the assumed session after the task', async () => {
    mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: encode({}) });

    await actionFor(exampleTarget).handler(
      contextWith({ target: 'example-target', payload: {} }),
    );

    expect(assumeRoleInputs()[0].RoleSessionName).toBe(
      `backstage-scaffolder-${exampleTaskId}`,
    );
  });

  it('falls back to the plain session name when no task id is available', async () => {
    mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: encode({}) });

    await actionFor(exampleTarget).handler(
      contextWith({ target: 'example-target', payload: {} }, { taskId: null }),
    );

    expect(assumeRoleInputs()[0].RoleSessionName).toBe('backstage-scaffolder');
  });

  it('limits the session name to the STS character set and 64 characters', async () => {
    mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: encode({}) });

    await actionFor(exampleTarget).handler(
      contextWith(
        { target: 'example-target', payload: {} },
        { taskId: 'example task/with spaces '.repeat(4) },
      ),
    );

    const sessionName = assumeRoleInputs()[0].RoleSessionName as string;
    expect(sessionName).toHaveLength(64);
    expect(sessionName).toMatch(/^[\w+=,.@-]+$/);
    expect(
      sessionName.startsWith('backstage-scaffolder-example-task-with'),
    ).toBe(true);
  });

  it('stops before any AWS call when the task is cancelled before it starts', async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await failureOf(
      actionFor(exampleTarget).handler(
        contextWith(
          { target: 'example-target', payload: {} },
          { signal: controller.signal },
        ),
      ),
    );

    expect(error.message).toBe(
      'Lambda call for target "example-target" was cancelled',
    );
    expect(mockStsSend).not.toHaveBeenCalled();
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('passes the task signal to the invoke, so a cancelled task aborts it', async () => {
    const controller = new AbortController();
    mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: encode({}) });

    await actionFor(exampleTarget).handler(
      contextWith(
        { target: 'example-target', payload: {} },
        { signal: controller.signal },
      ),
    );

    expect(mockLambdaSend.mock.calls[0][1].abortSignal).toBe(controller.signal);
  });

  it('reports an invoke cut short by the cancellation as cancelled', async () => {
    const controller = new AbortController();
    mockLambdaSend.mockImplementation(() => {
      controller.abort();
      return Promise.reject(
        Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        }),
      );
    });

    const error = await failureOf(
      actionFor(exampleTarget).handler(
        contextWith(
          { target: 'example-target', payload: {} },
          { signal: controller.signal },
        ),
      ),
    );

    expect(error.message).toBe(
      'Lambda call for target "example-target" was cancelled',
    );
  });

  it('stops a poll sleep at once when the task is cancelled during it', async () => {
    const controller = new AbortController();
    mockLambdaSend.mockResolvedValue({
      StatusCode: 200,
      Payload: encode({ state: 'pending' }),
    });
    const ctx = contextWith(
      {
        target: 'example-target',
        payload: {},
        poll: {
          payload: {},
          until: { state: 'ready' },
          intervalSeconds: 1,
          timeoutSeconds: 60,
        },
      },
      { signal: controller.signal },
    );
    // The real clock: the poll sleeps for a full second unless the task is cancelled.
    const action = createLambdaInvokeAction({
      targets: new Map([[exampleTarget.alias, exampleTarget]]),
    });
    const started = Date.now();
    setTimeout(() => controller.abort(), 50);

    const error = await failureOf(action.handler(ctx));

    expect(error.message).toBe(
      'Lambda call for target "example-target" was cancelled',
    );
    expect(Date.now() - started).toBeLessThan(900);
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'a non-JSON body',
      new TextEncoder().encode('RAW_SECRET_BODY at line 4'),
      "Lambda target 'example-target' failed: function error",
    ],
    [
      'a null body',
      encode(null),
      "Lambda target 'example-target' failed: function error",
    ],
    [
      'no errorMessage, naming the errorType only',
      encode({ errorType: 'TypeError', stackTrace: ['at secret-frame'] }),
      "Lambda target 'example-target' failed: TypeError",
    ],
  ])(
    'fails a FunctionError with %s without leaking the body',
    async (_name, payload, expected) => {
      mockLambdaSend.mockResolvedValue({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: payload,
      });

      const error = await failureOf(
        actionFor(exampleTarget).handler(
          contextWith({ target: 'example-target', payload: {} }),
        ),
      );

      expect(error.message).toBe(expected);
      expect(error.message).not.toContain('RAW_SECRET_BODY');
      expect(error.message).not.toContain('secret-frame');
    },
  );

  it.each([
    ['an empty payload', new Uint8Array()],
    ['an undefined payload', undefined],
    [
      'a non-JSON payload',
      new TextEncoder().encode('<html>internal page</html>'),
    ],
  ])(
    'fails a 200 answer with %s, naming the target',
    async (_name, payload) => {
      mockLambdaSend.mockResolvedValue({ StatusCode: 200, Payload: payload });

      const error = await failureOf(
        actionFor(exampleTarget).handler(
          contextWith({ target: 'example-target', payload: {} }),
        ),
      );

      expect(error.message).toBe(
        "Lambda target 'example-target' returned a response that is not JSON",
      );
      expect(error.message).not.toContain('internal page');
    },
  );

  it('fails a poll answer that is not JSON, with the same message', async () => {
    mockLambdaSend
      .mockResolvedValueOnce({ StatusCode: 200, Payload: encode({}) })
      .mockResolvedValueOnce({
        StatusCode: 200,
        Payload: new TextEncoder().encode('not json'),
      });
    const ctx = contextWith({
      target: 'example-target',
      payload: {},
      poll: {
        payload: {},
        until: { state: 'ready' },
        intervalSeconds: 10,
        timeoutSeconds: 60,
      },
    });

    const error = await failureOf(actionFor(exampleTarget).handler(ctx));

    expect(error.message).toBe(
      "Lambda target 'example-target' returned a response that is not JSON",
    );
    expect(ctx.output).not.toHaveBeenCalled();
  });
});
