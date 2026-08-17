import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Trash2,
  Variable,
  Zap,
} from 'lucide-react'
import { controlIcon, inlineIcon } from '@/components/iconScale'
import { Button } from '@/components/ui/button'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
import { sectionActionButtonClass } from './ControllerProfileHeaderActions'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import {
  getControllerBindings,
  getControllerPushRecordsRevision,
  getPushRecords,
  setControllerBindings,
  setPushRecords,
  subscribeControllerPushRecordsRevision,
} from '@/engine/controllerMetadataStorage'
import { removeManagedControllerSavedProgramMetadata } from '@/engine/controllerSavedProgramDeletion'
import { queueControllerDeviceWrite } from '@/engine/controllerDeviceWriteQueue'
import type { ControllerProfile } from '@/engine/controllerProfile'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  describeControllerSavedPrograms,
  sortControllerSavedPrograms,
  type ControllerSavedProgramFeatures,
  type ControllerSavedPatternStatus,
  type ControllerSavedProgramSort,
  type ControllerSavedProgramRow,
  type ControllerSavedProgramsView,
} from '@/engine/controllerSavedPrograms'
import { artifactHash } from '@/engine/artifactStamp'
import {
  createSavedProgramPatternRecord,
  decideSavedProgramImport,
  type SavedProgramImportDecision,
} from '@/engine/savedProgramImport'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import {
  useControllerStore,
  type ControllerReconciliationState,
} from '@/store/controllerStore'
import {
  ControllerProgramDeletionError,
  useControllerPanelStore,
} from '@/store/controllerPanelStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import { useRouterStore } from '@/store/routerStore'
import {
  controllerSavedProgramsReadKey,
  useControllerSavedProgramsLiveStore,
} from '@/store/controllerSavedProgramsLiveStore'

const tableHeadClass = 'border-b border-seam pb-1.5 pr-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-500'
const EMPTY_CONTROLLER_PROGRAMS: ProgramListEntry[] = []
const tableCellClass = 'border-t border-zinc-900/85 py-1.5 pr-2 align-middle'
const tableClass = 'w-full table-fixed border-collapse text-xs [&_tbody_tr:first-child_td]:border-t-0'
const iconButtonClass = 'inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent'
const actionClusterClass = 'inline-flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

type SavedProgramsReadStatus = 'offline' | 'loading' | 'ready' | 'error'

type PendingProgramImport = {
  program: ControllerSavedProgramRow
  decision: SavedProgramImportDecision
}

type PendingProgramDelete = {
  program: ControllerSavedProgramRow
  controllerId: string
  controllerName: string
  liveEpoch: number
  profileId: string
  provider: ReturnType<typeof getControllerProvider>
}

const statusPresentation: Record<ControllerSavedPatternStatus, { title: string; className: string }> = {
  current: {
    title: 'Current: the saved Pattern matches this Controller profile and renderer.',
    className: 'bg-emerald-400',
  },
  stale: {
    title: 'Push again: a code-affecting profile or renderer setting changed since this Pattern was saved.',
    className: 'bg-amber-400',
  },
  unmanaged: {
    title: 'Unknown: no recognized durable profile signature is available for this saved Pattern.',
    className: 'bg-zinc-600',
  },
  queued: {
    title: 'Queued: waiting to sync with this Controller profile.',
    className: 'animate-pulse bg-zinc-500',
  },
  updating: {
    title: 'Syncing: updating this saved Pattern for the Controller profile.',
    className: 'animate-pulse bg-amber-400',
  },
  failed: {
    title: 'Failed: PXLBLZ could not update this saved Pattern.',
    className: 'bg-red-500',
  },
}

function PatternStatusDot({ status }: { status: ControllerSavedPatternStatus }) {
  const presentation = statusPresentation[status]
  return (
    <span
      title={presentation.title}
      aria-label={presentation.title}
      className="inline-flex h-4 items-center"
    >
      <span aria-hidden className={`size-2 rounded-full ${presentation.className}`} />
    </span>
  )
}

const EMPTY_PROFILE_FEATURES: ControllerSavedProgramFeatures = {
  powerCap: false,
  hardwareBrightness: false,
  controlBinding: false,
  variableBinding: false,
}

function ProfileFeatureIcons({ features }: { features?: ControllerSavedProgramFeatures }) {
  const resolved = features ?? EMPTY_PROFILE_FEATURES
  const items = [
    [resolved.powerCap, Zap, 'Power cap is baked into this saved Pattern'],
    [resolved.hardwareBrightness, Sun, 'Hardware brightness input is baked into this saved Pattern'],
    [resolved.controlBinding, SlidersHorizontal, "A hardware input drives one of this Pattern's controls"],
    [resolved.variableBinding, Variable, "A hardware input assigns one of this Pattern's variables"],
  ] as const
  const shown = items.filter(([visible]) => visible)
  if (shown.length === 0) return <span className="text-zinc-700">·</span>
  return (
    <span className="inline-flex items-center gap-1 text-zinc-400">
      {shown.map(([, Icon, title]) => (
        <span key={title} title={title} aria-label={title} className="inline-flex">
          <Icon size={12} aria-hidden />
        </span>
      ))}
    </span>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-5 text-zinc-500">
      {children}
    </p>
  )
}

