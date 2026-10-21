import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { pipelineAgentInvestigationCreatePermission } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { criarAutorizador, vinculoPermitido } from './autorizacao';
import { resolverEntidade } from './entidade';

const creds = mockCredentials.user('user:default/alice');
const entidade = (name: string, anotacoes: Record<string, string>) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name, namespace: 'default', annotations: anotacoes },
  spec: { type: 'service', owner: 'user:default/alice' },
});
const catalogo = () =>
  catalogServiceMock({
    entities: [
      entidade('ok', {
        'gitlab.com/project-slug': 'veecode-demos/pedidos-api',
        'veecode.io/pipeline-agent': 'enabled',
      }),
      entidade('desligada', {
        'gitlab.com/project-slug': 'veecode-demos/pedidos-api',
        'veecode.io/pipeline-agent': 'off',
      }),
      entidade('sem-slug', { 'veecode.io/pipeline-agent': 'enabled' }),
      entidade('clone', {
        'gitlab.com/project-slug': 'veecode-demos/pedidos-api',
        'veecode.io/pipeline-agent': 'enabled',
      }),
    ],
  });
const VINCULOS = [
  { project: 'veecode-demos/pedidos-api', entityRef: 'component:default/ok' },
];

describe('resolverEntidade', () => {
  it('resolves the project from the annotation', async () => {
    await expect(
      resolverEntidade(catalogo(), creds, 'component:default/ok'),
    ).resolves.toEqual({
      entityRef: 'component:default/ok',
      projectSlug: 'veecode-demos/pedidos-api',
    });
  });

  it('answers 404 for an unknown entity and for one without the opt-in, the same way', async () => {
    await expect(
      resolverEntidade(catalogo(), creds, 'component:default/nao-existe'),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(
      resolverEntidade(catalogo(), creds, 'component:default/desligada'),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('answers 400 when the project-slug annotation is missing', async () => {
    await expect(
      resolverEntidade(catalogo(), creds, 'component:default/sem-slug'),
    ).rejects.toMatchObject({ name: 'InputError' });
  });

  it('answers 400 for an entityRef without a kind', async () => {
    await expect(
      resolverEntidade(catalogo(), creds, 'ok'),
    ).rejects.toMatchObject({ name: 'InputError' });
  });
});

describe('vinculoPermitido', () => {
  it('matches only the exact entityRef and project pair', () => {
    expect(
      vinculoPermitido(
        'component:default/ok',
        'veecode-demos/pedidos-api',
        VINCULOS,
      ),
    ).toBe(true);
    // Same project, another entity: refused.
    expect(
      vinculoPermitido(
        'component:default/clone',
        'veecode-demos/pedidos-api',
        VINCULOS,
      ),
    ).toBe(false);
    // Same entity, another project: refused.
    expect(
      vinculoPermitido('component:default/ok', 'veecode-demos/outro', VINCULOS),
    ).toBe(false);
    expect(
      vinculoPermitido('component:default/ok', 'veecode-demos/pedidos-api', []),
    ).toBe(false);
  });
});

describe('criarAutorizador', () => {
  const permissoes = (resultado: AuthorizeResult) =>
    mockServices.permissions.mock({
      authorize: async (reqs: unknown[]) =>
        reqs.map(() => ({ result: resultado })),
    } as never);

  it('denies an entity that is not bound to its project, before RBAC is asked', async () => {
    const permissions = permissoes(AuthorizeResult.ALLOW);
    const autorizador = criarAutorizador({
      httpAuth: mockServices.httpAuth(),
      permissions,
      catalog: catalogo(),
      vinculos: [],
    });
    await expect(
      autorizador.entidade(creds, 'component:default/ok'),
    ).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(permissions.authorize).not.toHaveBeenCalled();
  });

  it('denies a second entity that shares a project with a bound one', async () => {
    const autorizador = criarAutorizador({
      httpAuth: mockServices.httpAuth(),
      permissions: permissoes(AuthorizeResult.ALLOW),
      catalog: catalogo(),
      vinculos: VINCULOS,
    });
    await expect(
      autorizador.entidade(creds, 'component:default/clone'),
    ).rejects.toMatchObject({ name: 'NotAllowedError' });
    await expect(
      autorizador.entidade(creds, 'component:default/ok'),
    ).resolves.toMatchObject({ entityRef: 'component:default/ok' });
  });

  it('denies when RBAC denies the named permission', async () => {
    const autorizador = criarAutorizador({
      httpAuth: mockServices.httpAuth(),
      permissions: permissoes(AuthorizeResult.DENY),
      catalog: catalogo(),
      vinculos: VINCULOS,
    });
    await expect(
      autorizador.entidade(
        creds,
        'component:default/ok',
        pipelineAgentInvestigationCreatePermission,
      ),
    ).rejects.toMatchObject({
      name: 'NotAllowedError',
    });
  });
});
