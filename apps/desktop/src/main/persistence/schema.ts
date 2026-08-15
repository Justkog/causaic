import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const applicationMetadata = sqliteTable(
  'application_metadata',
  {
    id: integer('id').primaryKey(),
    installationId: text('installation_id').notNull().unique(),
    lastConfiguredNodeId: text('last_configured_node_id').notNull(),
    createdAt: integer('created_at').notNull(),
    lastSuccessfulStartupAt: integer('last_successful_startup_at'),
  },
  (table) => [check('application_metadata_singleton', sql`${table.id} = 1`)],
);

export const desktopPreferences = sqliteTable(
  'desktop_preferences',
  {
    id: integer('id').primaryKey(),
    paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
    lastSelectedView: text('last_selected_view', {
      enum: ['jobs', 'execution', 'settings'],
    })
      .notNull()
      .default('jobs'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    check('desktop_preferences_singleton', sql`${table.id} = 1`),
    check(
      'desktop_preferences_view',
      sql`${table.lastSelectedView} IN ('jobs', 'execution', 'settings')`,
    ),
  ],
);

export const localExecutions = sqliteTable(
  'local_executions',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').notNull(),
    leaseId: text('lease_id'),
    runId: text('run_id'),
    nodeId: text('node_id').notNull(),
    executorId: text('executor_id').notNull(),
    runtimeType: text('runtime_type').notNull(),
    objective: text('objective').notNull(),
    campaignName: text('campaign_name').notNull(),
    lifecycleStatus: text('lifecycle_status', {
      enum: [
        'selected',
        'leasing',
        'starting_run',
        'running',
        'awaiting_approval',
        'validating',
        'artifact_persisted',
        'artifact_submitted',
        'completion_pending',
        'cleanup_pending',
        'completed',
        'cancelled',
        'failed',
        'interrupted',
      ],
    }).notNull(),
    recoveryStatus: text('recovery_status', {
      enum: ['pending', 'reconciling', 'reconciled', 'attention_required'],
    })
      .notNull()
      .default('pending'),
    lastRunnerSequence: integer('last_runner_sequence').notNull().default(-1),
    lastProgressSequence: integer('last_progress_sequence')
      .notNull()
      .default(-1),
    progressMessage: text('progress_message'),
    lastConfirmedRemoteStage: text('last_confirmed_remote_stage'),
    remoteSnapshotJson: text('remote_snapshot_json'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    retryable: integer('retryable', { mode: 'boolean' }),
    cancellationRequestedAt: integer('cancellation_requested_at'),
    startedAt: integer('started_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    terminalAt: integer('terminal_at'),
    terminalNotifiedAt: integer('terminal_notified_at'),
  },
  (table) => [
    index('local_executions_recovery_updated_idx').on(
      table.recoveryStatus,
      table.updatedAt,
    ),
    index('local_executions_job_idx').on(table.jobId),
    uniqueIndex('local_executions_lease_idx').on(table.leaseId),
    uniqueIndex('local_executions_run_idx').on(table.runId),
    check(
      'local_executions_lifecycle_status',
      sql`${table.lifecycleStatus} IN ('selected', 'leasing', 'starting_run', 'running', 'awaiting_approval', 'validating', 'artifact_persisted', 'artifact_submitted', 'completion_pending', 'cleanup_pending', 'completed', 'cancelled', 'failed', 'interrupted')`,
    ),
    check(
      'local_executions_recovery_status',
      sql`${table.recoveryStatus} IN ('pending', 'reconciling', 'reconciled', 'attention_required')`,
    ),
  ],
);

export const localExecutionEvents = sqliteTable(
  'local_execution_events',
  {
    executionId: text('execution_id')
      .notNull()
      .references(() => localExecutions.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    message: text('message').notNull(),
    occurredAt: integer('occurred_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.executionId, table.sequence] }),
    index('local_execution_events_time_idx').on(
      table.executionId,
      table.occurredAt,
    ),
    check(
      'local_execution_events_type',
      sql`${table.type} IN ('job.selected', 'runtime.selected', 'lease.acquired', 'run.started', 'phase.changed', 'progress', 'approval.requested', 'approval.resolved', 'artifact.produced', 'artifact.submitted', 'execution.completed', 'execution.cancelled', 'execution.failed')`,
    ),
  ],
);

export const localApprovals = sqliteTable(
  'local_approvals',
  {
    id: text('id').primaryKey(),
    executionId: text('execution_id')
      .notNull()
      .references(() => localExecutions.id, { onDelete: 'cascade' }),
    runId: text('run_id'),
    domain: text('domain').notNull(),
    reason: text('reason').notNull(),
    capabilitiesJson: text('capabilities_json').notNull().default('[]'),
    presentationStatus: text('presentation_status', {
      enum: ['pending', 'decision_attempted', 'reconciled', 'superseded'],
    }).notNull(),
    authoritativeStatus: text('authoritative_status', {
      enum: ['unknown', 'pending', 'approved', 'denied'],
    })
      .notNull()
      .default('unknown'),
    attemptedDecision: text('attempted_decision', {
      enum: ['approved', 'denied'],
    }),
    denialReason: text('denial_reason'),
    requestedAt: integer('requested_at').notNull(),
    decisionAttemptedAt: integer('decision_attempted_at'),
    resolvedAt: integer('resolved_at'),
    notifiedAt: integer('notified_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('local_approvals_execution_status_idx').on(
      table.executionId,
      table.presentationStatus,
    ),
    check(
      'local_approvals_presentation_status',
      sql`${table.presentationStatus} IN ('pending', 'decision_attempted', 'reconciled', 'superseded')`,
    ),
    check(
      'local_approvals_authoritative_status',
      sql`${table.authoritativeStatus} IN ('unknown', 'pending', 'approved', 'denied')`,
    ),
  ],
);

export const localArtifacts = sqliteTable(
  'local_artifacts',
  {
    id: text('id').primaryKey(),
    executionId: text('execution_id')
      .notNull()
      .references(() => localExecutions.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull(),
    runId: text('run_id'),
    relativePath: text('relative_path').notNull().unique(),
    contentHash: text('content_hash').notNull(),
    byteSize: integer('byte_size').notNull(),
    workflowVersionId: text('workflow_version_id').notNull(),
    outputSchemaHash: text('output_schema_hash').notNull(),
    outputSchemaDocumentJson: text('output_schema_document_json').notNull(),
    validationStatus: text('validation_status', {
      enum: ['validated', 'missing', 'invalid'],
    }).notNull(),
    submissionStatus: text('submission_status', {
      enum: ['local_only', 'pending', 'confirmed', 'conflict'],
    }).notNull(),
    submissionAttempts: integer('submission_attempts').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('local_artifacts_execution_status_idx').on(
      table.executionId,
      table.submissionStatus,
    ),
    check('local_artifacts_nonnegative_size', sql`${table.byteSize} >= 0`),
    check(
      'local_artifacts_validation_status',
      sql`${table.validationStatus} IN ('validated', 'missing', 'invalid')`,
    ),
    check(
      'local_artifacts_submission_status',
      sql`${table.submissionStatus} IN ('local_only', 'pending', 'confirmed', 'conflict')`,
    ),
  ],
);

export const pendingOperations = sqliteTable(
  'pending_operations',
  {
    id: text('id').primaryKey(),
    executionId: text('execution_id')
      .notNull()
      .references(() => localExecutions.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: [
        'acquire_lease',
        'start_run',
        'renew_lease',
        'request_approval',
        'resolve_approval',
        'submit_artifact',
        'complete_run',
        'fail_run',
        'release_lease',
      ],
    }).notNull(),
    status: text('status', {
      enum: ['pending', 'confirmed', 'failed'],
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    payloadJson: text('payload_json').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    confirmedAt: integer('confirmed_at'),
  },
  (table) => [
    index('pending_operations_status_updated_idx').on(
      table.status,
      table.updatedAt,
    ),
    index('pending_operations_execution_idx').on(table.executionId),
    check(
      'pending_operations_kind',
      sql`${table.kind} IN ('acquire_lease', 'start_run', 'renew_lease', 'request_approval', 'resolve_approval', 'submit_artifact', 'complete_run', 'fail_run', 'release_lease')`,
    ),
    check(
      'pending_operations_status',
      sql`${table.status} IN ('pending', 'confirmed', 'failed')`,
    ),
  ],
);
