import type { AuthService } from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { armAutoMerge, type AutoMergeDependencies } from '../autoMerge';

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
      "Sets GitLab's auto-merge on a merge request this run opened, so it merges once its checks pass. It arms only a request the portal's GitLab user opened from the branch this run pushed, into the target branch, at its current head commit. It never merges a request itself.",
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
      const { mergeRequestUrl, sourceBranch } = ctx.input;
      try {
        // The scaffolder validates the input against the JSON schema but does not
        // write defaults back into it, so the defaults are applied here.
        const result = await armAutoMerge(deps, {
          mergeRequestUrl,
          sourceBranch,
          targetBranch: ctx.input.targetBranch ?? DEFAULT_TARGET_BRANCH,
          removeSourceBranch: ctx.input.removeSourceBranch ?? true,
        });
        ctx.output('mergeRequestUrl', mergeRequestUrl);
        ctx.output('headSha', result.headSha);
        ctx.output('status', result.status);
        ctx.logger.info(
          `Auto-merge ${result.status} on ${mergeRequestUrl} at head ${result.headSha}`,
        );
      } catch (error) {
        ctx.logger.error(
          `Auto-merge not set on ${mergeRequestUrl}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        throw error;
      }
    },
  });
}
