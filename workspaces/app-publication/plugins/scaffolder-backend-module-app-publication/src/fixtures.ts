import type { Entity } from '@backstage/catalog-model';
import type { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import type {
  AuthService,
  BackstageCredentials,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import { z } from 'zod/v3';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import {
  readAppPublicationConfig,
  type AppPublicationSettings,
} from './config';
import type { Clock, PublicationDependencies } from './dependencies';
import { registerAppPublicationActions } from './actions/appPublication';

export const GITLAB_HOST = 'gitlab.example.com';
export const API_BASE = `https://${GITLAB_HOST}/api/v4`;
export const PROJECT_BASE = `${API_BASE}/projects/example-org%2Fexample-app`;
export const PROJECT_WEB_URL = `https://${GITLAB_HOST}/example-org/example-app`;
export const DEFAULT_BRANCH = 'main';
export const EXAMPLE_PREFIX = 'example-org';
export const APP_REF = 'system:default/example-app';
export const USER_REF = 'user:default/example.user';
export const TEAM_REF = 'group:default/example-team';
export const CANARY = 'CANARY-VALUE-123';

/** Full commit SHAs, distinct per role in each test. */
export const COMMIT = '1'.repeat(40);
export const NEWER = '2'.repeat(40);
export const MERGE_COMMIT = '3'.repeat(40);
export const FAST_FORWARD = '4'.repeat(40);
export const OTHER = '5'.repeat(40);

export const DEPLOY_JOB = 'deploy';
export const SMOKE_FILE = 'smoke-result.json';
export const CONTRACT_FILE = 'contract-result.json';

/** The first line the platform chart prints for a refused config (a generic example). */
export const REFUSAL_LINE =
  "The platform chart refused back/config/dev.yaml: [ERROR] templates/: values don't meet the specifications of the schema(s) in the following chart(s): example-chart: - at '/settings/TIMEOUT_MS': got number, want string";
export const FAILED_LINE = 'Job failed: exit code 1';

/** The end of a real job's trace as the API returns it: runner timestamps and stream markers, ANSI sequences, section markers. */
export const RUNNER_TRACE = [
  '2026-11-09T21:32:59.820067Z 01O $ sh .gitlab/deploy.sh render',
  `2026-11-09T21:33:00.742470Z 01O ${REFUSAL_LINE}  `,
  '2026-11-09T21:33:00.742481Z 01O refused back dev',
  '2026-11-09T21:33:00.879491Z 00O section_end:1794259980:step_script\r\x1b[0K',
  '2026-11-09T21:33:00.881174Z 00O+section_start:1794259980:cleanup_file_variables\r\x1b[0K',
  '2026-11-09T21:33:00.881185Z 00O+\x1b[0KCleaning up project directory and file based variables',
  '2026-11-09T21:33:01.457179Z 00O section_end:1794259981:cleanup_file_variables\r\x1b[0K',
  '2026-11-09T21:33:01.603918Z 00O ERROR: Job failed: exit code 1',
].join('\n');

/** What the tools return for RUNNER_TRACE: no prefix, no escape sequence, no section marker, no empty line. */
export const RUNNER_TRACE_CLEANED = [
  '$ sh .gitlab/deploy.sh render',
  REFUSAL_LINE,
  'refused back dev',
  'Cleaning up project directory and file based variables',
  'ERROR: Job failed: exit code 1',
];

/** A commit author's address, as a scan prints it. Generic. */
export const AUTHOR_EMAIL = 'example.person@example.com';
const FINDING_COMMIT = 'a'.repeat(40);

/**
 * The end of a secret scan's trace as the API returns it: the runner's
 * timestamps and stream markers, ANSI sequences and section markers around the
 * verbose finding block, which names the commit's author and e-mail address.
 */
export const SCAN_TRACE = [
  '2026-11-10T14:02:10.100000Z 00O section_start:1794319330:step_script\r\x1b[0K\x1b[36;1mExecuting "step_script" stage of the job script\x1b[0;m',
  '2026-11-10T14:02:10.200000Z 01O $ gitleaks detect --verbose --redact --no-banner',
  '2026-11-10T14:02:11.300000Z 01O Finding:     api_key = "REDACTED"',
  '2026-11-10T14:02:11.300010Z 01O Secret:      REDACTED',
  '2026-11-10T14:02:11.300020Z 01O RuleID:      generic-api-key',
  '2026-11-10T14:02:11.300030Z 01O Entropy:     3.6',
  '2026-11-10T14:02:11.300040Z 01O File:        back/src/config.ts',
  '2026-11-10T14:02:11.300050Z 01O Line:        3',
  `2026-11-10T14:02:11.300060Z 01O Commit:      ${FINDING_COMMIT}`,
  '2026-11-10T14:02:11.300070Z 01O Author:      Example Person',
  `2026-11-10T14:02:11.300080Z 01O \x1b[1mEmail:\x1b[0m       ${AUTHOR_EMAIL}  `,
  '2026-11-10T14:02:11.300090Z 01O Date:        2026-11-10T13:59:00Z',
  `2026-11-10T14:02:11.300100Z 01O Fingerprint: ${FINDING_COMMIT}:back/src/config.ts:generic-api-key:3`,
  '2026-11-10T14:02:11.400000Z 01O \x1b[90m2:02PM\x1b[0m \x1b[33mWRN\x1b[0m leaks found: 1',
  '2026-11-10T14:02:11.500000Z 00O section_end:1794319331:step_script\r\x1b[0K',
  '2026-11-10T14:02:11.600000Z 01O ERROR: Job failed: exit code 1',
].join('\n');

/** What the tools return for SCAN_TRACE: cleaned lines, and the e-mail address replaced. */
export const SCAN_TRACE_CLEANED = [
  'Executing "step_script" stage of the job script',
  '$ gitleaks detect --verbose --redact --no-banner',
  'Finding:     api_key = "REDACTED"',
  'Secret:      REDACTED',
  'RuleID:      generic-api-key',
  'Entropy:     3.6',
  'File:        back/src/config.ts',
  'Line:        3',
  `Commit:      ${FINDING_COMMIT}`,
  'Author:      Example Person',
  'Email:       [email]',
  'Date:        2026-11-10T13:59:00Z',
  `Fingerprint: ${FINDING_COMMIT}:back/src/config.ts:generic-api-key:3`,
  '2:02PM WRN leaks found: 1',
  'ERROR: Job failed: exit code 1',
];

/** The end of the conflict-marker check's trace: `grep -n` names each file and line. */
export const CONFLICT_TRACE = [
  "2026-11-10T14:05:00.100000Z 01O $ grep -rnIE '^(<<<<<<<|>>>>>>>)' .",
  '2026-11-10T14:05:00.200000Z 01O ./back/src/app.ts:12:<<<<<<< HEAD',
  '2026-11-10T14:05:00.200010Z 01O ./back/src/app.ts:18:>>>>>>> origin/main',
  '2026-11-10T14:05:00.300000Z 01O ERROR: Job failed: exit code 1',
].join('\n');

export const CONFLICT_TRACE_CLEANED = [
  "$ grep -rnIE '^(<<<<<<<|>>>>>>>)' .",
  './back/src/app.ts:12:<<<<<<< HEAD',
  './back/src/app.ts:18:>>>>>>> origin/main',
  'ERROR: Job failed: exit code 1',
];

/** The end of a failed unit-test job's trace, as a test runner prints it. */
export const TEST_TRACE = [
  '2026-11-10T14:10:00.100000Z 01O $ yarn test',
  '2026-11-10T14:10:03.000000Z 01O \x1b[31mFAIL\x1b[39m src/app.test.ts',
  '2026-11-10T14:10:03.000010Z 01O   ● example › returns the greeting',
  '2026-11-10T14:10:03.000020Z 01O     expect(received).toBe(expected)',
  '2026-11-10T14:10:03.000030Z 01O ERROR: Job failed: exit code 1',
].join('\n');

export const TEST_TRACE_CLEANED = [
  '$ yarn test',
  'FAIL src/app.test.ts',
  '  ● example › returns the greeting',
  '    expect(received).toBe(expected)',
  'ERROR: Job failed: exit code 1',
];

/** Relative paths under the project, exactly as the module requests them. */
export const paths = {
  commitRequests: (sha: string) => `/repository/commits/${sha}/merge_requests`,
  request: (iid: number) => `/merge_requests/${iid}`,
  requestDiffs: (iid: number) => `/merge_requests/${iid}/diffs?per_page=100`,
  pipelineBySha: (sha: string) =>
    `/pipelines?ref=${DEFAULT_BRANCH}&sha=${sha}&order_by=id&sort=desc&per_page=1`,
  newestMain: `/pipelines?ref=${DEFAULT_BRANCH}&order_by=id&sort=desc&per_page=1`,
  jobs: (pipelineId: number) => `/pipelines/${pipelineId}/jobs?per_page=100`,
  trace: (jobId: number) => `/jobs/${jobId}/trace`,
  artifact: (jobId: number, file: string) => `/jobs/${jobId}/artifacts/${file}`,
  /** The newest default-branch pipelines, as the status sheet reads them for deploys. */
  mainPipelines: `/pipelines?ref=${DEFAULT_BRANCH}&order_by=id&sort=desc&per_page=10`,
  openRequests:
    '/merge_requests?state=opened&order_by=created_at&sort=desc&per_page=5',
  project: '',
};

export const exampleSettings = (
  overrides: Record<string, unknown> = {},
): AppPublicationSettings =>
  readAppPublicationConfig(
    new ConfigReader({
      appPublication: { projectPathPrefix: EXAMPLE_PREFIX, ...overrides },
    } as never),
  );

export function exampleSystem(overrides: Partial<Entity> = {}): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: {
      name: 'example-app',
      namespace: 'default',
      annotations: {
        'gitlab.com/project-slug': 'example-org/example-app',
        'backstage.io/managed-by-location': `url:${PROJECT_WEB_URL}/-/blob/main/catalog-info.yaml`,
      },
    },
    spec: { owner: TEAM_REF },
    ...overrides,
  } as Entity;
}

