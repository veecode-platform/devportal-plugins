import fs from 'fs';
import os from 'os';
import path from 'path';

import { mockServices, TestDatabases } from '@backstage/backend-test-utils';
import { parse, stringify } from 'yaml';

import { DatabaseInstallationStorage } from './DatabaseInstallationStorage';
import { FileInstallationStorage } from './FileInstallationStorage';
import type { InstallationStorage } from './InstallationStorage';

const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

const IMAGE = 'oci://quay.io/example/plugin';
const OLD_REF = `${IMAGE}@sha256:${'a'.repeat(64)}`;
const NEW_REF = `${IMAGE}@sha256:${'b'.repeat(64)}`;
const SELECTOR_X_OLD_REF = `${IMAGE}@sha256:${'d'.repeat(64)}!x`;
const SELECTOR_X_NEW_REF = `${IMAGE}@sha256:${'e'.repeat(64)}!x`;
const SELECTOR_Y_REF = `${IMAGE}@sha256:${'f'.repeat(64)}!y`;
const SELECTORLESS_REF = `${IMAGE}:latest`;
const OTHER_REF = `oci://quay.io/example/other@sha256:${'c'.repeat(64)}`;
const PLUGIN_CONFIG = { app: { example: { enabled: true } } };

const tempDirs: string[] = [];
afterAll(() => {
  tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

const storages: Array<[string, () => Promise<InstallationStorage>]> = [
  [
    'DatabaseInstallationStorage',
    async () => {
      const storage = new DatabaseInstallationStorage(
        await databases.init('SQLITE_3'),
        undefined,
        mockServices.logger.mock(),
      );
      await storage.initialize();
      return storage;
    },
  ],
  [
    'FileInstallationStorage',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-row-'));
      tempDirs.push(dir);
      const file = path.join(dir, 'extensions-install.yaml');
      fs.writeFileSync(file, 'plugins: []\n');
      const storage = new FileInstallationStorage(file);
      await storage.initialize();
      return storage;
    },
  ],
];

// SQLite hands booleans back as 0 and 1.
const rowsOf = async (storage: InstallationStorage) =>
  (await storage.getAllPackageEntries()).map(row => ({
    package: row.package,
    disabled: Boolean(row.disabled),
  }));

const entry = (ref: string, pluginConfig?: object) => ({
  package: ref,
  disabled: false,
  ...(pluginConfig && { pluginConfig }),
});

// The card calls the plugin-level methods and the package page the
// package-level ones; both must keep one row per plugin.
const callers: Array<
  [
    string,
    {
      install: (
        storage: InstallationStorage,
        ref: string,
        pluginConfig?: object,
      ) => Promise<void>;
      disable: (storage: InstallationStorage, ref: string) => Promise<void>;
    },
  ]
> = [
  [
    'a package',
    {
      install: (storage, ref, pluginConfig) =>
        storage.updatePackage(ref, stringify(entry(ref, pluginConfig))),
      disable: (storage, ref) => storage.setPackageDisabled(ref, true),
    },
  ],
  [
    'a plugin',
    {
      install: (storage, ref, pluginConfig) =>
        storage.updatePackages(
          new Set([ref]),
          stringify([entry(ref, pluginConfig)]),
        ),
      disable: (storage, ref) =>
        storage.setPackagesDisabled(new Set([ref]), true),
    },
  ],
];

describe.each(storages)('%s keeps one row per plugin', (_name, create) => {
  describe.each(callers)('when %s is written', (_level, write) => {
    it('replaces the row of an older reference when a newer one is installed', async () => {
      const storage = await create();
      await write.install(storage, OLD_REF);

      await write.install(storage, NEW_REF);

      expect(await rowsOf(storage)).toEqual([
        { package: NEW_REF, disabled: false },
      ]);
    });

    it('replaces the enabled row of an older reference when a newer one is disabled', async () => {
      const storage = await create();
      await write.install(storage, OLD_REF);

      await write.disable(storage, NEW_REF);

      expect(await rowsOf(storage)).toEqual([
        { package: NEW_REF, disabled: true },
      ]);
    });

    it('carries the pluginConfig of the replaced row to the new one', async () => {
      const storage = await create();
      await write.install(storage, OLD_REF, PLUGIN_CONFIG);

      await write.install(storage, NEW_REF);

      expect(parse((await storage.getPackage(NEW_REF)) ?? '')).toEqual([
        entry(NEW_REF, PLUGIN_CONFIG),
      ]);
    });

    it('keeps both selector rows when a selector-less reference is written', async () => {
      const storage = await create();
      await write.install(storage, SELECTOR_X_OLD_REF, PLUGIN_CONFIG);
      await write.install(storage, SELECTOR_Y_REF, PLUGIN_CONFIG);

      await write.install(storage, SELECTORLESS_REF);

      expect((await rowsOf(storage)).map(row => row.package).sort()).toEqual(
        [SELECTOR_X_OLD_REF, SELECTOR_Y_REF, SELECTORLESS_REF].sort(),
      );
      expect(
        parse((await storage.getPackage(SELECTORLESS_REF)) ?? ''),
      ).toEqual([entry(SELECTORLESS_REF)]);
    });

    it('replaces only the row with the matching selector', async () => {
      const storage = await create();
      await write.install(storage, SELECTOR_X_OLD_REF);
      await write.install(storage, SELECTOR_Y_REF);

      await write.install(storage, SELECTOR_X_NEW_REF);

      expect((await rowsOf(storage)).map(row => row.package).sort()).toEqual(
        [SELECTOR_X_NEW_REF, SELECTOR_Y_REF].sort(),
      );
    });

    it('leaves the rows of other plugins alone', async () => {
      const storage = await create();
      await write.install(storage, OTHER_REF);
      await write.install(storage, OLD_REF);

      await write.install(storage, NEW_REF);

      expect(
        (await storage.getAllPackageEntries()).map(row => row.package).sort(),
      ).toEqual([NEW_REF, OTHER_REF].sort());
    });
  });

  it('finds the row of an older reference when asked for a newer one', async () => {
    const storage = await create();
    await storage.updatePackage(
      OLD_REF,
      stringify(entry(OLD_REF, PLUGIN_CONFIG)),
    );

    const expected = [entry(NEW_REF, PLUGIN_CONFIG)];
    expect(parse((await storage.getPackage(NEW_REF)) ?? '')).toEqual(expected);
    expect(
      parse((await storage.getPackages(new Set([NEW_REF]))) ?? ''),
    ).toEqual(expected);
  });
});
