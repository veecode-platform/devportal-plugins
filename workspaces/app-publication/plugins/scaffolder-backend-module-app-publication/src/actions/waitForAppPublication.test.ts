import {
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import {
  APP_REF,
  CANARY,
  COMMIT,
  CONTRACT_FILE,
  DEPLOY_JOB,
  FakeGitlab,
  MERGE_COMMIT,
  NEWER,
  OTHER,
  PROJECT_WEB_URL,
  SMOKE_FILE,
  TEAM_REF,
  json,
  paths,
  run,
  service,
  status,
  stranger,
  text,
  world,
  expectDeclared,
  type World,
  type Reply,
  exampleComponent,
  exampleSystem,
} from '../fixtures';
import { WAIT_FOR_APP_PUBLICATION } from './appPublication';

const WAIT = WAIT_FOR_APP_PUBLICATION;
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
  ...extra,
});
const request = (extra: Record<string, unknown> = {}) => ({
  iid: 7,
  title: 'Example change',
  state: 'opened',
  sha: COMMIT,
  target_branch: 'main',
  web_url: `${PROJECT_WEB_URL}/-/merge_requests/7`,
  merge_when_pipeline_succeeds: true,
  detailed_merge_status: 'mergeable',
  merge_commit_sha: null,
  squash_commit_sha: null,
  head_pipeline: pipeline(100, COMMIT, 'success'),
  ...extra,
});
const listed = (iid = 7, state = 'opened', sha = COMMIT) => ({
  iid,
  state,
  target_branch: 'main',
  sha,
});
const smoke = (extra: Record<string, unknown> = {}) => ({
  schema: 2,
  job: DEPLOY_JOB,
  result: 'passed',
  code: 'ok',
  commit: MERGE_COMMIT,
  environment: 'dev',
  chart: { version: '0.1.0', digest: `sha256:${'a'.repeat(64)}` },
  pieces: [
    {
      piece: 'back',
      release: 'example-app-back',
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
        {
          target: 'service',
          path: '/health',
          status: 200,
          ok: true,
          attempts: 1,
        },
      ],
    },
  ],
  ...extra,
});

/** Input for the wait tool: the app and the commit that was pushed. */
const input = (extra: Record<string, unknown> = {}) => ({
  app: APP_REF,
  commit: COMMIT,
  ...extra,
});

/** A merged request, with its merge commit set. */
const merged = (mergeCommit: string | null = MERGE_COMMIT) =>
  request({
    state: 'merged',
    merge_commit_sha: mergeCommit,
    head_pipeline: pipeline(100, COMMIT, 'success'),
  });

function deployOnMerge(
  w: World,
  options: {
    landed?: string;
    deployStatus?: string;
    smokeFile?: string | undefined;
    trace?: string;
  } = {},
): void {
  const landed = options.landed ?? MERGE_COMMIT;
  w.gitlab.reply(
    paths.pipelineBySha(landed),
    json([pipeline(201, landed, 'success')]),
  );
  w.gitlab.reply(
    paths.jobs(201),
    json([job(301, DEPLOY_JOB, 'deploy', options.deployStatus ?? 'success')]),
  );
  if (options.smokeFile !== undefined) {
    w.gitlab.reply(paths.artifact(301, SMOKE_FILE), text(options.smokeFile));
  }
  if (options.trace !== undefined) {
    w.gitlab.reply(paths.trace(301), text(options.trace));
  }
}

/** A failed request pipeline with the given jobs. */
function failedRequest(
  w: World,
  jobs: unknown[],
  extra: Record<string, unknown> = {},
): void {
  w.gitlab.reply(paths.commitRequests(COMMIT), json([listed()]));
  w.gitlab.reply(
    paths.request(7),
    json(request({ head_pipeline: pipeline(100, COMMIT, 'failed'), ...extra })),
  );
  w.gitlab.reply(paths.jobs(100), json(jobs));
  w.gitlab.reply(
    paths.requestDiffs(7),
    json([{ new_path: 'catalog-info.yaml' }]),
  );
}

