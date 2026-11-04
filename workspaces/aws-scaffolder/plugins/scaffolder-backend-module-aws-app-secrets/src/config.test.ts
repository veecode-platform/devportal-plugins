import { ConfigReader } from '@backstage/config';
import { DEFAULT_DECLARATION_FILE, readAppSecretsConfig } from './config';

const exampleSettings = {
  region: 'us-east-1',
  writerRoleArn: 'arn:aws:iam::123456789012:role/example-secret-writer',
  pathPattern: '/{cluster}/apps/{app}/{environment}/{name}',
  cluster: 'example-cluster',
  environments: ['dev'],
  reservedNames: ['PORT'],
  reservedPrefixes: ['OTEL_'],
};

function readWith(overrides: Record<string, unknown>) {
  return readAppSecretsConfig(
    new ConfigReader({ appSecrets: { ...exampleSettings, ...overrides } }),
  );
}

describe('readAppSecretsConfig', () => {
  it('reads the settings and applies the default declaration file', () => {
    expect(readWith({})).toEqual({
      ...exampleSettings,
      declarationFile: DEFAULT_DECLARATION_FILE,
    });
  });

  it('keeps a declaration file the app sets', () => {
    expect(
      readWith({ declarationFile: 'deploy/{environment}.yaml' })
        .declarationFile,
    ).toBe('deploy/{environment}.yaml');
  });

  it('refuses a missing appSecrets entry', () => {
    expect(() => readAppSecretsConfig(new ConfigReader({}))).toThrow(
      'appSecrets is not configured',
    );
  });

  it('refuses an unknown key, so a setting that does nothing cannot pass silently', () => {
    expect(() => readWith({ reservedName: ['PORT'] })).toThrow(
      /^appSecrets Unrecognized key\(s\) in object: 'reservedName'$/,
    );
  });

  it('refuses a writer role that is not an IAM role ARN', () => {
    expect(() =>
      readWith({ writerRoleArn: 'arn:aws:s3:::example-bucket' }),
    ).toThrow(
      'appSecrets.writerRoleArn must be an IAM role ARN: arn:aws:iam::<account>:role/<name>',
    );
  });

  it('refuses a path pattern without {name}', () => {
    expect(() =>
      readWith({ pathPattern: '/{cluster}/apps/{app}/{environment}' }),
    ).toThrow('appSecrets.pathPattern must contain {name}');
  });

  it('accepts {namespace} in the path pattern', () => {
    expect(
      readWith({
        pathPattern: '/{cluster}/{namespace}/apps/{app}/{environment}/{name}',
      }).pathPattern,
    ).toBe('/{cluster}/{namespace}/apps/{app}/{environment}/{name}');
  });

  it('refuses a path pattern with an unknown placeholder', () => {
    expect(() =>
      readWith({ pathPattern: '/apps/{app}/{environment}/{owner}/{name}' }),
    ).toThrow('appSecrets.pathPattern uses the unknown placeholder {owner}');
  });

  it('refuses a path pattern that uses {cluster} without a cluster', () => {
    expect(() => readWith({ cluster: undefined })).toThrow(
      'appSecrets.cluster is required because pathPattern uses {cluster}',
    );
  });

  it('refuses an empty list of environments', () => {
    expect(() => readWith({ environments: [] })).toThrow(
      'appSecrets.environments Array must contain at least 1 element(s)',
    );
  });

  it('refuses an environment name that could alter a path', () => {
    expect(() => readWith({ environments: ['dev/other'] })).toThrow(
      'appSecrets.environments.0 must start with a lowercase letter',
    );
  });

  it('refuses the same environment twice', () => {
    expect(() => readWith({ environments: ['dev', 'dev'] })).toThrow(
      'appSecrets.environments lists an environment more than once',
    );
  });

  it('refuses a declaration file that climbs out of the component folder', () => {
    expect(() =>
      readWith({ declarationFile: '../secrets/{environment}.yaml' }),
    ).toThrow('appSecrets.declarationFile must not contain a .. segment');
  });

  it('refuses an absolute declaration file', () => {
    expect(() =>
      readWith({ declarationFile: '/config/{environment}.yaml' }),
    ).toThrow(
      'appSecrets.declarationFile must be relative to the folder of each component',
    );
  });

  it('refuses a declaration file without {environment}', () => {
    expect(() => readWith({ declarationFile: 'config/dev.yaml' })).toThrow(
      'appSecrets.declarationFile must contain {environment}',
    );
  });

  it('refuses a missing list of reserved names', () => {
    expect(() => readWith({ reservedNames: undefined })).toThrow(
      /^appSecrets\.reservedNames /,
    );
  });
});
