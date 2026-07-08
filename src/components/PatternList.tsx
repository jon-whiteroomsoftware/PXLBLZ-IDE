import { useEffect, useRef, useState } from 'react'
import {
  Braces,
  Cpu,
  FileCode2,
  FolderOpen,
  ChevronDown,
  Images,
  Map as MapIcon,
  PanelsTopLeft,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { nameConflicts, uniquePatternName } from '@/engine/patternName'
import { NEW_PATTERN_SRC } from '@/pixelblaze/newPattern'
import { parseEpe } from '@/engine/epeImport'
import { nativeDim, matchesLens, matchesQuery, type DimLens } from '@/engine/dimLens'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import {
  demoPersonalContentProvider,
  getPersonalContentProvider,
  initializePersonalContentProvider,
} from '@/engine/personalContentProvider'
import {
  demoControllerMetadataStorage,
  initializeControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import { getAuthSession } from '@/engine/authSession'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, PatternRecord } from '@/store/patternStore'
import { useMapStore, STOCK_MAP_ITEMS, MapRecord } from '@/store/mapStore'
import {
  useMixinStore,
  STOCK_MIXIN_ITEMS,
  type MixinRecord,
} from '@/store/mixinStore'
import { useControllerStore } from '@/store/controllerStore'
import { controllerProfileDisplayName } from '@/engine/controllerProfile'
import {
  profileMatchesLive,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { useDocsStore } from '@/store/docsStore'
import { useRouterStore } from '@/store/routerStore'
import { openDemoPattern } from '@/store/openPattern'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { StudioEntityKind } from '@/engine/routes'
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

type ScrollMetrics = {
  top: number
  height: number
  visible: boolean
}

const DEFAULT_DEMO_NAME = 'IridescentFibers'

// An icon action button for a rail title row (e.g. "+" new, or open-from-disk).
// `title` doubles as the hover tooltip and the accessible label.
function HeaderAction({
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

function RailEntityHeader({
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

// Rows align flush with their nearest rail header so entity names share one
// clean reading edge under their section header.
const ROW_PAD = '12px'

// Shared row chrome (#182): tight ~19px rows, a 2px amber left accent bar + subtle
// warm bg when active, and absolutely-positioned hover affordances so the dim pill
// can yield to them without any row-width reflow.
const rowClass = (active: boolean) =>
  [
    'group relative flex items-center gap-1.5 pr-3 min-h-[19px] py-px cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-live/70 focus-visible:ring-inset',
    active ? 'text-live bg-live/5' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/60',
  ].join(' ')

function ActiveBar() {
  return <span aria-hidden className="absolute left-0 top-0 bottom-0 w-0.5 bg-live" />
}

// The dimensionality tag: a small bordered pill at the right end of the name. It
// fades out on row hover so hover-actions can occupy that space (it stays in flow,
// so the row never reflows).
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

// The dimension lens (#251): a segmented single-select `All | 1D | 2D | 3D`.
const DIM_LENS_OPTIONS: { label: string; value: DimLens }[] = [
  { label: 'All', value: 'all' },
  { label: '1D', value: 1 },
  { label: '2D', value: 2 },
  { label: '3D', value: 3 },
]

type RailMode = StudioEntityKind

const ACTIVITY_ENTRIES: Array<{
  kind: RailMode
  label: string
  short: string
  icon: React.ReactNode
}> = [
  { kind: 'patterns', label: 'Patterns', short: 'PTRN', icon: <FileCode2 size={17} /> },
  { kind: 'maps', label: 'Maps', short: 'MAPS', icon: <MapIcon size={17} /> },
  { kind: 'mixins', label: 'Mixins', short: 'MIXN', icon: <Braces size={17} /> },
  { kind: 'controllers', label: 'Controllers', short: 'CTRL', icon: <Cpu size={17} /> },
  { kind: 'shows', label: 'Shows', short: 'SHOW', icon: <PanelsTopLeft size={17} /> },
]

function ActivityStrip({
  mode,
  onModeChange,
  onCatalog,
}: {
  mode: RailMode
  onModeChange: (mode: RailMode) => void
  onCatalog: () => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Studio activity"
      className="flex w-[46px] shrink-0 flex-col items-center border-r border-seam bg-zinc-950/35 py-2"
    >
      {ACTIVITY_ENTRIES.map((entry) => {
        const active = mode === entry.kind
        return (
          <button
            key={entry.kind}
            role="radio"
            aria-checked={active}
            aria-label={entry.label}
            title={entry.label}
            onClick={() => onModeChange(entry.kind)}
            className={[
              'mb-1 flex w-full flex-col items-center gap-0.5 px-1 py-1 text-[9px] font-semibold uppercase tracking-wide transition-colors',
              active
                ? 'text-live'
                : 'text-zinc-600 hover:bg-zinc-900/55 hover:text-zinc-300',
            ].join(' ')}
          >
            <span className={[
              'grid size-7 place-items-center rounded border transition-colors',
              active ? 'border-live/45 bg-live/10' : 'border-transparent',
            ].join(' ')}>
              {entry.icon}
            </span>
            <span>{entry.short}</span>
          </button>
        )
      })}
      <button
        type="button"
        aria-label="Catalog"
        title="Catalog"
        onClick={onCatalog}
        className="mt-auto flex w-full flex-col items-center gap-0.5 px-1 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors hover:bg-zinc-900/55 hover:text-zinc-300"
      >
        <span className="grid size-7 place-items-center rounded border border-transparent">
          <Images size={17} />
        </span>
        <span>CTLG</span>
      </button>
    </div>
  )
}

function EntityStubList({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="flex h-full flex-col text-xs font-mono">
      <RailEntityHeader title={title} />
      <div className="px-3 py-3">
        <div className="rounded border border-dashed border-zinc-700/80 bg-zinc-950/25 px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
          {detail}
        </div>
      </div>
    </div>
  )
}

// The rail filter bar (#252): the dimension lens and the type-down name search share
// ONE row to conserve scarce vertical real estate. Collapsed, it shows the pills and a
// magnifier at the right. Hovering or clicking the magnifier scrolls the search input
// out (animated) and tucks the pills tighter so both fit. Both controls are ephemeral
// (component state, reset on reload). The search stays open while it holds text or has
// focus, so it won't snap shut mid-type when the cursor drifts off.
function RailFilterBar({
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
  // After a close-click the cursor is still on the icon, which would re-unfurl the box
  // via `hovered`. Latch hover off until the mouse genuinely leaves the area.
  const [hoverSuppressed, setHoverSuppressed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // "Committed open" = the user deliberately opened it (clicked or focused), as opposed
  // to a transient hover-preview. The icon acts as Close only when committed. Focus is
  // what holds it open, so blurring (a click elsewhere in the IDE) closes it — query is
  // deliberately NOT a keep-open input, or a closed-but-filtered list could linger.
  const committedOpen = pinned || focused
  const expanded = committedOpen || (hovered && !hoverSuppressed)

  // A click anywhere outside the search area blurs the input: fully close (unpin and
  // clear the query) so an out-of-IDE click dismisses the box and its filter together.
  function handleBlur() {
    setFocused(false)
    setPinned(false)
    onQueryChange('')
  }

  function toggle() {
    if (committedOpen) {
      // The icon is acting as Close: collapse, clear the query, drop focus, and suppress
      // the still-hovering icon from immediately re-opening the box.
      setPinned(false)
      onQueryChange('')
      inputRef.current?.blur()
      setHoverSuppressed(true)
    } else {
      // The icon is the magnifier (collapsed, or merely hover-previewing): clicking it
      // should open AND focus the input so you can type right away.
      setPinned(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div className="flex items-center gap-1 pt-1.5">
      <div
        role="radiogroup"
        aria-label="Dimension filter"
        // Tighten the inter-pill gap too when expanded, ceding every spare pixel to
        // the search box.
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
                // Tuck tighter once the search field claims its share of the row.
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
          // Keep focus on the input through the click so closing it here goes through
          // `toggle` (committed-open ⇒ Close) rather than racing the input's blur-close.
          onMouseDown={(e) => e.preventDefault()}
          // Only a committed-open box offers Close; a mere hover-preview still reads as
          // "Search by name" and a click there opens+focuses rather than closes.
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

// A selectable, in-place-renamable, deletable list row shared by Patterns and
// Maps (#141). `noun` only varies the rename-conflict / delete copy.
function EditableListItem({
  name,
  noun,
  active,
  dim,
  takenNames,
  navKey,
  onSelect,
  onRename,
  onDelete,
  onRowRef,
  onRowKeyDown,
}: {
  name: string
  noun: 'pattern' | 'map' | 'mixin' | 'controller'
  active: boolean
  dim?: string
  takenNames: string[]
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
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    if (!onRename) return
    setDraft(name)
    setConflict(false)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitRename() {
    if (!onRename) { setEditing(false); return }
    const trimmed = draft.trim()
    if (!trimmed) { setEditing(false); return }
    if (trimmed === name) { setEditing(false); return }
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
                : 'bg-zinc-700 text-zinc-100',
            ].join(' ')}
            title={conflict ? `A ${noun} with that name already exists` : undefined}
          />
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate">{name}</span>
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
        <AlertDialogTitle>Delete {noun}?</AlertDialogTitle>
        <AlertDialogDescription>
          "{name}" will be permanently deleted and cannot be recovered.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}

function StockListItem({
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

// The muted subheader over a stock/reference section. User items sit directly
// under the entity title row; a subheader appears only where a second provenance
// group genuinely coexists. The header itself is the disclosure control.
function StockSectionHeader({
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

function railScrollMetrics(el: HTMLDivElement): ScrollMetrics {
  const { clientHeight, scrollHeight, scrollTop } = el
  if (scrollHeight <= clientHeight + 1) return { top: 0, height: 0, visible: false }
  const height = Math.max(24, (clientHeight / scrollHeight) * clientHeight)
  const maxTop = clientHeight - height
  const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop
  return { top, height, visible: true }
}

function RailScrollThumb({
  metrics,
  scrollRef,
}: {
  metrics: ScrollMetrics
  scrollRef: React.RefObject<HTMLDivElement | null>
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

export function PatternList() {
  const setSource = useEditorStore((s) => s.setSource)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const setPreviewPatternName = useEditorStore((s) => s.setPreviewPatternName)
  const closeDocs = useDocsStore((s) => s.closeDocs)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const loadPatterns = usePatternStore((s) => s.loadPatterns)
  const renamePattern = usePatternStore((s) => s.renamePattern)
  const removePattern = usePatternStore((s) => s.removePattern)
  const addPattern = usePatternStore((s) => s.addPattern)

  const userMaps = useMapStore((s) => s.userMaps)
  const renameMap = useMapStore((s) => s.renameMap)
  const removeMap = useMapStore((s) => s.removeMap)
  const editingMap = useMapStore((s) => s.editingMap)
  const createNewMap = useMapStore((s) => s.createNewMap)
  const openExistingMap = useMapStore((s) => s.openExistingMap)
  const openStockMap = useMapStore((s) => s.openStockMap)
  const closeMapEditor = useMapStore((s) => s.closeMapEditor)
  const userMixins = useMixinStore((s) => s.userMixins)
  const editingMixin = useMixinStore((s) => s.editingMixin)
  const createNewMixin = useMixinStore((s) => s.createNewMixin)
  const openExistingMixin = useMixinStore((s) => s.openExistingMixin)
  const openStockMixin = useMixinStore((s) => s.openStockMixin)
  const closeMixinEditor = useMixinStore((s) => s.closeMixinEditor)
  const renameMixin = useMixinStore((s) => s.renameMixin)
  const removeMixin = useMixinStore((s) => s.removeMixin)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const loadControllerProfiles = useControllerProfileStore((s) => s.loadProfiles)
  const removeControllerProfile = useControllerProfileStore((s) => s.removeProfile)
  const liveControllers = useControllerStore((s) => s.controllers)
  const navigate = useRouterStore((s) => s.navigate)
  const route = useRouterStore((s) => s.route)

  // Open-from-disk (.epe import) lives next to "New pattern" (#141): both create
  // a pattern, so they sit together on the Patterns header.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current) }, [])

  function showImportError(msg: string) {
    setImportError(msg)
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current)
    importErrorTimerRef.current = setTimeout(() => setImportError(null), 4000)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result
      if (typeof text !== 'string') return
      let parsed
      try {
        parsed = parseEpe(text)
      } catch (err) {
        showImportError(err instanceof Error ? err.message : 'Failed to import EPE file')
        return
      }
      const id = newPersonalContentId()
      const name = uniquePatternName(parsed.name, userPatterns.map((p) => p.name))
      const record: PatternRecord = { id, name, src: parsed.src, controls: {}, updatedAt: Date.now() }
      await addPattern(record)
      useMapStore.getState().closeMapEditor()
      useMixinStore.getState().closeMixinEditor()
      useDocsStore.getState().closeDocs()
      setActivePattern(id)
      setSource(record.src)
      setPreviewSource(record.src)
      setPreviewPatternName(record.name)
      setIsReadOnly(false)
    }
    reader.readAsText(file)
  }

  const railMode: RailMode =
    route.kind === 'studio' && route.entity !== null
      ? route.entity.kind
      : 'patterns'
  // The dimension lens (#251). Ephemeral: component state, resets to All on reload.
  const [dimLens, setDimLens] = useState<DimLens>('all')
  // The type-down name search (#252). Ephemeral too: resets to '' on reload, and
  // separate per rail mode so a map search doesn't leak into pattern browsing.
  const [queries, setQueries] = useState<Record<RailMode, string>>({
    patterns: '',
    maps: '',
    mixins: '',
    controllers: '',
    shows: '',
  })

  const [showStockPatterns, setShowStockPatterns] = useState(() => {
    try {
      return window.sessionStorage.getItem('pxlblz.showStockPatterns') !== '0'
    } catch {
      return true
    }
  })
  const [showStockMaps, setShowStockMaps] = useState(() => {
    try {
      return window.sessionStorage.getItem('pxlblz.showStockMaps') !== '0'
    } catch {
      return true
    }
  })
  const [showStockMixins, setShowStockMixins] = useState(() => {
    try {
      return window.sessionStorage.getItem('pxlblz.showStockMixins') !== '0'
    } catch {
      return true
    }
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const patternRowRefs = useRef(new Map<string, HTMLLIElement>())
  const lastEntityByModeRef = useRef<Record<RailMode, string | null>>({
    patterns: null,
    maps: null,
    mixins: null,
    controllers: null,
    shows: null,
  })
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({ top: 0, height: 0, visible: false })
  const [personalWorkspaceAuthenticated, setPersonalWorkspaceAuthenticated] = useState(false)
  const setGlobalWorkspaceAuthenticated = useWorkspaceStore((s) => s.setPersonalWorkspaceAuthenticated)
  const query = queries[railMode]
  const setQuery = (next: string) => setQueries((q) => ({ ...q, [railMode]: next }))

  function handleRailModeChange(next: RailMode) {
    if (next === 'maps' && dimLens === 1) setDimLens(2)
    closeDocs()
    if (next !== 'maps') closeMapEditor()
    if (next !== 'mixins') closeMixinEditor()
    if (next === 'shows') {
      navigate({ kind: 'studio', entity: { kind: next, id: null } })
      return
    }
    if (next === 'controllers') {
      const last = lastEntityByModeRef.current.controllers
      const id = controllerProfiles.some((profile) => profile.id === last)
        ? last
        : (controllerProfiles[0]?.id ?? null)
      navigate({ kind: 'studio', entity: { kind: next, id } })
      return
    }
    const last = lastEntityByModeRef.current[next]
    const id = next === 'patterns'
      ? (userPatterns.some((p) => p.id === last) || GALLERY_PATTERNS.some((p) => p.name === last) ? last : null)
      : next === 'maps'
        ? (userMaps.some((m) => m.id === last) || STOCK_MAP_ITEMS.some((m) => m.id === last) ? last : null)
      : next === 'mixins'
        ? (userMixins.some((m) => m.id === last) || STOCK_MIXIN_ITEMS.some((m) => m.id === last) ? last : null)
      : null
    navigate({ kind: 'studio', entity: { kind: next, id } })
  }

  function openCatalog() {
    navigate({ kind: 'gallery' })
  }

  function updateScrollMetrics() {
    const el = scrollRef.current
    if (!el) return
    setScrollMetrics(railScrollMetrics(el))
  }

  useEffect(() => {
    updateScrollMetrics()
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const resizeObserver = new ResizeObserver(updateScrollMetrics)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [
    railMode,
    dimLens,
    query,
    userPatterns.length,
    userMaps.length,
    userMixins.length,
    controllerProfiles.length,
    showStockPatterns,
    showStockMaps,
    showStockMixins,
  ])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('pxlblz.showStockPatterns', showStockPatterns ? '1' : '0')
    } catch {
      // Session persistence is a convenience only.
    }
  }, [showStockPatterns])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('pxlblz.showStockMaps', showStockMaps ? '1' : '0')
    } catch {
      // Session persistence is a convenience only.
    }
  }, [showStockMaps])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('pxlblz.showStockMixins', showStockMixins ? '1' : '0')
    } catch {
      // Session persistence is a convenience only.
    }
  }, [showStockMixins])

  useEffect(() => {
    if (route.kind !== 'studio' || route.entity === null || route.entity.id === null) return
    lastEntityByModeRef.current[route.entity.kind] = route.entity.id
  }, [route])

  useEffect(() => {
    if (route.kind !== 'studio' || route.entity?.kind !== 'controllers' || route.entity.id !== null) return
    const last = lastEntityByModeRef.current.controllers
    const id = controllerProfiles.some((profile) => profile.id === last)
      ? last
      : (controllerProfiles[0]?.id ?? null)
    if (id) navigate({ kind: 'studio', entity: { kind: 'controllers', id } }, { replace: true })
  }, [controllerProfiles, navigate, route])

  useEffect(() => {
    let cancelled = false
    async function hydratePersonalContent() {
      const session = await getAuthSession().catch(() => ({ authenticated: false as const }))
      if (session.authenticated) {
        await initializePersonalContentProvider({ mode: 'remote-api' })
      } else {
        await initializePersonalContentProvider({ provider: demoPersonalContentProvider })
      }
      await initializeControllerMetadataStorage(
        session.authenticated
          ? { mode: 'remote-api' }
          : { storage: demoControllerMetadataStorage },
      )
      if (cancelled) return
      setPersonalWorkspaceAuthenticated(session.authenticated)
      setGlobalWorkspaceAuthenticated(session.authenticated)
      // Hydrate user maps before the first pattern opens so the layout selector is
      // populated from whichever personal provider won startup selection.
      await useMapStore.getState().loadMaps()
      if (cancelled) return
      await useMixinStore.getState().loadMixins()
      if (cancelled) return
      await loadControllerProfiles()
      if (cancelled) return
      await usePatternStore.getState().loadDemoOverrides()
      if (cancelled) return
      await loadPatterns()
      if (cancelled) return
      // A deep link to a concrete studio entity outranks the last-active restore
      // (#308): App's route effect opens the addressed pattern once loadPatterns
      // lands. Kind-only shell routes (/studio/maps, /studio/mixins, ...) still
      // show the restored/default editor content beside the active rail list.
      const route = useRouterStore.getState().route
      if (route.kind === 'studio' && route.entity !== null && route.entity.id !== null) return
      const last = await getPersonalContentProvider().getLastActive().catch(() => undefined)
      const { userPatterns, setActivePattern, setActiveLibrary, setActiveDemo } = usePatternStore.getState()
      const { setSource, setIsReadOnly, setPreviewSource, setPreviewPatternName } = useEditorStore.getState()
      if (!last) {
        setActiveDemo(DEFAULT_DEMO_NAME)
        setSource(DEMOS[DEFAULT_DEMO_NAME])
        setPreviewSource(DEMOS[DEFAULT_DEMO_NAME])
        setPreviewPatternName(DEFAULT_DEMO_NAME)
        setIsReadOnly(true)
        return
      }
      if (last.type === 'pattern') {
        const p = userPatterns.find((p) => p.id === last.id)
        if (p) {
          setActivePattern(p.id)
          setSource(p.src)
          setPreviewSource(p.src)
          setPreviewPatternName(p.name)
          setIsReadOnly(false)
        }
      } else if (last.type === 'demo') {
        if (DEMOS[last.name]) {
          setActiveDemo(last.name)
          setSource(DEMOS[last.name])
          setPreviewSource(DEMOS[last.name])
          setPreviewPatternName(last.name)
          setIsReadOnly(true)
        }
      } else if (last.type === 'library') {
        if (LIBRARIES[last.name]) {
          setActiveLibrary(last.name)
          setSource(LIBRARIES[last.name])
          setIsReadOnly(true)
        }
      }
    }
    void hydratePersonalContent()
    return () => {
      cancelled = true
    }
  }, [loadControllerProfiles, loadPatterns, setGlobalWorkspaceAuthenticated])

  function openUserPattern(pattern: PatternRecord) {
    closeMapEditor()
    closeMixinEditor()
    closeDocs()
    setActivePattern(pattern.id)
    setSource(pattern.src)
    setPreviewSource(pattern.src)
    setPreviewPatternName(pattern.name)
    setIsReadOnly(false)
  }

  function openStockPatternRoute(name: string) {
    openDemoPattern(name)
    navigate({ kind: 'studio', entity: { kind: 'patterns', id: name } })
  }

  // Create a fresh "Untitled Pattern" and open it. Lives next to Patterns
  // (#141) so a new pattern is created right by its list.
  async function handleCreatePattern() {
    if (!personalWorkspaceAuthenticated) return
    closeMapEditor()
    closeMixinEditor()
    closeDocs()
    const id = newPersonalContentId()
    const name = uniquePatternName('Untitled Pattern', userPatterns.map((p) => p.name))
    const record: PatternRecord = { id, name, src: NEW_PATTERN_SRC, controls: {}, updatedAt: Date.now() }
    await addPattern(record)
    setActivePattern(id)
    setSource(record.src)
    setPreviewSource(record.src)
    setPreviewPatternName(record.name)
    setIsReadOnly(false)
  }

  // Open a custom map in editor map mode (#151): loads its source, flips the
  // editor to the JS map flavor, and drives the bare-geometry preview.
  function openUserMap(map: MapRecord) {
    closeDocs()
    closeMixinEditor()
    openExistingMap(map)
    navigate({ kind: 'studio', entity: { kind: 'maps', id: map.id } })
  }

  function openStockMapRoute(id: string) {
    closeDocs()
    closeMixinEditor()
    openStockMap(id)
    navigate({ kind: 'studio', entity: { kind: 'maps', id } })
  }

  async function handleCreateMap() {
    closeMixinEditor()
    await createNewMap()
    const editing = useMapStore.getState().editingMap
    if (editing?.kind === 'existing') navigate({ kind: 'studio', entity: { kind: 'maps', id: editing.id } })
  }

  async function handleCreateMixin() {
    closeMapEditor()
    await createNewMixin()
    const editing = useMixinStore.getState().editingMixin
    if (editing?.kind === 'existing') navigate({ kind: 'studio', entity: { kind: 'mixins', id: editing.id } })
  }

  function openUserMixin(mixin: MixinRecord) {
    closeDocs()
    openExistingMixin(mixin)
    navigate({ kind: 'studio', entity: { kind: 'mixins', id: mixin.id } })
  }

  function openStockMixinRoute(id: string) {
    closeDocs()
    openStockMixin(id)
    navigate({ kind: 'studio', entity: { kind: 'mixins', id } })
  }

  function openControllerProfile(profileId: string) {
    closeMapEditor()
    closeMixinEditor()
    closeDocs()
    navigate({ kind: 'studio', entity: { kind: 'controllers', id: profileId } })
  }

  async function handleRemoveControllerProfile(profileId: string) {
    await removeControllerProfile(profileId)
    if (route.kind === 'studio' && route.entity?.kind === 'controllers' && route.entity.id === profileId) {
      navigate({ kind: 'studio', entity: { kind: 'controllers', id: null } })
    }
  }

  async function handleRemovePattern(patternId: string) {
    await removePattern(patternId)
    if (route.kind === 'studio' && route.entity?.kind === 'patterns' && route.entity.id === patternId) {
      navigate({ kind: 'studio', entity: { kind: 'patterns', id: null } })
    }
  }

  async function handleRemoveMap(mapId: string) {
    await removeMap(mapId)
    if (route.kind === 'studio' && route.entity?.kind === 'maps' && route.entity.id === mapId) {
      navigate({ kind: 'studio', entity: { kind: 'maps', id: null } })
    }
  }

  async function handleRemoveMixin(mixinId: string) {
    await removeMixin(mixinId)
    if (route.kind === 'studio' && route.entity?.kind === 'mixins' && route.entity.id === mixinId) {
      navigate({ kind: 'studio', entity: { kind: 'mixins', id: null } })
    }
  }

  const visibleUserPatterns = userPatterns.filter(
    (pattern) =>
      matchesLens(nativeDim(pattern.src), dimLens) && matchesQuery(pattern.name, query),
  )
  const visibleStockPatterns = GALLERY_PATTERNS.filter(
    (pattern) => matchesLens(pattern.dim, dimLens) && matchesQuery(pattern.name, query),
  )

  const patternNavItems = visibleUserPatterns.map((pattern) => ({
    key: `pattern:${pattern.id}`,
    activate: () => openUserPattern(pattern),
  }))

  function handlePatternRowRef(key: string, el: HTMLLIElement | null) {
    if (el) patternRowRefs.current.set(key, el)
    else patternRowRefs.current.delete(key)
  }

  function focusPatternRow(key: string) {
    window.setTimeout(() => {
      const row = patternRowRefs.current.get(key)
      row?.focus()
      if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
    }, 0)
  }

  function handlePatternRowKeyDown(e: React.KeyboardEvent<HTMLLIElement>, key: string) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const index = patternNavItems.findIndex((item) => item.key === key)
    if (index === -1) return
    const nextIndex = e.key === 'ArrowDown'
      ? Math.min(patternNavItems.length - 1, index + 1)
      : Math.max(0, index - 1)
    if (nextIndex === index) return
    e.preventDefault()
    const next = patternNavItems[nextIndex]
    if (!next) return
    next.activate()
    focusPatternRow(next.key)
  }

  return (
    <div data-testid="studio-rail" className="flex h-full text-xs font-mono">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epe"
        className="hidden"
        onChange={handleFileChange}
      />
      <ActivityStrip
        mode={railMode}
        onModeChange={handleRailModeChange}
        onCatalog={openCatalog}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {(railMode === 'patterns' || railMode === 'maps') && (
          <>
            <RailEntityHeader
              title={railMode === 'patterns' ? 'Patterns' : 'Maps'}
              action={railMode === 'patterns'
                ? (
                  personalWorkspaceAuthenticated ? (
                    <>
                      <HeaderAction
                        icon={<FolderOpen size={14} />}
                        title="Open pattern from .epe file"
                        onClick={() => fileInputRef.current?.click()}
                      />
                      <HeaderAction icon={<Plus size={14} />} title="New pattern" onClick={handleCreatePattern} />
                    </>
                  ) : null
                )
                : (
                  personalWorkspaceAuthenticated
                    ? <HeaderAction icon={<Plus size={14} />} title="New map" onClick={() => void handleCreateMap()} />
                    : null
                )}
            >
              <RailFilterBar
                lens={dimLens}
                onLensChange={setDimLens}
                query={query}
                onQueryChange={setQuery}
                hideOneDimensional={railMode === 'maps'}
              />
            </RailEntityHeader>
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                data-testid="pattern-list-scroll"
                onScroll={updateScrollMetrics}
                className="rail-list-scroll h-full overflow-y-auto overflow-x-hidden pb-2"
              >
                {railMode === 'patterns' && (
                  <>
                    {importError && (
                      <p className="pl-3 pr-3 py-1 text-red-400 truncate" title={importError}>{importError}</p>
                    )}
                    {personalWorkspaceAuthenticated ? (
                      visibleUserPatterns.length === 0 ? (
                        <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">No patterns yet</p>
                      ) : (
                        <ul className="pt-2">
                          {visibleUserPatterns.map((pattern) => (
                            <EditableListItem
                              key={pattern.id}
                              name={pattern.name}
                              noun="pattern"
                              active={activePatternId === pattern.id}
                              dim={dimLens === 'all' ? `${nativeDim(pattern.src)}D` : undefined}
                              takenNames={userPatterns.filter((p) => p.id !== pattern.id).map((p) => p.name)}
                              navKey={`pattern:${pattern.id}`}
                              onSelect={() => openUserPattern(pattern)}
                              onRename={(name) => renamePattern(pattern.id, name)}
                              onDelete={() => void handleRemovePattern(pattern.id)}
                              onRowRef={handlePatternRowRef}
                              onRowKeyDown={handlePatternRowKeyDown}
                            />
                          ))}
                        </ul>
                      )
                    ) : (
                      <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
                        <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
                        {' '}to save patterns
                      </p>
                    )}
                    <StockSectionHeader
                      label="Built-in Patterns"
                      open={showStockPatterns}
                      onToggle={() => setShowStockPatterns((visible) => !visible)}
                    />
                    {showStockPatterns && (
                      visibleStockPatterns.length === 0 ? (
                        <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">No built-in patterns match</p>
                      ) : (
                        <ul className="pt-2 opacity-85">
                          {visibleStockPatterns.map((pattern) => (
                            <StockListItem
                              key={pattern.name}
                              name={pattern.name}
                              active={activeDemoName === pattern.name}
                              meta={dimLens === 'all' ? `${pattern.dim}D` : undefined}
                              onSelect={() => openStockPatternRoute(pattern.name)}
                            />
                          ))}
                        </ul>
                      )
                    )}
                  </>
                )}

                {railMode === 'maps' && (() => {
                  const visibleMaps = userMaps.filter(
                    (map) => matchesLens(map.dim, dimLens) && matchesQuery(map.name, query),
                  )
                  const visibleStockMaps = STOCK_MAP_ITEMS.filter(
                    (map) => matchesLens(map.dim, dimLens) && matchesQuery(map.name, query),
                  )
                  return (
                    <>
                      {!personalWorkspaceAuthenticated ? (
                        <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
                          <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
                          {' '}to save maps
                        </p>
                      ) : visibleMaps.length === 0 ? (
                        userMaps.length === 0 ? (
                          <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">
                            No custom maps yet
                          </p>
                        ) : (
                          null
                        )
                      ) : (
                        <ul className="pt-2">
                          {visibleMaps.map((map) => (
                            <EditableListItem
                              key={map.id}
                              name={map.name}
                              noun="map"
                              active={editingMap?.kind === 'existing' && editingMap.id === map.id}
                              dim={dimLens === 'all' ? `${map.dim}D` : undefined}
                              takenNames={userMaps.filter((m) => m.id !== map.id).map((m) => m.name)}
                              onSelect={() => openUserMap(map)}
                              onRename={(name) => renameMap(map.id, name)}
                              onDelete={() => void handleRemoveMap(map.id)}
                            />
                          ))}
                        </ul>
                      )}
                      <StockSectionHeader
                        label="Stock Maps"
                        open={showStockMaps}
                        onToggle={() => setShowStockMaps((visible) => !visible)}
                      />
                      {showStockMaps && (
                        visibleStockMaps.length === 0 ? (
                          <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">No stock maps match</p>
                        ) : (
                          <ul className="pt-2 opacity-85">
                            {visibleStockMaps.map((map) => (
                              <StockListItem
                                key={map.id}
                                name={map.name}
                                active={editingMap?.kind === 'stock' && editingMap.id === map.id}
                                meta={dimLens === 'all' ? `${map.dim}D` : undefined}
                                onSelect={() => openStockMapRoute(map.id)}
                              />
                            ))}
                          </ul>
                        )
                      )}
                    </>
                  )
                })()}
              </div>
              <RailScrollThumb metrics={scrollMetrics} scrollRef={scrollRef} />
            </div>
          </>
        )}
        {railMode === 'controllers' && (
          <>
            <RailEntityHeader title="Controllers" />
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                data-testid="controller-list-scroll"
                onScroll={updateScrollMetrics}
                className="rail-list-scroll h-full overflow-y-auto overflow-x-hidden pb-2"
              >
                {!personalWorkspaceAuthenticated ? (
                  <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
                    <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
                    {' '}to save controllers
                  </p>
                ) : controllerProfiles.length === 0 ? (
                  <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">
                    Connect a Controller to create its profile
                  </p>
                ) : (
                  <ul className="pt-2">
                    {controllerProfiles.map((profile) => (
                      <EditableListItem
                        key={profile.id}
                        name={controllerProfileDisplayName(profile)}
                        noun="controller"
                        active={route.kind === 'studio' && route.entity?.kind === 'controllers' && route.entity.id === profile.id}
                        dim={profileMatchesLive(profile, liveControllers) ? 'LIVE' : 'IDLE'}
                        takenNames={[]}
                        onSelect={() => openControllerProfile(profile.id)}
                        onDelete={() => void handleRemoveControllerProfile(profile.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
              <RailScrollThumb metrics={scrollMetrics} scrollRef={scrollRef} />
            </div>
          </>
        )}
        {railMode === 'mixins' && (
          <>
            <RailEntityHeader
              title="Mixins"
              action={personalWorkspaceAuthenticated
                ? <HeaderAction icon={<Plus size={14} />} title="New mixin" onClick={() => void handleCreateMixin()} />
                : null}
            />
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                data-testid="mixin-list-scroll"
                onScroll={updateScrollMetrics}
                className="rail-list-scroll h-full overflow-y-auto overflow-x-hidden pb-2"
              >
                {!personalWorkspaceAuthenticated ? (
                  <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
                    <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
                    {' '}to save mixins
                  </p>
                ) : userMixins.length === 0 ? (
                  <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">
                    No cloud mixins yet
                  </p>
                ) : (
                  <ul className="pt-2">
                    {userMixins.map((mixin) => (
                      <EditableListItem
                        key={mixin.id}
                        name={mixin.name}
                        noun="mixin"
                        active={editingMixin?.kind === 'existing' && editingMixin.id === mixin.id}
                        dim={mixin.kind}
                        takenNames={userMixins.filter((m) => m.id !== mixin.id).map((m) => m.name)}
                        onSelect={() => openUserMixin(mixin)}
                        onRename={(name) => renameMixin(mixin.id, name)}
                        onDelete={() => void handleRemoveMixin(mixin.id)}
                      />
                    ))}
                  </ul>
                )}
                <StockSectionHeader
                  label="Stock Mixins"
                  open={showStockMixins}
                  onToggle={() => setShowStockMixins((visible) => !visible)}
                />
                {showStockMixins && (
                  <ul className="pt-2 opacity-85">
                    {STOCK_MIXIN_ITEMS.map((mixin) => (
                      <StockListItem
                        key={mixin.id}
                        name={mixin.name}
                        active={editingMixin?.kind === 'stock' && editingMixin.id === mixin.id}
                        meta={mixin.kind}
                        onSelect={() => openStockMixinRoute(mixin.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
              <RailScrollThumb metrics={scrollMetrics} scrollRef={scrollRef} />
            </div>
          </>
        )}
        {railMode === 'shows' && (
          <EntityStubList
            title="Shows"
            detail="Shows will compose clips across zones once the underlying entity model is ready."
          />
        )}
      </div>
    </div>
  )
}
