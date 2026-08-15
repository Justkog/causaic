import {
  CoordinatorError,
  CoordinatorUnavailableError,
} from '@causaic/coordinator-core';
import type { CoordinatorErrorCode } from '@causaic/coordinator-core';
import {
  CoordinatorBackendErrorCodeSchema,
  type CoordinatorBackendErrorCode,
} from '@causaic/protocol';

const backendCodeMap = {
  APPROVAL_ALREADY_PENDING: 'approval_already_resolved',
  APPROVAL_DECISION_CONFLICT: 'approval_already_resolved',
  APPROVAL_EXPIRED: 'approval_already_resolved',
  APPROVAL_ID_CONFLICT: 'approval_already_resolved',
  APPROVAL_LEASE_MISMATCH: 'approval_already_resolved',
  APPROVAL_NOT_FOUND: 'approval_not_found',
  APPROVAL_PENDING: 'artifact_rejected',
  ARTIFACT_ID_CONFLICT: 'artifact_rejected',
  ARTIFACT_NOT_FOUND: 'artifact_rejected',
  ARTIFACT_NOT_SUBMITTED: 'artifact_rejected',
  ARTIFACT_RUN_MISMATCH: 'artifact_rejected',
  CAMPAIGN_NOT_FOUND: 'job_unavailable',
  CAUSE_NOT_FOUND: 'job_unavailable',
  COMPLETION_CONFLICT: 'invalid_run_state',
  FAILURE_CONFLICT: 'invalid_run_state',
  INVALID_APPROVAL_DECISION: 'invalid_request',
  INVALID_APPROVAL_REQUEST: 'invalid_request',
  INVALID_ARGUMENT: 'invalid_request',
  INVALID_ARTIFACT_SCHEMA_VERSION: 'artifact_rejected',
  INVALID_CONTENT_HASH: 'artifact_rejected',
  INVALID_EXTERNAL_ID: 'invalid_request',
  INVALID_FAILURE: 'invalid_request',
  INVALID_JOB_TRANSITION: 'invalid_run_state',
  INVALID_LEASE_DURATION: 'invalid_request',
  INVALID_LIMIT: 'invalid_request',
  INVALID_RUN_TRANSITION: 'invalid_run_state',
  JOB_ALREADY_LEASED: 'lease_conflict',
  JOB_NOT_FOUND: 'job_not_found',
  JOB_UNAVAILABLE: 'job_unavailable',
  JOB_NOT_LEASED: 'invalid_run_state',
  LEASE_EXPIRED: 'lease_expired',
  LEASE_ID_CONFLICT: 'lease_conflict',
  LEASE_JOB_MISMATCH: 'invalid_run_state',
  LEASE_NODE_MISMATCH: 'lease_node_mismatch',
  LEASE_NOT_ACTIVE: 'lease_not_active',
  LEASE_NOT_FOUND: 'lease_not_found',
  MALFORMED_ARTIFACT: 'artifact_rejected',
  PROGRESS_SEQUENCE_CONFLICT: 'invalid_run_state',
  RUN_ALREADY_EXISTS: 'invalid_run_state',
  RUN_CANNOT_SUBMIT_ARTIFACT: 'artifact_rejected',
  RUN_ID_CONFLICT: 'invalid_run_state',
  RUN_JOB_MISMATCH: 'invalid_run_state',
  RUN_LEASE_MISMATCH: 'invalid_run_state',
  RUN_NOT_FOUND: 'run_not_found',
  RUN_TERMINAL: 'invalid_run_state',
  UNAUTHORIZED_NODE: 'unauthorized_node',
  WORKFLOW_NOT_FOUND: 'job_unavailable',
} as const satisfies Readonly<
  Record<CoordinatorBackendErrorCode, CoordinatorErrorCode>
>;

function backendCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const data = 'data' in error ? error.data : undefined;
  if (typeof data === 'object' && data !== null && 'code' in data) {
    return typeof data.code === 'string' ? data.code : undefined;
  }
  return undefined;
}

export function mapConvexCoordinatorError(error: unknown): CoordinatorError {
  if (error instanceof CoordinatorError) return error;
  const code = backendCode(error);
  const parsedCode = CoordinatorBackendErrorCodeSchema.safeParse(code);
  const mappedCode = parsedCode.success
    ? backendCodeMap[parsedCode.data]
    : undefined;
  if (mappedCode !== undefined) {
    return new CoordinatorError(
      mappedCode,
      `Convex coordinator rejected the operation (${code}).`,
      { cause: error },
    );
  }
  return new CoordinatorUnavailableError(
    code === undefined
      ? 'The Convex coordinator is unavailable.'
      : `The Convex coordinator returned an unmapped error (${code}).`,
    { cause: error },
  );
}
