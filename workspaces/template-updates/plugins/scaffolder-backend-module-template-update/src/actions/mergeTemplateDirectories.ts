import { assertTemplateVersion, mergeTrees } from '../merge/mergeTrees';
import type { MergeReport } from '../merge/mergeTrees';
import { readWorkspaceTree, writeWorkspaceTree } from '../workspaceFiles';

export interface MergeTemplateDirectoriesInput {
  oldTemplatePath: string;
  newTemplatePath: string;
  projectPath: string;
}

export interface MergeTemplateDirectoriesResult {
  resultPath: string;
  report: MergeReport;
}

export async function mergeTemplateDirectories(
  input: MergeTemplateDirectoriesInput,
  workspacePath: string,
): Promise<MergeTemplateDirectoriesResult> {
  const [base, incoming, project] = await Promise.all([
    readWorkspaceTree(workspacePath, input.oldTemplatePath),
    readWorkspaceTree(workspacePath, input.newTemplatePath),
    readWorkspaceTree(workspacePath, input.projectPath),
  ]);
  const result = mergeTrees(base, incoming, project);
  assertTemplateVersion(incoming, result.files);

  const resultPath = '.template-update/result';
  await writeWorkspaceTree(workspacePath, resultPath, result.files);
  return { resultPath, report: result.report };
}
