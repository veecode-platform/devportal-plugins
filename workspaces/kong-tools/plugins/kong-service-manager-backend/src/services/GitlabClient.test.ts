import * as fs from 'fs/promises';
import * as path from 'path';
import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { GitlabClient } from './GitlabClient';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const creds = mockCredentials.user('user:default/alice');

const config = mockServices.rootConfig({
  data: {
    integrations: {
      gitlab: [
        { host: 'gitlab.example.com', token: 'glpat-test', apiBaseUrl: 'https://gitlab.example.com/api/v4' },
      ],
    },
  },
});

function entity(extra: Record<string, unknown> = {}) {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'box',
      namespace: 'default',
      annotations: {
        'gitlab.com/project-slug': 'group/box',
        'backstage.io/source-location': 'url:https://gitlab.example.com/group/box',
        ...extra,
      },
    },
    spec: { type: 'service', owner: 'group:default/team-a' },
  };
}

describe('GitlabClient', () => {
  describe('resolveRepo', () => {
    it('resolves host, slug and numeric project id from the entity annotations', async () => {
      const catalog = catalogServiceMock({ entities: [entity()] });
      server.use(
        rest.get('https://gitlab.example.com/api/v4/projects/group%2Fbox', (_req, res, ctx) =>
          res(ctx.json({ id: 42, default_branch: 'main' })),
        ),
      );

      const client = GitlabClient.fromConfig(config, catalog);
      const repo = await client.resolveRepo('component:default/box', creds);

      expect(repo).toEqual({
        host: 'gitlab.example.com',
        projectSlug: 'group/box',
        projectId: 42,
        defaultBranch: 'main',
      });
    });

    it('throws when the entity has no project-slug annotation', async () => {
      const e = entity();
      delete (e.metadata.annotations as Record<string, unknown>)['gitlab.com/project-slug'];
      const catalog = catalogServiceMock({ entities: [e] });

      const client = GitlabClient.fromConfig(config, catalog);
      await expect(client.resolveRepo('component:default/box', creds)).rejects.toThrow(
        /gitlab\.com\/project-slug/,
      );
    });

    it('throws when the entity does not exist', async () => {
      const catalog = catalogServiceMock({ entities: [] });
      const client = GitlabClient.fromConfig(config, catalog);
      await expect(client.resolveRepo('component:default/nope', creds)).rejects.toThrow(/not found/i);
    });
  });

  describe('materializeChart', () => {
    it('downloads the chart subtree into a temp dir shaped <dir>/chart/...', async () => {
      const catalog = catalogServiceMock({ entities: [] });
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/tree',
          (req, res, ctx) => {
            expect(req.url.searchParams.get('path')).toBe('chart');
            expect(req.url.searchParams.get('recursive')).toBe('true');
            return res(
              ctx.json([
                { path: 'chart/Chart.yaml', type: 'blob' },
                { path: 'chart/values.yaml', type: 'blob' },
                { path: 'chart/templates', type: 'tree' },
                { path: 'chart/templates/deployment.yaml', type: 'blob' },
              ]),
            );
          },
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/files/chart%2FChart.yaml/raw',
          (_req, res, ctx) => res(ctx.text('name: box\n')),
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/files/chart%2Fvalues.yaml/raw',
          (_req, res, ctx) => res(ctx.text('replicas: 1\n')),
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/files/chart%2Ftemplates%2Fdeployment.yaml/raw',
          (_req, res, ctx) => res(ctx.text('kind: Deployment\n')),
        ),
      );

      const client = GitlabClient.fromConfig(config, catalog);
      const { dir, cleanup } = await client.materializeChart(
        { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, defaultBranch: 'main' },
        'main',
      );
      try {
        await expect(fs.readFile(path.join(dir, 'chart/Chart.yaml'), 'utf8')).resolves.toBe('name: box\n');
        await expect(fs.readFile(path.join(dir, 'chart/values.yaml'), 'utf8')).resolves.toBe('replicas: 1\n');
        await expect(
          fs.readFile(path.join(dir, 'chart/templates/deployment.yaml'), 'utf8'),
        ).resolves.toBe('kind: Deployment\n');
      } finally {
        await cleanup();
      }
    });

    it('rejects a repo with no chart directory', async () => {
      const catalog = catalogServiceMock({ entities: [] });
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/tree',
          (_req, res, ctx) => res(ctx.json([])),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalog);
      await expect(
        client.materializeChart(
          { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, defaultBranch: 'main' },
          'main',
        ),
      ).rejects.toThrow(/no 'chart' directory/);
    });
  });

  describe('pathsExistingOnRef', () => {
    const repo = { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, defaultBranch: 'main' };

    it('checks existence on the given ref, not the default branch', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/files/chart%2Fvalues.yaml/raw',
          (req, res, ctx) => {
            expect(req.url.searchParams.get('ref')).toBe('kong-promote/rate-limiting');
            return res(ctx.text('kongPlugins: {}\n'));
          },
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/files/chart%2Ftemplates%2Fkongplugin-rate-limiting.yaml/raw',
          (_req, res, ctx) => res(ctx.status(404), ctx.json({ message: '404 File Not Found' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      const existing = await client.pathsExistingOnRef(repo, 'kong-promote/rate-limiting', [
        'chart/values.yaml',
        'chart/templates/kongplugin-rate-limiting.yaml',
      ]);
      expect(existing).toEqual(new Set(['chart/values.yaml']));
    });

    it('rethrows a non-404 failure', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/files/chart%2Fvalues.yaml/raw',
          (_req, res, ctx) => res(ctx.status(500), ctx.json({ message: 'boom' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(
        client.pathsExistingOnRef(repo, 'kong-promote/rate-limiting', ['chart/values.yaml']),
      ).rejects.toThrow(/GitLab request failed/);
    });
  });

  describe('ensureBranch', () => {
    const repo = { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, defaultBranch: 'main' };

    it('creates the branch from the default branch', async () => {
      let body: any;
      server.use(
        rest.post(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/branches',
          async (req, res, ctx) => {
            body = await req.json();
            return res(ctx.json({ name: 'kong-promote/rate-limiting' }));
          },
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await client.ensureBranch(repo, 'kong-promote/rate-limiting');
      expect(body).toEqual({ branch: 'kong-promote/rate-limiting', ref: 'main' });
    });

    it('treats an already-existing branch as success (crash-retry)', async () => {
      server.use(
        rest.post(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/branches',
          (_req, res, ctx) => res(ctx.status(400), ctx.json({ message: 'Branch already exists' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.ensureBranch(repo, 'kong-promote/rate-limiting')).resolves.toBeUndefined();
    });

    it('rethrows a non-already-exists 400', async () => {
      server.use(
        rest.post(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/branches',
          (_req, res, ctx) => res(ctx.status(400), ctx.json({ message: 'Invalid reference name' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.ensureBranch(repo, 'kong-promote/rate-limiting')).rejects.toThrow(
        /GitLab request failed/,
      );
    });
  });

  describe('findOpenMergeRequest / openMergeRequest / closeMergeRequest', () => {
    const repo = { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, defaultBranch: 'main' };

    it('finds an already-open MR for the branch instead of creating a second one', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/merge_requests',
          (req, res, ctx) => {
            expect(req.url.searchParams.get('source_branch')).toBe('kong-promote/rate-limiting');
            expect(req.url.searchParams.get('state')).toBe('opened');
            return res(ctx.json([{ project_id: 42, iid: 7, web_url: 'https://gitlab.example.com/group/box/-/merge_requests/7' }]));
          },
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      const mr = await client.findOpenMergeRequest(repo, 'kong-promote/rate-limiting');
      expect(mr).toEqual({ projectId: 42, iid: 7, webUrl: 'https://gitlab.example.com/group/box/-/merge_requests/7' });
    });

    it('returns undefined when no MR is open for the branch', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/merge_requests',
          (_req, res, ctx) => res(ctx.json([])),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.findOpenMergeRequest(repo, 'kong-promote/rate-limiting')).resolves.toBeUndefined();
    });

    it('opens a merge request against the default branch', async () => {
      let body: any;
      server.use(
        rest.post(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/merge_requests',
          async (req, res, ctx) => {
            body = await req.json();
            return res(ctx.json({ project_id: 42, iid: 8, web_url: 'https://gitlab.example.com/group/box/-/merge_requests/8' }));
          },
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      const mr = await client.openMergeRequest(repo, 'kong-promote/rate-limiting', 'Promote rate-limiting', 'body');
      expect(body).toMatchObject({ source_branch: 'kong-promote/rate-limiting', target_branch: 'main', title: 'Promote rate-limiting' });
      expect(mr).toEqual({ projectId: 42, iid: 8, webUrl: 'https://gitlab.example.com/group/box/-/merge_requests/8' });
    });

    it('closes a merge request', async () => {
      let body: any;
      server.use(
        rest.put(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/merge_requests/8',
          async (req, res, ctx) => {
            body = await req.json();
            return res(ctx.json({ state: 'closed' }));
          },
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await client.closeMergeRequest(repo, 8);
      expect(body).toEqual({ state_event: 'close' });
    });

    it('treats closing an already-merged MR as a no-op success', async () => {
      server.use(
        rest.put(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/merge_requests/8',
          (_req, res, ctx) => res(ctx.status(405), ctx.json({ message: 'Method Not Allowed' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.closeMergeRequest(repo, 8)).resolves.toBeUndefined();
    });
  });

  describe('getMergeRequest', () => {
    const repo = { host: 'gitlab.example.com', projectSlug: 'group/box' };

    it('returns state and merged_at', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/merge_requests/7',
          (_req, res, ctx) => res(ctx.json({ state: 'merged', merged_at: '2026-09-01T00:00:00Z' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.getMergeRequest(repo, 7)).resolves.toEqual({
        state: 'merged',
        mergedAt: '2026-09-01T00:00:00Z',
      });
    });
  });

  describe('getProject', () => {
    const repo = { host: 'gitlab.example.com', projectSlug: 'group/box' };

    it('returns archived flag and default branch', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox',
          (_req, res, ctx) => res(ctx.json({ id: 42, archived: false, default_branch: 'main' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.getProject(repo)).resolves.toEqual({ archived: false, defaultBranch: 'main' });
    });

    it('throws with a 404 status when the project is gone', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox',
          (_req, res, ctx) => res(ctx.status(404), ctx.json({ message: '404 Project Not Found' })),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.getProject(repo)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('hasSuccessfulDeployAtOrAfter', () => {
    const repo = { host: 'gitlab.example.com', projectSlug: 'group/box' };
    const since = '2026-09-01T00:00:00Z';
    const noDeployments = rest.get(
      'https://gitlab.example.com/api/v4/projects/group%2Fbox/deployments',
      (_req, res, ctx) => res(ctx.json([])),
    );

    it('is true on a successful deployment of the ref created at or after "since" — pipeline status is not consulted (ADR-019)', async () => {
      let pipelinesQueried = false;
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/deployments',
          (req, res, ctx) => {
            expect(req.url.searchParams.get('status')).toBe('success');
            expect(req.url.searchParams.get('updated_after')).toBe(since);
            // GitLab 400s on updated_after without order_by=updated_at (seen live).
            expect(req.url.searchParams.get('order_by')).toBe('updated_at');
            return res(
              ctx.json([
                { id: 7, sha: 'merge-sha', ref: 'main', status: 'success', created_at: '2026-09-01T00:02:00Z' },
              ]),
            );
          },
        ),
        rest.get('https://gitlab.example.com/api/v4/projects/group%2Fbox/pipelines', (_req, res, ctx) => {
          pipelinesQueried = true;
          return res(ctx.json([]));
        }),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.hasSuccessfulDeployAtOrAfter(repo, 'main', since)).resolves.toBe(true);
      expect(pipelinesQueried).toBe(false);
    });

    it('ignores deployments of another ref or created before "since"', async () => {
      server.use(
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/deployments',
          (_req, res, ctx) =>
            res(
              ctx.json([
                { id: 8, sha: 'feature-sha', ref: 'feature/x', status: 'success', created_at: '2026-09-01T00:05:00Z' },
                { id: 6, sha: 'old-sha', ref: 'main', status: 'success', created_at: '2026-08-31T23:59:00Z' },
              ]),
            ),
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/commits',
          (_req, res, ctx) => res(ctx.json([{ id: 'merge-sha' }])),
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/pipelines',
          (_req, res, ctx) => res(ctx.json([{ id: 1, sha: 'stale-sha' }])),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.hasSuccessfulDeployAtOrAfter(repo, 'main', since)).resolves.toBe(false);
    });

    it('falls back to a successful pipeline for a commit at or after "since" when the repo records no deployments', async () => {
      server.use(
        noDeployments,
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/commits',
          (req, res, ctx) => {
            expect(req.url.searchParams.get('ref_name')).toBe('main');
            expect(req.url.searchParams.get('since')).toBe(since);
            return res(ctx.json([{ id: 'merge-sha' }, { id: 'later-sha' }]));
          },
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/pipelines',
          (req, res, ctx) => {
            expect(req.url.searchParams.get('status')).toBe('success');
            return res(ctx.json([{ id: 2, sha: 'later-sha' }, { id: 1, sha: 'unrelated-sha' }]));
          },
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.hasSuccessfulDeployAtOrAfter(repo, 'main', since)).resolves.toBe(true);
    });

    it('is false when there are no deployments and every successful pipeline predates "since"', async () => {
      server.use(
        noDeployments,
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/commits',
          (_req, res, ctx) => res(ctx.json([{ id: 'merge-sha' }])),
        ),
        rest.get(
          'https://gitlab.example.com/api/v4/projects/group%2Fbox/pipelines',
          (_req, res, ctx) => res(ctx.json([{ id: 1, sha: 'stale-sha' }])),
        ),
      );
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));
      await expect(client.hasSuccessfulDeployAtOrAfter(repo, 'main', since)).resolves.toBe(false);
    });
  });

  describe('commitEdits', () => {
    it('sends update actions for existing files and create actions for new ones, with content read back from disk', async () => {
      const repo = { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, defaultBranch: 'main' };
      const client = GitlabClient.fromConfig(config, catalogServiceMock({ entities: [] }));

      const dir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'kong-promotion-commit-test-'));
      try {
        await fs.mkdir(path.join(dir, 'chart/templates'), { recursive: true });
        await fs.writeFile(path.join(dir, 'chart/values.yaml'), 'kongPlugins:\n  rateLimiting:\n    minute: 60\n');
        await fs.writeFile(
          path.join(dir, 'chart/templates/kongplugin-rate-limiting.yaml'),
          'kind: KongPlugin\n',
        );

        let body: any;
        server.use(
          rest.post(
            'https://gitlab.example.com/api/v4/projects/group%2Fbox/repository/commits',
            async (req, res, ctx) => {
              body = await req.json();
              return res(ctx.json({ id: 'sha-abc' }));
            },
          ),
        );

        const result = await client.commitEdits(
          repo,
          'kong-promote/rate-limiting',
          dir,
          [
            { path: 'chart/values.yaml', op: 'merge', values: {} },
            { path: 'chart/templates/kongplugin-rate-limiting.yaml', op: 'create', content: '' },
          ],
          new Set(['chart/values.yaml']),
          'kong: promote rate-limiting',
        );

        expect(result).toEqual({ sha: 'sha-abc' });
        expect(body).toEqual({
          branch: 'kong-promote/rate-limiting',
          commit_message: 'kong: promote rate-limiting',
          actions: [
            { action: 'update', file_path: 'chart/values.yaml', content: 'kongPlugins:\n  rateLimiting:\n    minute: 60\n' },
            { action: 'create', file_path: 'chart/templates/kongplugin-rate-limiting.yaml', content: 'kind: KongPlugin\n' },
          ],
        });
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  });
});
