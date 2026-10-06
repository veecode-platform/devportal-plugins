import { createReadRecordAction } from './readRecordAction';
import type { CatalogEntity } from '../record/readTemplateRecord';

describe('createReadRecordAction', () => {
  it('reads catalog entities with the initiating user credentials', async () => {
    const credentials = { $$type: '@backstage/BackstageCredentials' };
    const entities: Record<string, CatalogEntity> = {
      'component:default/payments': {
        kind: 'Component',
        metadata: {
          name: 'payments',
          annotations: {
            'backstage.io/source-location':
              'url:https://gitlab.example.com/group/payments/-/tree/main',
            'backstage.io/source-template': 'template:default/service',
          },
        },
      },
      'template:default/service': {
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
        spec: { parameters: [] },
      },
    };
    const catalog = {
      getEntityByRef: jest.fn(async (entityRef: string) => entities[entityRef]),
    };
    const dependencies = {
      catalog,
      urlReader: {
        readUrl: jest.fn(async () => ({
          buffer: async () =>
            Buffer.from(
              'template: template:default/service\nversion: 1.0.0\nvalues: {}\n',
            ),
        })),
      },
      gitlab: {
        getProject: jest.fn(async (repoUrl: string) => ({
          id: 1,
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
    const action = createReadRecordAction(dependencies);
    const context = {
      input: { entityRef: 'component:default/payments' },
      getInitiatorCredentials: jest.fn(async () => credentials),
      output: jest.fn(),
    };

    await action.handler(context as never);

    expect(context.getInitiatorCredentials).toHaveBeenCalledTimes(1);
    expect(catalog.getEntityByRef).toHaveBeenNthCalledWith(
      1,
      'component:default/payments',
      credentials,
    );
    expect(catalog.getEntityByRef).toHaveBeenNthCalledWith(
      2,
      'template:default/service',
      credentials,
    );
  });
});
