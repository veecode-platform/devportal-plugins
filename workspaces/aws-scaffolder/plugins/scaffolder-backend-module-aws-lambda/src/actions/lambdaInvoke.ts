import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { setTimeout as sleepFor } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import type { LambdaTarget } from '../config';

/**
 * The assumed-role session lasts one hour and the poll deadline counts from
 * AssumeRole, so no poll starts after 3000 seconds of it.
 */
const MAX_POLL_TIMEOUT_SECONDS = 3000;
const MAX_LOGGED_VALUE_LENGTH = 200;
const DEFAULT_SESSION_NAME = 'backstage-scaffolder';
const MAX_SESSION_NAME_LENGTH = 64;

export interface Clock {
  now(): number;
  /** Resolves when `ms` have passed or when `signal` aborts, whichever is first. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

const systemClock: Clock = {
  now: () => Date.now(),
  // An abort ends the wait early; the caller checks the signal after it.
  sleep: (ms, signal) =>
    sleepFor(ms, undefined, { signal }).then(
      () => undefined,
      () => undefined,
    ),
};

interface Invocation {
  statusCode: number;
  answer: unknown;
}

export function createLambdaInvokeAction(options: {
  targets: ReadonlyMap<string, LambdaTarget>;
  clock?: Clock;
}) {
  const { targets, clock = systemClock } = options;

  return createTemplateAction({
    id: 'aws:lambda:invoke',
    description:
      'Invokes an AWS Lambda function through a configured target alias and returns its JSON answer. With poll, repeats the poll payload until the answer matches.',
    schema: {
      input: {
        target: z =>
          z.string({
            description:
              'Alias of an entry in aws.lambdaTargets. A template never names an ARN.',
          }),
        payload: z =>
          z.record(z.string(), z.unknown(), {
            description: 'JSON object sent to the function as its event.',
          }),
        poll: z =>
          z
            .object(
              {
                payload: z.record(z.string(), z.unknown(), {
                  description: 'JSON object sent on every poll.',
                }),
                until: z.record(z.string(), z.unknown(), {
                  description:
                    'Top-level keys and values the answer must contain to stop polling. At least one key is required.',
                }),
                intervalSeconds: z
                  .number({ description: 'Seconds between polls.' })
                  .int()
                  .positive(),
                timeoutSeconds: z
                  .number({
                    description:
                      'Seconds, counted from the AssumeRole call, after which polling fails.',
                  })
                  .int()
                  .positive()
                  .max(MAX_POLL_TIMEOUT_SECONDS),
              },
              {
                description:
                  'Repeats the poll payload until the answer matches the until object.',
              },
            )
            .optional(),
      },
      output: {
        result: z =>
          z.unknown({
            description:
              'Parsed JSON answer of the function. With poll, the answer that matched.',
          }),
        statusCode: z =>
          z.number({
            description:
              'HTTP status code of the invocation that produced result.',
          }),
      },
    },
    async handler(ctx) {
      const target = targets.get(ctx.input.target);
      if (!target) {
        throw new Error(
          `Unknown Lambda target alias "${ctx.input.target}": it is not listed under aws.lambdaTargets.`,
        );
      }
      // The schema's JSON Schema cannot require a key, so the rule is enforced here.
      if (ctx.input.poll && Object.keys(ctx.input.poll.until).length === 0) {
        throw new Error(
          'poll.until must name at least one key of the answer, for example { "state": "ready" }.',
        );
      }
      if (ctx.signal?.aborted) {
        throw cancelledError(target.alias);
      }

      const startedAt = clock.now();
      const lambda = await lambdaClientFor(
        target,
        sessionNameFor(ctx.task?.id),
      );
      const first = await invoke(lambda, target, ctx.input.payload, ctx.signal);
      if (!ctx.input.poll) {
        ctx.output('result', first.answer);
        ctx.output('statusCode', first.statusCode);
        return;
      }

      const { payload, until, intervalSeconds, timeoutSeconds } =
        ctx.input.poll;
      const deadline = startedAt + timeoutSeconds * 1000;
      for (let attempt = 1; ; attempt += 1) {
        const remainingMs = deadline - clock.now();
        if (remainingMs <= 0) {
          throw timeoutError(target.alias, timeoutSeconds);
        }
        if (ctx.signal?.aborted) {
          throw cancelledError(target.alias);
        }
        await clock.sleep(
          Math.min(intervalSeconds * 1000, remainingMs),
          ctx.signal,
        );

        const answer = await invoke(lambda, target, payload, ctx.signal);
        const elapsedMs = clock.now() - startedAt;
        const matched = matchesUntil(answer.answer, until);
        const verdict = matched ? 'matched' : 'unmatched';
        const seconds = Math.round(elapsedMs / 1000);
        ctx.logger.info(
          [
            `Poll ${attempt} at ${seconds}s: ${verdict}`,
            ...describeUntil(answer.answer, until),
          ].join(' '),
        );
        if (matched) {
          ctx.output('result', answer.answer);
          ctx.output('statusCode', answer.statusCode);
          return;
        }
      }
    },
  });
}

function describeAwsError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : 'unknown error';
}

function cancelledError(alias: string): Error {
  return new Error(`Lambda call for target "${alias}" was cancelled`);
}

function timeoutError(alias: string, timeoutSeconds: number): Error {
  return new Error(
    `Lambda poll for target "${alias}" did not match within ${timeoutSeconds}s`,
  );
}

/**
 * The session name ties each AWS call to its scaffolder task in CloudTrail.
 * STS accepts only [\w+=,.@-], up to 64 characters.
 */
function sessionNameFor(taskId: string | undefined): string {
  if (!taskId) {
    return DEFAULT_SESSION_NAME;
  }
  return `${DEFAULT_SESSION_NAME}-${taskId}`
    .replace(/[^\w+=,.@-]/g, '-')
    .slice(0, MAX_SESSION_NAME_LENGTH);
}

async function lambdaClientFor(
  target: LambdaTarget,
  roleSessionName: string,
): Promise<LambdaClient> {
  const response = await new STSClient({ region: target.region })
    .send(
      new AssumeRoleCommand({
        RoleArn: target.roleArn,
        RoleSessionName: roleSessionName,
        ...(target.externalId ? { ExternalId: target.externalId } : {}),
      }),
    )
    .catch((error: unknown) => {
      throw new Error(
        `Could not assume the role for target "${
          target.alias
        }": ${describeAwsError(error)}`,
      );
    });

  const credentials = response.Credentials;
  if (
    !credentials?.AccessKeyId ||
    !credentials.SecretAccessKey ||
    !credentials.SessionToken
  ) {
    throw new Error(
      `Could not assume the role for target "${target.alias}": AssumeRole returned no credentials`,
    );
  }

  return new LambdaClient({
    region: target.region,
    // Invoke must run at most once per call: a network error after the function
    // started is reported, never retried.
    maxAttempts: 1,
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiration: credentials.Expiration,
    },
  });
}

