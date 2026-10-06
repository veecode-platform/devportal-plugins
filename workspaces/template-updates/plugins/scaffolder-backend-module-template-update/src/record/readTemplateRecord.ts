import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { InputError, NotFoundError } from '@backstage/errors';
import { parse } from 'yaml';
import { parseGitlabLocation } from '../gitlab/repoLocation';

const SOURCE_LOCATION = 'backstage.io/source-location';
const MANAGED_BY_LOCATION = 'backstage.io/managed-by-location';
const SOURCE_TEMPLATE = 'backstage.io/source-template';
const TEMPLATE_VERSION = 'veecode.io/template-version';

export interface CatalogEntity {
  kind: string;
  metadata: {
    name: string;
    annotations?: Record<string, string | undefined>;
  };
  spec?: {
    owner?: string;
    parameters?: unknown;
  };
}

export interface TemplateUpdateValues {
  [key: string]: unknown;
  templateVersion: string;
}

export interface ReadTemplateRecordResult {
  templateRepoUrl: string;
  templatePath: string;
  templateName: string;
  oldSha: string;
  newSha: string;
  oldValues: TemplateUpdateValues;
  newValues: TemplateUpdateValues;
  projectUrl: string;
  catalogOwner: string;
  targetVersion: string;
  upToDate: boolean;
}

export interface ReadTemplateRecordDependencies {
  catalog: {
    getEntityByRef(entityRef: string): Promise<CatalogEntity | undefined>;
  };
  urlReader: {
    readUrl(url: string): Promise<{ buffer(): Promise<Buffer> }>;
  };
  gitlab: {
    getProject(repoUrl: string): Promise<{
      id: number;
      projectSlug: string;
      host: string;
      defaultBranch: string;
    }>;
    resolveCommitSha(repoUrl: string, ref: string): Promise<string>;
  };
}

