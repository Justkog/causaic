import { randomUUID } from 'node:crypto';

import type {
  ApprovalId,
  ArtifactId,
  ExecutorId,
  JobId,
  LeaseId,
  NodeId,
  OpportunityId,
  RunId,
} from '@causaic/protocol';
import type { RunnerEvent } from '@causaic/runner-core';
import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import type { FocusTarget } from '../../shared/contracts.js';
import type { DesktopDatabaseHandle } from './database.js';
import {
  LocalExecutionIdSchema,
  PendingOperationPayloadSchema,
  PersistedExecutionSchema,
} from './models.js';
import type {
  ExecutionLifecycleStatus,
  ExecutionRecoveryStatus,
  LocalExecutionId,
  PendingOperationPayload,
  PersistedExecution,
} from './models.js';
import {
  applicationMetadata,
  desktopPreferences,
  localApprovals,
  localArtifacts,
  localExecutionEvents,
  localExecutions,
  pendingOperations,
} from './schema.js';

const TERMINAL_STATUSES = [
  'completed',
  'cancelled',
  'failed',
  'interrupted',
] as const;

export interface CreateExecutionInput {
  readonly id?: LocalExecutionId;
  readonly opportunityId?: OpportunityId;
  readonly jobId?: JobId;
  readonly nodeId: NodeId;
  readonly executorId: ExecutorId;
  readonly runtimeType: string;
  readonly objective: string;
  readonly campaignName: string;
  readonly startedAt: number;
}

export interface PersistedEvent {
  readonly executionId: LocalExecutionId;
  readonly sequence: number;
  readonly type: RunnerEvent['type'];
  readonly message: string;
  readonly occurredAt: number;
}

export interface PersistArtifactInput {
  readonly id: ArtifactId;
  readonly executionId: LocalExecutionId;
  readonly jobId: JobId;
  readonly runId?: RunId;
  readonly relativePath: string;
  readonly contentHash: string;
  readonly byteSize: number;
  readonly workflowVersionId: string;
  readonly outputSchemaHash: string;
  readonly outputSchemaDocumentJson: string;
  readonly createdAt: number;
}

export class DesktopRepositories {
  public constructor(
    private readonly handle: DesktopDatabaseHandle,
    private readonly now: () => number = Date.now,
  ) {}

