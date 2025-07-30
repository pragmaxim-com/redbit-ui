import type { OpenAPIV3_1 } from 'openapi-types';
import { HttpMethod, inlineSchemaWithExample, METHODS, SchemaMap } from './schema';
import { extractBodyFilterFields } from './streamQuery';

interface ResponseBody {
  schema: OpenAPIV3_1.SchemaObject;
  mediaType: string;
  streaming: boolean;
}

export interface FilterField {
  path: string; // e.g. "utxos[].amount"
  type: string; // JSON type: 'string' | 'integer' | …
  examples?: any[];
}

// discriminate on ParamType
export enum ParamType {
  Path = 'path',
  Query = 'query',
  Entity = 'entity', // POST/PUT body as a whole
  Filter = 'filter', // our special filtering body
}

export type ParamName = string; // for convenience, just a string
export type PathParam = {
  in: ParamType.Path;
  name: ParamName;
  required: true; // path params are always required
  schema: OpenAPIV3_1.SchemaObject; // scalar type
};

export type QueryParam = {
  in: ParamType.Query;
  name: ParamName;
  required: boolean;
  schema: OpenAPIV3_1.SchemaObject; // scalar type
};

export type EntityParam = {
  in: ParamType.Entity;
  name: ParamName;
  required: boolean;
  schema: OpenAPIV3_1.SchemaObject; // arbitrary JSON object
};

export type FilterParam = {
  in: ParamType.Filter;
  name: ParamName;
  required: boolean; // if false, this entire filter body is optional
  fields: FilterField[]; // all of these are either required or optional together
  schema: OpenAPIV3_1.SchemaObject;
};

// the full ParamDefinition is now a discriminated union:
export type ParamDefinition = PathParam | QueryParam | EntityParam | FilterParam;

// Endpoint just holds those:
export interface Endpoint {
  operationId: string;
  heyClientMethodName: string;
  title: string;
  method: HttpMethod;
  path: string;
  paramDefs: ParamDefinition[];
  responseBodies: Record<string, ResponseBody | undefined>;
  streaming: boolean;
  tags: string[];
}

export type EndpointMap = Record<string, Endpoint>;

function toHttpMethod(raw: string): HttpMethod {
  const upper = raw.toUpperCase();
  if (METHODS.includes(upper as HttpMethod)) {
    return upper as HttpMethod;
  }
  throw new Error(`Unsupported HTTP method: ${raw}`);
}

export type PathQueryParamValues = [ParamType, ParamName, string];
export function buildFullRequest(streaming: boolean, pathQueryParams: PathQueryParamValues[], body: any | undefined): Record<string, any> {
  const args: any = { throwOnError: false };
  if (streaming) args.parseAs = 'stream';
  pathQueryParams.forEach(([pin, pname, pvalue]) => {
    args[pin] = args[pin] || {};
    args[pin][pname] = pvalue;
  });
  if (body) args.body = body;
  return args;
}

function buildResponseBody(r: OpenAPIV3_1.ResponseObject, defs: SchemaMap): ResponseBody {
  const content = r.content as Record<string, any>;
  if (!content) throw new Error('Response body must have content defined');
  const keys = Object.keys(content);
  const jsonKey = keys.find(k => /json$/i.test(k));
  const mediaType = jsonKey || keys[0];
  const entry = content[mediaType];
  const schema = inlineSchemaWithExample(entry.schema, defs, entry.example);
  const streaming = /ndjson$/i.test(mediaType);
  return { mediaType, schema, streaming };
}

