import type { DynamicPluginProvider } from '@backstage/backend-dynamic-feature-service';
import { mockServices, TestDatabases } from '@backstage/backend-test-utils';
import type {
  ExtensionsApi,
  ExtensionsPackage,
} from '@red-hat-developer-hub/backstage-plugin-extensions-common';
import express from 'express';
import request from 'supertest';
import { parse } from 'yaml';

import { createRouter } from '../router';
import { InstallationDataService } from './InstallationDataService';

const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

const IMAGE = 'oci://quay.io/example/updated';
const OLDER = `${IMAGE}@sha256:${'1'.repeat(64)}`;
const NEWER = `${IMAGE}@sha256:${'2'.repeat(64)}`;

const catalogPackage = (
  name: string,
  dynamicArtifact: string,
): ExtensionsPackage => ({
  apiVersion: 'extensions.backstage.io/v1alpha1',
  kind: 'Package',
  metadata: { name },
  spec: { packageName: `@example/${name}`, dynamicArtifact },
});

const catalog = [
  catalogPackage('update-old', OLDER),
  catalogPackage('update-new', NEWER),
];

const extensionsApi: Pick<
  ExtensionsApi,
  'getPackageByName' | 'getPackagePlugins' | 'getPackages'
> = {
  getPackageByName: async (_namespace, name) => {
    const found = catalog.find(pkg => pkg.metadata.name === name);
    if (!found) {
      throw new Error(`no package ${name} in the test catalog`);
    }
    return found;
  },
  getPackagePlugins: async () => [],
  getPackages: async () => ({ items: [], totalItems: 0, pageInfo: {} }),
};

const noLoadedPlugins: DynamicPluginProvider = {
  plugins: () => [],
  frontendPlugins: () => [],
  backendPlugins: () => [],
  getScannedPackage: () => {
    throw new Error('getScannedPackage is not used by the router');
  },
};

async function bootPortal(): Promise<express.Express> {
  const installationDataService = await InstallationDataService.create({
    config: mockServices.rootConfig(),
    extensionsApi: extensionsApi as ExtensionsApi,
    logger: mockServices.logger.mock(),
    database: mockServices.database({
      knex: await databases.init('SQLITE_3'),
    }),
  });
  const router = await createRouter({
    httpAuth: mockServices.httpAuth(),
    extensionsApi: extensionsApi as ExtensionsApi,
    permissions: mockServices.permissions(),
    installationDataService,
    pluginProvider: noLoadedPlugins,
    logger: mockServices.logger.mock(),
    config: mockServices.rootConfig(),
  });
  return express().use(router);
}

describe('installing a newer reference of a stored plugin through the router', () => {
  it('keeps one row, with the pluginConfig saved for the older reference', async () => {
    const app = await bootPortal();
    await request(app)
      .post('/package/default/update-old/configuration')
      .send({
        configYaml: `package: ${OLDER}\ndisabled: false\npluginConfig:\n  tuned: true\n`,
      })
      .expect(200);

    await request(app)
      .patch('/package/default/update-new/configuration/disable')
      .send({ disabled: false })
      .expect(200);

    const config = await request(app).get(
      '/package/default/update-new/configuration',
    );
    expect(parse(config.body.configYaml)).toEqual([
      { package: NEWER, disabled: false, pluginConfig: { tuned: true } },
    ]);
    const pending = await request(app).get('/pending-changes');
    expect(pending.body.pendingInstalls).toEqual([NEWER]);
  });
});
