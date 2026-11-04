import type { Entity } from '@backstage/catalog-model';
import { mockCredentials } from '@backstage/backend-test-utils';
import { declaredNames } from './declaration';
import { exampleComponent, exampleSystem, fakeWorld } from './fixtures';

const devDeclarationUrl =
  'https://git.example.com/example-org/example-app/blob/main/apps/example-component/config/dev.yaml';
const fileLocationDeclarationUrl = 'file:///srv/example-app/config/dev.yaml';

function componentWithLocation(name: string, location?: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      namespace: 'default',
      ...(location === undefined
        ? {}
        : { annotations: { 'backstage.io/managed-by-location': location } }),
    },
    spec: {
      type: 'service',
      lifecycle: 'production',
      owner: 'group:default/example-team',
    },
  } as Entity;
}

function namesOf(components: Entity[], files: Record<string, string>) {
  const world = fakeWorld({ components, files });
  return {
    world,
    names: declaredNames({
      catalog: world.deps.catalog,
      urlReader: world.deps.urlReader,
      system: exampleSystem(),
      environment: 'dev',
      declarationFile: 'config/{environment}.yaml',
      credentials: mockCredentials.user(),
    }),
  };
}

describe('declaredNames', () => {
  it('skips a component whose managed-by location is a file, and reads only the url-located declaration', async () => {
    const { world, names } = namesOf(
      [
        componentWithLocation(
          'local-component',
          'file:/srv/example-app/catalog-info.yaml',
        ),
        exampleComponent('example-component'),
      ],
      {
        [fileLocationDeclarationUrl]: 'secrets:\n  - API_TOKEN\n',
        [devDeclarationUrl]: 'secrets:\n  - DATABASE_PASSWORD\n',
      },
    );

    expect([...(await names)]).toEqual(['DATABASE_PASSWORD']);
    expect(world.urlReader.readUrl).toHaveBeenCalledTimes(1);
    expect(world.urlReader.readUrl).toHaveBeenCalledWith(devDeclarationUrl);
  });

  it('skips a component that has no managed-by location at all', async () => {
    const { world, names } = namesOf(
      [
        componentWithLocation('unmanaged-component'),
        exampleComponent('example-component'),
      ],
      { [devDeclarationUrl]: 'secrets:\n  - DATABASE_PASSWORD\n' },
    );

    expect([...(await names)]).toEqual(['DATABASE_PASSWORD']);
    expect(world.urlReader.readUrl).toHaveBeenCalledTimes(1);
  });
});
