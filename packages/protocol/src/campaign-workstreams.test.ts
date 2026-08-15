import { describe, expect, it } from 'vitest';

import {
  WorkstreamParticipationPolicySchema,
  WorkstreamProfileInputSchema,
} from './campaign-workstreams.js';
import {
  WorkstreamDependencyIdSchema,
  WorkstreamIdSchema,
} from './identifiers.js';

describe('campaign workstream contracts', () => {
  it('validates portable workstream identifiers', () => {
    expect(WorkstreamIdSchema.safeParse('workstream_fixture-a').success).toBe(
      true,
    );
    expect(
      WorkstreamDependencyIdSchema.safeParse(
        'workstream_dependency_fixture-a-b',
      ).success,
    ).toBe(true);
  });

  it('normalizes and validates a minimal profile', () => {
    expect(
      WorkstreamProfileInputSchema.parse({
        name: '  Verify claims  ',
        description: '  Verify the campaign claims.  ',
        required: true,
        workflowVersionId: 'workflow_version_source-verification-1-0-0',
        availabilityPolicy: { type: 'manual' },
        inventoryPolicy: { type: 'fixed_batch', targetJobCount: 20 },
        participationPolicy: {
          maxRunsPerContributor: 4,
          maxConcurrentRunsPerContributor: 2,
        },
        completionPolicy: { type: 'all_jobs_completed' },
      }),
    ).toMatchObject({
      name: 'Verify claims',
      description: 'Verify the campaign claims.',
    });
  });

  it('rejects invalid participation and batch limits', () => {
    expect(
      WorkstreamParticipationPolicySchema.safeParse({
        maxRunsPerContributor: 2,
        maxConcurrentRunsPerContributor: 3,
      }).success,
    ).toBe(false);
    expect(
      WorkstreamProfileInputSchema.safeParse({
        name: 'Verify claims',
        description: 'Verify the campaign claims.',
        required: true,
        workflowVersionId: 'workflow_version_source-verification-1-0-0',
        availabilityPolicy: { type: 'manual' },
        inventoryPolicy: { type: 'fixed_batch', targetJobCount: 0 },
        participationPolicy: {},
        completionPolicy: { type: 'manual' },
      }).success,
    ).toBe(false);
  });
});
