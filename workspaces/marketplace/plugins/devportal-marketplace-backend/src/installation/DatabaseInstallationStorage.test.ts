import path from 'path';

import { mockServices, TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';

import { DatabaseInstallationStorage } from './DatabaseInstallationStorage';

const databases = TestDatabases.create({ ids: ['SQLITE_3'] });
const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');

const TABLE = 'marketplace_installations';
const PACKAGE = 'oci://quay.io/example/plugin:1.0.0!example-plugin';
const CONFIG_YAML = `package: ${PACKAGE}\ndisabled: false\n`;

function createStorage(knex: Knex) {
  return new DatabaseInstallationStorage(
    knex,
    undefined,
    mockServices.logger.mock(),
  );
}

describe('DatabaseInstallationStorage', () => {
  it.each(databases.eachSupportedId())(
    'adds nullable requested_ref and resolved_digest on upgrade and keeps existing rows, %p',
    async databaseId => {
      const knex = await databases.init(databaseId);
      await knex.migrate.up({ directory: migrationsDir });
      await knex(TABLE).insert({
        package_name: PACKAGE,
        disabled: false,
        config_yaml: CONFIG_YAML,
      });

      await createStorage(knex).initialize();

      const columns = await knex(TABLE).columnInfo();
      expect(columns.requested_ref).toMatchObject({
        nullable: true,
        defaultValue: null,
      });
      expect(columns.resolved_digest).toMatchObject({
        nullable: true,
        defaultValue: null,
      });
      expect(
        await knex(TABLE).select(
          'package_name',
          'config_yaml',
          'requested_ref',
          'resolved_digest',
        ),
      ).toEqual([
        {
          package_name: PACKAGE,
          config_yaml: CONFIG_YAML,
          requested_ref: null,
          resolved_digest: null,
        },
      ]);
    },
  );

  it.each(databases.eachSupportedId())(
    'drops both columns when the migration is rolled back and keeps existing rows, %p',
    async databaseId => {
      const knex = await databases.init(databaseId);
      const storage = createStorage(knex);
      await storage.initialize();
      expect(await knex.schema.hasColumn(TABLE, 'resolved_digest')).toBe(true);
      await storage.setPackageDisabled(PACKAGE, false);

      await knex.migrate.down({
        directory: migrationsDir,
        name: '20260929000000_digest_columns.js',
      });

      expect(await knex.schema.hasColumn(TABLE, 'requested_ref')).toBe(false);
      expect(await knex.schema.hasColumn(TABLE, 'resolved_digest')).toBe(false);
      expect(
        (await storage.getAllPackageEntries()).map(entry => entry.package),
      ).toEqual([PACKAGE]);
    },
  );
});
