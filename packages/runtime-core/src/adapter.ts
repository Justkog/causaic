import type { AgentTaskDefinition } from '@causaic/protocol';
import type {
  ApprovalDecision,
  PreparedSession,
  RuntimeEvent,
  RuntimeInstallation,
  RuntimeSessionContext,
  PreparedValidationSession,
  ValidationApprovalDecision,
  ValidationRuntimeEvent,
  ValidationRuntimeSessionContext,
} from './schemas.js';

export type RuntimeAdapterErrorCode =
  | 'unknown_session'
  | 'session_conflict'
  | 'session_already_executed'
  | 'approval_not_pending'
  | 'approval_mismatch'
  | 'approval_already_resolved';

export class RuntimeAdapterError extends Error {
  public constructor(
    public readonly code: RuntimeAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuntimeAdapterError';
  }
}

export interface AgentRuntimeAdapter {
  detect(): Promise<RuntimeInstallation[]>;
  supports(
    installation: RuntimeInstallation,
    task: AgentTaskDefinition,
  ): boolean;
  prepareSession(context: RuntimeSessionContext): Promise<PreparedSession>;
  execute(
    session: PreparedSession,
    signal: AbortSignal,
  ): AsyncIterable<RuntimeEvent>;
  resolveApproval(sessionId: string, decision: ApprovalDecision): Promise<void>;
}

export interface AgentValidationRuntimeAdapter {
  prepareValidationSession(
    context: ValidationRuntimeSessionContext,
  ): Promise<PreparedValidationSession>;
  executeValidation(
    session: PreparedValidationSession,
    signal: AbortSignal,
  ): AsyncIterable<ValidationRuntimeEvent>;
  resolveValidationApproval(
    sessionId: string,
    decision: ValidationApprovalDecision,
  ): Promise<void>;
}

export type RuntimeAdapter = AgentRuntimeAdapter;
