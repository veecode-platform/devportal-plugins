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
  projectSha: string;
  oldValues: TemplateUpdateValues;
  newValues: TemplateUpdateValues;
  oldFetchOptions: Record<string, unknown>;
  newFetchOptions: Record<string, unknown>;
  projectUrl: string;
  catalogOwner: string;
  targetVersion: string;
  upToDate: boolean;
}

export interface ReadTemplateRecordDependencies {
  catalog: {
    getEntityByRef(
      entityRef: string,
      credentials?: unknown,
    ): Promise<CatalogEntity | undefined>;
  };
  urlReader: {
    readUrl(url: string): Promise<{ buffer(): Promise<Buffer> }>;
  };
  gitlab: {
    getProject(repoUrl: string): Promise<{
      id: number;
      projectSlug: string;
      host: string;
      repoUrl: string;
      defaultBranch: string;
    }>;
    resolveCommitSha(repoUrl: string, ref: string): Promise<string>;
    readRepositoryFile(
      repoUrl: string,
      filePath: string,
      ref: string,
    ): Promise<Buffer>;
  };
}

export async function readTemplateRecord(
  input: { entityRef: string; targetVersion?: string },
  dependencies: ReadTemplateRecordDependencies,
  credentials?: unknown,
): Promise<ReadTemplateRecordResult> {
  const component = await getEntity(
    dependencies.catalog,
    input.entityRef,
    credentials,
  );
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
  const projectSha = await dependencies.gitlab.resolveCommitSha(
    projectRepoUrl,
    project.defaultBranch,
  );
  // The GitLab UrlReader only resolves /blob/ URLs (it splits the path on "/blob/" to find
  // the ref), so a /-/raw/ URL reaches the API with an empty ref and file path.
  const recordUrl = `${projectRepoUrl}/-/blob/${encodeURIComponent(
    projectSha,
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

  const template = await getEntity(
    dependencies.catalog,
    sourceTemplate,
    credentials,
  );
  if (template.kind.toLocaleLowerCase('en-US') !== 'template') {
    throw new InputError(
      `${SOURCE_TEMPLATE} ${sourceTemplate} is not a Template entity`,
    );
  }

  const templateAnnotations = template.metadata.annotations ?? {};
  const annotatedVersion = templateAnnotations[TEMPLATE_VERSION];
  const requestedVersion = input.targetVersion?.trim() || annotatedVersion;
  if (!requestedVersion) {
    throw new InputError(
      `Template ${sourceTemplate} has no ${TEMPLATE_VERSION} annotation`,
    );
  }
  const target = parseSemver(requestedVersion, 'requested target');
  const recorded = parseSemver(record.version, 'recorded template');
  if (annotatedVersion) parseSemver(annotatedVersion, 'catalog template');
  if (compareSemver(target, recorded) < 0) {
    throw new InputError(
      `Cannot downgrade template version: recorded version ${record.version} is newer than requested version ${requestedVersion}`,
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
  const templateFilePath = resolveTemplateFilePath(parsedTemplateLocation.path);
  const templateName = templatePath.split('/').filter(Boolean).at(-2);
  if (!templateName) {
    throw new InputError(
      `Cannot determine the template directory from ${templateLocations.join(
        ', ',
      )}`,
    );
  }

  const oldValues = { ...record.values, templateVersion: recorded.normalized };
  const newValues = { ...record.values, templateVersion: target.normalized };
  const newTag = `${templateName}/v${target.normalized}`;
  const newSha = await dependencies.gitlab.resolveCommitSha(
    parsedTemplateLocation.repoUrl,
    newTag,
  );
  const oldTag = `${templateName}/v${recorded.normalized}`;
  const oldSha = await dependencies.gitlab.resolveCommitSha(
    parsedTemplateLocation.repoUrl,
    oldTag,
  );
  const [oldTemplateText, newTemplateText] = await Promise.all([
    dependencies.gitlab.readRepositoryFile(
      parsedTemplateLocation.repoUrl,
      templateFilePath,
      oldSha,
    ),
    dependencies.gitlab.readRepositoryFile(
      parsedTemplateLocation.repoUrl,
      templateFilePath,
      newSha,
    ),
  ]);
  const oldTemplate = parseTemplateDefinition(
    oldTemplateText.toString('utf8'),
    templateFilePath,
  );
  const newTemplate = parseTemplateDefinition(
    newTemplateText.toString('utf8'),
    templateFilePath,
  );
  const targetParameters = parseTargetParameters(newTemplate, templateFilePath);
  const fields = validateParameters(targetParameters, newValues);
  if (record.reconstructed === true || fields.length > 0) {
    const requestedFields =
      record.reconstructed === true
        ? collectParameterFields(targetParameters, record.values)
        : fields;
    throw new InputError(
      `Template update needs input for fields: ${
        requestedFields.join(', ') || 'template parameters'
      }. Update the project K1 record and rerun.`,
    );
  }

  const oldFetchOptions = fetchTemplateOptions(
    oldTemplate,
    templatePath,
    templateFilePath,
    templateName,
  );
  const newFetchOptions = fetchTemplateOptions(
    newTemplate,
    templatePath,
    templateFilePath,
    templateName,
  );

  return {
    templateRepoUrl: parsedTemplateLocation.repoUrl,
    templatePath,
    templateName,
    oldSha,
    newSha,
    projectSha,
    oldValues,
    newValues,
    oldFetchOptions,
    newFetchOptions,
    projectUrl: `${projectRepoUrl}/-/tree/${encodeURIComponent(projectSha)}`,
    catalogOwner: component.spec?.owner ?? 'unknown',
    targetVersion: target.normalized,
    upToDate: compareSemver(recorded, target) === 0,
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

function resolveTemplateFilePath(locationPath: string): string {
  const parts = locationPath.split('/').filter(Boolean);
  if (parts.at(-1) === 'catalog-info.yaml' || parts.at(-1) === 'skeleton') {
    parts.pop();
  }
  if (parts.at(-1) !== 'template.yaml') parts.push('template.yaml');
  return parts.join('/');
}

interface ParsedSemver {
  normalized: string;
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease?: Array<string | bigint>;
}

function parseSemver(version: string, label: string): ParsedSemver {
  const normalized = version.startsWith('v') ? version.slice(1) : version;
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      normalized,
    );
  if (!match) {
    throw new InputError(
      `Invalid ${label} version ${version}; expected a semantic version`,
    );
  }
  const prerelease = match[4]?.split('.').map(identifier => {
    if (/^\d+$/.test(identifier)) {
      if (identifier.length > 1 && identifier.startsWith('0')) {
        throw new InputError(
          `Invalid ${label} version ${version}; numeric prerelease identifiers cannot have leading zeroes`,
        );
      }
      return BigInt(identifier);
    }
    return identifier;
  });
  return {
    normalized,
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
  };
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (!left.prerelease && !right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index++) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === 'bigint' && typeof rightPart !== 'bigint')
      return -1;
    if (typeof leftPart !== 'bigint' && typeof rightPart === 'bigint') return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function parseTemplateDefinition(
  text: string,
  filePath: string,
): Record<string, unknown> {
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw new InputError(
      `Template file ${filePath} is invalid YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isRecord(document)) {
    throw new InputError(`Template ${filePath} must be a mapping`);
  }
  return document;
}

