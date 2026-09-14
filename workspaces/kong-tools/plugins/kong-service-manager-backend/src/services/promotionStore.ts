import path from 'path';
import type { Knex } from 'knex';
import type { PromotionState } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const TABLE = 'promotions';

interface PromotionTableRow {
  id: number;
  idempotency_key: string;
  instance: string;
  service_name: string;
  route_id: string;
  plugin_type: string;
  config_snapshot: string;
  state: PromotionState;
  mr_ref: string | null;
  requester_ref: string;
  detail: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PromotionRecordRow {
  id: number;
  idempotency_key: string;
  instance: string;
  service_name: string;
  route_id: string;
  plugin_type: string;
  config_snapshot: unknown;
  state: PromotionState;
  mr_ref: string | null;
  requester_ref: string;
  detail: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewPromotionDraft {
  idempotencyKey: string;
  instance: string;
  serviceName: string;
  routeId: string;
  pluginType: string;
  configSnapshot: unknown;
  requesterRef: string;
}

/**
 * Non-terminal states (P4's finalizer loop still owns the record). Kong's
 * one-plugin-per-(type, route) constraint means at most one of these can
 * exist at a time for a given (instance, route, plugin type) — that's what
 * makes it safe to key freeze/resume lookups on that tuple alone.
 */
export const ACTIVE_PROMOTION_STATES: PromotionState[] = [
  'draft',
  'mr-open',
  'awaiting-deploy',
  'applying',
];

export interface PromotionStore {
  /**
   * Inserts a new draft, or returns the existing one for this idempotency
   * key untouched. A retried promote call must resolve to the same record
   * instead of opening a second MR (design 02, promotion mechanics step 4).
   */
  upsertDraft(draft: NewPromotionDraft): Promise<PromotionRecordRow>;
  getById(id: number): Promise<PromotionRecordRow | undefined>;
  getByIdempotencyKey(idempotencyKey: string): Promise<PromotionRecordRow | undefined>;
  /**
   * The in-flight promotion (if any) for this route plugin — the freeze
   * guard (P3) and the crash-recovery resume path both key off this instead
   * of a caller-supplied id, since only one promotion can be open per
   * (instance, route, plugin type) at a time.
   */
  getActiveByRoute(
    instance: string,
    routeId: string,
    pluginType: string,
  ): Promise<PromotionRecordRow | undefined>;
  /** Full history (any state) for a route plugin, newest first — feeds the GET .../promotions endpoint. */
  listByRoute(
    instance: string,
    routeId: string,
    pluginType: string,
  ): Promise<PromotionRecordRow[]>;
  transition(
    id: number,
    state: PromotionState,
    extra?: { detail?: string | null; mrRef?: string | null },
  ): Promise<void>;
}

function toRecordRow(row: PromotionTableRow): PromotionRecordRow {
  return { ...row, config_snapshot: JSON.parse(row.config_snapshot) };
}

export class KnexPromotionStore implements PromotionStore {
  constructor(private readonly db: Knex) {}

  static async create(db: Knex): Promise<KnexPromotionStore> {
    // __dirname points to dist/services/ at runtime;
    // migrations/ lives at the package root (two levels up from dist/services/)
    const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
    await db.migrate.latest({ directory: migrationsDir });
    return new KnexPromotionStore(db);
  }

  async upsertDraft(draft: NewPromotionDraft): Promise<PromotionRecordRow> {
    await this.db(TABLE)
      .insert({
        idempotency_key: draft.idempotencyKey,
        instance: draft.instance,
        service_name: draft.serviceName,
        route_id: draft.routeId,
        plugin_type: draft.pluginType,
        config_snapshot: JSON.stringify(draft.configSnapshot),
        state: 'draft',
        requester_ref: draft.requesterRef,
        updated_at: this.db.fn.now(),
      })
      .onConflict('idempotency_key')
      .ignore();

    const row = await this.getByIdempotencyKey(draft.idempotencyKey);
    if (!row) {
      // Only reachable if the unique constraint above is somehow absent;
      // fail loudly rather than return an invented record.
      throw new Error(`Promotion draft for idempotency key '${draft.idempotencyKey}' was not persisted`);
    }
    return row;
  }

  async getById(id: number): Promise<PromotionRecordRow | undefined> {
    const row = await this.db<PromotionTableRow>(TABLE).where('id', id).first();
    return row ? toRecordRow(row) : undefined;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<PromotionRecordRow | undefined> {
    const row = await this.db<PromotionTableRow>(TABLE).where('idempotency_key', idempotencyKey).first();
    return row ? toRecordRow(row) : undefined;
  }

  async getActiveByRoute(
    instance: string,
    routeId: string,
    pluginType: string,
  ): Promise<PromotionRecordRow | undefined> {
    const row = await this.db<PromotionTableRow>(TABLE)
      .where({ instance, route_id: routeId, plugin_type: pluginType })
      .whereIn('state', ACTIVE_PROMOTION_STATES)
      .orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }])
      .first();
    return row ? toRecordRow(row) : undefined;
  }

  async listByRoute(
    instance: string,
    routeId: string,
    pluginType: string,
  ): Promise<PromotionRecordRow[]> {
    const rows = await this.db<PromotionTableRow>(TABLE)
      .where({ instance, route_id: routeId, plugin_type: pluginType })
      .orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]);
    return rows.map(toRecordRow);
  }

  async transition(
    id: number,
    state: PromotionState,
    extra: { detail?: string | null; mrRef?: string | null } = {},
  ): Promise<void> {
    await this.db(TABLE)
      .where('id', id)
      .update({
        state,
        ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
        ...(extra.mrRef !== undefined ? { mr_ref: extra.mrRef } : {}),
        updated_at: this.db.fn.now(),
      });
  }
}
