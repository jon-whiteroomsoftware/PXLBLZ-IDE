import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import type { BindingStore } from '@/engine/controllerBinding'
import { getControllerBindings, getPushRecords } from '@/engine/controllerMetadataStorage'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { ControllerPushRecords } from '@/engine/controllerPushRecord'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  describeControllerSavedPrograms,
  enabledControllerTransformIds,
  type TransformFreshness,
  type ControllerSavedProgramRow,
  type ControllerSavedProgramsView,
} from '@/engine/controllerSavedPrograms'
import {
  createSavedProgramPatternRecord,
  decideSavedProgramImport,
  type SavedProgramImportDecision,
} from '@/engine/savedProgramImport'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { useControllerStore } from '@/store/controllerStore'
import { usePatternStore } from '@/store/patternStore'
import { useRouterStore } from '@/store/routerStore'
import type { ArtifactShowOutputContract } from '@/engine/artifactStamp'

const tableHeadClass = 'px-2 py-1 text-left text-[10px] font-semibold uppercase text-zinc-500'
const tableCellClass = 'border-t border-zinc-800/85 px-2 py-1.5 align-middle'

type SavedProgramsRead = {
  controllerId: string | null
  status: 'offline' | 'loading' | 'ready' | 'error'
  programs: ProgramListEntry[]
  bindings: BindingStore
  pushRecords: ControllerPushRecords
}

type PendingProgramImport = {
  program: ControllerSavedProgramRow
  decision: SavedProgramImportDecision
}

const freshnessPresentation: Record<TransformFreshness, { label: string; title: string; className: string }> = {
  current: {
    label: 'current',
    title: 'Current: pushed with the transforms enabled on this profile.',
    className: 'border-emerald-700/55 bg-emerald-950/55 text-emerald-300',
  },
  stale: {
    label: 'stale',
    title: 'Stale: profile transforms changed since this program was pushed. Push it again to update.',
    className: 'border-amber-700/60 bg-amber-950/50 text-amber-300',
  },
  unmanaged: {
    label: 'unmanaged',
    title: 'Unmanaged: no Studio push record is available for this saved program.',
    className: 'border-zinc-700/80 bg-zinc-900/70 text-zinc-500',
  },
}

function FreshnessBadge({ freshness }: { freshness: TransformFreshness }) {
  const presentation = freshnessPresentation[freshness]
  return (
    <span
      title={presentation.title}
      className={`inline-flex whitespace-nowrap border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${presentation.className}`}
    >
      {presentation.label}
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
    <div className="border border-dashed border-zinc-700/80 bg-zinc-950/30 px-3 py-3 text-xs text-zinc-500">
      {children}
    </div>
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
      ? 'Program cannot be imported'
      : decision.ownership === 'ide-owned'
        ? 'Restore Studio pattern?'
        : 'Import controller pattern?'
  const description = decision.kind === 'open-existing'
    ? `This controller program was saved from "${decision.name}", which still exists in Studio.`
    : decision.kind === 'unavailable'
      ? decision.reason
      : decision.ownership === 'ide-owned'
        ? 'Recovered source and Studio identity from the saved artifact.'
        : 'The controller blob contains source but no PXLBLZ ownership stamp. A new Studio pattern will be created.'
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
      className="bg-zinc-900/60 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-35"
      onClick={() => onImport(program)}
    >
      <Download size={12} aria-hidden />
      {importing ? 'Reading' : 'Import'}
    </Button>
  )
}

