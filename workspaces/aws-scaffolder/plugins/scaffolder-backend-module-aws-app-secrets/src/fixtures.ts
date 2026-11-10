import type { Entity } from '@backstage/catalog-model';
import type {
  AuthService,
  BackstageCredentials,
  UrlReaderService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type { AppSecretsSettings, LoginSettings } from './config';
import type { AppSecretsDependencies } from './dependencies';

export const exampleLoginSettings: LoginSettings = {
  userPoolId: 'us-east-1_ExamplePool',
  region: 'us-east-1',
  appUrlPattern: 'https://{app}.example.test',
  clientNamePattern: '{app}-{environment}',
  identityProviders: ['Google'],
};

export const exampleSettings: AppSecretsSettings = {
  region: 'us-east-1',
  writerRoleArn: 'arn:aws:iam::123456789012:role/example-secret-writer',
  pathPattern: '/{cluster}/apps/{app}/{environment}/{name}',
  cluster: 'example-cluster',
  environments: ['dev', 'staging'],
  declarationFile: 'config/{environment}.yaml',
  reservedNames: ['PORT', 'OTEL_SERVICE_NAME'],
  reservedPrefixes: ['OTEL_'],
  login: exampleLoginSettings,
};

export const exampleUserRef = 'user:default/example.user';
export const exampleTeamRef = 'group:default/example-team';
export const exampleAppRef = 'system:default/example-app';
export const exampleLocation =
  'https://git.example.com/example-org/example-app/blob/main/apps/example-component/catalog-info.yaml';

export function exampleSystem(overrides: Partial<Entity> = {}): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: { name: 'example-app', namespace: 'default' },
    spec: { owner: exampleTeamRef },
    ...overrides,
  } as Entity;
}

export function exampleComponent(
  name: string,
  locationUrl: string = exampleLocation,
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      namespace: 'default',
      annotations: { 'backstage.io/managed-by-location': `url:${locationUrl}` },
    },
    spec: { type: 'service', lifecycle: 'production', owner: exampleTeamRef },
  } as Entity;
}

export function notFound(url: string): Error {
  return Object.assign(new Error(`no file at ${url}`), {
    name: 'NotFoundError',
  });
}

export interface FakeWorld {
  deps: AppSecretsDependencies;
  catalog: { getEntityByRef: jest.Mock; getEntities: jest.Mock };
  userInfo: { getUserInfo: jest.Mock };
  urlReader: { readUrl: jest.Mock };
}

export function fakeWorld(
  options: {
    system?: Entity | undefined;
    appRef?: string;
    ownershipRefs?: string[];
    components?: Entity[];
    files?: Record<string, string>;
    now?: Date;
    randomBytes?: (size: number) => Buffer;
  } = {},
): FakeWorld {
  const system = 'system' in options ? options.system : exampleSystem();
  const appRef = options.appRef ?? exampleAppRef;
  const catalog = {
    getEntityByRef: jest.fn(async (ref: string) =>
      ref === appRef ? system : undefined,
    ),
    getEntities: jest.fn(async () => ({
      items: options.components ?? [],
    })),
  };
  const userInfo = {
    getUserInfo: jest.fn(async () => ({
      userEntityRef: exampleUserRef,
      ownershipEntityRefs: options.ownershipRefs ?? [exampleTeamRef],
    })),
  };
  const files = options.files ?? {};
  const urlReader = {
    readUrl: jest.fn(async (url: string) => {
      if (!(url in files)) {
        throw notFound(url);
      }
      return { buffer: async () => Buffer.from(files[url], 'utf8') };
    }),
  };
  const auth = {
    isPrincipal: (credentials: BackstageCredentials, type: string) =>
      (credentials.principal as { type: string }).type === type,
  };
  return {
    catalog,
    userInfo,
    urlReader,
    deps: {
      settings: exampleSettings,
      auth: auth as unknown as AuthService,
      catalog: catalog as unknown as CatalogService,
      userInfo: userInfo as unknown as UserInfoService,
      urlReader: urlReader as unknown as UrlReaderService,
      now: () => options.now ?? new Date('2026-11-04T12:00:00.000Z'),
      randomBytes: options.randomBytes ?? (size => Buffer.alloc(size, 1)),
    },
  };
}
