import { ApprovalIdSchema } from '@causaic/protocol';

import {
  DesktopExecutionEventSchema,
  type CurrentExecution,
  type RecentExecution,
} from '../../shared/contracts.js';
import type { DesktopRepositories } from './repositories.js';

export function hydrateCurrentExecution(
  repositories: DesktopRepositories,
): CurrentExecution | null {
  const execution = repositories.incompleteExecutions()[0];
  if (execution === undefined) return null;
  const approval = repositories.pendingApproval(execution.id);
  const events = repositories.events(execution.id).map((event) =>
    DesktopExecutionEventSchema.parse({
      ...event,
      occurredAt: new Date(event.occurredAt).toISOString(),
    }),
  );
  return {
    jobId: execution.jobId,
    objective: execution.objective,
    campaignName: execution.campaignName,
    status:
      execution.recoveryStatus === 'attention_required'
        ? 'attention_required'
        : 'recovering',
    startedAt: new Date(execution.startedAt).toISOString(),
    ...(execution.progressMessage === null
      ? {}
      : { progressMessage: execution.progressMessage }),
    ...(approval === undefined
      ? {}
      : {
          pendingApproval: {
            id: ApprovalIdSchema.parse(approval.id),
            domain: approval.domain,
            reason: approval.reason,
            requestedAt: new Date(approval.requestedAt).toISOString(),
            recoveryOnly: true,
          },
        }),
    events,
  };
}

export function hydrateRecentExecution(
  repositories: DesktopRepositories,
): RecentExecution | null {
  const execution = repositories.latestTerminalExecution();
  if (execution === undefined || execution.terminalAt === null) return null;
  const status =
    execution.lifecycleStatus === 'completed'
      ? 'completed'
      : execution.lifecycleStatus === 'cancelled' ||
          execution.lifecycleStatus === 'interrupted'
        ? 'cancelled'
        : 'failed';
  return {
    jobId: execution.jobId,
    status,
    finishedAt: new Date(execution.terminalAt).toISOString(),
    message:
      execution.failureMessage ??
      (status === 'completed'
        ? 'The contribution completed successfully.'
        : status === 'cancelled'
          ? 'The interrupted contribution was ended safely.'
          : 'The contribution failed.'),
    ...(execution.retryable === null ? {} : { retryable: execution.retryable }),
  };
}
