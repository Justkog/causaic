export type RunnerLifecycleStage =
  | 'selection'
  | 'leasing'
  | 'starting_run'
  | 'preparing_runtime'
  | 'executing_runtime'
  | 'approval'
  | 'artifact_validation'
  | 'artifact_persistence'
  | 'artifact_submission'
  | 'completion'
  | 'cleanup';

export class RunnerExecutionError extends Error {
  public override readonly name = 'RunnerExecutionError';

  public constructor(
    public readonly code: string,
    public readonly stage: RunnerLifecycleStage,
    public readonly retryable: boolean,
    message: string,
    options?: { readonly cause?: unknown; readonly cleanupError?: unknown },
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.cleanupError = options?.cleanupError;
  }

  public readonly cleanupError?: unknown;
}

export function runnerError(
  error: unknown,
  stage: RunnerLifecycleStage,
  defaults?: {
    readonly code?: string;
    readonly message?: string;
    readonly retryable?: boolean;
  },
): RunnerExecutionError {
  if (error instanceof RunnerExecutionError) return error;
  const coded = error as {
    readonly code?: unknown;
    readonly message?: unknown;
  };
  const code =
    typeof coded?.code === 'string'
      ? coded.code
      : (defaults?.code ?? 'runner_execution_failed');
  const message =
    typeof coded?.message === 'string'
      ? coded.message
      : (defaults?.message ?? 'The runner execution failed');
  return new RunnerExecutionError(
    code,
    stage,
    defaults?.retryable ?? true,
    message,
    { cause: error },
  );
}
