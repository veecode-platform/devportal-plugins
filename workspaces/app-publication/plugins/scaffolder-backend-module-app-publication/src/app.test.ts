import { NotAllowedError } from '@backstage/errors';
import { PROJECT_WEB_URL, exampleSystem } from './fixtures';
import { projectOf } from './app';

const HOST = 'https://gitlab.example.com';
const PREFIX = 'example-org';

/** A System whose catalog recorded `location` and whose project-slug names `slug`. */
function systemAt(location: string, slug: string) {
  return exampleSystem({
    metadata: {
      name: 'example-app',
      namespace: 'default',
      annotations: {
        'gitlab.com/project-slug': slug,
        'backstage.io/managed-by-location': `url:${location}`,
      },
    },
  } as never);
}

describe("projectOf: the project path is cut at GitLab's separator", () => {
  it.each(['tree', 'blob', 'raw'])(
    'resolves a project path with a %s segment to the full path',
    segment => {
      const slug = `example-org/${segment}/example-app`;
      const project = projectOf(
        systemAt(`${HOST}/${slug}/-/blob/main/catalog-info.yaml`, slug),
        PREFIX,
      );

      expect(project).toEqual({
        origin: HOST,
        host: 'gitlab.example.com',
        slug,
      });
    },
  );

  it('refuses a slug that names only the shorter path before the segment', () => {
    expect(() =>
      projectOf(
        systemAt(
          `${HOST}/example-org/tree/example-app/-/blob/main/catalog-info.yaml`,
          'example-org',
        ),
        PREFIX,
      ),
    ).toThrow(NotAllowedError);
  });

  it('accepts a file path that holds a tree segment after the separator', () => {
    const project = projectOf(
      systemAt(
        `${PROJECT_WEB_URL}/-/blob/main/tree/catalog-info.yaml`,
        'example-org/example-app',
      ),
      PREFIX,
    );

    expect(project?.slug).toBe('example-org/example-app');
  });

  it('refuses a location with no GitLab separator, which is the legacy form', () => {
    expect(() =>
      projectOf(
        systemAt(
          `${PROJECT_WEB_URL}/blob/main/catalog-info.yaml`,
          'example-org/example-app',
        ),
        PREFIX,
      ),
    ).toThrow(NotAllowedError);
  });

  it('refuses a legacy path that mixes blob and tree markers', () => {
    expect(() =>
      projectOf(
        systemAt(
          `${PROJECT_WEB_URL}/tree/blob/catalog-info.yaml`,
          'example-org/example-app',
        ),
        PREFIX,
      ),
    ).toThrow(NotAllowedError);
  });
});