export async function readTemplateRecord(
  input: { entityRef: string; targetVersion?: string },
  dependencies: ReadTemplateRecordDependencies,
): Promise<ReadTemplateRecordResult> {
  const component = await getEntity(dependencies.catalog, input.entityRef);
  if (component.kind.toLocaleLowerCase('en-US') !== 'component') {
    throw new InputError(`Entity ${input.entityRef} must be a Component`);
  }

  const componentAnnotations = component.metadata.annotations ?? {};
  const sourceTemplate = componentAnnotations[SOURCE_TEMPLATE];
  if (!sourceTemplate) {
    throw new InputError(
      `Component ${input.entityRef} has no ${SOURCE_TEMPLATE} annotation`,
    );
  }

  const projectLocation = componentAnnotations[SOURCE_LOCATION];
  if (!projectLocation) {
    throw new InputError(
      `Component ${input.entityRef} has no ${SOURCE_LOCATION} annotation`,
    );
  }
  const projectRepoUrl = parseGitlabLocation(projectLocation).repoUrl;
  const project = await dependencies.gitlab.getProject(projectRepoUrl);
  const recordUrl = `${projectRepoUrl}/-/raw/${encodeURIComponent(
    project.defaultBranch,
  )}/.template/record.yaml`;

  let recordText: string;
  try {
    const response = await dependencies.urlReader.readUrl(recordUrl);
    recordText = (await response.buffer()).toString('utf8');
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      (error as { status?: number }).status === 404
    ) {
      throw new InputError(
        `Template update needs input: project is missing .template/record.yaml (K1)`,
      );
    }
    throw new InputError(
      `Template update needs input: cannot read .template/record.yaml from the project default branch`,
    );
  }

  let record: unknown;
  try {
    record = parse(recordText);
  } catch (error) {
    throw new InputError(
      `Template update needs input: .template/record.yaml is invalid YAML (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }

  if (!isRecord(record)) {
    throw new InputError(
      'Template update needs input: .template/record.yaml must be a mapping',
    );
  }

  if (record.template !== sourceTemplate) {
    throw new InputError(
      `Template update needs input: record template ${String(
        record.template,
      )} does not match ${SOURCE_TEMPLATE} ${sourceTemplate}`,
    );
  }
  if (typeof record.version !== 'string' || record.version.length === 0) {
    throw new InputError(
      'Template update needs input: .template/record.yaml has no version',
    );
  }
  if (!isRecord(record.values)) {
    throw new InputError(
      'Template update needs input: .template/record.yaml values must be an object',
    );
  }

  const template = await getEntity(dependencies.catalog, sourceTemplate);
  if (template.kind.toLocaleLowerCase('en-US') !== 'template') {
    throw new InputError(
      `${SOURCE_TEMPLATE} ${sourceTemplate} is not a Template entity`,
    );
  }

  const templateAnnotations = template.metadata.annotations ?? {};
  const annotatedVersion = templateAnnotations[TEMPLATE_VERSION];
  const targetVersion = input.targetVersion?.trim() || annotatedVersion;
  if (!targetVersion) {
    throw new InputError(
      `Template ${sourceTemplate} has no ${TEMPLATE_VERSION} annotation`,
    );
  }

  const templateLocations = [
    templateAnnotations[SOURCE_LOCATION],
    templateAnnotations[MANAGED_BY_LOCATION],
  ].filter((location): location is string => Boolean(location));
  if (templateLocations.length === 0) {
    throw new InputError(
      `Template ${sourceTemplate} has no source location annotation`,
    );
  }
  const parsedLocations = templateLocations.map(parseGitlabLocation);
  const parsedTemplateLocation =
    parsedLocations.find(location => location.path.length > 0) ??
    parsedLocations[0];
  const templatePath = resolveSkeletonPath(parsedTemplateLocation.path);
  const templateName = templatePath.split('/').filter(Boolean).at(-2);
  if (!templateName) {
    throw new InputError(
      `Cannot determine the template directory from ${templateLocations.join(
        ', ',
      )}`,
    );
  }

  const oldValues = { ...record.values, templateVersion: record.version };
  const newValues = { ...record.values, templateVersion: targetVersion };
  const fields = validateParameters(template.spec?.parameters, newValues);
  if (record.reconstructed === true || fields.length > 0) {
    const requestedFields =
      record.reconstructed === true
        ? collectParameterFields(template.spec?.parameters, record.values)
        : fields;
    throw new InputError(
      `Template update needs input for fields: ${
        requestedFields.join(', ') || 'template parameters'
      }. Update the project K1 record and rerun.`,
    );
  }

  const oldTag = `${templateName}/v${record.version}`;
  const newTag = `${templateName}/v${targetVersion}`;
  const [oldSha, newSha] = await Promise.all([
    dependencies.gitlab.resolveCommitSha(
      parsedTemplateLocation.repoUrl,
      oldTag,
    ),
    dependencies.gitlab.resolveCommitSha(
      parsedTemplateLocation.repoUrl,
      newTag,
    ),
  ]);

  return {
    templateRepoUrl: parsedTemplateLocation.repoUrl,
    templatePath,
    templateName,
    oldSha,
    newSha,
    oldValues,
    newValues,
    projectUrl: `${projectRepoUrl}/-/tree/${encodeURIComponent(
      project.defaultBranch,
    )}`,
    catalogOwner: component.spec?.owner ?? 'unknown',
    targetVersion,
    upToDate: record.version === targetVersion,
  };
}

function resolveSkeletonPath(locationPath: string): string {
  const parts = locationPath.split('/').filter(Boolean);
  if (
    parts.at(-1) === 'template.yaml' ||
    parts.at(-1) === 'catalog-info.yaml'
  ) {
    parts.pop();
  }
  if (parts.at(-1) !== 'skeleton') parts.push('skeleton');
  return parts.join('/');
}

async function getEntity(
  catalog: ReadTemplateRecordDependencies['catalog'],
  entityRef: string,
): Promise<CatalogEntity> {
  const entity = await catalog.getEntityByRef(entityRef);
  if (!entity)
    throw new NotFoundError(`Catalog entity ${entityRef} was not found`);
  return entity;
}

function validateParameters(
  parameters: unknown,
  values: Record<string, unknown>,
): string[] {
  const schemas = parameterSchemas(parameters);
  const validator = new Ajv({
    allErrors: true,
    strict: false,
  });
  addFormats(validator);
  const fields = new Set<string>();

  for (const schema of schemas) {
    if (!isRecord(schema)) continue;
    const validate = validator.compile(schema);
    if (validate(values)) continue;
    for (const error of validate.errors ?? []) fields.add(fieldForError(error));
  }
  return [...fields];
}

function collectParameterFields(
  parameters: unknown,
  values: Record<string, unknown>,
): string[] {
  const fields = new Set<string>();
  const schemas = parameterSchemas(parameters);
  for (const schema of schemas) collectSchemaFields(schema, '', fields);
  if (fields.size === 0)
    Object.keys(values).forEach(field => fields.add(field));
  return [...fields].sort();
}

function parameterSchemas(parameters: unknown): unknown[] {
  if (Array.isArray(parameters)) return parameters;
  return parameters ? [parameters] : [];
}

function collectSchemaFields(
  value: unknown,
  prefix: string,
  fields: Set<string>,
): void {
  if (!isRecord(value)) return;
  if (Array.isArray(value.required)) {
    for (const field of value.required) {
      if (typeof field === 'string')
        fields.add(prefix ? `${prefix}.${field}` : field);
    }
  }
  if (isRecord(value.properties)) {
    for (const [field, schema] of Object.entries(value.properties)) {
      const fullName = prefix ? `${prefix}.${field}` : field;
      fields.add(fullName);
      collectSchemaFields(schema, fullName, fields);
    }
  }
}

function fieldForError(error: ErrorObject): string {
  const instancePath = error.instancePath
    .replace(/^\//, '')
    .replaceAll('/', '.');
  const params = error.params as {
    missingProperty?: string;
    additionalProperty?: string;
  };
  const field = params.missingProperty ?? params.additionalProperty;
  if (field) return instancePath ? `${instancePath}.${field}` : field;
  return instancePath || 'template parameters';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
