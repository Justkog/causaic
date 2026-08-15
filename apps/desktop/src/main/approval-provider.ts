import type { ApprovalId } from '@causaic/protocol';
import type { ApprovalProvider } from '@causaic/runner-core';
import type { RuntimeApprovalRequest } from '@causaic/runtime-core';

import type { ResolveApprovalRequest } from '../shared/contracts.js';
import { DesktopError } from '../shared/errors.js';

interface PendingDecision {
  readonly request: RuntimeApprovalRequest;
  readonly resolve: (
    value:
      | { readonly decision: 'approved' }
      | { readonly decision: 'denied'; readonly reason: string },
  ) => void;
  readonly reject: (error: Error) => void;
  readonly removeAbortListener: () => void;
}

export class ElectronApprovalProvider implements ApprovalProvider {
  #pending: PendingDecision | undefined;

  public constructor(
    private readonly onPending: (
      request: RuntimeApprovalRequest | undefined,
    ) => void,
  ) {}

  public requestDecision(
    request: RuntimeApprovalRequest,
    signal: AbortSignal,
  ): Promise<
    | { readonly decision: 'approved' }
    | { readonly decision: 'denied'; readonly reason: string }
  > {
    if (this.#pending !== undefined)
      return Promise.reject(
        new DesktopError(
          'execution_active',
          'Another approval decision is already pending.',
        ),
      );

    return new Promise((resolve, reject) => {
      const abort = () => {
        this.#clear(request.id);
        reject(new Error('Approval cancelled with the execution'));
      };
      signal.addEventListener('abort', abort, { once: true });
      this.#pending = {
        request,
        resolve,
        reject,
        removeAbortListener: () => signal.removeEventListener('abort', abort),
      };
      this.onPending(request);
      if (signal.aborted) abort();
    });
  }

  public resolve(request: ResolveApprovalRequest): void {
    const pending = this.#pending;
    if (pending === undefined || pending.request.id !== request.approvalId)
      throw new DesktopError(
        'approval_not_pending',
        'This approval is no longer pending.',
      );
    this.#clear(request.approvalId);
    pending.resolve(
      request.decision === 'approved'
        ? { decision: 'approved' }
        : { decision: 'denied', reason: request.reason },
    );
  }

  public cancel(reason = 'Approval cancelled'): void {
    const pending = this.#pending;
    if (pending === undefined) return;
    this.#clear(pending.request.id);
    pending.reject(new Error(reason));
  }

  #clear(id: ApprovalId): void {
    if (this.#pending?.request.id !== id) return;
    this.#pending.removeAbortListener();
    this.#pending = undefined;
    this.onPending(undefined);
  }
}
