import { z } from 'zod';

import { JsonPointerSchema } from './agent-task.js';
import {
  CapacityClassSchema,
  ExecutorTypeSchema,
  JobPrioritySchema,
  MAX_REQUIRED_ACCEPTED_RUNS,
} from './job-management.js';
import { WorkstreamIdSchema } from './identifiers.js';
import { JsonValueSchema } from './workflow-data.js';

export const MAX_GENERATION_SOURCE_ID_LENGTH = 256;
export const MAX_GENERATION_SOURCE_ITEM_KEY_LENGTH = 512;
export const MAX_GENERATION_MAPPING_ASSIGNMENTS = 64;
export const MAX_GENERATION_INPUT_BATCH_SIZE = 100;

export const GenerationSourceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_GENERATION_SOURCE_ID_LENGTH);
export type GenerationSourceId = z.infer<typeof GenerationSourceIdSchema>;

export const GenerationSourceItemKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_GENERATION_SOURCE_ITEM_KEY_LENGTH);
export type GenerationSourceItemKey = z.infer<
  typeof GenerationSourceItemKeySchema
>;

export const GenerationInputSourceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('dataset'),
      sourceId: GenerationSourceIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('upstream_workstream'),
      upstreamWorkstreamId: WorkstreamIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('external'),
      sourceId: GenerationSourceIdSchema,
    })
    .strict(),
]);
export type GenerationInputSource = z.infer<typeof GenerationInputSourceSchema>;

const MappingLiteralSchema = z.string().trim().min(1).max(280);

export const GenerationTextMappingSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('literal'),
      value: MappingLiteralSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('source_pointer'),
      sourcePointer: JsonPointerSchema,
    })
    .strict(),
]);
export type GenerationTextMapping = z.infer<typeof GenerationTextMappingSchema>;

export const GenerationJobTitleMappingSchema =
  GenerationTextMappingSchema.superRefine((value, context) => {
    if (value.type === 'literal' && value.value.length < 2) {
      context.addIssue({
        code: 'too_small',
        minimum: 2,
        origin: 'string',
        inclusive: true,
        path: ['value'],
        message: 'A generated job title must contain at least two characters.',
      });
    }
  });
export type GenerationJobTitleMapping = z.infer<
  typeof GenerationJobTitleMappingSchema
>;

const UnsafeObjectKeySegments = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const SafeTargetPointerSchema = JsonPointerSchema.superRefine(
  (pointer, context) => {
    const segments = pointer === '' ? [] : pointer.slice(1).split('/');
    for (const [index, encodedSegment] of segments.entries()) {
      const segment = encodedSegment
        .replaceAll('~1', '/')
        .replaceAll('~0', '~');
      if (UnsafeObjectKeySegments.has(segment)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Target pointers cannot address unsafe object keys.',
        });
      }
    }
  },
);

export const GenerationPointerMappingAssignmentSchema = z
  .object({
    sourcePointer: JsonPointerSchema,
    targetPointer: SafeTargetPointerSchema,
  })
  .strict();
export type GenerationPointerMappingAssignment = z.infer<
  typeof GenerationPointerMappingAssignmentSchema
>;

export const GenerationJsonMappingSchema = z
  .object({
    base: JsonValueSchema,
    assignments: z
      .array(GenerationPointerMappingAssignmentSchema)
      .max(MAX_GENERATION_MAPPING_ASSIGNMENTS)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const seenTargets = new Set<string>();
    value.assignments.forEach((assignment, index) => {
      if (seenTargets.has(assignment.targetPointer)) {
        context.addIssue({
          code: 'custom',
          path: ['assignments', index, 'targetPointer'],
          message: 'Each target pointer may be assigned at most once.',
        });
      }
      seenTargets.add(assignment.targetPointer);
    });
  });
export type GenerationJsonMapping = z.infer<typeof GenerationJsonMappingSchema>;

