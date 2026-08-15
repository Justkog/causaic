export type DesktopErrorCode =
  | 'backend_unavailable'
  | 'configuration_invalid'
  | 'execution_active'
  | 'internal_failure'
  | 'invalid_request'
  | 'job_stale'
  | 'approval_not_pending';

export class DesktopError extends Error {
  public override readonly name = 'DesktopError';

  public constructor(
    public readonly code: DesktopErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
  }
}

export function safeDesktopError(error: unknown): DesktopError {
  if (error instanceof DesktopError) return error;
  if (error instanceof z.ZodError)
    return new DesktopError(
      'invalid_request',
      'The desktop request did not match the expected schema.',
      { cause: error },
    );
  return new DesktopError(
    'internal_failure',
    'The desktop application could not complete the request.',
    { cause: error },
  );
}
import { z } from 'zod';
