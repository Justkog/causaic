import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';

import { ipcChannels } from '../shared/channels.js';
import {
  CancelExecutionRequestSchema,
  DesktopStateSchema,
  OpenExternalRequestSchema,
  ResolveApprovalRequestSchema,
  ResetLocalStateRequestSchema,
  SetPausedRequestSchema,
  SetSelectedViewRequestSchema,
  StartExecutionRequestSchema,
} from '../shared/contracts.js';
import { DesktopError, safeDesktopError } from '../shared/errors.js';
import type { BackendMonitor } from './backend-monitor.js';
import type { DesktopExecutionController } from './execution-controller.js';
import type { DesktopStateStore } from './state.js';
import type { FocusTarget } from '../shared/contracts.js';

export interface DesktopIpcDependencies {
  readonly ipcMain: IpcMain;
  readonly getWindow: () => BrowserWindow | null;
  readonly state: DesktopStateStore;
  readonly monitor?: BackendMonitor;
  readonly controller?: DesktopExecutionController;
  readonly openExternal: (url: string) => Promise<void>;
  readonly requestQuit: () => Promise<void>;
  readonly requestResetLocalState?: () => Promise<void>;
  readonly setPaused?: (paused: boolean) => void;
  readonly setSelectedView?: (view: FocusTarget) => void;
}

function assertSender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow | null,
): void {
  if (window === null || event.sender !== window.webContents)
    throw new DesktopError('invalid_request', 'IPC sender is not allowed.');
}

function allowedExternalUrls(state: ReturnType<DesktopStateStore['get']>) {
  const urls = (value: unknown): string[] => {
    if (typeof value === 'string') {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' ? [value] : [];
      } catch {
        return [];
      }
    }
    if (Array.isArray(value)) return value.flatMap(urls);
    if (value !== null && typeof value === 'object')
      return Object.values(value).flatMap(urls);
    return [];
  };
  return new Set([
    ...state.availableJobs.flatMap(({ job }) => urls(job.input)),
    ...urls(state.recentExecution?.artifact?.content),
  ]);
}

export function registerDesktopIpc(
  dependencies: DesktopIpcDependencies,
): () => void {
  const { ipcMain } = dependencies;
  const handle = <Result>(
    channel: string,
    operation: (
      event: IpcMainInvokeEvent,
      value: unknown,
    ) => Promise<Result> | Result,
  ) => {
    ipcMain.handle(channel, async (event, value: unknown) => {
      try {
        assertSender(event, dependencies.getWindow());
        return await operation(event, value);
      } catch (error) {
        const safe = safeDesktopError(error);
        throw new Error(`${safe.code}: ${safe.message}`, { cause: error });
      }
    });
  };

  handle(ipcChannels.getState, () =>
    DesktopStateSchema.parse(dependencies.state.get()),
  );
  handle(ipcChannels.refreshJobs, async () => {
    if (dependencies.monitor === undefined)
      throw new DesktopError(
        'configuration_invalid',
        'Desktop development configuration is invalid.',
      );
    await dependencies.monitor.refresh();
    return DesktopStateSchema.parse(dependencies.state.get());
  });
  handle(ipcChannels.startExecution, async (_event, value) => {
    if (dependencies.controller === undefined)
      throw new DesktopError(
        'configuration_invalid',
        'Desktop development configuration is invalid.',
      );
    const request = StartExecutionRequestSchema.parse(value);
    return DesktopStateSchema.parse(
      await dependencies.controller.start(request.jobId),
    );
  });
  handle(ipcChannels.cancelExecution, async (_event, value) => {
    if (dependencies.controller === undefined)
      throw new DesktopError(
        'configuration_invalid',
        'Desktop development configuration is invalid.',
      );
    const request = CancelExecutionRequestSchema.parse(value ?? {});
    return DesktopStateSchema.parse(
      await dependencies.controller.cancel(request.reason),
    );
  });
  handle(ipcChannels.resolveApproval, (_event, value) => {
    if (dependencies.controller === undefined)
      throw new DesktopError(
        'configuration_invalid',
        'Desktop development configuration is invalid.',
      );
    return DesktopStateSchema.parse(
      dependencies.controller.resolveApproval(
        ResolveApprovalRequestSchema.parse(value),
      ),
    );
  });
  handle(ipcChannels.setPaused, (_event, value) => {
    const request = SetPausedRequestSchema.parse(value);
    dependencies.setPaused?.(request.paused);
    return DesktopStateSchema.parse(
      dependencies.state.update((state) => ({
        ...state,
        paused: request.paused,
      })),
    );
  });
  handle(ipcChannels.setSelectedView, (_event, value) => {
    const request = SetSelectedViewRequestSchema.parse(value);
    dependencies.setSelectedView?.(request.view);
    return DesktopStateSchema.parse(
      dependencies.state.update((state) => ({
        ...state,
        lastSelectedView: request.view,
      })),
    );
  });
  handle(ipcChannels.openExternal, async (_event, value) => {
    const { url } = OpenExternalRequestSchema.parse(value);
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !allowedExternalUrls(dependencies.state.get()).has(url)
    )
      throw new DesktopError(
        'invalid_request',
        'This external URL is not allowed.',
      );
    await dependencies.openExternal(url);
  });
  handle(ipcChannels.resetLocalState, async (_event, value) => {
    ResetLocalStateRequestSchema.parse(value);
    if (dependencies.requestResetLocalState === undefined)
      throw new DesktopError(
        'configuration_invalid',
        'Local persistence is not available.',
      );
    await dependencies.requestResetLocalState();
  });
  handle(ipcChannels.quit, async () => dependencies.requestQuit());

  return () => {
    for (const channel of [
      ipcChannels.getState,
      ipcChannels.refreshJobs,
      ipcChannels.startExecution,
      ipcChannels.cancelExecution,
      ipcChannels.resolveApproval,
      ipcChannels.setPaused,
      ipcChannels.setSelectedView,
      ipcChannels.openExternal,
      ipcChannels.resetLocalState,
      ipcChannels.quit,
    ])
      ipcMain.removeHandler(channel);
  };
}
