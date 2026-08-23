import { Validator, type Schema } from '@cfworker/json-schema';
import {
  JSON_SCHEMA_DIALECT_2020_12,
  AgentTaskDefinitionSchema,
  JsonValueSchema,
  WorkflowValidationDefinitionSchema,
  type AgentTaskDefinition,
  type JsonValue,
  type WorkflowDataValidationIssue,
  type WorkflowDataValidationResult,
  type WorkflowSchemaDescriptor,
  type WorkflowValidationDefinition,
} from '@causaic/protocol';

export const MAX_SCHEMA_BYTES = 64 * 1024;
export const MAX_SCHEMA_DEPTH = 12;
export const MAX_SCHEMA_NODES = 2_000;
export const MAX_SCHEMA_REFERENCES = 128;
export const MAX_COMPOSITION_BRANCHES = 32;
export const MAX_DATA_BYTES = 256 * 1024;
export const MAX_DATA_DEPTH = 12;
export const MAX_VALIDATION_ISSUES = 20;

const allowedFormats = new Set([
  'date',
  'date-time',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'time',
  'uri',
  'uuid',
]);
const allowedKeywords = new Set([
  '$schema',
  '$defs',
  '$ref',
  'title',
  'description',
  'examples',
  'type',
  'enum',
  'const',
  'properties',
  'required',
  'additionalProperties',
  'minProperties',
  'maxProperties',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'format',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
]);

export class WorkflowSchemaError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'WorkflowSchemaError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function assertConvexKey(key: string): void {
  if (key.length === 0 || key.startsWith('$') || key.startsWith('_'))
    throw new WorkflowSchemaError(
      `JSON object key ${JSON.stringify(key)} is not supported by Convex`,
    );
}

