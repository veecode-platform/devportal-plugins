import type {
  DynamicPluginProvider,
  FrontendDynamicPlugin,
} from '@backstage/backend-dynamic-feature-service';
import { mockServices, TestDatabases } from '@backstage/backend-test-utils';
import type {
  ExtensionsApi,
  ExtensionsPackage,
} from '@red-hat-developer-hub/backstage-plugin-extensions-common';
import express from 'express';
import request from 'supertest';

import { InstallationDataService } from './installation/InstallationDataService';
import { createRouter } from './router';

const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

const LOADED = 'oci://quay.io/example/loaded:1.0.0!example-loaded';
const BROKEN = 'oci://quay.io/example/broken:1.0.0!example-broken';
const DISABLED = 'oci://quay.io/example/disabled:1.0.0!example-disabled';
const INSTALLED_NOW = 'oci://quay.io/example/fresh:1.0.0!example-fresh';

const freshPackage: ExtensionsPackage = {
  apiVersion: 'extensions.backstage.io/v1alpha1',
  kind: 'Package',
  metadata: { name: 'example-fresh', namespace: 'default' },
  spec: { dynamicArtifact: INSTALLED_NOW },
};

const extensionsApi: Pick<
  ExtensionsApi,
  'getPackageByName' | 'getPackagePlugins'
> = {
  getPackageByName: async () => freshPackage,
  getPackagePlugins: async () => [],
};

function loadedPlugins(names: string[]): DynamicPluginProvider {
  const plugins: FrontendDynamicPlugin[] = names.map(name => ({
    name,
    version: '1.0.0',
    role: 'frontend-plugin',
    platform: 'web',
  }));
  return {
    plugins: () => plugins,
    frontendPlugins: () => plugins,
    backendPlugins: () => [],
    getScannedPackage: () => {
      throw new Error('getScannedPackage is not used by the router');
    },
  };
}

async function bootPortal(options: {
  loaded: string[];
  storedBeforeBoot: Array<{ package: string; disabled: boolean }>;
}): Promise<express.Express> {
  const installationDataService = await InstallationDataService.create({
    config: mockServices.rootConfig(),
    extensionsApi: extensionsApi as ExtensionsApi,
    logger: mockServices.logger.mock(),
    database: mockServices.database({
      knex: await databases.init('SQLITE_3'),
    }),
  });
  for (const row of options.storedBeforeBoot) {
    await installationDataService.setPackageDisabled(row.package, row.disabled);
  }

  const router = await createRouter({
    httpAuth: mockServices.httpAuth(),
    extensionsApi: extensionsApi as ExtensionsApi,
    permissions: mockServices.permissions(),
    installationDataService,
    pluginProvider: loadedPlugins(options.loaded),
    logger: mockServices.logger.mock(),
    config: mockServices.rootConfig(),
  });
  return express().use(router);
}

describe('GET /pending-changes', () => {
  it('lists an enabled package that did not load under failedInstalls', async () => {
    const app = await bootPortal({
      loaded: ['example-loaded'],
      storedBeforeBoot: [
        { package: LOADED, disabled: false },
        { package: BROKEN, disabled: false },
      ],
    });

    const response = await request(app).get('/pending-changes');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      count: 0,
      pendingInstalls: [],
      pendingRemovals: [],
      failedInstalls: [BROKEN],
    });
  });

  it('keeps a package installed in this session under pendingInstalls', async () => {
    const app = await bootPortal({ loaded: [], storedBeforeBoot: [] });

    await request(app)
      .patch('/package/default/example-fresh/configuration/disable')
      .send({ disabled: false })
      .expect(200);
    const response = await request(app).get('/pending-changes');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      count: 1,
      pendingInstalls: [INSTALLED_NOW],
      pendingRemovals: [],
      failedInstalls: [],
    });
  });

  it('never lists a disabled package under failedInstalls', async () => {
    const app = await bootPortal({
      loaded: [],
      storedBeforeBoot: [
        { package: BROKEN, disabled: false },
        { package: DISABLED, disabled: true },
      ],
    });

    const response = await request(app).get('/pending-changes');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      count: 0,
      pendingInstalls: [],
      pendingRemovals: [],
      failedInstalls: [BROKEN],
    });
  });
});
