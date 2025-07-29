import { describe, expect, it } from 'vitest';
import type { OpenAPIV3_1 } from 'openapi-types';
import { buildExampleEndpointParams, Endpoint, FilterParam, generateEndpoints, ParamDefinition, ParamType } from './generateEndpoints';
import { fetchSchema, SchemaMap } from './schema';
import * as client from '../hey';
import { buildFilterBody, FilterExpr } from './streamQuery';

const mockDefs: SchemaMap = {
  StringObj: { type: 'object', properties: { foo: { type: 'string' } }, examples: [{ foo: 'bar' }] },
  NumArr: { type: 'array', items: { type: 'number' }, examples: [[7, 8, 9]] },
};

const openapi: OpenAPIV3_1.Document = await fetchSchema('http://127.0.0.1:8000/apidoc/openapi.json');
const realDefs: SchemaMap = openapi.components?.schemas as any;
const endpoints = generateEndpoints(openapi.paths!, realDefs);
const realEndpoints: Endpoint[] = Object.values(endpoints).filter(ep => ep.method !== 'DELETE');

function buildExampleArgsWithBodyExpressions(params: ParamDefinition[], responseStreaming: boolean): Record<string, any> {
  const bodyExprs: FilterExpr[] = [];
  const args: Record<string, any> = { throwOnError: false };
  if (responseStreaming) args.parseAs = 'stream';

  for (const param of params) {
    if (param.in === ParamType.Filter) {
      for (const field of (param as FilterParam).fields) {
        bodyExprs.push({
          fieldPath: field.path,
          op: 'Eq',
          value: field.examples?.[0],
        });
      }
    } else if (param.in === ParamType.Query || param.in === ParamType.Path) {
      const filterField = { path: param.name, type: 'string', examples: param.schema.examples };
      args[param.in] = args[param.in] || {};
      args[param.in][filterField.path] = filterField.examples?.[0];
    }
  }

  args.body = bodyExprs.length > 0 ? buildFilterBody(bodyExprs) : undefined;
  return args;
}

describe('Hey-API JSON client calls', () => {
  it('has endpoints to test', () => {
    expect(realEndpoints.length).toBeGreaterThan(0);
  });

  it(`execute streaming request`, async () => {
    for (const ep of Object.values(endpoints).filter(ep => ep.streaming)) {
      let args = buildExampleArgsWithBodyExpressions(ep.paramDefs!, ep.streaming);
      const { data, response, error } = await (client as any)[ep.heyClientMethodName](args);
      if (response.status !== 200) {
        console.error(`Error calling ${ep.streaming} ${ep.heyClientMethodName}(${JSON.stringify(args)})`);
        console.error('Response:', response);
        console.error('Error:', error);
      }
      expect(response.status).toBe(200);
      expect(error).toBeUndefined();
      expect(data).toBeDefined();
    }
  });

  realEndpoints.forEach(ep => {
    const exampleParams = buildExampleEndpointParams(ep.paramDefs, ep.streaming);
    for (const [title, param] of Object.entries(exampleParams)) {
      it(`${ep.heyClientMethodName}(${title}) → ${ep.method} ${ep.path}`, async () => {
        const { data, response, error } = await (client as any)[ep.heyClientMethodName](param);
        if (response.status !== 200) {
          console.error(`Error calling ${ep.streaming} ${ep.heyClientMethodName}(${JSON.stringify(param)})`);
          console.error('Response:', response);
          console.error('Error:', error);
        }

        expect(response.status).toBe(200);
        expect(error).toBeUndefined();
        expect(data).toBeDefined();
      });
    }
  });
});

