import type { ReactNode } from 'react'

/**
 * Floating explanation for a control whose action is currently unavailable
 * (#796). Pair it with a focusable `aria-disabled` control (never the
 * `disabled` attribute, which drops hover and focus) inside a wrapper that
 * carries `group/reason relative inline-flex`, and point the control's
 * `aria-describedby` at this tip's id. The reason then sits in the
 * accessibility tree permanently and becomes visible on hover or focus.
 */
export function DisabledReasonTip({ id, children, className = '' }: {
  id: string
  children: ReactNode
  className?: string
}) {
  return (
    <span
      id={id}
      role="note"
      className={`pointer-events-none invisible absolute right-0 top-[calc(100%+5px)] z-40 w-44 rounded border border-amber-400/30 bg-zinc-950 px-2 py-1.5 text-left text-[9px] leading-3 text-amber-200 opacity-0 shadow-lg transition-opacity group-hover/reason:visible group-hover/reason:opacity-100 group-focus-within/reason:visible group-focus-within/reason:opacity-100 ${className}`}
    >
      {children}
    </span>
  )
}
