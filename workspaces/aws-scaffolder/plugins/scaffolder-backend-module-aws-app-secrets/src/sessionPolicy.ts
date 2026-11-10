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
/** CreateSecret with tags also needs TagResource. PutSecretValue is left out: the login action never overwrites. */
const LOGIN_SECRET_ACTIONS = [
  'secretsmanager:CreateSecret',
  'secretsmanager:DescribeSecret',
  'secretsmanager:TagResource',
];
const LOGIN_CLIENT_ACTIONS = [
  'cognito-idp:ListUserPoolClients',
  'cognito-idp:DescribeUserPoolClient',
  'cognito-idp:CreateUserPoolClient',
];

interface Statement {
  Effect: 'Allow';
  Action: string[];
  Resource: string[];
}

/**
 * The session policy the writer role's AssumeRole carries. IAM grants a call
 * only where both the role and the session policy allow it, so the session
 * reaches the one secret this call names, whatever the role itself allows.
 */
export function writeSessionPolicy(options: {
  region: string;
  path: string;
}): string {
  return policy([
    allow(WRITE_ACTIONS, [secretArn(options.region, options.path)]),
  ]);
}

/**
 * The login action's session: the client actions on one user pool, and the
 * create-only secret actions on the three secrets it names. It has no
 * PutSecretValue and no GetSecretValue, so it can neither overwrite nor read.
 */
export function loginSessionPolicy(options: {
  secretsRegion: string;
  secretPaths: string[];
  userPoolRegion: string;
  userPoolId: string;
}): string {
  return policy([
    allow(LOGIN_CLIENT_ACTIONS, [
      `arn:aws:cognito-idp:${options.userPoolRegion}:*:userpool/${options.userPoolId}`,
    ]),
    allow(
      LOGIN_SECRET_ACTIONS,
      options.secretPaths.map(path => secretArn(options.secretsRegion, path)),
    ),
  ]);
}

/**
 * Describe-only, over the paths each name of the given globs can produce. The
 * list action passes one glob per configured environment.
 */
export function describeSessionPolicy(options: {
  region: string;
  globs: string[];
}): string {
  return policy([
    allow(
      DESCRIBE_ACTIONS,
      options.globs.map(glob => secretArn(options.region, glob)),
    ),
  ]);
}

function secretArn(region: string, path: string): string {
  return `arn:aws:secretsmanager:${region}:*:secret:${path}${SECRET_ARN_SUFFIX}`;
}

function allow(actions: string[], resources: string[]): Statement {
  return { Effect: 'Allow', Action: actions, Resource: resources };
}

function policy(statements: Statement[]): string {
  return JSON.stringify({ Version: POLICY_VERSION, Statement: statements });
}