describe('inlinePaths unit tests', () => {
  it('parses a GET with path param and response', () => {
    const raw: OpenAPIV3_1.PathsObject = {
      '/item/{id}': {
        get: {
          operationId: 'item_get',
          summary: 'Get item',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'xyz' }],
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StringObj' } } } },
          },
        } as any,
      },
    };
    const result = generateEndpoints(raw, mockDefs);
    expect(result).toHaveProperty('item_get');
    const ep: Endpoint = result.item_get;
    // methodName should be camelCase
    expect(ep.heyClientMethodName).toBe('itemGet');
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/item/{id}');
    // params
    expect(ep.paramDefs).toHaveLength(1);
    const p: ParamDefinition = ep.paramDefs[0];
    expect(p.name).toBe('id');
    expect(p.in).toBe('path');
    expect(p.required).toBe(true);
    expect(p.schema.examples![0]).toBe('xyz');
    // requestBody undefined
    expect(ep.paramDefs.filter(p => p.in === ParamType.Filter).length).toBe(0);
    expect(ep.paramDefs.filter(p => p.in === ParamType.Entity).length).toBe(0);
    // response schema inlined
    expect(ep.responseBodies['200']).toBeDefined();
  });

  it('parses POST with requestBody and multiple responses', () => {
    const raw: OpenAPIV3_1.PathsObject = {
      '/nums': {
        post: {
          operationId: 'nums_post',
          summary: 'Post numbers',
          requestBody: {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NumArr' }, example: [7, 8, 9] },
            },
          },
          responses: {
            '201': { content: { 'application/json': { schema: { type: 'boolean' } } } },
            '400': { description: 'Bad', content: { 'application/json': { schema: { type: 'string' } } } },
          },
        } as any,
      },
    };
    const result = generateEndpoints(raw, mockDefs);
    expect(result).toHaveProperty('nums_post');
    const ep = result.nums_post;
    expect(ep.heyClientMethodName).toBe('numsPost');
    // requestBody inlined
    expect(ep.paramDefs.filter(p => p.in === ParamType.Entity)[0].schema).toEqual(mockDefs.NumArr);
    expect(ep.paramDefs.filter(p => p.in === ParamType.Entity)[0].schema.examples![0]).toEqual([7, 8, 9]);
    // responses
    expect(ep.responseBodies['201']?.mediaType).toBe('application/json');
    expect(ep.responseBodies['400']?.mediaType).toBe('application/json');
  });

  it('handles endpoints with no parameters or body', () => {
    const raw: OpenAPIV3_1.PathsObject = {
      '/simple': {
        delete: {
          operationId: 'simple_delete',
          summary: 'Delete simple',
          responses: { '204': { description: 'No Content' } },
        } as any,
      },
    };
    const result = generateEndpoints(raw, mockDefs);
    const ep = result.simple_delete;
    expect(ep.paramDefs).toHaveLength(0);
    expect(ep.paramDefs.filter(p => p.in === ParamType.Entity).length).toBe(0);
    expect(ep.paramDefs.filter(p => p.in === ParamType.Filter).length).toBe(0);
    // 204 with no content => no responseSchemas entry
    expect(ep.responseBodies['204']).toBeUndefined();
  });
});

describe('inlinePaths with real OpenAPI schema', () => {
  it('parses at least one endpoint', () => {
    expect(Object.keys(endpoints).length).toBeGreaterThan(0);
  });

  it('includes GET /block/id/{id} with correct response schemas', () => {
    const ep = Object.values(endpoints).find(e => e.path === '/block/id/{id}' && e.method === 'GET');
    expect(ep).toBeDefined();
    expect(ep?.responseBodies['200']).toBeDefined();
    // either 404 or 500 should exist
    expect(ep?.responseBodies['500'] || ep?.responseBodies['404']).toBeDefined();
  });

  it('includes POST /asset with query params', () => {
    const ep = Object.values(endpoints).find(e => e.path === '/asset' && e.method === 'GET');
    // asset_limit operation
    expect(ep).toBeDefined();
    // should have multiple query params
    expect(ep?.paramDefs.some(p => p.in === 'query')).toBe(true);
  });
});
