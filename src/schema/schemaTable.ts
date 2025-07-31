export interface SchemaField {
  name: string;
  type: 'primitive' | 'object' | 'array';
  xKey?: boolean;
  children?: Record<string, SchemaField>;
}

function parseSchema(schema: any, fieldName = ''): SchemaField | undefined {
  if (!schema) return undefined;

  const effective = schema.oneOf?.find((s: any) => s.type && s.type !== 'null') || schema;
  if (!effective?.type) return undefined;

  const isPrimitive = ['string', 'number', 'boolean', 'integer'].includes(effective.type);
  const isArray = effective.type === 'array';
  const isObject = effective.type === 'object';

  const field: SchemaField = {
    name: fieldName,
    type: isPrimitive ? 'primitive' : isArray ? 'array' : 'object',
    xKey: !!effective['x-key'],
  };

  if (isArray && effective.items) {
    const itemField = parseSchema(effective.items, fieldName);
    if (itemField?.children) {
      field.children = itemField.children;
    }
  } else if (isObject && effective.properties) {
    field.children = {};
    for (const key of Object.keys(effective.properties)) {
      const child = parseSchema(effective.properties[key], key);
      if (child) field.children[key] = child;
    }
  }

  return field;
}

// Exported for use in table rendering
export function buildFieldTreeFromRootSchema(rootSchema: any): Record<string, SchemaField> {
  const rootProps = rootSchema.properties ?? {};
  const result: Record<string, SchemaField> = {};

  for (const key of Object.keys(rootProps)) {
    const field = parseSchema(rootProps[key], key);
    if (field) result[key] = field;
  }
  return result;
}

export function expandSchemaObjectFields(
  schema: Record<string, SchemaField>,
  prefix = '',
  isRoot = false
): Record<string, SchemaField> {
  const result: Record<string, SchemaField> = {};
  for (const [key, field] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;

    // Skip xKey fields only when not at root
    if (field.xKey && !isRoot) continue;

    if (field.type === 'object' && field.children) {
      Object.assign(result, expandSchemaObjectFields(field.children, path));
    } else {
      result[path] = field;
    }
  }
  return result;
}