describe('wait-for-app-publication: the walk', () => {
  it('says waiting_for_push while GitLab does not show the commit', async () => {
    const w = world();
    w.gitlab.reply(paths.commitRequests(COMMIT), json([]));

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: false,
      state: 'waiting_for_push',
      commit: COMMIT,
    });
    expectDeclared(w, WAIT, output);
  });

  it('reads checking while the request pipeline runs, and walks to published in one call when the clock allows', async () => {
    const w = world();
    w.gitlab.reply(paths.commitRequests(COMMIT), json([listed()]));
    w.gitlab.reply(
      paths.request(7),
      json(request({ head_pipeline: pipeline(100, COMMIT, 'running') })),
      json(request()),
      json(merged()),
    );
    w.gitlab.reply(paths.requestDiffs(7), json([]));
    deployOnMerge(w, { smokeFile: JSON.stringify(smoke()) });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: true,
      state: 'published',
      deploy: {
        commit: MERGE_COMMIT,
        environment: 'dev',
        result: 'passed',
        code: 'ok',
        chart: { version: '0.1.0' },
        pieces: [{ piece: 'back', result: 'passed', code: 'ok' }],
      },
    });
    expectDeclared(w, WAIT, output);
    expect(w.gitlab.paths).toContain(paths.pipelineBySha(MERGE_COMMIT));
  });

  it('reads merging while the checks pass and auto-merge is on, with the merge status in the next step', async () => {
    const w = world();
    w.gitlab.reply(paths.commitRequests(COMMIT), json([listed()]));
    w.gitlab.reply(
      paths.request(7),
      json(request({ detailed_merge_status: 'unchecked' })),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: false, state: 'merging' });
    expect(output.nextStep).toContain('unchecked');
  });

  it('follows the landed commit of a fast-forward merge when the merge commit is null', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged(null)));
    deployOnMerge(w, {
      landed: COMMIT,
      smokeFile: JSON.stringify(smoke({ commit: COMMIT })),
    });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: true, state: 'published' });
    expect(w.gitlab.paths).toContain(paths.pipelineBySha(COMMIT));
  });

  it('chooses the named request, and without a name the open one', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(5, 'closed'), listed(9, 'opened')]),
    );
    w.gitlab.reply(paths.request(9), json(request({ iid: 9 })));

    const open = await run(w, WAIT, input());
    expect(open).toMatchObject({ mergeRequest: { iid: 9 } });

    w.gitlab.reply(
      paths.request(5),
      json(request({ iid: 5, state: 'closed' })),
    );
    const named = await run(w, WAIT, input({ mergeRequest: 5 }));
    expect(named).toMatchObject({
      done: true,
      state: 'closed',
      mergeRequest: { iid: 5 },
    });
  });

  it('reads checking, not failed, while the head pipeline still belongs to the previous push', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'opened', NEWER)]),
    );
    w.gitlab.reply(
      paths.request(7),
      json(
        request({ sha: NEWER, head_pipeline: pipeline(100, COMMIT, 'failed') }),
      ),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: false,
      state: 'checking',
      followedCommit: NEWER,
    });
  });

  it('blocks when auto-merge was not set, with the sentence that asks for a push with the option', async () => {
    const w = world();
    w.gitlab.reply(paths.commitRequests(COMMIT), json([listed()]));
    w.gitlab.reply(
      paths.request(7),
      json(request({ merge_when_pipeline_succeeds: false })),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: true, state: 'blocked' });
    expect(output.nextStep).toContain('-o merge_request.auto_merge');
  });

  it.each([
    ['need_rebase', 'The default branch moved'],
    ['conflict', 'conflicts with the default branch'],
    ['draft_status', 'is a draft'],
  ])('blocks on %s with its own sentence', async (detail, sentence) => {
    const w = world();
    w.gitlab.reply(paths.commitRequests(COMMIT), json([listed()]));
    w.gitlab.reply(
      paths.request(7),
      json(request({ detailed_merge_status: detail })),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: true, state: 'blocked' });
    expect(output.nextStep).toContain(sentence);
  });

  it('reads closed without a merge as done', async () => {
    const w = world();
    w.gitlab.reply(paths.commitRequests(COMMIT), json([listed(7, 'closed')]));
    w.gitlab.reply(paths.request(7), json(request({ state: 'closed' })));

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: true, state: 'closed' });
  });

  it('reports the merged request with no piece as merged', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    w.gitlab.reply(
      paths.pipelineBySha(MERGE_COMMIT),
      json([pipeline(201, MERGE_COMMIT, 'success')]),
    );
    w.gitlab.reply(paths.jobs(201), json([]));

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: true, state: 'merged' });
  });

  it('reads deploying while the default branch has no pipeline for the landed commit', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    w.gitlab.reply(paths.pipelineBySha(MERGE_COMMIT), json([]));

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: false, state: 'deploying' });
  });

  it('fails at the main pipeline with the sentence of a failed build job', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    w.gitlab.reply(
      paths.pipelineBySha(MERGE_COMMIT),
      json([pipeline(201, MERGE_COMMIT, 'failed')]),
    );
    w.gitlab.reply(
      paths.jobs(201),
      json([job(301, 'build', 'build', 'failed')]),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'main_pipeline',
    });
    expect(output.nextStep).toContain('local checks');
  });

  it('follows a superseded deploy to the newest default-branch pipeline', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    w.gitlab.reply(
      paths.pipelineBySha(MERGE_COMMIT),
      json([pipeline(201, MERGE_COMMIT, 'success')]),
    );
    w.gitlab.reply(
      paths.jobs(201),
      json([job(301, DEPLOY_JOB, 'deploy', 'success')]),
    );
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
    w.gitlab.reply(paths.newestMain, json([pipeline(202, NEWER, 'success')]));
    w.gitlab.reply(
      paths.pipelineBySha(NEWER),
      json([pipeline(202, NEWER, 'success')]),
    );
    w.gitlab.reply(
      paths.jobs(202),
      json([job(302, DEPLOY_JOB, 'deploy', 'success')]),
    );
    w.gitlab.reply(
      paths.artifact(302, SMOKE_FILE),
      text(JSON.stringify(smoke({ commit: NEWER }))),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: true,
      state: 'published',
      followedCommit: NEWER,
    });
  });

  it('reads deploying while the deploy job has not started', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    deployOnMerge(w, { deployStatus: 'created' });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: false, state: 'deploying' });
  });
});

