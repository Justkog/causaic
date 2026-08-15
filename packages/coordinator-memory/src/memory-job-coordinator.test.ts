import { defineJobCoordinatorContract } from '@causaic/coordinator-core/testing';
import {
  CampaignSchema,
  JobDefinitionSchema,
  validCampaignFixture,
  validSourceVerificationJobFixture,
} from '@causaic/protocol';

import { MemoryJobCoordinator } from './memory-job-coordinator.js';

defineJobCoordinatorContract(async () => {
  let sequence = 0;
  const job = JobDefinitionSchema.parse(validSourceVerificationJobFixture);
  return {
    coordinator: new MemoryJobCoordinator({
      now: () => Date.parse('2026-07-15T12:02:00Z'),
      createId: () => `contract-${sequence++}`,
      fixtures: {
        campaigns: [CampaignSchema.parse(validCampaignFixture)],
        jobs: [job],
      },
    }),
    jobId: job.id,
    artifact: {
      artifactType: 'source_verification',
      claim: 'Causaic fixtures are validated generically.',
      verdict: 'supported',
      citations: [
        {
          url: 'https://example.com/source',
          note: 'Verified',
        },
      ],
    },
  };
});