function inspectJsonValue(
  value: unknown,
  options: { readonly convexKeys: boolean },
  depth = 0,
): void {
  if (depth > MAX_DATA_DEPTH)
    throw new WorkflowSchemaError(
      `JSON value exceeds the maximum depth of ${MAX_DATA_DEPTH}`,
    );
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new WorkflowSchemaError('JSON numbers must be finite');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 8_192)
      throw new WorkflowSchemaError(
        'JSON arrays may contain at most 8192 values',
      );
    for (const item of value) inspectJsonValue(item, options, depth + 1);
    return;
  }
  if (!isPlainObject(value))
    throw new WorkflowSchemaError('Value must contain JSON-compatible data');
  const entries = Object.entries(value);
  if (entries.length > 1_024)
    throw new WorkflowSchemaError(
      'JSON objects may contain at most 1024 fields',
    );
  for (const [key, item] of entries) {
    if (options.convexKeys) assertConvexKey(key);
    inspectJsonValue(item, options, depth + 1);
  }
}

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    const items: readonly JsonValue[] = value;
    return `[${items.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parseJsonValue(
  value: unknown,
  options: { readonly convexKeys?: boolean } = {},
): JsonValue {
  inspectJsonValue(value, { convexKeys: options.convexKeys ?? true });
  const parsed = JsonValueSchema.parse(value);
  const encoded = canonicalJson(parsed);
  if (new TextEncoder().encode(encoded).byteLength > MAX_DATA_BYTES)
    throw new WorkflowSchemaError(
      `JSON value exceeds the maximum size of ${MAX_DATA_BYTES} bytes`,
    );
  return parsed;
}

export async function sha256Json(
  value: JsonValue,
): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(value)),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

export async function workflowDefinitionHash(input: {
  readonly execution: AgentTaskDefinition;
  readonly inputSchema: WorkflowSchemaDescriptor;
  readonly outputSchema: WorkflowSchemaDescriptor;
  readonly validation?: WorkflowValidationDefinition;
}): Promise<`sha256:${string}`> {
  const execution = AgentTaskDefinitionSchema.parse(input.execution);
  const validation =
    input.validation === undefined
      ? null
      : WorkflowValidationDefinitionSchema.parse(input.validation);
  const serialized = JSON.parse(
    JSON.stringify({
      execution,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      validation,
    }),
  ) as unknown;
  return sha256Json(parseJsonValue(serialized, { convexKeys: false }));
}

function decodePointerToken(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveLocalReference(
  root: Record<string, unknown>,
  reference: string,
) {
  if (!reference.startsWith('#/')) return reference === '#' ? root : undefined;
  let current: unknown = root;
  for (const token of reference.slice(2).split('/').map(decodePointerToken)) {
    if (!isPlainObject(current) || !(token in current)) return undefined;
    current = current[token];
  }
  return current;
}

function inspectSchemaNode(
  node: unknown,
  state: { nodes: number; references: string[] },
  depth: number,
): void {
  if (!isPlainObject(node))
    throw new WorkflowSchemaError('Every schema node must be an object');
  state.nodes += 1;
  if (state.nodes > MAX_SCHEMA_NODES)
    throw new WorkflowSchemaError(
      `Schema exceeds the maximum of ${MAX_SCHEMA_NODES} nodes`,
    );
  if (depth > MAX_SCHEMA_DEPTH)
    throw new WorkflowSchemaError(
      `Schema exceeds the maximum depth of ${MAX_SCHEMA_DEPTH}`,
    );
  for (const keyword of Object.keys(node)) {
    if (!allowedKeywords.has(keyword))
      throw new WorkflowSchemaError(
        `Unsupported JSON Schema keyword: ${keyword}`,
      );
  }
  if (node.format !== undefined) {
    if (typeof node.format !== 'string' || !allowedFormats.has(node.format))
      throw new WorkflowSchemaError('Unsupported JSON Schema format');
  }
  if (node.$ref !== undefined) {
    if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#'))
      throw new WorkflowSchemaError(
        'Only local fragment $ref values are supported',
      );
    state.references.push(node.$ref);
    if (state.references.length > MAX_SCHEMA_REFERENCES)
      throw new WorkflowSchemaError(
        `Schema exceeds the maximum of ${MAX_SCHEMA_REFERENCES} references`,
      );
  }
  for (const mapKeyword of ['$defs', 'properties'] as const) {
    const value = node[mapKeyword];
    if (value === undefined) continue;
    if (!isPlainObject(value))
      throw new WorkflowSchemaError(`${mapKeyword} must be an object`);
    for (const child of Object.values(value))
      inspectSchemaNode(child, state, depth + 1);
  }
  for (const arrayKeyword of [
    'prefixItems',
    'allOf',
    'anyOf',
    'oneOf',
  ] as const) {
    const value = node[arrayKeyword];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length > MAX_COMPOSITION_BRANCHES)
      throw new WorkflowSchemaError(
        `${arrayKeyword} must contain at most ${MAX_COMPOSITION_BRANCHES} schemas`,
      );
    for (const child of value) inspectSchemaNode(child, state, depth + 1);
  }
  for (const childKeyword of [
    'items',
    'additionalProperties',
    'not',
  ] as const) {
    const child = node[childKeyword];
    if (child === undefined || typeof child === 'boolean') continue;
    inspectSchemaNode(child, state, depth + 1);
  }
}

function assertAcyclicReferences(
  root: Record<string, unknown>,
  references: string[],
) {
  const visit = (reference: string, stack: Set<string>): void => {
    if (stack.has(reference))
      throw new WorkflowSchemaError(
        `Cyclic JSON Schema reference: ${reference}`,
      );
    const target = resolveLocalReference(root, reference);
    if (!isPlainObject(target))
      throw new WorkflowSchemaError(
        `Unresolved JSON Schema reference: ${reference}`,
      );
    const next = target.$ref;
    if (typeof next === 'string') visit(next, new Set([...stack, reference]));
  };
  for (const reference of references) visit(reference, new Set());
}

export function parseWorkflowSchemaDocument(value: unknown): JsonValue {
  inspectJsonValue(value, { convexKeys: false });
  if (!isPlainObject(value))
    throw new WorkflowSchemaError('A JSON Schema document must be an object');
  if (value.$schema !== JSON_SCHEMA_DIALECT_2020_12)
    throw new WorkflowSchemaError(
      `Schema must declare ${JSON_SCHEMA_DIALECT_2020_12}`,
    );
  const state = { nodes: 0, references: [] as string[] };
  inspectSchemaNode(value, state, 0);
  assertAcyclicReferences(value, state.references);
  const parsed = JsonValueSchema.parse(value);
  const canonical = canonicalJson(parsed);
  if (new TextEncoder().encode(canonical).byteLength > MAX_SCHEMA_BYTES)
    throw new WorkflowSchemaError(
      `Schema exceeds the maximum size of ${MAX_SCHEMA_BYTES} bytes`,
    );
  // Construction verifies that the supported validator accepts the document.
  new Validator(parsed as Schema, '2020-12', false);
  return parsed;
}

const validatorCache = new Map<string, Validator>();

export function createWorkflowDataValidator(
  schema: JsonValue,
  schemaHash: string,
): (value: unknown) => WorkflowDataValidationResult {
  let validator = validatorCache.get(schemaHash);
  if (validator === undefined) {
    validator = new Validator(schema as Schema, '2020-12', false);
    if (validatorCache.size >= 50) {
      const oldest = validatorCache.keys().next();
      if (!oldest.done) validatorCache.delete(oldest.value);
    }
    validatorCache.set(schemaHash, validator);
  }
  return (value) => {
    try {
      parseJsonValue(value);
    } catch (error) {
      return {
        valid: false,
        issues: [
          {
            instancePath: '',
            keyword: 'jsonValue',
            message:
              error instanceof Error ? error.message : 'Invalid JSON value',
          },
        ],
      };
    }
    const result = validator.validate(value);
    if (result.valid) return { valid: true };
    const issues: WorkflowDataValidationIssue[] = result.errors
      .map((error) => ({
        instancePath:
          error.instanceLocation === '#'
            ? ''
            : error.instanceLocation.replace(/^#/, ''),
        schemaPath: error.keywordLocation.replace(/^#/, ''),
        keyword: error.keyword.split('/').at(-1) ?? error.keyword,
        message: error.error,
      }))
      .sort((left, right) =>
        `${left.instancePath}|${left.schemaPath}|${left.keyword}|${left.message}`.localeCompare(
          `${right.instancePath}|${right.schemaPath}|${right.keyword}|${right.message}`,
        ),
      )
      .slice(0, MAX_VALIDATION_ISSUES);
    return { valid: false, issues };
  };
}

export function parseStoredSchema(documentJson: string): JsonValue {
  let value: unknown;
  try {
    value = JSON.parse(documentJson) as unknown;
  } catch {
    throw new WorkflowSchemaError('Stored workflow schema is not valid JSON');
  }
  return parseWorkflowSchemaDocument(value);
}
