import { useId } from 'react'
import { Check, Play, RotateCw, Save } from 'lucide-react'
import { controlIcon, transportIcon } from '@/components/iconScale'
import { ChipGlyph, ConnectGlyph } from '@/components/ControllerGlyphs'
import { DisabledReasonTip } from '@/components/ui/disabled-reason'
import type { SendGate, SendMode } from '@/engine/sendToController'
import type { PushResult } from '@/store/controllerStore'

type PatternDeploymentActionsProps = {
  connected: boolean
  controllerName: string | null
  runGate: SendGate
  saveGate: SendGate
  activeMode: SendMode
  preparing?: boolean
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
  preparing = false,
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
  const working = preparing || pushing || !!pushResult?.ok
  // A gate reason must reach keyboard and assistive-tech users, not just the
  // mouse (#875): a gated action stays focusable under `aria-disabled` and
  // points `aria-describedby` at the shared tip. Only the transient in-flight
  // state uses the hard `disabled` attribute.
  const runReasonId = useId()
  const saveReasonId = useId()
  const gated = (gate: SendGate) => !gate.enabled && !working

  const heightClass = density === 'compact' ? 'h-6 text-[10px]' : 'h-8 text-[11px]'
  const actionPadding = density === 'compact' ? 'px-2' : 'px-2.5'
  const identityWidth = density === 'compact' ? 'max-w-36' : 'max-w-44'

  const actionIcon = (mode: SendMode) => {
    if (preparing) {
      return <RotateCw {...controlIcon} className="animate-spin text-amber-400" aria-hidden />
    }
    if (pushing && activeMode === mode) {
      return <RotateCw {...controlIcon} className="animate-spin text-amber-400" aria-hidden />
    }
    if (pushResult?.ok && activeMode === mode) return <Check {...controlIcon} aria-hidden />
    return mode === 'save'
      ? <Save {...controlIcon} aria-hidden />
      : <Play {...transportIcon} aria-hidden />
  }

  const actionLabel = (mode: SendMode) => (
    !preparing && pushResult && !pushResult.ok && activeMode === mode
      ? 'Failed'
      : mode === 'save' ? 'Save' : 'Run'
  )

  const actionTitle = (mode: SendMode, gate: SendGate) => {
    // A gated reason lives in the tip while the control is focusable; while
    // the control is hard-disabled for in-flight work the reason (for example
    // "Rebuilding Show...") stays the title.
    if (!gate.enabled) return working ? gate.reason : undefined
    if (pushResult && !pushResult.ok && activeMode === mode) return pushResult.message
    if (working) return 'Sending...'
    return mode === 'save' ? `Save to ${target}` : `Run on ${target}`
  }

  const gateProps = (mode: SendMode, gate: SendGate) => {
    const reasonId = mode === 'save' ? saveReasonId : runReasonId
    return {
      disabled: working,
      'aria-disabled': gated(gate) || undefined,
      'aria-describedby': gated(gate) ? reasonId : undefined,
      title: actionTitle(mode, gate),
    }
  }

  const gateTip = (mode: SendMode, gate: SendGate) => (
    gated(gate)
      ? <DisabledReasonTip id={mode === 'save' ? saveReasonId : runReasonId}>{gate.reason}</DisabledReasonTip>
      : null
  )

  if (presentation === 'facts') {
    const actionClass =
      'inline-flex h-6 items-center justify-center gap-1.5 rounded border border-zinc-700 px-2 text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35 aria-disabled:cursor-not-allowed aria-disabled:opacity-35 aria-disabled:hover:border-zinc-700 aria-disabled:hover:bg-transparent aria-disabled:hover:text-zinc-300'
    return (
      <span
        data-testid="pattern-deployment-actions"
        className={`flex min-w-0 flex-1 items-center gap-2 font-mono text-[11.5px] ${fill ? 'w-full' : ''}`}
      >
        <span
          data-testid="controller-deployment-identity"
          aria-label={connected ? `Controller ${target}` : 'Controller not connected'}
          title={connected ? target : 'Not connected'}
          className="flex min-w-0 flex-1 items-center gap-2 text-zinc-500"
        >
          <span
            data-testid="controller-status-dot"
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          <span className={`truncate ${connected ? 'text-zinc-300' : 'text-zinc-500'}`}>
            {connected ? target : 'Not connected'}
          </span>
        </span>
        {connected ? (
          <>
            <span className="relative inline-flex">
              <button
                type="button"
                aria-label={`Run on ${target}`}
                {...gateProps('run', runGate)}
                onClick={() => { if (!gated(runGate)) onRun() }}
                data-testid="run-on-controller"
                className={actionClass}
              >
                {actionIcon('run')}
                {actionLabel('run')}
              </button>
              {gateTip('run', runGate)}
            </span>
            <span className="relative inline-flex">
              <button
                type="button"
                aria-label={`Save to ${target}`}
                {...gateProps('save', saveGate)}
                onClick={() => { if (!gated(saveGate)) onSave() }}
                data-testid="save-to-controller"
                className={`${actionClass} hover:border-live/60 hover:bg-live/10 hover:text-live`}
              >
                {actionIcon('save')}
                {actionLabel('save')}
              </button>
              {gateTip('save', saveGate)}
            </span>
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
        aria-label={connected ? `Controller ${target}` : 'Controller not connected'}
        title={connected ? target : 'Not connected'}
        className={`flex min-w-0 flex-1 items-center gap-1.5 border-r border-zinc-800 px-2 text-zinc-500 ${identityWidth}`}
      >
        <span className="shrink-0" aria-hidden>
          {connected ? <ChipGlyph /> : <ConnectGlyph />}
        </span>
        <span className={`show-deployment-identity-copy truncate ${connected ? 'text-zinc-300' : 'text-zinc-500'}`}>
          {connected ? target : 'Not connected'}
        </span>
      </span>

      {connected ? (
        <>
          <span className="relative inline-flex">
            <button
              type="button"
              aria-label={`Run on ${target}`}
              {...gateProps('run', runGate)}
              onClick={() => { if (!gated(runGate)) onRun() }}
              data-testid="run-on-controller"
              className={`inline-flex items-center justify-center gap-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35 aria-disabled:cursor-not-allowed aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:hover:text-zinc-300 ${actionPadding}`}
            >
              {actionIcon('run')}
              <span className="show-deployment-action-label">{actionLabel('run')}</span>
            </button>
            {gateTip('run', runGate)}
          </span>
          <span className="relative inline-flex">
            <button
              type="button"
              aria-label={`Save to ${target}`}
              {...gateProps('save', saveGate)}
              onClick={() => { if (!gated(saveGate)) onSave() }}
              data-testid="save-to-controller"
              className={`inline-flex items-center justify-center gap-1.5 border-l border-zinc-800 text-zinc-400 transition-colors hover:bg-amber-500/10 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35 aria-disabled:cursor-not-allowed aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:hover:text-zinc-400 ${actionPadding}`}
            >
              {actionIcon('save')}
              <span className="show-deployment-action-label">{actionLabel('save')}</span>
            </button>
            {gateTip('save', saveGate)}
          </span>
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
