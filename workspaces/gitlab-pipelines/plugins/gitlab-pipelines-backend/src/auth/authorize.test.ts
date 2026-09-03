import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { gitlabPipelinePlayPermission } from '@veecode-platform/gitlab-pipelines-common';
import { createAuthorizer } from './authorize';

const entity = { apiVersion: 'backstage.io/v1alpha1', kind: 'Resource', metadata: { name: 'box', namespace: 'default', annotations: { 'gitlab.com/project-slug': 'g/box', 'backstage.io/source-location': 'url:https://gitlab.example.com/g/box' } }, spec: { type: 'vm', owner: 'group:default/team-a' } };
const req = () => ({ params: { namespace: 'default', kind: 'resource', name: 'box' }, headers: { authorization: mockCredentials.user.header('user:default/alice') } }) as any;

function build(opts: { decision?: AuthorizeResult; groups?: string[] } = {}) {
  const permissions = mockServices.permissions.mock({ authorize: async reqs => reqs.map(() => ({ result: opts.decision ?? AuthorizeResult.ALLOW })) as any });
  const userInfo = mockServices.userInfo.mock({ getUserInfo: async () => ({ userEntityRef: 'user:default/alice', ownershipEntityRefs: ['user:default/alice', ...(opts.groups ?? ['group:default/team-a'])] }) });
  return { authorize: createAuthorizer({ httpAuth: mockServices.httpAuth(), userInfo, permissions, catalog: catalogServiceMock({ entities: [entity] }) }), permissions };
}

describe('authorize funnel', () => {
  it('allows the owner with permission and passes resourceRef', async () => {
    const { authorize, permissions } = build();
    const ctx = await authorize(req(), gitlabPipelinePlayPermission);
    expect(ctx).toMatchObject({ entityRef: 'resource:default/box', host: 'gitlab.example.com', projectSlug: 'g/box', userEntityRef: 'user:default/alice' });
    expect(permissions.authorize).toHaveBeenCalledWith([{ permission: gitlabPipelinePlayPermission, resourceRef: 'resource:default/box' }], expect.anything());
  });
  it('denies when RBAC denies', async () => {
    const { authorize } = build({ decision: AuthorizeResult.DENY });
    await expect(authorize(req(), gitlabPipelinePlayPermission)).rejects.toThrow(/not allowed/i);
  });
  it('denies a non-owner even when RBAC allows', async () => {
    const { authorize } = build({ groups: ['group:default/team-b'] });
    await expect(authorize(req(), gitlabPipelinePlayPermission)).rejects.toThrow(/owner/i);
  });
  it('rejects service credentials', async () => {
    const { authorize } = build();
    const r = req(); r.headers.authorization = mockCredentials.service.header({ onBehalfOf: mockCredentials.service(), targetPluginId: 'gitlab-pipelines' });
    await expect(authorize(r, gitlabPipelinePlayPermission)).rejects.toThrow();
  });
});