function parseTargetParameters(
  document: Record<string, unknown>,
  filePath: string,
): unknown {
  if (!isRecord(document.spec)) {
    throw new InputError(
      `Target template ${filePath} must define a spec mapping`,
    );
  }
  return document.spec.parameters;
}

const FETCH_TEMPLATE_RENDERING_OPTIONS = [
  'templateFileExtension',
  'copyWithoutTemplating',
  'copyWithoutRender',
  'cookiecutterCompat',
  'replace',
  'trimBlocks',
  'lstripBlocks',
] as const;

function fetchTemplateOptions(
  template: Record<string, unknown>,
  templatePath: string,
  templateFilePath: string,
  templateName: string,
): Record<string, unknown> {
  const spec = isRecord(template.spec) ? template.spec : {};
  const steps = Array.isArray(spec.steps) ? spec.steps.filter(isRecord) : [];
  const candidates = steps.filter(step => step.action === 'fetch:template');
  if (candidates.length === 0) {
    throw new InputError(
      `Template ${templateName} has no fetch:template step for skeleton ${templatePath}`,
    );
  }

  let selected: Record<string, unknown>;
  if (candidates.length === 1) {
    selected = candidates[0];
  } else {
    const matched = candidates.filter(step => {
      const stepInput = isRecord(step.input) ? step.input : {};
      return (
        typeof stepInput.url === 'string' &&
        urlReferencesSkeleton(stepInput.url, templatePath, templateFilePath)
      );
    });
    if (matched.length !== 1) {
      const candidateIds = candidates
        .map(step => (typeof step.id === 'string' ? step.id : '<unnamed>'))
        .join(', ');
      throw new InputError(
        `Template ${templateName} has multiple fetch:template steps (${candidateIds}) and cannot uniquely match skeleton ${templatePath}`,
      );
    }
    selected = matched[0];
  }

  const stepInput = isRecord(selected.input) ? selected.input : {};
  const options: Record<string, unknown> = {};
  for (const option of FETCH_TEMPLATE_RENDERING_OPTIONS) {
    if (!Object.hasOwn(stepInput, option)) continue;
    const value = stepInput[option];
    if (containsTemplateExpression(value)) {
      throw new InputError(
        `Template ${templateName} has dynamic fetch:template option ${option}; dynamic options cannot be reproduced`,
      );
    }
    options[option] = value;
  }
  return options;
}

