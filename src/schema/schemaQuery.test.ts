import { describe, expect, it } from 'vitest';
import { extractBodyFilterFields } from './streamQuery';
import type { OpenAPIV3_1 } from 'openapi-types';
import { fetchSchema, SchemaMap } from './schema';
import { FilterParam, generateEndpoints, ParamType } from './generateEndpoints';

const openapi: OpenAPIV3_1.Document = await fetchSchema('http://127.0.0.1:8000/apidoc/openapi.json');
const realDefs: SchemaMap = openapi.components?.schemas as any;
const endpoints = generateEndpoints(openapi.paths!, realDefs);

describe('extractFilterFields', () => {
  it(`extract body fields from real schema`, async () => {
    Object.values(endpoints).filter(ep => ep.streaming || ep.method === 'GET' ).forEach(ep => {
      for (const param of ep.paramDefs) if (param.in === ParamType.Filter) {
        const fields = (param as FilterParam).fields;
        fields.forEach(f => {
          if (f.path === '') {
            throw new Error(`Empty param:\n ${JSON.stringify(param.schema, null, 2)}`);
          }
        });
        expect(fields.length).toBeGreaterThan(0);
      }
    });
  });

  it('extracts string fields with FilterOp', () => {
    const schema = {
      type: 'object',
      properties: {
        hash: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                Eq: { type: 'string', examples: ['a'] },
              },
            },
          ],
        },
      },
    };

    const fields = extractBodyFilterFields(schema);
    expect(fields).toEqual([
      { path: 'hash', type: 'string', examples: ['a'] },
    ]);
  });

  it('extracts integer fields with FilterOp', () => {
    const schema = {
      type: 'object',
      properties: {
        amount: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                Eq: { type: 'integer', format: 'int64', minimum: 0, examples: [0] },
              },
            },
          ],
        },
      },
    };

    const fields = extractBodyFilterFields(schema);
    expect(fields).toEqual([
      { path: 'amount', type: 'integer', examples: [0] },
    ]);
  });

  it('handles nested object fields', () => {
    const schema = {
      type: 'object',
      properties: {
        input: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                id: {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        Eq: { type: 'string', examples: ['example'] },
                      },
                    },
                  ],
                },
                hash: {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        Eq: { type: 'string', examples: ['example'] },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };

    const fields = extractBodyFilterFields(schema);
    expect(fields).toEqual([
      { path: 'input.id', type: 'string', examples: ['example'] },
      { path: 'input.hash', type: 'string', examples: ['example'] },
    ]);
  });

  it('handles arrays and nested arrays', () => {
    const schema = {
      type: 'object',
      properties: {
        utxos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      Eq: { type: 'string', examples: ['example'] },
                    },
                  },
                ],
              },
              assets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: {
                            Eq: { type: 'string', examples: ['example'] },
                          },
                        },
                      ],
                    },
                    amount: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: {
                            Gt: { type: 'integer', examples: [0] },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const fields = extractBodyFilterFields(schema);
    expect(fields).toEqual([
      { path: 'utxos[].address', type: 'string', examples: ['example'] },
      { path: 'utxos[].assets[].name', type: 'string', examples: ['example'] },
      { path: 'utxos[].assets[].amount', type: 'integer', examples: [0] },
    ]);
  });

  it('handles simple scalar fields without FilterOp', () => {
    const schema = {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          examples: ['example'],
        },
        count: {
          type: 'integer',
          examples: [0],
        },
      },
    };

    const fields = extractBodyFilterFields(schema);
    expect(fields).toEqual([
      { path: 'status', type: 'string', examples: ['example'] },
      { path: 'count', type: 'integer', examples: [0] },
    ]);
  });

  it('ignores unrecognized structures', () => {
    const schema = {
      type: 'object',
      properties: {
        unknown: {
          oneOf: [{ type: 'null' }],
        },
      },
    };

    const fields = extractBodyFilterFields(schema);
    expect(fields).toEqual([]);
  });
});
