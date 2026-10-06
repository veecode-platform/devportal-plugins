import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkspaceTree } from './workspaceFiles';

describe('readWorkspaceTree containment', () => {
  it('rejects an action root that resolves outside the workspace', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'template-update-'));
    const outsidePath = await mkdtemp(
      join(tmpdir(), 'template-update-outside-'),
    );
    try {
      await writeFile(join(outsidePath, 'outside.txt'), 'outside\n');
      await symlink(outsidePath, join(workspacePath, 'project-link'), 'dir');

      await expect(
        readWorkspaceTree(workspacePath, 'project-link'),
      ).rejects.toThrow(/resolves outside the workspace/i);
    } finally {
      await Promise.all([
        rm(workspacePath, { recursive: true, force: true }),
        rm(outsidePath, { recursive: true, force: true }),
      ]);
    }
  });

  it('continues to reject symbolic links inside an accepted tree', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'template-update-'));
    const outsidePath = await mkdtemp(
      join(tmpdir(), 'template-update-outside-'),
    );
    try {
      await writeFile(join(outsidePath, 'outside.txt'), 'outside\n');
      await mkdir(join(workspacePath, 'project'));
      await symlink(
        join(outsidePath, 'outside.txt'),
        join(workspacePath, 'project', 'linked.txt'),
      );

      await expect(readWorkspaceTree(workspacePath, 'project')).rejects.toThrow(
        /does not support symbolic link/i,
      );
    } finally {
      await Promise.all([
        rm(workspacePath, { recursive: true, force: true }),
        rm(outsidePath, { recursive: true, force: true }),
      ]);
    }
  });
});