export function exampleComponent(name = 'example-app-back'): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name, namespace: 'default' },
    spec: { type: 'service', lifecycle: 'production', owner: TEAM_REF },
  } as Entity;
}

/** A reply builds a fresh response on each request, so no body is shared between calls. */
export type Reply = (() => Response) | Error;

export function json(value: unknown, httpStatus = 200): () => Response {
  return () =>
    new Response(JSON.stringify(value), {
      status: httpStatus,
      headers: { 'content-type': 'application/json' },
    });
}

export function text(body: string, httpStatus = 200): () => Response {
  return () => new Response(body, { status: httpStatus });
}

export function status(code: number): () => Response {
  return () =>
    new Response(
      '{"message":"example body that must never reach the output"}',
      {
        status: code,
        headers: { 'content-type': 'application/json' },
      },
    );
}

/**
 * A GitLab that answers by relative path. Replies for one path are used in
 * order, and the last one repeats. A path with no reply is a 404.
 */
export class FakeGitlab {
  readonly calls: { path: string; hasSignal: boolean }[] = [];
  private readonly replies = new Map<string, Reply[]>();
  private latency?: {
    clock: Clock & { elapsed(): number };
    milliseconds: number;
    cutOffWhen?: (now: number) => boolean;
  };

  reply(path: string, ...replies: Reply[]): void {
    this.replies.set(path, replies);
  }

