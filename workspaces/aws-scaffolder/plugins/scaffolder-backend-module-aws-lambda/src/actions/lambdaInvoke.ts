import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { isDeepStrictEqual } from 'node:util';
import type { LambdaTarget } from '../config';

/** The assumed-role session lasts one hour, so every poll has to finish inside it. */
const MAX_POLL_TIMEOUT_SECONDS = 3000;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const systemClock: Clock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
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
                    'Top-level keys and values the answer must contain to stop polling.',
                }),
                intervalSeconds: z
                  .number({ description: 'Seconds between polls.' })
                  .int()
                  .positive(),
                timeoutSeconds: z
                  .number({ description: 'Seconds after which polling fails.' })
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

      const lambda = await lambdaClientFor(target);
      const first = await invoke(lambda, target, ctx.input.payload);
      if (!ctx.input.poll) {
        ctx.output('result', first.answer);
        ctx.output('statusCode', first.statusCode);
        return;
      }

      const { payload, until, intervalSeconds, timeoutSeconds } =
        ctx.input.poll;
      const startedAt = clock.now();
      for (let attempt = 1; ; attempt += 1) {
        const remainingMs = timeoutSeconds * 1000 - (clock.now() - startedAt);
        await clock.sleep(Math.min(intervalSeconds * 1000, remainingMs));

        const answer = await invoke(lambda, target, payload);
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
        if (elapsedMs >= timeoutSeconds * 1000) {
          throw new Error(
            `Lambda poll for target "${target.alias}" did not match within ${timeoutSeconds}s`,
          );
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

async function lambdaClientFor(target: LambdaTarget): Promise<LambdaClient> {
  const response = await new STSClient({ region: target.region })
    .send(
      new AssumeRoleCommand({
        RoleArn: target.roleArn,
        RoleSessionName: 'backstage-scaffolder',
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
): Promise<Invocation> {
  const response = await lambda
    .send(
      new InvokeCommand({
        FunctionName: target.functionArn,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload),
      }),
    )
    .catch((error: unknown) => {
      throw new Error(
        `Lambda invoke failed for target "${target.alias}": ${describeAwsError(
          error,
        )}`,
      );
    });

  const body = new TextDecoder().decode(response.Payload);
  if (response.FunctionError) {
    const { errorMessage } = JSON.parse(body) as { errorMessage?: string };
    throw new Error(
      `Lambda function for target "${target.alias}" failed: ${
        errorMessage ?? body
      }`,
    );
  }
  if (response.StatusCode === undefined) {
    throw new Error(
      `Lambda invoke for target "${target.alias}" returned no status code`,
    );
  }
  return { statusCode: response.StatusCode, answer: JSON.parse(body) };
}

function matchesUntil(
  answer: unknown,
  until: Record<string, unknown>,
): boolean {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return false;
  }
  const fields = answer as Record<string, unknown>;
  return Object.entries(until).every(([key, expected]) =>
    isDeepStrictEqual(fields[key], expected),
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
  const fields =
    typeof answer === 'object' && answer !== null && !Array.isArray(answer)
      ? (answer as Record<string, unknown>)
      : {};
  return Object.keys(until).map(key => `${key}=${renderValue(fields[key])}`);
}

function renderValue(value: unknown): string {
  if (value === undefined) {
    return '<missing>';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}
