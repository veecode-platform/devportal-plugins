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

  describe('the login block', () => {
    const exampleLogin = {
      userPoolId: 'us-east-1_ExamplePool',
      appUrlPattern: 'https://{app}.example.test',
    };
    const readLogin = (overrides: Record<string, unknown>) =>
      readWith({ login: { ...exampleLogin, ...overrides } });

    it('is optional', () => {
      expect(readWith({}).login).toBeUndefined();
    });

    it('applies the defaults: the region of appSecrets, the client name and Google', () => {
      expect(readLogin({}).login).toEqual({
        userPoolId: 'us-east-1_ExamplePool',
        region: 'us-east-1',
        appUrlPattern: 'https://{app}.example.test',
        clientNamePattern: '{app}.{environment}',
        identityProviders: ['Google'],
      });
    });

    it('keeps the values the app sets', () => {
      expect(
        readLogin({
          userPoolId: 'eu-west-1_ExamplePool',
          region: 'eu-west-1',
          appUrlPattern: 'https://{app}-{environment}.example.test',
          clientNamePattern: 'portal.{namespace}.{app}.{environment}',
          identityProviders: ['Google', 'ExampleIdp'],
        }).login,
      ).toEqual({
        userPoolId: 'eu-west-1_ExamplePool',
        region: 'eu-west-1',
        appUrlPattern: 'https://{app}-{environment}.example.test',
        clientNamePattern: 'portal.{namespace}.{app}.{environment}',
        identityProviders: ['Google', 'ExampleIdp'],
      });
    });

    it('refuses a block without a user pool', () => {
      expect(() => readLogin({ userPoolId: undefined })).toThrow(
        /^appSecrets\.login\.userPoolId /,
      );
    });

    it('refuses a user pool ID that is not a Cognito one', () => {
      expect(() => readLogin({ userPoolId: 'example-pool' })).toThrow(
        'appSecrets.login.userPoolId must be a Cognito user pool ID: <region>_<id>',
      );
    });

    it('refuses a user pool of another region than the login block', () => {
      expect(() => readLogin({ userPoolId: 'eu-west-1_ExamplePool' })).toThrow(
        'appSecrets.login.userPoolId belongs to another region than "us-east-1"',
      );
    });

    it('refuses a block without an app URL pattern', () => {
      expect(() => readLogin({ appUrlPattern: undefined })).toThrow(
        /^appSecrets\.login\.appUrlPattern /,
      );
    });

    it('refuses an app URL pattern that is not https', () => {
      expect(() =>
        readLogin({ appUrlPattern: 'http://{app}.example.test' }),
      ).toThrow(
        'appSecrets.login.appUrlPattern gives an app URL the login cannot use: the app URL "http://example-app.example.test" must use https',
      );
    });

    it.each([
      ['a path', 'https://example.test/{app}'],
      ['a query', 'https://{app}.example.test?x=1'],
      ['a fragment', 'https://{app}.example.test#x'],
      ['credentials', 'https://user:pass@{app}.example.test'],
    ])('refuses an app URL pattern with %s', (_, appUrlPattern) => {
      expect(() => readLogin({ appUrlPattern })).toThrow(
        /^appSecrets\.login\.appUrlPattern gives an app URL the login cannot use/,
      );
    });

    it('refuses an app URL pattern without {app}', () => {
      expect(() =>
        readLogin({ appUrlPattern: 'https://apps.example.test' }),
      ).toThrow('appSecrets.login.appUrlPattern must contain {app}');
    });

    it('refuses an app URL pattern with an unknown placeholder', () => {
      expect(() =>
        readLogin({ appUrlPattern: 'https://{app}.{team}.example.test' }),
      ).toThrow(
        'appSecrets.login.appUrlPattern uses the unknown placeholder {team}',
      );
    });

    it.each(['{app}', '{environment}'])(
      'refuses a client name pattern that lacks %s, so two clients could share a name',
      placeholder => {
        const clientNamePattern = ['{app}', '{environment}']
          .filter(item => item !== placeholder)
          .join('-');
        expect(() => readLogin({ clientNamePattern })).toThrow(
          `appSecrets.login.clientNamePattern must contain ${placeholder}`,
        );
      },
    );

    it.each([
      '{app}-{environment}',
      '{app}{environment}',
      'portal-{app}-{namespace}.{environment}',
    ])(
      'refuses the client name pattern %s, which could give two apps the same name',
      clientNamePattern => {
        expect(() => readLogin({ clientNamePattern })).toThrow(
          'appSecrets.login.clientNamePattern must separate its placeholders with one of . _ + = , @',
        );
      },
    );

    it.each([
      '{app}.{environment}',
      '{app}_{environment}',
      'portal-{app}.{environment}',
      '{namespace}.{app}.{environment}',
    ])('accepts the client name pattern %s', clientNamePattern => {
      expect(readLogin({ clientNamePattern }).login?.clientNamePattern).toBe(
        clientNamePattern,
      );
    });

    it('refuses a client name pattern with a character Cognito would refuse', () => {
      expect(() =>
        readLogin({ clientNamePattern: '{app}/{environment}' }),
      ).toThrow('appSecrets.login.clientNamePattern may contain only letters');
    });

    it('refuses a client name pattern that gives a name over 128 characters', () => {
      expect(() =>
        readLogin({
          clientNamePattern: `${'a'.repeat(120)}.{app}.{environment}`,
        }),
      ).toThrow(
        'appSecrets.login.clientNamePattern gives a client name Cognito would refuse',
      );
    });

    it('refuses a scopes key, so the admin scope cannot be added from configuration', () => {
      expect(() =>
        readLogin({ scopes: ['openid', 'aws.cognito.signin.user.admin'] }),
      ).toThrow("appSecrets.login Unrecognized key(s) in object: 'scopes'");
    });

    it.each([
      ['token validity', { accessTokenValidity: 1440 }],
      ['OAuth flows', { allowedOAuthFlows: ['implicit'] }],
      ['callback URLs', { callbackUrls: ['https://example.test/'] }],
    ])(
      'refuses a %s key: the client settings are fixed in code',
      (_, extra) => {
        expect(() => readLogin(extra)).toThrow(/Unrecognized key\(s\)/);
      },
    );

    it('refuses an empty list of identity providers', () => {
      expect(() => readLogin({ identityProviders: [] })).toThrow(
        'appSecrets.login.identityProviders Array must contain at least 1 element(s)',
      );
    });

    it('refuses an identity provider listed twice', () => {
      expect(() =>
        readLogin({ identityProviders: ['Google', 'Google'] }),
      ).toThrow(
        'appSecrets.login.identityProviders lists an identity provider more than once',
      );
    });

    it('refuses a region that is not a plain region name', () => {
      expect(() => readLogin({ region: 'us-east-1/other' })).toThrow(
        'appSecrets.login.region must be an AWS region such as us-east-1',
      );
    });
  });
});
