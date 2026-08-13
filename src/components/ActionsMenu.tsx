import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EllipsisVertical } from 'lucide-react'
import { useAnchoredOverlayPosition } from '@/components/useAnchoredOverlayPosition'
import { registerShowEscapeLayer } from '@/engine/showEscapeLayers'

export type ActionsMenuItem = {
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
}

export function ActionsMenu({
  label,
  items,
  density = 'compact',
  side = 'below',
  portaled = false,
  escapeLayerRank,
}: {
  label: string
  items: readonly ActionsMenuItem[]
  density?: 'compact' | 'regular'
  side?: 'above' | 'below'
  portaled?: boolean
  escapeLayerRank?: number
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const openingFocusRef = useRef<'first' | 'last'>('first')
  const triggerHeight = density === 'regular' ? 'h-8 w-9' : 'h-6 w-7'
  const menuOffset = side === 'above'
    ? density === 'regular' ? 'bottom-9' : 'bottom-7'
    : density === 'regular' ? 'top-9' : 'top-7'
  const menuStyle = useAnchoredOverlayPosition(triggerRef, menuRef, open && portaled, {
    align: 'left',
    preferredSide: side === 'above' ? 'top' : 'bottom',
  })

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (
        rootRef.current
        && !rootRef.current.contains(event.target as Node)
        && !menuRef.current?.contains(event.target as Node)
      ) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeFromEscape = () => {
      setOpen(false)
      triggerRef.current?.focus()
      return true
    }
    if (escapeLayerRank !== undefined) {
      return registerShowEscapeLayer({
        rank: escapeLayerRank,
        allowWhenDetailOwned: true,
        onEscape: closeFromEscape,
      })
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeFromEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [escapeLayerRank, open])

  useLayoutEffect(() => {
    if (!open) return
    const enabledItems = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    if (!enabledItems?.length) return
    enabledItems[openingFocusRef.current === 'last' ? enabledItems.length - 1 : 0]?.focus()
  }, [open])

  const itemClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent'

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={portaled ? menuStyle : undefined}
      className={`${portaled ? '' : `absolute left-0 ${menuOffset}`} z-50 w-52 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl`}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        const enabledItems = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
        if (enabledItems.length === 0) return
        event.preventDefault()
        const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement)
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? enabledItems.length - 1
            : event.key === 'ArrowDown'
              ? (currentIndex + 1 + enabledItems.length) % enabledItems.length
              : (currentIndex - 1 + enabledItems.length) % enabledItems.length
        enabledItems[nextIndex]?.focus()
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            setOpen(false)
            item.onSelect()
          }}
          className={`${itemClass}${item.separatorBefore ? ' mt-1 border-t border-zinc-800' : ''}${item.danger ? ' text-red-300 hover:bg-red-950/45 hover:text-red-200' : ''}`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  ) : null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => {
          openingFocusRef.current = 'first'
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          openingFocusRef.current = event.key === 'ArrowUp' ? 'last' : 'first'
          setOpen(true)
        }}
        className={`inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 ${triggerHeight}`}
      >
        <EllipsisVertical size={15} aria-hidden />
      </button>

      {portaled && menu ? createPortal(menu, document.body) : menu}
    </div>
  )
}
