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
const UNKNOWN = 'oci://quay.io/example/unknown:1.0.0';
const SHARED = 'oci://quay.io/example/shared:1.0.0!example-shared';

// A ref names its plugin only when it carries a !selector, and even then the
// loaded plugin's name is the package.json name of the extracted folder, which
// is not the selector. The catalog's Package entity is what ties the two.
const WITH_SELECTOR =
  'oci://quay.io/example/bundle:1.0.0!example-with-selector';
const WITHOUT_SELECTOR_TAG = 'oci://quay.io/example/plain-tag:1.0.0';
const WITHOUT_SELECTOR_DIGEST = `oci://quay.io/example/plain-digest@sha256:${'a'.repeat(
  64,
)}`;

function catalogPackage(
  dynamicArtifact: string,
  packageName: string,
): ExtensionsPackage {
  return {
    apiVersion: 'extensions.backstage.io/v1alpha1',
    kind: 'Package',
    metadata: { name: packageName.replace('@', '').replace('/', '-') },
    spec: { packageName, dynamicArtifact },
  };
}

const freshPackage = catalogPackage(INSTALLED_NOW, '@example/fresh');
const catalogPackages = [
  freshPackage,
  catalogPackage(BROKEN, '@example/broken'),
  catalogPackage(WITH_SELECTOR, '@example/with-selector'),
  catalogPackage(WITHOUT_SELECTOR_TAG, '@example/plain-tag'),
  catalogPackage(WITHOUT_SELECTOR_DIGEST, '@example/plain-digest'),
  catalogPackage(SHARED, '@example/shared-a'),
  catalogPackage(SHARED, '@example/shared-b'),
];

let catalogFails = false;

const extensionsApi: Pick<
  ExtensionsApi,
  'getPackageByName' | 'getPackagePlugins' | 'getPackages'
> = {
  getPackageByName: async () => freshPackage,
  getPackagePlugins: async () => [],
  getPackages: async request => {
    if (catalogFails) {
      throw new Error('catalog unavailable');
    }
    const filter = request.filter as Record<string, string | string[]>;
    const wanted = [filter['spec.dynamicArtifact']].flat();
    const items = catalogPackages.filter(pkg =>
      wanted.includes(pkg.spec?.dynamicArtifact as string),
    );
    return { items, totalItems: items.length, pageInfo: {} };
  },
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
  beforeEach(() => {
    catalogFails = false;
  });

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

  it.each([
    ['a ref with a !selector', WITH_SELECTOR, 'example-with-selector-dynamic'],
    [
      'a ref without a selector, by tag',
      WITHOUT_SELECTOR_TAG,
      '@example/plain-tag-dynamic',
    ],
    [
      'a ref without a selector, by digest',
      WITHOUT_SELECTOR_DIGEST,
      'example-plain-digest',
    ],
  ])(
    'never lists %s whose plugin loaded under failedInstalls',
    async (_shape, ref, loadedName) => {
      const app = await bootPortal({
        loaded: [loadedName],
        storedBeforeBoot: [
          { package: ref, disabled: false },
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
    },
  );

  it('never lists a ref shared by two catalog entities when one of their plugins loaded', async () => {
    const app = await bootPortal({
      loaded: ['example-shared-a-dynamic'],
      storedBeforeBoot: [{ package: SHARED, disabled: false }],
    });

    const response = await request(app).get('/pending-changes');

    expect(response.status).toBe(200);
    expect(response.body.failedInstalls).toEqual([]);
  });

  it('does not list a package it cannot tie to a catalog entity', async () => {
    const app = await bootPortal({
      loaded: [],
      storedBeforeBoot: [{ package: UNKNOWN, disabled: false }],
    });

    const response = await request(app).get('/pending-changes');

    expect(response.status).toBe(200);
    expect(response.body.failedInstalls).toEqual([]);
  });

  it('still answers, with no failedInstalls, when the catalog lookup fails', async () => {
    catalogFails = true;
    const app = await bootPortal({
      loaded: [],
      storedBeforeBoot: [{ package: BROKEN, disabled: false }],
    });

    const response = await request(app).get('/pending-changes');

    expect(response.status).toBe(200);
    expect(response.body.failedInstalls).toEqual([]);
  });
});
