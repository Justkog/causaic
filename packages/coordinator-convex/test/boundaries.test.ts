import {
  ClaimOpportunityRequestSchema,
  CoordinatorBackendErrorCodeSchema,
  JobIdSchema,
  NodeIdSchema,
  validClaimedContributionFixture,
  validContributionOpportunitySummaryFixture,
} from '@causaic/protocol';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import type { ConvexCoordinatorClient } from '../src/client.js';
import { ConvexJobCoordinator } from '../src/convex-job-coordinator.js';
import { mapConvexCoordinatorError } from '../src/error-mapping.js';

const config = {
  convexUrl: 'http://127.0.0.1:3210',
  nodeExternalId: NodeIdSchema.parse('fixture-node-1'),
  developmentSecret: 'development-secret',
  defaultLeaseDurationMs: 60_000,
};

describe('Convex coordinator boundaries', () => {
  it.each(CoordinatorBackendErrorCodeSchema.options)(
    'maps the stable backend code %s',
    (code) => {
      const backendError = { data: { code } };
      const mapped = mapConvexCoordinatorError(backendError);

      expect(mapped.cause).toBe(backendError);
      expect(mapped.message).not.toContain('unmapped');
    },
  );

  it('preserves unknown backend failures as unavailable causes', () => {
    const backendError = { data: { code: 'FUTURE_BACKEND_CODE' } };

    expect(mapConvexCoordinatorError(backendError)).toMatchObject({
      code: 'coordinator_unavailable',
      cause: backendError,
    });
  });

  it('reports invalid backend responses as protocol mismatches', async () => {
    const client: ConvexCoordinatorClient = {
      query: async () => [{ messageType: 'not-a-job-offer' }],
      mutation: async () => undefined,
    };

    await expect(
      new ConvexJobCoordinator(config, client).listAvailableOpportunities({}),
    ).rejects.toMatchObject({ code: 'protocol_mismatch' });
  });

  it('maps network failures without losing the original cause', async () => {
    const networkError = new Error('connection refused');
    const client: ConvexCoordinatorClient = {
      query: async () => {
        throw networkError;
      },
      mutation: async () => undefined,
    };

    await expect(
      new ConvexJobCoordinator(config, client).listAvailableOpportunities({}),
    ).rejects.toMatchObject({
      code: 'coordinator_unavailable',
      cause: networkError,
    });
  });

  it('selects the active lease and its run without relying on query order', async () => {
    const activeLease = {
      protocolVersion: 1,
      messageType: 'job.lease',
      messageId: 'message_active',
      id: 'lease_active',
      jobId: 'job_fixture',
      runId: 'run_active',
      nodeId: 'node_active',
      executorId: 'executor_active',
      contributorId: 'user_active',
      executorType: 'plugin_host',
      status: 'active',
      leasedAt: '2030-01-01T10:05:00Z',
      acquiredAt: '2030-01-01T10:05:00Z',
      heartbeatAt: '2030-01-01T10:05:00Z',
      expiresAt: '2030-01-01T10:10:00Z',
    };
    const releasedLease = {
      ...activeLease,
      messageId: 'message_released',
      id: 'lease_released',
      runId: 'run_released',
      status: 'released',
      leasedAt: '2030-01-01T10:00:00Z',
    };
    const client: ConvexCoordinatorClient = {
      query: async () => ({
        job: {
          id: 'job_fixture',
          workflowVersionId: 'workflow_version_fixture-1',
          campaignId: 'campaign_fixture',
          causeId: 'cause_fixture',
          status: 'running',
          attemptCount: 2,
          maxAttempts: 3,
        },
        leases: [activeLease, releasedLease],
        runs: [
          {
            id: 'run_active',
            jobId: 'job_fixture',
            leaseId: 'lease_active',
            nodeId: 'node_active',
            status: 'running',
            progressSequence: 0,
            startedAt: '2030-01-01T10:05:01Z',
          },
          {
            id: 'run_released',
            jobId: 'job_fixture',
            leaseId: 'lease_released',
            nodeId: 'node_active',
            status: 'failed',
            progressSequence: 0,
            startedAt: '2030-01-01T10:00:01Z',
          },
        ],
        approvals: [],
        artifacts: [],
      }),
      mutation: async () => undefined,
    };

    await expect(
      new ConvexJobCoordinator(config, client).getJobState({
        jobId: JobIdSchema.parse('job_fixture'),
      }),
    ).resolves.toMatchObject({
      lease: { id: 'lease_active', status: 'active' },
      run: { id: 'run_active', status: 'running' },
    });
  });

  it('rejects a malformed aggregate response at the adapter boundary', async () => {
    const client: ConvexCoordinatorClient = {
      query: async () => ({ job: { id: 'not-a-job-id' } }),
      mutation: async () => undefined,
    };

    await expect(
      new ConvexJobCoordinator(config, client).getJobState({
        jobId: JobIdSchema.parse('job_fixture'),
      }),
    ).rejects.toMatchObject({ code: 'protocol_mismatch' });
  });

  it('uses paginated opportunity discovery and the opportunity claim mutation', async () => {
    const queries: string[] = [];
    const mutations: Array<{ name: string; args: Record<string, unknown> }> =
      [];
    let page = 0;
    const request = ClaimOpportunityRequestSchema.parse({
      opportunityId: validContributionOpportunitySummaryFixture.id,
      leaseId: 'lease_adapter-test',
      runId: 'run_adapter-test',
      nodeId: config.nodeExternalId,
      executorId: 'executor_adapter-test',
      contributorId: 'user_adapter-test',
      executorType: 'desktop_node',
      durationMs: 60_000,
    });
    const claimedContribution = {
      ...validClaimedContributionFixture,
      opportunityId: request.opportunityId,
      lease: {
        ...validClaimedContributionFixture.lease,
        id: request.leaseId,
        runId: request.runId,
        executorId: request.executorId,
        contributorId: request.contributorId,
        executorType: request.executorType,
      },
    };
    const client: ConvexCoordinatorClient = {
      query: async (reference) => {
        queries.push(getFunctionName(reference));
        page += 1;
        return page === 1
          ? {
              page: [validContributionOpportunitySummaryFixture],
              isDone: false,
              continueCursor: 'cursor-next',
            }
          : { page: [], isDone: true, continueCursor: 'cursor-done' };
      },
      mutation: async (reference, args) => {
        mutations.push({ name: getFunctionName(reference), args });
        return claimedContribution;
      },
    };
    const coordinator = new ConvexJobCoordinator(config, client);

    await expect(
      coordinator.listAvailableOpportunities({ executorType: 'desktop_node' }),
    ).resolves.toEqual([validContributionOpportunitySummaryFixture]);
    await expect(
      coordinator.claimOpportunity(request),
    ).resolves.toEqual(claimedContribution);
    expect(queries).toEqual([
      'contributorOpportunities:listAvailable',
      'contributorOpportunities:listAvailable',
    ]);
    expect(mutations).toMatchObject([
      {
        name: 'contributorOpportunities:claim',
        args: {
          opportunityExternalId: validContributionOpportunitySummaryFixture.id,
          leaseExternalId: 'lease_adapter-test',
          runExternalId: 'run_adapter-test',
          nodeExternalId: config.nodeExternalId,
        },
      },
    ]);
  });

  it('rejects claim responses whose identities do not match the request', async () => {
    const request = ClaimOpportunityRequestSchema.parse({
      opportunityId: validContributionOpportunitySummaryFixture.id,
      leaseId: 'lease_adapter-test',
      runId: 'run_adapter-test',
      nodeId: config.nodeExternalId,
      executorId: 'executor_adapter-test',
      contributorId: 'user_adapter-test',
      executorType: 'desktop_node',
      durationMs: 60_000,
    });
    const claimedContribution = {
      ...validClaimedContributionFixture,
      opportunityId: request.opportunityId,
      lease: {
        ...validClaimedContributionFixture.lease,
        id: request.leaseId,
        runId: request.runId,
        executorId: request.executorId,
        contributorId: request.contributorId,
        executorType: request.executorType,
      },
    };
    const responses = [
      { ...claimedContribution, opportunityId: 'opportunity_job_other' },
      {
        ...claimedContribution,
        lease: { ...claimedContribution.lease, id: 'lease_other' },
      },
      {
        ...claimedContribution,
        lease: { ...claimedContribution.lease, runId: 'run_other' },
      },
      {
        ...claimedContribution,
        lease: { ...claimedContribution.lease, executorId: 'executor_other' },
      },
      {
        ...claimedContribution,
        lease: { ...claimedContribution.lease, contributorId: 'user_other' },
      },
      {
        ...claimedContribution,
        lease: { ...claimedContribution.lease, executorType: 'plugin_host' },
      },
    ];

    for (const response of responses) {
      const client: ConvexCoordinatorClient = {
        query: async () => undefined,
        mutation: async () => response,
      };

      await expect(
        new ConvexJobCoordinator(config, client).claimOpportunity(request),
      ).rejects.toMatchObject({ code: 'protocol_mismatch' });
    }
  });

  it('rejects a claim for a node other than the configured node', async () => {
    let mutationCalled = false;
    const client: ConvexCoordinatorClient = {
      query: async () => undefined,
      mutation: async () => {
        mutationCalled = true;
        return validClaimedContributionFixture;
      },
    };

    await expect(
      new ConvexJobCoordinator(config, client).claimOpportunity(
        ClaimOpportunityRequestSchema.parse({
          opportunityId: validContributionOpportunitySummaryFixture.id,
          leaseId: 'lease_adapter-test',
          runId: 'run_adapter-test',
          nodeId: 'node_other',
          executorId: 'executor_adapter-test',
          contributorId: 'user_adapter-test',
          executorType: 'desktop_node',
          durationMs: 60_000,
        }),
      ),
    ).rejects.toMatchObject({ code: 'lease_node_mismatch' });
    expect(mutationCalled).toBe(false);
  });
});
