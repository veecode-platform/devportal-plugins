import path from 'path';

import { TestDatabases } from '@backstage/backend-test-utils';
import type { Knex } from 'knex';

import { PLUGIN_KEY_VECTORS } from './pluginKeyVectors';

const databases = TestDatabases.create({ ids: ['SQLITE_3'] });
const directory = path.resolve(__dirname, '..', '..', 'migrations');

const MIGRATION = '20261001000000_one_row_per_plugin.js';
const TABLE = 'marketplace_installations';

const IMAGE = 'oci://quay.io/example/plugin';
const REF_A = `${IMAGE}@sha256:${'a'.repeat(64)}`;
const REF_B = `${IMAGE}@sha256:${'b'.repeat(64)}`;
const SELECTOR_X_REF = `${IMAGE}@sha256:${'d'.repeat(64)}!x`;
const SELECTOR_Y_REF = `${IMAGE}@sha256:${'e'.repeat(64)}!y`;
const SELECTORLESS_REF = `${IMAGE}:latest`;
const OTHER_REF = `oci://quay.io/example/other@sha256:${'c'.repeat(64)}`;

const row = (ref: string, disabled: boolean, minute: number) => ({
  package_name: ref,
  disabled,
  updated_at: new Date(Date.UTC(2026, 9, 1, 12, minute)),
});

// Applies the two migrations before the one under test, so rows can be
// written as an older backend left them.
async function createDatabase(): Promise<Knex> {
  const knex = await databases.init('SQLITE_3');
  await knex.migrate.up({ directory });
  await knex.migrate.up({ directory });
  return knex;
}

const migrate = (knex: Knex) => knex.migrate.up({ directory });

const remaining = async (knex: Knex) =>
  (await knex(TABLE).select('package_name').orderBy('package_name')).map(
    r => r.package_name,
  );

describe('migration one_row_per_plugin', () => {
  it('keeps the enabled row over a newer disabled one', async () => {
    const knex = await createDatabase();
    await knex(TABLE).insert([row(REF_A, false, 0), row(REF_B, true, 5)]);

    await migrate(knex);

    expect(await remaining(knex)).toEqual([REF_A]);
  });

  it('keeps the newer of two enabled rows', async () => {
    const knex = await createDatabase();
    await knex(TABLE).insert([row(REF_A, false, 5), row(REF_B, false, 0)]);

    await migrate(knex);

    expect(await remaining(knex)).toEqual([REF_A]);
  });

  it('keeps the row with the later package_name when both were written at the same time', async () => {
    const knex = await createDatabase();
    await knex(TABLE).insert([row(REF_A, false, 0), row(REF_B, false, 0)]);

    await migrate(knex);

    expect(await remaining(knex)).toEqual([REF_B]);
  });

  it('keeps selector rows bridged by a newer selector-less row', async () => {
    const knex = await createDatabase();
    await knex(TABLE).insert([
      row(SELECTOR_X_REF, false, 0),
      row(SELECTOR_Y_REF, false, 1),
      row(SELECTORLESS_REF, false, 10),
    ]);

    await migrate(knex);

    expect(await remaining(knex)).toEqual(
      [SELECTOR_X_REF, SELECTOR_Y_REF, SELECTORLESS_REF].sort(),
    );
  });

  it('keeps the rows of other plugins', async () => {
    const knex = await createDatabase();
    await knex(TABLE).insert([
      row(REF_A, false, 0),
      row(REF_B, false, 5),
      row(OTHER_REF, true, 0),
    ]);

    await migrate(knex);

    expect(await remaining(knex)).toEqual([OTHER_REF, REF_B].sort());
  });

  it.each(PLUGIN_KEY_VECTORS.filter(([a, b]) => a !== b))(
    'compares %s with %s as one plugin: %s',
    async (a, b, same) => {
      const knex = await createDatabase();
      await knex(TABLE).insert([row(a, false, 0), row(b, false, 5)]);

      await migrate(knex);

      expect(await remaining(knex)).toHaveLength(same ? 1 : 2);
    },
  );

  it('does nothing when it is rolled back', async () => {
    const knex = await createDatabase();
    await knex(TABLE).insert([row(REF_A, false, 0), row(REF_B, false, 5)]);
    await migrate(knex);

    await knex.migrate.down({ directory, name: MIGRATION });

    expect(await remaining(knex)).toEqual([REF_B]);
  });
});
