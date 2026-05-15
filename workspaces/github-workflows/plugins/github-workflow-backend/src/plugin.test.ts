import { startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { githubWorkflowBackendPlugin } from './plugin';
import { mockGithubWorkflowsServiceFactory } from './services/mockServiceFactory';

describe('githubWorkflowBackendPlugin', () => {
  it('starts up and serves the workflows endpoint', async () => {
    const { server } = await startTestBackend({
      features: [
        githubWorkflowBackendPlugin,
        mockGithubWorkflowsServiceFactory,
      ],
    });

    const res = await request(server)
      .get('/api/github-workflow-backend/workflows')
      .query({
        hostname: 'github.com',
        githubRepoSlug: 'org/repo',
        branch: 'main',
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].workflow.name).toBe('CI Build');
  });

  it('serves the branches endpoint', async () => {
    const { server } = await startTestBackend({
      features: [
        githubWorkflowBackendPlugin,
        mockGithubWorkflowsServiceFactory,
      ],
    });

    const res = await request(server)
      .get('/api/github-workflow-backend/branches')
      .query({
        hostname: 'github.com',
        githubRepoSlug: 'org/repo',
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('main');
  });
});