function SavedProgramSourceNote({ program }: { program: ControllerSavedProgramRow }) {
  if (program.kind === 'foreign') return null
  const available = program.routeId !== null
  if (program.sourceKind === 'show') {
    const output = `Show output${program.showOutputContract
      ? ` · ${program.showOutputContract.kind === 'installation'
        ? `Installation · ${program.showOutputContract.pixelCount} px`
        : 'Portable 2D'}`
      : ''}`
    return (
      <>
        <span className="block truncate text-[10px] text-zinc-500">{output}</span>
        {!available && (
          <span className="block text-[10px] text-amber-400/65">Source Show unavailable</span>
        )}
      </>
    )
  }
  if (available) return null
  return (
    <span className="block text-[10px] text-amber-400/65">Source Pattern unavailable</span>
  )
}

function SavedProgramNameCell({
  program,
  running,
  showsEnabled,
  onOpen,
}: {
  program: ControllerSavedProgramRow
  running: boolean
  showsEnabled: boolean
  onOpen: (routeId: string) => void
}) {
  const title = [
    program.name,
    `Program id ${program.programId}`,
    ...(program.deviceName !== program.name
      ? [`On the Controller as “${program.deviceName}”`]
      : []),
  ].join('\n')
  const canOpen = program.kind === 'owned'
    && program.routeId !== null
    && (program.sourceKind !== 'show' || showsEnabled)
  const nameClass = `block max-w-full truncate text-left font-sans leading-snug ${running
    ? 'font-medium text-amber-300'
    : program.kind === 'owned'
      ? 'font-medium text-live/90'
      : 'text-zinc-500'}`

  return (
    <td className={`${tableCellClass} overflow-hidden`}>
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden={running ? undefined : true}
          aria-label={running ? 'Running now' : undefined}
          title={running ? 'Running now' : undefined}
          className={`size-1.5 shrink-0 rounded-full ${running
            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.8)]'
            : 'bg-transparent'}`}
        />
        <span className="min-w-0">
          {canOpen ? (
            <button
              type="button"
              title={title}
              className={`${nameClass} transition-colors hover:text-amber-300`}
              onClick={() => onOpen(program.routeId!)}
            >
              {program.name}
            </button>
          ) : (
            <span title={title} className={nameClass}>{program.name}</span>
          )}
          <SavedProgramSourceNote program={program} />
        </span>
      </span>
    </td>
  )
}

