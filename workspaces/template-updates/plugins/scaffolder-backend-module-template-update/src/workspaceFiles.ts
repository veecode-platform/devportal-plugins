import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { InputError } from '@backstage/errors';
import type { FileTree } from './merge/mergeTrees';

export async function readWorkspaceTree(
  workspacePath: string,
  relativePath: string,
): Promise<FileTree> {
  const root = await resolveWorkspacePath(workspacePath, relativePath);
  const files: FileTree = {};

  async function visit(directory: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        throw new InputError(
          `Template update directory does not exist: ${relativePath}`,
        );
      }
      throw error;
    }

    for (const entry of entries) {
      const filePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new InputError(
          `Template update does not support symbolic link: ${filePath}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(absolutePath, filePath);
      } else if (entry.isFile()) {
        files[filePath] = await readFile(absolutePath);
      } else {
        throw new InputError(
          `Template update cannot read special file: ${filePath}`,
        );
      }
    }
  }

  await visit(root, '');
  return files;
}

export async function writeWorkspaceTree(
  workspacePath: string,
  relativePath: string,
  files: FileTree,
): Promise<void> {
  const root = await resolveWorkspacePath(workspacePath, relativePath);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  for (const filePath of Object.keys(files).sort()) {
    const segments = filePath.split('/');
    if (
      filePath.length === 0 ||
      filePath.startsWith('/') ||
      filePath.includes('\\') ||
      segments.some(
        segment => segment === '' || segment === '.' || segment === '..',
      )
    ) {
      throw new InputError(
        `Template update produced an unsafe path: ${filePath}`,
      );
    }
    const target = join(root, ...segments);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, files[filePath]);
  }
}

async function resolveWorkspacePath(
  workspacePath: string,
  relativePath: string,
): Promise<string> {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new InputError('A workspace-relative directory is required');
  }
  const root = await realpath(resolve(workspacePath));
  const target = resolve(root, relativePath);
  const pathFromRoot = relative(root, target);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    pathFromRoot.startsWith(sep)
  ) {
    throw new InputError(
      `Template update path must stay inside the workspace: ${relativePath}`,
    );
  }

  let candidate: string | undefined = target;
  while (candidate !== undefined) {
    const current: string = candidate;
    try {
      await lstat(current);
      let resolvedCandidate: string;
      try {
        resolvedCandidate = await realpath(current);
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
          throw new InputError(
            `Template update path contains an unresolved symbolic link: ${relativePath}`,
          );
        }
        throw error;
      }
      const resolvedFromRoot = relative(root, resolvedCandidate);
      if (
        resolvedFromRoot === '..' ||
        resolvedFromRoot.startsWith(`..${sep}`) ||
        resolvedFromRoot.startsWith(sep)
      ) {
        throw new InputError(
          `Template update path resolves outside the workspace: ${relativePath}`,
        );
      }
      return current === target ? resolvedCandidate : target;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      candidate = parent;
    }
  }
  throw new InputError(
    `Template update path could not be resolved inside the workspace: ${relativePath}`,
  );
}
