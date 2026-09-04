import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  CirclePause,
  LoaderCircle,
  Play,
  RefreshCw,
  Settings,
  Square,
  TerminalSquare,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { FocusTarget } from '../shared/contracts.js';
import { Button } from './components/button.js';
import { Card } from './components/card.js';
import { formatDate } from './lib/utils.js';
import { useDesktopState } from './state-provider.js';

function ConnectionStatus() {
  const { state } = useDesktopState();
  const connected = state.connection.status === 'connected';
  const configurationFailure =
    state.connection.status === 'failed_configuration' ||
    state.connection.status === 'failed_local_storage';
  return (
    <div className="flex items-center gap-2 text-sm" aria-live="polite">
      {connected ? (
        <Wifi className="h-4 w-4 text-emerald-700" aria-hidden />
      ) : configurationFailure ? (
        <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden />
      ) : (
        <WifiOff className="h-4 w-4 text-amber-700" aria-hidden />
      )}
      <span className="font-medium capitalize">
        {state.connection.status.replaceAll('_', ' ')}
      </span>
      {state.connection.stale && (
        <span className="text-amber-800">Last-known opportunities</span>
      )}
    </div>
  );
}

function JobsView() {
  const { state, refresh, start } = useDesktopState();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = state.availableOpportunities.find(
    ({ id }) => id === selectedId,
  );
  const canStart =
    !state.paused &&
    state.connection.status === 'connected' &&
    !state.connection.stale &&
    state.currentExecution === null &&
    (state.recovery.status === 'recovered' ||
      state.recovery.status === 'not_started');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">
            Available opportunities
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Choose one opportunity and review it before contributing.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>

      {state.paused && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          New contributions are paused. The opportunity list continues to
          refresh.
        </div>
      )}

      {state.availableOpportunities.length === 0 ? (
        <Card>
          <h2 className="font-semibold">No compatible work is available</h2>
          <p className="mt-2 text-sm text-slate-600">
            An opportunity may have been claimed elsewhere. Keep this app open
            or refresh later.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {state.availableOpportunities.map((opportunity) => (
            <Card key={opportunity.id} className="flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">
                  {opportunity.capacityClass ?? 'standard'}
                </span>
                <span className="text-xs text-slate-500">
                  ~{opportunity.estimatedDurationMinutes} min
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold">
                {opportunity.objective ?? opportunity.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {opportunity.campaign.name}
              </p>
              <div className="mt-auto pt-5">
                <Button
                  disabled={!canStart}
                  onClick={() => setSelectedId(opportunity.id)}
                >
                  <Play className="mr-2 h-4 w-4" aria-hidden /> Review and start
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected !== undefined && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-title"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5"
        >
          <Card className="max-w-xl">
            <h2 id="start-title" className="text-xl font-semibold">
              Start this contribution?
            </h2>
            <p className="mt-3 text-sm text-slate-700">
              {selected.objective ?? selected.title}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              The runtime will request approval before accessing the declared
              public source.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setSelectedId(undefined)}
              >
                Not now
              </Button>
              <Button
                onClick={() => {
                  const opportunityId = selected.id;
                  setSelectedId(undefined);
                  void start(opportunityId);
                }}
              >
                Start contribution
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ExecutionView() {
  const { state, cancel, resolveApproval } = useDesktopState();
  const current = state.currentExecution;
  const recent = state.recentExecution;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Execution</h1>
        <p className="mt-1 text-sm text-slate-600">
          Only validated, meaningful runner events are shown here.
        </p>
      </div>

      {current === null ? (
        <Card>
          <h2 className="font-semibold">No active execution</h2>
          <p className="mt-2 text-sm text-slate-600">
            Select an available opportunity to begin.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <LoaderCircle
                  className="h-5 w-5 animate-spin text-sky-700"
                  aria-hidden
                />
                <h2 className="text-lg font-semibold capitalize">
                  {current.status.replaceAll('_', ' ')}
                </h2>
              </div>
              <p className="mt-2 text-sm text-slate-700">{current.objective}</p>
              {current.progressMessage !== undefined && (
                <p className="mt-3 rounded-md bg-slate-100 p-3 text-sm">
                  {current.progressMessage}
                </p>
              )}
            </div>
            <Button
              variant="danger"
              disabled={current.status === 'cancelling'}
              onClick={() => void cancel()}
            >
              <Square className="mr-2 h-4 w-4" aria-hidden /> Cancel
            </Button>
          </div>

          {current.pendingApproval !== undefined && (
            <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <h3 className="font-semibold text-amber-950">
                Approval required
              </h3>
              <p className="mt-2 text-sm text-amber-950">
                {current.pendingApproval.reason}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Domain: {current.pendingApproval.domain}
              </p>
              {current.pendingApproval.recoveryOnly && (
                <p className="mt-2 text-sm text-amber-900">
                  The runtime process no longer exists, so this approval cannot
                  resume it. Cancel the interrupted execution to release the
                  work safely.
                </p>
              )}
              <div className="mt-4 flex gap-3">
                {current.pendingApproval.recoveryOnly ? (
                  <Button variant="danger" onClick={() => void cancel()}>
                    End interrupted execution
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() =>
                        void resolveApproval({
                          approvalId: current.pendingApproval!.id,
                          decision: 'approved',
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void resolveApproval({
                          approvalId: current.pendingApproval!.id,
                          decision: 'denied',
                          reason:
                            'The contributor denied the requested access.',
                        })
                      }
                    >
                      Deny
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          <h3 className="mt-6 font-semibold">Recent activity</h3>
          <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
            {current.events.map((event) => (
              <li key={event.sequence} className="text-sm">
                <p className="font-medium text-slate-800">{event.message}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(event.occurredAt)}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {recent !== null && (
        <Card>
          <div className="flex items-center gap-2">
            {recent.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden />
            )}
            <h2 className="text-lg font-semibold capitalize">
              Recent result: {recent.status}
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-700">{recent.message}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(recent.finishedAt)}
          </p>
          {recent.artifact !== undefined && (
            <div className="mt-4 rounded-lg bg-slate-100 p-4">
              <pre className="max-h-48 overflow-auto text-xs text-slate-700">
                {JSON.stringify(recent.artifact.content, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function SettingsView() {
  const { state, setPaused, quit, resetLocalState } = useDesktopState();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Development milestone configuration
        </p>
      </div>
      <Card>
        <h2 className="font-semibold">Contribution availability</h2>
        <p className="mt-2 text-sm text-slate-600">
          Pausing prevents new starts and notifications. An active contribution
          continues.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => void setPaused(!state.paused)}
        >
          <CirclePause className="mr-2 h-4 w-4" aria-hidden />
          {state.paused
            ? 'Resume new opportunities'
            : 'Pause new opportunities'}
        </Button>
      </Card>
      <Card>
        <h2 className="font-semibold">Development recovery data</h2>
        <p className="mt-2 text-sm text-slate-600">
          Reset backs up and removes only this desktop installation's SQLite and
          artifact data. Convex is not changed. Unsafe unresolved work prevents
          the reset.
        </p>
        <Button
          className="mt-4"
          variant="danger"
          onClick={() => {
            if (
              window.confirm(
                'Reset local Causaic data after creating a backup? Convex will not be changed.',
              )
            )
              void resetLocalState();
          }}
        >
          Reset local development data
        </Button>
      </Card>
      <Card>
        <h2 className="font-semibold">Local coordinator</h2>
        <p className="mt-2 text-sm text-slate-600">
          URL and development credentials are configured in Electron main and
          are never shown here.
        </p>
        <p className="mt-3 text-sm capitalize">
          Status: {state.connection.status.replaceAll('_', ' ')}
        </p>
      </Card>
      <Button variant="danger" onClick={() => void quit()}>
        Quit Causaic
      </Button>
    </div>
  );
}

export function App() {
  const {
    state,
    loading,
    error,
    focusTarget,
    clearFocusTarget,
    setSelectedView,
  } = useDesktopState();
  const [view, setView] = useState<FocusTarget>(state.lastSelectedView);
  useEffect(() => setView(state.lastSelectedView), [state.lastSelectedView]);
  useEffect(() => {
    if (focusTarget === undefined) return;
    setView(focusTarget);
    void setSelectedView(focusTarget);
    clearFocusTarget();
  }, [clearFocusTarget, focusTarget, setSelectedView]);

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center text-slate-600">
        <LoaderCircle
          className="h-7 w-7 animate-spin"
          aria-label="Loading Causaic"
        />
      </main>
    );

  const navigation = [
    { id: 'jobs' as const, label: 'Opportunities', icon: BriefcaseBusiness },
    { id: 'execution' as const, label: 'Execution', icon: TerminalSquare },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-lg font-bold tracking-tight">Causaic Node</p>
            <p className="text-xs text-slate-500">
              Local development milestone
            </p>
          </div>
          <ConnectionStatus />
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-7 md:grid-cols-[190px_1fr]">
        <nav aria-label="Desktop sections" className="space-y-1">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={view === id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                view === id
                  ? 'bg-sky-100 text-sky-950'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => {
                setView(id);
                void setSelectedView(id);
              }}
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </nav>
        <main>
          {state.recovery.status === 'recovering' && (
            <div className="mb-5 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950">
              Reconciling interrupted work with the local coordinator. New
              executions remain disabled until recovery finishes.
            </div>
          )}
          {state.recovery.status === 'attention_required' && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            >
              <p className="font-semibold">Recovery needs attention</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {state.recovery.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {error !== undefined && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950"
            >
              {error}
            </div>
          )}
          {view === 'jobs' && <JobsView />}
          {view === 'execution' && <ExecutionView />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
