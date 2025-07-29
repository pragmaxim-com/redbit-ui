import type { OpenAPIV3_1 } from 'openapi-types';
import { COMPOSITES, isRef, resolveRef, SchemaMap, SchemaOrRef } from './schema';

export function inlineValueRefs(val: SchemaOrRef, defs: SchemaMap): OpenAPIV3_1.SchemaObject {
  if (isRef(val)) return inlineValueRefs(resolveRef(val.$ref, defs), defs);

  const schema = { ...(val as OpenAPIV3_1.SchemaObject) };

  COMPOSITES.forEach(k => {
    const arr = (schema as any)[k];
    if (Array.isArray(arr)) (schema as any)[k] = arr.map(s => inlineValueRefs(s, defs));
  });

  if (schema.properties) {
    Object.entries(schema.properties).forEach(([k, v]) => {
      schema.properties![k] = inlineValueRefs(v, defs);
    });
  }

  if (schema.type === 'array' && schema.items) {
    schema.items = inlineValueRefs(schema.items as any, defs);
  }

  return schema;
}

export function inlineSchema(root: string, defs: SchemaMap): OpenAPIV3_1.SchemaObject {
  const rootSchema = defs[root];
  return inlineValueRefs(rootSchema, defs);
}
