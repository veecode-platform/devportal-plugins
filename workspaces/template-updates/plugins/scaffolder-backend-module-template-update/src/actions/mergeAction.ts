import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { mergeTemplateDirectories } from './mergeTemplateDirectories';

export function createMergeAction() {
  return createTemplateAction({
    id: 'veecode:template:merge',
    description: 'Merges old and new template renders into the project tree',
    schema: {
      input: {
        oldTemplatePath: z => z.string(),
        newTemplatePath: z => z.string(),
        projectPath: z => z.string(),
      },
      output: {
        resultPath: z => z.string(),
        report: z =>
          z.object({
            added: z.array(z.string()),
            deleted: z.array(z.string()),
            mergedClean: z.array(z.string()),
            mergedWithConflict: z.array(z.string()),
            projectDeleted: z.array(z.string()),
            projectOnly: z.array(z.string()),
            changed: z.boolean(),
          }),
      },
    },
    async handler(ctx) {
      const result = await mergeTemplateDirectories(
        ctx.input,
        ctx.workspacePath,
      );
      ctx.output('resultPath', result.resultPath);
      ctx.output('report', result.report);
    },
  });
}
