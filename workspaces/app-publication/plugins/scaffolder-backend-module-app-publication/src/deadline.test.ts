import {
  APP_REF,
  COMMIT,
  FakeGitlab,
  PROJECT_WEB_URL,
  expectDeclared,
  fakeClock,
  json,
  paths,
  run,
  world,
} from './fixtures';
import {
  GET_APP_STATUS,
  WAIT_FOR_APP_PUBLICATION,
} from './actions/appPublication';

const pipeline = (id: number, sha: string, status: string) => ({
  id,
  sha,
  ref: 'main',
  status,
  web_url: `${PROJECT_WEB_URL}/-/pipelines/${id}`,
});
const runningRequest = {
  iid: 7,
  title: 'Example change',
  state: 'opened',
  sha: COMMIT,
  target_branch: 'main',
  web_url: `${PROJECT_WEB_URL}/-/merge_requests/7`,
  merge_when_pipeline_succeeds: true,
  detailed_merge_status: 'mergeable',
  head_pipeline: pipeline(100, COMMIT, 'running'),
};

describe('deadline: a request cut short by the deadline', () => {
  it('returns the last complete observation as not done, instead of failing the call', async () => {
    const clock = fakeClock();
    const gitlab = new FakeGitlab();
    // Each request takes 4 s. The second observation's first request ends at
    // 21 s, past the 20 s deadline, and is cut off the way an aborted fetch is.
    gitlab.slowdown({
      clock,
      milliseconds: 4000,
      cutOffWhen: now => now >= 20000,
    });
    gitlab.reply(
      paths.project,
      json({ default_branch: 'main', web_url: PROJECT_WEB_URL }),
    );
    gitlab.reply(
      paths.commitRequests(COMMIT),
      json([{ iid: 7, state: 'opened', target_branch: 'main', sha: COMMIT }]),
    );
    gitlab.reply(paths.request(7), json(runningRequest));
    const w = world({ gitlab, clock });

    const output = await run(w, WAIT_FOR_APP_PUBLICATION, {
      app: APP_REF,
      commit: COMMIT,
    });

    expect(output).toMatchObject({
      done: false,
      state: 'checking',
      commit: COMMIT,
    });
    expectDeclared(w, WAIT_FOR_APP_PUBLICATION, output);
  });
});

describe('get-app-status: an overall budget', () => {
  it('returns a partial sheet, and says so, when the budget ends before every read', async () => {
    const clock = fakeClock();
    const gitlab = new FakeGitlab();
    // Each request takes 6 s, so the 20 s budget ends during the deploy reads.
    gitlab.slowdown({ clock, milliseconds: 6000 });
    gitlab.reply(
      paths.project,
      json({ default_branch: 'main', web_url: PROJECT_WEB_URL }),
    );
    gitlab.reply(paths.newestMain, json([pipeline(200, COMMIT, 'success')]));
    gitlab.reply(
      paths.mainPipelines,
      json([
        pipeline(200, COMMIT, 'success'),
        pipeline(199, COMMIT, 'success'),
      ]),
    );
    gitlab.reply(paths.jobs(200), json([]));
    gitlab.reply(paths.jobs(199), json([]));
    gitlab.reply(
      paths.openRequests,
      json([
        {
          iid: 7,
          state: 'opened',
          target_branch: 'main',
          sha: COMMIT,
          web_url: `${PROJECT_WEB_URL}/-/merge_requests/7`,
        },
      ]),
    );
    const w = world({ gitlab, clock });

    const output = await run(w, GET_APP_STATUS, { app: APP_REF });

    expect(output.partial).toBe(true);
    expect(output.nextStep).toContain('The sheet is partial');
    expect(output.openRequests).toEqual([]);
    expectDeclared(w, GET_APP_STATUS, output);
  });
});
