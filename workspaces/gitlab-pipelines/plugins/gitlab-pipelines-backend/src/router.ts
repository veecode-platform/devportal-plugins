import { LoggerService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError } from '@backstage/errors';
import { createPermissionIntegrationRouter } from '@backstage/plugin-permission-node';
import {
  RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY,
  gitlabPipelinesPermissions,
  gitlabPipelineCancelPermission,
  gitlabPipelinePlayPermission,
  gitlabPipelineReadPermission,
  gitlabPipelineTriggerPermission,
} from '@veecode-platform/gitlab-pipelines-common';
import express from 'express';
import Router from 'express-promise-router';
import { AuthorizedContext } from './auth/authorize';
import { GitlabApi } from './service/GitlabApi';
import {
  createPipelineSchema,
  idParam,
  playJobSchema,
  refQuery,
} from './validation/schemas';

type Authorize = (
  req: express.Request,
  permission: any,
) => Promise<AuthorizedContext>;

export function createRouter({
  logger,
  authorize,
  gitlab,
}: {
  logger: LoggerService;
  authorize: Authorize;
  gitlab: GitlabApi;
}) {
  const router = Router();
  router.use(express.json());
  router.use(
    createPermissionIntegrationRouter({
      resourceType: RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY,
      permissions: gitlabPipelinesPermissions,
    }),
  );

  const E = '/entities/:namespace/:kind/:name';
  const auditFields = (
    ctx: AuthorizedContext,
    extra: Record<string, unknown>,
  ) => ({
      user: ctx.userEntityRef,
      entity: ctx.entityRef,
      project: `${ctx.host}/${ctx.projectSlug}`,
      ...extra,
    });
  const audit = (
    ctx: AuthorizedContext,
    op: string,
    extra: Record<string, unknown>,
  ) => logger.info(`gitlab-pipelines ${op}`, auditFields(ctx, extra));
  const auditedGitlabCall = async <T>(
    ctx: AuthorizedContext,
    op: string,
    extra: Record<string, unknown>,
    call: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await call();
    } catch (err) {
      logger.warn(`gitlab-pipelines ${op} failed`, auditFields(ctx, extra));
      throw err;
    }
  };
  const parse = <T>(
    schema: { safeParse: (v: unknown) => any },
    value: unknown,
  ): T => {
    const r = schema.safeParse(value);
    if (!r.success) {
      throw new InputError(
        r.error.issues.map((i: any) => i.message).join('; '),
      );
    }
    return r.data;
  };

  router.get(`${E}/branches`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineReadPermission);
    res.json(await gitlab.listBranches(c.host, c.projectSlug));
  });
  router.get(`${E}/pipelines`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineReadPermission);
    const { ref } = parse<{ ref?: string }>(refQuery, req.query);
    res.json(await gitlab.listPipelines(c.host, c.projectSlug, ref));
  });
  router.get(`${E}/pipelines/:id`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineReadPermission);
    res.json(
      await gitlab.getPipeline(
        c.host,
        c.projectSlug,
        parse<number>(idParam, req.params.id),
      ),
    );
  });
  router.get(`${E}/pipelines/:id/jobs`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineReadPermission);
    res.json(
      await gitlab.listJobs(
        c.host,
        c.projectSlug,
        parse<number>(idParam, req.params.id),
      ),
    );
  });
  router.post(`${E}/pipelines`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineTriggerPermission);
    const body = parse<{
      ref: string;
      variables: { key: string; value: string }[];
    }>(createPipelineSchema, req.body);
    const auditDetails = {
      ref: body.ref,
      variableKeys: body.variables.map(v => v.key),
    };
    const p = await auditedGitlabCall(c, 'pipeline.create', auditDetails, () =>
      gitlab.createPipeline(
        c.host,
        c.projectSlug,
        body.ref,
        body.variables,
      ),
    );
    audit(c, 'pipeline.create', {
      ...auditDetails,
      pipelineId: p.id,
    });
    res.status(201).json(p);
  });
  router.post(`${E}/pipelines/:id/retry`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineTriggerPermission);
    const id = parse<number>(idParam, req.params.id);
    const p = await auditedGitlabCall(c, 'pipeline.retry', { pipelineId: id }, () =>
      gitlab.retryPipeline(c.host, c.projectSlug, id),
    );
    audit(c, 'pipeline.retry', { pipelineId: id });
    res.json(p);
  });
  router.post(`${E}/pipelines/:id/cancel`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineCancelPermission);
    const id = parse<number>(idParam, req.params.id);
    const p = await auditedGitlabCall(c, 'pipeline.cancel', { pipelineId: id }, () =>
      gitlab.cancelPipeline(c.host, c.projectSlug, id),
    );
    audit(c, 'pipeline.cancel', { pipelineId: id });
    res.json(p);
  });
  router.post(`${E}/jobs/:id/play`, async (req, res) => {
    const c = await authorize(req, gitlabPipelinePlayPermission);
    const id = parse<number>(idParam, req.params.id);
    const body = parse<{
      variables: { key: string; value: string }[];
    }>(playJobSchema, req.body);
    const variableKeys = body.variables.map(v => v.key);
    const job = await auditedGitlabCall(c, 'job.play', { jobId: id, variableKeys }, () =>
      gitlab.getJob(c.host, c.projectSlug, id),
    );
    if (!job.manual) {
      throw new ConflictError(
        `Job ${id} (${job.name}) is ${job.status}, not manual`,
      );
    }
    const auditDetails = {
      jobId: id,
      jobName: job.name,
      variableKeys,
    };
    const played = await auditedGitlabCall(c, 'job.play', auditDetails, () =>
      gitlab.playJob(c.host, c.projectSlug, id, body.variables),
    );
    audit(c, 'job.play', auditDetails);
    res.json(played);
  });
  router.post(`${E}/jobs/:id/retry`, async (req, res) => {
    const c = await authorize(req, gitlabPipelinePlayPermission);
    const id = parse<number>(idParam, req.params.id);
    const job = await auditedGitlabCall(c, 'job.retry', { jobId: id }, () =>
      gitlab.retryJob(c.host, c.projectSlug, id),
    );
    audit(c, 'job.retry', { jobId: id });
    res.json(job);
  });
  router.post(`${E}/jobs/:id/cancel`, async (req, res) => {
    const c = await authorize(req, gitlabPipelineCancelPermission);
    const id = parse<number>(idParam, req.params.id);
    const job = await auditedGitlabCall(c, 'job.cancel', { jobId: id }, () =>
      gitlab.cancelJob(c.host, c.projectSlug, id),
    );
    audit(c, 'job.cancel', { jobId: id });
    res.json(job);
  });

  // GitLab upstream failures → 502 with the GitLab status preserved in the body
  router.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (
        typeof err?.status === 'number' &&
        typeof err?.upstreamBody === 'string' &&
        /^GitLab request failed with status \d+$/.test(err.message)
      ) {
        logger.warn('gitlab-pipelines upstream request failed', {
          op: `${req.method} ${req.path}`,
          path: req.path,
          status: err.status,
          body: err.upstreamBody,
        });
        return res.status(502).json({
          error: {
            name: 'UpstreamError',
            message: `GitLab request failed with status ${err.status}`,
            upstreamStatus: err.status,
          },
        });
      }
      return next(err);
    },
  );
  return router;
}
