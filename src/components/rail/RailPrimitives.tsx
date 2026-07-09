import { useRef, useState, type RefObject } from 'react'
import type React from 'react'
import { ChevronDown, Pencil, Search, Trash2, X } from 'lucide-react'
import { nameConflicts } from '@/engine/patternName'
import type { DimLens } from '@/engine/dimLens'
import {
  AlertDialogRoot,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

export type ScrollMetrics = {
  top: number
  height: number
  visible: boolean
}

// An icon action button for a rail title row (e.g. "+" new, or open-from-disk).
// `title` doubles as the hover tooltip and the accessible label.
export function HeaderAction({
  icon,
  title,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="shrink-0 text-zinc-400 hover:text-live disabled:opacity-30 disabled:hover:text-zinc-400"
    >
      {icon}
    </button>
  )
}

export function RailEntityHeader({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="border-b border-seam px-3 py-2">
      <div className="flex min-h-5 items-center gap-2">
        <div className="flex-1 truncate text-sm font-semibold text-zinc-200">{title}</div>
        {action && <div className="flex items-center gap-1.5">{action}</div>}
      </div>
      {children}
    </div>
  )
}

const ROW_PAD = '12px'

const rowClass = (active: boolean) =>
  [
    'group relative flex items-center gap-1.5 pr-3 min-h-[19px] py-px cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-live/70 focus-visible:ring-inset',
    active ? 'text-live bg-live/5' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/60',
  ].join(' ')

function ActiveBar() {
  return <span aria-hidden className="absolute left-0 top-0 bottom-0 w-0.5 bg-live" />
}

function DimPill({ dim }: { dim: string }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded border border-zinc-700 px-1 text-[8px] leading-[1.5] font-mono uppercase tracking-wide text-zinc-400 transition-opacity group-hover:opacity-0"
    >
      {dim}
    </span>
  )
}

const DIM_LENS_OPTIONS: { label: string; value: DimLens }[] = [
  { label: 'All', value: 'all' },
  { label: '1D', value: 1 },
  { label: '2D', value: 2 },
  { label: '3D', value: 3 },
]

