import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const TIP_WIDTH = 176

/**
 * Floating explanation for a control whose action is currently unavailable
 * (#796). Pair it with a focusable `aria-disabled` control (never the
 * `disabled` attribute, which drops hover and focus) inside a shared wrapper
 * span, and point the control's `aria-describedby` at this tip's id.
 *
 * The tip element lives in a portal on `document.body`: several hosts (the
 * timeline toolbar's `overflow-x-auto`, the Entity Detail panel) clip
 * absolutely-positioned descendants, and an accessible description that
 * cannot be seen defeats the point. It stays in the accessibility tree at all
 * times and becomes visible while the wrapper is hovered or holds focus.
 */
export function DisabledReasonTip({ id, children, className = '' }: {
  id: string
  children: ReactNode
  className?: string
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const wrapper = anchorRef.current?.parentElement
    if (!wrapper) return
    const open = () => {
      const rect = wrapper.getBoundingClientRect()
      setPosition({
        left: Math.max(8, rect.right - TIP_WIDTH),
        top: rect.bottom + 5,
      })
    }
    const close = () => setPosition(null)
    wrapper.addEventListener('mouseenter', open)
    wrapper.addEventListener('mouseleave', close)
    wrapper.addEventListener('focusin', open)
    wrapper.addEventListener('focusout', close)
    // Any scroll moves the anchor out from under a fixed tip; just dismiss.
    window.addEventListener('scroll', close, true)
    return () => {
      wrapper.removeEventListener('mouseenter', open)
      wrapper.removeEventListener('mouseleave', close)
      wrapper.removeEventListener('focusin', open)
      wrapper.removeEventListener('focusout', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])

  return (
    <>
      <span ref={anchorRef} hidden />
      {createPortal(
        <span
          id={id}
          role="note"
          // display:none while closed: assistive tech still resolves the
          // aria-describedby text from a hidden reference, and visibility
          // checks (tests included) see the tip only while it is shown.
          hidden={!position}
          style={position ? { position: 'fixed', left: position.left, top: position.top, width: TIP_WIDTH } : undefined}
          className={position
            ? `pointer-events-none z-[90] rounded border border-amber-400/30 bg-zinc-950 px-2 py-1.5 text-left text-[9px] leading-3 text-amber-200 shadow-lg ${className}`
            : undefined}
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  )
}
