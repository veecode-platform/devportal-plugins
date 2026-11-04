import { type Entity, stringifyEntityRef } from '@backstage/catalog-model';
import type {
  BackstageCredentials,
  UrlReaderService,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { parse } from 'yaml';
import { z } from 'zod';

const MANAGED_BY_LOCATION = 'backstage.io/managed-by-location';
const URL_PREFIX = 'url:';

const declarationSchema = z.object({
  secrets: z.array(z.string()).optional(),
});

export interface DeclarationServices {
  catalog: CatalogService;
  urlReader: UrlReaderService;
}

/**
 * Names the app's components declare for one environment. Each component
 * declares in its own repository, so the names are the union over all of them.
 */
export async function declaredNames(
  options: DeclarationServices & {
    system: Entity;
    environment: string;
    declarationFile: string;
    credentials: BackstageCredentials;
  },
): Promise<Set<string>> {
  const {
    catalog,
    urlReader,
    system,
    environment,
    declarationFile,
    credentials,
  } = options;
  const systemRef = stringifyEntityRef({
    kind: 'system',
    namespace: system.metadata.namespace ?? 'default',
    name: system.metadata.name,
  });
  const { items } = await catalog.getEntities(
    { filter: { kind: 'component', 'relations.partOf': systemRef } },
    { credentials },
  );

  const names = new Set<string>();
  for (const component of items) {
    const location = component.metadata.annotations?.[MANAGED_BY_LOCATION];
    if (!location?.startsWith(URL_PREFIX)) {
      continue;
    }
    const fileUrl = new URL(
      declarationFile.replaceAll('{environment}', environment),
      location.slice(URL_PREFIX.length),
    ).toString();
    const text = await readDeclaration(urlReader, fileUrl);
    if (text === undefined) {
      continue;
    }
    for (const name of parseDeclaration(text, fileUrl)) {
      names.add(name);
    }
  }
  return names;
}

export function assertDeclared(
  name: string,
  declared: ReadonlySet<string>,
  context: { system: string; environment: string; declarationFile: string },
): void {
  if (!declared.has(name)) {
    throw new Error(
      `name "${name}" is not declared for environment "${context.environment}" by any component of "${context.system}"; add it to "secrets" in ${context.declarationFile}`,
    );
  }
}

async function readDeclaration(
  urlReader: UrlReaderService,
  fileUrl: string,
): Promise<string | undefined> {
  try {
    const response = await urlReader.readUrl(fileUrl);
    return (await response.buffer()).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      return undefined;
    }
    throw new Error(
      `Could not read the declaration ${fileUrl}: ${errorName(error)}`,
    );
  }
}

function parseDeclaration(text: string, fileUrl: string): string[] {
  let document: unknown;
  try {
    document = parse(text);
  } catch {
    throw new Error(`The declaration ${fileUrl} is not valid YAML`);
  }
  const parsed = declarationSchema.safeParse(document ?? {});
  if (!parsed.success) {
    throw new Error(
      `The declaration ${fileUrl} must map "secrets" to a list of names`,
    );
  }
  return parsed.data.secrets ?? [];
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
