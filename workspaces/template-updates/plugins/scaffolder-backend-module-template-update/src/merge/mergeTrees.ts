import { diff3Merge } from 'node-diff3';
import { parse, parseAllDocuments } from 'yaml';

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
        // A clean merge that leaves the project's bytes as they were is not news to the reviewer.
        if (merged.conflicted) report.mergedWithConflict.push(filePath);
        else if (!files[filePath].equals(projectFile))
          report.mergedClean.push(filePath);
      } else if (
        projectFile.equals(baseFile) ||
        incomingFile.equals(baseFile) ||
        projectFile.equals(incomingFile)
      ) {
        files[filePath] = projectFile.equals(baseFile)
          ? incomingFile
          : projectFile;
        if (!files[filePath].equals(projectFile))
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

const CONFLICT_START = /^<{7} project$/m;

function annotationLine(version: string): RegExp {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^\\s*backstage\\.io/template-version:\\s*["']?${escaped}["']?\\s*$`,
    'm',
  );
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

  const renderedAnnotations = readTemplateVersionAnnotations(rendered);
  if (
    renderedAnnotations.length === 0 ||
    renderedAnnotations.some(version => version !== targetVersion)
  ) {
    throw new Error(
      `The rendered catalog annotation version ${
        renderedAnnotations.join(', ') || '(missing)'
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

  const resultCatalog = result['catalog-info.yaml']?.toString('utf8');
  if (resultCatalog !== undefined && CONFLICT_START.test(resultCatalog)) {
    // A conflicted catalog-info.yaml is not valid YAML; the owner resolves it in the merge
    // request, which lists it under the conflicts. The template side must still carry the target.
    if (!annotationLine(targetVersion).test(resultCatalog)) {
      throw new Error(
        `The conflicted catalog-info.yaml does not offer the target version ${targetVersion} in its annotation`,
      );
    }
    return;
  }
  const resultAnnotations = readTemplateVersionAnnotations(result);
  if (
    resultAnnotations.length === 0 ||
    resultAnnotations.some(version => version !== targetVersion)
  ) {
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

// catalog-info.yaml may hold several entities (a System and its Components, for example);
// collect the annotation from every document that carries it.
function readTemplateVersionAnnotations(tree: FileTree): string[] {
  const content = tree['catalog-info.yaml'];
  if (!content)
    throw new Error(
      'Cannot verify target version: catalog-info.yaml is missing',
    );
  const versions: string[] = [];
  for (const document of parseAllDocuments(content.toString('utf8'))) {
    if (document.errors.length > 0) {
      throw new Error(
        `Cannot verify target version in catalog-info.yaml: ${document.errors[0].message}`,
      );
    }
    const entity = document.toJS() as
      | { metadata?: { annotations?: Record<string, unknown> } }
      | null
      | undefined;
    const version =
      entity?.metadata?.annotations?.['backstage.io/template-version'];
    if (typeof version === 'string') versions.push(version);
  }
  return versions;
}
