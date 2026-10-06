import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeTemplateDirectories } from './mergeTemplateDirectories';

describe('mergeTemplateDirectories', () => {
  it('writes the merged full tree to .template-update/result and advances K1', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'template-update-'));
    const oldTree = join(workspacePath, '.template-update/old');
    const newTree = join(workspacePath, '.template-update/new');
    const projectTree = join(workspacePath, '.template-update/project');
    try {
      await writeFileTree(oldTree, {
        '.template/record.yaml':
          'template: template:default/service\nversion: 1.0.0\nvalues: {}\n',
        'catalog-info.yaml': catalogInfo('1.0.0'),
        'README.md': 'base\n',
      });
      await writeFileTree(newTree, {
        '.template/record.yaml':
          'template: template:default/service\nversion: 2.0.0\nvalues: {}\n',
        'catalog-info.yaml': catalogInfo('2.0.0'),
        'README.md': 'template\n',
        'template-added.txt': 'from template\n',
      });
      await writeFileTree(projectTree, {
        '.template/record.yaml':
          'template: template:default/service\nversion: 1.0.0\nvalues: {}\n',
        'catalog-info.yaml': catalogInfo('1.0.0'),
        'README.md': 'project\n',
        'project-only.txt': 'owned by project\n',
      });

      const result = await mergeTemplateDirectories(
        {
          oldTemplatePath: '.template-update/old',
          newTemplatePath: '.template-update/new',
          projectPath: '.template-update/project',
        },
        workspacePath,
      );

      expect(result.resultPath).toBe('.template-update/result');
      expect(result.report.added).toEqual(['template-added.txt']);
      expect(result.report.mergedWithConflict).toEqual(['README.md']);
      expect(result.report.projectOnly).toEqual(['project-only.txt']);
      expect(
        await readFile(
          join(workspacePath, result.resultPath, '.template/record.yaml'),
          'utf8',
        ),
      ).toContain('version: 2.0.0');
      expect(
        await readFile(
          join(workspacePath, result.resultPath, 'catalog-info.yaml'),
          'utf8',
        ),
      ).toContain('backstage.io/template-version: 2.0.0');
      expect(
        await readFile(
          join(workspacePath, result.resultPath, 'README.md'),
          'utf8',
        ),
      ).toContain('<<<<<<< project');
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function catalogInfo(version: string): string {
  return `apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: service\n  annotations:\n    backstage.io/template-version: ${version}\n`;
}

async function writeFileTree(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const [filePath, content] of Object.entries(files)) {
    const target = join(root, filePath);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content);
  }
}
