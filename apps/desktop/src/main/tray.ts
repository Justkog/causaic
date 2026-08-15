import type { MenuItemConstructorOptions } from 'electron';

import type { DesktopState } from '../shared/contracts.js';

export interface TrayActions {
  readonly open: () => void;
  readonly setPaused: (paused: boolean) => void;
  readonly cancel: () => void;
  readonly quit: () => void;
}

export function trayMenuTemplate(
  state: DesktopState,
  actions: TrayActions,
): MenuItemConstructorOptions[] {
  return [
    {
      label: `${state.availableJobs.length} available job${state.availableJobs.length === 1 ? '' : 's'}`,
      enabled: false,
    },
    {
      label:
        state.currentExecution === null
          ? 'No active execution'
          : `Execution: ${state.currentExecution.status.replaceAll('_', ' ')}`,
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Open Causaic', click: actions.open },
    {
      label: state.paused ? 'Resume new jobs' : 'Pause new jobs',
      click: () => actions.setPaused(!state.paused),
    },
    {
      label: 'Cancel active execution',
      enabled:
        state.currentExecution !== null &&
        state.currentExecution.status !== 'cancelling',
      click: actions.cancel,
    },
    { type: 'separator' },
    { label: 'Quit', click: actions.quit },
  ];
}
