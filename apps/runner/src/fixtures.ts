import {
  CampaignSchema,
  CauseSchema,
  JobDefinitionSchema,
} from '@causaic/protocol';
import { MemoryJobCoordinator } from '@causaic/coordinator-memory';
import { sourceVerificationExecutableDefinitionFixture } from '@causaic/workflow-source-verification';
import type { DemoFixture } from './demo.js';

export const demoCauseInput = {
  protocolVersion: 1,
  id: 'cause_open-public-evidence',
  slug: 'open-public-evidence',
  name: 'Open Public Evidence',
  summary: 'A demo cause that checks claims against public evidence.',
  description: 'Produces reviewable source-verification artifacts.',
  operatorName: 'Causaic Demo',
  reviewPolicy: 'Every artifact is validated before completion.',
} as const;

export const demoJobInput = {
  protocolVersion: 1,
  messageType: 'job.definition',
  id: 'job_transport-policy-report',
  campaignId: 'campaign_transport-policy-report',
  workstreamId: 'workstream_transport-policy-source-verification',
  causeId: 'cause_open-public-evidence',
  workflow: {
    protocolVersion: 1,
    id: 'workflow_version_source-verification-1-0-0',
    workflowFamilyId: 'workflow_source-verification',
    slug: 'source-verification',
    version: '1.0.0',
    inputSchemaHash:
      'sha256:30a5442839cacb3152a86d5e69c2bde3a120b82bdb2c68e585e84e582ae91cf6',
    outputSchemaHash:
      'sha256:36232c655431213944489cec4ffec510dd424eb2c286ff54985f6955fb57366f',
    definitionHash:
      sourceVerificationExecutableDefinitionFixture.definitionHash,
    packageHash: sourceVerificationExecutableDefinitionFixture.packageHash,
  },
  workflowRequirements: {
    execution: {
      capabilityHints:
        sourceVerificationExecutableDefinitionFixture.execution.capabilityHints,
    },
    ...(sourceVerificationExecutableDefinitionFixture.validation === undefined
      ? {}
      : {
          validation: {
            capabilityHints:
              sourceVerificationExecutableDefinitionFixture.validation.task
                .capabilityHints,
          },
        }),
  },
  status: 'available',
  objective: 'Verify one claim in transport-policy-report.',
  input: {
    claim: 'The transport policy report cites public evidence.',
    sourceUrls: ['https://example.gov/source'],
  },
  requiredAcceptedRuns: 1,
  acceptedRunCount: 0,
  capacityClass: 'small',
  estimatedDurationMinutes: 5,
  supportedExecutorTypes: ['desktop_node', 'plugin_host'],
  requiresPersistentRunner: false,
  requiresCheckpointRecovery: false,
  createdAt: '2030-01-01T10:00:00Z',
} as const;

export const demoCampaignInput = {
  protocolVersion: 1,
  messageType: 'campaign.definition',
  id: 'campaign_transport-policy-report',
  causeId: 'cause_open-public-evidence',
  name: 'Transport policy report verification',
  workflow: demoJobInput.workflow,
  status: 'active',
  availabilityPolicy: { type: 'manual_activation' },
  inventoryPolicy: { type: 'pre_generated' },
  participationPolicy: {
    maxAttemptsPerContributor: 1,
    maxAcceptedRunsPerContributor: 1,
    maxRunsPerContributorPerInstance: 1,
  },
  completionPolicy: { type: 'all_instances_completed' },
  validationPolicy: {
    requiredAcceptedRunsPerInstance: 1,
    maxConcurrentRunsPerInstance: 1,
    disagreementReviewRequired: false,
  },
  inputArtifactIds: [],
  createdByUserId: 'user_causaic-demo',
  createdAt: '2030-01-01T09:00:00Z',
  activatedAt: '2030-01-01T09:30:00Z',
} as const;

export function loadDemoFixtures() {
  return {
    cause: CauseSchema.parse(demoCauseInput),
    campaign: CampaignSchema.parse(demoCampaignInput),
    job: JobDefinitionSchema.parse(demoJobInput),
  };
}

export function createDemoCoordinator(
  fixture: DemoFixture = loadDemoFixtures(),
): MemoryJobCoordinator {
  let sequence = 0;
  return new MemoryJobCoordinator({
    now: () => Date.parse('2030-01-01T10:01:00Z'),
    createId: () => `runner-${sequence++}`,
    fixtures: {
      campaigns: [fixture.campaign],
      jobs: [fixture.job],
      workflowDefinitions: [demoWorkflowDefinition],
    },
  });
}

const demoWorkflowDefinition = sourceVerificationExecutableDefinitionFixture;