function buildRequestBodyParamDef(r: OpenAPIV3_1.RequestBodyObject, querying: boolean, defs: SchemaMap): ParamDefinition {
  const content = r.content as Record<string, any>;
  const required = Boolean(r.required);
  if (!content) throw new Error('Request body must have content defined');
  const keys = Object.keys(content);
  const jsonKey = keys.find(k => /json$/i.test(k));
  const mediaType = jsonKey || keys[0];
  const entry = content[mediaType];
  const schema = inlineSchemaWithExample(entry.schema, defs, entry.example);
  if (querying) {
    const fields: FilterField[] = extractBodyFilterFields(schema);
    return { name: mediaType, in: ParamType.Filter, fields, required, schema } as FilterParam;
  } else {
    return { name: mediaType, in: ParamType.Entity, required, schema } as EntityParam;
  }
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function buildQueryOrPathParamDef(param: OpenAPIV3_1.ParameterObject, defs: SchemaMap): ParamDefinition {
  const schema = inlineSchemaWithExample(param.schema!, defs, param.example);
  const required = Boolean(param.required);
  if (param.in === 'path') {
    return { name: param.name, in: ParamType.Path, required, schema } as PathParam;
  } else if (param.in === 'query') {
    return { name: param.name, in: ParamType.Query, required, schema } as QueryParam;
  } else {
    throw new Error(`Unsupported parameter location: ${param.in}`);
  }
}

function buildResponses(responses: OpenAPIV3_1.ResponsesObject | undefined, defs: SchemaMap) {
  const responseBodies: Record<string, ResponseBody | undefined> = {};
  for (const [code, resp] of Object.entries(responses || {})) {
    const r = resp as OpenAPIV3_1.ResponseObject;
    responseBodies[code] = r.content ? buildResponseBody(r, defs) : undefined;
  }
  return responseBodies;
}

export function buildExampleEndpointParams(paramDefs: ParamDefinition[], responseStreaming: boolean): Record<string, Record<string, any>> {
  const required = paramDefs.filter(p => p.required);
  const optional = paramDefs.filter(p => !p.required);
  type Variant = { title: string; params: ParamDefinition[] };
  const variants: Variant[] = [{ title: 'all', params: [...required, ...optional] }, ...optional.map(p => ({ title: p.name, params: [...required, p] }))];

  const argsMap: Record<string, Record<string, any>> = {};

  for (const variant of variants) {
    const { title, params } = variant;
    // Build arrays of examples for each parameter
    const exampleSets: any[][] = params.map(p => p.schema.examples ?? [undefined]);
    // Compute Cartesian product of these example sets
    let combos: any[][] = [[]];
    for (const examples of exampleSets) {
      combos = combos.flatMap(prev => examples.map((ex: any) => [...prev, ex]));
    }

    combos.forEach((combo: any[], comboIdx: number) => {
      const body: any | undefined = combo.find((ex: any, idx: number) => {
        const p = params[idx];
        return p.in === ParamType.Entity || p.in === ParamType.Filter
      });
      const paramValues: PathQueryParamValues[] =
        combo.filter((ex: any, idx: number) => {
          const p = params[idx];
          return p.in === ParamType.Path || p.in === ParamType.Query;
        }).map((ex: any, idx: number) => {
          const p = params[idx];
          return [p.in, p.name, ex];
        });

      const args: Record<string, any> = buildFullRequest(responseStreaming, paramValues, body);
      const key = combos.length > 1 ? `${title}-${comboIdx}` : title;
      argsMap[key] = args;
    });
  }

  return argsMap;
}

export function extractParamsAndFilterFields(endpoint: Endpoint) {
  const pathQueryParams: ParamDefinition[] = [];
  const filterFields: FilterField[] = [];
  for (const p of endpoint.paramDefs) {
    if (p.in === ParamType.Path || p.in === ParamType.Query) {
      pathQueryParams.push(p);
    } else if (p.in === ParamType.Filter) {
      for (const f of (p as FilterParam).fields) {
        filterFields.push(f);
      }
    }
  }
  return { pathQueryParams, filterFields };
}

function buildEndpoint(path: string, method: HttpMethod, op: OpenAPIV3_1.OperationObject, defs: SchemaMap): Endpoint {
  const operationId = op.operationId!;
  const heyClientMethodName = toCamel(operationId);
  const title = op.summary || op.description || operationId;
  const tags = op.tags || [];
  const queryOrPathParams = (op.parameters as OpenAPIV3_1.ParameterObject[]) || [];
  const queryOrPathParamDefs = queryOrPathParams.map(p => buildQueryOrPathParamDef(p, defs));

  const responseBodies = buildResponses(op.responses, defs);
  const streaming = responseBodies['200']?.streaming || false;
  const querying = streaming || method === 'GET';
  if (method !== 'POST' && op.requestBody) {
    throw new Error(`Operation ${operationId} with method ${method} cannot have a requestBody defined`);
  }
  const requestBodyParam = op.requestBody ? buildRequestBodyParamDef(op.requestBody as OpenAPIV3_1.RequestBodyObject, querying, defs) : undefined;
  const paramDefs = requestBodyParam ? [...queryOrPathParamDefs, requestBodyParam] : queryOrPathParamDefs;

  return {
    operationId,
    heyClientMethodName,
    title,
    method,
    path,
    paramDefs,
    responseBodies,
    streaming,
    tags,
  };
}

export function generateEndpoints(raw: OpenAPIV3_1.PathsObject, defs: SchemaMap): EndpointMap {
  const map: EndpointMap = {};
  for (const [path, pathItem] of Object.entries(raw)) {
    if (!pathItem) continue;
    Object.entries(pathItem).forEach(([method, opObj]) => {
      const ep = buildEndpoint(path, toHttpMethod(method), opObj as OpenAPIV3_1.OperationObject, defs);
      map[ep.operationId] = ep;
    });
  }
  return map;
}
