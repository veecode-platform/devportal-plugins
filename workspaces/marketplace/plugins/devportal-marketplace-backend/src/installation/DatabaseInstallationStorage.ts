import fs from 'fs';
import path from 'path';

import { Document, parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import { LoggerService } from '@backstage/backend-plugin-api';
import { toBlockStyle } from '../utils/yamlFormat';
import {
  validatePackageFormat,
  validatePluginFormat,
} from '../validation/configValidation';
import type { Knex } from 'knex';
import type { InstallationStorage, PackageEntry } from './InstallationStorage';
import { samePlugin } from './pluginKey';

const TABLE = 'marketplace_installations';

interface DbRow {
  package_name: string;
  disabled: boolean;
  config_yaml: string | null;
  updated_at: Date;
}

const pluginConfigOf = (row: DbRow): unknown => {
  if (!row.config_yaml) return undefined;
  try {
    return parseDocument(row.config_yaml).toJSON()?.pluginConfig;
  } catch {
    return undefined;
  }
};

// A row replaced by a newer reference hands its pluginConfig on, unless the
// new entry brings its own.
const withCarriedPluginConfig = (
  entry: Record<string, unknown>,
  replaced: DbRow[],
): Record<string, unknown> => {
  if ('pluginConfig' in entry) return entry;
  const carried = replaced
    .filter(row => samePlugin(row.package_name, entry.package as string))
    .map(pluginConfigOf)
    .find(config => config !== undefined);
  return carried === undefined ? entry : { ...entry, pluginConfig: carried };
};

const toConfigYaml = (entry: Record<string, unknown>): string => {
  const doc = new Document(entry);
  toBlockStyle(doc.contents);
  return doc.toString({ lineWidth: 120 });
};

// The row stored for the reference, or else the row of an older reference of
// the same plugin.
const resolveRow = (rows: DbRow[], ref: string): DbRow | undefined =>
  rows.find(row => row.package_name === ref) ??
  rows.find(row => samePlugin(row.package_name, ref));

export class DatabaseInstallationStorage implements InstallationStorage {
  constructor(
    private readonly db: Knex,
    private readonly yamlFilePath: string | undefined,
    private readonly logger: LoggerService,
  ) {}

  async initialize(): Promise<void> {
    // __dirname points to dist/installation/ at runtime;
    // migrations/ lives at the package root (two levels up from dist/installation/)
    const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
    await this.db.migrate.latest({ directory: migrationsDir });
    this.logger.info('Database migrations applied for marketplace installations');

    await this.seedFromFileIfEmpty();
    await this.syncToYamlFile();
  }

  /**
   * On first boot after migration from file-based storage, seed the DB
   * from the existing extensions-install.yaml if the table is empty.
   */
  private async seedFromFileIfEmpty(): Promise<void> {
    const [{ count }] = await this.db(TABLE).count('* as count');
    if (Number(count) > 0) return;

    if (!this.yamlFilePath || !fs.existsSync(this.yamlFilePath)) return;

    try {
      const raw = fs.readFileSync(this.yamlFilePath, 'utf-8');
      const doc = parseDocument(raw);
      const plugins = doc.get('plugins') as YAMLSeq | undefined;
      if (!plugins || plugins.items.length === 0) return;

      const rows: Array<Omit<DbRow, 'updated_at'>> = [];
      for (const item of plugins.items) {
        const map = item as YAMLMap;
        const pkgName = map.get('package') as string;
        if (!pkgName) continue;

        const disabled = (map.get('disabled') as boolean) ?? false;

        // Serialize just this entry as a single-item YAML map
        const entryDoc = new Document(map.toJSON());
        toBlockStyle(entryDoc.contents);
        const configYaml = entryDoc.toString({ lineWidth: 120 });

        rows.push({
          package_name: pkgName,
          disabled,
          config_yaml: configYaml,
        });
      }

      if (rows.length > 0) {
        await this.db(TABLE).insert(rows);
        this.logger.info(
          `Seeded ${rows.length} package(s) from ${this.yamlFilePath} into database`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Failed to seed database from ${this.yamlFilePath}: ${e}`,
      );
    }
  }

  /**
   * Write-through: regenerate extensions-install.yaml from DB state.
   * This keeps the Python install script working on next container restart.
   */
  private async syncToYamlFile(): Promise<void> {
    if (!this.yamlFilePath) return;

    try {
      const rows = await this.db(TABLE)
        .select('config_yaml', 'package_name', 'disabled')
        .orderBy('package_name');

      const plugins: unknown[] = [];
      for (const row of rows) {
        if (row.config_yaml) {
          try {
            const entryDoc = parseDocument(row.config_yaml);
            plugins.push(entryDoc.toJSON());
          } catch {
            plugins.push({
              package: row.package_name,
              disabled: row.disabled,
            });
          }
        } else {
          plugins.push({
            package: row.package_name,
            disabled: row.disabled,
          });
        }
      }

      const doc = new Document({ plugins });
      toBlockStyle(doc.contents);
      const content = doc.toString({ lineWidth: 120 });

      const tmp = `${this.yamlFilePath}.tmp`;
      try {
        fs.writeFileSync(tmp, content);
        fs.renameSync(tmp, this.yamlFilePath);
      } catch {
        fs.writeFileSync(this.yamlFilePath, content);
        try { fs.unlinkSync(tmp); } catch { /* ignore cleanup */ }
      }
    } catch (e) {
      this.logger.warn(`Failed to sync YAML write-through: ${e}`);
    }
  }

  private allRows(db: Knex): Promise<DbRow[]> {
    return db(TABLE)
      .select('package_name', 'disabled', 'config_yaml', 'updated_at')
      .orderBy('package_name');
  }

  /**
   * Deletes the rows that name the same plugin as one of the references being
   * written under a different reference, and returns them.
   */
  private async dropReplacedRows(trx: Knex, refs: string[]): Promise<DbRow[]> {
    const replaced = (await this.allRows(trx)).filter(
      row =>
        !refs.includes(row.package_name) &&
        refs.some(ref => samePlugin(row.package_name, ref)),
    );
    if (replaced.length > 0) {
      await trx(TABLE)
        .whereIn(
          'package_name',
          replaced.map(row => row.package_name),
        )
        .delete();
    }
    return replaced;
  }

  async getPackage(packageName: string): Promise<string | undefined> {
    const row = resolveRow(await this.allRows(this.db), packageName);
    if (!row) return undefined;
    return this.rowToYamlSequence(row, packageName);
  }

  async getPackages(packageNames: Set<string>): Promise<string | undefined> {
    const rows = await this.allRows(this.db);
    const found = new Map<DbRow, string>();
    for (const packageName of packageNames) {
      const row = resolveRow(rows, packageName);
      if (row && !found.has(row)) found.set(row, packageName);
    }
    if (found.size === 0) return undefined;
    return this.rowsToYamlSequence([...found]);
  }

  async updatePackage(
    packageName: string,
    newConfig: string,
  ): Promise<void> {
    const newNode = parseDocument(newConfig).contents;
    validatePackageFormat(newNode, packageName);

    const disabled =
      (newNode as YAMLMap).get('disabled') as boolean ?? false;

    await this.db.transaction(async trx => {
      const replaced = await this.dropReplacedRows(trx, [packageName]);
      const entry = (newNode as YAMLMap).toJSON();
      const carried = withCarriedPluginConfig(entry, replaced);
      const configYaml = carried === entry ? newConfig : toConfigYaml(carried);

      await trx(TABLE)
        .insert({
          package_name: packageName,
          disabled,
          config_yaml: configYaml,
          updated_at: trx.fn.now(),
        })
        .onConflict('package_name')
        .merge({
          disabled,
          config_yaml: configYaml,
          updated_at: trx.fn.now(),
        });
    });

    await this.syncToYamlFile();
  }

  async updatePackages(
    packageNames: Set<string>,
    newConfig: string,
  ): Promise<void> {
    const newNodes = parseDocument(newConfig);
    validatePluginFormat(newNodes, packageNames);

    const items = (newNodes.contents as YAMLSeq).items as YAMLMap[];

    await this.db.transaction(async trx => {
      const replaced = await this.dropReplacedRows(
        trx,
        items.map(item => item.get('package') as string),
      );
      for (const map of items) {
        const pkgName = map.get('package') as string;
        const disabled = (map.get('disabled') as boolean) ?? false;

        const configYaml = toConfigYaml(
          withCarriedPluginConfig(map.toJSON(), replaced),
        );

        await trx(TABLE)
          .insert({
            package_name: pkgName,
            disabled,
            config_yaml: configYaml,
            updated_at: trx.fn.now(),
          })
          .onConflict('package_name')
          .merge({
            disabled,
            config_yaml: configYaml,
            updated_at: trx.fn.now(),
          });
      }
    });

    await this.syncToYamlFile();
  }

  async setPackageDisabled(
    packageName: string,
    disabled: boolean,
  ): Promise<void> {
    await this.setPackagesDisabled(new Set([packageName]), disabled);
  }

  async setPackagesDisabled(
    packageNames: Set<string>,
    disabled: boolean,
  ): Promise<void> {
    await this.db.transaction(async trx => {
      const replaced = await this.dropReplacedRows(trx, [...packageNames]);
      for (const packageName of packageNames) {
        const existing = await trx(TABLE)
          .where('package_name', packageName)
          .first();

        if (existing) {
          let configYaml = existing.config_yaml;
          if (configYaml) {
            try {
              const doc = parseDocument(configYaml);
              (doc.contents as YAMLMap).set('disabled', disabled);
              toBlockStyle(doc.contents);
              configYaml = doc.toString({ lineWidth: 120 });
            } catch { /* keep existing */ }
          }
          await trx(TABLE).where('package_name', packageName).update({
            disabled,
            config_yaml: configYaml,
            updated_at: trx.fn.now(),
          });
        } else {
          const entry = withCarriedPluginConfig(
            { package: packageName, disabled },
            replaced,
          );
          await trx(TABLE).insert({
            package_name: packageName,
            disabled,
            config_yaml: toConfigYaml(entry),
            updated_at: trx.fn.now(),
          });
        }
      }
    });

    await this.syncToYamlFile();
  }

  async getAllPackageEntries(): Promise<PackageEntry[]> {
    const rows = await this.db(TABLE)
      .select('package_name', 'disabled')
      .orderBy('package_name');

    return rows.map(row => ({
      package: row.package_name,
      disabled: row.disabled,
    }));
  }

  async removePackage(packageName: string): Promise<void> {
    await this.db(TABLE).where('package_name', packageName).delete();
    await this.syncToYamlFile();
  }

  /**
   * Convert a single DB row to a YAML sequence string (matching
   * FileInstallationStorage.getPackage() output format), under the reference
   * it was asked for.
   */
  private rowToYamlSequence(row: DbRow, ref: string): string {
    return this.rowsToYamlSequence([[row, ref]]);
  }

  /**
   * Convert DB rows to a YAML sequence string (matching
   * FileInstallationStorage.getPackages() output format). Each row is shown
   * under the reference it was asked for, which differs from its own when
   * the row is that of an older reference of the same plugin.
   */
  private rowsToYamlSequence(items: Array<[DbRow, string]>): string {
    const entries = items.map(([row, ref]) => {
      let entry: Record<string, unknown> = {
        package: row.package_name,
        disabled: row.disabled,
      };
      if (row.config_yaml) {
        try {
          entry = parseDocument(row.config_yaml).toJSON();
        } catch { /* fall through */ }
      }
      return ref === row.package_name ? entry : { ...entry, package: ref };
    });
    const seqDoc = new Document(entries);
    toBlockStyle(seqDoc.contents);
    return seqDoc.toString({ lineWidth: 120 });
  }
}
