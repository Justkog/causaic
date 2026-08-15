import { describe, expect, it, vi } from 'vitest';

import { DesktopStateStore } from './state.js';

describe('DesktopStateStore', () => {
  it('increments revisions and removes listeners idempotently', () => {
    const state = new DesktopStateStore();
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);
    state.update((current) => ({ ...current, paused: true }));
    expect(state.get()).toMatchObject({ revision: 1, paused: true });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribe();
    state.update((current) => ({ ...current, paused: false }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
