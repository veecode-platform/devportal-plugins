export type StepData = Record<string, unknown>;

export type FieldConditions = Record<string, string | string[]>;

export type CatalogEntityPrefillOptions = {
  /** Property of the step that holds the selected entity ref. */
  entityRefField: string;
  /** Form property <- dot path into the catalog entity. */
  fill: Record<string, string>;
  /** Only fetch when every listed property has one of the listed values. */
  when?: FieldConditions;
  /** Mark the filled properties read-only when every listed property matches. */
  readonlyWhen?: FieldConditions;
  /** Overrides for the plugin's own texts. */
  messages?: { loading?: string; error?: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(reason: string): never {
  throw new Error(`CatalogEntityPrefill: ${reason}`);
}

function readConditions(
  value: unknown,
  name: string,
): FieldConditions | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) fail(`ui:options.${name} must be an object`);
  for (const [key, expected] of Object.entries(value)) {
    const valid =
      typeof expected === 'string' ||
      (Array.isArray(expected) && expected.every(v => typeof v === 'string'));
    if (!valid) {
      fail(`ui:options.${name}.${key} must be a string or a list of strings`);
    }
  }
  return value as FieldConditions;
}

export function readOptions(uiOptions: unknown): CatalogEntityPrefillOptions {
  if (!isRecord(uiOptions)) fail('ui:options is required');
  const { entityRefField, fill, when, readonlyWhen, messages } = uiOptions;
  if (typeof entityRefField !== 'string' || entityRefField === '') {
    fail('ui:options.entityRefField must be the name of a property');
  }
  if (
    !isRecord(fill) ||
    Object.keys(fill).length === 0 ||
    !Object.values(fill).every(path => typeof path === 'string')
  ) {
    fail('ui:options.fill must map form properties to entity paths');
  }
  return {
    entityRefField,
    fill: fill as Record<string, string>,
    when: readConditions(when, 'when'),
    readonlyWhen: readConditions(readonlyWhen, 'readonlyWhen'),
    messages: isRecord(messages) ? messages : undefined,
  };
}

function conditionsMatch(conditions: FieldConditions, data: StepData): boolean {
  return Object.entries(conditions).every(([key, expected]) =>
    (Array.isArray(expected) ? expected : [expected]).includes(
      data[key] as string,
    ),
  );
}

export function whenMatches(
  options: CatalogEntityPrefillOptions,
  data: StepData,
): boolean {
  return !options.when || conditionsMatch(options.when, data);
}

export function readonlyMatches(
  options: CatalogEntityPrefillOptions,
  data: StepData,
): boolean {
  return !!options.readonlyWhen && conditionsMatch(options.readonlyWhen, data);
}
