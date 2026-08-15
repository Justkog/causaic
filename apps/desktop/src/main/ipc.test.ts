import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent,
  WebContents,
} from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { ipcChannels } from '../shared/channels.js';
import { registerDesktopIpc } from './ipc.js';
import { DesktopStateStore } from './state.js';

type Handler = (event: IpcMainInvokeEvent, value?: unknown) => Promise<unknown>;

function fixture() {
  const handlers = new Map<string, Handler>();
  const sender = {} as WebContents;
  const window = { webContents: sender } as BrowserWindow;
  const ipcMain = {
    handle: (channel: string, handler: Handler) =>
      handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
  const cleanup = registerDesktopIpc({
    ipcMain,
    getWindow: () => window,
    state: new DesktopStateStore(),
    openExternal: vi.fn(),
    requestQuit: vi.fn(),
  });
  const invoke = (channel: string, value?: unknown, eventSender = sender) => {
    const handler = handlers.get(channel);
    if (handler === undefined) throw new Error(`Missing handler ${channel}`);
    return handler({ sender: eventSender } as IpcMainInvokeEvent, value);
  };
  return { cleanup, handlers, invoke };
}

describe('registerDesktopIpc', () => {
  it('allows only the current renderer and removes every handler', async () => {
    const { cleanup, handlers, invoke } = fixture();
    await expect(invoke(ipcChannels.getState)).resolves.toMatchObject({
      revision: 0,
    });
    await expect(
      invoke(ipcChannels.getState, undefined, {} as WebContents),
    ).rejects.toThrow(/invalid_request/i);
    cleanup();
    expect(handlers.size).toBe(0);
  });

  it('maps malformed payloads to a stable safe code', async () => {
    const { invoke } = fixture();
    await expect(
      invoke(ipcChannels.setPaused, { paused: 'yes', secret: 'hidden' }),
    ).rejects.toThrow(
      'invalid_request: The desktop request did not match the expected schema.',
    );
  });
});