  public initialize(nodeId: NodeId): void {
    const now = this.now();
    this.handle.db.transaction((tx) => {
      const metadata = tx.select().from(applicationMetadata).get();
      if (metadata === undefined) {
        tx.insert(applicationMetadata)
          .values({
            id: 1,
            installationId: `installation_${randomUUID()}`,
            lastConfiguredNodeId: nodeId,
            createdAt: now,
            lastSuccessfulStartupAt: now,
          })
          .run();
      } else {
        tx.update(applicationMetadata)
          .set({ lastConfiguredNodeId: nodeId, lastSuccessfulStartupAt: now })
          .where(eq(applicationMetadata.id, 1))
          .run();
      }
      tx.insert(desktopPreferences)
        .values({
          id: 1,
          paused: false,
          lastSelectedView: 'jobs',
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
    });
  }

  public metadata() {
    return this.handle.db.select().from(applicationMetadata).get();
  }

  public preferences(): {
    readonly paused: boolean;
    readonly lastSelectedView: FocusTarget;
  } {
    const value = this.handle.db.select().from(desktopPreferences).get();
    return {
      paused: value?.paused ?? false,
      lastSelectedView: value?.lastSelectedView ?? 'jobs',
    };
  }

  public setPaused(paused: boolean): void {
    this.handle.db
      .update(desktopPreferences)
      .set({ paused, updatedAt: this.now() })
      .where(eq(desktopPreferences.id, 1))
      .run();
  }

  public setLastSelectedView(lastSelectedView: FocusTarget): void {
    this.handle.db
      .update(desktopPreferences)
      .set({ lastSelectedView, updatedAt: this.now() })
      .where(eq(desktopPreferences.id, 1))
      .run();
  }

  public createExecution(input: CreateExecutionInput): PersistedExecution {
    if (input.opportunityId === undefined && input.jobId === undefined)
      throw new Error('An execution requires an opportunity ID or job ID');
    const id =
      input.id ??
      LocalExecutionIdSchema.parse(`local-execution_${randomUUID()}`);
    this.handle.db
      .insert(localExecutions)
      .values({
        id,
        opportunityId: input.opportunityId ?? null,
        jobId: input.jobId ?? null,
        nodeId: input.nodeId,
        executorId: input.executorId,
        runtimeType: input.runtimeType,
        objective: input.objective,
        campaignName: input.campaignName,
        lifecycleStatus: 'selected',
        recoveryStatus: 'pending',
        startedAt: input.startedAt,
        updatedAt: input.startedAt,
      })
      .run();
    return this.execution(id)!;
  }

  public execution(id: LocalExecutionId): PersistedExecution | undefined {
    const value = this.handle.db
      .select()
      .from(localExecutions)
      .where(eq(localExecutions.id, id))
      .get();
    return value === undefined
      ? undefined
      : PersistedExecutionSchema.parse(value);
  }

  public incompleteExecutions(): readonly PersistedExecution[] {
    return this.handle.db
      .select()
      .from(localExecutions)
      .where(
        inArray(localExecutions.lifecycleStatus, [
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
        ]),
      )
      .orderBy(asc(localExecutions.startedAt))
      .all()
      .map((value) => PersistedExecutionSchema.parse(value));
  }

  public latestTerminalExecution(): PersistedExecution | undefined {
    const value = this.handle.db
      .select()
      .from(localExecutions)
      .where(inArray(localExecutions.lifecycleStatus, [...TERMINAL_STATUSES]))
      .orderBy(desc(localExecutions.terminalAt))
      .get();
    return value === undefined
      ? undefined
      : PersistedExecutionSchema.parse(value);
  }

  public bindLease(id: LocalExecutionId, leaseId: LeaseId, runId: RunId): void {
    this.handle.db
      .update(localExecutions)
      .set({
        leaseId,
        runId,
        lifecycleStatus: 'starting_run',
        lastConfirmedRemoteStage: 'lease_acquired',
        updatedAt: this.now(),
      })
      .where(eq(localExecutions.id, id))
      .run();
  }

  public confirmClaim(
    operationId: string,
    executionId: LocalExecutionId,
    jobId: JobId,
    leaseId: LeaseId,
    runId: RunId,
  ): void {
    const now = this.now();
    this.handle.db.transaction((tx) => {
      tx.update(localExecutions)
        .set({
          jobId,
          leaseId,
          runId,
          lifecycleStatus: 'starting_run',
          lastConfirmedRemoteStage: 'lease_acquired',
          updatedAt: now,
        })
        .where(eq(localExecutions.id, executionId))
        .run();
      tx.update(pendingOperations)
        .set({ status: 'confirmed', confirmedAt: now, updatedAt: now })
        .where(eq(pendingOperations.id, operationId))
        .run();
    });
  }

  public updateExecution(
    id: LocalExecutionId,
    change: {
      readonly lifecycleStatus?: ExecutionLifecycleStatus;
      readonly recoveryStatus?: ExecutionRecoveryStatus;
      readonly progressMessage?: string | null;
      readonly lastProgressSequence?: number;
      readonly lastConfirmedRemoteStage?: string | null;
      readonly remoteSnapshotJson?: string | null;
      readonly failureCode?: string | null;
      readonly failureMessage?: string | null;
      readonly retryable?: boolean | null;
      readonly cancellationRequestedAt?: number | null;
    },
  ): void {
    this.handle.db
      .update(localExecutions)
      .set({ ...change, updatedAt: this.now() })
      .where(eq(localExecutions.id, id))
      .run();
  }

  public markTerminal(
    id: LocalExecutionId,
    status: Extract<
      ExecutionLifecycleStatus,
      'completed' | 'cancelled' | 'failed' | 'interrupted'
    >,
    input: {
      readonly code?: string;
      readonly message?: string;
      readonly retryable?: boolean;
    } = {},
  ): void {
    const now = this.now();
    this.handle.db
      .update(localExecutions)
      .set({
        lifecycleStatus: status,
        recoveryStatus: 'reconciled',
        terminalAt: now,
        updatedAt: now,
        failureCode: input.code ?? null,
        failureMessage: input.message ?? null,
        retryable: input.retryable ?? null,
      })
      .where(eq(localExecutions.id, id))
      .run();
  }

  public markTerminalNotified(id: LocalExecutionId): void {
    this.handle.db
      .update(localExecutions)
      .set({ terminalNotifiedAt: this.now(), updatedAt: this.now() })
      .where(eq(localExecutions.id, id))
      .run();
  }

  public appendEvent(event: PersistedEvent): void {
    this.handle.db.transaction((tx) => {
      tx.insert(localExecutionEvents).values(event).onConflictDoNothing().run();
      tx.update(localExecutions)
        .set({ lastRunnerSequence: event.sequence, updatedAt: this.now() })
        .where(
          and(
            eq(localExecutions.id, event.executionId),
            sql`${localExecutions.lastRunnerSequence} < ${event.sequence}`,
          ),
        )
        .run();
      tx.run(sql`
        DELETE FROM ${localExecutionEvents}
        WHERE ${localExecutionEvents.executionId} = ${event.executionId}
          AND ${localExecutionEvents.sequence} NOT IN (
            SELECT ${localExecutionEvents.sequence}
            FROM ${localExecutionEvents}
            WHERE ${localExecutionEvents.executionId} = ${event.executionId}
            ORDER BY ${localExecutionEvents.sequence} DESC
            LIMIT 100
          )
      `);
    });
  }

  public events(executionId: LocalExecutionId): readonly PersistedEvent[] {
    return this.handle.db
      .select()
      .from(localExecutionEvents)
      .where(eq(localExecutionEvents.executionId, executionId))
      .orderBy(asc(localExecutionEvents.sequence))
      .all() as readonly PersistedEvent[];
  }

  public recordApproval(input: {
    readonly id: ApprovalId;
    readonly executionId: LocalExecutionId;
    readonly runId?: RunId;
    readonly domain: string;
    readonly reason: string;
    readonly requestedAt: number;
  }): void {
    const now = this.now();
    this.handle.db
      .insert(localApprovals)
      .values({
        ...input,
        presentationStatus: 'pending',
        authoritativeStatus: 'pending',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: localApprovals.id,
        set: {
          presentationStatus: 'pending',
          authoritativeStatus: 'pending',
          updatedAt: now,
        },
      })
      .run();
  }

  public recordApprovalDecision(
    id: ApprovalId,
    decision: 'approved' | 'denied',
    reason?: string,
  ): void {
    this.handle.db
      .update(localApprovals)
      .set({
        presentationStatus: 'decision_attempted',
        attemptedDecision: decision,
        denialReason: reason ?? null,
        decisionAttemptedAt: this.now(),
        updatedAt: this.now(),
      })
      .where(eq(localApprovals.id, id))
      .run();
  }

  public reconcileApproval(
    id: ApprovalId,
    status: 'approved' | 'denied',
    resolvedAt: number,
  ): void {
    this.handle.db
      .update(localApprovals)
      .set({
        presentationStatus: 'reconciled',
        authoritativeStatus: status,
        resolvedAt,
        updatedAt: this.now(),
      })
      .where(eq(localApprovals.id, id))
      .run();
  }

  public pendingApproval(executionId: LocalExecutionId) {
    return this.handle.db
      .select()
      .from(localApprovals)
      .where(
        and(
          eq(localApprovals.executionId, executionId),
          inArray(localApprovals.presentationStatus, [
            'pending',
            'decision_attempted',
          ]),
        ),
      )
      .orderBy(desc(localApprovals.requestedAt))
      .get();
  }

  public persistArtifact(input: PersistArtifactInput): void {
    this.handle.db.transaction((tx) => {
      tx.insert(localArtifacts)
        .values({
          ...input,
          validationStatus: 'validated',
          submissionStatus: 'local_only',
          updatedAt: input.createdAt,
        })
        .onConflictDoUpdate({
          target: localArtifacts.id,
          set: {
            relativePath: input.relativePath,
            contentHash: input.contentHash,
            byteSize: input.byteSize,
            workflowVersionId: input.workflowVersionId,
            outputSchemaHash: input.outputSchemaHash,
            outputSchemaDocumentJson: input.outputSchemaDocumentJson,
            validationStatus: 'validated',
            updatedAt: input.createdAt,
          },
        })
        .run();
      tx.update(localExecutions)
        .set({
          lifecycleStatus: 'artifact_persisted',
          updatedAt: input.createdAt,
        })
        .where(eq(localExecutions.id, input.executionId))
        .run();
    });
  }

  public artifact(id: ArtifactId) {
    return this.handle.db
      .select()
      .from(localArtifacts)
      .where(eq(localArtifacts.id, id))
      .get();
  }

  public artifactsForExecution(executionId: LocalExecutionId) {
    return this.handle.db
      .select()
      .from(localArtifacts)
      .where(eq(localArtifacts.executionId, executionId))
      .orderBy(desc(localArtifacts.createdAt))
      .all();
  }

  public artifactRelativePaths(): ReadonlySet<string> {
    return new Set(
      this.handle.db
        .select({ relativePath: localArtifacts.relativePath })
        .from(localArtifacts)
        .all()
        .map(({ relativePath }) => relativePath),
    );
  }

  public markArtifactSubmission(
    id: ArtifactId,
    status: 'pending' | 'confirmed' | 'conflict',
  ): void {
    this.handle.db
      .update(localArtifacts)
      .set({
        submissionStatus: status,
        submissionAttempts: sql`${localArtifacts.submissionAttempts} + 1`,
        updatedAt: this.now(),
      })
      .where(eq(localArtifacts.id, id))
      .run();
  }

  public beginOperation(
    executionId: LocalExecutionId,
    payload: PendingOperationPayload,
    idempotencyKey: string,
  ): string {
    const parsed = PendingOperationPayloadSchema.parse(payload);
    const now = this.now();
    const id = `operation_${randomUUID()}`;
    this.handle.db
      .insert(pendingOperations)
      .values({
        id,
        executionId,
        kind: parsed.kind,
        status: 'pending',
        idempotencyKey,
        payloadJson: JSON.stringify(parsed),
        attempts: 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pendingOperations.idempotencyKey,
        set: {
          status: 'pending',
          payloadJson: JSON.stringify(parsed),
          attempts: sql`${pendingOperations.attempts} + 1`,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: now,
        },
      })
      .run();
    return (
      this.handle.db
        .select({ id: pendingOperations.id })
        .from(pendingOperations)
        .where(eq(pendingOperations.idempotencyKey, idempotencyKey))
        .get()?.id ?? id
    );
  }

  public confirmOperation(id: string): void {
    const now = this.now();
    this.handle.db
      .update(pendingOperations)
      .set({ status: 'confirmed', confirmedAt: now, updatedAt: now })
      .where(eq(pendingOperations.id, id))
      .run();
  }

  public failOperation(id: string, code: string, safeMessage: string): void {
    this.handle.db
      .update(pendingOperations)
      .set({
        status: 'failed',
        lastErrorCode: code,
        lastErrorMessage: safeMessage,
        updatedAt: this.now(),
      })
      .where(eq(pendingOperations.id, id))
      .run();
  }

  public unconfirmedOperations(executionId?: LocalExecutionId) {
    const condition =
      executionId === undefined
        ? inArray(pendingOperations.status, ['pending', 'failed'])
        : and(
            eq(pendingOperations.executionId, executionId),
            inArray(pendingOperations.status, ['pending', 'failed']),
          );
    return this.handle.db
      .select()
      .from(pendingOperations)
      .where(condition)
      .orderBy(asc(pendingOperations.createdAt))
      .all()
      .map((row) => ({
        ...row,
        payload: PendingOperationPayloadSchema.parse(
          JSON.parse(row.payloadJson),
        ),
      }));
  }

  public hasUnsafeResetState(): boolean {
    if (this.incompleteExecutions().length > 0) return true;
    if (this.unconfirmedOperations().length > 0) return true;
    return this.handle.db
      .select({ submissionStatus: localArtifacts.submissionStatus })
      .from(localArtifacts)
      .all()
      .some(({ submissionStatus }) => submissionStatus !== 'confirmed');
  }

  public prune(): void {
    const now = this.now();
    const operationCutoff = now - 7 * 24 * 60 * 60 * 1_000;
    this.handle.db
      .delete(pendingOperations)
      .where(
        and(
          eq(pendingOperations.status, 'confirmed'),
          lt(pendingOperations.updatedAt, operationCutoff),
        ),
      )
      .run();

    const historyCutoff = now - 30 * 24 * 60 * 60 * 1_000;
    const protectedIds = this.handle.db
      .select({ id: localExecutions.id })
      .from(localExecutions)
      .where(isNotNull(localExecutions.terminalAt))
      .orderBy(desc(localExecutions.terminalAt))
      .limit(50)
      .all()
      .map(({ id }) => id);
    const oldTerminal = and(
      isNotNull(localExecutions.terminalAt),
      lt(localExecutions.terminalAt, historyCutoff),
    );
    this.handle.db
      .delete(localExecutions)
      .where(
        protectedIds.length === 0
          ? oldTerminal
          : and(
              oldTerminal,
              sql`${localExecutions.id} NOT IN (${sql.join(
                protectedIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
      )
      .run();
  }
}
