import { mockServices } from '@backstage/backend-test-utils';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { GitlabApi } from './GitlabApi';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const config = mockServices.rootConfig({
  data: { integrations: { gitlab: [{ host: 'gitlab.example.com', token: 'glpat-test', apiBaseUrl: 'https://gitlab.example.com/api/v4' }] } },
});

describe('GitlabApi', () => {
  it('sends PRIVATE-TOKEN from the integration and maps pipelines', async () => {
    let seenToken = '';
    server.use(
      rest.get('https://gitlab.example.com/api/v4/projects/group%2Frepo/pipelines', (req, res, ctx) => {
        seenToken = req.headers.get('PRIVATE-TOKEN') ?? '';
        expect(req.url.searchParams.get('ref')).toBe('main');
        expect(req.url.searchParams.get('order_by')).toBe('id');
        expect(req.url.searchParams.get('sort')).toBe('desc');
        return res(ctx.json([{ id: 7, project_id: 3, ref: 'main', sha: 'abc', status: 'success', source: 'push', web_url: 'https://x/7', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:01:00Z' }]));
      }),
    );
    const api = GitlabApi.fromConfig(config);
    const result = await api.listPipelines('gitlab.example.com', 'group/repo', 'main');
    expect(seenToken).toBe('glpat-test');
    expect(result).toEqual([{ id: 7, projectId: 3, ref: 'main', sha: 'abc', status: 'success', source: 'push', webUrl: 'https://x/7', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:01:00Z' }]);
  });

  it('marks manual jobs and posts play variables in GitLab shape', async () => {
    let body: any;
    server.use(
      rest.post('https://gitlab.example.com/api/v4/projects/group%2Frepo/jobs/42/play', async (req, res, ctx) => {
        body = await req.json();
        return res(ctx.json({ id: 42, name: 'destroy', stage: 'destroy', status: 'pending', allow_failure: false, web_url: 'https://x/j/42', started_at: null, finished_at: null }));
      }),
    );
    const api = GitlabApi.fromConfig(config);
    const job = await api.playJob('gitlab.example.com', 'group/repo', 42, [{ key: 'CONFIRM_DESTROY', value: 'yes' }]);
    expect(body).toEqual({ job_variables_attributes: [{ key: 'CONFIRM_DESTROY', value: 'yes' }] });
    expect(job.manual).toBe(false);
  });

  it('throws NotFoundError for an unknown host', async () => {
    const api = GitlabApi.fromConfig(config);
    await expect(api.listBranches('other.example.com', 'g/r')).rejects.toThrow(/No GitLab integration/);
  });
});
