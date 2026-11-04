const POLICY_VERSION = '2012-10-17';
/** AWS appends six random characters to a secret's name in its ARN. */
const SECRET_ARN_SUFFIX = '-??????';
const WRITE_ACTIONS = [
  'secretsmanager:CreateSecret',
  'secretsmanager:PutSecretValue',
  'secretsmanager:TagResource',
  'secretsmanager:DescribeSecret',
];
const DESCRIBE_ACTIONS = ['secretsmanager:DescribeSecret'];

/**
 * The session policy the writer role's AssumeRole carries. IAM grants a call
 * only where both the role and the session policy allow it, so the session
 * reaches the one secret this call names, whatever the role itself allows.
 */
export function writeSessionPolicy(options: {
  region: string;
  path: string;
}): string {
  return allowPolicy(WRITE_ACTIONS, [secretArn(options.region, options.path)]);
}

/**
 * Describe-only, over the paths each name of the given globs can produce. The
 * list action passes one glob per configured environment.
 */
export function describeSessionPolicy(options: {
  region: string;
  globs: string[];
}): string {
  return allowPolicy(
    DESCRIBE_ACTIONS,
    options.globs.map(glob => secretArn(options.region, glob)),
  );
}

function secretArn(region: string, path: string): string {
  return `arn:aws:secretsmanager:${region}:*:secret:${path}${SECRET_ARN_SUFFIX}`;
}

function allowPolicy(actions: string[], resources: string[]): string {
  return JSON.stringify({
    Version: POLICY_VERSION,
    Statement: [{ Effect: 'Allow', Action: actions, Resource: resources }],
  });
}
