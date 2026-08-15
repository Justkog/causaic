import { contextBridge, ipcRenderer } from 'electron';

import { ipcChannels } from '../shared/channels.js';
import {
  CancelExecutionRequestSchema,
  DesktopStateSchema,
  FocusTargetSchema,
  OpenExternalRequestSchema,
  ResolveApprovalRequestSchema,
  ResetLocalStateRequestSchema,
  SetPausedRequestSchema,
  SetSelectedViewRequestSchema,
  StartExecutionRequestSchema,
} from '../shared/contracts.js';
import type { CausaicDesktopApi } from '../shared/contracts.js';

const stateResult = async (promise: Promise<unknown>) =>
  DesktopStateSchema.parse(await promise);

const api: CausaicDesktopApi = {
  getState: () => stateResult(ipcRenderer.invoke(ipcChannels.getState)),
  refreshJobs: () => stateResult(ipcRenderer.invoke(ipcChannels.refreshJobs)),
  startExecution: (request) =>
    stateResult(
      ipcRenderer.invoke(
        ipcChannels.startExecution,
        StartExecutionRequestSchema.parse(request),
      ),
    ),
  cancelExecution: (request) =>
    stateResult(
      ipcRenderer.invoke(
        ipcChannels.cancelExecution,
        CancelExecutionRequestSchema.parse(request),
      ),
    ),
  resolveApproval: (request) =>
    stateResult(
      ipcRenderer.invoke(
        ipcChannels.resolveApproval,
        ResolveApprovalRequestSchema.parse(request),
      ),
    ),
  setPaused: (request) =>
    stateResult(
      ipcRenderer.invoke(
        ipcChannels.setPaused,
        SetPausedRequestSchema.parse(request),
      ),
    ),
  setSelectedView: (request) =>
    stateResult(
      ipcRenderer.invoke(
        ipcChannels.setSelectedView,
        SetSelectedViewRequestSchema.parse(request),
      ),
    ),
  openExternal: async (request) => {
    await ipcRenderer.invoke(
      ipcChannels.openExternal,
      OpenExternalRequestSchema.parse(request),
    );
  },
  resetLocalState: async (request) => {
    await ipcRenderer.invoke(
      ipcChannels.resetLocalState,
      ResetLocalStateRequestSchema.parse(request),
    );
  },
  quit: async () => {
    await ipcRenderer.invoke(ipcChannels.quit);
  },
  onStateChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: unknown) =>
      listener(DesktopStateSchema.parse(value));
    ipcRenderer.on(ipcChannels.stateChanged, wrapped);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(ipcChannels.stateChanged, wrapped);
    };
  },
  onFocusTarget: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: unknown) =>
      listener(FocusTargetSchema.parse(value));
    ipcRenderer.on(ipcChannels.focusTarget, wrapped);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(ipcChannels.focusTarget, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('causaicDesktop', api);
