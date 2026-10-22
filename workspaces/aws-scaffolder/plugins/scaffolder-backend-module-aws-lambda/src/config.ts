import type { Config } from '@backstage/config';
import { z } from 'zod';

const ROLE_ARN_PATTERN = /^arn:aws[a-zA-Z-]*:iam::\d{12}:role\/.+$/;
const FUNCTION_ARN_PATTERN =
  /^arn:aws[a-zA-Z-]*:lambda:[a-z0-9-]+:\d{12}:function:.+$/;

const lambdaTargetSchema = z
  .object({
    alias: z.string().min(1),
    roleArn: z
      .string()
      .regex(
        ROLE_ARN_PATTERN,
        'must be an IAM role ARN: arn:aws:iam::<account>:role/<name>',
      ),
    functionArn: z
      .string()
      .regex(
        FUNCTION_ARN_PATTERN,
        'must be a Lambda function ARN: arn:aws:lambda:<region>:<account>:function:<name>',
      ),
    region: z.string().min(1),
    externalId: z.string().min(1).optional(),
  })
  .strict();

export type LambdaTarget = z.infer<typeof lambdaTargetSchema>;

/**
 * Reads `aws.lambdaTargets` into a map keyed by alias. The module calls this
 * once at start, so a malformed entry stops the module before any template runs.
 */
export function readLambdaTargets(
  config: Config,
): ReadonlyMap<string, LambdaTarget> {
  const targets = new Map<string, LambdaTarget>();
  const entries = config.getOptionalConfigArray('aws.lambdaTargets') ?? [];
  entries.forEach((entry, index) => {
    const raw = entry.get();
    const parsed = lambdaTargetSchema.safeParse(raw);
    if (!parsed.success) {
      const alias =
        typeof raw === 'object' &&
        raw !== null &&
        !Array.isArray(raw) &&
        typeof raw.alias === 'string'
          ? ` (alias "${raw.alias}")`
          : '';
      const details = parsed.error.issues
        .map(issue => `${issue.path.join('.') || 'entry'} ${issue.message}`)
        .join('; ');
      throw new Error(`aws.lambdaTargets[${index}]${alias}: ${details}`);
    }
    const target = parsed.data;
    if (targets.has(target.alias)) {
      throw new Error(
        `aws.lambdaTargets lists the alias "${target.alias}" more than once`,
      );
    }
    targets.set(target.alias, target);
  });
  return targets;
}
