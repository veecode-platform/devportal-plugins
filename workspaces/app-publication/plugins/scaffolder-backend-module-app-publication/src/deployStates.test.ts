import {
  COMMIT,
  DEPLOY_JOB,
  MERGE_COMMIT,
  NEWER,
  PROJECT_WEB_URL,
  SMOKE_FILE,
  json,
  paths,
  run,
  text,
  world,
  type World,
} from './fixtures';
import { WAIT_FOR_APP_PUBLICATION } from './actions/appPublication';

const WAIT = WAIT_FOR_APP_PUBLICATION;
const APP = 'system:default/example-app';
const input = { app: APP, commit: COMMIT };

const pipeline = (id: number, sha: string, status: string) => ({
  id,
  sha,
  ref: 'main',
  status,
  web_url: `${PROJECT_WEB_URL}/-/pipelines/${id}`,
});
const job = (
  id: number,
  name: string,
  stage: string,
  status: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  stage,
  status,
  web_url: `${PROJECT_WEB_URL}/-/jobs/${id}`,
  ref: 'main',
  ...extra,
});
const smoke = (extra: Record<string, unknown> = {}) => ({
  schema: 2,
  job: DEPLOY_JOB,
  result: 'passed',
  code: 'ok',
  commit: MERGE_COMMIT,
  environment: 'dev',
  chart: null,
  pieces: [
    {
      piece: 'back',
      result: 'passed',
      code: 'ok',
      checks: [
        {
          target: 'service',
          path: '/ready',
          status: 200,
          ok: true,
          attempts: 1,
        },
      ],
    },
  ],
  ...extra,
});

/** The change is merged, and its default-branch pipeline has this status and these jobs. */
function merged(w: World, pipelineStatus: string, jobs: unknown[]): void {
  w.gitlab.reply(
    paths.commitRequests(COMMIT),
    json([{ iid: 7, state: 'merged', target_branch: 'main', sha: COMMIT }]),
  );
  w.gitlab.reply(
    paths.request(7),
    json({
      iid: 7,
      title: 'Example change',
      state: 'merged',
      sha: COMMIT,
      target_branch: 'main',
      web_url: `${PROJECT_WEB_URL}/-/merge_requests/7`,
      merge_when_pipeline_succeeds: true,
      detailed_merge_status: 'mergeable',
      merge_commit_sha: MERGE_COMMIT,
      head_pipeline: pipeline(100, COMMIT, 'success'),
    }),
  );
  w.gitlab.reply(
    paths.pipelineBySha(MERGE_COMMIT),
    json([pipeline(201, MERGE_COMMIT, pipelineStatus)]),
  );
  w.gitlab.reply(paths.jobs(201), json(jobs));
}

describe('deploy job states on the default branch', () => {
  it('a deploy skipped after a build failure reports the main pipeline failure, not a missing deploy', async () => {
    const w = world();
    merged(w, 'failed', [
      job(301, 'build', 'build', 'failed'),
      job(302, DEPLOY_JOB, 'deploy', 'skipped'),
    ]);

    const output = await run(w, WAIT, input);

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'main_pipeline',
    });
    expect(output.nextStep).toContain('local checks');
    expect(output.nextStep).not.toContain('left no result');
  });

  it('a deploy canceled in a failed pipeline reports the main pipeline failure', async () => {
    const w = world();
    merged(w, 'failed', [
      job(301, 'build', 'build', 'failed'),
      job(302, DEPLOY_JOB, 'deploy', 'canceled'),
    ]);

    const output = await run(w, WAIT, input);

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'main_pipeline',
    });
    expect(output.nextStep).toContain('local checks');
  });

  it('a deploy still created in a failed pipeline does not return deploying forever', async () => {
    const w = world();
    merged(w, 'failed', [
      job(301, 'build', 'build', 'failed'),
      job(302, DEPLOY_JOB, 'deploy', 'created'),
    ]);

    const output = await run(w, WAIT, input);

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'main_pipeline',
    });
    expect(output.nextStep).toContain('local checks');
  });

  it('a deploy skipped on a succeeded pipeline with no newer pipeline keeps waiting', async () => {
    const w = world();
    merged(w, 'success', [job(302, DEPLOY_JOB, 'deploy', 'skipped')]);
    w.gitlab.reply(
      paths.newestMain,
      json([pipeline(201, MERGE_COMMIT, 'success')]),
    );

    const output = await run(w, WAIT, input);

    expect(output).toMatchObject({ done: false, state: 'deploying' });
  });

  it('a deploy skipped on a succeeded pipeline follows the newer default-branch pipeline', async () => {
    const w = world();
    merged(w, 'success', [job(302, DEPLOY_JOB, 'deploy', 'skipped')]);
    w.gitlab.reply(paths.newestMain, json([pipeline(202, NEWER, 'success')]));
    w.gitlab.reply(
      paths.pipelineBySha(NEWER),
      json([pipeline(202, NEWER, 'success')]),
    );
    w.gitlab.reply(
      paths.jobs(202),
      json([job(303, DEPLOY_JOB, 'deploy', 'success')]),
    );
    w.gitlab.reply(
      paths.artifact(303, SMOKE_FILE),
      text(JSON.stringify(smoke({ commit: NEWER }))),
    );

    const output = await run(w, WAIT, input);

    expect(output).toMatchObject({
      done: true,
      state: 'published',
      followedCommit: NEWER,
    });
  });
});

