import {
  coreServices,
  createServiceFactory,
  type BackendFeature,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { scaffolderModuleAppPublication } from './module';

const integrations = {
  gitlab: [
    {
      host: 'gitlab.example.com',
      apiBaseUrl: 'https://gitlab.example.com/api/v4',
      token: 'example-token',
    },
  ],
};

/** A logger the framework accepts: the error calls are recorded, and child loggers are this one. */
interface FakeLogger {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
  child: jest.Mock;
}

function fakeLogger(): FakeLogger {
  const logger: FakeLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => logger),
  };
  return logger;
}

function featuresWith(
  appPublication: Record<string, unknown> | undefined,
  actionsRegistry: { register: jest.Mock },
  logger?: ReturnType<typeof fakeLogger>,
): BackendFeature[] {
  return [
    scaffolderModuleAppPublication,
    mockServices.rootConfig.factory({
      data: {
        ...(appPublication === undefined
          ? {}
          : { appPublication: appPublication as never }),
        integrations,
      },
    }),
    createServiceFactory({
      service: actionsRegistryServiceRef,
      deps: {},
      factory: () => actionsRegistry,
    }),
    createServiceFactory({
      service: catalogServiceRef,
      deps: {},
      factory: () => catalogServiceMock(),
    }),
    ...(logger === undefined
      ? []
      : [
          createServiceFactory({
            service: coreServices.logger,
            deps: {},
            factory: () => logger as never,
          }),
        ]),
  ];
}

describe('scaffolderModuleAppPublication', () => {
  it('registers both actions in the actions registry, read-only and idempotent', async () => {
    const actionsRegistry = { register: jest.fn() };

    await startTestBackend({
      features: featuresWith(
        { projectPathPrefix: 'example-org' },
        actionsRegistry,
      ),
    });

    const names = actionsRegistry.register.mock.calls.map(call => call[0].name);
    expect(names).toEqual(['get-app-status', 'wait-for-app-publication']);
    for (const call of actionsRegistry.register.mock.calls) {
      expect(call[0].attributes).toEqual({ readOnly: true, idempotent: true });
    }
  });

  it('starts without the actions when the required prefix is missing, and logs why', async () => {
    const actionsRegistry = { register: jest.fn() };
    const logger = fakeLogger();

    await expect(
      startTestBackend({
        features: featuresWith(
          { deployJobName: 'deploy' },
          actionsRegistry,
          logger,
        ),
      }),
    ).resolves.toBeDefined();

    expect(actionsRegistry.register).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('projectPathPrefix'),
    );
  });

  it('starts without the actions when the block is absent altogether', async () => {
    const actionsRegistry = { register: jest.fn() };
    const logger = fakeLogger();

    await expect(
      startTestBackend({
        features: featuresWith(undefined, actionsRegistry, logger),
      }),
    ).resolves.toBeDefined();

    expect(actionsRegistry.register).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
