import { LoggerService } from '@backstage/backend-plugin-api';
import { GitlabApi } from './GitlabApi';
import { TeardownOperationRow, TeardownStore } from './teardownStore';

// Bounds retries across restarts: a teardown operation that keeps failing to
// talk to GitLab is marked failed instead of staying pending forever.
const MAX_RECONCILE_ATTEMPTS = 50;

export interface LifecycleReconcilerConfig {
  catalogFile: string;
  deployJobName: string;
}

/**
 * Runs one reconciliation pass over every pending teardown operation.
 *
 * Consumed, failed, and superseded operations are terminal and are never
 * looked at again — `store.listPending()` only returns `pending` rows, so a
 * revived service cannot be re-unregistered by an old operation.
 *
 * A sweep pass (catalog entities with no matching teardown operation at all)
 * is out of scope for this change; it would hook in here as an additional
 * pass over the catalog before or after this loop.
 */
export async function reconcileTeardowns(deps: {
  logger: LoggerService;
  gitlab: GitlabApi;
  store: TeardownStore;
  config: LifecycleReconcilerConfig;
}): Promise<void> {
  const { logger, gitlab, store, config } = deps;
  const pending = await store.listPending();
  for (const op of pending) {
    try {
      await reconcileOne({ logger, gitlab, store, config, op });
    } catch (err) {
      const attempts = await store.incrementAttempts(op.id);
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('gitlab-pipelines lifecycle reconcile failed, will retry', {
        operationId: op.id,
        project: `${op.host}/${op.project_slug}`,
        attempts,
        error: message,
      });
      if (attempts >= MAX_RECONCILE_ATTEMPTS) {
        await store.markState(op.id, 'failed', {
          detail: `exceeded ${MAX_RECONCILE_ATTEMPTS} reconcile attempts: ${message}`,
        });
      }
    }
  }
}

async function reconcileOne(deps: {
  logger: LoggerService;
  gitlab: GitlabApi;
  store: TeardownStore;
  config: LifecycleReconcilerConfig;
  op: TeardownOperationRow;
}): Promise<void> {
  const { logger, gitlab, store, config, op } = deps;
  const project = `${op.host}/${op.project_slug}`;

  const job = await gitlab.getJob(op.host, op.project_slug, op.job_id);
  if (job.status === 'failed' || job.status === 'canceled') {
    await store.markState(op.id, 'failed', { detail: `teardown job ${job.status}` });
    logger.info('gitlab-pipelines lifecycle teardown job did not succeed', { operationId: op.id, project, status: job.status });
    return;
  }
  if (job.status !== 'success') {
    return; // still running or manual — check again next tick
  }
  if (!job.finishedAt) {
    // Success with no finishedAt is unexpected; without it we cannot safely
    // order it against a later deploy, so leave it pending rather than risk
    // unregistering a service a later deploy revived.
    logger.warn('gitlab-pipelines lifecycle teardown job succeeded with no finishedAt, leaving pending', { operationId: op.id, project });
    return;
  }

  const projectInfo = await gitlab.getProject(op.host, op.project_slug);
  const pipeline = await gitlab.getPipeline(op.host, op.project_slug, op.pipeline_id);
  if (pipeline.ref !== projectInfo.defaultBranch) {
    await store.markState(op.id, 'failed', {
      detail: `pipeline ref ${pipeline.ref} is not the default branch (${projectInfo.defaultBranch})`,
    });
    return;
  }

  const teardownFinishedAt = Date.parse(job.finishedAt);
  const laterDeploys = await gitlab.listJobsByName(op.host, op.project_slug, config.deployJobName, { scopeSuccess: true });
  const supersededBy = laterDeploys.find(
    d => d.finishedAt !== null && Date.parse(d.finishedAt) > teardownFinishedAt,
  );
  if (supersededBy) {
    await store.markState(op.id, 'superseded', {
      detail: `deploy job ${supersededBy.id} succeeded after the teardown job`,
    });
    logger.info('gitlab-pipelines lifecycle teardown superseded by a later deploy', { operationId: op.id, project });
    return;
  }

  const commitMessage = `chore: unregister from catalog (teardown requested by ${op.requester_ref} via portal)`;
  const result = await gitlab.deleteFile(op.host, op.project_slug, projectInfo.defaultBranch, config.catalogFile, commitMessage);
  if ('alreadyAbsent' in result) {
    await store.markState(op.id, 'consumed', { detail: 'catalog file already absent' });
  } else {
    await store.markState(op.id, 'consumed', { unregisterCommitSha: result.commitSha });
  }
  logger.info('gitlab-pipelines lifecycle teardown consumed', { operationId: op.id, project });
}
