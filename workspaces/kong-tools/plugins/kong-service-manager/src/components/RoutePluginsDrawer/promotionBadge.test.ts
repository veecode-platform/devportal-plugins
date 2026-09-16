import { derivePromotionBadge } from './promotionBadge';
import type { PromotionRecord } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const NOW = new Date('2026-09-14T12:00:00.000Z').getTime();

function record(overrides: Partial<PromotionRecord> = {}): PromotionRecord {
  return {
    id: 1,
    instance: 'default',
    serviceName: 'svc',
    routeId: 'route-1',
    pluginType: 'rate-limiting',
    state: 'mr-open',
    mode: 'experiment',
    mrRef: 'https://gitlab.example.com/team/svc/-/merge_requests/1',
    requesterRef: 'user:default/alice',
    createdAt: '2026-09-13T12:00:00.000Z',
    updatedAt: '2026-09-13T12:00:00.000Z',
    ...overrides,
  };
}

describe('derivePromotionBadge', () => {
  it('returns experimental when there is no promotion history', () => {
    const badge = derivePromotionBadge([], 1757764800 /* 2025-09-13T12:00:00Z */, NOW);
    expect(badge.kind).toBe('experimental');
  });

  it('returns experimental when the only records are discarded or aborted-teardown', () => {
    const badge = derivePromotionBadge(
      [record({ state: 'discarded' }), record({ state: 'aborted-teardown', id: 2 })],
      1757764800,
      NOW,
    );
    expect(badge.kind).toBe('experimental');
  });

  it('maps mr-open to the mr-open badge with the MR link', () => {
    const badge = derivePromotionBadge([record({ state: 'mr-open' })], 1757764800, NOW);
    expect(badge.kind).toBe('mr-open');
    expect(badge.record?.mrRef).toBe('https://gitlab.example.com/team/svc/-/merge_requests/1');
  });

  it('maps awaiting-deploy and applying to the pending-deploy badge', () => {
    expect(derivePromotionBadge([record({ state: 'awaiting-deploy' })], 1757764800, NOW).kind).toBe(
      'pending-deploy',
    );
    expect(derivePromotionBadge([record({ state: 'applying' })], 1757764800, NOW).kind).toBe(
      'pending-deploy',
    );
  });

  it('maps codified to the codified badge', () => {
    const badge = derivePromotionBadge([record({ state: 'codified' })], 1757764800, NOW);
    expect(badge.kind).toBe('codified');
  });

  it('maps failed-restored to the failed-restored badge', () => {
    const badge = derivePromotionBadge([record({ state: 'failed-restored' })], 1757764800, NOW);
    expect(badge.kind).toBe('failed-restored');
  });

  it('maps the new failed state to the same ⚠️ badge as the legacy failed-restored (ADR-020)', () => {
    const badge = derivePromotionBadge([record({ state: 'failed' })], 1757764800, NOW);
    expect(badge.kind).toBe('failed-restored');
  });

  it('picks the most recently updated non-terminal record when history has several', () => {
    const older = record({ id: 1, state: 'discarded', updatedAt: '2026-09-10T12:00:00.000Z' });
    const newer = record({ id: 2, state: 'mr-open', updatedAt: '2026-09-13T12:00:00.000Z' });
    const badge = derivePromotionBadge([newer, older], 1757764800, NOW);
    expect(badge.kind).toBe('mr-open');
    expect(badge.record?.id).toBe(2);
  });

  it('computes age in milliseconds from the plugin creation time for the experimental badge', () => {
    const badge = derivePromotionBadge([], 1757764800 /* 2025-09-13T12:00:00Z */, NOW);
    expect(badge.ageMs).toBe(NOW - 1757764800 * 1000);
  });

  it('computes age in milliseconds from the record updatedAt for a non-experimental badge', () => {
    const badge = derivePromotionBadge([record({ updatedAt: '2026-09-13T12:00:00.000Z' })], 1757764800, NOW);
    expect(badge.ageMs).toBe(NOW - new Date('2026-09-13T12:00:00.000Z').getTime());
  });

  describe('ownership (ADR-017)', () => {
    it('returns code-owned when the instance has defaultTags the plugin does not carry', () => {
      const badge = derivePromotionBadge([], 1757764800, NOW, {
        pluginTags: null,
        instanceDefaultTags: ['portal-managed'],
      });
      expect(badge.kind).toBe('code-owned');
      // Not KIC-managed → not editable in code (the button hides; issue #135).
      expect(badge.editableInCode).toBe(false);
    });

    it('marks a code-owned plugin editable in code only when it carries the KIC tag (issue #135)', () => {
      const badge = derivePromotionBadge([], 1757764800, NOW, {
        pluginTags: ['managed-by-ingress-controller'],
        instanceDefaultTags: ['portal-managed'],
      });
      expect(badge.kind).toBe('code-owned');
      expect(badge.editableInCode).toBe(true);
    });

    it('returns experimental when the plugin carries all of the instance defaultTags', () => {
      const badge = derivePromotionBadge([], 1757764800, NOW, {
        pluginTags: ['portal-managed', 'team-a'],
        instanceDefaultTags: ['portal-managed'],
      });
      expect(badge.kind).toBe('experimental');
    });

    it('returns experimental when the instance has no defaultTags configured (generic behaviour)', () => {
      const badge = derivePromotionBadge([], 1757764800, NOW, {
        pluginTags: null,
        instanceDefaultTags: undefined,
      });
      expect(badge.kind).toBe('experimental');
    });

    it('treats a codified record as stale when the live plugin is portal-managed — the code-owned plugin left the route and this is a new experiment', () => {
      const badge = derivePromotionBadge(
        [record({ state: 'codified', updatedAt: '2026-09-13T20:00:00.000Z' })],
        1757764800,
        NOW,
        { pluginTags: ['portal-managed'], instanceDefaultTags: ['portal-managed'] },
      );
      expect(badge.kind).toBe('experimental');
      expect(badge.record).toBeUndefined();
      expect(badge.ageMs).toBe(NOW - 1757764800 * 1000);
    });

    it('treats a failed record as stale for a portal-managed plugin (ADR-020 deleted the experiment at merge)', () => {
      const badge = derivePromotionBadge([record({ state: 'failed' })], 1757764800, NOW, {
        pluginTags: ['portal-managed'],
        instanceDefaultTags: ['portal-managed'],
      });
      expect(badge.kind).toBe('experimental');
    });

    it('keeps the codified badge when the live plugin is code-owned', () => {
      const badge = derivePromotionBadge([record({ state: 'codified' })], 1757764800, NOW, {
        pluginTags: ['managed-by-ingress-controller'],
        instanceDefaultTags: ['portal-managed'],
      });
      expect(badge.kind).toBe('codified');
    });

    it('falls back to code-owned when a finished code-only promotion ends — the plugin is editable in code again (issue #135)', () => {
      const badge = derivePromotionBadge(
        [record({ state: 'codified', mode: 'code-only' })],
        1757764800,
        NOW,
        { pluginTags: ['managed-by-ingress-controller'], instanceDefaultTags: ['portal-managed'] },
      );
      expect(badge.kind).toBe('code-owned');
      expect(badge.editableInCode).toBe(true);
    });

    it('falls back to code-owned for a failed code-only promotion too — nothing to promote or discard', () => {
      const badge = derivePromotionBadge(
        [record({ state: 'failed', mode: 'code-only' })],
        1757764800,
        NOW,
        { pluginTags: ['managed-by-ingress-controller'], instanceDefaultTags: ['portal-managed'] },
      );
      expect(badge.kind).toBe('code-owned');
    });

    it('keeps the codified badge when the instance has no ownership signal (cannot tell a stale record apart)', () => {
      const badge = derivePromotionBadge([record({ state: 'codified' })], 1757764800, NOW, {
        pluginTags: ['portal-managed'],
        instanceDefaultTags: undefined,
      });
      expect(badge.kind).toBe('codified');
    });

    it('keeps an active record (mr-open) on a portal-managed plugin — the frozen experiment is the plugin itself', () => {
      const badge = derivePromotionBadge([record({ state: 'mr-open' })], 1757764800, NOW, {
        pluginTags: ['portal-managed'],
        instanceDefaultTags: ['portal-managed'],
      });
      expect(badge.kind).toBe('mr-open');
    });

    it('ignores ownership once a promotion record exists — records only ever belong to portal-managed plugins', () => {
      const badge = derivePromotionBadge([record({ state: 'mr-open' })], 1757764800, NOW, {
        pluginTags: null,
        instanceDefaultTags: ['portal-managed'],
      });
      expect(badge.kind).toBe('mr-open');
    });
  });
});
