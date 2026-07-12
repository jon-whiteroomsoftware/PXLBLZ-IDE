import { Check, Play, RotateCw, Save } from 'lucide-react'
import { ChipGlyph, ConnectGlyph } from '@/components/ControllerGlyphs'
import type { SendGate, SendMode } from '@/engine/sendToController'
import type { PushResult } from '@/store/controllerStore'

type PatternDeploymentActionsProps = {
  connected: boolean
  controllerName: string | null
  runGate: SendGate
  saveGate: SendGate
  activeMode: SendMode
  pushing: boolean
  pushResult: PushResult | null
  density?: 'compact' | 'regular'
  fill?: boolean
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
  pushing,
  pushResult,
  density = 'regular',
  fill = false,
  onConnect,
  onRun,
  onSave,
}: PatternDeploymentActionsProps) {
  const target = controllerName?.trim() || 'Controller'
  const working = pushing || !!pushResult?.ok
  const heightClass = density === 'compact' ? 'h-6 text-[10px]' : 'h-8 text-[11px]'
  const actionPadding = density === 'compact' ? 'px-2' : 'px-2.5'
  const identityWidth = density === 'compact' ? 'max-w-36' : 'max-w-44'

  const actionIcon = (mode: SendMode) => {
    if (pushing && activeMode === mode) {
      return <RotateCw size={13} className="animate-spin text-amber-400" aria-hidden />
    }
    if (pushResult?.ok && activeMode === mode) return <Check size={13} aria-hidden />
    return mode === 'save'
      ? <Save size={13} aria-hidden />
      : <Play size={13} aria-hidden />
  }

  const actionLabel = (mode: SendMode) => (
    pushResult && !pushResult.ok && activeMode === mode
      ? 'Failed'
      : mode === 'save' ? 'Save' : 'Run'
  )

  const actionTitle = (mode: SendMode, gate: SendGate) => {
    if (pushResult && !pushResult.ok && activeMode === mode) return pushResult.message
    if (working) return 'Sending...'
    if (!gate.enabled) return gate.reason
    return mode === 'save' ? `Save to ${target}` : `Run on ${target}`
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
        <span className={`truncate ${connected ? 'text-zinc-300' : 'text-zinc-500'}`}>
          {connected ? target : 'Not connected'}
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
            {actionLabel('run')}
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
            {actionLabel('save')}
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
