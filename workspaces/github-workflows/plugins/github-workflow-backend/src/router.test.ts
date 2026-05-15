import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { GithubWorkflowsServiceApi } from './services/types';
import { MockGithubWorkflowsService } from './services/MockGithubWorkflowsService';

function spyOnService(service: GithubWorkflowsServiceApi) {
  const methods = [
    'listWorkflows',
    'listBranchesFromRepo',
    'getBranchDefaultFromRepo',
    'startWorkflowRun',
    'stopWorkflowRun',
    'listJobsForWorkflowRun',
    'getWorkflowRunById',
    'downloadJobLogsForWorkflowRun',
    'getEnvironmentsList',
  ] as const;
  for (const m of methods) {
    jest.spyOn(service, m);
  }
  return service as jest.Mocked<GithubWorkflowsServiceApi>;
}

describe('createRouter', () => {
  let app: express.Express;
  let mockService: jest.Mocked<GithubWorkflowsServiceApi>;

  beforeAll(async () => {
    mockService = spyOnService(new MockGithubWorkflowsService());

    const router = await createRouter({
      httpAuth: {} as any,
      githubWorkflowsService: mockService,
    });

    app = express();
    app.use(router);
  });

  afterEach(() => jest.clearAllMocks());

  it('GET /workflows returns workflows', async () => {
    const res = await request(app)
      .get('/workflows')
      .query({ hostname: 'github.com', githubRepoSlug: 'org/repo', branch: 'main' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].workflow.name).toBe('CI Build');
    expect(mockService.listWorkflows).toHaveBeenCalledWith('github.com', 'org/repo', 'main', undefined);
  });

  it('GET /workflows validates required params', async () => {
    const res = await request(app).get('/workflows').query({ hostname: 'github.com' });
    expect(res.status).toBe(500);
  });

  it('GET /branches returns branches', async () => {
    const res = await request(app)
      .get('/branches')
      .query({ hostname: 'github.com', githubRepoSlug: 'org/repo' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].name).toBe('main');
  });

  it('GET /default-branch returns string', async () => {
    const res = await request(app)
      .get('/default-branch')
      .query({ hostname: 'github.com', githubRepoSlug: 'org/repo' });

    expect(res.status).toBe(200);
    expect(res.body).toBe('main');
  });

  it('POST /start-workflow dispatches workflow', async () => {
    const res = await request(app)
      .post('/start-workflow')
      .send({ hostname: 'github.com', githubRepoSlug: 'org/repo', workflowId: 1001, branch: 'main' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 204 });
    expect(mockService.startWorkflowRun).toHaveBeenCalledWith('github.com', 'org/repo', 1001, 'main', undefined);
  });

  it('POST /stop-workflow cancels run', async () => {
    const res = await request(app)
      .post('/stop-workflow')
      .send({ hostname: 'github.com', githubRepoSlug: 'org/repo', runId: 5001 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 202 });
  });

  it('GET /jobs returns jobs', async () => {
    const res = await request(app)
      .get('/jobs')
      .query({ hostname: 'github.com', githubRepoSlug: 'org/repo', id: '5001' });

    expect(res.status).toBe(200);
    expect(res.body.total_count).toBe(2);
    expect(res.body.jobs).toHaveLength(2);
  });

  it('GET /workflow-run returns workflow run', async () => {
    const res = await request(app)
      .get('/workflow-run')
      .query({ hostname: 'github.com', githubRepoSlug: 'org/repo', runId: '5001' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5001);
    expect(res.body.name).toBe('CI Build');
  });

  it('GET /download-logs returns log string', async () => {
    const res = await request(app)
      .get('/download-logs')
      .query({ hostname: 'github.com', githubRepoSlug: 'org/repo', jobId: '8001' });

    expect(res.status).toBe(200);
    expect(res.body).toContain('42 passed');
  });

  it('GET /environments returns environments', async () => {
    const res = await request(app)
      .get('/environments')
      .query({ hostname: 'github.com', githubRepoSlug: 'org/repo' });

    expect(res.status).toBe(200);
    expect(res.body.total_count).toBe(2);
    expect(res.body.environments[0].name).toBe('staging');
  });
});