export function RailFilterBar({
  lens,
  onLensChange,
  query,
  onQueryChange,
  hideOneDimensional,
}: {
  lens: DimLens
  onLensChange: (lens: DimLens) => void
  query: string
  onQueryChange: (query: string) => void
  hideOneDimensional?: boolean
}) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hoverSuppressed, setHoverSuppressed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedOpen = pinned || focused
  const expanded = committedOpen || (hovered && !hoverSuppressed)

  function handleBlur() {
    setFocused(false)
    setPinned(false)
    onQueryChange('')
  }

  function toggle() {
    if (committedOpen) {
      setPinned(false)
      onQueryChange('')
      inputRef.current?.blur()
      setHoverSuppressed(true)
    } else {
      setPinned(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div className="flex items-center gap-1 pt-1.5">
      <div
        role="radiogroup"
        aria-label="Dimension filter"
        className={`flex shrink-0 transition-all ${expanded ? 'gap-px' : 'gap-0.5'}`}
      >
        {DIM_LENS_OPTIONS.map((opt) => {
          if (hideOneDimensional && opt.value === 1) {
            return (
              <span
                key={String(opt.value)}
                aria-hidden
                className={[
                  'invisible rounded py-0.5 text-[10px] font-mono uppercase tracking-wide',
                  expanded ? 'px-1' : 'px-2.5',
                ].join(' ')}
              >
                {opt.label}
              </span>
            )
          }
          const active = lens === opt.value
          return (
            <button
              key={String(opt.value)}
              role="radio"
              aria-checked={active}
              onClick={() => onLensChange(opt.value)}
              className={[
                'rounded py-0.5 text-[10px] font-mono uppercase tracking-wide transition-all',
                expanded ? 'px-1' : 'px-2.5',
                active
                  ? 'bg-live/15 text-live'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60',
              ].join(' ')}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <div
        className="flex flex-1 items-center justify-end gap-1"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setHoverSuppressed(false) }}
      >
        <div
          className={[
            'flex-1 overflow-hidden transition-all duration-200',
            expanded ? 'max-w-full opacity-100' : 'max-w-0 opacity-0',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={handleBlur}
            placeholder="Search by name"
            aria-label="Search by name"
            tabIndex={expanded ? 0 : -1}
            className="w-full rounded bg-zinc-800/60 py-0.5 px-2 text-[11px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:bg-zinc-800 focus:ring-1 focus:ring-zinc-600"
          />
        </div>
        <button
          onClick={toggle}
          onMouseDown={(e) => e.preventDefault()}
          title={committedOpen ? 'Close search' : 'Search by name'}
          aria-label={committedOpen ? 'Close search' : 'Search by name'}
          className={[
            'shrink-0 transition-colors',
            expanded ? 'text-zinc-300 hover:text-live' : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {committedOpen ? <X size={13} /> : <Search size={13} />}
        </button>
      </div>
    </div>
  )
}

export function EditableListItem({
  name,
  noun,
  active,
  dim,
  badge,
  takenNames,
  validateName,
  deleteTitle,
  deleteDescription,
  navKey,
  onSelect,
  onRename,
  onDelete,
  onRowRef,
  onRowKeyDown,
}: {
  name: string
  noun: 'pattern' | 'map' | 'mixin' | 'controller' | 'show' | 'library'
  active: boolean
  dim?: string
  badge?: string
  takenNames: string[]
  validateName?: (name: string) => string | null
  deleteTitle?: string
  deleteDescription?: string
  navKey?: string
  onSelect: () => void
  onRename?: (name: string) => void
  onDelete: () => void
  onRowRef?: (key: string, el: HTMLLIElement | null) => void
  onRowKeyDown?: (e: React.KeyboardEvent<HTMLLIElement>, key: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [conflict, setConflict] = useState(false)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    if (!onRename) return
    setDraft(name)
    setConflict(false)
    setValidationMessage(null)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitRename() {
    if (!onRename) { setEditing(false); return }
    const trimmed = draft.trim()
    if (!trimmed) { setEditing(false); return }
    if (trimmed === name) { setEditing(false); return }
    const customError = validateName?.(trimmed) ?? null
    if (customError) {
      setValidationMessage(customError)
      inputRef.current?.select()
      return
    }
    if (nameConflicts(trimmed, takenNames)) {
      setConflict(true)
      inputRef.current?.select()
      return
    }
    onRename(trimmed)
    setEditing(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setEditing(false)
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDraft(e.target.value)
    if (conflict) setConflict(false)
    if (validationMessage) setValidationMessage(null)
  }

  return (
    <AlertDialogRoot>
      <li
        ref={(el) => { if (navKey) onRowRef?.(navKey, el) }}
        onClick={onSelect}
        onKeyDown={!editing && navKey ? (e) => onRowKeyDown?.(e, navKey) : undefined}
        tabIndex={!editing && navKey ? 0 : undefined}
        data-pattern-nav-key={navKey}
        style={{ paddingLeft: ROW_PAD }}
        className={rowClass(active)}
      >
        {active && <ActiveBar />}
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={handleDraftChange}
            onBlur={commitRename}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            className={[
              'flex-1 min-w-0 text-xs px-1 rounded outline-none',
              conflict
                ? 'bg-red-900/60 text-red-200 ring-1 ring-red-500'
                : validationMessage
                  ? 'bg-red-900/60 text-red-200 ring-1 ring-red-500'
                : 'bg-zinc-700 text-zinc-100',
            ].join(' ')}
            title={validationMessage ?? (conflict ? `A ${noun} with that name already exists` : undefined)}
          />
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate">{name}</span>
            {badge && (
              <span
                title={badge}
                className="shrink-0 rounded border border-live/25 bg-live/10 px-1 text-[8px] font-mono uppercase leading-[1.5] text-live/80 transition-opacity group-hover:opacity-0"
              >
                {badge}
              </span>
            )}
            {dim && <DimPill dim={dim} />}
            <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
              {onRename && (
                <button
                  onClick={startEdit}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-800 bg-zinc-950/85 text-zinc-500 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"
                  title="Rename"
                  aria-label="Rename"
                >
                  <Pencil size={13} aria-hidden />
                </button>
              )}
              <AlertDialogTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-800 bg-zinc-950/85 text-zinc-500 transition-colors hover:border-red-900/80 hover:bg-red-950/50 hover:text-red-300"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </AlertDialogTrigger>
            </span>
          </>
        )}
      </li>
      <AlertDialogContent>
        <AlertDialogTitle>{deleteTitle ?? `Delete ${noun}?`}</AlertDialogTitle>
        <AlertDialogDescription>
          {deleteDescription ?? `"${name}" will be permanently deleted and cannot be recovered.`}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}

export function StockListItem({
  name,
  active,
  meta,
  onSelect,
}: {
  name: string
  active: boolean
  meta?: string
  onSelect: () => void
}) {
  return (
    <li
      onClick={onSelect}
      style={{ paddingLeft: ROW_PAD }}
      className={[rowClass(active), active ? '' : 'text-zinc-500'].join(' ')}
    >
      {active && <ActiveBar />}
      <span className="flex-1 min-w-0 truncate">{name}</span>
      {meta && <DimPill dim={meta} />}
    </li>
  )
}

export function StockSectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      style={{ letterSpacing: '0.04em' }}
      className="mt-2 flex w-full items-center gap-1 border-y border-zinc-700/70 px-3 pb-1 pt-2.5 text-left font-mono text-[11px] font-semibold uppercase text-structural transition-colors hover:bg-zinc-900/45 hover:text-zinc-300"
    >
      <ChevronDown
        size={12}
        aria-hidden
        className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
      />
      {label}
    </button>
  )
}

export function railScrollMetrics(el: HTMLDivElement): ScrollMetrics {
  const { clientHeight, scrollHeight, scrollTop } = el
  if (scrollHeight <= clientHeight + 1) return { top: 0, height: 0, visible: false }
  const height = Math.max(24, (clientHeight / scrollHeight) * clientHeight)
  const maxTop = clientHeight - height
  const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop
  return { top, height, visible: true }
}

export function RailSectionScroller({
  testId,
  scrollRef,
  metrics,
  onScroll,
  children,
}: {
  testId: string
  scrollRef: RefObject<HTMLDivElement | null>
  metrics: ScrollMetrics
  onScroll: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        data-testid={testId}
        onScroll={onScroll}
        className="rail-list-scroll h-full overflow-y-auto overflow-x-hidden pb-2"
      >
        {children}
      </div>
      <RailScrollThumb metrics={metrics} scrollRef={scrollRef} />
    </div>
  )
}

export function RailScrollThumb({
  metrics,
  scrollRef,
}: {
  metrics: ScrollMetrics
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  if (!metrics.visible) return null

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current
    if (!el) return
    const scrollEl = el
    const startY = e.clientY
    const startScrollTop = scrollEl.scrollTop
    const maxScrollTop = scrollEl.scrollHeight - scrollEl.clientHeight
    const maxThumbTop = scrollEl.clientHeight - metrics.height
    const scrollPerPixel = maxThumbTop > 0 ? maxScrollTop / maxThumbTop : 0

    function move(ev: PointerEvent) {
      scrollEl.scrollTop = startScrollTop + (ev.clientY - startY) * scrollPerPixel
    }

    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    e.preventDefault()
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-2"
    >
      <div
        className="pointer-events-auto absolute right-0.5 w-1 rounded-full bg-zinc-500/55 hover:bg-zinc-400/70"
        style={{ top: metrics.top, height: metrics.height }}
        onPointerDown={handlePointerDown}
      />
    </div>
  )
}
