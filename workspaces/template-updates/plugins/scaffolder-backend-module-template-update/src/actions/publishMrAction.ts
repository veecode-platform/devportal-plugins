import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import type { GitlabClient } from '../gitlab/GitlabClient';
import type { MergeReport } from '../merge/mergeTrees';
import { publishTemplateUpdate } from './publishTemplateUpdate';
import { readWorkspaceTree } from '../workspaceFiles';

export function createPublishMrAction(dependencies: { gitlab: GitlabClient }) {
  return createTemplateAction({
    id: 'veecode:template:publish-mr',
    description:
      'Creates the template update commit and opens or reuses its GitLab merge request',
    schema: {
      input: {
        projectUrl: z => z.string(),
        projectSha: z => z.string(),
        resultPath: z => z.string(),
        report: z =>
          z.object({
            added: z.array(z.string()),
            deleted: z.array(z.string()),
            mergedClean: z.array(z.string()),
            mergedWithConflict: z.array(z.string()),
            binaryConflicts: z.array(z.string()),
            projectDeleted: z.array(z.string()),
            projectOnly: z.array(z.string()),
            changed: z.boolean(),
          }),
        templateName: z => z.string(),
        targetVersion: z => z.string(),
        catalogOwner: z => z.string(),
      },
      output: {
        mergeRequestUrl: z => z.string().optional(),
        status: z => z.string(),
      },
    },
    async handler(ctx) {
      const resultFiles = await readWorkspaceTree(
        ctx.workspacePath,
        ctx.input.resultPath,
      );
      const result = await publishTemplateUpdate(
        {
          projectUrl: ctx.input.projectUrl,
          projectSha: ctx.input.projectSha,
          resultFiles,
          report: ctx.input.report as MergeReport,
          templateName: ctx.input.templateName,
          targetVersion: ctx.input.targetVersion,
          catalogOwner: ctx.input.catalogOwner,
        },
        dependencies,
      );
      ctx.output('status', result.status);
      if (result.status !== 'none')
        ctx.output('mergeRequestUrl', result.mergeRequestUrl);
    },
  });
}
