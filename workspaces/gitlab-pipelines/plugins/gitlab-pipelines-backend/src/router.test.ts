import { coreServices, createServiceFactory } from '@backstage/backend-plugin-api';
import { mockCredentials, mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { gitlabPipelinesPlugin } from './plugin';

const server = setupServer();
beforeAll(() =>
  server.listen({
    onUnhandledRequest: request => {
      // MSW also sees supertest's local request; only fail on unhandled GitLab calls.
      if (request.url.host === 'gitlab.example.com') {
        throw new Error(`Unhandled GitLab request: ${request.method} ${request.url}`);
      }
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const entity = { apiVersion: 'backstage.io/v1alpha1', kind: 'Resource', metadata: { name: 'box', namespace: 'default', annotations: { 'gitlab.com/project-slug': 'g/box', 'backstage.io/source-location': 'url:https://gitlab.example.com/g/box' } }, spec: { type: 'vm', owner: 'group:default/team-a' } };
const base = 'https://gitlab.example.com/api/v4/projects/g%2Fbox';

async function backend(groups = ['group:default/team-a']) {
  const { server: app } = await startTestBackend({
    features: [
      gitlabPipelinesPlugin,
      mockServices.rootConfig.factory({ data: { integrations: { gitlab: [{ host: 'gitlab.example.com', token: 't', apiBaseUrl: 'https://gitlab.example.com/api/v4' }] } } }),
      catalogServiceMock.factory({ entities: [entity] }),
      mockServices.httpAuth.factory({ defaultCredentials: mockCredentials.none() }),
      createServiceFactory({
        service: coreServices.userInfo,
        deps: {},
        factory: () => mockServices.userInfo({ userEntityRef: 'user:default/alice', ownershipEntityRefs: ['user:default/alice', ...groups] }),
      }),
    ],
  });
  return app;
}
const auth = { authorization: mockCredentials.user.header('user:default/alice') };
const url = (p: string) => `/api/gitlab-pipelines/entities/default/resource/box${p}`;

describe('router', () => {
  it('lists pipelines for the owner', async () => {
    server.use(rest.get(`${base}/pipelines`, (req, res, ctx) => {
      expect(req.url.searchParams.get('ref')).toBeNull();
      expect(req.url.searchParams.get('order_by')).toBe('id');
      expect(req.url.searchParams.get('sort')).toBe('desc');
      return res(ctx.json([{ id: 1, project_id: 9, ref: 'main', sha: 'a', status: 'success', source: 'push', web_url: 'u', created_at: 'c', updated_at: 'u2' }]));
    }));
    const res = await request(await backend()).get(url('/pipelines')).set(auth);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 1, status: 'success' });
  });
  it('rejects unauthenticated calls with 401', async () => {
    const res = await request(await backend()).get(url('/pipelines?ref=main'));
    expect(res.status).toBe(401);
  });
  it('rejects a non-owner with 403 and never calls GitLab', async () => {
    const res = await request(await backend(['group:default/team-b'])).get(url('/pipelines?ref=main')).set(auth);
    expect(res.status).toBe(403);
  });
  it('refuses to play a job that is not manual (409)', async () => {
    server.use(rest.get(`${base}/jobs/5`, (_r, res, ctx) => res(ctx.json({ id: 5, name: 'apply', stage: 'apply', status: 'success', allow_failure: false, web_url: 'u' }))));
    const res = await request(await backend()).post(url('/jobs/5/play')).set(auth).send({ variables: [] });
    expect(res.status).toBe(409);
  });
  it('plays a manual job with validated variables', async () => {
    server.use(
      rest.get(`${base}/jobs/6`, (_r, res, ctx) => res(ctx.json({ id: 6, name: 'destroy', stage: 'destroy', status: 'manual', allow_failure: false, web_url: 'u' }))),
      rest.post(`${base}/jobs/6/play`, (_r, res, ctx) => res(ctx.json({ id: 6, name: 'destroy', stage: 'destroy', status: 'pending', allow_failure: false, web_url: 'u' }))),
    );
    const res = await request(await backend()).post(url('/jobs/6/play')).set(auth).send({ variables: [{ key: 'CONFIRM_DESTROY', value: 'yes' }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 6, status: 'pending', manual: false });
  });
  it('rejects reserved variable keys with 400', async () => {
    const res = await request(await backend()).post(url('/pipelines')).set(auth).send({ ref: 'main', variables: [{ key: 'CI_X', value: '1' }] });
    expect(res.status).toBe(400);
  });
  it('returns 400 when the entity has no project-slug annotation', async () => {
    const e = JSON.parse(JSON.stringify(entity)); delete e.metadata.annotations['gitlab.com/project-slug'];
    const { server: app } = await startTestBackend({ features: [gitlabPipelinesPlugin, mockServices.rootConfig.factory({ data: { integrations: { gitlab: [{ host: 'gitlab.example.com', token: 't', apiBaseUrl: 'https://gitlab.example.com/api/v4' }] } } }), catalogServiceMock.factory({ entities: [e] }), mockServices.httpAuth.factory({ defaultCredentials: mockCredentials.none() })] });
    const res = await request(app).get(url('/branches')).set(auth);
    expect(res.status).toBe(400);
  });
  it('maps a GitLab failure to 502 and preserves the upstream status', async () => {
    server.use(rest.get(`${base}/pipelines`, (_r, res, ctx) => res(ctx.status(500), ctx.json({ message: 'upstream down' }))));
    const res = await request(await backend()).get(url('/pipelines?ref=main')).set(auth);
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: {
        name: 'UpstreamError',
        message: 'GitLab request failed with status 500',
        upstreamStatus: 500,
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('upstream down');
  });
  it('defaults omitted play variables to an empty list', async () => {
    server.use(
      rest.get(`${base}/jobs/6`, (_r, res, ctx) => res(ctx.json({ id: 6, name: 'destroy', stage: 'destroy', status: 'manual', allow_failure: false, web_url: 'u' }))),
      rest.post(`${base}/jobs/6/play`, (_r, res, ctx) => res(ctx.json({ id: 6, name: 'destroy', stage: 'destroy', status: 'pending', allow_failure: false, web_url: 'u' }))),
    );
    const res = await request(await backend()).post(url('/jobs/6/play')).set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 6, status: 'pending', manual: false });
  });
});
