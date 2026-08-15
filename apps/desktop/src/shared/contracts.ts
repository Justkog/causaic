import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  JobIdSchema,
  JobOfferSchema,
  JsonValueSchema,
} from '@causaic/protocol';
import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);

export const FocusTargetSchema = z.enum(['jobs', 'execution', 'settings']);
export type FocusTarget = z.infer<typeof FocusTargetSchema>;

export const DesktopConnectionSchema = z
  .object({
    status: z.enum([
      'connecting',
      'connected',
      'temporarily_unavailable',
      'failed_configuration',
      'failed_local_storage',
    ]),
    stale: z.boolean(),
    message: NonEmptyStringSchema.optional(),
  })
  .strict();

export const DesktopExecutionEventSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    occurredAt: z.iso.datetime(),
    type: z.enum([
      'job.selected',
      'runtime.selected',
      'lease.acquired',
      'run.started',
      'phase.changed',
      'progress',
      'approval.requested',
      'approval.resolved',
      'artifact.produced',
      'artifact.submitted',
      'execution.completed',
      'execution.cancelled',
      'execution.failed',
    ]),
    message: NonEmptyStringSchema,
  })
  .strict();
export type DesktopExecutionEvent = z.infer<typeof DesktopExecutionEventSchema>;

export const PendingApprovalSchema = z
  .object({
    id: ApprovalIdSchema,
    domain: NonEmptyStringSchema,
    reason: NonEmptyStringSchema,
    requestedAt: z.iso.datetime(),
    recoveryOnly: z.boolean().optional(),
  })
  .strict();
export type PendingApproval = z.infer<typeof PendingApprovalSchema>;

export const CurrentExecutionSchema = z
  .object({
    jobId: JobIdSchema,
    objective: NonEmptyStringSchema,
    campaignName: NonEmptyStringSchema,
    status: z.enum([
      'starting',
      'preparing',
      'running',
      'awaiting_approval',
      'validating',
      'cancelling',
      'recovering',
      'attention_required',
    ]),
    startedAt: z.iso.datetime(),
    progressMessage: NonEmptyStringSchema.optional(),
    pendingApproval: PendingApprovalSchema.optional(),
    events: z.array(DesktopExecutionEventSchema).max(100),
  })
  .strict();
export type CurrentExecution = z.infer<typeof CurrentExecutionSchema>;

const ArtifactSummarySchema = z
  .object({
    id: ArtifactIdSchema,
    content: JsonValueSchema,
  })
  .strict();

export const RecentExecutionSchema = z
  .object({
    jobId: JobIdSchema,
    status: z.enum(['completed', 'cancelled', 'failed']),
    finishedAt: z.iso.datetime(),
    message: NonEmptyStringSchema,
    retryable: z.boolean().optional(),
    artifact: ArtifactSummarySchema.optional(),
  })
  .strict();
export type RecentExecution = z.infer<typeof RecentExecutionSchema>;

export const RecoveryStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_started') }).strict(),
  z.object({ status: z.literal('recovering') }).strict(),
  z
    .object({
      status: z.literal('recovered'),
      recoveredExecutions: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal('attention_required'),
      issues: z.array(NonEmptyStringSchema).max(20),
    })
    .strict(),
  z
    .object({
      status: z.literal('failed'),
      safeMessage: NonEmptyStringSchema,
    })
    .strict(),
]);
export type RecoveryState = z.infer<typeof RecoveryStateSchema>;

export const DesktopStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    connection: DesktopConnectionSchema,
    paused: z.boolean(),
    lastSelectedView: FocusTargetSchema,
    recovery: RecoveryStateSchema,
    availableJobs: z.array(JobOfferSchema),
    refreshedAt: z.iso.datetime().optional(),
    currentExecution: CurrentExecutionSchema.nullable(),
    recentExecution: RecentExecutionSchema.nullable(),
  })
  .strict();
export type DesktopState = z.infer<typeof DesktopStateSchema>;

export const StartExecutionRequestSchema = z
  .object({ jobId: JobIdSchema })
  .strict();
export const CancelExecutionRequestSchema = z
  .object({ reason: NonEmptyStringSchema.optional() })
  .strict();
export const ResolveApprovalRequestSchema = z.discriminatedUnion('decision', [
  z
    .object({
      approvalId: ApprovalIdSchema,
      decision: z.literal('approved'),
    })
    .strict(),
  z
    .object({
      approvalId: ApprovalIdSchema,
      decision: z.literal('denied'),
      reason: NonEmptyStringSchema,
    })
    .strict(),
]);
export const SetPausedRequestSchema = z
  .object({ paused: z.boolean() })
  .strict();
export const SetSelectedViewRequestSchema = z
  .object({ view: FocusTargetSchema })
  .strict();
export const OpenExternalRequestSchema = z.object({ url: z.url() }).strict();
export const ResetLocalStateRequestSchema = z
  .object({ confirmation: z.literal('RESET LOCAL DATA') })
  .strict();

export type StartExecutionRequest = z.infer<typeof StartExecutionRequestSchema>;
export type CancelExecutionRequest = z.infer<
  typeof CancelExecutionRequestSchema
>;
export type ResolveApprovalRequest = z.infer<
  typeof ResolveApprovalRequestSchema
>;
export type SetPausedRequest = z.infer<typeof SetPausedRequestSchema>;
export type SetSelectedViewRequest = z.infer<
  typeof SetSelectedViewRequestSchema
>;
export type OpenExternalRequest = z.infer<typeof OpenExternalRequestSchema>;
export type ResetLocalStateRequest = z.infer<
  typeof ResetLocalStateRequestSchema
>;

export interface CausaicDesktopApi {
  getState(): Promise<DesktopState>;
  refreshJobs(): Promise<DesktopState>;
  startExecution(request: StartExecutionRequest): Promise<DesktopState>;
  cancelExecution(request: CancelExecutionRequest): Promise<DesktopState>;
  resolveApproval(request: ResolveApprovalRequest): Promise<DesktopState>;
  setPaused(request: SetPausedRequest): Promise<DesktopState>;
  setSelectedView(request: SetSelectedViewRequest): Promise<DesktopState>;
  openExternal(request: OpenExternalRequest): Promise<void>;
  resetLocalState(request: ResetLocalStateRequest): Promise<void>;
  quit(): Promise<void>;
  onStateChanged(listener: (state: DesktopState) => void): () => void;
  onFocusTarget(listener: (target: FocusTarget) => void): () => void;
}

export const initialDesktopState = (): DesktopState =>
  DesktopStateSchema.parse({
    revision: 0,
    connection: { status: 'connecting', stale: false },
    paused: false,
    lastSelectedView: 'jobs',
    recovery: { status: 'not_started' },
    availableJobs: [],
    currentExecution: null,
    recentExecution: null,
  });
