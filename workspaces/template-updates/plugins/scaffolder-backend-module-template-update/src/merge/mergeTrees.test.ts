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

  it('does not list a cleanly merged file whose project bytes did not change', () => {
    const { files, report } = mergeTrees(
      { 'README.md': file('base\n'), 'app.ts': file('one\n') },
      { 'README.md': file('base\n'), 'app.ts': file('one\n') },
      { 'README.md': file('project\n'), 'app.ts': file('one\n') },
    );

    expect(files['README.md'].toString()).toBe('project\n');
    expect(report.mergedClean).toEqual([]);
    expect(report.changed).toBe(false);
  });

  it('adds a template file absent from the project', () => {
    const result = mergeTrees({}, { 'new.txt': file('template\n') }, {});

    expect(result.files['new.txt'].toString()).toBe('template\n');
    expect(result.report.added).toEqual(['new.txt']);
  });

  it('merges the rendered file names produced by templateFileExtension', () => {
    const result = mergeTrees(
      { 'catalog-info.yaml': file('version: 1.0.0\n') },
      { 'catalog-info.yaml': file('version: 2.0.0\n') },
      { 'catalog-info.yaml': file('version: 1.0.0\n') },
    );

    expect(Object.keys(result.files)).toEqual(['catalog-info.yaml']);
    expect(result.files['catalog-info.yaml'].toString()).toBe(
      'version: 2.0.0\n',
    );
    expect(result.files['catalog-info.yaml.njk']).toBeUndefined();
    expect(result.report.mergedClean).toContain('catalog-info.yaml');
  });

  it('marks different text content in an add/add conflict against an empty base', () => {
    const result = mergeTrees(
      {},
      { 'new.txt': file('template\n') },
      { 'new.txt': file('project\n') },
    );

    expect(result.files['new.txt'].toString()).toContain('<<<<<<< project');
    expect(result.files['new.txt'].toString()).toContain(
      '||||||| base\n=======\n',
    );
    expect(result.files['new.txt'].toString()).toContain('project\n');
    expect(result.files['new.txt'].toString()).toContain('template\n');
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
    expect(result.report.binaryConflicts).toContain('image.bin');
    expect(result.report.mergedWithConflict).not.toContain('image.bin');
  });

  it('keeps the project bytes for a binary add/add conflict', () => {
    const projectFile = file([0, 1, 2]);
    const result = mergeTrees(
      {},
      { 'image.bin': file([0, 2, 0]) },
      { 'image.bin': projectFile },
    );

    expect(result.files['image.bin']).toEqual(projectFile);
    expect(result.report.binaryConflicts).toEqual(['image.bin']);
  });

  it('reports a project binary edit separately when the template deletes it', () => {
    const projectFile = file([0, 1, 2]);
    const result = mergeTrees(
      { 'image.bin': file([0, 1, 0]) },
      {},
      { 'image.bin': projectFile },
    );

    expect(result.files['image.bin']).toEqual(projectFile);
    expect(result.report.binaryConflicts).toEqual(['image.bin']);
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

    expect(() =>
      assertTemplateVersion(rendered, result, '2.0.0'),
    ).not.toThrow();
    expect(() => assertTemplateVersion(rendered, result, '3.0.0')).toThrow(
      /rendered.*version 2\.0\.0.*requested target version 3\.0\.0/i,
    );
    expect(() =>
      assertTemplateVersion(
        {
          ...rendered,
          'catalog-info.yaml': file(
            'apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: service\n  annotations:\n    backstage.io/template-version: 1.0.0\n',
          ),
        },
        result,
        '2.0.0',
      ),
    ).toThrow(/rendered catalog annotation.*requested target version 2\.0\.0/i);
    expect(() =>
      assertTemplateVersion(
        rendered,
        {
          ...result,
          '.template/record.yaml': file(
            'template: template:default/service\nversion: 1.0.0\nvalues: {}\n',
          ),
        },
        '2.0.0',
      ),
    ).toThrow(/record.*2\.0\.0/i);
    expect(() =>
      assertTemplateVersion(
        rendered,
        {
          ...result,
          'catalog-info.yaml': file(
            'apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: service\n  annotations:\n    backstage.io/template-version: 1.0.0\n',
          ),
        },
        '2.0.0',
      ),
    ).toThrow(/catalog-info\.yaml annotation.*2\.0\.0/i);
  });

  it('reads the annotation from a multi-document catalog-info.yaml', () => {
    const tree = {
      '.template/record.yaml': file(
        'template: template:default/service\nversion: 2.0.0\nvalues: {}\n',
      ),
      'catalog-info.yaml': file(
        'apiVersion: backstage.io/v1alpha1\nkind: System\nmetadata:\n  name: suite\n---\napiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: service\n  annotations:\n    backstage.io/template-version: "2.0.0"\n',
      ),
    };

    expect(() => assertTemplateVersion(tree, tree, '2.0.0')).not.toThrow();
  });

  it('leaves a conflicted catalog-info.yaml to the owner when the template side carries the target', () => {
    const rendered = {
      '.template/record.yaml': file(
        'template: template:default/service\nversion: 2.0.0\nvalues: {}\n',
      ),
      'catalog-info.yaml': file(
        'kind: Component\nmetadata:\n  annotations:\n    backstage.io/template-version: "2.0.0"\n',
      ),
    };
    const conflicted = (templateSide: string) => ({
      ...rendered,
      'catalog-info.yaml': file(
        `kind: Component\nmetadata:\n  annotations:\n<<<<<<< project\n    backstage.io/template-version: "1.0.0"\n    example.com/slug: copy\n||||||| base\n    backstage.io/template-version: "1.0.0"\n    example.com/slug: origin\n=======\n${templateSide}    example.com/slug: origin\n>>>>>>> template\n`,
      ),
    });

    expect(() =>
      assertTemplateVersion(
        rendered,
        conflicted('    backstage.io/template-version: "2.0.0"\n'),
        '2.0.0',
      ),
    ).not.toThrow();
    expect(() =>
      assertTemplateVersion(
        rendered,
        conflicted('    backstage.io/template-version: "1.5.0"\n'),
        '2.0.0',
      ),
    ).toThrow(/conflicted catalog-info\.yaml.*2\.0\.0/i);
  });
});
