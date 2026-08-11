import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp, Download, RefreshCw } from 'lucide-react'
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
  getControllerPushRecordsRevision,
  subscribeControllerPushRecordsRevision,
} from '@/engine/controllerMetadataStorage'
import type { ControllerProfile } from '@/engine/controllerProfile'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  describeControllerSavedPrograms,
  CONTROLLER_SAVED_PATTERN_STATUS_LABELS,
  sortControllerSavedPrograms,
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
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import { useRouterStore } from '@/store/routerStore'
import type { ArtifactShowOutputContract } from '@/engine/artifactStamp'
import {
  controllerSavedProgramsReadKey,
  useControllerSavedProgramsLiveStore,
} from '@/store/controllerSavedProgramsLiveStore'

const tableHeadClass = 'border-b border-seam pb-2 pr-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-500'
const EMPTY_CONTROLLER_PROGRAMS: ProgramListEntry[] = []
const tableCellClass = 'border-t border-zinc-900/85 py-2 pr-2 align-baseline'
const tableClass = 'w-full table-fixed border-collapse text-xs [&_tbody_tr:first-child_td]:border-t-0'
const patternInventoryColumns = [
  { id: 'pattern', className: 'w-[44%]' },
  { id: 'pattern-id', className: 'w-[18%]' },
  { id: 'status', className: 'w-[18%]' },
  { id: 'output-or-action', className: 'w-[20%]' },
] as const

type SavedProgramsReadStatus = 'offline' | 'loading' | 'ready' | 'error'

type PendingProgramImport = {
  program: ControllerSavedProgramRow
  decision: SavedProgramImportDecision
}

const statusPresentation: Record<ControllerSavedPatternStatus, { title: string; className: string }> = {
  current: {
    title: 'Current: the saved Pattern matches this Controller profile and renderer.',
    className: 'text-emerald-300',
  },
  stale: {
    title: 'Push again: a code-affecting profile or renderer setting changed since this Pattern was saved.',
    className: 'text-amber-300',
  },
  unmanaged: {
    title: 'Unknown: no recognized durable profile signature is available for this saved Pattern.',
    className: 'text-zinc-500',
  },
  queued: {
    title: 'Queued: waiting to sync with this Controller profile.',
    className: 'text-zinc-500',
  },
  updating: {
    title: 'Syncing: updating this saved Pattern for the Controller profile.',
    className: 'animate-pulse text-amber-300',
  },
  failed: {
    title: 'Failed: PXLBLZ could not update this saved Pattern.',
    className: 'text-red-300',
  },
}

function PatternStatusBadge({ status }: { status: ControllerSavedPatternStatus }) {
  const presentation = statusPresentation[status]
  return (
    <span
      title={presentation.title}
      className={`whitespace-nowrap font-mono font-medium uppercase tracking-[0.12em] ${IDE_MICROTYPE.required.sizeClassName} ${presentation.className}`}
    >
      {CONTROLLER_SAVED_PATTERN_STATUS_LABELS[status]}
    </span>
  )
}

function SavedProgramOutputContract({ contract }: { contract?: ArtifactShowOutputContract }) {
  if (!contract) return <span>-</span>
  if (contract.kind === 'installation') {
    return (
      <span title={contract.outputMap?.fingerprint ? `Map fingerprint ${contract.outputMap.fingerprint}` : undefined}>
        Installation · {contract.pixelCount} px{contract.outputMap ? ` · ${contract.outputMap.name}` : ''}
      </span>
    )
  }
  return <span>Portable 2D · variable · {contract.mapClasses.join('/')}</span>
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-5 text-zinc-500">
      {children}
    </p>
  )
}

function PatternInventoryColumns() {
  return (
    <colgroup>
      {patternInventoryColumns.map((column) => (
        <col key={column.id} className={column.className} />
      ))}
    </colgroup>
  )
}