describe('wait-for-app-publication: deploy failures', () => {
  const failingDeploy = (file: Record<string, unknown>) => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    deployOnMerge(w, {
      deployStatus: 'failed',
      smokeFile: JSON.stringify(file),
    });
    return w;
  };

  it.each([
    [
      'validate_failed',
      {
        result: 'failed',
        code: 'validate_failed',
        pieces: [
          {
            piece: 'back',
            result: 'failed',
            code: 'validate_failed',
            checks: [],
          },
        ],
      },
      'The platform chart refused the config of `back` for `dev`',
    ],
    [
      'install_failed',
      {
        result: 'failed',
        code: 'install_failed',
        pieces: [
          {
            piece: 'back',
            result: 'failed',
            code: 'install_failed',
            checks: [],
          },
        ],
      },
      'it never became ready',
    ],
    [
      'path_failed',
      {
        result: 'failed',
        code: 'path_failed',
        pieces: [
          {
            piece: 'back',
            result: 'failed',
            code: 'path_failed',
            checks: [
              {
                target: 'service',
                path: '/health',
                status: 503,
                ok: false,
                attempts: 10,
              },
            ],
          },
        ],
      },
      '`/health` answered `503` after `10` tries',
    ],
    [
      'not_run',
      {
        result: 'failed',
        code: 'not_run',
        pieces: [
          { piece: 'back', result: 'failed', code: 'not_run', checks: [] },
        ],
      },
      'could not run',
    ],
    [
      'platform_failed',
      { result: 'failed', code: 'platform_failed', pieces: [] },
      'could not reach the platform',
    ],
  ])('gives the sentence for %s', async (code, body, sentence) => {
    const w = failingDeploy({
      schema: 2,
      job: DEPLOY_JOB,
      commit: MERGE_COMMIT,
      environment: 'dev',
      chart: null,
      ...body,
    });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'deploy',
      deploy: { code },
    });
    expect(output.nextStep).toContain(sentence);
    expect(output.nextStep).not.toContain('previous version keeps running');
  });

  it('points a validate_failed sentence to the app root CLAUDE.md, not to a file in the piece', async () => {
    const w = failingDeploy({
      schema: 2,
      job: DEPLOY_JOB,
      result: 'failed',
      code: 'validate_failed',
      commit: MERGE_COMMIT,
      environment: 'dev',
      chart: null,
      pieces: [
        {
          piece: 'back',
          result: 'failed',
          code: 'validate_failed',
          checks: [],
        },
      ],
    });

    const output = await run(w, WAIT, input());

    expect(output.nextStep).toContain("in the app's root `CLAUDE.md`");
    expect(output.nextStep).toContain('`back/config/dev.yaml`');
    expect(output.nextStep).not.toContain('back/CLAUDE.md');
  });

  it('reports the top code and both pieces when the second piece failed', async () => {
    const w = world({
      components: [
        exampleComponent('example-app-back'),
        exampleComponent('example-app-front'),
      ],
    });
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    deployOnMerge(w, {
      deployStatus: 'failed',
      smokeFile: JSON.stringify({
        schema: 2,
        job: DEPLOY_JOB,
        result: 'failed',
        code: 'path_failed',
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
          {
            piece: 'front',
            result: 'failed',
            code: 'path_failed',
            checks: [
              {
                target: 'service',
                path: '/ready',
                status: 500,
                ok: false,
                attempts: 3,
              },
            ],
          },
        ],
      }),
    });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      state: 'failed',
      deploy: { code: 'path_failed' },
    });
    expect(output.deploy).toMatchObject({
      pieces: [{ piece: 'back' }, { piece: 'front' }],
    });
  });

  it.each([
    ['a commit other than the pipeline', { commit: OTHER }],
    [
      'a piece that is not a component of the app',
      {
        pieces: [{ piece: 'front', result: 'passed', code: 'ok', checks: [] }],
      },
    ],
    [
      'a path outside the list',
      {
        pieces: [
          {
            piece: 'back',
            result: 'failed',
            code: 'path_failed',
            checks: [
              {
                target: 'service',
                path: '/metrics',
                status: 500,
                ok: false,
                attempts: 1,
              },
            ],
          },
        ],
      },
    ],
    [
      'a status outside 100 to 599',
      {
        pieces: [
          {
            piece: 'back',
            result: 'failed',
            code: 'path_failed',
            checks: [
              {
                target: 'service',
                path: '/ready',
                status: 700,
                ok: false,
                attempts: 1,
              },
            ],
          },
        ],
      },
    ],
    [
      'a digest of the wrong form',
      { chart: { version: '0.1.0', digest: 'sha256:short' } },
    ],
    ['schema 1', { schema: 1 }],
    ['an unknown key', { extra: CANARY }],
  ])('gives no detail for a file with %s', async (_label, change) => {
    const base = {
      schema: 2,
      job: DEPLOY_JOB,
      result: 'failed',
      code: 'platform_failed',
      commit: MERGE_COMMIT,
      environment: 'dev',
      chart: null,
      pieces: [],
    };
    const w = failingDeploy({ ...base, ...change });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      state: 'failed',
      step: 'deploy',
      deploy: { code: 'no_detail' },
    });
    expect(output.nextStep).toContain('left no result the portal can read');
    expect(JSON.stringify(output)).not.toContain(CANARY);
  });

  it('gives no detail with the end of the log when the deploy job has no file', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([listed(7, 'merged', MERGE_COMMIT)]),
    );
    w.gitlab.reply(paths.request(7), json(merged()));
    const lines = Array.from(
      { length: 60 },
      (_, index) => `log line ${index + 1}`,
    );
    deployOnMerge(w, { deployStatus: 'failed', trace: lines.join('\n') });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'deploy',
      deploy: { code: 'no_detail' },
    });
    const failedJob = (
      output.failedJobs as { untrustedJobOutput?: string[] }[]
    )[0];
    expect(failedJob.untrustedJobOutput).toHaveLength(40);
    expect(failedJob.untrustedJobOutput?.[39]).toBe('log line 60');
    expect(failedJob.untrustedJobOutput?.[0]).toBe('log line 21');
  });
});

