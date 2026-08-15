import { ApprovalIdSchema } from '@causaic/protocol';
import { RuntimeApprovalRequestSchema } from '@causaic/runtime-core';
import { describe, expect, it, vi } from 'vitest';

import { ElectronApprovalProvider } from './approval-provider.js';

const request = RuntimeApprovalRequestSchema.parse({
  id: ApprovalIdSchema.parse('approval_desktop-test'),
  type: 'network_access',
  domain: 'example.gov',
  reason: 'Read a public source',
});

describe('ElectronApprovalProvider', () => {
  it('resolves one matching decision and rejects duplicates', async () => {
    const onPending = vi.fn();
    const provider = new ElectronApprovalProvider(onPending);
    const decision = provider.requestDecision(
      request,
      new AbortController().signal,
    );
    provider.resolve({ approvalId: request.id, decision: 'approved' });
    await expect(decision).resolves.toEqual({ decision: 'approved' });
    expect(() =>
      provider.resolve({ approvalId: request.id, decision: 'approved' }),
    ).toThrow(/no longer pending/i);
    expect(onPending).toHaveBeenLastCalledWith(undefined);
  });

  it('rejects the provider wait when execution is aborted', async () => {
    const controller = new AbortController();
    const provider = new ElectronApprovalProvider(() => undefined);
    const decision = provider.requestDecision(request, controller.signal);
    controller.abort();
    await expect(decision).rejects.toThrow(/cancelled/i);
  });
});
