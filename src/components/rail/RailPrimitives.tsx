import { useEffect, useRef, useState, type RefObject } from 'react'
import type React from 'react'
import {
  BookOpen,
  Braces,
  ChevronDown,
  Cpu,
  FileCode2,
  Film,
  Map as MapIcon,
  Pin,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { denseIcon } from '@/components/iconScale'
import { nameConflicts } from '@/engine/patternName'
import { sanitizeLibraryNameInput } from '@/engine/libraries'
import type { DimLens } from '@/engine/dimLens'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
import { DraftFieldActions } from '@/components/ui/draft-field-actions'
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
import {
  studioEntityDrawerBusySurfaceProps,
  studioEntityDrawerOwnedSurfaceProps,
  useStudioEntityDrawerControls,
} from '@/components/studioEntityDrawerContext'

export type ScrollMetrics = {
  top: number
  height: number
  visible: boolean
  left: number
  width: number
  horizontalVisible: boolean
}

// An icon action button for the list header (e.g. pin or open-from-disk).
// `title` doubles as the hover tooltip and the accessible label.
export function HeaderAction({
  icon,
  title,
  onClick,
  disabled,
  pressed,
}: {
  icon: React.ReactNode
  title: string
  onClick?: () => void
  disabled?: boolean
  pressed?: boolean
}) {
  return (
    <button
      data-studio-space-preview="true"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      aria-label={title}
      className="relative z-50 grid size-[26px] shrink-0 place-items-center rounded border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-live focus-visible:outline focus-visible:outline-live disabled:opacity-30 disabled:hover:text-zinc-400 aria-pressed:border-live/50 aria-pressed:bg-live/10 aria-pressed:text-live"
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
      {...studioEntityDrawerOwnedSurfaceProps}
      {...(open ? studioEntityDrawerBusySurfaceProps('menu') : {})}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <button
        type="button"
        aria-label={title}
        data-studio-space-preview="true"
        title={title}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={`grid size-[26px] place-items-center rounded border border-zinc-700 bg-zinc-900 transition-colors focus-visible:outline focus-visible:outline-live ${open ? 'text-live' : 'text-zinc-400 hover:text-live'}`}
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
  query = '',
  onQueryChange,
}: {
  title: string
  action?: React.ReactNode
  onCollapse?: () => void
  children?: React.ReactNode
  query?: string
  onQueryChange?: (query: string) => void
}) {
  const drawer = useStudioEntityDrawerControls()
  return (
    <div className="relative shrink-0 border-b border-seam">
      <div className="rail-entity-row relative flex h-[40px] w-full items-center gap-2 px-2">
        {onQueryChange ? <RailSearchField label={`Search ${title.toLocaleLowerCase()}`} query={query} onQueryChange={onQueryChange} /> : <span className="flex-1" />}
        {action && <div className="rail-entity-actions flex shrink-0 items-center gap-2">{action}</div>}
        {drawer ? (
          <HeaderAction
            icon={<Pin size={14} fill={drawer.pinned ? 'currentColor' : 'none'} />}
            title={drawer.pinDisabled ? 'Lists stay unpinned below 980 px' : `${drawer.pinned ? 'Unpin' : 'Pin'} ${title} list`}
            onClick={drawer.pinDisabled ? undefined : () => drawer.setPinned(!drawer.pinned)}
            disabled={drawer.pinDisabled}
            pressed={drawer.pinned}
          />
        ) : onCollapse ? (
          <HeaderAction icon={<Pin size={14} />} title="Collapse rail" onClick={onCollapse} />
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function RailSearchField({ label, query, onQueryChange }: {
  label: string
  query: string
  onQueryChange: (query: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative min-w-[120px] flex-1" {...studioEntityDrawerOwnedSurfaceProps} {...(focused ? studioEntityDrawerBusySurfaceProps('field') : {})}>
      <Search size={13} aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input
        type="text"
        data-rail-search
        aria-label={label}
        placeholder={label}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onQueryChange('') }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !query) return
          event.preventDefault()
          event.stopPropagation()
          onQueryChange('')
        }}
        className="h-[26px] w-full rounded border border-zinc-700 bg-zinc-900 pl-6 pr-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-live/60"
      />
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
    case 'show': return <Film {...props} />
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
      className={`pointer-events-none mt-[2px] shrink-0 rounded border border-zinc-700 px-1 font-mono uppercase tracking-wide transition-opacity group-hover:opacity-0 ${IDE_MICROTYPE.secondary.className}`}
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
  count,
  total,
  noun,
}: {
  lens?: DimLens
  onLensChange?: (lens: DimLens) => void
  query: string
  count: number
  total: number
  noun: string
}) {
  const hasFilter = lens !== undefined && onLensChange !== undefined
  if (!hasFilter && !query) return null
  return (
    <div className="flex h-[30px] items-center justify-between gap-2 border-t border-seam px-2">
      {hasFilter && (
        <div role="group" aria-label="Dimension filter" className="flex shrink-0 overflow-hidden rounded border border-zinc-700">
          {DIM_LENS_OPTIONS.map((option) => (
            <button key={option.value} type="button" data-studio-space-preview="true" aria-pressed={lens === option.value} onClick={() => onLensChange(option.value)} className="h-5 min-w-7 border-r border-zinc-700 px-1.5 text-[10px] text-zinc-400 last:border-r-0 hover:text-zinc-200 focus-visible:outline focus-visible:outline-live aria-pressed:bg-live/10 aria-pressed:text-live">
              {option.label}
            </button>
          ))}
        </div>
      )}
      <span role="status" className="ml-auto whitespace-nowrap text-[10px] text-zinc-500">
        {query || (lens !== undefined && lens !== 'all') ? `${count} of ${total}` : `${total} ${noun}`}
      </span>
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
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    }
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
          <span
            className="flex min-w-0 flex-1 items-stretch"
            {...studioEntityDrawerBusySurfaceProps('field')}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setEditing(false)
            }}
          >
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              onBeforeInput={handleBeforeInput}
              onChange={handleDraftChange}
              onKeyDown={onKeyDown}
              onClick={(e) => e.stopPropagation()}
              className={[
                'flex-1 min-w-0 text-xs px-1 rounded-l outline-none',
                conflict || validationMessage
                  ? 'bg-red-900/60 text-red-200 ring-1 ring-red-500'
                  : 'bg-zinc-700 text-zinc-100',
              ].join(' ')}
              title={validationMessage ?? (conflict ? `A ${noun} with that name already exists` : undefined)}
            />
            {draft !== name && (
              <DraftFieldActions
                label={`${noun} rename`}
                canApply={draft.trim().length > 0}
                onApply={commitRename}
                onCancel={() => setEditing(false)}
              />
            )}
          </span>
        ) : (
          <>
            <span className="line-clamp-2 min-w-0 flex-1 break-words" title={name}>{name}</span>
            {badge && (
              <span
                title={badge}
                className={`pointer-events-none mt-[2px] shrink-0 rounded border border-live/25 bg-live/10 px-1 font-mono uppercase text-live/90 transition-opacity group-hover:opacity-0 ${IDE_MICROTYPE.secondary.sizeClassName}`}
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
                  <Pencil {...denseIcon} aria-hidden />
                </button>
              )}
              <AlertDialogTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-800 bg-zinc-950/85 text-zinc-500 transition-colors hover:border-red-900/80 hover:bg-red-950/50 hover:text-red-300"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 {...denseIcon} aria-hidden />
                </button>
              </AlertDialogTrigger>
            </span>
          </>
        )}
      </li>
      <AlertDialogContent {...studioEntityDrawerBusySurfaceProps('dialog')}>
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
  const { clientHeight, scrollHeight, scrollTop, clientWidth, scrollWidth, scrollLeft } = el
  const verticalVisible = scrollHeight > clientHeight + 1
  const height = verticalVisible
    ? Math.max(24, (clientHeight / scrollHeight) * clientHeight)
    : 0
  const top = verticalVisible
    ? (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height)
    : 0
  const horizontalVisible = scrollWidth > clientWidth + 1
  const width = horizontalVisible
    ? Math.max(24, (clientWidth / scrollWidth) * clientWidth)
    : 0
  const left = horizontalVisible
    ? (scrollLeft / (scrollWidth - clientWidth)) * (clientWidth - width)
    : 0
  return { top, height, visible: verticalVisible, left, width, horizontalVisible }
}