describe('wait-for-app-publication: failed request pipeline', () => {
  it('keeps only the paths of the change, and only from the request diff', async () => {
    const w = world();
    failedRequest(w, [
      job(401, 'contract', 'lint', 'failed', {
        failure_reason: 'script_failure',
      }),
    ]);
    w.gitlab.reply(
      paths.artifact(401, CONTRACT_FILE),
      text(
        JSON.stringify({
          schema: 1,
          job: 'contract',
          result: 'failed',
          code: 'owned_file_changed',
          paths: ['catalog-info.yaml', 'platform/secret.yaml', '../escape'],
          commits: [],
        }),
      ),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({
      done: true,
      state: 'failed',
      step: 'merge_request',
    });
    const failed = (
      output.failedJobs as { paths?: string[]; code?: string }[]
    )[0];
    expect(failed.code).toBe('owned_file_changed');
    expect(failed.paths).toEqual(['catalog-info.yaml']);
    expect(output.nextStep).toContain('`catalog-info.yaml`');
    expect(output.nextStep).toContain('git checkout origin/main -- <path>');
    expect(output.nextStep).not.toContain('platform/secret.yaml');
  });

  it('gives the unreadable-path sentence and the checker-missing sentence', async () => {
    const w = world();
    failedRequest(w, [
      job(401, 'contract', 'lint', 'failed', {
        failure_reason: 'script_failure',
      }),
    ]);
    w.gitlab.reply(
      paths.artifact(401, CONTRACT_FILE),
      text(
        JSON.stringify({
          schema: 1,
          job: 'contract',
          result: 'failed',
          code: 'unreadable_path',
          paths: [],
          commits: [],
        }),
      ),
    );
    const unreadable = await run(w, WAIT, input());
    expect(unreadable.nextStep).toContain('control character');

    w.gitlab.reply(
      paths.artifact(401, CONTRACT_FILE),
      text(
        JSON.stringify({
          schema: 1,
          job: 'contract',
          result: 'failed',
          code: 'checker_missing',
          paths: [],
          commits: [],
        }),
      ),
    );
    const missing = await run(w, WAIT, input());
    expect(missing.nextStep).toContain('contract check is missing');
    expect(missing.nextStep).toContain(`${PROJECT_WEB_URL}/-/jobs/401`);
  });

  it('gives the end of the log for a contract job with no readable file, and never a passed result', async () => {
    const w = world();
    failedRequest(w, [
      job(401, 'contract', 'lint', 'failed', {
        failure_reason: 'script_failure',
      }),
    ]);
    w.gitlab.reply(paths.trace(401), text(`first\nsecond ${CANARY}\nthird`));
    const missing = await run(w, WAIT, input());
    expect(missing.failedJobs).toEqual([
      expect.objectContaining({
        name: 'contract',
        untrustedJobOutput: ['first', `second ${CANARY}`, 'third'],
      }),
    ]);

    w.gitlab.reply(
      paths.artifact(401, CONTRACT_FILE),
      text(
        JSON.stringify({
          schema: 1,
          job: 'contract',
          result: 'passed',
          code: 'owned_file_changed',
          paths: ['catalog-info.yaml'],
          commits: [],
        }),
      ),
    );
    const passed = await run(w, WAIT, input());
    expect(passed.failedJobs).toEqual([
      expect.objectContaining({ untrustedJobOutput: expect.any(Array) }),
    ]);
    expect(passed.failedJobs).toEqual([
      expect.not.objectContaining({ code: 'owned_file_changed' }),
    ]);
    expect(passed.nextStep).not.toContain(
      'edits files that belong to the platform',
    );
  });

  it('gives no detail when the contract file is over the size cap', async () => {
    const w = world({ settings: { maxArtifactBytes: 1024 } });
    failedRequest(w, [
      job(401, 'contract', 'lint', 'failed', {
        failure_reason: 'script_failure',
      }),
    ]);
    w.gitlab.reply(
      paths.artifact(401, CONTRACT_FILE),
      text(`{"schema":1,"pad":"${'x'.repeat(2000)}"}`),
    );

    const output = await run(w, WAIT, input());

    expect(output.failedJobs).toEqual([
      expect.objectContaining({ name: 'contract', untrustedJobOutput: [] }),
    ]);
  });

  it('gives the sentence for each kind of failed job, drops allow_failure jobs, and returns at most five', async () => {
    const w = world();
    failedRequest(w, [
      job(401, 'lint-check', 'lint', 'failed', {
        failure_reason: 'script_failure',
      }),
      job(402, 'build-app', 'build', 'failed', {
        failure_reason: 'script_failure',
      }),
      job(403, 'scan-deps', 'scan', 'failed', {
        failure_reason: 'script_failure',
      }),
      job(404, 'runner-check', 'build', 'failed', {
        failure_reason: 'runner_system_failure',
      }),
      job(405, 'slow-tests', 'build', 'failed', {
        failure_reason: 'job_execution_timeout',
      }),
      job(406, 'optional', 'lint', 'failed', {
        failure_reason: 'script_failure',
        allow_failure: true,
      }),
      job(407, 'conflict-markers', 'lint', 'failed', {
        failure_reason: 'script_failure',
      }),
    ]);
    const output = await run(w, WAIT, input());

    const failed = output.failedJobs as { name: string }[];
    expect(failed.map(entry => entry.name)).toEqual([
      'conflict-markers',
      'lint-check',
      'build-app',
      'runner-check',
      'slow-tests',
    ]);
    expect(output.nextStep).toContain('outside the change');
    expect(output.nextStep).toContain('ran out of time');
    expect(output.nextStep).toContain('local checks');
  });

  it('gives the scan sentence with the end of the scan log', async () => {
    const w = world();
    failedRequest(w, [
      job(403, 'scan-deps', 'scan', 'failed', {
        failure_reason: 'script_failure',
      }),
    ]);
    w.gitlab.reply(paths.trace(403), text('scan output'));

    const output = await run(w, WAIT, input());

    expect(output.nextStep).toContain(
      'The scan `scan-deps` failed on the change',
    );
    expect(output.failedJobs).toEqual([
      expect.objectContaining({
        name: 'scan-deps',
        untrustedJobOutput: ['scan output'],
      }),
    ]);
  });

  it('gives the conflict-markers sentence for its job', async () => {
    const w = world();
    failedRequest(w, [
      job(407, 'conflict-markers', 'lint', 'failed', {
        failure_reason: 'script_failure',
      }),
    ]);

    const output = await run(w, WAIT, input());

    expect(output.nextStep).toContain('Git conflict markers');
    expect(output.failedJobs).toEqual([
      expect.not.objectContaining({ untrustedJobOutput: expect.anything() }),
    ]);
  });
});

describe('wait-for-app-publication: owner, input and bounds', () => {
  it('refuses a stranger before any GitLab request', async () => {
    const w = world();
    await expect(run(w, WAIT, input(), stranger())).rejects.toThrow(
      NotAllowedError,
    );
    expect(w.gitlab.calls).toEqual([]);
  });

  it('refuses a service principal, a missing system and a system with no owner match before any GitLab request', async () => {
    const w = world();
    await expect(run(w, WAIT, input(), service())).rejects.toThrow(
      NotAllowedError,
    );
    expect(w.gitlab.calls).toEqual([]);

    const missing = world({ system: undefined });
    await expect(run(missing, WAIT, input())).rejects.toThrow(NotFoundError);
    expect(missing.gitlab.calls).toEqual([]);
  });

  it('accepts an owner who holds the app through a group, in short or full form', async () => {
    const w = world({
      ownershipRefs: ['group:example-team'],
      system: exampleSystem({ spec: { owner: TEAM_REF } } as never),
    });
    w.gitlab.reply(paths.commitRequests(COMMIT), json([]));

    await expect(run(w, WAIT, input())).resolves.toMatchObject({
      state: 'waiting_for_push',
    });
  });

  it('refuses an input that is not a system reference, or a commit that is not a full lowercase SHA, before any GitLab request', async () => {
    const w = world();
    await expect(
      run(w, WAIT, input({ app: 'component:default/example-app-back' })),
    ).rejects.toThrow(/app must be a System entity reference/);
    await expect(run(w, WAIT, input({ commit: 'abc1234' }))).rejects.toThrow();
    await expect(
      run(w, WAIT, input({ commit: 'A'.repeat(40) })),
    ).rejects.toThrow();
    expect(w.gitlab.calls).toEqual([]);
  });

  it('reads done with the platform sentence when the System has no GitLab project', async () => {
    const w = world({
      system: exampleSystem({
        metadata: { name: 'example-app', namespace: 'default' },
      } as never),
    });

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: true, state: 'failed' });
    expect(output.nextStep).toContain('no GitLab project');
    expect(w.gitlab.calls).toEqual([]);
  });

  it('stops at the deadline with the last state, and every request carries a timeout', async () => {
    const w = world({
      settings: { maxWaitSeconds: 20, pollIntervalSeconds: 5 },
    });
    w.gitlab.reply(paths.commitRequests(COMMIT), json([listed()]));
    w.gitlab.reply(
      paths.request(7),
      json(request({ head_pipeline: pipeline(100, COMMIT, 'running') })),
    );

    const output = await run(w, WAIT, input());

    expect(output).toMatchObject({ done: false, state: 'checking' });
    expect(w.clock.elapsed()).toBeLessThanOrEqual(20000);
    expect(w.gitlab.calls.every(call => call.hasSignal)).toBe(true);
  });

  it.each([
    [401, 'The portal cannot read'],
    [403, 'The portal cannot read'],
    [500, 'GitLab did not answer'],
  ])(
    'turns a GitLab %i into its fixed sentence, with no GitLab body',
    async (code, sentence) => {
      const gitlab = new FakeGitlab();
      gitlab.reply('', status(code));
      const w = world({ gitlab });
      w.gitlab.reply(paths.commitRequests(COMMIT), json([listed()]));

      const error = await run(w, WAIT, input()).then(
        () => undefined,
        (failure: unknown) => failure,
      );

      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect((error as Error).message).toContain(sentence);
      expect((error as Error).message).not.toContain('must never reach');
    },
  );

  it('turns a 404 on the project into the missing-project sentence', async () => {
    const gitlab = new FakeGitlab();
    gitlab.reply('', status(404));
    const w = world({ gitlab });

    await expect(run(w, WAIT, input())).rejects.toThrow(NotFoundError);
  });

  it('turns a network error into the fixed sentence', async () => {
    const gitlab = new FakeGitlab();
    gitlab.reply(
      '',
      json({ default_branch: 'main', web_url: PROJECT_WEB_URL }),
    );
    const w = world({ gitlab });
    const replies: Reply = new TypeError('fetch failed');
    w.gitlab.reply(paths.commitRequests(COMMIT), replies);

    await expect(run(w, WAIT, input())).rejects.toThrow(
      'GitLab did not answer',
    );
  });
});

