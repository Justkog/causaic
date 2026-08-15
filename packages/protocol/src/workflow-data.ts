import { z } from 'zod';

import { WorkflowSchemaIdSchema } from './identifiers.js';

export const JSON_SCHEMA_DIALECT_2020_12 =
  'https://json-schema.org/draft/2020-12/schema' as const;
export const JsonSchemaDialectSchema = z.literal(JSON_SCHEMA_DIALECT_2020_12);

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const WorkflowSchemaDescriptorSchema = z
  .object({
    id: WorkflowSchemaIdSchema,
    dialect: JsonSchemaDialectSchema,
    hash: Sha256Schema,
    summary: z.string().trim().min(1).max(280),
  })
  .strict();
export type WorkflowSchemaDescriptor = z.infer<
  typeof WorkflowSchemaDescriptorSchema
>;

export const WorkflowSchemaDocumentSchema = z
  .object({
    descriptor: WorkflowSchemaDescriptorSchema,
    documentJson: z.string().min(1),
  })
  .strict();
export type WorkflowSchemaDocument = z.infer<
  typeof WorkflowSchemaDocumentSchema
>;

export const WorkflowDataValidationIssueSchema = z
  .object({
    instancePath: z.string(),
    schemaPath: z.string().optional(),
    keyword: z.string().optional(),
    message: z.string(),
  })
  .strict();
export type WorkflowDataValidationIssue = z.infer<
  typeof WorkflowDataValidationIssueSchema
>;

export const WorkflowDataValidationResultSchema = z.discriminatedUnion(
  'valid',
  [
    z.object({ valid: z.literal(true) }).strict(),
    z
      .object({
        valid: z.literal(false),
        issues: z.array(WorkflowDataValidationIssueSchema).max(20),
      })
      .strict(),
  ],
);
export type WorkflowDataValidationResult = z.infer<
  typeof WorkflowDataValidationResultSchema
>;
