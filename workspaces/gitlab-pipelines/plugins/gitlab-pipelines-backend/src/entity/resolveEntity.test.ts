import { mockCredentials } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { resolveEntity } from './resolveEntity';

const creds = mockCredentials.user('user:default/alice');
const entity = (extra: any) => ({
  apiVersion: 'backstage.io/v1alpha1', kind: 'Resource',
  metadata: { name: 'box', namespace: 'default', annotations: { 'gitlab.com/project-slug': 'group/box', 'backstage.io/source-location': 'url:https://gitlab.example.com/group/box', ...(extra.annotations ?? {}) } },
  spec: { type: 'virtual-machine', owner: extra.owner ?? 'group:default/team-a' },
});

describe('resolveEntity', () => {
  it('derives host, slug and normalized owner', async () => {
    const catalog = catalogServiceMock({ entities: [entity({ owner: 'team-a' })] });
    const r = await resolveEntity(catalog, creds, { namespace: 'default', kind: 'resource', name: 'box' });
    expect(r).toEqual({ entityRef: 'resource:default/box', host: 'gitlab.example.com', projectSlug: 'group/box', ownerRef: 'group:default/team-a' });
  });
  it('404s when the entity does not exist', async () => {
    const catalog = catalogServiceMock({ entities: [] });
    await expect(resolveEntity(catalog, creds, { namespace: 'default', kind: 'resource', name: 'nope' })).rejects.toThrow(/not found/i);
  });
  it('400s without the project-slug annotation', async () => {
    const e = entity({}); delete e.metadata.annotations['gitlab.com/project-slug'];
    const catalog = catalogServiceMock({ entities: [e] });
    await expect(resolveEntity(catalog, creds, { namespace: 'default', kind: 'resource', name: 'box' })).rejects.toThrow(/gitlab.com\/project-slug/);
  });
});
