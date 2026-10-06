import { diff3Merge } from 'node-diff3';
import { parse } from 'yaml';

export type FileTree = Record<string, Buffer>;

export interface MergeReport {
  added: string[];
  deleted: string[];
  mergedClean: string[];
  mergedWithConflict: string[];
  binaryConflicts: string[];
  projectDeleted: string[];
  projectOnly: string[];
  changed: boolean;
}

export function mergeTrees(
  base: FileTree,
  incoming: FileTree,
  project: FileTree,
): { files: FileTree; report: MergeReport } {
  const files: FileTree = {};
  const report: MergeReport = {
    added: [],
    deleted: [],
    mergedClean: [],
    mergedWithConflict: [],
    binaryConflicts: [],
    projectDeleted: [],
    projectOnly: [],
    changed: false,
  };

  const paths = [
    ...new Set([
      ...Object.keys(base),
      ...Object.keys(incoming),
      ...Object.keys(project),
    ]),
  ].sort();
  for (const filePath of paths) {
    const baseFile = base[filePath];
    const incomingFile = incoming[filePath];
    const projectFile = project[filePath];

    if (baseFile && incomingFile && projectFile) {
      if (isText(baseFile) && isText(incomingFile) && isText(projectFile)) {
        const merged = mergeText(projectFile, baseFile, incomingFile);
        files[filePath] = Buffer.from(merged.content);
        report[merged.conflicted ? 'mergedWithConflict' : 'mergedClean'].push(
          filePath,
        );
      } else if (
        projectFile.equals(baseFile) ||
        incomingFile.equals(baseFile) ||
        projectFile.equals(incomingFile)
      ) {
        files[filePath] = projectFile.equals(baseFile)
          ? incomingFile
          : projectFile;
        report.mergedClean.push(filePath);
      } else {
        files[filePath] = projectFile;
        report.binaryConflicts.push(filePath);
      }
      continue;
    }

    if (baseFile && !projectFile) {
      report.projectDeleted.push(filePath);
      continue;
    }

    if (baseFile && !incomingFile && projectFile) {
      if (projectFile.equals(baseFile)) {
        report.deleted.push(filePath);
      } else {
        files[filePath] = projectFile;
        if (isText(baseFile) && isText(projectFile)) {
          report.mergedWithConflict.push(filePath);
        } else {
          report.binaryConflicts.push(filePath);
        }
      }
      continue;
    }

    if (!baseFile && incomingFile && !projectFile) {
      files[filePath] = incomingFile;
      report.added.push(filePath);
      continue;
    }

    if (!baseFile && incomingFile && projectFile) {
      files[filePath] = projectFile;
      if (projectFile.equals(incomingFile)) {
        report.added.push(filePath);
      } else if (isText(projectFile) && isText(incomingFile)) {
        files[filePath] = Buffer.from(
          formatConflict(
            splitLines(projectFile.toString('utf8')),
            [],
            splitLines(incomingFile.toString('utf8')),
          ),
        );
        report.mergedWithConflict.push(filePath);
      } else {
        report.binaryConflicts.push(filePath);
      }
      continue;
    }

    if (projectFile) {
      files[filePath] = projectFile;
      report.projectOnly.push(filePath);
    }
  }

  report.changed = !sameTree(files, project);
  return {
    files,
    report,
  };
}

export function assertTemplateVersion(
  rendered: FileTree,
  result: FileTree,
  targetVersion: string,
): void {
  const renderedRecord = parseYamlFile(rendered, '.template/record.yaml') as
    | { version?: unknown }
    | undefined;
  const renderedVersion = renderedRecord?.version;
  if (typeof renderedVersion !== 'string' || renderedVersion.length === 0) {
    throw new Error('The rendered .template/record.yaml has no target version');
  }
  if (renderedVersion !== targetVersion) {
    throw new Error(
      `The rendered .template/record.yaml version ${renderedVersion} does not match requested target version ${targetVersion}`,
    );
  }

  const renderedAnnotation = readTemplateVersionAnnotation(rendered);
  if (renderedAnnotation !== targetVersion) {
    throw new Error(
      `The rendered catalog annotation version ${
        renderedAnnotation ?? '(missing)'
      } does not match requested target version ${targetVersion}`,
    );
  }

  const resultRecord = parseYamlFile(result, '.template/record.yaml') as
    | { version?: unknown }
    | undefined;
  if (resultRecord?.version !== targetVersion) {
    throw new Error(
      `The merged .template/record.yaml must have target version ${targetVersion}`,
    );
  }

  const resultAnnotation = readTemplateVersionAnnotation(result);
  if (resultAnnotation !== targetVersion) {
    throw new Error(
      `The merged catalog-info.yaml annotation must have target version ${targetVersion}`,
    );
  }
}

function mergeText(
  project: Buffer,
  base: Buffer,
  incoming: Buffer,
): { content: string; conflicted: boolean } {
  const merged = diff3Merge(
    splitLines(project.toString('utf8')),
    splitLines(base.toString('utf8')),
    splitLines(incoming.toString('utf8')),
  );
  let conflicted = false;
  const content = merged
    .map(block => {
      if (block.ok !== undefined) return block.ok.join('');

      const conflict = block.conflict;
      if (!conflict)
        throw new Error('Three-way merge returned an invalid conflict block');
      conflicted = true;
      return formatConflict(conflict.a, conflict.o, conflict.b);
    })
    .join('');
  return { content, conflicted };
}

function formatConflict(project: string[], base: string[], template: string[]) {
  return [
    '<<<<<<< project\n',
    withTrailingNewline(project),
    '||||||| base\n',
    withTrailingNewline(base),
    '=======\n',
    withTrailingNewline(template),
    '>>>>>>> template\n',
  ].join('');
}

function splitLines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function withTrailingNewline(lines: string[]): string {
  const value = lines.join('');
  return value.length > 0 && !value.endsWith('\n') ? `${value}\n` : value;
}

function isText(value: Buffer): boolean {
  if (value.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(value);
    return true;
  } catch {
    return false;
  }
}

function sameTree(left: FileTree, right: FileTree): boolean {
  const leftPaths = Object.keys(left).sort();
  const rightPaths = Object.keys(right).sort();
  return (
    leftPaths.length === rightPaths.length &&
    leftPaths.every(
      (filePath, index) =>
        filePath === rightPaths[index] &&
        left[filePath].equals(right[filePath]),
    )
  );
}

function parseYamlFile(tree: FileTree, filePath: string): unknown {
  const content = tree[filePath];
  if (!content)
    throw new Error(`Cannot verify target version: ${filePath} is missing`);
  try {
    return parse(content.toString('utf8'));
  } catch (error) {
    throw new Error(
      `Cannot verify target version in ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function readTemplateVersionAnnotation(tree: FileTree): string | undefined {
  const entity = parseYamlFile(tree, 'catalog-info.yaml') as
    | {
        metadata?: { annotations?: Record<string, unknown> };
      }
    | undefined;
  const version =
    entity?.metadata?.annotations?.['backstage.io/template-version'];
  return typeof version === 'string' ? version : undefined;
}
