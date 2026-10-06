import { InputError } from '@backstage/errors';
import { readTemplateRecord } from './readTemplateRecord';
import type { CatalogEntity } from './readTemplateRecord';

const component = {
  kind: 'Component',
  metadata: {
    name: 'payments',
    annotations: {
      'backstage.io/source-location':
        'url:https://gitlab.example.com/group/payments/-/tree/main',
      'backstage.io/source-template': 'template:default/service',
    },
  },
  spec: { owner: 'group:default/platform' },
};

const template = {
  kind: 'Template',
  metadata: {
    name: 'service',
    annotations: {
      'backstage.io/source-location':
        'url:https://gitlab.example.com/group/catalog/-/tree/main',
      'backstage.io/managed-by-location':
        'url:https://gitlab.example.com/group/catalog/-/blob/main/templates/service/template.yaml',
      'veecode.io/template-version': '2.0.0',
    },
  },
  spec: {
    parameters: [
      {
        type: 'object',
        required: ['serviceName', 'owner'],
        properties: {
          serviceName: { type: 'string', minLength: 1 },
          owner: { type: 'string', minLength: 1 },
          contactEmail: { type: 'string', format: 'email' },
        },
      },
    ],
  },
};

const makeDependencies = (record: string) => {
  const entities: Record<string, CatalogEntity> = {
    'component:default/payments': component,
    'template:default/service': template,
  };
  return {
    catalog: {
      getEntityByRef: jest.fn(async (entityRef: string) => entities[entityRef]),
    },
    urlReader: {
      readUrl: jest.fn(async () => ({
        buffer: async () => Buffer.from(record),
      })),
    },
    gitlab: {
      getProject: jest.fn(async (repoUrl: string) => ({
        id: repoUrl.endsWith('/payments') ? 11 : 22,
        projectSlug: repoUrl.endsWith('/payments')
          ? 'group/payments'
          : 'group/catalog',
        host: 'gitlab.example.com',
        repoUrl,
        defaultBranch: 'main',
      })),
      resolveCommitSha: jest.fn(async (_repoUrl: string, ref: string) => {
        if (ref === 'main') return 'project-head-sha';
        if (ref.endsWith('v1.0.0')) return 'old-commit-sha';
        return 'new-commit-sha';
      }),
      readRepositoryFile: jest.fn(async () => Buffer.from('spec: {}\n')),
    },
  };
};

const validRecord =
  'template: template:default/service\nversion: 1.0.0\nvalues:\n  serviceName: payments\n  owner: group:default/platform\n';