function SavedProgramSourceNote({ program }: { program: ControllerSavedProgramRow }) {
  const available = program.routeId !== null
  const label = program.sourceKind === 'show'
    ? (available ? 'Show output' : 'Source Show unavailable')
    : (!available ? 'Source Pattern unavailable' : null)
  if (!label) return null
  return (
    <span className={`block text-[10px] ${available ? 'text-zinc-500' : 'text-amber-400/65'}`}>
      {label}
    </span>
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
    <section className="border-b border-seam bg-zinc-950/55 px-4 py-3">
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

function ProgramImportButton({
  program,
  disabled,
  importing,
  onImport,
}: {
  program: ControllerSavedProgramRow
  disabled: boolean
  importing: boolean
  onImport: (program: ControllerSavedProgramRow) => void
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      aria-label={`Import ${program.name}`}
      disabled={disabled}
      className={`${sectionActionButtonClass} w-full min-w-0 max-w-full px-1 text-[10px]`}
      onClick={() => onImport(program)}
    >
      <Download {...inlineIcon} aria-hidden />
      {importing ? 'Reading' : 'Import'}
    </Button>
  )
}

function SortableTableHead({
  field,
  label,
  sort,
  onSort,
}: {
  field: ControllerSavedProgramSort['field']
  label: string
  sort: ControllerSavedProgramSort
  onSort: (field: ControllerSavedProgramSort['field']) => void
}) {
  const active = sort.field === field
  return (
    <th className={tableHeadClass} aria-sort={active ? sort.direction : 'none'}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-sm text-left hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/60"
        onClick={() => onSort(field)}
      >
        {label}
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
  onRefresh,
  onOpen,
  onImport,
  importingProgramId,
  error,
  reconciliation,
}: {
  status: SavedProgramsReadStatus
  programs: ControllerSavedProgramsView
  hasSnapshot: boolean
  showsEnabled: boolean
  onRefresh: () => void
  onOpen: (routeId: string) => void
  onImport: (program: ControllerSavedProgramRow) => void
  importingProgramId: string | null
  error: string | null
  reconciliation?: ControllerReconciliationState
}) {
  const [sort, setSort] = useState<ControllerSavedProgramSort>({
    field: 'pattern',
    direction: 'ascending',
  })
  const statusByProgramId = Object.fromEntries(
    (reconciliation?.programs ?? []).map((program) => [program.programId, program.state]),
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
        <div className="overflow-x-auto">
          <table className={tableClass} aria-label="Saved PXLBLZ Patterns">
            <PatternInventoryColumns />
            <thead>
              <tr>
                <SortableTableHead field="pattern" label="Pattern" sort={sort} onSort={updateSort} />
                <SortableTableHead field="pattern-id" label="Pattern ID" sort={sort} onSort={updateSort} />
                <SortableTableHead field="status" label="Status" sort={sort} onSort={updateSort} />
                <th className={tableHeadClass}>Output</th>
              </tr>
            </thead>
            <tbody>
              {presentedPrograms.owned.map((program) => (
                <tr key={program.programId}>
                  <td className={`${tableCellClass} overflow-hidden`}>
                    <span className="block min-w-0">
                      {program.routeId && (program.sourceKind !== 'show' || showsEnabled) ? (
                        <button
                          type="button"
                          title={program.name}
                          className="block max-w-full whitespace-normal break-words text-left font-sans font-medium leading-snug text-live transition-colors hover:text-amber-300"
                          onClick={() => onOpen(program.routeId!)}
                        >
                          {program.name}
                        </button>
                      ) : (
                        <span className="block whitespace-normal break-words font-sans leading-snug text-zinc-300">{program.name}</span>
                      )}
                      <SavedProgramSourceNote program={program} />
                    </span>
                  </td>
                  <td title={program.programId} className={`${tableCellClass} truncate font-mono text-zinc-400`}>{program.programId}</td>
                  <td className={tableCellClass}>
                    <PatternStatusBadge status={statusFor(program)} />
                  </td>
                  <td className={`${tableCellClass} truncate font-mono text-[11.5px] text-zinc-400`}>
                    <SavedProgramOutputContract contract={program.showOutputContract} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showInventory && (
        <>
          <h2 className="mb-2 mt-5 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Other Patterns <span className="text-zinc-500">({presentedPrograms.foreign.length})</span>
          </h2>
          {presentedPrograms.foreign.length === 0 ? (
            <EmptyState>No other Patterns are saved on this Controller.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass} aria-label="Other Patterns">
                <PatternInventoryColumns />
                <thead>
                  <tr>
                    <SortableTableHead field="pattern" label="Pattern" sort={sort} onSort={updateSort} />
                    <SortableTableHead field="pattern-id" label="Pattern ID" sort={sort} onSort={updateSort} />
                    <SortableTableHead field="status" label="Status" sort={sort} onSort={updateSort} />
                    <th className={tableHeadClass}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {presentedPrograms.foreign.map((program) => (
                    <tr key={program.programId}>
                      <td title={program.name} className={`${tableCellClass} whitespace-normal break-words font-sans leading-snug text-zinc-500`}>{program.name}</td>
                      <td title={program.programId} className={`${tableCellClass} truncate font-mono text-zinc-500`}>{program.programId}</td>
                      <td className={tableCellClass}>
                        <PatternStatusBadge status={statusFor(program)} />
                      </td>
                      <td className={`${tableCellClass} text-right`}>
                        <ProgramImportButton
                          program={program}
                          disabled={importingProgramId !== null}
                          importing={importingProgramId === program.programId}
                          onImport={onImport}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
  const controllerPrograms = useControllerPanelStore((state) => (
    liveIp ? state.programsByController[liveIp] ?? EMPTY_CONTROLLER_PROGRAMS : EMPTY_CONTROLLER_PROGRAMS
  ))
  const refreshControllerPrograms = useControllerPanelStore((state) => state.refreshPrograms)
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
  const liveEpoch = profileController?.phase === 'live' ? profileController.liveEpoch : undefined
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

  useEffect(() => {
    if (!liveIp) {
      clearSavedPrograms(profile.id)
      return
    }
    if (useControllerStore.getState().activeIp !== liveIp) setActiveController(liveIp)
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
    clearSavedPrograms,
    controllerPrograms,
    liveEpoch,
    liveIp,
    profile.id,
    pushRecordsRevision,
    refreshControllerPrograms,
    refreshGeneration,
    setActiveController,
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

  return (
    <div data-testid="controller-saved-programs-pane" className="h-full min-h-0 overflow-y-auto bg-zinc-950 text-zinc-200">
      <ImportProgramDialog
        pending={pendingImport}
        busy={importingProgramId !== null}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => void confirmProgramImport()}
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
        onRefresh={() => requestSavedProgramsRefresh(profile.id)}
        onOpen={(routeId) => navigate({
          kind: 'studio',
          entity: routeId.startsWith('show:')
            ? { kind: 'shows', id: routeId.slice('show:'.length) }
            : { kind: 'patterns', id: routeId },
        })}
        onImport={(program) => void beginProgramImport(program)}
        importingProgramId={importingProgramId}
        error={importError}
        reconciliation={reconciliation}
      />
    </div>
  )
}