describe('wait-for-app-publication: a canary in every field GitLab or the job can write', () => {
  it('never returns a value from the fields that are not declared as output', async () => {
    const w = world();
    w.gitlab.reply(
      paths.commitRequests(COMMIT),
      json([{ ...listed(), message: CANARY }]),
    );
    w.gitlab.reply(
      paths.request(7),
      json(
        request({
          description: CANARY,
          head_pipeline: pipeline(100, COMMIT, 'failed'),
        }),
      ),
    );
    w.gitlab.reply(
      paths.jobs(100),
      json([
        job(401, 'lint-check', 'lint', 'failed', {
          failure_reason: 'script_failure',
          extra: CANARY,
        }),
      ]),
    );
    w.gitlab.reply(
      paths.requestDiffs(7),
      json([{ new_path: 'catalog-info.yaml' }]),
    );
    w.gitlab.reply(
      paths.artifact(401, CONTRACT_FILE),
      text(
        JSON.stringify({
          schema: 1,
          job: 'contract',
          result: 'failed',
          code: 'owned_file_changed',
          paths: [`not-in-diff-${CANARY}.yaml`],
          commits: [],
          extra: CANARY,
        }),
      ),
    );

    const output = await run(w, WAIT, input());

    expect(JSON.stringify(output)).not.toContain(CANARY);
  });
});