  /**
   * Every request takes `milliseconds` of the fake clock. A request that ends
   * while `cutOffWhen` holds is cut off, as a fetch aborted by its deadline is.
   */
  slowdown(options: {
    clock: Clock & { elapsed(): number };
    milliseconds: number;
    cutOffWhen?: (now: number) => boolean;
  }): void {
    this.latency = options;
  }

  readonly fetch = async (
    input: string,
    init?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<Response> => {
    if (!input.startsWith(PROJECT_BASE)) {
      throw new Error(`unexpected URL ${input}`);
    }
    const path = input.slice(PROJECT_BASE.length);
    this.calls.push({ path, hasSignal: init?.signal !== undefined });
    if (this.latency) {
      await this.latency.clock.sleep(this.latency.milliseconds);
      if (this.latency.cutOffWhen?.(this.latency.clock.now())) {
        throw new TypeError('fetch failed: the request was aborted');
      }
    }
    const queue = this.replies.get(path);
    if (!queue || queue.length === 0) {
      return status(404)();
    }
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (reply instanceof Error) {
      throw reply;
    }
    return reply();
  };

  /** Every request made, relative to the project, for assertions. */
  get paths(): string[] {
    return this.calls.map(call => call.path);
  }
}

export function fakeClock(start = 0): Clock & { elapsed(): number } {
  let time = start;
  return {
    now: () => time,
    sleep: async (milliseconds: number) => {
      time += milliseconds;
    },
    elapsed: () => time - start,
  };
}

export interface WorldOptions {
  system?: Entity | undefined;
  components?: Entity[];
  ownershipRefs?: string[];
  settings?: Record<string, unknown>;
  gitlab?: FakeGitlab;
  clock?: Clock;
}

export interface World {
  deps: PublicationDependencies;
  gitlab: FakeGitlab;
  clock: Clock & { elapsed(): number };
  actions: Map<string, RegisteredAction>;
}

export interface RegisteredAction {
  name: string;
  schema: {
    input: (zod: typeof z) => unknown;
    output: (zod: typeof z) => unknown;
  };
  attributes?: { readOnly?: boolean; idempotent?: boolean };
  action(context: {
    input: unknown;
    credentials: BackstageCredentials;
    logger: unknown;
  }): Promise<{ output: unknown }>;
}

export function world(options: WorldOptions = {}): World {
  const gitlab = options.gitlab ?? new FakeGitlab();
  const clock = (options.clock ?? fakeClock()) as Clock & { elapsed(): number };
  const system = 'system' in options ? options.system : exampleSystem();
  const components = options.components ?? [exampleComponent()];
  const ownershipRefs = options.ownershipRefs ?? [TEAM_REF];

  const catalog = {
    getEntityByRef: async (ref: string) =>
      ref === APP_REF ? system : undefined,
    getEntities: async () => ({ items: components }),
  };
  const userInfo = {
    getUserInfo: async (credentials: BackstageCredentials) => {
      const userEntityRef =
        (credentials.principal as { userEntityRef?: string }).userEntityRef ??
        USER_REF;
      return {
        userEntityRef,
        ownershipEntityRefs: userEntityRef === USER_REF ? ownershipRefs : [],
      };
    },
  };
  const auth = {
    isPrincipal: (credentials: BackstageCredentials, type: string) =>
      (credentials.principal as { type: string }).type === type,
  };

  const deps: PublicationDependencies = {
    auth: auth as unknown as AuthService,
    catalog: catalog as unknown as CatalogService,
    userInfo: userInfo as unknown as UserInfoService,
    settings: exampleSettings(options.settings),
    gitlabIntegrations: {
      byHost: (host: string) =>
        host === GITLAB_HOST
          ? { config: { apiBaseUrl: API_BASE, token: 'example-token' } }
          : undefined,
    },
    fetch: gitlab.fetch,
    clock,
    appBaseUrl: 'https://portal.example.com',
  };

  const actions = new Map<string, RegisteredAction>();
  registerAppPublicationActions(
    {
      register: (action: RegisteredAction) => actions.set(action.name, action),
    } as unknown as ActionsRegistryService,
    deps,
  );

  if (options.gitlab === undefined) {
    gitlab.reply(
      paths.project,
      json({ default_branch: DEFAULT_BRANCH, web_url: PROJECT_WEB_URL }),
    );
  }
  return { deps, gitlab, clock, actions };
}

function userCredentials(userEntityRef: string): BackstageCredentials {
  return {
    principal: { type: 'user', userEntityRef },
  } as unknown as BackstageCredentials;
}

export const owner = () => userCredentials(USER_REF);
export const stranger = () => userCredentials('user:default/someone.else');
export const service = () =>
  ({
    principal: { type: 'service', subject: 'external:example' },
  } as unknown as BackstageCredentials);

/** Runs a registered action with the module's own input checks, and checks its output against the declared schema. */
export async function run(
  fixture: World,
  name: string,
  input: Record<string, unknown>,
  credentials: BackstageCredentials = owner(),
): Promise<Record<string, unknown>> {
  const action = fixture.actions.get(name);
  if (!action) {
    throw new Error(`action ${name} was not registered`);
  }
  const { output } = await action.action({
    input,
    credentials,
    logger: undefined,
  });
  return output as Record<string, unknown>;
}

export function expectDeclared(
  fixture: World,
  name: string,
  output: unknown,
): void {
  const declared = fixture.actions.get(name)!.schema.output(z) as {
    parse(value: unknown): unknown;
  };
  expect(declared.parse(output)).toEqual(output);
}
