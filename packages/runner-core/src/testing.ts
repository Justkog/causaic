import type { JobCoordinator } from '@causaic/coordinator-core';
import { CampaignSchema, JobDefinitionSchema } from '@causaic/protocol';
import type { RuntimeInstallation } from '@causaic/runtime-core';

import type { RunnerIdFactory } from './types.js';
import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  MessageIdSchema,
} from '@causaic/protocol';
import type { JsonValue } from '@causaic/protocol';
import { sourceVerificationExecutableDefinitionFixture } from '@causaic/workflow-source-verification';
import { RuntimeSessionIdSchema } from '@causaic/runtime-core';

const inputSchemaHash =
  'sha256:30a5442839cacb3152a86d5e69c2bde3a120b82bdb2c68e585e84e582ae91cf6';
const outputSchemaHash =
  'sha256:36232c655431213944489cec4ffec510dd424eb2c286ff54985f6955fb57366f';

const job = JobDefinitionSchema.parse({
  protocolVersion: 1,
  messageType: 'job.definition',
  id: 'job_runner-core-test',
  campaignId: 'campaign_runner-core-test',
  workstreamId: 'workstream_runner-core-test',
  causeId: 'cause_runner-core-test',
  workflow: {
    protocolVersion: 1,
    id: 'workflow_version_source-verification-1-0-0',
    workflowFamilyId: 'workflow_source-verification',
    slug: 'source-verification',
    version: '1.0.0',
    inputSchemaHash,
    outputSchemaHash,
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
            capabilityManifest:
              sourceVerificationExecutableDefinitionFixture.validation.task
                .capabilityManifest,
            toolRequirements:
              sourceVerificationExecutableDefinitionFixture.validation.task
                .toolRequirements,
            approvalPolicy:
              sourceVerificationExecutableDefinitionFixture.validation.task
                .approvalPolicy,
          },
        }),
  },
  status: 'available',
  objective: 'Verify the test claim.',
  input: {
    claim: 'A test claim.',
    sourceUrls: ['https://example.gov/source'],
  },
  requiredAcceptedRuns: 1,
  acceptedRunCount: 0,
  capacityClass: 'small',
  estimatedDurationMinutes: 1,
  supportedExecutorTypes: ['desktop_node', 'plugin_host'],
  requiresPersistentRunner: false,
  requiresCheckpointRecovery: false,
  createdAt: '2030-01-01T10:00:00Z',
});

const campaign = CampaignSchema.parse({
  protocolVersion: 1,
  messageType: 'campaign.definition',
  id: job.campaignId,
  causeId: job.causeId,
  name: 'Runner core test',
  workflow: job.workflow,
  status: 'active',
  availabilityPolicy: { type: 'manual_activation' },
  inventoryPolicy: { type: 'pre_generated' },
  participationPolicy: {
    maxAttemptsPerContributor: 3,
    maxAcceptedRunsPerContributor: 1,
    maxRunsPerContributorPerInstance: 3,
  },
  completionPolicy: { type: 'all_instances_completed' },
  validationPolicy: {
    requiredAcceptedRunsPerInstance: 1,
    maxConcurrentRunsPerInstance: 1,
    disagreementReviewRequired: false,
  },
  inputArtifactIds: [],
  createdByUserId: 'user_runner-core-test',
  createdAt: '2030-01-01T09:00:00Z',
  activatedAt: '2030-01-01T09:30:00Z',
});

export const runnerCoreTestArtifact = {
  artifactType: 'source_verification',
  claim: 'A test claim.',
  verdict: 'supported',
  citations: [
    {
      url: 'https://example.gov/source',
      note: 'The public source supports the test claim.',
    },
  ],
} as const satisfies JsonValue;

export const runnerCoreTestWorkflowDefinition =
  sourceVerificationExecutableDefinitionFixture;

export const runnerCoreTestFixtures = {
  campaigns: [campaign],
  jobs: [job],
  workflowDefinitions: [runnerCoreTestWorkflowDefinition],
} as const;

export async function createRunnerCoreTestOffer(coordinator: JobCoordinator) {
  const [offer] = await coordinator.listAvailableJobs({
    executorType: 'plugin_host',
  });
  if (offer === undefined) throw new Error('Runner core test offer is missing');
  return offer;
}

export const runnerCoreTestIds: RunnerIdFactory = {
  approvalId: () => ApprovalIdSchema.parse('approval_runner-core-test'),
  artifactId: () => ArtifactIdSchema.parse('artifact_runner-core-test'),
  sessionId: () =>
    RuntimeSessionIdSchema.parse('runtime-session_runner-core-test'),
  messageId: (purpose, sequence) =>
    MessageIdSchema.parse(
      `message_runner-core-${purpose}${sequence === undefined ? '' : `-${sequence}`}`,
    ),
};

export async function requireAvailableInstallation(
  installations: readonly RuntimeInstallation[],
): Promise<RuntimeInstallation> {
  const installation = installations.find(({ available }) => available);
  if (installation === undefined) throw new Error('No test runtime available');
  return installation;
}
