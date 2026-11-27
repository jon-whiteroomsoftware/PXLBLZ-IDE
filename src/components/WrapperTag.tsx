import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { WRAPPER_TAG_LABELS, type WrapperTagModel } from '../engine/controllerWrapperTags'

const tagClass = 'rounded border border-seam px-[5px] py-px font-mono text-[10px] leading-4 text-zinc-400'

/** One saved-program tag (#1277). Display-only: no button and no click
 *  handler. A skipped tag takes focus so its reason is reachable by keyboard. */
export function WrapperTag({ tag }: { tag: WrapperTagModel }) {
  if (tag.wrapper === 'binding') {
    return <span className={`${tagClass} max-w-full whitespace-normal [overflow-wrap:anywhere]`}>{tag.label}</span>
  }
  const label = WRAPPER_TAG_LABELS[tag.wrapper]
  if (tag.state === 'applied') return <span className={`${tagClass} whitespace-nowrap`}>{label}</span>
  return <SkippedWrapperTag label={label} reason={tag.reason} />
}

function SkippedWrapperTag({ label, reason }: { label: string; reason: string }) {
  const tipId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = (hovered || focused) && !dismissed
  const tipRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  // The tip is right-anchored; near a clipping container's left edge it moves
  // right just enough to stay inside it.
  useLayoutEffect(() => {
    const tip = tipRef.current
    if (!open || !tip) return
    let clip = tip.parentElement?.parentElement ?? null
    while (clip && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement
    const left = clip?.getBoundingClientRect().left ?? 0
    const overflow = left - (tip.getBoundingClientRect().left - shift)
    setShift(overflow > 0 ? Math.ceil(overflow) : 0)
  }, [open, shift])
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])
  return (
    <span
      tabIndex={0}
      aria-describedby={tipId}
      className={`${tagClass} relative cursor-help whitespace-nowrap border-dashed text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 focus:border-zinc-500 focus:text-zinc-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-live/70`}
      onMouseEnter={() => { setHovered(true); setDismissed(false) }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setDismissed(false) }}
      onBlur={() => setFocused(false)}
    >
      {label}
      <span
        ref={tipRef}
        id={tipId}
        role="tooltip"
        hidden={!open}
        style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        className="absolute right-0 top-[calc(100%+6px)] z-10 w-max max-w-[230px] whitespace-normal rounded-md border border-zinc-700 bg-zinc-800 px-[9px] py-1.5 font-sans text-xs leading-[1.4] text-zinc-100 shadow-[0_8px_24px_#000a]"
      >
        {reason}
      </span>
    </span>
  )
}

export function WrapperTags({ tags }: { tags: readonly WrapperTagModel[] }) {
  if (tags.length === 0) return <span className="text-zinc-700">·</span>
  return (
    <span className="flex flex-wrap items-center gap-1">
      {tags.map((tag, index) => (
        <WrapperTag key={tag.wrapper === 'binding' ? `binding:${index}` : `${tag.wrapper}:${tag.state}`} tag={tag} />
      ))}
    </span>
  )
}