function urlReferencesSkeleton(
  url: string,
  templatePath: string,
  templateFilePath: string,
): boolean {
  const staticUrl = url
    .replace(/\$\{\{[\s\S]*?\}\}/g, '')
    .split(/[?#]/, 1)[0]
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/');
  const normalize = (value: string) =>
    value
      .split('/')
      .filter(part => part.length > 0 && part !== '.')
      .join('/');
  const normalizedUrl = normalize(staticUrl);
  const normalizedPaths = [
    templatePath,
    relativeSkeletonPath(templatePath, templateFilePath),
  ].map(normalize);
  return normalizedPaths.some(
    path => normalizedUrl === path || normalizedUrl.endsWith(`/${path}`),
  );
}

function relativeSkeletonPath(
  templatePath: string,
  templateFilePath: string,
): string {
  const templateDirectory = templateFilePath.slice(
    0,
    Math.max(0, templateFilePath.lastIndexOf('/')),
  );
  const templateParts = templateDirectory.split('/').filter(Boolean);
  const skeletonParts = templatePath.split('/').filter(Boolean);
  let shared = 0;
  while (
    shared < templateParts.length &&
    shared < skeletonParts.length &&
    templateParts[shared] === skeletonParts[shared]
  ) {
    shared++;
  }
  return [
    ...templateParts.slice(shared).map(() => '..'),
    ...skeletonParts.slice(shared),
  ].join('/');
}

function containsTemplateExpression(value: unknown): boolean {
  if (typeof value === 'string') return /\$\{\{[\s\S]*?\}\}/.test(value);
  if (Array.isArray(value)) return value.some(containsTemplateExpression);
  if (isRecord(value))
    return Object.values(value).some(containsTemplateExpression);
  return false;
}

async function getEntity(
  catalog: ReadTemplateRecordDependencies['catalog'],
  entityRef: string,
  credentials?: unknown,
): Promise<CatalogEntity> {
  const entity = await catalog.getEntityByRef(entityRef, credentials);
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
