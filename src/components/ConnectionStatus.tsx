import { useSyncExternalStore } from 'react'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { describeControllerStatus, type ControllerStatusTone } from '@/engine/controllerStatusView'

// Tailwind dot colour per tone. `absent`/`idle` stay muted (no live link);
// `live` uses the amber "live" accent; `pending` pulses; `error` is red.
const TONE_DOT: Record<ControllerStatusTone, string> = {
  absent: 'bg-zinc-700',
  idle: 'bg-zinc-400',
  pending: 'bg-amber-400 animate-pulse',
  live: 'bg-live',
  error: 'bg-red-400',
}

/** Top-right nav connection indicator (H4, issue #196). Reads ControllerProvider
 *  status only — display-only; the dropdown/connect UI arrives in H5. Subscribes
 *  through useSyncExternalStore so it re-renders on provider status changes. */
export function ConnectionStatus() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const view = describeControllerStatus(status)

  return (
    <span
      data-testid="connection-status"
      data-status={view.kind}
      title={view.label}
      aria-label={view.label}
      role="status"
      className="flex items-center gap-1.5 select-none text-zinc-500"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-zinc-500">
        {/* A small Controller/chip glyph: the indicator dot below carries state. */}
        <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      <span data-testid="connection-dot" className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[view.tone]}`} />
    </span>
  )
}
