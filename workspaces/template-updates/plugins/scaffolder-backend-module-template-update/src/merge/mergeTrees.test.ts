import { assertTemplateVersion, mergeTrees } from './mergeTrees';

const file = (value: string | number[]) =>
  typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);

describe('mergeTrees', () => {
  it('merges independent project and template line changes cleanly', () => {
    const result = mergeTrees(
      { 'config.yaml': file('first: base\nuntouched: common\nsecond: base\n') },
      {
        'config.yaml': file(
          'first: base\nuntouched: common\nsecond: template\n',
        ),
      },
      {
        'config.yaml': file(
          'first: project\nuntouched: common\nsecond: base\n',
        ),
      },
    );

    expect(result.files['config.yaml'].toString()).toBe(
      'first: project\nuntouched: common\nsecond: template\n',
    );
    expect(result.report.mergedClean).toContain('config.yaml');
    expect(result.report.changed).toBe(true);
  });

  it('keeps both edits in conflict markers when the same lines changed', () => {
    const result = mergeTrees(
      { 'README.md': file('Title\nbase text\nEnd\n') },
      { 'README.md': file('Title\ntemplate text\nEnd\n') },
      { 'README.md': file('Title\nproject text\nEnd\n') },
    );

    expect(result.files['README.md'].toString()).toContain('<<<<<<< project');
    expect(result.files['README.md'].toString()).toContain('project text');
    expect(result.files['README.md'].toString()).toContain('template text');
    expect(result.report.mergedWithConflict).toContain('README.md');
  });

  it('adds a template file absent from the project', () => {
    const result = mergeTrees({}, { 'new.txt': file('template\n') }, {});

    expect(result.files['new.txt'].toString()).toBe('template\n');
    expect(result.report.added).toEqual(['new.txt']);
  });

  it('keeps a different project file when a template-added path collides', () => {
    const result = mergeTrees(
      {},
      { 'new.txt': file('template\n') },
      { 'new.txt': file('project\n') },
    );

    expect(result.files['new.txt'].toString()).toBe('project\n');
    expect(result.report.mergedWithConflict).toContain('new.txt');
  });

  it('deletes a template-removed file when the project left it unchanged', () => {
    const result = mergeTrees(
      { 'old.txt': file('base\n') },
      {},
      { 'old.txt': file('base\n') },
    );

    expect(result.files['old.txt']).toBeUndefined();
    expect(result.report.deleted).toEqual(['old.txt']);
  });

  it('keeps and flags a project edit to a template-removed file', () => {
    const result = mergeTrees(
      { 'old.txt': file('base\n') },
      {},
      { 'old.txt': file('project edit\n') },
    );

    expect(result.files['old.txt'].toString()).toBe('project edit\n');
    expect(result.report.mergedWithConflict).toContain('old.txt');
  });

  it('keeps a project-deleted file absent', () => {
    const result = mergeTrees(
      { 'deleted.txt': file('base\n') },
      { 'deleted.txt': file('template\n') },
      {},
    );

    expect(result.files['deleted.txt']).toBeUndefined();
    expect(result.report.projectDeleted).toEqual(['deleted.txt']);
  });

  it('leaves a project-only file byte-identical', () => {
    const projectFile = file('owned by project\n');
    const result = mergeTrees({}, {}, { 'notes.md': projectFile });

    expect(result.files['notes.md']).toEqual(projectFile);
    expect(result.report.projectOnly).toEqual(['notes.md']);
    expect(result.report.changed).toBe(false);
  });

  it('keeps a project binary file and flags simultaneous edits', () => {
    const projectFile = file([0, 1, 2]);
    const result = mergeTrees(
      { 'image.bin': file([0, 1, 0]) },
      { 'image.bin': file([0, 2, 0]) },
      { 'image.bin': projectFile },
    );

    expect(result.files['image.bin']).toEqual(projectFile);
    expect(result.report.mergedWithConflict).toContain('image.bin');
  });
});

describe('assertTemplateVersion', () => {
  it('requires the merged K1 record and catalog annotation to reach the rendered target', () => {
    const rendered = {
      '.template/record.yaml': file(
        'template: template:default/service\nversion: 2.0.0\nvalues: {}\n',
      ),
      'catalog-info.yaml': file(
        'apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: service\n  annotations:\n    backstage.io/template-version: 2.0.0\n',
      ),
    };
    const result = { ...rendered };

    expect(() => assertTemplateVersion(rendered, result)).not.toThrow();
    expect(() =>
      assertTemplateVersion(rendered, {
        ...result,
        '.template/record.yaml': file(
          'template: template:default/service\nversion: 1.0.0\nvalues: {}\n',
        ),
      }),
    ).toThrow(/record.*2\.0\.0/i);
    expect(() =>
      assertTemplateVersion(rendered, {
        ...result,
        'catalog-info.yaml': file(
          'apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: service\n  annotations:\n    backstage.io/template-version: 1.0.0\n',
        ),
      }),
    ).toThrow(/catalog-info\.yaml annotation.*2\.0\.0/i);
  });
});
