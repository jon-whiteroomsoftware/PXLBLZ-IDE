import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
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
import { DisabledReasonTip } from '@/components/ui/disabled-reason'
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
import {
  controllerPatternBatchNames,
  enterControllerPatternSelection,
  reconcileControllerPatternSelection,
  runControllerPatternBatch,
  toggleAllControllerPatternSelection,
  toggleControllerPatternSelection,
  type ControllerPatternSection,
  type ControllerPatternSelection,
} from '@/engine/controllerPatternBatch'
import { queueControllerDeviceWrite } from '@/engine/controllerDeviceWriteQueue'
import type { ControllerProfile } from '@/engine/controllerProfile'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  describeControllerSavedPrograms,
  resolveControllerSavedPatternStatuses,
  sortControllerSavedPrograms,
  summarizeControllerSavedPatternStatuses,
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
import { STOCK_SHOW_CATALOGUE } from '@/pixelblaze/stock/showCatalogueV2'
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
const iconButtonClass = 'inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:border-transparent aria-disabled:hover:bg-transparent aria-disabled:hover:text-zinc-400'
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
  expectedProgramName: string
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
  onOpen,
}: {
  program: ControllerSavedProgramRow
  running: boolean
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
  statuses,
  onRetry,
}: {
  profile: ControllerProfile
  reconciliation?: ControllerReconciliationState
  /** The same per-program status projection the inventory rows render (#874). */
  statuses: Readonly<Record<string, ControllerSavedPatternStatus>>
  onRetry: () => void
}) {
  const updateProfile = useControllerProfileStore((state) => state.updateProfile)
  const summary = summarizeControllerSavedPatternStatuses(statuses)
  const { current, stale, updating, queued, failed, unmanaged } = summary
  const phase = reconciliation?.phase ?? 'idle'
  const showProgress = profile.keepPatternsUpToDate && ['pending', 'running', 'attention'].includes(phase)
  const total = Math.max(summary.total, 1)
  const width = (count: number) => ({ width: `${(count / total) * 100}%` })

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
            <span className="sr-only">
              {current} current, {stale} to push again, {updating} updating, {queued} queued, {failed} failed
              {unmanaged > 0 ? `, ${unmanaged} unknown` : ''}
            </span>
            {current > 0 && <span className="bg-emerald-500" style={width(current)} />}
            {stale > 0 && <span className="bg-amber-400/70" style={width(stale)} />}
            {updating > 0 && <span className="animate-pulse bg-amber-400" style={width(updating)} />}
            {queued > 0 && <span className="bg-zinc-700" style={width(queued)} />}
            {failed > 0 && <span className="bg-red-500" style={width(failed)} />}
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
  selecting = false,
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
  selecting?: boolean
}) {
  // The disabled reason stays reachable by mouse, keyboard, and assistive tech
  // (#871): the control keeps focus with `aria-disabled` and describes itself
  // through the shared tip instead of a mouse-only title on an inert button.
  const deleteReasonId = useId()
  const deleteBlocked = deleteDisabledReason !== null
  return (
    <span className={selecting ? 'inline-flex items-center justify-end gap-0.5' : actionClusterClass}>
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
      {onImport && !selecting && (
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
      {!selecting && <span className="relative inline-flex">
        <button
          type="button"
          className={`${iconButtonClass} hover:text-red-300`}
          aria-label={`Delete ${program.name} from the Controller`}
          title={deleteBlocked ? undefined : 'Delete from the Controller'}
          disabled={disabled}
          aria-disabled={deleteBlocked || undefined}
          aria-describedby={deleteBlocked ? deleteReasonId : undefined}
          onClick={() => { if (!deleteBlocked) onDelete(program) }}
        >
          <Trash2 {...controlIcon} aria-hidden />
        </button>
        {deleteBlocked && (
          <DisabledReasonTip id={deleteReasonId}>{deleteDisabledReason}</DisabledReasonTip>
        )}
      </span>}
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
  statuses,
  hasSnapshot,
  activeProgramId,
  activeProgramKnown,
  activatingProgramId,
  selection,
  eligibleIds,
  batchBusy,
  onEnterSelection,
  onDone,
  onToggle,
  onToggleAll,
  onBatchDelete,
  onBatchImport,
  onOpen,
  onRun,
  onImport,
  onDelete,
  importingProgramId,
  deletingProgramId,
  error,
}: {
  status: SavedProgramsReadStatus
  programs: ControllerSavedProgramsView
  /** Effective status per program id, shared with the aggregate summary (#874). */
  statuses: Readonly<Record<string, ControllerSavedPatternStatus>>
  hasSnapshot: boolean
  activeProgramId: string | undefined
  activeProgramKnown: boolean
  activatingProgramId: string | null
  selection: ControllerPatternSelection
  eligibleIds: readonly string[]
  batchBusy: boolean
  onEnterSelection: (section: ControllerPatternSection) => void
  onDone: () => void
  onToggle: (id: string) => void
  onToggleAll: () => void
  onBatchDelete: () => void
  onBatchImport: () => void
  onOpen: (routeId: string) => void
  onRun: (program: ControllerSavedProgramRow) => void
  onImport: (program: ControllerSavedProgramRow) => void
  onDelete: (program: ControllerSavedProgramRow) => void
  importingProgramId: string | null
  deletingProgramId: string | null
  error: string | null
}) {
  const [sort, setSort] = useState<ControllerSavedProgramSort>({
    field: 'pattern',
    direction: 'ascending',
  })
  const presentedPrograms = sortControllerSavedPrograms(programs, sort, statuses)
  const showInventory = status === 'ready' || (status === 'loading' && hasSnapshot)
  const statusFor = (program: ControllerSavedProgramRow): ControllerSavedPatternStatus => (
    statuses[program.programId] ?? program.freshness
  )
  const updateSort = (field: ControllerSavedProgramSort['field']) => setSort((current) => ({
    field,
    direction: current.field === field && current.direction === 'ascending' ? 'descending' : 'ascending',
  }))
  const writesBusy = importingProgramId !== null
    || deletingProgramId !== null
    || batchBusy
  const actionsBusy = activatingProgramId !== null || writesBusy
  const sectionControls = (section: ControllerPatternSection, count: number) => (
    selection.section !== section ? (
      <Button type="button" size="xs" variant="ghost" className={sectionActionButtonClass}
        aria-label={`Select ${section === 'saved' ? 'Saved PXLBLZ Patterns' : 'Other Patterns'}`}
        disabled={writesBusy || !showInventory || count === 0}
        onClick={() => onEnterSelection(section)}>Select</Button>
    ) : (
      <div className="flex flex-1 flex-wrap items-center justify-between gap-1.5">
        <span className="font-mono text-[11px] text-live" role="status">{selection.selectedIds.length} of {count} selected</span>
        <div className="flex items-center gap-1.5">
        {section === 'other' && <Button type="button" size="xs" variant="ghost" className={sectionActionButtonClass}
          disabled={actionsBusy || selection.selectedIds.length === 0} onClick={onBatchImport}>{importingProgramId !== null ? 'Importing…' : 'Import'}</Button>}
        <Button type="button" size="xs" variant="ghost" className={sectionActionButtonClass}
          disabled={actionsBusy || selection.selectedIds.length === 0} onClick={onBatchDelete}>Delete</Button>
        <Button type="button" size="xs" variant="ghost" className={sectionActionButtonClass}
          disabled={batchBusy} onClick={onDone}>Done</Button>
        </div>
      </div>
    )
  )
  const selectionCheckbox = (program: ControllerSavedProgramRow, reason: string | null) => (
    <td className={`${tableCellClass} w-7`}>
      <input type="checkbox" className="accent-live" aria-label={`Select ${program.name}`} title={reason ?? undefined}
        checked={selection.selectedIds.includes(program.programId)}
        disabled={writesBusy || !eligibleIds.includes(program.programId)}
        onChange={() => onToggle(program.programId)} />
    </td>
  )
  const allCheckbox = (section: ControllerPatternSection) => (
    <th className={`${tableHeadClass} w-7`}>
      <input type="checkbox" className="accent-live" aria-label={`Select all ${section === 'saved' ? 'Saved PXLBLZ Patterns' : 'Other Patterns'}`}
        checked={eligibleIds.length > 0 && selection.selectedIds.length === eligibleIds.length}
        ref={(node) => { if (node) node.indeterminate = selection.selectedIds.length > 0 && selection.selectedIds.length < eligibleIds.length }}
        disabled={writesBusy || eligibleIds.length === 0} onChange={onToggleAll} />
    </th>
  )
  return (
    <section className="border-b border-seam px-4 py-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className={selection.section === 'saved' ? 'sr-only' : 'font-mono text-xs font-semibold uppercase tracking-wide text-zinc-300'}>
          Saved PXLBLZ Patterns <span className="text-zinc-500">({presentedPrograms.owned.length})</span>
        </h2>
        {sectionControls('saved', presentedPrograms.owned.length)}
      </div>
      {error && (
        <div role="alert" className="mb-2 whitespace-pre-line border border-red-500/30 bg-red-950/20 px-2.5 py-2 text-[11px] text-red-200">
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
            {selection.section === 'saved' && <col className="w-7" />}
            <col className="w-[58%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr>
              {selection.section === 'saved' && allCheckbox('saved')}
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
              const deleteDisabledReason = !activeProgramKnown || program.programId === activatingProgramId
                ? 'Waiting to confirm the running Pattern'
                : running
                  ? 'Running now — switch to another Pattern first'
                  : null
              return (
                <tr
                  key={program.programId}
                  className={`group ${selection.selectedIds.includes(program.programId) ? 'bg-live/[0.05]' : running ? 'bg-emerald-500/[0.04]' : ''}`}
                >
                  {selection.section === 'saved' && selectionCheckbox(program, deleteDisabledReason)}
                  <SavedProgramNameCell
                    program={program}
                    running={running}
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
                      selecting={selection.section === 'saved'}
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
          <div className="mb-2 mt-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className={selection.section === 'other' ? 'sr-only' : 'font-mono text-xs font-semibold uppercase tracking-wide text-zinc-300'}>
            Other Patterns <span className="text-zinc-500">({presentedPrograms.foreign.length})</span>
          </h2>
          {sectionControls('other', presentedPrograms.foreign.length)}
          </div>
          {presentedPrograms.foreign.length === 0 ? (
            <EmptyState>No other Patterns are saved on this Controller.</EmptyState>
          ) : (
            <table className={tableClass} aria-label="Other Patterns">
              <colgroup>
                {selection.section === 'other' && <col className="w-7" />}
                <col />
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr>
                  {selection.section === 'other' && allCheckbox('other')}
                  <SortableTableHead field="pattern" label="Pattern" sort={sort} onSort={updateSort} />
                  <th className={`${tableHeadClass} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {presentedPrograms.foreign.map((program) => {
                  const running = program.programId === activeProgramId
                  const deleteDisabledReason = !activeProgramKnown || program.programId === activatingProgramId
                    ? 'Waiting to confirm the running Pattern'
                    : running
                      ? 'Running now — switch to another Pattern first'
                      : null
                  return (
                    <tr
                      key={program.programId}
                      className={`group ${selection.selectedIds.includes(program.programId) ? 'bg-live/[0.05]' : running ? 'bg-emerald-500/[0.04]' : ''}`}
                    >
                      {selection.section === 'other' && selectionCheckbox(program, deleteDisabledReason)}
                      <SavedProgramNameCell
                        program={program}
                        running={running}
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
                          selecting={selection.section === 'other'}
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
  const showV2Rows = useShowStore((state) => state.showV2Rows)
  const addPattern = usePatternStore((state) => state.addPattern)
  const navigate = useRouterStore((state) => state.navigate)
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
  const [runError, setRunError] = useState<{ programId: string; message: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingProgramDelete | null>(null)
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBaseline, setDeleteBaseline] = useState<ProgramListEntry[] | null>(null)
  const [selection, setSelection] = useState<ControllerPatternSelection>({ section: null, selectedIds: [] })
  const [pendingBatchDelete, setPendingBatchDelete] = useState<PendingProgramDelete[] | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const batchLock = useRef(false)
  const provider = getControllerProvider()
  const [selectionSession, setSelectionSession] = useState({ liveIp, liveEpoch, profileId: profile.id, provider })
  if (selectionSession.liveIp !== liveIp || selectionSession.liveEpoch !== liveEpoch
    || selectionSession.profileId !== profile.id || selectionSession.provider !== provider) {
    setSelectionSession({ liveIp, liveEpoch, profileId: profile.id, provider })
    setSelection({ section: null, selectedIds: [] })
    setPendingBatchDelete(null)
  }
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
  // A Run failure and the running marker must never contradict each other
  // (#877): once the Controller reports the failed row running, the activation
  // was confirmed late and the alert is stale, so it clears for good — from the
  // store subscription, never by derivation, so a later switch cannot bring it
  // back.
  useEffect(() => {
    if (!runError) return
    const clearIfConfirmed = (state: { activeProgramId?: string; configSourceIp: string | null }) => {
      if (state.configSourceIp === liveIp && state.activeProgramId === runError.programId) setRunError(null)
    }
    clearIfConfirmed(useControllerPanelStore.getState())
    return useControllerPanelStore.subscribe(clearIfConfirmed)
  }, [liveIp, runError])
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
      ...STOCK_SHOW_CATALOGUE.flatMap((item) => {
        return [item.id, ...(item.legacySourceIds ?? [])].map((sourceId) => ({
          bindingKey: `show:${sourceId}`,
          routeId: `show:${item.id}`,
          name: item.name,
        }))
      }),
      // An exact personal Show id wins over a built-in's legacy source alias.
      ...showV2Rows.map((show) => ({
        bindingKey: `show:${show.id}`,
        routeId: `show:${show.id}`,
        name: show.name,
      })),
    ],
  })
  // One status projection for the rows and the aggregate summary (#874): a
  // completed reconciliation snapshot never outranks the rows' fresh comparison.
  const savedPatternStatuses = resolveControllerSavedPatternStatuses(
    programs.owned,
    reconciliation?.programs ?? [],
  )
  const sectionPrograms = selection.section === 'saved' ? programs.owned : programs.foreign
  const eligibleIds = deleteSessionKnown
    ? sectionPrograms.filter((program) => program.programId !== activeProgramId && program.programId !== activatingProgramId).map((program) => program.programId)
    : []
  const currentSelection = reconcileControllerPatternSelection(selection, eligibleIds)
  // Persist removals during the guarded render so a later status reversal cannot
  // resurrect a checked ID. React discards this render before publishing it.
  if (currentSelection.selectedIds.length !== selection.selectedIds.length) setSelection(currentSelection)

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
      setRunError({
        programId: program.programId,
        message: error instanceof Error ? error.message : 'Saved Pattern could not be run.',
      })
    }
  }

  async function readProgramImport(program: ControllerSavedProgramRow): Promise<PendingProgramImport> {
    const recovered = await getControllerProvider().readSavedProgram(program.programId)
    if (!recovered) throw new Error(`"${program.name}" is no longer on the Controller. Refresh the saved Pattern list.`)
    return {
      program,
      decision: decideSavedProgramImport({
        recovered,
        studioPatterns: [
          ...usePatternStore.getState().userPatterns.map((pattern) => ({ id: pattern.id, name: pattern.name })),
          ...Object.keys(DEMOS).map((name) => ({ id: `demo:${name}`, routeId: name, name })),
        ],
      }),
    }
  }

  async function applyProgramImport({ decision }: PendingProgramImport, open: boolean) {
    if (decision.kind === 'unavailable') throw new Error(decision.reason)
    if (decision.kind === 'open-existing') {
      if (open) navigate({ kind: 'studio', entity: { kind: 'patterns', id: decision.patternId } })
      return
    }
    const record = createSavedProgramPatternRecord(decision, newPersonalContentId(), Date.now())
    await addPattern(record)
    if (open) navigate({ kind: 'studio', entity: { kind: 'patterns', id: record.id } })
  }

  async function beginProgramImport(program: ControllerSavedProgramRow) {
    if (!liveIp || batchLock.current) return
    setImportError(null)
    setImportingProgramId(program.programId)
    try {
      setPendingImport(await readProgramImport(program))
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Saved Pattern could not be read.')
    } finally {
      setImportingProgramId(null)
    }
  }

  async function confirmProgramImport() {
    if (!pendingImport) return
    const { decision, program } = pendingImport
    if (decision.kind === 'unavailable') {
      setPendingImport(null)
      return
    }
    setImportingProgramId(program.programId)
    setImportError(null)
    try {
      await applyProgramImport(pendingImport, true)
      setPendingImport(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Recovered Pattern could not be saved.')
    } finally {
      setImportingProgramId(null)
    }
  }

  async function executeProgramDelete(target: PendingProgramDelete, baseline: ProgramListEntry[] | null = null) {
    const { program } = target
    const sessionIsCurrent = () => {
      const current = currentDeleteSession.current
      const controller = useControllerStore.getState().controllers[target.controllerId]
      return current.controllerId === target.controllerId
        && current.liveEpoch === target.liveEpoch
        && current.profileId === target.profileId
        && controller?.phase === 'live'
        && controller.liveEpoch === target.liveEpoch
        && getControllerProvider() === target.provider
    }
    if (!sessionIsCurrent()) {
      throw new Error('Controller session changed — close this dialog and choose the Pattern again')
    }
    const panel = useControllerPanelStore.getState()
    if (panel.configSourceIp !== target.controllerId || panel.activatingProgramId === program.programId) {
      throw new Error('Waiting to confirm the running Pattern')
    }
    if (panel.activeProgramId === program.programId) {
      throw new Error('Running now — switch to another Pattern first')
    }

    let retainedBaseline = baseline
    try {
      await queueControllerDeviceWrite(target.controllerId, async () => {
        retainedBaseline = await deleteProgram(
          program.programId,
          {
            baseline: baseline ?? undefined,
            expectedControllerId: target.controllerId,
            expectedProgramName: target.expectedProgramName,
            expectedProvider: target.provider,
            sessionIsCurrent,
          },
        )
        const metadataResult = await removeManagedControllerSavedProgramMetadata({
          controllerId: target.controllerId,
          bindingKey: program.bindingKey,
          programId: program.programId,
        }, {
          getControllerBindings,
          setControllerBindings,
          getPushRecords,
          setPushRecords,
        })
        if (metadataResult.removed) {
          forgetDeletedSavedProgram(target.controllerId, metadataResult.bindingKey)
        }
      })
      return retainedBaseline
    } catch (error) {
      // Keep the original inventory even when metadata cleanup fails after deletion.
      if (error instanceof ControllerProgramDeletionError) throw error
      if (retainedBaseline) throw new ControllerProgramDeletionError(
        error instanceof Error ? error.message : 'Controller deletion failed.', retainedBaseline,
      )
      throw error
    }
  }

  async function confirmProgramDelete() {
    if (!pendingDelete) return
    const { program } = pendingDelete
    setDeletingProgramId(program.programId)
    setDeleteError(null)
    try {
      await executeProgramDelete(pendingDelete, deleteBaseline)
      requestSavedProgramsRefresh(pendingDelete.profileId)
      setDeleteBaseline(null)
      setPendingDelete(null)
    } catch (error) {
      const baseline = error instanceof ControllerProgramDeletionError ? error.baseline : deleteBaseline
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

  function snapshotDelete(program: ControllerSavedProgramRow): PendingProgramDelete | null {
    if (!liveIp || liveEpoch === undefined) return null
    const deviceProgram = inventoryRead?.programs.find((entry) => entry.id === program.programId)
    if (!deviceProgram) return null
    return {
      program, controllerId: liveIp, controllerName: profile.name,
      expectedProgramName: deviceProgram.name, liveEpoch, profileId: profile.id,
      provider: getControllerProvider(),
    }
  }

  function selectedPrograms() {
    // Reconcile again at the action boundary: stale blocked IDs cannot enter a confirmation.
    const selected = reconcileControllerPatternSelection(selection, eligibleIds)
    return selected.selectedIds.flatMap((id) => {
      const program = sectionPrograms.find((row) => row.programId === id)
      return program ? [program] : []
    })
  }

  async function performBatch(operation: 'delete' | 'import') {
    if (batchLock.current) return
    const targets = operation === 'delete' ? pendingBatchDelete : selectedPrograms().flatMap((program) => {
      const target = snapshotDelete(program)
      return target ? [target] : []
    })
    if (!targets?.length) return
    batchLock.current = true
    setBatchBusy(true)
    setImportError(null)
    setDeleteError(null)
    try {
      const result = await runControllerPatternBatch(targets.map(({ program }) => ({ id: program.programId, name: program.name })), async ({ id }) => {
        const target = targets.find(({ program }) => program.programId === id)!
        if (operation === 'delete') {
          setDeletingProgramId(id)
          await executeProgramDelete(target)
        } else {
          setImportingProgramId(id)
          const sessionIsCurrent = () => {
            const current = currentDeleteSession.current
            const panel = useControllerPanelStore.getState()
            return current.profileId === target.profileId && current.controllerId === target.controllerId
              && current.liveEpoch === target.liveEpoch && getControllerProvider() === target.provider
              && panel.configSourceIp === target.controllerId && panel.activeProgramId !== id
              && panel.activatingProgramId !== id
          }
          if (!sessionIsCurrent()) throw new Error('Controller session or running Pattern changed')
          const pending = await readProgramImport(target.program)
          if (!sessionIsCurrent()) throw new Error('Controller session or running Pattern changed')
          await applyProgramImport(pending, false)
        }
      })
      if (result.failed.length) setImportError(result.failed.map(({ pattern, error }) => `${pattern.name}: ${error}`).join('\n'))
    } finally {
      requestSavedProgramsRefresh(targets[0].profileId)
      setSelection({ section: null, selectedIds: [] })
      setPendingBatchDelete(null)
      setImportingProgramId(null)
      setDeletingProgramId(null)
      setBatchBusy(false)
      batchLock.current = false
    }
  }

  return (
    <div data-testid="controller-saved-programs-pane" className="h-full min-h-0 overflow-x-hidden overflow-y-auto bg-zinc-950 text-zinc-200">
      {pendingBatchDelete && <AlertDialogRoot open onOpenChange={(open) => { if (!open && !batchLock.current) setPendingBatchDelete(null) }}>
        <AlertDialogContent onEscapeKeyDown={(event) => { if (batchBusy) event.preventDefault() }}>
          <AlertDialogTitle>Delete {pendingBatchDelete.length} Patterns from {pendingBatchDelete[0].controllerName}?</AlertDialogTitle>
          <AlertDialogDescription>{pendingBatchDelete[0].program.kind === 'owned'
            ? 'This removes the saved Patterns from the Controller. The Studio Pattern is not deleted; Save sends it again.'
            : 'This removes the Patterns from the Controller. PXLBLZ holds no copy of them — Import first if you want to keep the source.'}</AlertDialogDescription>
          <ul className="my-3 space-y-1 text-xs text-zinc-300">{controllerPatternBatchNames(pendingBatchDelete.map(({ program }) => ({ id: program.programId, name: program.name }))).map((name, index) => <li key={index}>{name}</li>)}</ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchBusy} onClick={() => setPendingBatchDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={batchBusy} className="border-red-500/70 text-red-300 hover:bg-red-950/40"
              onClick={(event) => { event.preventDefault(); void performBatch('delete') }}>
              {batchBusy ? 'Deleting…' : `Delete ${pendingBatchDelete.length} from Controller`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>}
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
        statuses={savedPatternStatuses}
        onRetry={() => void reconcileControllerProfile(profile.id)}
      />
      <SavedProgramsInventory
        status={readStatus}
        programs={programs}
        statuses={savedPatternStatuses}
        hasSnapshot={hasInventorySnapshot}
        activeProgramId={activeProgramId}
        activeProgramKnown={deleteSessionKnown}
        activatingProgramId={activatingProgramId}
        selection={currentSelection}
        eligibleIds={eligibleIds}
        batchBusy={batchBusy}
        onEnterSelection={(section) => setSelection(enterControllerPatternSelection(section))}
        onDone={() => setSelection({ section: null, selectedIds: [] })}
        onToggle={(id) => setSelection((current) => toggleControllerPatternSelection(current, id, eligibleIds))}
        onToggleAll={() => setSelection((current) => toggleAllControllerPatternSelection(current, eligibleIds))}
        onBatchImport={() => void performBatch('import')}
        onBatchDelete={() => {
          const targets = selectedPrograms().flatMap((program) => {
            const target = snapshotDelete(program)
            return target ? [target] : []
          })
          if (targets.length) setPendingBatchDelete(targets)
        }}
        onOpen={(routeId) => navigate({
          kind: 'studio',
          entity: routeId.startsWith('show:')
            ? { kind: 'shows', id: routeId.slice('show:'.length) }
            : { kind: 'patterns', id: routeId },
        })}
        onRun={(program) => void runSavedProgram(program)}
        onImport={(program) => void beginProgramImport(program)}
        onDelete={(program) => {
          const target = snapshotDelete(program)
          if (!target) return
          setDeleteError(null)
          setDeleteBaseline(null)
          setPendingDelete(target)
        }}
        importingProgramId={importingProgramId}
        deletingProgramId={deletingProgramId}
        error={runError?.message ?? importError}
      />
    </div>
  )
}
