import {
  CreateSecretCommand,
  DescribeSecretCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
  type Tag,
  TagResourceCommand,
} from '@aws-sdk/client-secrets-manager';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

export interface WriterSession {
  region: string;
  roleArn: string;
  roleSessionName: string;
  sourceIdentity: string;
}

export interface SecretState {
  hasValue: boolean;
  lastChangedDate?: string;
}

export interface WriteResult {
  created: boolean;
  versionId: string;
}

/**
 * Assumes the writer role for one call. The session name ties the call to its
 * task in CloudTrail and the source identity names the user who started it.
 */
export async function writerClient(
  session: WriterSession,
): Promise<SecretsManagerClient> {
  const response = await new STSClient({ region: session.region })
    .send(
      new AssumeRoleCommand({
        RoleArn: session.roleArn,
        RoleSessionName: session.roleSessionName,
        SourceIdentity: session.sourceIdentity,
      }),
    )
    .catch((error: unknown) => {
      throw new Error(`Could not assume the writer role: ${errorName(error)}`);
    });

  const credentials = response.Credentials;
  if (
    !credentials?.AccessKeyId ||
    !credentials.SecretAccessKey ||
    !credentials.SessionToken
  ) {
    throw new Error(
      'Could not assume the writer role: AssumeRole returned no credentials',
    );
  }

  return new SecretsManagerClient({
    region: session.region,
    // A network error after a write started fails the step instead of writing twice.
    maxAttempts: 1,
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
  });
}

/**
 * Creates the secret. Only when it already exists does it write a new version
 * and retag it, so a changed value is never reported as done while the old one
 * stays in place.
 */
export async function writeSecret(
  client: SecretsManagerClient,
  options: { path: string; value: string; tags: Tag[] },
): Promise<WriteResult> {
  const { path, value, tags } = options;
  const creation = await client
    .send(
      new CreateSecretCommand({ Name: path, SecretString: value, Tags: tags }),
    )
    .then(
      response => ({ exists: false as const, versionId: response.VersionId }),
      (error: unknown) => {
        if (errorName(error) !== 'ResourceExistsException') {
          throw awsFailure('CreateSecret', path, error);
        }
        return { exists: true as const };
      },
    );
  if (!creation.exists) {
    return {
      created: true,
      versionId: requireVersion(creation.versionId, path),
    };
  }

  const put = await client
    .send(new PutSecretValueCommand({ SecretId: path, SecretString: value }))
    .catch((error: unknown) => {
      throw awsFailure('PutSecretValue', path, error);
    });
  await client
    .send(new TagResourceCommand({ SecretId: path, Tags: tags }))
    .catch((error: unknown) => {
      throw awsFailure('TagResource', path, error);
    });
  return { created: false, versionId: requireVersion(put.VersionId, path) };
}

/**
 * Reads metadata only. A secret scheduled for deletion has no value an app can
 * use, so it counts as missing.
 */
export async function describeSecret(
  client: SecretsManagerClient,
  path: string,
): Promise<SecretState> {
  try {
    const response = await client.send(
      new DescribeSecretCommand({ SecretId: path }),
    );
    if (response.DeletedDate) {
      return { hasValue: false };
    }
    return {
      hasValue: true,
      ...(response.LastChangedDate
        ? { lastChangedDate: response.LastChangedDate.toISOString() }
        : {}),
    };
  } catch (error) {
    if (errorName(error) === 'ResourceNotFoundException') {
      return { hasValue: false };
    }
    throw awsFailure('DescribeSecret', path, error);
  }
}

function requireVersion(versionId: string | undefined, path: string): string {
  if (!versionId) {
    throw new Error(`Secrets Manager returned no version id for ${path}`);
  }
  return versionId;
}

function awsFailure(operation: string, path: string, error: unknown): Error {
  return new Error(`${operation} failed for ${path}: ${errorName(error)}`);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