describe('readTemplateRecord', () => {
  it('reads K1, resolves both versions, and adds the target version to render values', async () => {
    const dependencies = makeDependencies(validRecord);
    const result = await readTemplateRecord(
      { entityRef: 'component:default/payments' },
      dependencies,
    );

    expect(result.templateRepoUrl).toBe(
      'https://gitlab.example.com/group/catalog',
    );
    expect(result.templatePath).toBe('templates/service/skeleton');
    expect(result.templateName).toBe('service');
    expect(result.oldSha).toBe('old-commit-sha');
    expect(result.newSha).toBe('new-commit-sha');
    expect(result.projectSha).toBe('project-head-sha');
    expect(result.oldValues).toEqual({
      serviceName: 'payments',
      owner: 'group:default/platform',
      templateVersion: '1.0.0',
    });
    expect(result.newValues).toEqual({
      serviceName: 'payments',
      owner: 'group:default/platform',
      templateVersion: '2.0.0',
    });
    expect(result.projectUrl).toBe(
      'https://gitlab.example.com/group/payments/-/tree/project-head-sha',
    );
    expect(result.catalogOwner).toBe('group:default/platform');
    expect(result.upToDate).toBe(false);
    expect(dependencies.urlReader.readUrl).toHaveBeenCalledWith(
      'https://gitlab.example.com/group/payments/-/raw/project-head-sha/.template/record.yaml',
    );
  });

  it('reports a missing K1 record as an input requirement', async () => {
    const dependencies = makeDependencies(validRecord);
    dependencies.urlReader.readUrl.mockRejectedValue(new Error('not found'));

    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments' },
        dependencies,
      ),
    ).rejects.toThrow(/needs input.*\.template\/record\.yaml/i);
  });

  it('reports an empty K1 record as an input requirement', async () => {
    const dependencies = makeDependencies('');

    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments' },
        dependencies,
      ),
    ).rejects.toThrow(/needs input.*\.template\/record\.yaml/i);
  });

  it('names fields that need confirmation for a reconstructed record', async () => {
    const dependencies = makeDependencies(
      `${validRecord}reconstructed: true\n`,
    );

    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments' },
        dependencies,
      ),
    ).rejects.toThrow(/needs input.*(serviceName.*owner|owner.*serviceName)/i);
  });

  it('names target-schema failures as fields needing input', async () => {
    const dependencies = makeDependencies(
      'template: template:default/service\nversion: 1.0.0\nvalues:\n  serviceName: ""\n  owner: group:default/platform\n',
    );

    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments' },
        dependencies,
      ),
    ).rejects.toThrow(/needs input.*serviceName/i);
  });

  it('validates target schema formats and names the invalid field', async () => {
    const dependencies = makeDependencies(
      'template: template:default/service\nversion: 1.0.0\nvalues:\n  serviceName: payments\n  owner: group:default/platform\n  contactEmail: not-an-email\n',
    );

    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments' },
        dependencies,
      ),
    ).rejects.toThrow(/needs input.*contactEmail/i);
  });

  it('marks a second run at the recorded target version as up to date', async () => {
    const dependencies = makeDependencies(
      'template: template:default/service\nversion: v2.0.0\nvalues:\n  serviceName: payments\n  owner: group:default/platform\n',
    );
    const result = await readTemplateRecord(
      { entityRef: 'component:default/payments' },
      dependencies,
    );

    expect(result.upToDate).toBe(true);
    expect(result.newValues.templateVersion).toBe('2.0.0');
    expect(dependencies.gitlab.resolveCommitSha).toHaveBeenCalledWith(
      'https://gitlab.example.com/group/catalog',
      'service/v2.0.0',
    );
  });

  it('normalizes one leading v in a requested version before resolving its tag', async () => {
    const dependencies = makeDependencies(validRecord);
    const result = await readTemplateRecord(
      { entityRef: 'component:default/payments', targetVersion: 'v2.0.0' },
      dependencies,
    );

    expect(result.targetVersion).toBe('2.0.0');
    expect(dependencies.gitlab.resolveCommitSha).toHaveBeenCalledWith(
      'https://gitlab.example.com/group/catalog',
      'service/v2.0.0',
    );
    expect(dependencies.gitlab.resolveCommitSha).not.toHaveBeenCalledWith(
      'https://gitlab.example.com/group/catalog',
      'service/vv2.0.0',
    );
  });

  it('refuses a downgrade and names the recorded and requested versions', async () => {
    const dependencies = makeDependencies(
      'template: template:default/service\nversion: 2.0.0\nvalues:\n  serviceName: payments\n  owner: group:default/platform\n',
    );

    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments', targetVersion: '1.5.0' },
        dependencies,
      ),
    ).rejects.toThrow(InputError);
    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments', targetVersion: '1.5.0' },
        dependencies,
      ),
    ).rejects.toThrow(/recorded version 2\.0\.0.*requested version 1\.5\.0/i);
  });

  it('validates values against the target revision schema when the target differs from catalog', async () => {
    const dependencies = makeDependencies(validRecord);
    dependencies.gitlab.readRepositoryFile.mockResolvedValue(
      Buffer.from(
        'apiVersion: scaffolder.backstage.io/v1beta3\nkind: Template\nspec:\n  parameters:\n    - type: object\n      required: [serviceName, owner, targetOnly]\n      properties:\n        serviceName: { type: string }\n        owner: { type: string }\n        targetOnly: { type: string }\n',
      ),
    );

    await expect(
      readTemplateRecord(
        { entityRef: 'component:default/payments', targetVersion: '3.0.0' },
        dependencies,
      ),
    ).rejects.toThrow(/needs input.*targetOnly/i);
    expect(dependencies.gitlab.readRepositoryFile).toHaveBeenCalledWith(
      'https://gitlab.example.com/group/catalog',
      'templates/service/template.yaml',
      'new-commit-sha',
    );
  });
});