function SavedProgramsInventory({
  status,
  programs,
  onRefresh,
  onOpen,
  onImport,
  importingProgramId,
  error,
}: {
  status: SavedProgramsRead['status']
  programs: ControllerSavedProgramsView
  onRefresh: () => void
  onOpen: (routeId: string) => void
  onImport: (program: ControllerSavedProgramRow) => void
  importingProgramId: string | null
  error: string | null
}) {
  const count = programs.owned.length + programs.foreign.length
  return (
    <section className="border-b border-seam px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-300">Saved programs</h2>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="Refresh saved programs"
          disabled={status === 'offline' || status === 'loading'}
          className="bg-zinc-900/70 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-35"
          onClick={onRefresh}
        >
          <RefreshCw size={13} aria-hidden className={status === 'loading' ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>
      {error && (
        <div role="alert" className="mb-2 border border-red-500/30 bg-red-950/20 px-2.5 py-2 text-[11px] text-red-200">
          {error}
        </div>
      )}
      {status === 'offline' ? (
        <EmptyState>Connect this controller to inspect its saved programs.</EmptyState>
      ) : status === 'loading' ? (
        <EmptyState>Reading saved programs from the controller…</EmptyState>
      ) : status === 'error' ? (
        <EmptyState>Saved programs could not be read. Check the connection, then refresh.</EmptyState>
      ) : count === 0 ? (
        <EmptyState>No saved programs are installed on this controller.</EmptyState>
      ) : (
        <div className="overflow-x-auto border border-zinc-800/80 bg-zinc-950/25">
          <table className="w-full border-collapse text-xs" aria-label="Saved programs inventory">
            <thead>
              <tr>
                <th className={tableHeadClass}>Pattern</th>
                <th className={tableHeadClass}>Program id</th>
                <th className={tableHeadClass}>Transforms</th>
                <th className={tableHeadClass}>Output</th>
                <th className={tableHeadClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {programs.owned.map((program) => (
                <tr key={program.programId} className="bg-zinc-900/20">
                  <td className={tableCellClass}>
                    {program.routeId ? (
                      <button
                        type="button"
                        className="text-left font-medium text-live transition-colors hover:text-amber-300"
                        onClick={() => onOpen(program.routeId!)}
                      >
                        {program.name}
                      </button>
                    ) : (
                      <div>
                        <div className="text-zinc-300">{program.name}</div>
                        <div className="text-[10px] text-amber-400/65">Studio pattern missing</div>
                      </div>
                    )}
                  </td>
                  <td className={`${tableCellClass} font-mono text-zinc-400`}>{program.programId}</td>
                  <td className={tableCellClass}>
                    <FreshnessBadge freshness={program.freshness} />
                  </td>
                  <td className={`${tableCellClass} text-[10px] text-zinc-400`}>
                    <SavedProgramOutputContract contract={program.showOutputContract} />
                  </td>
                  <td className={`${tableCellClass} text-right`}>
                    <ProgramImportButton
                      program={program}
                      disabled={status !== 'ready' || importingProgramId !== null}
                      importing={importingProgramId === program.programId}
                      onImport={onImport}
                    />
                  </td>
                </tr>
              ))}
              {programs.foreign.length > 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="border-t border-zinc-800 bg-zinc-950/70 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                  >
                    Foreign programs · {programs.foreign.length}
                  </td>
                </tr>
              )}
              {programs.foreign.map((program) => (
                <tr key={program.programId} className="bg-zinc-950/40">
                  <td className={`${tableCellClass} text-zinc-500`}>{program.name}</td>
                  <td className={`${tableCellClass} font-mono text-zinc-600`}>{program.programId}</td>
                  <td className={tableCellClass}>
                    <FreshnessBadge freshness={program.freshness} />
                  </td>
                  <td className={`${tableCellClass} text-[10px] text-zinc-600`}>-</td>
                  <td className={`${tableCellClass} text-right`}>
                    <ProgramImportButton
                      program={program}
                      disabled={status !== 'ready' || importingProgramId !== null}
                      importing={importingProgramId === program.programId}
                      onImport={onImport}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {programs.foreign.length > 0 && (
            <p className="border-t border-zinc-800/80 px-2 py-2 text-[10px] leading-4 text-zinc-600">
              Foreign means saved on this controller but not linked to a pattern in this Studio.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export function ControllerSavedProgramsPane({ profile }: { profile: ControllerProfile }) {
  const controllers = useControllerStore((state) => state.controllers)
  const setActiveController = useControllerStore((state) => state.setActive)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const addPattern = usePatternStore((state) => state.addPattern)
  const navigate = useRouterStore((state) => state.navigate)
  const profileController = controllerForProfile(profile, controllers)
  const liveIp = profileController?.phase === 'live' ? profileController.ip : undefined
  const requestRef = useRef(0)
  const [refresh, setRefresh] = useState(0)
  const [pendingImport, setPendingImport] = useState<PendingProgramImport | null>(null)
  const [importingProgramId, setImportingProgramId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [read, setRead] = useState<SavedProgramsRead>({
    controllerId: null,
    status: 'offline',
    programs: [],
    bindings: {},
    pushRecords: {},
  })

  useEffect(() => {
    const request = ++requestRef.current
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled || requestRef.current !== request) return
      if (!liveIp) {
        setRead((current) => current.status === 'offline' && current.controllerId === null
          ? current
          : { controllerId: null, status: 'offline', programs: [], bindings: {}, pushRecords: {} })
        return
      }

      setRead((current) => ({
        controllerId: liveIp,
        status: 'loading',
        programs: current.controllerId === liveIp ? current.programs : [],
        bindings: current.controllerId === liveIp ? current.bindings : {},
        pushRecords: current.controllerId === liveIp ? current.pushRecords : {},
      }))
      if (useControllerStore.getState().activeIp !== liveIp) setActiveController(liveIp)

      try {
        const [programs, bindings, pushRecords] = await Promise.all([
          getControllerProvider().listPrograms(),
          getControllerBindings(),
          getPushRecords(),
        ])
        if (cancelled || requestRef.current !== request) return
        setRead({ controllerId: liveIp, status: 'ready', programs, bindings, pushRecords })
      } catch {
        if (cancelled || requestRef.current !== request) return
        setRead((current) => ({ ...current, controllerId: liveIp, status: 'error' }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [liveIp, refresh, setActiveController])

  const programs = describeControllerSavedPrograms({
    controllerId: read.controllerId ?? liveIp ?? '',
    programs: read.programs,
    bindings: read.bindings,
    pushRecords: read.pushRecords,
    enabledTransforms: enabledControllerTransformIds(profile.globalTransforms),
    studioPatterns: [
      ...userPatterns.map((pattern) => ({
        bindingKey: pattern.id,
        routeId: pattern.id,
        name: pattern.name,
      })),
      ...Object.keys(DEMOS).map((name) => ({
        bindingKey: `demo:${name}`,
        routeId: name,
        name,
      })),
    ],
  })

  async function beginProgramImport(program: ControllerSavedProgramRow) {
    if (!liveIp) return
    setImportError(null)
    setImportingProgramId(program.programId)
    try {
      const recovered = await getControllerProvider().readSavedProgram(program.programId)
      if (!recovered) {
        setImportError(`"${program.name}" is no longer on the controller. Refresh the saved-program list.`)
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
      setImportError(error instanceof Error ? error.message : 'Saved program could not be read.')
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
      setImportError(error instanceof Error ? error.message : 'Recovered pattern could not be saved.')
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
      <SavedProgramsInventory
        status={read.status}
        programs={programs}
        onRefresh={() => setRefresh((value) => value + 1)}
        onOpen={(routeId) => navigate({ kind: 'studio', entity: { kind: 'patterns', id: routeId } })}
        onImport={(program) => void beginProgramImport(program)}
        importingProgramId={importingProgramId}
        error={importError}
      />
    </div>
  )
}
