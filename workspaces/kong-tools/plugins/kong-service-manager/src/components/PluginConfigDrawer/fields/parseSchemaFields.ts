import type {
  SchemaField,
  PluginFieldsResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

/** Normalized field descriptor for form rendering. */
export type ConfigField = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'record' | 'map';
  required: boolean;
  defaultValue: unknown;
  /** Element type when type === 'array' */
  arrayElementType?: string;
  /** Options from one_of constraints (for select/dropdown) */
  oneOf?: unknown[];
  /** Sub-field definitions when arrayElementType === 'record' */
  recordFields?: ConfigField[];
};

function normalizeType(raw: string): ConfigField['type'] {
  switch (raw) {
    case 'string':
    case 'boolean':
    case 'array':
    case 'record':
    case 'map':
      return raw;
    case 'number':
    case 'integer':
      return 'number';
    case 'set':
      return 'array';
    default:
      return 'string';
  }
}

function parseField(fieldObj: SchemaField): ConfigField | null {
  const name = Object.keys(fieldObj)[0];
  if (!name) return null;
  const def = fieldObj[name];

  const field: ConfigField = {
    name,
    type: normalizeType(def.type),
    required: def.required ?? false,
    defaultValue: def.default,
  };

  if (def.one_of) {
    field.oneOf = def.one_of;
  }

  if (field.type === 'array' && def.elements) {
    field.arrayElementType = def.elements.type;

    // If the array elements are records with sub-fields, parse them recursively
    if (def.elements.type === 'record' && def.elements.fields) {
      field.recordFields = def.elements.fields
        .map(f => parseField(f))
        .filter(Boolean) as ConfigField[];
    }
  }

  return field;
}

/**
 * Extract the `config` sub-fields from a Kong plugin schema response.
 * The raw schema has top-level fields like `consumer`, `protocols`, `enabled`, `config`.
 * We only want the fields inside `config`.
 */
export function parseConfigFields(schema: PluginFieldsResponse): ConfigField[] {
  for (const fieldObj of schema.fields) {
    const name = Object.keys(fieldObj)[0];
    if (name === 'config') {
      const configDef = fieldObj[name];
      if (configDef.fields) {
        return configDef.fields
          .map(f => parseField(f))
          .filter(Boolean) as ConfigField[];
      }
    }
  }
  return [];
}
