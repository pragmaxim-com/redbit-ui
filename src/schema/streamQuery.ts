import { FilterField } from './generateEndpoints';

export type FilterOperator = 'Eq' | 'Ne' | 'Lt' | 'Le' | 'Gt' | 'Ge' | 'In';
export const FilterOperators = ['Eq', 'Ne', 'Lt', 'Le', 'Gt', 'Ge', 'In'];
export type FilterExpr = {
  fieldPath: string; // "utxos[].assets[].amount"
  op: FilterOperator;
  value: string | number | string[] | number[];
};

/**
 * Check if a node represents a FilterOp<T> wrapper (single-key object: Eq, Ne, Lt, Le, Gt, Ge, In)
 */
function isFilterOpWrapper(node: any): boolean {
  if (!node || node.type !== 'object' || typeof node.properties !== 'object') return false;
  const keys = Object.keys(node.properties);
  return keys.length === 1 && FilterOperators.includes(keys[0]);
}

/**
 * Recursively unwrap oneOf/anyOf chains to find a FilterOp leaf schema
 * and extract its inner schema along with examples if present.
 */
function unwrapFilterOp(schema: any): { type: string; examples?: any[] } | null {
  if (!schema || typeof schema !== 'object') return null;

  // Unwrap oneOf and anyOf variants
  const variants: any[] = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : [];

  for (const variant of variants) {
    const unwrapped = unwrapFilterOp(variant);
    if (unwrapped) return unwrapped;
  }

  // If this node itself is a FilterOp wrapper, extract its value and examples
  if (isFilterOpWrapper(schema)) {
    const key = Object.keys(schema.properties)[0];
    const inner = schema.properties[key];
    const result: { type: string; examples?: any[] } = { type: inner.type };
    if (Array.isArray(inner.examples)) result.examples = inner.examples;
    return result;
  }

  return null;
}

/**
 * Append array suffix to the last segment of pathParts
 */
function appendArraySuffix(pathParts: string[]): string[] {
  if (pathParts.length === 0) return ['[]'];
  const newParts = [...pathParts];
  const last = newParts.pop()!;
  newParts.push(`${last}[]`);
  return newParts;
}

export function extractBodyFilterFields(schema: any): FilterField[] {
  const fields: FilterField[] = [];

  function defaultExamples(type: string): any[] {
    switch (type) {
      case 'string': return ['example'];
      case 'integer':
      case 'number': return [0];
      case 'boolean': return [true];
      default: return [];
    }
  }

  function walk(node: any, pathParts: string[]): void {
    if (!node || typeof node !== 'object') return;

    // First, try to detect a FilterOp wrapper
    const filterLeaf = unwrapFilterOp(node);
    if (filterLeaf) {
      const fullPath = pathParts.join('.');
      fields.push({
        path: fullPath,
        type: filterLeaf.type,
        examples: filterLeaf.examples ?? defaultExamples(filterLeaf.type),
      });
      return;
    }

    // Handle oneOf/anyOf containing object or array branches without FilterOp
    if (node.oneOf || node.anyOf) {
      const variants = node.oneOf || node.anyOf;
      for (const variant of variants) {
        if (variant.type === 'object' || variant.type === 'array') {
          walk(variant, pathParts);
          return;
        }
      }
    }

    // Recurse into object properties
    if (node.type === 'object' && node.properties) {
      for (const [key, child] of Object.entries<any>(node.properties)) {
        walk(child, [...pathParts, key]);
      }
      return;
    }

    // Recurse into array items
    if (node.type === 'array' && node.items) {
      walk(node.items, appendArraySuffix(pathParts));
      return;
    }

    // Leaf scalar fallback: include examples if present
    if (typeof node.type === 'string' && ['string', 'number', 'integer', 'boolean'].includes(node.type)) {
      const fullPath = pathParts.join('.');
      const field: FilterField =
        { path: fullPath,
          examples: Array.isArray(node.examples) ? node.examples : defaultExamples(node.type),
          type: node.type
        };
      fields.push(field);
    }
  }

  walk(schema, []);
  return fields;
}

export function buildFilterBody(exprs: FilterExpr[]): any {
  const body: any = {};

  exprs.forEach(({ fieldPath, op, value }) => {
    const parts = fieldPath.split('.').map(p => p.replace(/\[]$/, ''));
    let cursor = body;
    parts.forEach((key, idx) => {
      const isLast = idx === parts.length - 1;
      if (isLast) {
        if (!cursor[key] || typeof cursor[key] !== 'object') {
          cursor[key] = {};
        }
        cursor[key][op] = value;
      } else {
        if (!(key in cursor) || typeof cursor[key] !== 'object') {
          cursor[key] = {};
        }
        cursor = cursor[key];
      }
    });
  });

  return body;
}
