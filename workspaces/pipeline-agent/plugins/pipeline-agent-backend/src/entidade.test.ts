import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { pipelineAgentInvestigationCreatePermission } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { criarAutorizador, projetoPermitido } from './autorizacao';
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
    ],
  });

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
    ).rejects.toThrow(/gitlab\.com\/project-slug/);
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

describe('projetoPermitido', () => {
  it('matches an exact slug and a group prefix, and nothing else', () => {
    expect(
      projetoPermitido('veecode-demos/pedidos-api', [
        'veecode-demos/pedidos-api',
      ]),
    ).toBe(true);
    expect(
      projetoPermitido('veecode-demos/outro', ['veecode-demos/pedidos-api']),
    ).toBe(false);
    expect(projetoPermitido('veecode-demos/outro', ['veecode-demos/*'])).toBe(
      true,
    );
    expect(projetoPermitido('veecode-demosx/outro', ['veecode-demos/*'])).toBe(
      false,
    );
    expect(projetoPermitido('veecode-demos/outro', [])).toBe(false);
  });
});

describe('criarAutorizador', () => {
  const requisicao = () =>
    ({
      headers: {
        authorization: mockCredentials.user.header('user:default/alice'),
      },
    } as never);
  const permissoes = (resultado: AuthorizeResult) =>
    mockServices.permissions.mock({
      authorize: async (reqs: unknown[]) =>
        reqs.map(() => ({ result: resultado })),
    } as never);

  it('denies a project that is not on the allowlist, before RBAC is asked', async () => {
    const permissions = permissoes(AuthorizeResult.ALLOW);
    const autorizador = criarAutorizador({
      httpAuth: mockServices.httpAuth(),
      permissions,
      catalog: catalogo(),
      projetosPermitidos: [],
    });
    await expect(
      autorizador.entidade(creds, 'component:default/ok'),
    ).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(permissions.authorize).not.toHaveBeenCalled();
  });

  it('denies when RBAC denies the named permission', async () => {
    const autorizador = criarAutorizador({
      httpAuth: mockServices.httpAuth(),
      permissions: permissoes(AuthorizeResult.DENY),
      catalog: catalogo(),
      projetosPermitidos: ['veecode-demos/pedidos-api'],
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

  it('reads the user credentials from the request', async () => {
    const autorizador = criarAutorizador({
      httpAuth: mockServices.httpAuth(),
      permissions: permissoes(AuthorizeResult.ALLOW),
      catalog: catalogo(),
      projetosPermitidos: ['veecode-demos/pedidos-api'],
    });
    const credenciais = await autorizador.credenciais(requisicao());
    expect(credenciais).toMatchObject({ principal: { type: 'user' } });
  });
});
