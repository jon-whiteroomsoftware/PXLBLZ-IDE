import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useAnchoredOverlayPosition } from './useAnchoredOverlayPosition'

export interface DeckOption<T> {
  value: T
  label: string
  title?: string
  // Optional top-level menu column. Options remain in source order for keyboard
  // navigation; the column only changes their visual grouping.
  column?: string
  // Optional small muted suffix shown after the label (e.g. a "2D" dimension
  // tag). Decorative — marked aria-hidden so it never enters the accessible name.
  badge?: string
  // Optional subgroup label. When options carry more than one distinct group, the
  // menu renders a non-clickable header above each group's first option (options are
  // assumed pre-sorted so a group's members are contiguous). A single group renders
  // no header.
  group?: string
}

// A lightweight bordered dropdown for the preview deck (#150): a thin-bordered
// trigger showing the current value with a down chevron — clearly an interactive
// control that opens a menu — over a simple listbox of options. Shared by the
// renderer and speed controls so they read identically; all option/selection logic
// is the caller's, this is a pure presentation shell.
export function DeckSelect<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
  menuWidthClass = 'w-24',
  menuAlign = 'right',
  menuSide = 'bottom',
  block = false,
  portaled = false,
}: {
  ariaLabel: string
  value: T
  options: DeckOption<T>[]
  onChange: (value: T) => void
  menuWidthClass?: string
  // Which trigger edge the menu's matching edge pins to. 'right' (default) opens
  // leftward — correct when the control sits on a right rail. 'left' opens
  // rightward — use when the control is near the viewport's left edge, where a
  // right-pinned menu would overflow and clip off-screen.
  menuAlign?: 'left' | 'right'
  // The map menu uses responsive placement because its rail stacks below the
  // canvas at narrow widths. Other compact deck menus continue opening down.
  menuSide?: 'bottom' | 'top' | 'responsive'
  // When true the trigger fills its container's width (chevron pinned right, long
  // label truncates) instead of shrinking to its content. Lets a caller cap the width
  // with a wrapper and right-align it — e.g. the stacked `map` cell, which grows to
  // the column width and aligns its right edge with the `fit` dropdown below.
  block?: boolean
  // Preview controls live inside an overflow-clipped region. Opt those callers
  // into document-level placement without changing containment for other decks.
  portaled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const current = options.find((o) => o.value === value) ?? options[0]
  const indexedOptions = options.map((option, index) => ({ option, index }))
  const columns = Array.from(new Set(options.map((option) => option.column).filter((column): column is string => Boolean(column))))
  const showColumns = columns.length > 1
  const menuStyle = useAnchoredOverlayPosition(triggerRef, menuRef, isOpen && portaled, {
    align: menuAlign,
    preferredSide: menuSide,
  })
  const menuSideClass = menuSide === 'top'
    ? 'bottom-full mb-1'
    : menuSide === 'responsive'
      ? 'bottom-full mb-1 sm:bottom-auto sm:top-full sm:mb-0 sm:mt-1'
      : 'top-full mt-1'
  // Only show subgroup headers when the options actually span more than one group;
  // a lone group (the common no-user-maps case) reads cleaner with no header.
  const showGroups = new Set(options.map((o) => o.group).filter(Boolean)).size > 1

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  function focusOption(index: number) {
    window.setTimeout(() => optionRefs.current[index]?.focus(), 0)
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    setIsOpen(true)
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === current?.value))
    focusOption(currentIndex)
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, index + 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = options.length - 1
    else if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      window.setTimeout(() => triggerRef.current?.focus(), 0)
      return
    }
    if (nextIndex === null) return
    event.preventDefault()
    optionRefs.current[nextIndex]?.focus()
  }

  function renderOptions(
    entries: Array<{ option: DeckOption<T>; index: number }>,
    alwaysShowGroups = false,
  ) {
    return entries.map(({ option: opt, index: i }, entryIndex) => {
      const previousGroup = entries[entryIndex - 1]?.option.group
      const header =
        (alwaysShowGroups || showGroups) && opt.group && opt.group !== previousGroup ? (
          <div
            key={`group-${opt.group}`}
            role="presentation"
            className={`px-3 ${entryIndex === 0 ? 'pt-1' : 'pt-3'} pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-structural select-none`}
          >
            {opt.group}
          </div>
        ) : null
      return (
        <div key={String(opt.value)}>
          {header}
          <button
            ref={(element) => { optionRefs.current[i] = element }}
            role="option"
            aria-selected={opt.value === current?.value}
            title={opt.title}
            onClick={() => {
              onChange(opt.value)
              setIsOpen(false)
            }}
            onKeyDown={(event) => handleOptionKeyDown(event, i)}
            className={`block w-full whitespace-nowrap text-left px-3 py-0.5 text-xs tabular-nums transition-colors hover:bg-zinc-800 ${
              opt.value === current?.value ? 'text-amber-400' : 'text-zinc-300'
            }`}
          >
            {opt.label}
            {opt.badge && (
              <span aria-hidden className="ml-1 text-zinc-500">
                {opt.badge}
              </span>
            )}
          </button>
        </div>
      )
    })
  }

  const menu = isOpen ? (
    <div
      ref={menuRef}
      role="listbox"
      aria-label={ariaLabel}
      style={portaled ? menuStyle : undefined}
      className={`${portaled ? '' : `absolute ${menuSideClass} ${menuAlign === 'left' ? 'left-0' : 'right-0'} z-50`} ${menuWidthClass} max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden bg-zinc-900 border border-zinc-800 rounded-md shadow-xl ${showColumns ? 'grid grid-cols-2' : 'py-1'}`}
    >
      {showColumns
        ? columns.map((column, columnIndex) => (
            <div
              key={column}
              role="group"
              aria-label={column}
              className={`min-w-0 py-1 ${columnIndex > 0 ? 'border-l border-zinc-800' : ''}`}
            >
              <div role="presentation" className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-300 select-none">
                {column}
              </div>
              {renderOptions(indexedOptions.filter(({ option }) => option.column === column), true)}
            </div>
          ))
        : renderOptions(indexedOptions)}
    </div>
  ) : null

  return (
    <div ref={containerRef} className={`relative ${block ? 'w-full' : ''}`}>
      <button
        ref={triggerRef}
        aria-label={ariaLabel}
        title={`${ariaLabel}: ${current?.label ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={`flex items-center gap-0.5 h-5 pl-1 pr-0.5 rounded border border-zinc-500 text-[11px] tabular-nums text-zinc-300 hover:border-zinc-400 hover:text-amber-400/80 transition-colors ${
          block ? 'w-full' : 'shrink-0'
        }`}
      >
        <span className={block ? 'min-w-0 flex-1 truncate text-left' : 'whitespace-nowrap'}>{current?.label}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {current?.badge && (
            <span aria-hidden className="text-zinc-500">
              {current.badge}
            </span>
          )}
          <ChevronDown size={12} className="shrink-0 text-zinc-500" />
        </span>
      </button>

      {portaled && menu ? createPortal(menu, document.body) : menu}
    </div>
  )
}
