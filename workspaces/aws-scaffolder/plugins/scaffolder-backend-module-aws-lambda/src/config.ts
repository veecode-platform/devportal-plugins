import type { Config } from '@backstage/config';
import { z } from 'zod';

const lambdaTargetSchema = z.object({
  alias: z.string().min(1),
  roleArn: z.string().min(1),
  functionArn: z.string().min(1),
  region: z.string().min(1),
  externalId: z.string().min(1).optional(),
});

export type LambdaTarget = z.infer<typeof lambdaTargetSchema>;

/**
 * Reads `aws.lambdaTargets` into a map keyed by alias. The module calls this
 * once at start, so a malformed entry stops the module before any template runs.
 */
export function readLambdaTargets(
  config: Config,
): ReadonlyMap<string, LambdaTarget> {
  const targets = new Map<string, LambdaTarget>();
  for (const entry of config.getOptionalConfigArray('aws.lambdaTargets') ?? []) {
    const target = lambdaTargetSchema.parse(entry.get());
    if (targets.has(target.alias)) {
      throw new Error(
        `aws.lambdaTargets lists the alias "${target.alias}" more than once`,
      );
    }
    targets.set(target.alias, target);
  }
  return targets;
}
