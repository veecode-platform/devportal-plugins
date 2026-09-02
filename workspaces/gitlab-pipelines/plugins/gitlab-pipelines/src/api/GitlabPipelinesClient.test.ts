import { MockFetchApi } from '@backstage/test-utils';
import { GitlabPipelinesApiClient } from './GitlabPipelinesClient';

describe('GitlabPipelinesApiClient', () => {
  const discoveryApi = { getBaseUrl: async () => 'http://backend/api/gitlab-pipelines' };
  it('calls the entity-anchored backend route and never GitLab', async () => {
    const calls: string[] = [];
    const fetchApi = new MockFetchApi({ baseImplementation: async (input: any, init: any) => { calls.push(`${init?.method ?? 'GET'} ${input}`); return new Response(JSON.stringify([]), { status: 200 }); } });
    const client = new GitlabPipelinesApiClient({ discoveryApi, fetchApi });
    await client.listPipelines('resource:default/box', 'main');
    expect(calls).toEqual(['GET http://backend/api/gitlab-pipelines/entities/default/resource/box/pipelines?ref=main']);
  });
  it('omits the ref query when the branch is empty or undefined', async () => {
    const calls: string[] = [];
    const fetchApi = new MockFetchApi({ baseImplementation: async (input: any, init: any) => { calls.push(`${init?.method ?? 'GET'} ${input}`); return new Response(JSON.stringify([]), { status: 200 }); } });
    const client = new GitlabPipelinesApiClient({ discoveryApi, fetchApi });
    await client.listPipelines('resource:default/box', '');
    await client.listPipelines('resource:default/box', undefined);
    expect(calls).toEqual([
      'GET http://backend/api/gitlab-pipelines/entities/default/resource/box/pipelines',
      'GET http://backend/api/gitlab-pipelines/entities/default/resource/box/pipelines',
    ]);
  });
  it('posts play variables as JSON', async () => {
    let body: any;
    const fetchApi = new MockFetchApi({ baseImplementation: async (_i: any, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ id: 6 }), { status: 200 }); } });
    const client = new GitlabPipelinesApiClient({ discoveryApi, fetchApi });
    await client.playJob('resource:default/box', 6, [{ key: 'CONFIRM_DESTROY', value: 'yes' }]);
    expect(body).toEqual({ variables: [{ key: 'CONFIRM_DESTROY', value: 'yes' }] });
  });
  it('throws with the backend error message on non-2xx', async () => {
    const fetchApi = new MockFetchApi({ baseImplementation: async () => new Response(JSON.stringify({ error: { name: 'NotAllowedError', message: 'Not allowed: not an owner' } }), { status: 403 }) });
    const client = new GitlabPipelinesApiClient({ discoveryApi, fetchApi });
    await expect(client.listBranches('resource:default/box')).rejects.toThrow(/not an owner/);
  });
});
