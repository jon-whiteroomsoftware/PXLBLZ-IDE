import { useEffect, useRef, useState, type RefObject } from 'react'
import type React from 'react'
import {
  BookOpen,
  Braces,
  ChevronDown,
  Cpu,
  FileCode2,
  Map as MapIcon,
  PanelLeftClose,
  PanelsTopLeft,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { nameConflicts } from '@/engine/patternName'
import { sanitizeLibraryNameInput } from '@/engine/libraries'
import type { DimLens } from '@/engine/dimLens'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
import { DeckSelect } from '@/components/DeckSelect'
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

export interface HeaderMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

export function HeaderMenu({ title, items }: { title: string; items: readonly HeaderMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [open])

  return (
    <div
      ref={menuRef}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <button
        type="button"
        aria-label={title}
        title={title}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={`grid size-5 place-items-center transition-colors ${open ? 'text-live' : 'text-zinc-400 hover:text-live'}`}
      >
        <Plus size={14} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-36 border border-zinc-700 bg-zinc-950 py-1 shadow-xl shadow-black/70">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={(event) => {
                event.stopPropagation()
                item.onSelect()
                setOpen(false)
              }}
              className="block h-6 w-full whitespace-nowrap px-2 text-left text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:text-zinc-600 disabled:hover:bg-transparent"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RailEntityHeader({
  title,
  action,
  onCollapse,
  children,
}: {
  title: string
  action?: React.ReactNode
  onCollapse?: () => void
  children?: React.ReactNode
}) {
  const compact = children === undefined || children === null
  return (
    <div className={compact
      ? 'flex h-[calc(1.75rem+1px)] shrink-0 items-center border-b border-seam px-[6px]'
      : 'border-b border-seam px-[6px] py-2'}
    >
      <div className="flex min-h-5 w-full items-center gap-1">
        {onCollapse && (
          <HeaderAction
            icon={<PanelLeftClose size={14} />}
            title="Collapse rail"
            onClick={onCollapse}
          />
        )}
        <h2 className={`flex-1 truncate font-normal ${IDE_MICROTYPE.header.className}`}>{title}</h2>
        {action && (
          <div className="flex min-w-0 items-center gap-1.5">
            {action}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

const ROW_PAD = '6px'

export type EntityNoun = 'pattern' | 'show' | 'map' | 'controller' | 'mixin' | 'library'

export function EntityIcon({ noun, ghost = false }: { noun: EntityNoun; ghost?: boolean }) {
  const className = `mt-[1px] shrink-0 ${ghost ? 'text-zinc-700' : 'text-zinc-600'}`
  const props = { size: 12, 'aria-hidden': true as const, className, ...(ghost ? { strokeDasharray: '2 2' } : {}) }
  switch (noun) {
    case 'pattern': return <FileCode2 {...props} />
    case 'show': return <PanelsTopLeft {...props} />
    case 'map': return <MapIcon {...props} />
    case 'controller': return <Cpu {...props} />
    case 'mixin': return <Braces {...props} />
    case 'library': return <BookOpen {...props} />
  }
}

const rowClass = (active: boolean) =>
  [
    `group relative flex min-h-[20px] items-start gap-1 py-px pr-3 cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-live/70 focus-visible:ring-inset ${IDE_MICROTYPE.entity.sizeClassName}`,
    active ? 'text-live bg-live/5' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/60',
  ].join(' ')

function ActiveBar() {
  return <span aria-hidden className="absolute left-0 top-0 bottom-0 w-0.5 bg-live" />
}

function DimPill({ dim }: { dim: string }) {
  return (
    <span
      aria-hidden
      className={`mt-[2px] shrink-0 rounded border border-zinc-700 px-1 font-mono uppercase tracking-wide transition-opacity group-hover:opacity-0 ${IDE_MICROTYPE.secondary.className}`}
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
  lens?: DimLens
  onLensChange?: (lens: DimLens) => void
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
    <div className="flex min-w-0 items-center gap-1">
      <div
        className="relative flex shrink-0 items-center"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setHoverSuppressed(false) }}
      >
        <div
          className={[
            'absolute right-0 z-30 w-28 transition-opacity duration-150',
            expanded ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
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
            className="w-full rounded border border-zinc-700 bg-zinc-900 py-0.5 pl-2 pr-5 text-[11px] text-zinc-200 shadow-md shadow-black/50 outline-none placeholder:text-zinc-500 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          />
        </div>
        <button
          onClick={toggle}
          onMouseDown={(e) => e.preventDefault()}
          title={committedOpen ? 'Close search' : 'Search by name'}
          aria-label={committedOpen ? 'Close search' : 'Search by name'}
          className={[
            'relative z-40 shrink-0 transition-colors',
            expanded ? 'text-zinc-300 hover:text-live' : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {committedOpen ? <X size={13} /> : <Search size={13} />}
        </button>
      </div>

      {lens !== undefined && onLensChange && (
        <DeckSelect
          ariaLabel="Dimension filter"
          value={lens}
          options={DIM_LENS_OPTIONS.filter((option) => !(hideOneDimensional && option.value === 1))}
          onChange={onLensChange}
          menuWidthClass="w-16"
          menuAlign="right"
        />
      )}
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
  noun: EntityNoun
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
    setDraft(noun === 'library' ? sanitizeLibraryNameInput(e.target.value) : e.target.value)
    if (conflict) setConflict(false)
    if (validationMessage) setValidationMessage(null)
  }

  function handleBeforeInput(e: React.FormEvent<HTMLInputElement>) {
    if (noun !== 'library') return
    const data = (e.nativeEvent as InputEvent).data
    if (!data) return
    const input = e.currentTarget
    const selectionStart = input.selectionStart ?? draft.length
    const selectionEnd = input.selectionEnd ?? selectionStart
    const nextDraft = `${draft.slice(0, selectionStart)}${data}${draft.slice(selectionEnd)}`
    if (sanitizeLibraryNameInput(nextDraft) !== nextDraft) e.preventDefault()
  }

  return (
    <AlertDialogRoot>
      <li
        ref={(el) => { if (navKey) onRowRef?.(navKey, el) }}
        onClick={onSelect}
        onKeyDown={!editing && navKey ? (e) => onRowKeyDown?.(e, navKey) : undefined}
        tabIndex={!editing && navKey ? 0 : undefined}
        data-pattern-nav-key={navKey}
        data-studio-space-preview={!editing ? 'true' : undefined}
        style={{ paddingLeft: ROW_PAD }}
        className={rowClass(active)}
      >
        {active && <ActiveBar />}
        <EntityIcon noun={noun} />
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onBeforeInput={handleBeforeInput}
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
            <span className="line-clamp-2 min-w-0 flex-1 break-words" title={name}>{name}</span>
            {badge && (
              <span
                title={badge}
                className={`mt-[2px] shrink-0 rounded border border-live/25 bg-live/10 px-1 font-mono uppercase text-live/90 transition-opacity group-hover:opacity-0 ${IDE_MICROTYPE.secondary.sizeClassName}`}
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
  noun,
  active,
  meta,
  onSelect,
}: {
  name: string
  noun: EntityNoun
  active: boolean
  meta?: string
  onSelect: () => void
}) {
  return (
    <li
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        onSelect()
      }}
      role="button"
      tabIndex={0}
      data-studio-space-preview="true"
      style={{ paddingLeft: ROW_PAD }}
      className={rowClass(active)}
    >
      {active && <ActiveBar />}
      <EntityIcon noun={noun} />
      <span className="line-clamp-2 min-w-0 flex-1 break-words" title={name}>{name}</span>
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
      className={`mt-2 flex min-h-6 w-full items-center gap-1 border-y border-zinc-700/70 px-[6px] py-1 text-left transition-colors hover:bg-zinc-900/45 hover:text-zinc-200 ${IDE_MICROTYPE.entity.className}`}
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

export function RailEmptyState({ children, roomy = false }: {
  children: React.ReactNode
  roomy?: boolean
}) {
  return (
    <p className={`select-none px-3 italic ${roomy ? 'py-2' : 'py-1'} ${IDE_MICROTYPE.entity.className}`}>
      {children}
    </p>
  )
}

export function RailEmptyRow({ label, noun }: { label: string; noun: EntityNoun }) {
  return (
    <p
      aria-label={label}
      title={label}
      className={`my-1 flex min-h-[20px] select-none items-center gap-1 px-[6px] py-px text-zinc-600 ${IDE_MICROTYPE.entity.sizeClassName}`}
    >
      <EntityIcon noun={noun} ghost />
      <span aria-hidden>&mdash;</span>
    </p>
  )
}

export function RailSubsectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className={`px-3 pb-1 pt-2 font-semibold uppercase tracking-[0.12em] ${IDE_MICROTYPE.required.className}`}>
      {children}
    </h3>
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
