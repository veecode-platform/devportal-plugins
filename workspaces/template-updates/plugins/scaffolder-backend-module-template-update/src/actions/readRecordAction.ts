import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { readTemplateRecord } from '../record/readTemplateRecord';
import type { ReadTemplateRecordDependencies } from '../record/readTemplateRecord';

export function createReadRecordAction(
  dependencies: ReadTemplateRecordDependencies,
) {
  return createTemplateAction({
    id: 'veecode:template:read-record',
    description:
      'Reads a project template record and resolves the target template revision',
    schema: {
      input: {
        entityRef: z => z.string(),
        targetVersion: z => z.string().optional(),
      },
      output: {
        templateRepoUrl: z => z.string(),
        templatePath: z => z.string(),
        templateName: z => z.string(),
        oldSha: z => z.string(),
        newSha: z => z.string(),
        projectSha: z => z.string(),
        oldValues: z => z.record(z.unknown()),
        newValues: z => z.record(z.unknown()),
        projectUrl: z => z.string(),
        catalogOwner: z => z.string(),
        targetVersion: z => z.string(),
        upToDate: z => z.boolean(),
      },
    },
    async handler(ctx) {
      const credentials = await ctx.getInitiatorCredentials();
      const result = await readTemplateRecord(
        ctx.input,
        dependencies,
        credentials,
      );
      ctx.output('templateRepoUrl', result.templateRepoUrl);
      ctx.output('templatePath', result.templatePath);
      ctx.output('templateName', result.templateName);
      ctx.output('oldSha', result.oldSha);
      ctx.output('newSha', result.newSha);
      ctx.output('projectSha', result.projectSha);
      ctx.output('oldValues', result.oldValues);
      ctx.output('newValues', result.newValues);
      ctx.output('projectUrl', result.projectUrl);
      ctx.output('catalogOwner', result.catalogOwner);
      ctx.output('targetVersion', result.targetVersion);
      ctx.output('upToDate', result.upToDate);
    },
  });
}