function ManagedPatternReconciliation({
  profile,
  reconciliation,
  managedCount,
  onRetry,
}: {
  profile: ControllerProfile
  reconciliation?: ControllerReconciliationState
  managedCount: number
  onRetry: () => void
}) {
  const updateProfile = useControllerProfileStore((state) => state.updateProfile)
  const programs = reconciliation?.programs ?? []
  const current = programs.filter((program) => program.state === 'current').length
  const updating = programs.filter((program) => program.state === 'updating').length
  const queued = programs.filter((program) => program.state === 'queued').length
  const failed = programs.filter((program) => program.state === 'failed').length
  const phase = reconciliation?.phase ?? 'idle'
  const showProgress = profile.keepPatternsUpToDate && ['pending', 'running', 'attention'].includes(phase)
  const total = Math.max(managedCount, 1)

  return (
    <section className="border-b border-seam bg-zinc-950/55 px-4 py-2">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-xs font-medium text-zinc-200">
          Keep PXLBLZ Patterns up to date when Controller settings change
        </span>
        <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
          <input
            type="checkbox"
            aria-label="Keep PXLBLZ Patterns up to date when Controller settings change"
            checked={profile.keepPatternsUpToDate === true}
            onChange={(event) => void updateProfile(profile.id, {
              keepPatternsUpToDate: event.target.checked,
            })}
            className="peer sr-only"
          />
          <span className="pointer-events-none absolute inset-0 rounded-full border border-zinc-700 bg-zinc-900 transition peer-checked:border-emerald-600/70 peer-checked:bg-emerald-950 peer-focus-visible:ring-2 peer-focus-visible:ring-live/60" />
          <span className="pointer-events-none relative ml-0.5 h-4 w-4 rounded-full bg-zinc-500 transition-transform peer-checked:translate-x-4 peer-checked:bg-emerald-400" />
        </span>
      </label>
      {showProgress && (
        <div className="mt-2 flex items-center gap-2">
          <div
            aria-label="Managed Pattern refresh progress"
            className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-900"
          >
            <span className="sr-only">{current} current, {updating} updating, {queued} queued, {failed} failed</span>
            {current > 0 && <span className="bg-emerald-500" style={{ width: `${(current / total) * 100}%` }} />}
            {updating > 0 && <span className="animate-pulse bg-amber-400" style={{ width: `${(updating / total) * 100}%` }} />}
            {queued > 0 && <span className="bg-zinc-700" style={{ width: `${(queued / total) * 100}%` }} />}
            {failed > 0 && <span className="bg-red-500" style={{ width: `${(failed / total) * 100}%` }} />}
          </div>
          {phase === 'attention' && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className={`h-5 bg-red-950/30 px-1.5 text-red-300 hover:bg-red-950/60 ${IDE_MICROTYPE.required.sizeClassName}`}
              onClick={onRetry}
            >
              Retry failed updates
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

function ImportProgramDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingProgramImport | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!pending) return null
  const { decision } = pending
  const title = decision.kind === 'open-existing'
    ? 'Open matching Studio pattern?'
    : decision.kind === 'unavailable'
      ? 'Pattern cannot be imported'
      : decision.ownership === 'ide-owned'
        ? 'Restore Studio pattern?'
        : 'Import controller pattern?'
  const description = decision.kind === 'open-existing'
    ? `This Controller Pattern was saved from "${decision.name}", which still exists in Studio.`
    : decision.kind === 'unavailable'
      ? decision.reason
      : decision.ownership === 'ide-owned'
        ? 'Recovered source and Studio identity from the saved artifact.'
        : 'The Controller Pattern contains source but no PXLBLZ ownership stamp. A new Studio Pattern will be created.'
  const actionLabel = decision.kind === 'open-existing'
    ? 'Open pattern'
    : decision.kind === 'unavailable'
      ? 'Close'
      : decision.ownership === 'ide-owned'
        ? 'Restore pattern'
        : 'Import pattern'

  return (
    <AlertDialogRoot open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs">
          <div className="font-medium text-zinc-200">{decision.name}</div>
          {decision.kind === 'create' && (
            <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              <span className="border border-zinc-700/80 px-1.5 py-0.5">Name · {decision.fieldSources.name}</span>
              <span className="border border-zinc-700/80 px-1.5 py-0.5">Source · {decision.fieldSources.source}</span>
              <span className="border border-zinc-700/80 px-1.5 py-0.5">Studio id · {decision.fieldSources.id}</span>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          {decision.kind !== 'unavailable' && (
            <AlertDialogCancel disabled={busy} onClick={onCancel}>Cancel</AlertDialogCancel>
          )}
          <AlertDialogAction disabled={busy} onClick={decision.kind === 'unavailable' ? onCancel : onConfirm}>
            {busy ? 'Saving…' : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}

function DeleteProgramDialog({
  pending,
  controllerName,
  busy,
  blockedReason,
  error,
  canReauthorize,
  onCancel,
  onConfirm,
  onReauthorize,
}: {
  pending: PendingProgramDelete | null
  controllerName: string
  busy: boolean
  blockedReason: string | null
  error: string | null
  canReauthorize: boolean
  onCancel: () => void
  onConfirm: () => void
  onReauthorize: () => void
}) {
  if (!pending) return null
  const { program } = pending
  const description = program.kind === 'owned'
    ? 'This removes the saved Pattern from the Controller. The Studio Pattern is not deleted; Save sends it again.'
    : 'This removes the Pattern from the Controller. PXLBLZ holds no copy of it — Import first if you want to keep the source.'
  const reauthorizing = canReauthorize && blockedReason !== null

  return (
    <AlertDialogRoot open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}>
        <AlertDialogTitle>Delete “{program.name}” from {controllerName}?</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
          Program id <span className="font-mono text-zinc-200">{program.programId}</span>
        </div>
        {blockedReason && (
          <div className="mt-3 border border-amber-500/30 bg-amber-950/20 px-2.5 py-2 text-xs text-amber-200">
            {blockedReason}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 border border-red-500/30 bg-red-950/20 px-2.5 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || (blockedReason !== null && !reauthorizing)}
            className="border-red-500/70 text-red-300 hover:bg-red-950/40"
            onClick={(event) => {
              event.preventDefault()
              if (reauthorizing) onReauthorize()
              else onConfirm()
            }}
          >
            {busy
              ? 'Deleting…'
              : reauthorizing
                ? 'Recheck Controller'
                : error
                  ? 'Retry delete'
                  : 'Delete from Controller'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}

function SavedProgramRowActions({
  program,
  running,
  disabled,
  importing,
  activating,
  onRun,
  onImport,
  onDelete,
  deleteDisabledReason,
}: {
  program: ControllerSavedProgramRow
  running: boolean
  disabled: boolean
  importing: boolean
  activating: boolean
  onRun: (program: ControllerSavedProgramRow) => void
  onImport?: (program: ControllerSavedProgramRow) => void
  onDelete: (program: ControllerSavedProgramRow) => void
  deleteDisabledReason: string | null
}) {
  return (
    <span className={actionClusterClass}>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`Run ${program.name} on the Controller`}
        title={running ? 'Running now' : 'Run on the Controller (switches the running Pattern)'}
        disabled={disabled || running}
        onClick={() => onRun(program)}
      >
        {activating
          ? <RefreshCw {...controlIcon} className="animate-spin" aria-hidden />
          : <Play {...controlIcon} aria-hidden className={running ? 'text-emerald-400' : undefined} />}
      </button>
      {onImport && (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Import ${program.name}`}
          title={importing ? 'Reading…' : 'Import into Studio'}
          disabled={disabled}
          onClick={() => onImport(program)}
        >
          {importing
            ? <RefreshCw {...controlIcon} className="animate-spin" aria-hidden />
            : <Download {...controlIcon} aria-hidden />}
        </button>
      )}
      <button
        type="button"
        className={`${iconButtonClass} hover:text-red-300`}
        aria-label={`Delete ${program.name} from the Controller`}
        title={deleteDisabledReason ?? 'Delete from the Controller'}
        disabled={disabled || deleteDisabledReason !== null}
        onClick={() => onDelete(program)}
      >
        <Trash2 {...controlIcon} aria-hidden />
      </button>
    </span>
  )
}

function SortableTableHead({
  field,
  label,
  sort,
  onSort,
  labelClassName = '',
  compact = false,
}: {
  field: ControllerSavedProgramSort['field']
  label: string
  sort: ControllerSavedProgramSort
  onSort: (field: ControllerSavedProgramSort['field']) => void
  labelClassName?: string
  compact?: boolean
}) {
  const active = sort.field === field
  return (
    <th className={tableHeadClass} aria-sort={active ? sort.direction : 'none'}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-sm text-left hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/60 ${compact ? 'h-5 w-5 justify-center' : ''}`}
        onClick={() => onSort(field)}
      >
        <span className={labelClassName}>{label}</span>
        {compact && !active && (
          <span
            data-testid="controller-status-sort-target"
            aria-hidden
            className="size-2 rounded-full border border-zinc-600"
          />
        )}
        {active && (sort.direction === 'ascending'
          ? <ChevronUp {...inlineIcon} aria-hidden />
          : <ChevronDown {...inlineIcon} aria-hidden />)}
      </button>
    </th>
  )
}

function SavedProgramsInventory({
  status,
  programs,
  hasSnapshot,
  showsEnabled,
  activeProgramId,
  activeProgramKnown,
  activatingProgramId,
  onRefresh,
  onOpen,
  onRun,
  onImport,
  onDelete,
  importingProgramId,
  deletingProgramId,
  error,
  reconciliation,
}: {
  status: SavedProgramsReadStatus
  programs: ControllerSavedProgramsView
  hasSnapshot: boolean
  showsEnabled: boolean
  activeProgramId: string | undefined
  activeProgramKnown: boolean
  activatingProgramId: string | null
  onRefresh: () => void
  onOpen: (routeId: string) => void
  onRun: (program: ControllerSavedProgramRow) => void
  onImport: (program: ControllerSavedProgramRow) => void
  onDelete: (program: ControllerSavedProgramRow) => void
  importingProgramId: string | null
  deletingProgramId: string | null
  error: string | null
  reconciliation?: ControllerReconciliationState
}) {
  const [sort, setSort] = useState<ControllerSavedProgramSort>({
    field: 'pattern',
    direction: 'ascending',
  })
  // `current` is a completed reconciliation snapshot, not a live assertion.
  // Let fresh source/profile comparison supersede it while work states remain visible.
  const statusByProgramId = Object.fromEntries(
    (reconciliation?.programs ?? [])
      .filter((program) => program.state !== 'current')
      .map((program) => [program.programId, program.state]),
  ) as Partial<Record<string, ControllerSavedPatternStatus>>
  const presentedPrograms = sortControllerSavedPrograms(programs, sort, statusByProgramId)
  const showInventory = status === 'ready' || (status === 'loading' && hasSnapshot)
  const statusFor = (program: ControllerSavedProgramRow): ControllerSavedPatternStatus => (
    statusByProgramId[program.programId] ?? program.freshness
  )
  const updateSort = (field: ControllerSavedProgramSort['field']) => setSort((current) => ({
    field,
    direction: current.field === field && current.direction === 'ascending' ? 'descending' : 'ascending',
  }))
  const actionsBusy = activatingProgramId !== null
    || importingProgramId !== null
    || deletingProgramId !== null
  return (
    <section className="border-b border-seam px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-300">
          Saved PXLBLZ Patterns <span className="text-zinc-500">({presentedPrograms.owned.length})</span>
        </h2>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="Refresh saved Patterns"
          disabled={status === 'offline' || status === 'loading'}
          className={sectionActionButtonClass}
          onClick={onRefresh}
        >
          <RefreshCw {...controlIcon} aria-hidden className={status === 'loading' ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>
      {error && (
        <div role="alert" className="mb-2 border border-red-500/30 bg-red-950/20 px-2.5 py-2 text-[11px] text-red-200">
          {error}
        </div>
      )}
      {status === 'offline' ? (
        <EmptyState>
          Nothing to show while offline.{' '}
          <button
            type="button"
            onClick={requestControllerEntryOpen}
            className="border-b border-live/40 font-mono text-[11.5px] text-live transition-colors hover:border-live hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/70"
          >
            Connect this Controller
          </button>
        </EmptyState>
      ) : status === 'loading' && !showInventory ? (
        <EmptyState>Reading saved Patterns from the Controller…</EmptyState>
      ) : status === 'error' ? (
        <EmptyState>Saved Patterns could not be read. Check the connection, then refresh.</EmptyState>
      ) : presentedPrograms.owned.length === 0 ? (
        <EmptyState>No PXLBLZ Patterns are saved on this Controller.</EmptyState>
      ) : (
        <table className={tableClass} aria-label="Saved PXLBLZ Patterns">
          <colgroup>
            <col className="w-[58%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr>
              <SortableTableHead field="pattern" label="Pattern" sort={sort} onSort={updateSort} />
              <th
                className={tableHeadClass}
                title="Profile features baked into the saved artifact: power cap, hardware brightness, input-driven control, input-assigned variable"
              >
                Profile
              </th>
              <SortableTableHead
                field="status"
                label="Status"
                labelClassName="sr-only"
                compact
                sort={sort}
                onSort={updateSort}
              />
              <th className={`${tableHeadClass} text-right`}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {presentedPrograms.owned.map((program) => {
              const running = program.programId === activeProgramId
              const deleteDisabledReason = !activeProgramKnown
                ? 'Waiting to confirm the running Pattern'
                : running
                  ? 'Running now — switch to another Pattern first'
                  : null
              return (
                <tr
                  key={program.programId}
                  className={`group ${running ? 'bg-emerald-500/[0.04]' : ''}`}
                >
                  <SavedProgramNameCell
                    program={program}
                    running={running}
                    showsEnabled={showsEnabled}
                    onOpen={onOpen}
                  />
                  <td className={tableCellClass}>
                    <ProfileFeatureIcons features={program.profileFeatures} />
                  </td>
                  <td className={tableCellClass}>
                    <PatternStatusDot status={statusFor(program)} />
                  </td>
                  <td className={`${tableCellClass} text-right`}>
                    <SavedProgramRowActions
                      program={program}
                      running={running}
                      disabled={actionsBusy}
                      activating={activatingProgramId === program.programId}
                      importing={false}
                      onRun={onRun}
                      onDelete={onDelete}
                      deleteDisabledReason={deleteDisabledReason}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {showInventory && (
        <>
          <h2 className="mb-2 mt-5 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Other Patterns <span className="text-zinc-500">({presentedPrograms.foreign.length})</span>
          </h2>
          {presentedPrograms.foreign.length === 0 ? (
            <EmptyState>No other Patterns are saved on this Controller.</EmptyState>
          ) : (
            <table className={tableClass} aria-label="Other Patterns">
              <colgroup>
                <col className="w-[76%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead>
                <tr>
                  <SortableTableHead field="pattern" label="Pattern" sort={sort} onSort={updateSort} />
                  <th className={`${tableHeadClass} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {presentedPrograms.foreign.map((program) => {
                  const running = program.programId === activeProgramId
                  const deleteDisabledReason = !activeProgramKnown
                    ? 'Waiting to confirm the running Pattern'
                    : running
                      ? 'Running now — switch to another Pattern first'
                      : null
                  return (
                    <tr
                      key={program.programId}
                      className={`group ${running ? 'bg-emerald-500/[0.04]' : ''}`}
                    >
                      <SavedProgramNameCell
                        program={program}
                        running={running}
                        showsEnabled={showsEnabled}
                        onOpen={onOpen}
                      />
                      <td className={`${tableCellClass} text-right`}>
                        <SavedProgramRowActions
                          program={program}
                          running={running}
                          disabled={actionsBusy}
                          activating={activatingProgramId === program.programId}
                          importing={importingProgramId === program.programId}
                          onRun={onRun}
                          onImport={onImport}
                          onDelete={onDelete}
                          deleteDisabledReason={deleteDisabledReason}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}

export function ControllerSavedProgramsPane({ profile }: { profile: ControllerProfile }) {
  const controllers = useControllerStore((state) => state.controllers)
  const setActiveController = useControllerStore((state) => state.setActive)
  const reconciliation = useControllerStore((state) => state.controllerReconciliations[profile.id])
  const reconcileControllerProfile = useControllerStore((state) => state.reconcileControllerProfile)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const shows = useShowStore((state) => state.shows)
  const stockShowDrafts = useShowStore((state) => state.stockShowDrafts)
  const addPattern = usePatternStore((state) => state.addPattern)
  const navigate = useRouterStore((state) => state.navigate)
  const showsEnabled = useRouterStore((state) => state.featureAccess.shows)
  const profileController = controllerForProfile(profile, controllers)
  const liveIp = profileController?.phase === 'live' ? profileController.ip : undefined
  const liveEpoch = profileController?.phase === 'live' ? profileController.liveEpoch : undefined
  const controllerPrograms = useControllerPanelStore((state) => (
    liveIp ? state.programsByController[liveIp] ?? EMPTY_CONTROLLER_PROGRAMS : EMPTY_CONTROLLER_PROGRAMS
  ))
  const refreshControllerPrograms = useControllerPanelStore((state) => state.refreshPrograms)
  const panelActiveProgramId = useControllerPanelStore((state) => state.activeProgramId)
  const configSourceIp = useControllerPanelStore((state) => state.configSourceIp)
  const activatingProgramId = useControllerPanelStore((state) => state.activatingProgramId)
  const activateProgram = useControllerPanelStore((state) => state.activateProgram)
  const deleteProgram = useControllerPanelStore((state) => state.deleteProgram)
  const forgetDeletedSavedProgram = useControllerStore((state) => state.forgetDeletedSavedProgram)
  const pushRecordsRevision = useSyncExternalStore(
    subscribeControllerPushRecordsRevision,
    getControllerPushRecordsRevision,
    getControllerPushRecordsRevision,
  )
  const refreshGeneration = useControllerSavedProgramsLiveStore((state) => (
    state.refreshGenerationsByProfile[profile.id] ?? 0
  ))
  const savedProgramsRead = useControllerSavedProgramsLiveStore((state) => state.readsByProfile[profile.id])
  const syncSavedPrograms = useControllerSavedProgramsLiveStore((state) => state.syncProfile)
  const requestSavedProgramsRefresh = useControllerSavedProgramsLiveStore((state) => state.requestRefresh)
  const clearSavedPrograms = useControllerSavedProgramsLiveStore((state) => state.clearProfile)
  const [pendingImport, setPendingImport] = useState<PendingProgramImport | null>(null)
  const [importingProgramId, setImportingProgramId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingProgramDelete | null>(null)
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBaseline, setDeleteBaseline] = useState<ProgramListEntry[] | null>(null)
  const currentDeleteSession = useRef({
    controllerId: liveIp,
    liveEpoch,
    profileId: profile.id,
  })
  useEffect(() => {
    currentDeleteSession.current = {
      controllerId: liveIp,
      liveEpoch,
      profileId: profile.id,
    }
  }, [liveEpoch, liveIp, profile.id])
  const readKey = liveIp
    ? controllerSavedProgramsReadKey({
        controllerId: liveIp,
        liveEpoch,
        programs: controllerPrograms,
        pushRecordsRevision,
        refreshGeneration,
      })
    : ''
  const readIsCurrent = savedProgramsRead?.readKey === readKey
  const readStatus: SavedProgramsReadStatus = !liveIp
    ? 'offline'
    : !readIsCurrent || savedProgramsRead.phase === 'loading'
      ? 'loading'
      : savedProgramsRead.phase === 'failed'
        ? 'error'
        : 'ready'
  const activeProgramId = configSourceIp === liveIp ? panelActiveProgramId : undefined
  const activeProgramKnown = liveIp !== undefined && configSourceIp === liveIp
  const pendingDeleteSessionIsCurrent = !pendingDelete || (
    pendingDelete.controllerId === liveIp
    && pendingDelete.liveEpoch === liveEpoch
    && pendingDelete.profileId === profile.id
    && pendingDelete.provider === getControllerProvider()
  )
  const deleteSessionKnown = activeProgramKnown && liveEpoch !== undefined
  const canReauthorizeDelete = !!pendingDelete
    && !pendingDeleteSessionIsCurrent
    && pendingDelete.controllerId === liveIp
    && pendingDelete.profileId === profile.id
    && deleteSessionKnown
  const deleteBlockedReason = !pendingDeleteSessionIsCurrent
    ? canReauthorizeDelete
      ? 'Controller reconnected — recheck it before retrying'
      : 'Controller session changed — close this dialog and choose the Pattern again'
    : !deleteSessionKnown
    ? 'Waiting to confirm the running Pattern'
    : pendingDelete?.program.programId === activeProgramId
      ? 'Running now — switch to another Pattern first'
      : null

  useEffect(() => {
    if (!liveIp) {
      clearSavedPrograms(profile.id)
      return
    }
    if (useControllerStore.getState().activeIp !== liveIp) setActiveController(liveIp)
    useControllerPanelStore.getState().seed(liveIp)
  }, [clearSavedPrograms, liveIp, profile.id, setActiveController])

  useEffect(() => {
    if (!liveIp) return
    void syncSavedPrograms(profile.id, {
      controllerId: liveIp,
      liveEpoch,
      programs: controllerPrograms,
      pushRecordsRevision,
      refreshGeneration,
      refreshPrograms: async () => {
        await refreshControllerPrograms(liveIp)
        return useControllerPanelStore.getState().programsByController[liveIp]
          ?? EMPTY_CONTROLLER_PROGRAMS
      },
    })
  }, [
    controllerPrograms,
    liveEpoch,
    liveIp,
    profile.id,
    pushRecordsRevision,
    refreshControllerPrograms,
    refreshGeneration,
    syncSavedPrograms,
  ])

  useEffect(() => () => clearSavedPrograms(profile.id), [clearSavedPrograms, profile.id])

  const readMatchesLiveConnection = savedProgramsRead?.controllerId === liveIp
    && savedProgramsRead?.liveEpoch === liveEpoch
  const inventoryRead = savedProgramsRead && readMatchesLiveConnection
    && (readStatus === 'ready' || savedProgramsRead.hasSnapshot)
    ? savedProgramsRead
    : null
  const hasInventorySnapshot = inventoryRead?.hasSnapshot === true
  const installedMapStatus = profileController?.installedMap?.status
  const profileSignatureReady = readStatus === 'ready'
    && installedMapStatus !== 'loading'
    && installedMapStatus !== 'error'

  const programs = describeControllerSavedPrograms({
    controllerId: liveIp ?? '',
    programs: inventoryRead?.programs ?? EMPTY_CONTROLLER_PROGRAMS,
    bindings: inventoryRead?.bindings ?? {},
    pushRecords: inventoryRead?.pushRecords ?? {},
    profile,
    mapDim: profileController?.mapDim ?? null,
    profileSignatureReady,
    studioPatterns: [
      ...userPatterns.map((pattern) => ({
        bindingKey: pattern.id,
        routeId: pattern.id,
        name: pattern.name,
        sourceHash: artifactHash(pattern.src),
      })),
      ...Object.keys(DEMOS).map((name) => ({
        bindingKey: `demo:${name}`,
        routeId: name,
        name,
        sourceHash: artifactHash(DEMOS[name]),
      })),
      ...STOCK_SHOWS.flatMap((item) => {
        const show = stockShowDrafts[item.id] ?? item.show
        return [item.id, ...(item.legacySourceIds ?? [])].map((sourceId) => ({
          bindingKey: `show:${sourceId}`,
          routeId: `show:${item.id}`,
          name: show.name,
        }))
      }),
      // An exact personal Show id wins over a built-in's legacy source alias.
      ...shows.map((show) => ({
        bindingKey: `show:${show.id}`,
        routeId: `show:${show.id}`,
        name: show.name,
      })),
    ],
  })
  const inventoryManagedCount = programs.owned.filter((program) => program.freshness !== 'unmanaged').length
  const hasReconciliationScope = reconciliation && reconciliation.phase !== 'idle'
  const managedCount = hasReconciliationScope
    ? reconciliation.managedCount
    : inventoryManagedCount

  async function runSavedProgram(program: ControllerSavedProgramRow) {
    if (!liveIp || liveEpoch === undefined) return
    setRunError(null)
    try {
      const expectedProvider = getControllerProvider()
      const expectedControllerId = liveIp
      const expectedProfileId = profile.id
      const expectedLiveEpoch = liveEpoch
      const sessionIsCurrent = () => {
        const current = currentDeleteSession.current
        const controller = useControllerStore.getState().controllers[expectedControllerId]
        return current.controllerId === expectedControllerId
          && current.liveEpoch === expectedLiveEpoch
          && current.profileId === expectedProfileId
          && controller?.phase === 'live'
          && controller.liveEpoch === expectedLiveEpoch
          && getControllerProvider() === expectedProvider
      }
      await queueControllerDeviceWrite(expectedControllerId, () => activateProgram(
        program.programId,
        {
          expectedControllerId,
          expectedProvider,
          sessionIsCurrent,
        },
      ))
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Saved Pattern could not be run.')
    }
  }

  async function beginProgramImport(program: ControllerSavedProgramRow) {
    if (!liveIp) return
    setImportError(null)
    setImportingProgramId(program.programId)
    try {
      const recovered = await getControllerProvider().readSavedProgram(program.programId)
      if (!recovered) {
        setImportError(`"${program.name}" is no longer on the Controller. Refresh the saved Pattern list.`)
        return
      }
      setPendingImport({
        program,
        decision: decideSavedProgramImport({
          recovered,
          studioPatterns: [
            ...userPatterns.map((pattern) => ({ id: pattern.id, name: pattern.name })),
            ...Object.keys(DEMOS).map((name) => ({
              id: `demo:${name}`,
              routeId: name,
              name,
            })),
          ],
        }),
      })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Saved Pattern could not be read.')
    } finally {
      setImportingProgramId(null)
    }
  }

  async function confirmProgramImport() {
    if (!pendingImport) return
    const { decision, program } = pendingImport
    if (decision.kind === 'open-existing') {
      navigate({ kind: 'studio', entity: { kind: 'patterns', id: decision.patternId } })
      setPendingImport(null)
      return
    }
    if (decision.kind !== 'create') {
      setPendingImport(null)
      return
    }
    setImportingProgramId(program.programId)
    setImportError(null)
    try {
      const record = createSavedProgramPatternRecord(decision, newPersonalContentId(), Date.now())
      await addPattern(record)
      navigate({ kind: 'studio', entity: { kind: 'patterns', id: record.id } })
      setPendingImport(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Recovered Pattern could not be saved.')
    } finally {
      setImportingProgramId(null)
    }
  }

  async function confirmProgramDelete() {
    if (!pendingDelete) return
    const { program } = pendingDelete
    const sessionIsCurrent = () => {
      const current = currentDeleteSession.current
      const controller = useControllerStore.getState().controllers[pendingDelete.controllerId]
      return current.controllerId === pendingDelete.controllerId
        && current.liveEpoch === pendingDelete.liveEpoch
        && current.profileId === pendingDelete.profileId
        && controller?.phase === 'live'
        && controller.liveEpoch === pendingDelete.liveEpoch
        && getControllerProvider() === pendingDelete.provider
    }
    if (!sessionIsCurrent()) {
      setDeleteError('Controller session changed — close this dialog and choose the Pattern again')
      return
    }
    if (!deleteSessionKnown) {
      setDeleteError('Waiting to confirm the running Pattern')
      return
    }
    if (activeProgramId === program.programId) {
      setDeleteError('Running now — switch to another Pattern first')
      return
    }

    setDeletingProgramId(program.programId)
    setDeleteError(null)
    let retainedBaseline = deleteBaseline
    try {
      await queueControllerDeviceWrite(pendingDelete.controllerId, async () => {
        retainedBaseline = await deleteProgram(
          program.programId,
          {
            baseline: deleteBaseline ?? undefined,
            expectedControllerId: pendingDelete.controllerId,
            expectedProgramName: program.deviceName,
            expectedProvider: pendingDelete.provider,
            sessionIsCurrent,
          },
        )
        const metadataResult = await removeManagedControllerSavedProgramMetadata({
          controllerId: pendingDelete.controllerId,
          bindingKey: program.bindingKey,
          programId: program.programId,
        }, {
          getControllerBindings,
          setControllerBindings,
          getPushRecords,
          setPushRecords,
        })
        if (metadataResult.removed) {
          forgetDeletedSavedProgram(pendingDelete.controllerId, metadataResult.bindingKey)
        }
      })
      requestSavedProgramsRefresh(pendingDelete.profileId)
      setDeleteBaseline(null)
      setPendingDelete(null)
    } catch (error) {
      const baseline = error instanceof ControllerProgramDeletionError
        ? error.baseline
        : retainedBaseline
      if (baseline) setDeleteBaseline([...baseline])
      const message = error instanceof Error ? error.message : 'Controller deletion failed.'
      setDeleteError(`Could not delete “${program.name}” from ${pendingDelete.controllerName}. ${message}`)
    } finally {
      setDeletingProgramId(null)
    }
  }

  function reauthorizeProgramDelete() {
    if (!pendingDelete || !liveIp || liveEpoch === undefined) return
    if (pendingDelete.controllerId !== liveIp || pendingDelete.profileId !== profile.id) return
    setPendingDelete({
      ...pendingDelete,
      controllerName: profile.name,
      liveEpoch,
      provider: getControllerProvider(),
    })
  }

  return (
    <div data-testid="controller-saved-programs-pane" className="h-full min-h-0 overflow-x-hidden overflow-y-auto bg-zinc-950 text-zinc-200">
      <ImportProgramDialog
        pending={pendingImport}
        busy={importingProgramId !== null}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => void confirmProgramImport()}
      />
      <DeleteProgramDialog
        pending={pendingDelete}
        controllerName={pendingDelete?.controllerName ?? profile.name}
        busy={deletingProgramId !== null}
        blockedReason={deleteBlockedReason}
        error={deleteError}
        canReauthorize={canReauthorizeDelete}
        onCancel={() => {
          setPendingDelete(null)
          setDeleteError(null)
          setDeleteBaseline(null)
        }}
        onConfirm={() => void confirmProgramDelete()}
        onReauthorize={reauthorizeProgramDelete}
      />
      <ManagedPatternReconciliation
        profile={profile}
        reconciliation={reconciliation}
        managedCount={managedCount}
        onRetry={() => void reconcileControllerProfile(profile.id)}
      />
      <SavedProgramsInventory
        status={readStatus}
        programs={programs}
        hasSnapshot={hasInventorySnapshot}
        showsEnabled={showsEnabled}
        activeProgramId={activeProgramId}
        activeProgramKnown={deleteSessionKnown}
        activatingProgramId={activatingProgramId}
        onRefresh={() => requestSavedProgramsRefresh(profile.id)}
        onOpen={(routeId) => navigate({
          kind: 'studio',
          entity: routeId.startsWith('show:')
            ? { kind: 'shows', id: routeId.slice('show:'.length) }
            : { kind: 'patterns', id: routeId },
        })}
        onRun={(program) => void runSavedProgram(program)}
        onImport={(program) => void beginProgramImport(program)}
        onDelete={(program) => {
          if (!liveIp || liveEpoch === undefined) return
          setDeleteError(null)
          setDeleteBaseline(null)
          setPendingDelete({
            program,
            controllerId: liveIp,
            controllerName: profile.name,
            liveEpoch,
            profileId: profile.id,
            provider: getControllerProvider(),
          })
        }}
        importingProgramId={importingProgramId}
        deletingProgramId={deletingProgramId}
        error={runError ?? importError}
        reconciliation={reconciliation}
      />
    </div>
  )
}
