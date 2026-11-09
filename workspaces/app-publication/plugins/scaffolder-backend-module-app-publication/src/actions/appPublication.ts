import type { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import { ServiceUnavailableError } from '@backstage/errors';
import { z } from 'zod/v3';
import {
  type AppPiece,
  type AppProject,
  appPieces,
  projectOf,
  refuseProject,
} from '../app';
import type { PublicationDependencies } from '../dependencies';
import type { FailureContext } from '../failures';
import { GitlabClient, MSG_NO_ACCESS } from '../gitlab';
import { projectShape } from '../gitlabShapes';
import { statusOutput, waitOutput } from '../outputs';
import { parseSystemRef, requireOwnedSystem } from '../ownership';
import { waitForPublication } from '../publication';
import * as S from '../sentences';
import { readSheet } from '../sheet';
import type { StatusOutput, WaitOutput } from '../types';

export const GET_APP_STATUS = 'get-app-status';
export const WAIT_FOR_APP_PUBLICATION = 'wait-for-app-publication';

const APP_DESCRIPTION =
  "Entity reference of the app: system:<namespace>/<name>. Only the app's owner may read it.";
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
/** The whole status call: past this, the sheet is returned partial. */
const STATUS_BUDGET_MILLISECONDS = 20000;

const appInput = z.object({ app: z.string() }).strict();
const waitInput = z
  .object({
    app: z.string(),
    commit: z.string().regex(COMMIT_PATTERN),
    mergeRequest: z.number().int().min(1).optional(),
  })
  .strict();

export function registerAppPublicationActions(
  actionsRegistry: ActionsRegistryService,
  deps: PublicationDependencies,
): void {
  actionsRegistry.register({
    name: GET_APP_STATUS,
    title: 'Get app status',
    description:
      "Reads an app's publication: its pieces, the last deploy of each environment with its smoke result, the default branch's newest pipeline, and its open merge requests. It returns one state and the sentence to relay. It never waits and never changes anything.",
    schema: {
      input: zod =>
        zod
          .object({
            app: zod.string({ description: APP_DESCRIPTION }),
          })
          .strict(),
      output: zod => statusOutput(zod),
    },
    attributes: { readOnly: true, idempotent: true },
    async action({ input, credentials }) {
      const parsed = appInput.parse(input);
      const output = await readStatus(deps, parsed.app, credentials);
      return { output };
    },
  });

  actionsRegistry.register({
    name: WAIT_FOR_APP_PUBLICATION,
    title: 'Wait for an app publication',
    description:
      "Follows a commit that was just pushed to an app through its merge request, the merge, the default branch's pipeline and the deploy, for a short time. It returns done, one state and the sentence to relay. Call it again with the same input while done is false. Only the app's owner may use it.",
    schema: {
      input: zod =>
        zod
          .object({
            app: zod.string({ description: APP_DESCRIPTION }),
            commit: zod
              .string({
                description: 'The full SHA of the commit that was pushed.',
              })
              .regex(COMMIT_PATTERN),
            mergeRequest: zod
              .number({
                description:
                  'The merge request number, only to choose one when the commit belongs to several open requests.',
              })
              .int()
              .min(1)
              .optional(),
          })
          .strict(),
      output: zod => waitOutput(zod),
    },
    attributes: { readOnly: true, idempotent: true },
    async action({ input, credentials }) {
      const parsed = waitInput.parse(input);
      const output = await waitForStatus(deps, parsed, credentials);
      return { output };
    },
  });
}

interface Opened {
  system: Entity;
  pieces: AppPiece[];
  gitlab: GitlabClient;
  context: FailureContext;
  project: AppProject;
  projectWebUrl: string;
}

/**
 * Runs the ownership check first. A caller who is not the owner never reaches
 * a GitLab request.
 */
async function openApp(
  deps: PublicationDependencies,
  appRef: string,
  credentials: BackstageCredentials,
  remainingMs: () => number,
): Promise<Opened | { system: Entity; noProject: true }> {
  const ref = parseSystemRef(appRef);
  const { system } = await requireOwnedSystem({
    ...deps,
    app: ref,
    credentials,
  });
  const project = projectOf(system, deps.settings.projectPathPrefix);
  if (project === undefined) {
    return { system, noProject: true };
  }
  const integration = deps.gitlabIntegrations.byHost(project.host);
  if (integration === undefined) {
    throw new ServiceUnavailableError(MSG_NO_ACCESS);
  }
  const gitlab = new GitlabClient({
    connection: integration.config,
    projectSlug: project.slug,
    fetch: deps.fetch,
    remainingMs,
  });
  const info = await gitlab.projectInfo(projectShape);
  const projectWebUrl = verifiedProjectAddress(project, info.web_url);
  const defaultBranch = info.default_branch ?? 'main';
  const pieces = await appPieces(deps, system, credentials);
  const context: FailureContext = {
    gitlab,
    settings: deps.settings,
    defaultBranch,
    projectWebUrl,
    pieces: new Set(pieces.map(piece => piece.name)),
  };
  return {
    system,
    pieces,
    gitlab,
    context,
    project,
    projectWebUrl,
  };
}

/**
 * GitLab's own address for the project must be the origin and path the catalog
 * recorded. The links the module shows are checked against this address.
 */
function verifiedProjectAddress(project: AppProject, reported: string): string {
  let url: URL;
  try {
    url = new URL(reported);
  } catch {
    throw refuseProject(
      'GitLab reported an address for this project that does not match its catalog entry.',
    );
  }
  if (url.origin !== project.origin || url.pathname !== `/${project.slug}`) {
    throw refuseProject(
      'GitLab reports this project at another address than its catalog entry.',
    );
  }
  return `${project.origin}/${project.slug}`;
}

async function readStatus(
  deps: PublicationDependencies,
  app: string,
  credentials: BackstageCredentials,
): Promise<StatusOutput> {
  const deadline = deps.clock.now() + STATUS_BUDGET_MILLISECONDS;
  const remainingMs = () => Math.max(1, deadline - deps.clock.now());
  const opened = await openApp(deps, app, credentials, remainingMs);
  if ('noProject' in opened) {
    return {
      app,
      pieces: [],
      environments: [],
      openRequests: [],
      state: 'failed',
      nextStep: S.SENTENCE.noProject,
    };
  }
  return readSheet(opened.context, {
    app,
    system: opened.system,
    expired: () => deps.clock.now() >= deadline,
    pieces: opened.pieces,
    projectWebUrl: opened.projectWebUrl,
    portalUrl: portalUrlOf(deps, opened.system),
    addressLinkType: deps.settings.addressLinkType,
  });
}

async function waitForStatus(
  deps: PublicationDependencies,
  input: { app: string; commit: string; mergeRequest?: number },
  credentials: BackstageCredentials,
): Promise<WaitOutput> {
  const deadline = deps.clock.now() + deps.settings.maxWaitSeconds * 1000;
  const remainingMs = () => Math.max(1, deadline - deps.clock.now());
  const opened = await openApp(deps, input.app, credentials, remainingMs);
  if ('noProject' in opened) {
    return {
      done: true,
      state: 'failed',
      commit: input.commit,
      nextStep: S.SENTENCE.noProject,
    };
  }
  return waitForPublication(
    opened.context,
    { commit: input.commit, mergeRequest: input.mergeRequest },
    {
      clock: deps.clock,
      deadline,
      pollMilliseconds: deps.settings.pollIntervalSeconds * 1000,
    },
  );
}

function portalUrlOf(
  deps: PublicationDependencies,
  system: Entity,
): string | undefined {
  if (deps.appBaseUrl === undefined) {
    return undefined;
  }
  const namespace = system.metadata.namespace ?? 'default';
  return `${deps.appBaseUrl}/catalog/${namespace}/system/${system.metadata.name}`;
}