async function invoke(
  lambda: LambdaClient,
  target: LambdaTarget,
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<Invocation> {
  if (signal?.aborted) {
    throw cancelledError(target.alias);
  }
  const response = await lambda
    .send(
      new InvokeCommand({
        FunctionName: target.functionArn,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload),
      }),
      { abortSignal: signal },
    )
    .catch((error: unknown) => {
      if (signal?.aborted) {
        throw cancelledError(target.alias);
      }
      throw new Error(
        `Lambda invoke failed for target "${target.alias}": ${describeAwsError(
          error,
        )}`,
      );
    });

  const body = new TextDecoder().decode(response.Payload);
  if (response.FunctionError) {
    throw new Error(functionErrorMessage(target.alias, body));
  }
  if (response.StatusCode === undefined) {
    throw new Error(
      `Lambda invoke for target "${target.alias}" returned no status code`,
    );
  }
  const parsed = parseJson(body);
  if (!parsed.ok) {
    throw new Error(
      `Lambda target '${target.alias}' returned a response that is not JSON`,
    );
  }
  return { statusCode: response.StatusCode, answer: parsed.value };
}

/**
 * Names the function's own message when it has one. Otherwise it names only
 * the error type, never the raw body or its stack trace.
 */
function functionErrorMessage(alias: string, body: string): string {
  const parsed = parseJson(body);
  const value = parsed.ok ? parsed.value : undefined;
  if (isRecord(value) && isNonEmptyString(value.errorMessage)) {
    return `Lambda function for target "${alias}" failed: ${value.errorMessage}`;
  }
  const errorType =
    isRecord(value) && isNonEmptyString(value.errorType)
      ? value.errorType
      : 'function error';
  return `Lambda target '${alias}' failed: ${errorType}`;
}

type ParsedJson = { ok: true; value: unknown } | { ok: false };

function parseJson(body: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function matchesUntil(
  answer: unknown,
  until: Record<string, unknown>,
): boolean {
  if (!isRecord(answer)) {
    return false;
  }
  return Object.entries(until).every(([key, expected]) =>
    isDeepStrictEqual(answer[key], expected),
  );
}

/**
 * Renders the answer's value for each key that `until` names. The task log
 * gets these keys only, so the rest of the answer never reaches it.
 */
function describeUntil(
  answer: unknown,
  until: Record<string, unknown>,
): string[] {
  const fields = isRecord(answer) ? answer : {};
  return Object.keys(until).map(key => `${key}=${renderValue(fields[key])}`);
}

/**
 * JSON-encodes the value, so strings get quotes and newlines or control
 * characters cannot split the log line. Clips a long value to 200 characters.
 */
function renderValue(value: unknown): string {
  if (value === undefined) {
    return '<missing>';
  }
  const rendered = JSON.stringify(value);
  return rendered.length > MAX_LOGGED_VALUE_LENGTH
    ? `${rendered.slice(0, MAX_LOGGED_VALUE_LENGTH)}…`
    : rendered;
}
