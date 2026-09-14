import { TestDatabases } from '@backstage/backend-test-utils';
import { KnexPromotionStore, NewPromotionDraft } from './promotionStore';

const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

function draft(overrides: Partial<NewPromotionDraft> = {}): NewPromotionDraft {
  return {
    idempotencyKey: 'default/svc/route-1/rate-limiting',
    instance: 'default',
    serviceName: 'svc',
    routeId: 'route-1',
    pluginType: 'rate-limiting',
    configSnapshot: { minute: 60 },
    requesterRef: 'user:default/alice',
    ...overrides,
  };
}

describe('KnexPromotionStore', () => {
  it.each(databases.eachSupportedId())(
    'inserts a draft record with the snapshot and default state, %p',
    async databaseId => {
      const store = await KnexPromotionStore.create(await databases.init(databaseId));

      const row = await store.upsertDraft(draft());

      expect(row.state).toBe('draft');
      expect(row.instance).toBe('default');
      expect(row.service_name).toBe('svc');
      expect(row.route_id).toBe('route-1');
      expect(row.plugin_type).toBe('rate-limiting');
      expect(row.config_snapshot).toEqual({ minute: 60 });
      expect(row.mr_ref).toBeNull();
      expect(row.requester_ref).toBe('user:default/alice');

      const fetched = await store.getById(row.id);
      expect(fetched).toEqual(row);
    },
  );

  it.each(databases.eachSupportedId())(
    'upserting the same idempotency key twice returns the same row, not a second one, %p',
    async databaseId => {
      const store = await KnexPromotionStore.create(await databases.init(databaseId));

      const first = await store.upsertDraft(draft());
      const second = await store.upsertDraft(
        draft({ configSnapshot: { minute: 999 } }), // a retry must not overwrite the original snapshot
      );

      expect(second.id).toBe(first.id);
      expect(second.config_snapshot).toEqual({ minute: 60 });

      const byKey = await store.getByIdempotencyKey(draft().idempotencyKey);
      expect(byKey?.id).toBe(first.id);
    },
  );

  it.each(databases.eachSupportedId())(
    'a different idempotency key opens a second, independent draft, %p',
    async databaseId => {
      const store = await KnexPromotionStore.create(await databases.init(databaseId));

      const first = await store.upsertDraft(draft());
      const other = await store.upsertDraft(
        draft({ idempotencyKey: 'default/svc/route-1/correlation-id', pluginType: 'correlation-id' }),
      );

      expect(other.id).not.toBe(first.id);
    },
  );

  it.each(databases.eachSupportedId())(
    'transition updates state and merges detail/mrRef without touching other fields, %p',
    async databaseId => {
      const store = await KnexPromotionStore.create(await databases.init(databaseId));
      const created = await store.upsertDraft(draft());

      await store.transition(created.id, 'mr-open', { mrRef: 'project-42-mr-7' });

      const afterMrOpen = await store.getById(created.id);
      expect(afterMrOpen?.state).toBe('mr-open');
      expect(afterMrOpen?.mr_ref).toBe('project-42-mr-7');
      expect(afterMrOpen?.config_snapshot).toEqual({ minute: 60 });

      await store.transition(created.id, 'failed-restored', { detail: 'convergence timed out' });

      const afterFailure = await store.getById(created.id);
      expect(afterFailure?.state).toBe('failed-restored');
      expect(afterFailure?.detail).toBe('convergence timed out');
      // mr_ref set by the earlier transition must survive an unrelated one
      expect(afterFailure?.mr_ref).toBe('project-42-mr-7');
    },
  );

  it.each(databases.eachSupportedId())(
    'getByIdempotencyKey returns undefined for an unknown key, %p',
    async databaseId => {
      const store = await KnexPromotionStore.create(await databases.init(databaseId));
      await expect(store.getByIdempotencyKey('nothing-here')).resolves.toBeUndefined();
    },
  );
});
