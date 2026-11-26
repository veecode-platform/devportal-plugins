import type { AuthService } from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  armAutoMerge,
  canonicalMergeRequestUrl,
  parseMergeRequestUrl,
  type AutoMergeDependencies,
} from '../autoMerge';

export const AUTO_MERGE_ACTION_ID = 'gitlab:merge-request:auto-merge';
const DEFAULT_TARGET_BRANCH = 'main';

export interface MergeRequestAutoMergeDependencies
  extends AutoMergeDependencies {
  auth: AuthService;
}

export function createMergeRequestAutoMergeAction(
  deps: MergeRequestAutoMergeDependencies,
) {
  return createTemplateAction({
    id: AUTO_MERGE_ACTION_ID,
    description:
      "Sets GitLab's auto-merge on a merge request this run opened, so it merges once its checks pass. It arms only a request the portal's GitLab user opened from the branch this run pushed, into the target branch, in a project on the portal's auto-merge list, when the request holds exactly one commit and that commit is its head. It never merges a request itself.",
    schema: {
      input: z =>
        z
          .object({
            mergeRequestUrl: z.string({
              description:
                'The mergeRequestUrl output of publish:gitlab:merge-request in this run.',
            }),
            sourceBranch: z.string({
              description: 'The branch the run opened the merge request from.',
            }),
            targetBranch: z
              .string({
                description:
                  'The branch the merge request targets. Defaults to main.',
              })
              .optional(),
            removeSourceBranch: z
              .boolean({
                description:
                  'Whether GitLab deletes the source branch after the merge. Defaults to true.',
              })
              .optional(),
            expectedHeadSha: z
              .string({
                description:
                  "The full commit SHA the run pushed. When given, auto-merge is refused unless the request's head is this commit.",
              })
              .optional(),
          })
          .strict(),
      output: z =>
        z.object({
          mergeRequestUrl: z.string(),
          headSha: z.string(),
          status: z.enum(['armed', 'merged']),
        }),
    },
    async handler(ctx) {
      const credentials = await ctx.getInitiatorCredentials();
      if (!deps.auth.isPrincipal(credentials, 'user')) {
        throw new NotAllowedError(
          'only a signed-in user can set auto-merge on a merge request',
        );
      }
      // A refused address may carry a secret, so it is never repeated. Only the
      // canonical form of an address that parsed is logged or returned.
      let link: string | undefined;
      try {
        const target = parseMergeRequestUrl(ctx.input.mergeRequestUrl);
        link = canonicalMergeRequestUrl(target);
        // The scaffolder validates the input against the JSON schema but does not
        // write defaults back into it, so the defaults are applied here.
        const result = await armAutoMerge(deps, {
          target,
          sourceBranch: ctx.input.sourceBranch,
          targetBranch: ctx.input.targetBranch ?? DEFAULT_TARGET_BRANCH,
          removeSourceBranch: ctx.input.removeSourceBranch ?? true,
          expectedHeadSha: ctx.input.expectedHeadSha,
        });
        ctx.output('mergeRequestUrl', link);
        ctx.output('headSha', result.headSha);
        ctx.output('status', result.status);
        ctx.logger.info(
          `Auto-merge ${result.status} on ${link} at head ${result.headSha}`,
        );
      } catch (error) {
        ctx.logger.error(
          `Auto-merge not set${link === undefined ? '' : ` on ${link}`}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        throw error;
      }
    },
  });
}
