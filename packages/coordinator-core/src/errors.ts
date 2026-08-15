export type CoordinatorErrorCode =
  | 'invalid_request'
  | 'job_not_found'
  | 'job_unavailable'
  | 'lease_conflict'
  | 'lease_expired'
  | 'run_not_found'
  | 'invalid_run_state'
  | 'approval_not_found'
  | 'approval_already_resolved'
  | 'artifact_rejected'
  | 'lease_not_found'
  | 'lease_not_active'
  | 'lease_node_mismatch'
  | 'unauthorized_node'
  | 'protocol_mismatch'
  | 'coordinator_unavailable';

export class CoordinatorError extends Error {
  public constructor(
    public readonly code: CoordinatorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CoordinatorError';
  }
}

export class CoordinatorUnavailableError extends CoordinatorError {
  public constructor(message: string, options?: ErrorOptions) {
    super('coordinator_unavailable', message, options);
    this.name = 'CoordinatorUnavailableError';
  }
}

export class CoordinatorProtocolMismatchError extends CoordinatorError {
  public constructor(message: string, options?: ErrorOptions) {
    super('protocol_mismatch', message, options);
    this.name = 'CoordinatorProtocolMismatchError';
  }
}
