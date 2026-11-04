import { describe, expect, it } from 'vitest';

import {
  GenerationInputBatchSchema,
  GenerationInputJobLimitSchema,
  GenerationInputIntakeSchema,
  GenerationInputInventoryCountsSchema,
  GenerationInputSourceSchema,
  GenerationInputSourceSyncSchema,
  GenerationJobMappingSchema,
  GenerationJsonMappingSchema,
  InputDrivenInventoryPolicySchema,
  MAX_GENERATION_MAPPING_ASSIGNMENTS,
  MAX_GENERATION_SOURCE_ID_LENGTH,
} from './generation-inputs.js';
import { validInputDrivenInventoryPolicyFixture } from './fixtures.js';
import {
  WorkstreamCompletionPolicySchema,
  WorkstreamInventoryPolicySchema,
  WorkstreamProfileInputSchema,
} from './campaign-workstreams.js';

describe('input-driven workstream contracts', () => {
  it('validates workstream defaults and per-item overrides without requiring them on legacy callers', () => {
    for (const value of [0, -1, 1.5, 10_001, Infinity, NaN])
      expect(GenerationInputJobLimitSchema.safeParse(value).success).toBe(
        false,
      );
    for (const value of [1, 10_000])
      expect(GenerationInputJobLimitSchema.safeParse(value).success).toBe(true);
    expect(
      InputDrivenInventoryPolicySchema.parse({
        ...validInputDrivenInventoryPolicyFixture,
        maxJobsPerInput: 3,
      }).maxJobsPerInput,
    ).toBe(3);
    expect(
      GenerationInputBatchSchema.parse({
        requestId: 'limits',
        sourceId: 'source',
        items: [
          { sourceItemKey: 'one', payload: {}, maxJobs: 5 },
          { sourceItemKey: 'two', payload: {} },
        ],
      }).items.map((item) => item.maxJobs),
    ).toEqual([5, undefined]);
  });

  it('accepts all supported input source families', () => {
    const sources = [
      { type: 'dataset', sourceId: 'dataset_fixture' },
      {
        type: 'upstream_workstream',
        upstreamWorkstreamId: 'workstream_upstream_fixture',
      },
      { type: 'external', sourceId: 'external_fixture' },
    ] as const;

    for (const source of sources) {
      expect(GenerationInputSourceSchema.safeParse(source).success).toBe(true);
    }
  });

  it('accepts a mapped input-driven policy and applies job defaults', () => {
    const parsed = InputDrivenInventoryPolicySchema.parse(
      validInputDrivenInventoryPolicyFixture,
    );

    expect(parsed.mapping).toMatchObject({
      estimatedDurationMinutes: 10,
      capacityClass: 'small',
      supportedExecutorTypes: ['desktop_node', 'plugin_host'],
      requiresPersistentRunner: false,
      requiresCheckpointRecovery: false,
    });
    expect(WorkstreamInventoryPolicySchema.safeParse(parsed).success).toBe(
      true,
    );
    expect(
      WorkstreamCompletionPolicySchema.safeParse({
        type: 'all_opportunities_completed',
      }).success,
    ).toBe(true);
  });

  it('requires source and mapping only for input-driven inventory', () => {
    const profile = {
      name: 'Input work',
      description: 'Generate contributions from source records.',
      required: true,
      workflowVersionId: 'workflow_version_fixture',
      availabilityPolicy: { type: 'manual' },
      inventoryPolicy: validInputDrivenInventoryPolicyFixture,
      participationPolicy: {},
      completionPolicy: { type: 'all_opportunities_completed' },
    } as const;
    expect(WorkstreamProfileInputSchema.safeParse(profile).success).toBe(true);

    expect(
      WorkstreamInventoryPolicySchema.safeParse({
        type: 'manual_jobs',
        source: validInputDrivenInventoryPolicyFixture.source,
        mapping: validInputDrivenInventoryPolicyFixture.mapping,
      }).success,
    ).toBe(false);
    expect(
      WorkstreamProfileInputSchema.safeParse({
        ...profile,
        inventoryPolicy: { type: 'manual_jobs' },
      }).success,
    ).toBe(false);
    expect(
      WorkstreamProfileInputSchema.safeParse({
        ...profile,
        completionPolicy: { type: 'all_jobs_completed' },
      }).success,
    ).toBe(false);
  });

  it('rejects malformed pointers, unsafe targets, duplicates, and limits', () => {
    const mapping = validInputDrivenInventoryPolicyFixture.mapping.input;
    expect(
      GenerationJsonMappingSchema.safeParse({
        base: {},
        assignments: [{ sourcePointer: '/value~2', targetPointer: '/value' }],
      }).success,
    ).toBe(false);
    expect(
      GenerationJsonMappingSchema.safeParse({
        base: {},
        assignments: [
          { sourcePointer: '/value', targetPointer: '/__proto__/value' },
        ],
      }).success,
    ).toBe(false);
    expect(
      GenerationJsonMappingSchema.safeParse({
        base: {},
        assignments: [
          { sourcePointer: '/first', targetPointer: '/value' },
          { sourcePointer: '/second', targetPointer: '/value' },
        ],
      }).success,
    ).toBe(false);
    expect(
      GenerationJsonMappingSchema.safeParse({
        base: {},
        assignments: Array.from(
          { length: MAX_GENERATION_MAPPING_ASSIGNMENTS + 1 },
          (_, index) => ({
            sourcePointer: `/value/${index}`,
            targetPointer: `/target/${index}`,
          }),
        ),
      }).success,
    ).toBe(false);
    expect(
      GenerationJobMappingSchema.safeParse({
        ...validInputDrivenInventoryPolicyFixture.mapping,
        input: mapping,
        requiredAcceptedRuns: 101,
      }).success,
    ).toBe(false);
    expect(
      GenerationInputSourceSchema.safeParse({
        type: 'dataset',
        sourceId: 'x'.repeat(MAX_GENERATION_SOURCE_ID_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it('normalizes intake, source sync, batch, and inventory-count contracts', () => {
    expect(GenerationInputIntakeSchema.parse({})).toEqual({ state: 'open' });
    expect(GenerationInputSourceSyncSchema.parse({})).toEqual({
      status: 'not_started',
    });
    expect(
      GenerationInputBatchSchema.safeParse({
        requestId: 'batch-request-1',
        sourceId: 'dataset_fixture',
        items: [{ sourceItemKey: 'row-1', payload: { value: 1 } }],
      }).success,
    ).toBe(true);
    expect(
      GenerationInputInventoryCountsSchema.safeParse({
        ready: 1,
        materialized: 2,
        skipped: 3,
        failed: 0,
        total: 6,
      }).success,
    ).toBe(true);
  });
});
