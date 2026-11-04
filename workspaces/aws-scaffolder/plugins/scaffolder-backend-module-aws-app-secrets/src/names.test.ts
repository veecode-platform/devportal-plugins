import type { AppSecretsSettings } from './config';
import { exampleSystem } from './fixtures';
import {
  awsName,
  buildSecretPath,
  checkSecretName,
  pathIdentity,
  secretPathGlob,
} from './names';

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
        namespace: 'default',
        app: 'example-app',
        environment: 'dev',
        name: 'DATABASE_PASSWORD',
      }),
    ).toBe('/example-cluster/apps/example-app/dev/DATABASE_PASSWORD');
  });

  it('puts the namespace of the System in the path when the pattern names it', () => {
    expect(
      buildSecretPath(
        '/{cluster}/{namespace}/apps/{app}/{environment}/{name}',
        {
          cluster: 'example-cluster',
          namespace: 'other-ns',
          app: 'example-app',
          environment: 'dev',
          name: 'TOKEN',
        },
      ),
    ).toBe('/example-cluster/other-ns/apps/example-app/dev/TOKEN');
  });

  it('leaves out {cluster} when the pattern does not use it', () => {
    expect(
      buildSecretPath('/apps/{app}/{environment}/{name}', {
        app: 'example-app',
        namespace: 'default',
        environment: 'dev',
        name: 'TOKEN',
      }),
    ).toBe('/apps/example-app/dev/TOKEN');
  });

  it('refuses a placeholder that has no value', () => {
    expect(() =>
      buildSecretPath(settings.pathPattern, {
        app: 'example-app',
        namespace: 'default',
        environment: 'dev',
        name: 'TOKEN',
      }),
    ).toThrow('the path pattern uses {cluster}, which has no value');
  });

  it('refuses a path that Secrets Manager would not accept', () => {
    expect(() =>
      buildSecretPath(settings.pathPattern, {
        cluster: 'example cluster',
        namespace: 'default',
        app: 'example-app',
        environment: 'dev',
        name: 'TOKEN',
      }),
    ).toThrow('is not a valid Secrets Manager name');
  });
});

describe('pathIdentity', () => {
  it('names a System of the default namespace without needing {namespace}', () => {
    expect(
      pathIdentity(
        exampleSystem(),
        '/{cluster}/apps/{app}/{environment}/{name}',
      ),
    ).toEqual({ app: 'example-app', namespace: 'default' });
  });

  it('refuses a System outside the default namespace when the pattern has no {namespace}, naming the System and the fix', () => {
    const system = exampleSystem({
      metadata: { name: 'example-app', namespace: 'other-ns' },
    });

    expect(() =>
      pathIdentity(system, '/{cluster}/apps/{app}/{environment}/{name}'),
    ).toThrow(
      'System "system:other-ns/example-app" is outside the "default" namespace, and appSecrets.pathPattern has no {namespace}: its secrets would share paths with a System of the same name in "default". Add {namespace} to appSecrets.pathPattern to register them.',
    );
  });

  it('keeps the namespace of a System outside the default one when the pattern has {namespace}', () => {
    const system = exampleSystem({
      metadata: { name: 'example-app', namespace: 'other-ns' },
    });

    expect(
      pathIdentity(
        system,
        '/{cluster}/{namespace}/apps/{app}/{environment}/{name}',
      ),
    ).toEqual({ app: 'example-app', namespace: 'other-ns' });
  });
});

describe('secretPathGlob', () => {
  const parts = {
    cluster: 'example-cluster',
    namespace: 'default',
    app: 'example-app',
    environment: 'dev',
  };

  it('opens {name} as a wildcard and fills the other placeholders', () => {
    expect(secretPathGlob(settings.pathPattern, parts)).toBe(
      '/example-cluster/apps/example-app/dev/*',
    );
  });

  it('refuses a wildcard in any part other than the name', () => {
    expect(() =>
      secretPathGlob(settings.pathPattern, { ...parts, cluster: 'example*' }),
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