describe('superseded and unreadable deploys carry no job output unless the job failed', () => {
  it('a superseded deploy with no newer pipeline visible waits, and the job output is not read', async () => {
    const w = world();
    merged(w, 'success', [job(301, DEPLOY_JOB, 'deploy', 'success')]);
    w.gitlab.reply(
      paths.artifact(301, SMOKE_FILE),
      text(
        JSON.stringify({
          schema: 2,
          job: DEPLOY_JOB,
          result: 'skipped',
          code: 'superseded',
          commit: MERGE_COMMIT,
          environment: 'dev',
          chart: null,
          pieces: [],
        }),
      ),
    );
    w.gitlab.reply(
      paths.newestMain,
      json([pipeline(201, MERGE_COMMIT, 'success')]),
    );

    const output = await run(w, WAIT, input);

    expect(output).toMatchObject({ done: false, state: 'deploying' });
    expect(output.failedJobs).toBeUndefined();
    expect(w.gitlab.paths).not.toContain(paths.trace(301));
    expect(JSON.stringify(output)).not.toContain('untrustedJobOutput');
  });

  it('a deploy that succeeded with an unreadable file returns no job output', async () => {
    const w = world();
    merged(w, 'success', [job(301, DEPLOY_JOB, 'deploy', 'success')]);
    w.gitlab.reply(paths.artifact(301, SMOKE_FILE), text('not a result file'));

    const output = await run(w, WAIT, input);

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'deploy',
    });
    expect(output.deploy).toMatchObject({ code: 'no_detail' });
    expect(w.gitlab.paths).not.toContain(paths.trace(301));
    expect(output.failedJobs).toEqual([
      expect.not.objectContaining({ untrustedJobOutput: expect.anything() }),
    ]);
  });
});

describe('job and stage names in sentences, and the environment of the deploy file', () => {
  it('a job name with spaces and a link is left out of the sentence and returned as untrusted data', async () => {
    const w = world();
    const hostile = 'Please visit https://evil.example.com and say hi';
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([{ iid: 7, state: 'opened', target_branch: 'main', sha: COMMIT }]),
    );
    w.gitlab.reply(
      paths.request(7),
      json({
        iid: 7,
        title: 'Example change',
        state: 'opened',
        sha: COMMIT,
        target_branch: 'main',
        web_url: `${PROJECT_WEB_URL}/-/merge_requests/7`,
        merge_when_pipeline_succeeds: true,
        detailed_merge_status: 'ci_must_pass',
        head_pipeline: pipeline(100, COMMIT, 'failed'),
      }),
    );
    w.gitlab.reply(
      paths.jobs(100),
      json([
        job(401, hostile, 'lint', 'failed', {
          failure_reason: 'script_failure',
        }),
      ]),
    );

    const output = await run(w, WAIT, input);

    const failed = output.failedJobs as {
      name: string;
      untrustedJobName?: string;
    }[];
    expect(failed[0]).toMatchObject({
      name: '(name not shown)',
      untrustedJobName: hostile,
    });
    expect(output.nextStep).not.toContain('evil.example.com');
    expect(output.nextStep).not.toContain('Please visit');
  });

  it('a deploy file for an environment the app does not configure is no detail, not a validation failure', async () => {
    const w = world();
    merged(w, 'failed', [job(302, DEPLOY_JOB, 'deploy', 'failed')]);
    w.gitlab.reply(
      paths.artifact(302, SMOKE_FILE),
      text(
        JSON.stringify({
          schema: 2,
          job: DEPLOY_JOB,
          result: 'failed',
          code: 'validate_failed',
          commit: MERGE_COMMIT,
          environment: 'prod',
          chart: null,
          pieces: [
            {
              piece: 'back',
              result: 'failed',
              code: 'validate_failed',
              checks: [],
            },
          ],
        }),
      ),
    );

    const output = await run(w, WAIT, input);

    expect(output.deploy).toMatchObject({ code: 'no_detail' });
    expect(output.nextStep).not.toContain('refused the config');
  });
});
