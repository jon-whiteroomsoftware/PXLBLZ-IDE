import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import type { BindingStore } from '@/engine/controllerBinding'
import { getControllerBindings } from '@/engine/controllerMetadataStorage'
import type { ControllerProfile } from '@/engine/controllerProfile'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  describeControllerSavedPrograms,
  type ControllerSavedProgramsView,
} from '@/engine/controllerSavedPrograms'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { useControllerStore } from '@/store/controllerStore'
import { usePatternStore } from '@/store/patternStore'
import { useRouterStore } from '@/store/routerStore'

const tableHeadClass = 'px-2 py-1 text-left text-[10px] font-semibold uppercase text-zinc-500'
const tableCellClass = 'border-t border-zinc-800/85 px-2 py-1.5 align-middle'

type SavedProgramsRead = {
  controllerId: string | null
  status: 'offline' | 'loading' | 'ready' | 'error'
  programs: ProgramListEntry[]
  bindings: BindingStore
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-zinc-700/80 bg-zinc-950/30 px-3 py-3 text-xs text-zinc-500">
      {children}
    </div>
  )
}

function SavedProgramsInventory({
  status,
  programs,
  onRefresh,
  onOpen,
}: {
  status: SavedProgramsRead['status']
  programs: ControllerSavedProgramsView
  onRefresh: () => void
  onOpen: (routeId: string) => void
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
                </tr>
              ))}
              {programs.foreign.length > 0 && (
                <tr>
                  <td
                    colSpan={2}
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
  const navigate = useRouterStore((state) => state.navigate)
  const profileController = controllerForProfile(profile, controllers)
  const liveIp = profileController?.phase === 'live' ? profileController.ip : undefined
  const requestRef = useRef(0)
  const [refresh, setRefresh] = useState(0)
  const [read, setRead] = useState<SavedProgramsRead>({
    controllerId: null,
    status: 'offline',
    programs: [],
    bindings: {},
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
          : { controllerId: null, status: 'offline', programs: [], bindings: {} })
        return
      }

      setRead((current) => ({
        controllerId: liveIp,
        status: 'loading',
        programs: current.controllerId === liveIp ? current.programs : [],
        bindings: current.controllerId === liveIp ? current.bindings : {},
      }))
      if (useControllerStore.getState().activeIp !== liveIp) setActiveController(liveIp)

      try {
        const [programs, bindings] = await Promise.all([
          getControllerProvider().listPrograms(),
          getControllerBindings(),
        ])
        if (cancelled || requestRef.current !== request) return
        setRead({ controllerId: liveIp, status: 'ready', programs, bindings })
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

  return (
    <div data-testid="controller-saved-programs-pane" className="h-full min-h-0 overflow-y-auto bg-zinc-950 text-zinc-200">
      <SavedProgramsInventory
        status={read.status}
        programs={programs}
        onRefresh={() => setRefresh((value) => value + 1)}
        onOpen={(routeId) => navigate({ kind: 'studio', entity: { kind: 'patterns', id: routeId } })}
      />
    </div>
  )
}
