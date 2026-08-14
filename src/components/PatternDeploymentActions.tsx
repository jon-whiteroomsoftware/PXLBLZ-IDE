import { Check, Play, RotateCw, Save } from 'lucide-react'
import { controlIcon, transportIcon } from '@/components/iconScale'
import { ChipGlyph, ConnectGlyph } from '@/components/ControllerGlyphs'
import type { SendGate, SendMode } from '@/engine/sendToController'
import type { PushResult } from '@/store/controllerStore'

type PatternDeploymentActionsProps = {
  connected: boolean
  controllerName: string | null
  runGate: SendGate
  saveGate: SendGate
  activeMode: SendMode
  preparingLabel?: string
  pushing: boolean
  pushResult: PushResult | null
  density?: 'compact' | 'regular'
  fill?: boolean
  presentation?: 'cluster' | 'facts'
  onConnect: () => void
  onRun: () => void
  onSave: () => void
}

export function PatternDeploymentActions({
  connected,
  controllerName,
  runGate,
  saveGate,
  activeMode,
  preparingLabel,
  pushing,
  pushResult,
  density = 'regular',
  fill = false,
  presentation = 'cluster',
  onConnect,
  onRun,
  onSave,
}: PatternDeploymentActionsProps) {
  const target = controllerName?.trim() || 'Controller'
  const preparing = Boolean(preparingLabel)
  const working = preparing || pushing || !!pushResult?.ok
  const heightClass = density === 'compact' ? 'h-6 text-[10px]' : 'h-8 text-[11px]'
  const actionPadding = density === 'compact' ? 'px-2' : 'px-2.5'
  const identityWidth = density === 'compact' ? 'max-w-36' : 'max-w-44'

  const actionIcon = (mode: SendMode) => {
    if (pushing && activeMode === mode) {
      return <RotateCw {...controlIcon} className="animate-spin text-amber-400" aria-hidden />
    }
    if (pushResult?.ok && activeMode === mode) return <Check {...controlIcon} aria-hidden />
    return mode === 'save'
      ? <Save {...controlIcon} aria-hidden />
      : <Play {...transportIcon} aria-hidden />
  }

  const actionLabel = (mode: SendMode) => (
    pushResult && !pushResult.ok && activeMode === mode
      ? 'Failed'
      : mode === 'save' ? 'Save' : 'Run'
  )

  const actionTitle = (mode: SendMode, gate: SendGate) => {
    if (preparingLabel) return preparingLabel
    if (pushResult && !pushResult.ok && activeMode === mode) return pushResult.message
    if (working) return 'Sending...'
    if (!gate.enabled) return gate.reason
    return mode === 'save' ? `Save to ${target}` : `Run on ${target}`
  }

  if (presentation === 'facts') {
    const actionClass =
      'inline-flex h-6 items-center justify-center gap-1.5 rounded border border-zinc-700 px-2 text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35'
    return (
      <span
        data-testid="pattern-deployment-actions"
        className={`flex min-w-0 flex-1 items-center gap-2 font-mono text-[11.5px] ${fill ? 'w-full' : ''}`}
      >
        <span
          data-testid="controller-deployment-identity"
          aria-label={preparingLabel ?? (connected ? `Controller ${target}` : 'Controller not connected')}
          title={preparingLabel ?? (connected ? target : 'Not connected')}
          className="flex min-w-0 flex-1 items-center gap-2 text-zinc-500"
        >
          {preparing ? (
            <RotateCw {...controlIcon} className="shrink-0 animate-spin text-amber-400" aria-hidden />
          ) : (
            <span
              data-testid="controller-status-dot"
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
          )}
          <span className={`truncate ${preparing ? 'text-amber-300' : connected ? 'text-zinc-300' : 'text-zinc-500'}`}>
            {preparingLabel ?? (connected ? target : 'Not connected')}
          </span>
        </span>
        {connected ? (
          <>
            <button
              type="button"
              aria-label={`Run on ${target}`}
              disabled={!runGate.enabled || working}
              title={actionTitle('run', runGate)}
              onClick={onRun}
              data-testid="run-on-controller"
              className={actionClass}
            >
              {actionIcon('run')}
              {actionLabel('run')}
            </button>
            <button
              type="button"
              aria-label={`Save to ${target}`}
              disabled={!saveGate.enabled || working}
              title={actionTitle('save', saveGate)}
              onClick={onSave}
              data-testid="save-to-controller"
              className={`${actionClass} hover:border-live/60 hover:bg-live/10 hover:text-live`}
            >
              {actionIcon('save')}
              {actionLabel('save')}
            </button>
          </>
        ) : (
          <button type="button" onClick={onConnect} className={actionClass}>
            Connect
          </button>
        )}
      </span>
    )
  }

  return (
    <span
      data-testid="pattern-deployment-actions"
      className={`inline-flex min-w-0 items-stretch overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 font-mono ${heightClass} ${fill ? 'w-full' : ''}`}
    >
      <span
        data-testid="controller-deployment-identity"
        aria-label={preparingLabel ?? (connected ? `Controller ${target}` : 'Controller not connected')}
        title={preparingLabel ?? (connected ? target : 'Not connected')}
        className={`flex min-w-0 flex-1 items-center gap-1.5 border-r border-zinc-800 px-2 text-zinc-500 ${identityWidth}`}
      >
        <span className="shrink-0" aria-hidden>
          {preparing
            ? <RotateCw {...controlIcon} className="animate-spin text-amber-400" />
            : connected ? <ChipGlyph /> : <ConnectGlyph />}
        </span>
        <span className={`show-deployment-identity-copy truncate ${preparing ? 'text-amber-300' : connected ? 'text-zinc-300' : 'text-zinc-500'}`}>
          {preparingLabel ?? (connected ? target : 'Not connected')}
        </span>
      </span>

      {connected ? (
        <>
          <button
            type="button"
            aria-label={`Run on ${target}`}
            disabled={!runGate.enabled || working}
            title={actionTitle('run', runGate)}
            onClick={onRun}
            data-testid="run-on-controller"
            className={`inline-flex items-center justify-center gap-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35 ${actionPadding}`}
          >
            {actionIcon('run')}
            <span className="show-deployment-action-label">{actionLabel('run')}</span>
          </button>
          <button
            type="button"
            aria-label={`Save to ${target}`}
            disabled={!saveGate.enabled || working}
            title={actionTitle('save', saveGate)}
            onClick={onSave}
            data-testid="save-to-controller"
            className={`inline-flex items-center justify-center gap-1.5 border-l border-zinc-800 text-zinc-400 transition-colors hover:bg-amber-500/10 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35 ${actionPadding}`}
          >
            {actionIcon('save')}
            <span className="show-deployment-action-label">{actionLabel('save')}</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className={`inline-flex items-center justify-center text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 ${actionPadding}`}
        >
          Connect
        </button>
      )}
    </span>
  )
}
