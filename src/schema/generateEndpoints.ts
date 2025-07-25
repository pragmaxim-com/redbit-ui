import type { OpenAPIV3_1 } from 'openapi-types';
import { inlineSchemaWithExample, SchemaMap } from './schema';
import { extractFilterFields } from './streamQuery';

export type InlinedSchema = OpenAPIV3_1.SchemaObject;

const METHODS: readonly HttpMethod[] = ['GET','POST','HEAD','DELETE'];

type HttpMethod = 'GET' | 'POST' | 'HEAD' | 'DELETE';

interface ResponseBody {
  schema: InlinedSchema;
  mediaType: string;
  streaming: boolean;
}

export interface FilterField {
  path: string;
  type: string;
  examples?: any[];
}

export interface ParamDefinition {
  name: string;
  in: 'path' | 'query' | 'body';
  required: boolean;
  filterFields?: FilterField[];
  schema: InlinedSchema;
}

export interface Endpoint {
  operationId: string;
  heyClientMethodName: string;
  title: string;
  method: HttpMethod;
  path: string;
  paramDefs: ParamDefinition[];
  responseBodies: Record<string, ResponseBody | undefined>;
  querying: boolean;
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

function buildResponseBody(r: OpenAPIV3_1.ResponseObject, defs: SchemaMap): ResponseBody {
  const content = r.content as Record<string, any>;
  if (!content) throw new Error('Response body must have content defined');
  const keys = Object.keys(content);
  const jsonKey = keys.find(k => /json$/i.test(k));
  const mediaType = jsonKey || keys[0];
  const entry = content[mediaType];
  const schema = inlineSchemaWithExample(entry.schema, defs, entry.example) as InlinedSchema;
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
  const schema = inlineSchemaWithExample(entry.schema, defs, entry.example) as InlinedSchema;
  const filterFields: FilterField[] | undefined = querying ? extractFilterFields(schema) : undefined;
  return { name: mediaType, in: 'body', filterFields, required, schema };
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function buildQueryOrPathParamDef(param: OpenAPIV3_1.ParameterObject, defs: SchemaMap): ParamDefinition {
  const schema = inlineSchemaWithExample(param.schema!, defs, param.example) as InlinedSchema;
  const filterFields = [{path: param.name, type: "string", examples: schema.examples}];
  return {
    name: param.name,
    in: param.in as any,
    required: Boolean(param.required),
    filterFields,
    schema,
  };
}

function buildResponses(responses: OpenAPIV3_1.ResponsesObject | undefined, defs: SchemaMap) {
  const responseBodies: Record<string, ResponseBody | undefined> = {};
  for (const [code, resp] of Object.entries(responses || {})) {
    const r = resp as OpenAPIV3_1.ResponseObject;
    responseBodies[code] = r.content ? buildResponseBody(r, defs) : undefined;
  }
  return responseBodies;
}

export function buildExampleEndpointParams(
  paramDefs: ParamDefinition[],
  responseStreaming: boolean
): Record<string, Record<string, any>> {
  const required = paramDefs.filter(p => p.required);
  const optional = paramDefs.filter(p => !p.required);
  type Variant = { title: string; params: ParamDefinition[] };
  const variants: Variant[] = [
    { title: 'all', params: [...required, ...optional] },
    ...optional.map(p => ({ title: p.name, params: [...required, p] })),
  ];

  const argsMap: Record<string, Record<string, any>> = {};

  for (const variant of variants) {
    const { title, params } = variant;
    // Build arrays of examples for each parameter
    const exampleSets: any[][] = params.map(p => p.schema.examples ?? [undefined]);
    // Compute Cartesian product of these example sets
    let combos: any[][] = [[]];
    for (const examples of exampleSets) {
      combos = combos.flatMap(prev =>
        examples.map((ex: any) => [...prev, ex])
      );
    }

    combos.forEach((combo: any[], comboIdx: number) => {
      const args: Record<string, any> = { throwOnError: false };
      if (responseStreaming) args.parseAs = 'stream';
      combo.forEach((ex: any, idx: number) => {
        const p = params[idx];
        if (p.in === 'body') {
          args.body = ex;
        } else {
          args[p.in] = args[p.in] || {};
          args[p.in][p.name] = ex;
        }
      });
      const key = combos.length > 1 ? `${title}-${comboIdx}` : title;
      argsMap[key] = args;
    });
  }

  return argsMap;
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
    querying,
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
