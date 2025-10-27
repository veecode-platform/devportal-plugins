import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { GithubWorkflowsService } from './services/GithubWorkflowsService';

export async function createRouter({
  httpAuth,
  githubWorkflowsService,
}: {
  httpAuth: HttpAuthService;
  githubWorkflowsService: GithubWorkflowsService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  // Validation schemas
  const listWorkflowsSchema = z.object({
    hostname: z.string(),
    githubRepoSlug: z.string(),
    branch: z.string(),
    filter: z.string().optional().transform(val => val ? val.split(',') : undefined),
  });

  const repoSchema = z.object({
    hostname: z.string(),
    githubRepoSlug: z.string(),
  });

  const startWorkflowSchema = z.object({
    hostname: z.string(),
    githubRepoSlug: z.string(),
    workflowId: z.number(),
    branch: z.string(),
    inputs: z.record(z.unknown()).optional(),
  });

  const stopWorkflowSchema = z.object({
    hostname: z.string(),
    githubRepoSlug: z.string(),
    runId: z.number(),
  });

  const listJobsSchema = z.object({
    hostname: z.string(),
    githubRepoSlug: z.string(),
    id: z.coerce.number(),
    pageSize: z.coerce.number().optional(),
    page: z.coerce.number().optional(),
  });

  const getWorkflowRunSchema = z.object({
    hostname: z.string(),
    githubRepoSlug: z.string(),
    runId: z.coerce.number(),
  });

  const downloadLogsSchema = z.object({
    hostname: z.string(),
    githubRepoSlug: z.string(),
    jobId: z.coerce.number(),
  });

  // GET /gh-workflows/workflows
  router.get('/workflows', async (req, res) => {
    console.log('[Backend Router] GET /workflows - Query params:', req.query);
    
    const parsed = listWorkflowsSchema.safeParse(req.query);
    if (!parsed.success) {
      console.error('[Backend Router] Validation error:', parsed.error);
      throw new InputError(parsed.error.toString());
    }

    console.log('[Backend Router] Parsed data:', parsed.data);
    
    const result = await githubWorkflowsService.listWorkflows(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
      parsed.data.branch,
      parsed.data.filter,
    );

    console.log('[Backend Router] Returning result with', result?.length || 0, 'workflows');
    res.json(result);
  });

  // GET /gh-workflows/branches
  router.get('/branches', async (req, res) => {
    const parsed = repoSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.listBranchesFromRepo(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
    );

    res.json(result);
  });

  // GET /gh-workflows/default-branch
  router.get('/default-branch', async (req, res) => {
    const parsed = repoSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.getBranchDefaultFromRepo(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
    );

    res.json(result);
  });

  // POST /gh-workflows/start-workflow
  router.post('/start-workflow', async (req, res) => {
    const parsed = startWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.startWorkflowRun(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
      parsed.data.workflowId,
      parsed.data.branch,
      parsed.data.inputs,
    );

    res.json({ status: result });
  });

  // POST /gh-workflows/stop-workflow
  router.post('/stop-workflow', async (req, res) => {
    const parsed = stopWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.stopWorkflowRun(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
      parsed.data.runId,
    );

    res.json({ status: result });
  });

  // GET /gh-workflows/jobs
  router.get('/jobs', async (req, res) => {
    const parsed = listJobsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.listJobsForWorkflowRun(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
      parsed.data.id,
      parsed.data.pageSize,
      parsed.data.page,
    );

    res.json(result);
  });

  // GET /gh-workflows/workflow-run
  router.get('/workflow-run', async (req, res) => {
    const parsed = getWorkflowRunSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.getWorkflowRunById(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
      parsed.data.runId,
    );

    res.json(result);
  });

  // GET /gh-workflows/download-logs
  router.get('/download-logs', async (req, res) => {
    const parsed = downloadLogsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.downloadJobLogsForWorkflowRun(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
      parsed.data.jobId,
    );

    res.json(result);
  });

  // GET /gh-workflows/environments
  router.get('/environments', async (req, res) => {
    const parsed = repoSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await githubWorkflowsService.getEnvironmentsList(
      parsed.data.hostname,
      parsed.data.githubRepoSlug,
    );

    res.json(result);
  });

  return router;
}
