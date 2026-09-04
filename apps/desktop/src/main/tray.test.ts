import { describe, expect, it, vi } from 'vitest';

import { initialDesktopState } from '../shared/contracts.js';
import { trayMenuTemplate } from './tray.js';

describe('trayMenuTemplate', () => {
  it('derives pause and execution actions from authoritative desktop state', () => {
    const actions = {
      open: vi.fn(),
      setPaused: vi.fn(),
      cancel: vi.fn(),
      quit: vi.fn(),
    };
    const menu = trayMenuTemplate(initialDesktopState(), actions);
    expect(menu.map(({ label }) => label)).toContain('Pause new opportunities');
    expect(
      menu.find(({ label }) => label === 'Cancel active execution')?.enabled,
    ).toBe(false);
  });
});
