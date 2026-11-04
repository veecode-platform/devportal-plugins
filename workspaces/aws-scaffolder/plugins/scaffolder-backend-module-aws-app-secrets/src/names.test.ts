import type { AppSecretsSettings } from './config';
import { awsName, buildSecretPath, checkSecretName } from './names';

const settings: AppSecretsSettings = {
  region: 'us-east-1',
  writerRoleArn: 'arn:aws:iam::123456789012:role/example-secret-writer',
  pathPattern: '/{cluster}/apps/{app}/{environment}/{name}',
  cluster: 'example-cluster',
  environments: ['dev'],
  declarationFile: 'config/{environment}.yaml',
  reservedNames: ['PORT', 'OTEL_SERVICE_NAME'],
  reservedPrefixes: ['OTEL_'],
};

describe('checkSecretName', () => {
  it('accepts an upper case name that is neither reserved nor prefixed', () => {
    expect(() => checkSecretName('DATABASE_PASSWORD', settings)).not.toThrow();
  });

  it('refuses a name that is not upper case', () => {
    expect(() => checkSecretName('database_password', settings)).toThrow(
      'name "database_password" must be upper case letters, digits and underscores, starting with a letter',
    );
  });

  it('refuses a name that starts with a digit', () => {
    expect(() => checkSecretName('1TOKEN', settings)).toThrow(
      'must be upper case letters',
    );
  });

  it('refuses a reserved name', () => {
    expect(() => checkSecretName('PORT', settings)).toThrow(
      'name "PORT" is reserved for the platform',
    );
  });

  it('refuses a name that starts with a reserved prefix', () => {
    expect(() => checkSecretName('OTEL_EXPORTER_TOKEN', settings)).toThrow(
      'name "OTEL_EXPORTER_TOKEN" starts with the reserved prefix "OTEL_"',
    );
  });

  it('accepts a name that only contains a reserved name as part of it', () => {
    expect(() => checkSecretName('MY_PORT', settings)).not.toThrow();
  });
});

describe('buildSecretPath', () => {
  it('fills every placeholder of the pattern', () => {
    expect(
      buildSecretPath(settings.pathPattern, {
        cluster: 'example-cluster',
        app: 'example-app',
        environment: 'dev',
        name: 'DATABASE_PASSWORD',
      }),
    ).toBe('/example-cluster/apps/example-app/dev/DATABASE_PASSWORD');
  });

  it('leaves out {cluster} when the pattern does not use it', () => {
    expect(
      buildSecretPath('/apps/{app}/{environment}/{name}', {
        app: 'example-app',
        environment: 'dev',
        name: 'TOKEN',
      }),
    ).toBe('/apps/example-app/dev/TOKEN');
  });

  it('refuses a placeholder that has no value', () => {
    expect(() =>
      buildSecretPath(settings.pathPattern, {
        app: 'example-app',
        environment: 'dev',
        name: 'TOKEN',
      }),
    ).toThrow('the path pattern uses {cluster}, which has no value');
  });

  it('refuses a path that Secrets Manager would not accept', () => {
    expect(() =>
      buildSecretPath(settings.pathPattern, {
        cluster: 'example cluster',
        app: 'example-app',
        environment: 'dev',
        name: 'TOKEN',
      }),
    ).toThrow('is not a valid Secrets Manager name');
  });
});

describe('awsName', () => {
  it('keeps the characters AWS accepts in a session name', () => {
    expect(awsName('task-a+b=c,d.e@f-g_h', 64)).toBe('task-a+b=c,d.e@f-g_h');
  });

  it('replaces any other character with a hyphen', () => {
    expect(awsName('jane doe/ops', 64)).toBe('jane-doe-ops');
  });

  it('cuts the result to the maximum length', () => {
    expect(awsName('task-0123456789', 8)).toBe('task-012');
  });
});
