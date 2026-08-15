export const ipcChannels = {
  getState: 'desktop:state:get',
  stateChanged: 'desktop:state:changed',
  focusTarget: 'desktop:focus-target',
  refreshJobs: 'desktop:jobs:refresh',
  startExecution: 'desktop:execution:start',
  cancelExecution: 'desktop:execution:cancel',
  resolveApproval: 'desktop:approval:resolve',
  setPaused: 'desktop:contribution:set-paused',
  setSelectedView: 'desktop:navigation:set-view',
  openExternal: 'desktop:app:open-external',
  resetLocalState: 'desktop:local-state:reset',
  quit: 'desktop:app:quit',
} as const;
