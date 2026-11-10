import {
  checkLoginIdentity,
  loginAppUrl,
  loginClientName,
  placeholdersAreSeparated,
} from './loginNames';

const parts = { app: 'example-app', environment: 'dev', namespace: 'default' };

describe('checkLoginIdentity', () => {
  it('accepts lowercase letters, digits and inner hyphens', () => {
    expect(() =>
      checkLoginIdentity({ ...parts, app: 'example-app-2' }),
    ).not.toThrow();
  });

  it.each([
    'Example',
    'example_app',
    'example.app',
    '-example',
    'example-',
    '',
  ])('refuses the app name "%s"', app => {
    expect(() => checkLoginIdentity({ ...parts, app })).toThrow(
      `the app name "${app}" cannot be used for a login client`,
    );
  });

  it('refuses a namespace that cannot be part of a host name', () => {
    expect(() =>
      checkLoginIdentity({ ...parts, namespace: 'Other_Ns' }),
    ).toThrow(
      'the namespace name "Other_Ns" cannot be used for a login client',
    );
  });
});

describe('loginClientName', () => {
  it('fills the placeholders', () => {
    expect(
      loginClientName('portal.{namespace}.{app}.{environment}', parts),
    ).toBe('portal.default.example-app.dev');
  });

  it('refuses a name longer than Cognito accepts', () => {
    expect(() =>
      loginClientName('{app}.{environment}', {
        ...parts,
        app: 'a'.repeat(63),
        environment: 'e'.repeat(70),
      }),
    ).toThrow('is not a valid Cognito client name');
  });

  it('refuses a placeholder that has no value', () => {
    expect(() => loginClientName('{app}-{team}', parts)).toThrow(
      'the pattern uses {team}, which has no value',
    );
  });
});

describe('loginAppUrl', () => {
  it('fills the placeholders and returns the bare origin', () => {
    expect(loginAppUrl('https://{app}-{environment}.example.test', parts)).toBe(
      'https://example-app-dev.example.test',
    );
  });

  it('drops a trailing slash', () => {
    expect(loginAppUrl('https://{app}.example.test/', parts)).toBe(
      'https://example-app.example.test',
    );
  });

  it('keeps a port', () => {
    expect(loginAppUrl('https://{app}.example.test:8443', parts)).toBe(
      'https://example-app.example.test:8443',
    );
  });

  it.each([
    ['http://{app}.example.test', 'must use https'],
    ['https://user@{app}.example.test', 'must not carry credentials'],
    ['https://{app}.example.test/x', 'must be a bare origin'],
    ['https://{app}.example.test?x=1', 'must be a bare origin'],
    ['https://{app}.example.test#x', 'must be a bare origin'],
    ['{app}.example.test', 'is not a valid URL'],
  ])('refuses %s', (pattern, reason) => {
    expect(() => loginAppUrl(pattern, parts)).toThrow(reason);
  });
});

describe('placeholdersAreSeparated', () => {
  it.each([
    '{app}.{environment}',
    '{app}_{environment}',
    '{app}@{environment}',
    'portal-{namespace}.{app}.{environment}',
    '{app}-x.{environment}',
  ])('accepts %s', pattern => {
    expect(placeholdersAreSeparated(pattern)).toBe(true);
  });

  it.each([
    '{app}-{environment}',
    '{app}{environment}',
    '{app}.{environment}-{namespace}',
    '{namespace}-{app}.{environment}',
  ])('refuses %s', pattern => {
    expect(placeholdersAreSeparated(pattern)).toBe(false);
  });

  it('gives the same name to two apps when it is not separated, and different names when it is', () => {
    const first = { app: 'a-b', environment: 'c', namespace: 'default' };
    const second = { app: 'a', environment: 'b-c', namespace: 'default' };

    expect(loginClientName('{app}-{environment}', first)).toBe(
      loginClientName('{app}-{environment}', second),
    );
    expect(loginClientName('{app}.{environment}', first)).not.toBe(
      loginClientName('{app}.{environment}', second),
    );
  });
});
