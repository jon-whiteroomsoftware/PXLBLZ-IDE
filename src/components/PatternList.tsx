import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Braces,
  ChevronDown,
  Cpu,
  FileCode2,
  FolderOpen,
  Images,
  Map as MapIcon,
  PanelsTopLeft,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { nameConflicts, uniquePatternName } from '@/engine/patternName'
import { NEW_PATTERN_SRC } from '@/pixelblaze/newPattern'
import { parseEpe } from '@/engine/epeImport'
import { nativeDim, matchesLens, matchesQuery, type DimLens } from '@/engine/dimLens'
import {
  demoPersonalContentProvider,
  getPersonalContentProvider,
  initializePersonalContentProvider,
  personalContentCollectionLabel,
  storageModeForPersonalContentProvider,
  type PersonalContentStorageMode,
} from '@/engine/personalContentProvider'
import {
  demoControllerMetadataStorage,
  initializeControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import { getAuthSession } from '@/engine/authSession'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, PatternRecord } from '@/store/patternStore'
import { useMapStore, MapRecord } from '@/store/mapStore'
import { useControllerStore } from '@/store/controllerStore'
import {
  profileMatchesLive,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { useDocsStore } from '@/store/docsStore'
import { useRouterStore } from '@/store/routerStore'
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

// A turn-down chevron, sized to read as a clear interactive affordance. Points down
// when open, rotates to point right when collapsed. Inherits the header's text color
// so it brightens with the label on hover.
function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <ChevronDown
      size={17}
      className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
    />
  )
}

// An icon action button for a section header (e.g. "+" new, or open-from-disk).
// Stops propagation so clicking it acts without toggling the section's collapse.
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