export function railScrollResizeTargets(el: HTMLDivElement): Element[] {
  return [el, ...el.children]
}

export function RailSectionScroller({
  testId,
  scrollRef,
  metrics,
  onScroll,
  allowHorizontalScroll = false,
  children,
}: {
  testId: string
  scrollRef: RefObject<HTMLDivElement | null>
  metrics: ScrollMetrics
  onScroll: () => void
  allowHorizontalScroll?: boolean
  children: React.ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const content = contentRef.current
    if (!allowHorizontalScroll || !content || typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => onScroll())
    observer.observe(content, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [allowHorizontalScroll, onScroll])

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        data-testid={testId}
        onScroll={onScroll}
        className={`rail-list-scroll h-full overflow-y-auto ${allowHorizontalScroll ? 'overflow-x-auto pb-3' : 'overflow-x-hidden pb-2'}`}
      >
        <div
          ref={contentRef}
          data-testid="rail-scroll-content"
          className="min-w-full"
        >
          {children}
        </div>
      </div>
      <RailScrollThumb metrics={metrics} scrollRef={scrollRef} />
      {allowHorizontalScroll && (
        <RailHorizontalScrollThumb metrics={metrics} scrollRef={scrollRef} />
      )}
    </div>
  )
}

function RailHorizontalScrollThumb({
  metrics,
  scrollRef,
}: {
  metrics: ScrollMetrics
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  if (!metrics.horizontalVisible) return null

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const activeScrollEl: HTMLDivElement = scrollEl
    const startX = event.clientX
    const startScrollLeft = activeScrollEl.scrollLeft
    const maxScrollLeft = activeScrollEl.scrollWidth - activeScrollEl.clientWidth
    const maxThumbLeft = activeScrollEl.clientWidth - metrics.width
    const scrollPerPixel = maxThumbLeft > 0 ? maxScrollLeft / maxThumbLeft : 0

    function move(moveEvent: PointerEvent) {
      activeScrollEl.scrollLeft = startScrollLeft + (moveEvent.clientX - startX) * scrollPerPixel
    }

    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    event.preventDefault()
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-2 border-t border-zinc-800/80 bg-zinc-950/95"
    >
      <div
        data-testid="rail-horizontal-scroll-thumb"
        className="pointer-events-auto absolute bottom-0.5 h-1 rounded-full bg-zinc-500/60 hover:bg-zinc-400/75"
        style={{ left: metrics.left, width: metrics.width }}
        onPointerDown={handlePointerDown}
      />
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
