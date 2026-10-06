import { InputError } from '@backstage/errors';
import { GitlabClient } from '../gitlab/GitlabClient';
import type { GitlabCommitAction } from '../gitlab/GitlabClient';
import type { MergeReport } from '../merge/mergeTrees';

export interface PublishTemplateUpdateInput {
  projectUrl: string;
  projectSha: string;
  resultFiles: Record<string, Buffer>;
  report: MergeReport;
  templateName: string;
  targetVersion: string;
  catalogOwner: string;
}

export type PublishTemplateUpdateResult =
  | { status: 'none' }
  | { status: 'created' | 'updated'; mergeRequestUrl: string };

export interface PublishTemplateUpdateDependencies {
  gitlab: Pick<
    GitlabClient,
    | 'getProject'
    | 'readRepositoryFiles'
    | 'createCommit'
    | 'findOpenMergeRequest'
    | 'updateMergeRequest'
    | 'createMergeRequest'
  >;
}

export async function publishTemplateUpdate(
  input: PublishTemplateUpdateInput,
  dependencies: PublishTemplateUpdateDependencies,
): Promise<PublishTemplateUpdateResult> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(input.templateName)) {
    throw new InputError(
      `Invalid template name for an update branch: ${input.templateName}`,
    );
  }
  if (!input.targetVersion.trim())
    throw new InputError('Target template version is required');

  const project = await dependencies.gitlab.getProject(input.projectUrl);
  const currentFiles = await dependencies.gitlab.readRepositoryFiles(
    project,
    input.projectSha,
  );
  const actions = createCommitActions(currentFiles, input.resultFiles);
  if (actions.length === 0) return { status: 'none' };

  const branch = `chore/template-update-${input.templateName}`;
  const title = `chore(template): update to ${input.targetVersion}`;
  const description = createMergeRequestDescription(
    input.report,
    input.catalogOwner,
    input.targetVersion,
  );

  await dependencies.gitlab.createCommit(
    project,
    branch,
    input.projectSha,
    title,
    actions,
  );

  const existing = await dependencies.gitlab.findOpenMergeRequest(
    project,
    branch,
  );
  if (existing) {
    await dependencies.gitlab.updateMergeRequest(project, existing.iid, {
      title,
      description,
    });
    return { status: 'updated', mergeRequestUrl: existing.webUrl };
  }

  const created = await dependencies.gitlab.createMergeRequest(
    project,
    branch,
    {
      title,
      description,
    },
  );
  return { status: 'created', mergeRequestUrl: created.webUrl };
}

export function createCommitActions(
  currentFiles: Record<string, Buffer>,
  resultFiles: Record<string, Buffer>,
): GitlabCommitAction[] {
  const actions: GitlabCommitAction[] = [];
  const paths = [
    ...new Set([...Object.keys(currentFiles), ...Object.keys(resultFiles)]),
  ].sort();

  for (const filePath of paths) {
    const current = currentFiles[filePath];
    const result = resultFiles[filePath];
    if (current && !result) {
      actions.push({ action: 'delete', file_path: filePath });
    } else if (!current && result) {
      actions.push(createFileAction('create', filePath, result));
    } else if (current && result && !current.equals(result)) {
      actions.push(createFileAction('update', filePath, result));
    }
  }
  return actions;
}

function createFileAction(
  action: 'create' | 'update',
  filePath: string,
  content: Buffer,
): GitlabCommitAction {
  const text = readUtf8(content);
  return text === undefined
    ? {
        action,
        file_path: filePath,
        content: content.toString('base64'),
        encoding: 'base64',
      }
    : { action, file_path: filePath, content: text };
}

function readUtf8(value: Buffer): string | undefined {
  if (value.includes(0)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    return undefined;
  }
}

function createMergeRequestDescription(
  report: MergeReport,
  catalogOwner: string,
  targetVersion: string,
): string {
  return [
    `Template update to ${targetVersion}.`,
    'Each re-run regenerates this branch from the fetched project snapshot and discards edits made directly on the update branch.',
    '',
    `Catalog owner: ${catalogOwner}.`,
    'GitLab assignee mapping from catalog groups is out of scope for U1; this merge request is not assigned automatically.',
    '',
    section('Added', report.added),
    section('Deleted', report.deleted),
    section('Merged cleanly', report.mergedClean),
    section('Merged with conflicts', report.mergedWithConflict),
    section(
      'Binary conflicts (template version not applied)',
      report.binaryConflicts,
    ),
    section('Project-deleted (kept absent)', report.projectDeleted),
    section('Project-only (untouched)', report.projectOnly),
    section('Resolved by AI', []),
    'AI conflict resolution is out of scope for U1. Conflicts remain in the files as markers.',
  ].join('\n');
}

function section(title: string, paths: string[]): string {
  return [
    `## ${title}`,
    '',
    ...(paths.length > 0 ? paths.map(filePath => `- ${filePath}`) : ['- None']),
    '',
  ].join('\n');
}