function SectionHeader({
  label,
  collapsed,
  onToggle,
  action,
  first,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
  action?: React.ReactNode
  // The topmost header has nothing above it to separate from, so it takes less top
  // pad; later sections lean on generous space above (not a colour/rule) to divide.
  first?: boolean
}) {
  return (
    <div
      onClick={onToggle}
      style={{ letterSpacing: '0.04em' }}
      className={[
        first ? 'pt-0.5' : 'mt-2 pt-2.5 border-t border-zinc-700/80',
        'pb-1 px-3 border-b border-zinc-700/65 flex items-center justify-between gap-1 cursor-pointer select-none text-[11px] font-mono font-semibold text-structural uppercase hover:text-live',
      ].join(' ')}
    >
      <span className="truncate">{label}</span>
      <div className="flex items-center gap-1.5">
        {action}
        <CollapseChevron collapsed={collapsed} />
      </div>
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

function CatalogHint({
  noun,
  detail,
  onCatalog,
}: {
  noun: string
  detail: string
  onCatalog: () => void
}) {
  return (
    <div className="mx-3 mt-3 rounded border border-dashed border-zinc-700/80 bg-zinc-950/25 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
      <p>{detail}</p>
      <button
        type="button"
        onClick={onCatalog}
        className="mt-1 inline-flex items-center gap-1 text-live hover:text-amber-300"
      >
        <BookOpen size={12} aria-hidden />
        Browse the catalog
        <span className="sr-only"> for {noun}</span>
      </button>
    </div>
  )
}

function EntityStubList({
  title,
  label,
  detail,
}: {
  title: string
  label: string
  detail: string
}) {
  return (
    <div className="flex h-full flex-col text-xs font-mono">
      <div className="border-b border-seam px-3 py-2">
        <div className="text-sm font-semibold text-zinc-200">{title}</div>
      </div>
      <div className="px-3 py-3">
        <SectionHeader label={label} first collapsed={false} onToggle={() => {}} />
        <div className="mt-3 rounded border border-dashed border-zinc-700/80 bg-zinc-950/25 px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
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
    <div className="flex items-center gap-1 px-3 pt-1.5 pb-1">
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
  noun: 'pattern' | 'map' | 'controller'
  active: boolean
  dim?: string
  takenNames: string[]
  navKey?: string
  onSelect: () => void
  onRename: (name: string) => void
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
    setDraft(name)
    setConflict(false)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitRename() {
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
            <span className="absolute right-2 top-0 bottom-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={startEdit}
                className="text-zinc-500 hover:text-zinc-300 text-xs px-0.5"
                title="Rename"
                aria-label="Rename"
              >
                ✎
              </button>
              <AlertDialogTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="text-zinc-500 hover:text-red-400 text-xs px-0.5"
                  title="Delete"
                  aria-label="Delete"
                >
                  ✕
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
  const closeMapEditor = useMapStore((s) => s.closeMapEditor)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const loadControllerProfiles = useControllerProfileStore((s) => s.loadProfiles)
  const createControllerProfile = useControllerProfileStore((s) => s.createProfile)
  const renameControllerProfile = useControllerProfileStore((s) => s.renameProfile)
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

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const patternRowRefs = useRef(new Map<string, HTMLLIElement>())
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({ top: 0, height: 0, visible: false })
  const [personalStorageMode, setPersonalStorageMode] = useState<PersonalContentStorageMode>('demo')
  const [personalWorkspaceAuthenticated, setPersonalWorkspaceAuthenticated] = useState(false)
  const setGlobalWorkspaceAuthenticated = useWorkspaceStore((s) => s.setPersonalWorkspaceAuthenticated)
  const query = queries[railMode]
  const setQuery = (next: string) => setQueries((q) => ({ ...q, [railMode]: next }))

  function handleRailModeChange(next: RailMode) {
    if (next === 'maps' && dimLens === 1) setDimLens(2)
    closeDocs()
    navigate({ kind: 'studio', entity: { kind: next, id: null } })
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
  }, [railMode, dimLens, query, userPatterns.length, userMaps.length, controllerProfiles.length, collapsedSections])

  useEffect(() => {
    let cancelled = false
    async function hydratePersonalContent() {
      const session = await getAuthSession().catch(() => ({ authenticated: false as const }))
      const provider = session.authenticated
        ? await initializePersonalContentProvider({ mode: 'remote-api' })
        : await initializePersonalContentProvider({ provider: demoPersonalContentProvider })
      await initializeControllerMetadataStorage(
        session.authenticated
          ? { mode: 'remote-api' }
          : { storage: demoControllerMetadataStorage },
      )
      if (cancelled) return
      setPersonalWorkspaceAuthenticated(session.authenticated)
      setGlobalWorkspaceAuthenticated(session.authenticated)
      setPersonalStorageMode(storageModeForPersonalContentProvider(provider))
      // Hydrate user maps before the first pattern opens so the layout selector is
      // populated from whichever personal provider won startup selection.
      await useMapStore.getState().loadMaps()
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
    closeDocs()
    setActivePattern(pattern.id)
    setSource(pattern.src)
    setPreviewSource(pattern.src)
    setPreviewPatternName(pattern.name)
    setIsReadOnly(false)
  }

  // Create a fresh "Untitled Pattern" and open it. Lives next to Patterns
  // (#141) so a new pattern is created right by its list.
  async function handleCreatePattern() {
    if (!personalWorkspaceAuthenticated) return
    closeMapEditor()
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
    openExistingMap(map)
  }

  function openControllerProfile(profileId: string) {
    closeMapEditor()
    closeDocs()
    navigate({ kind: 'studio', entity: { kind: 'controllers', id: profileId } })
  }

  async function handleCreateControllerProfile() {
    if (!personalWorkspaceAuthenticated) return
    const profile = await createControllerProfile({
      name: uniquePatternName('Untitled Controller', controllerProfiles.map((item) => item.name)),
    })
    openControllerProfile(profile.id)
  }

  async function handleRemoveControllerProfile(profileId: string) {
    await removeControllerProfile(profileId)
    if (route.kind === 'studio' && route.entity?.kind === 'controllers' && route.entity.id === profileId) {
      navigate({ kind: 'studio', entity: { kind: 'controllers', id: null } })
    }
  }

  // An active name search force-expands every group: a hit inside a collapsed group
  // must still surface (#252 follow-up). The stored collapse state is left untouched,
  // so groups snap back to the user's chosen open/closed layout when the query clears.
  const searching = query.trim() !== ''
  const isCollapsed = (label: string) => !searching && !!collapsedSections[label]
  const toggleCollapsed = (label: string) =>
    setCollapsedSections((c) => ({ ...c, [label]: !c[label] }))
  const personalPatternsLabel = personalContentCollectionLabel(personalStorageMode, 'patterns')
  const personalMapsLabel = personalContentCollectionLabel(personalStorageMode, 'maps')
  const personalControllersLabel = personalContentCollectionLabel(personalStorageMode, 'controllers')
  const visibleUserPatterns = userPatterns.filter(
    (pattern) =>
      matchesLens(nativeDim(pattern.src), dimLens) && matchesQuery(pattern.name, query),
  )

  const patternNavItems = [
    ...(!isCollapsed(personalPatternsLabel)
      ? visibleUserPatterns.map((pattern) => ({
        key: `pattern:${pattern.id}`,
        activate: () => openUserPattern(pattern),
      }))
      : []),
  ]

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
            <div className="border-b border-seam px-3 py-2">
              <div className="mb-1 text-sm font-semibold text-zinc-200">
                {railMode === 'patterns' ? 'Patterns' : 'Maps'}
              </div>
              <RailFilterBar
                lens={dimLens}
                onLensChange={setDimLens}
                query={query}
                onQueryChange={setQuery}
                hideOneDimensional={railMode === 'maps'}
              />
            </div>
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                data-testid="pattern-list-scroll"
                onScroll={updateScrollMetrics}
                className="rail-list-scroll h-full overflow-y-auto overflow-x-hidden pb-2"
              >
                {railMode === 'patterns' && (
                  <>
                    <SectionHeader
                      label={personalPatternsLabel}
                      first
                      collapsed={isCollapsed(personalPatternsLabel)}
                      onToggle={() => toggleCollapsed(personalPatternsLabel)}
                      action={
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
                      }
                    />
                    {importError && (
                      <p className="pl-3 pr-3 py-1 text-red-400 truncate" title={importError}>{importError}</p>
                    )}
                    {!isCollapsed(personalPatternsLabel) && (
                      personalWorkspaceAuthenticated ? (
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
                                onDelete={() => removePattern(pattern.id)}
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
                      )
                    )}
                    <CatalogHint
                      noun="patterns"
                      detail="Need a starting point? Browse built-in patterns in the catalog, then open one in Studio when it is time to edit."
                      onCatalog={openCatalog}
                    />
                  </>
                )}

                {railMode === 'maps' && (() => {
                  const visibleMaps = userMaps.filter(
                    (map) => matchesLens(map.dim, dimLens) && matchesQuery(map.name, query),
                  )
                  return (
                    <>
                      <SectionHeader
                        label={personalMapsLabel}
                        first
                        collapsed={isCollapsed(personalMapsLabel)}
                        onToggle={() => toggleCollapsed(personalMapsLabel)}
                        action={personalWorkspaceAuthenticated
                          ? <HeaderAction icon={<Plus size={14} />} title="New map" onClick={createNewMap} />
                          : null}
                      />
                      {!isCollapsed(personalMapsLabel) && (
                        !personalWorkspaceAuthenticated ? (
                          <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
                            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
                            {' '}to save maps
                          </p>
                        ) : visibleMaps.length === 0 ? (
                          userMaps.length === 0 ? (
                            <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">No custom maps yet</p>
                          ) : null
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
                                onDelete={() => removeMap(map.id)}
                              />
                            ))}
                          </ul>
                        )
                      )}
                      <CatalogHint
                        noun="maps"
                        detail="Stock maps moved to the catalog so the rail stays focused on your saved map workspace."
                        onCatalog={openCatalog}
                      />
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
            <div className="border-b border-seam px-3 py-2">
              <div className="text-sm font-semibold text-zinc-200">Controllers</div>
            </div>
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                data-testid="controller-list-scroll"
                onScroll={updateScrollMetrics}
                className="rail-list-scroll h-full overflow-y-auto overflow-x-hidden pb-2"
              >
                <SectionHeader
                  label={personalControllersLabel}
                  first
                  collapsed={isCollapsed(personalControllersLabel)}
                  onToggle={() => toggleCollapsed(personalControllersLabel)}
                  action={personalWorkspaceAuthenticated
                    ? <HeaderAction icon={<Plus size={14} />} title="New controller profile" onClick={handleCreateControllerProfile} />
                    : null}
                />
                {!isCollapsed(personalControllersLabel) && (
                  !personalWorkspaceAuthenticated ? (
                    <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
                      <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
                      {' '}to save controllers
                    </p>
                  ) : controllerProfiles.length === 0 ? (
                    <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">No controller profiles yet</p>
                  ) : (
                    <ul className="pt-2">
                      {controllerProfiles.map((profile) => (
                        <EditableListItem
                          key={profile.id}
                          name={profile.name}
                          noun="controller"
                          active={route.kind === 'studio' && route.entity?.kind === 'controllers' && route.entity.id === profile.id}
                          dim={profileMatchesLive(profile, liveControllers) ? 'LIVE' : 'IDLE'}
                          takenNames={controllerProfiles.filter((item) => item.id !== profile.id).map((item) => item.name)}
                          onSelect={() => openControllerProfile(profile.id)}
                          onRename={(name) => renameControllerProfile(profile.id, name)}
                          onDelete={() => void handleRemoveControllerProfile(profile.id)}
                        />
                      ))}
                    </ul>
                  )
                )}
              </div>
              <RailScrollThumb metrics={scrollMetrics} scrollRef={scrollRef} />
            </div>
          </>
        )}
        {railMode === 'mixins' && (
          <EntityStubList
            title="Mixins"
            label="Mixins"
            detail="Mixin lists land in their own slice. This rail entry is reserved so the v2 Studio navigation can settle first."
          />
        )}
        {railMode === 'shows' && (
          <EntityStubList
            title="Shows"
            label="Shows"
            detail="Shows will compose clips across zones once the underlying entity model is ready."
          />
        )}
      </div>
    </div>
  )
}