export const GenerationJobMappingSchema = z
  .object({
    title: GenerationJobTitleMappingSchema,
    summary: GenerationTextMappingSchema.optional(),
    input: GenerationJsonMappingSchema,
    validationParameters: GenerationJsonMappingSchema.optional(),
    requiredAcceptedRuns: z
      .number()
      .int()
      .min(1)
      .max(MAX_REQUIRED_ACCEPTED_RUNS),
    priority: JobPrioritySchema.default('medium'),
    estimatedDurationMinutes: z.number().int().positive().default(10),
    capacityClass: CapacityClassSchema.default('small'),
    supportedExecutorTypes: z
      .array(ExecutorTypeSchema)
      .min(1)
      .max(3)
      .default(['desktop_node', 'plugin_host']),
    requiresPersistentRunner: z.boolean().default(false),
    requiresCheckpointRecovery: z.boolean().default(false),
  })
  .strict();
export type GenerationJobMapping = z.infer<typeof GenerationJobMappingSchema>;

export const InputDrivenInventoryPolicySchema = z
  .object({
    type: z.literal('input_driven'),
    source: GenerationInputSourceSchema,
    mapping: GenerationJobMappingSchema,
  })
  .strict();
export type InputDrivenInventoryPolicy = z.infer<
  typeof InputDrivenInventoryPolicySchema
>;

export const GenerationInputStatusSchema = z.enum([
  'ready',
  'materialized',
  'skipped',
  'failed',
]);
export type GenerationInputStatus = z.infer<typeof GenerationInputStatusSchema>;

export const GenerationInputIntakeStateSchema = z.enum(['open', 'closed']);
export type GenerationInputIntakeState = z.infer<
  typeof GenerationInputIntakeStateSchema
>;

export const GenerationInputIntakeSchema = z
  .object({
    state: GenerationInputIntakeStateSchema.default('open'),
  })
  .strict();
export type GenerationInputIntake = z.infer<typeof GenerationInputIntakeSchema>;

export const GenerationInputBatchOptionsSchema = z
  .object({
    closeAfterBatch: z.boolean().default(false),
  })
  .strict();
export type GenerationInputBatchOptions = z.infer<
  typeof GenerationInputBatchOptionsSchema
>;

export const GenerationInputSourceSyncStatusSchema = z.enum([
  'not_started',
  'running',
  'succeeded',
  'failed',
]);
export type GenerationInputSourceSyncStatus = z.infer<
  typeof GenerationInputSourceSyncStatusSchema
>;

export const GenerationInputSourceSyncSchema = z
  .object({
    status: GenerationInputSourceSyncStatusSchema.default('not_started'),
    cursor: z.string().trim().max(2_048).optional(),
    errorCode: z.string().trim().min(1).max(128).optional(),
    errorMessage: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type GenerationInputSourceSync = z.infer<
  typeof GenerationInputSourceSyncSchema
>;

const InventoryCountSchema = z.number().int().nonnegative();

export const GenerationInputInventoryCountsSchema = z
  .object({
    ready: InventoryCountSchema,
    materialized: InventoryCountSchema,
    skipped: InventoryCountSchema,
    failed: InventoryCountSchema,
    total: InventoryCountSchema.optional(),
  })
  .strict();
export type GenerationInputInventoryCounts = z.infer<
  typeof GenerationInputInventoryCountsSchema
>;

export const GenerationInputBatchItemSchema = z
  .object({
    sourceItemKey: GenerationSourceItemKeySchema,
    payload: JsonValueSchema,
    provenance: JsonValueSchema.optional(),
  })
  .strict();
export type GenerationInputBatchItem = z.infer<
  typeof GenerationInputBatchItemSchema
>;

export const GenerationInputBatchSchema = z
  .object({
    requestId: z.string().trim().min(1).max(256),
    sourceId: GenerationSourceIdSchema,
    items: z
      .array(GenerationInputBatchItemSchema)
      .min(1)
      .max(MAX_GENERATION_INPUT_BATCH_SIZE),
    closeAfterBatch: z.boolean().default(false),
  })
  .strict();
export type GenerationInputBatch = z.infer<typeof GenerationInputBatchSchema>;
