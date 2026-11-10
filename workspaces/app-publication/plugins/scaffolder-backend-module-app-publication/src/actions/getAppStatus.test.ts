import { NotAllowedError } from '@backstage/errors';
import {
  APP_REF,
  AUTHOR_EMAIL,
  CANARY,
  COMMIT,
  CONFLICT_TRACE,
  CONFLICT_TRACE_CLEANED,
  DEPLOY_JOB,
  FAILED_LINE,
  MERGE_COMMIT,
  NEWER,
  REFUSAL_LINE,
  RUNNER_TRACE,
  RUNNER_TRACE_CLEANED,
  SCAN_TRACE,
  SCAN_TRACE_CLEANED,
  TEST_TRACE,
  TEST_TRACE_CLEANED,
  UNREADABLE_LOG_CASES,
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
/**
 * The newest default-branch pipeline, and the deploy jobs of the default branch.
 * Each deploy job sits in its own pipeline, read through the pipeline list.
 */
function baseline(
  w: World,
  latest: unknown[],
  deploys: Array<{ id: number; pipeline: { id: number; sha: string } }> = [],
): void {
  w.gitlab.reply(paths.newestMain, json(latest));
  const deployPipelines = deploys.map(deploy => ({
    id: deploy.pipeline.id,
    sha: deploy.pipeline.sha,
    ref: 'main',
    status: 'success',
    web_url: `${PROJECT_WEB_URL}/-/pipelines/${deploy.pipeline.id}`,
  }));
  w.gitlab.reply(paths.mainPipelines, json([...latest, ...deployPipelines]));
  for (const deploy of deploys) {
    w.gitlab.reply(paths.jobs(deploy.pipeline.id), json([deploy]));
  }
  w.gitlab.reply(paths.openRequests, json([]));
}

/** A sheet whose one open request is blocked by a failed render job, with the job's log as given. */
function renderBlocked(w: World, log: string): void {
  blockedBy(w, 'render', 'lint', log);
}

function blockedBy(w: World, name: string, stage: string, log: string): void {
  blockedByJobs(w, [{ id: 401, name, stage, log }]);
}

function blockedByJobs(
  w: World,
  jobs: { id: number; name: string; stage: string; log: string }[],
): void {
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
    json(
      jobs.map(entry =>
        job(entry.id, entry.name, entry.stage, 'failed', {
          failure_reason: 'script_failure',
        }),
      ),
    ),
  );
  for (const entry of jobs) {
    w.gitlab.reply(paths.trace(entry.id), text(entry.log));
  }
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
      [job(301, DEPLOY_JOB, 'deploy', 'success')],
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

  it('adds the render refusal to the blocked sentence and to the failed job, with the end of its log', async () => {
    const w = world();
    const log = [REFUSAL_LINE, 'refused back dev', FAILED_LINE];
    renderBlocked(w, log.join('\n'));

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.nextStep).toContain(
      'Merge request !7 is blocked: The platform chart refused the config of `back` for `dev` (file `back/config/dev.yaml`).',
    );
    expect(output.nextStep).not.toContain('Run the local checks');
    expect(output.openRequests).toEqual([
      expect.objectContaining({
        iid: 7,
        failedJobs: [
          expect.objectContaining({
            name: 'render',
            untrustedJobOutput: log,
          }),
        ],
      }),
    ]);
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it('reads the refusal in a real runner trace, and returns its lines cleaned', async () => {
    const w = world();
    renderBlocked(w, RUNNER_TRACE);

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.nextStep).toContain(
      'Merge request !7 is blocked: The platform chart refused the config of `back` for `dev` (file `back/config/dev.yaml`).',
    );
    expect(output.openRequests).toEqual([
      expect.objectContaining({
        iid: 7,
        failedJobs: [
          expect.objectContaining({
            name: 'render',
            untrustedJobOutput: RUNNER_TRACE_CLEANED,
          }),
        ],
      }),
    ]);
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it('names a blocked scan whose job name holds a colon, returns its log with the author address replaced, and says what to do with a found secret', async () => {
    const w = world();
    blockedBy(w, 'secrets:gitleaks', 'scan', SCAN_TRACE);

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.nextStep).toContain(
      'Merge request !7 is blocked: The scan `secrets:gitleaks` failed on the change.',
    );
    expect(output.nextStep).toContain(
      'it is exposed and must be changed where it was issued',
    );
    expect(output.nextStep).toContain("the app's root `CLAUDE.md` describes");
    expect(output.nextStep).toContain('one commit that never held the value');
    expect(output.openRequests).toEqual([
      expect.objectContaining({
        iid: 7,
        failedJobs: [
          expect.objectContaining({
            name: 'secrets:gitleaks',
            untrustedJobOutput: SCAN_TRACE_CLEANED,
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(output)).not.toContain(AUTHOR_EMAIL);
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it('returns the end of the log of a blocked test job, and says it shows what failed', async () => {
    const w = world();
    blockedBy(w, 'back-test', 'build', TEST_TRACE);

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.nextStep).toContain(
      'Merge request !7 is blocked: The check `back-test` failed on the change.',
    );
    expect(output.nextStep).toContain('usually shows what failed');
    expect(output.openRequests).toEqual([
      expect.objectContaining({
        failedJobs: [
          expect.objectContaining({
            name: 'back-test',
            untrustedJobOutput: TEST_TRACE_CLEANED,
          }),
        ],
      }),
    ]);
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it('returns the end of the log of a blocked conflict-markers job, which names the files', async () => {
    const w = world();
    blockedBy(w, 'conflict-markers', 'lint', CONFLICT_TRACE);

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.nextStep).toContain('Git conflict markers');
    expect(output.nextStep).toContain('usually names the files and the lines');
    expect(output.nextStep).toContain(
      'confirm that the markers are there before you edit it',
    );
    expect(output.openRequests).toEqual([
      expect.objectContaining({
        failedJobs: [
          expect.objectContaining({
            name: 'conflict-markers',
            untrustedJobOutput: CONFLICT_TRACE_CLEANED,
          }),
        ],
      }),
    ]);
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it.each(UNREADABLE_LOG_CASES)(
    'a blocked %s job in stage %s keeps the sheet when its log %s',
    async (name, stage, _reason, start, reply) => {
      const w = world();
      blockedByJobs(w, [
        { id: 401, name, stage, log: 'unused' },
        { id: 404, name: 'unit-tests', stage: 'test', log: TEST_TRACE },
      ]);
      w.gitlab.reply(paths.trace(401), reply);

      const output = await run(w, GET_APP_STATUS, { app: APP_REF });

      expect(output.nextStep).toContain(
        `Merge request !7 is blocked: ${start}`,
      );
      expect(output.nextStep).toContain(
        `The log of \`${name}\` could not be read this time, so its failedJobs entry holds none. Call this tool again once to read it.`,
      );
      expect(output.nextStep).toContain(
        'The check `unit-tests` failed for a reason this tool has no fixed explanation for.',
      );
      const [request] = output.openRequests as {
        pipelineStatus: string;
        failedJobs: { name: string; untrustedJobOutput?: string[] }[];
      }[];
      expect(request.pipelineStatus).toBe('failed');
      expect(
        request.failedJobs.find(entry => entry.name === name),
      ).not.toHaveProperty('untrustedJobOutput');
      expect(
        request.failedJobs.find(entry => entry.name === 'unit-tests'),
      ).toMatchObject({ untrustedJobOutput: TEST_TRACE_CLEANED });
      expectDeclared(w, GET_APP_STATUS, output);
    },
  );

  it('keeps a name that reads like a link out of the blocked sentence', async () => {
    const w = world();
    blockedBy(w, 'mailto:attacker', 'scan', 'output');

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.nextStep).toContain('The scan `(name not shown)` failed');
    expect(output.nextStep).not.toContain('mailto:attacker');
    expect(output.openRequests).toEqual([
      expect.objectContaining({
        failedJobs: [
          expect.objectContaining({
            name: '(name not shown)',
            untrustedJobName: 'mailto:attacker',
          }),
        ],
      }),
    ]);
  });

  it('says a found secret is already on the default branch when the scan fails there', async () => {
    const w = world();
    baseline(w, [pipeline(200, COMMIT, 'failed')], []);
    w.gitlab.reply(
      paths.jobs(200),
      json([
        job(403, 'secrets:gitleaks', 'scan', 'failed', {
          failure_reason: 'script_failure',
        }),
      ]),
    );
    w.gitlab.reply(paths.trace(403), text(SCAN_TRACE));

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.state).toBe('failed');
    expect(output.nextStep).toContain(
      'The scan `secrets:gitleaks` failed on the default branch.',
    );
    expect(output.nextStep).toContain(
      'already on the default branch and exposed',
    );
    expect(output.nextStep).toContain(
      "removing it from the history is the platform team's work",
    );
    expect(output.nextStep).not.toContain('redo the change');
    expect(output.latestMain).toMatchObject({
      failedJobs: [
        expect.objectContaining({
          name: 'secrets:gitleaks',
          untrustedJobOutput: SCAN_TRACE_CLEANED,
        }),
      ],
    });
    expectDeclared(w, GET_APP_STATUS, output);
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

describe('get-app-status: the deploys come from the default branch itself', () => {
  it('finds the last deploy of the default branch behind several pipelines that did not deploy', async () => {
    const w = world();
    w.gitlab.reply(paths.newestMain, json([pipeline(203, COMMIT, 'success')]));
    w.gitlab.reply(
      paths.mainPipelines,
      json([
        pipeline(203, COMMIT, 'success'),
        pipeline(202, COMMIT, 'success'),
        pipeline(201, COMMIT, 'success'),
        pipeline(1301, MERGE_COMMIT, 'success'),
      ]),
    );
    w.gitlab.reply(
      paths.jobs(203),
      json([
        {
          id: 9,
          name: 'build-app',
          stage: 'build',
          status: 'success',
          web_url: `${PROJECT_WEB_URL}/-/jobs/9`,
          ref: 'main',
        },
      ]),
    );
    w.gitlab.reply(paths.jobs(202), json([]));
    w.gitlab.reply(paths.jobs(201), json([]));
    w.gitlab.reply(
      paths.jobs(1301),
      json([job(301, DEPLOY_JOB, 'deploy', 'success')]),
    );
    w.gitlab.reply(
      paths.artifact(301, SMOKE_FILE),
      text(JSON.stringify(smoke(MERGE_COMMIT))),
    );
    w.gitlab.reply(paths.openRequests, json([]));

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({
      state: 'published',
      environments: [
        expect.objectContaining({
          name: 'dev',
          lastDeploy: expect.objectContaining({ commit: MERGE_COMMIT }),
        }),
      ],
    });
    expect(w.gitlab.paths.some(path => path.startsWith('/jobs?scope'))).toBe(
      false,
    );
  });

  it('shows only http and https addresses from the catalog', async () => {
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
              url: ['javascript', 'alert(1)'].join(':'),
              type: 'app-address',
              title: 'Not a link',
            },
            {
              url: 'https://app.example.com',
              type: 'app-address',
              title: 'Example app',
            },
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

    expect(output.environments).toEqual([
      expect.objectContaining({
        addresses: [{ url: 'https://app.example.com', title: 'Example app' }],
      }),
    ]);
  });
});

describe('get-app-status: the window of recent default-branch pipelines', () => {
  const buildOnly = (id: number) => [
    job(900 + id, 'build-app', 'build', 'success'),
  ];

  it('reads partial, with the older-deploy sentence, when the window is full and holds no deploy', async () => {
    const w = world();
    const window = Array.from({ length: 10 }, (_, index) =>
      pipeline(210 - index, COMMIT, 'success'),
    );
    w.gitlab.reply(paths.newestMain, json([window[0]]));
    w.gitlab.reply(paths.mainPipelines, json(window));
    for (const candidate of window) {
      w.gitlab.reply(paths.jobs(candidate.id), json(buildOnly(candidate.id)));
    }
    w.gitlab.reply(paths.openRequests, json([]));

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({ state: 'not_published', partial: true });
    expect(output.nextStep).toContain(
      'is older than the most recent default-branch pipelines',
    );
    expect(output.nextStep).not.toContain('has not been deployed yet');
    expectDeclared(w, GET_APP_STATUS, output);
  });

  it('does not mark the sheet partial when the window is not full', async () => {
    const w = world();
    const window = [
      pipeline(202, COMMIT, 'success'),
      pipeline(201, COMMIT, 'success'),
    ];
    w.gitlab.reply(paths.newestMain, json([window[0]]));
    w.gitlab.reply(paths.mainPipelines, json(window));
    for (const candidate of window) {
      w.gitlab.reply(paths.jobs(candidate.id), json(buildOnly(candidate.id)));
    }
    w.gitlab.reply(paths.openRequests, json([]));

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output).toMatchObject({ state: 'not_published' });
    expect(output.partial).toBeUndefined();
    expect(output.nextStep).toContain('has not been deployed yet');
  });

  it('leaves out a component whose name is not a piece name', async () => {
    const w = world({
      components: [
        exampleComponent('example-app-back'),
        exampleComponent('Bad Name'),
      ],
    });
    w.gitlab.reply(paths.newestMain, json([pipeline(200, COMMIT, 'success')]));
    w.gitlab.reply(
      paths.mainPipelines,
      json([pipeline(200, COMMIT, 'success')]),
    );
    w.gitlab.reply(paths.jobs(200), json([]));
    w.gitlab.reply(paths.openRequests, json([]));

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.pieces).toEqual([
      expect.objectContaining({
        entityRef: 'component:default/example-app-back',
      }),
    ]);
  });
});
