import { NotAllowedError } from '@backstage/errors';
import {
  APP_REF,
  CANARY,
  COMMIT,
  DEPLOY_JOB,
  MERGE_COMMIT,
  NEWER,
  OTHER,
  PROJECT_WEB_URL,
  SMOKE_FILE,
  exampleComponent,
  exampleSystem,
  expectDeclared,
  json,
  paths,
  run,
  stranger,
  text,
  world,
  type World,
} from '../fixtures';
import { GET_APP_STATUS } from './appPublication';

const pipeline = (id: number, sha: string, pipelineStatus: string) => ({
  id,
  sha,
  ref: 'main',
  status: pipelineStatus,
  web_url: `${PROJECT_WEB_URL}/-/pipelines/${id}`,
});
const job = (
  id: number,
  name: string,
  stage: string,
  jobStatus: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  stage,
  status: jobStatus,
  web_url: `${PROJECT_WEB_URL}/-/jobs/${id}`,
  ref: 'main',
  pipeline: { id: id + 1000, sha: id === 301 ? MERGE_COMMIT : NEWER },
  ...extra,
});
const smoke = (commit: string, extra: Record<string, unknown> = {}) => ({
  schema: 2,
  job: DEPLOY_JOB,
  result: 'passed',
  code: 'ok',
  commit,
  environment: 'dev',
  chart: { version: '0.1.0', digest: `sha256:${'b'.repeat(64)}` },
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
const superseded = (commit: string) => ({
  schema: 2,
  job: DEPLOY_JOB,
  result: 'skipped',
  code: 'superseded',
  commit,
  environment: 'dev',
  chart: null,
  pieces: [],
});

/** The newest default-branch pipeline, and no open requests, unless the test sets them. */
function baseline(w: World, latest: unknown[], deploys: unknown[] = []): void {
  w.gitlab.reply(paths.newestMain, json(latest));
  w.gitlab.reply(paths.projectJobs, json(deploys));
  w.gitlab.reply(paths.openRequests, json([]));
}

describe('get-app-status', () => {
  it('is declared read-only and idempotent, with its output declared', async () => {
    const w = world();
    const action = w.actions.get(GET_APP_STATUS)!;
    expect(action.attributes).toEqual({ readOnly: true, idempotent: true });
    baseline(w, []);
    const output = await run(w, GET_APP_STATUS, { app: APP_REF });
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it('reads no_pieces when the System has no Component', async () => {
    const w = world({ components: [] });
    baseline(w, []);

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({
      state: 'no_pieces',
      nextStep: 'The app has no piece yet, so there is nothing to publish.',
    });
  });

  it('reads not_published when the app has pieces and no deploy yet', async () => {
    const w = world();
    baseline(w, [pipeline(200, COMMIT, 'success')], []);

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({ state: 'not_published' });
    expect(output.pieces).toEqual([
      expect.objectContaining({
        entityRef: 'component:default/example-app-back',
      }),
    ]);
  });

  it('reads publishing with the wait call when the newest default-branch pipeline runs', async () => {
    const w = world();
    baseline(w, [pipeline(200, MERGE_COMMIT, 'running')]);

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({ state: 'publishing' });
    expect(output.nextStep).toContain(
      `commit \`${MERGE_COMMIT}\`. Call \`wait-for-app-publication\``,
    );
  });

  it('reads published with the live deploy, its smoke result and the address links', async () => {
    const w = world({
      system: exampleSystem({
        metadata: {
          name: 'example-app',
          namespace: 'default',
          annotations: {
            'gitlab.com/project-slug': 'example-org/example-app',
            'backstage.io/managed-by-location': `url:${PROJECT_WEB_URL}/-/blob/main/catalog-info.yaml`,
          },
          links: [
            {
              url: 'https://app.example.com',
              title: 'Example app',
              type: 'app-address',
            },
            { url: 'https://other.example.com', type: 'other' },
          ],
        },
      } as never),
    });
    baseline(
      w,
      [pipeline(200, MERGE_COMMIT, 'success')],
      [job(301, DEPLOY_JOB, 'deploy', 'success')],
    );
    w.gitlab.reply(
      paths.artifact(301, SMOKE_FILE),
      text(JSON.stringify(smoke(MERGE_COMMIT))),
    );

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({
      state: 'published',
      environments: [
        {
          name: 'dev',
          addresses: [{ url: 'https://app.example.com', title: 'Example app' }],
          lastDeploy: {
            commit: MERGE_COMMIT,
            result: 'passed',
            code: 'ok',
            chart: { version: '0.1.0' },
          },
        },
      ],
    });
    expect(output.nextStep).toContain(
      `Published at commit \`${MERGE_COMMIT}\``,
    );
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it('leaves the addresses empty when the System has no link of the configured type', async () => {
    const w = world();
    baseline(
      w,
      [pipeline(200, MERGE_COMMIT, 'success')],
      [job(301, DEPLOY_JOB, 'deploy', 'success')],
    );
    w.gitlab.reply(
      paths.artifact(301, SMOKE_FILE),
      text(JSON.stringify(smoke(MERGE_COMMIT))),
    );

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.environments).toEqual([
      expect.objectContaining({ addresses: [] }),
    ]);
  });

  it('skips a superseded deploy when it reads the last deploy of an environment', async () => {
    const w = world();
    baseline(
      w,
      [pipeline(200, NEWER, 'success')],
      [
        job(302, DEPLOY_JOB, 'deploy', 'success'),
        job(301, DEPLOY_JOB, 'deploy', 'success'),
      ],
    );
    w.gitlab.reply(
      paths.artifact(302, SMOKE_FILE),
      text(JSON.stringify(superseded(NEWER))),
    );
    w.gitlab.reply(
      paths.artifact(301, SMOKE_FILE),
      text(JSON.stringify(smoke(MERGE_COMMIT))),
    );

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.environments).toEqual([
      expect.objectContaining({
        name: 'dev',
        lastDeploy: expect.objectContaining({ commit: MERGE_COMMIT }),
      }),
    ]);
  });

  it('reads failed with the sentence of a failed default-branch deploy, and the live commit when an older deploy passed', async () => {
    const w = world();
    baseline(
      w,
      [pipeline(200, NEWER, 'failed')],
      [
        job(302, DEPLOY_JOB, 'deploy', 'failed'),
        job(301, DEPLOY_JOB, 'deploy', 'success'),
      ],
    );
    w.gitlab.reply(
      paths.jobs(200),
      json([job(302, DEPLOY_JOB, 'deploy', 'failed')]),
    );
    w.gitlab.reply(
      paths.artifact(302, SMOKE_FILE),
      text(
        JSON.stringify({
          schema: 2,
          job: DEPLOY_JOB,
          result: 'failed',
          code: 'platform_failed',
          commit: NEWER,
          environment: 'dev',
          chart: null,
          pieces: [],
        }),
      ),
    );
    w.gitlab.reply(
      paths.artifact(301, SMOKE_FILE),
      text(JSON.stringify(smoke(MERGE_COMMIT))),
    );

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({ state: 'failed' });
    expect(output.nextStep).toContain('could not reach the platform');
    expect(output.nextStep).toContain(
      `The live version is commit \`${MERGE_COMMIT}\`.`,
    );
  });

  it('adds the blocked sentence of an open request whose pipeline failed', async () => {
    const w = world();
    baseline(w, [pipeline(200, COMMIT, 'success')], []);
    w.gitlab.reply(
      paths.openRequests,
      json([
        {
          iid: 7,
          state: 'opened',
          target_branch: 'main',
          sha: OTHER,
          web_url: `${PROJECT_WEB_URL}/-/merge_requests/7`,
        },
      ]),
    );
    w.gitlab.reply(
      paths.request(7),
      json({
        iid: 7,
        title: 'Example change',
        state: 'opened',
        sha: OTHER,
        target_branch: 'main',
        web_url: `${PROJECT_WEB_URL}/-/merge_requests/7`,
        merge_when_pipeline_succeeds: true,
        detailed_merge_status: 'ci_must_pass',
        head_pipeline: pipeline(100, OTHER, 'failed'),
      }),
    );
    w.gitlab.reply(
      paths.jobs(100),
      json([
        job(401, 'lint-check', 'lint', 'failed', {
          failure_reason: 'script_failure',
        }),
      ]),
    );

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.nextStep).toContain(
      'Merge request !7 is blocked: The check `lint-check` failed on the change.',
    );
    expect(output.openRequests).toEqual([
      expect.objectContaining({
        iid: 7,
        pipelineStatus: 'failed',
        failedJobs: [expect.objectContaining({ name: 'lint-check' })],
      }),
    ]);
  });

  it('refuses a stranger before any GitLab request', async () => {
    const w = world();
    await expect(
      run(w, GET_APP_STATUS, { app: APP_REF }, stranger()),
    ).rejects.toThrow(NotAllowedError);
    expect(w.gitlab.calls).toEqual([]);
  });

  it('reads failed with the platform sentence, and makes no GitLab request, when the System names no project', async () => {
    const w = world({
      system: exampleSystem({
        metadata: { name: 'example-app', namespace: 'default' },
      } as never),
    });

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({
      state: 'failed',
      nextStep:
        'This app has no GitLab project in the catalog; tell the platform team.',
    });
    expect(w.gitlab.calls).toEqual([]);
  });

  it('never returns a canary written into fields that are not declared', async () => {
    const w = world({ components: [exampleComponent('example-app-back')] });
    baseline(
      w,
      [pipeline(200, MERGE_COMMIT, 'success')],
      [job(301, DEPLOY_JOB, 'deploy', 'success')],
    );
    w.gitlab.reply(
      paths.artifact(301, SMOKE_FILE),
      text(JSON.stringify(smoke(MERGE_COMMIT, { extra: CANARY }))),
    );

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(JSON.stringify(output)).not.toContain(CANARY);
  });
});
