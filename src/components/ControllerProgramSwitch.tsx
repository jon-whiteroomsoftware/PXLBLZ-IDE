import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { DisabledReasonTip } from '@/components/ui/disabled-reason'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import {
  projectControllerProgramMenu,
  type ControllerProgramMenuRow,
} from '@/engine/controllerActionRow'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import type { SendGate } from '@/engine/sendToController'
import { queueControllerDeviceWrite } from '@/engine/controllerDeviceWriteQueue'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'

interface ControllerProgramSwitchProps {
  gate: SendGate
  programs: ProgramListEntry[]
  controllerId: string
  ownedProgramIds?: readonly string[]
  onOpen?: () => void
  children: ReactNode
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function ControllerProgramSwitch({
  gate,
  programs,
  controllerId,
  ownedProgramIds,
  onOpen,
  children,
}: ControllerProgramSwitchProps) {
  const menuId = useId()
  const reasonId = useId()
  const otherExpanded = usePanelPreferencesStore(state => state.expanded['controller:saved-patterns-other'] ?? true)
  const setExpanded = usePanelPreferencesStore(state => state.setExpanded)
  const activeProgramId = useControllerPanelStore((state) => state.activeProgramId)
  const switchingId = useControllerPanelStore((state) => state.activatingProgramId)
  const programLabels = useControllerPanelStore((state) => state.programLabels)
  const activateProgram = useControllerPanelStore((state) => state.activateProgram)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [failure, setFailure] = useState<{ programId: string; message: string } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const menuLifecycleRef = useRef(0)
  const view = useMemo(() => projectControllerProgramMenu({
    programs,
    activeProgramId,
    programLabels,
    filter,
    ownedProgramIds,
    otherExpanded,
  }), [activeProgramId, filter, programLabels, programs, ownedProgramIds, otherExpanded])

  const close = useCallback((restoreFocus: boolean) => {
    menuLifecycleRef.current += 1
    setOpen(false)
    setFilter('')
    setFailure(null)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // A failure banner and the running marker must never contradict each other
  // (#877): when a later poll reports the failed target as the running Pattern,
  // the activation was confirmed late, so the banner is stale and clears for
  // good. Cleared from the store subscription (an external system), never
  // hidden by derivation, so a later switch cannot resurrect it.
  useEffect(() => {
    if (!failure) return
    const clearIfConfirmed = (state: { activeProgramId?: string }) => {
      if (state.activeProgramId === failure.programId) setFailure(null)
    }
    clearIfConfirmed(useControllerPanelStore.getState())
    return useControllerPanelStore.subscribe(clearIfConfirmed)
  }, [failure])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      if (view.showFilter) {
        filterRef.current?.focus()
        return
      }
      const options = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="option"]:not(:disabled)',
      )
      const selected = Array.from(options ?? []).find((option) => (
        option.getAttribute('aria-selected') === 'true'
      ))
      ;(selected ?? options?.[0])?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, view.showFilter])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close(true)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [close, open])

  const switchTo = async (row: ControllerProgramMenuRow) => {
    if (!gate.enabled || row.disabled || switchingId !== null) return
    const menuLifecycle = menuLifecycleRef.current
    setFailure(null)
    try {
      const expectedProvider = getControllerProvider()
      const expectedLiveEpoch = useControllerStore.getState().controllers[controllerId]?.liveEpoch
      const sessionIsCurrent = () => {
        const state = useControllerStore.getState()
        const controller = state.controllers[controllerId]
        return state.activeIp === controllerId
          && controller?.phase === 'live'
          && controller.liveEpoch === expectedLiveEpoch
          && getControllerProvider() === expectedProvider
      }
      if (expectedLiveEpoch === undefined || !sessionIsCurrent()) {
        throw new Error('Controller session changed before Pattern activation could start.')
      }
      await queueControllerDeviceWrite(controllerId, () => activateProgram(row.id, {
        expectedControllerId: controllerId,
        expectedProvider,
        sessionIsCurrent,
      }))
      if (menuLifecycleRef.current === menuLifecycle) close(true)
    } catch (error) {
      if (menuLifecycleRef.current === menuLifecycle) {
        setFailure({ programId: row.id, message: errorMessage(error) })
      }
    }
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [],
    )
    if (options.length === 0) return
    if (event.key === 'Enter' && document.activeElement === filterRef.current) {
      event.preventDefault()
      options[0].click()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1 + options.length) % options.length
          : current < 0
            ? options.length - 1
            : (current - 1 + options.length) % options.length
    options[next]?.focus()
  }

  const renderRow = (row: ControllerProgramMenuRow) => (
    <li role="presentation" key={`${row.unsaved ? 'unsaved' : 'saved'}:${row.id}`}>
      <button
        type="button"
        role="option"
        aria-selected={row.running}
        disabled={!gate.enabled || row.disabled || switchingId !== null}
        title={`${row.name} · ${row.id}`}
        onClick={() => void switchTo(row)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-zinc-800/80 disabled:cursor-not-allowed ${row.running ? 'text-amber-300' : 'text-zinc-200'} ${switchingId !== null && switchingId !== row.id ? 'opacity-50' : ''}`}
      >
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${row.running ? 'bg-emerald-400' : 'bg-transparent'}`} />
        <span className="min-w-0 break-words font-sans">{row.name}</span>
        {row.unsaved && <span className="ml-auto shrink-0 text-[10px] text-zinc-500">unsaved · running</span>}
        {switchingId === row.id && <span className="ml-auto shrink-0 text-[10px] text-zinc-500">switching…</span>}
      </button>
    </li>
  )

  return (
    <>
      <span className="controller-title-picker">
      <button
        ref={triggerRef}
        type="button"
        aria-disabled={!gate.enabled || undefined}
        aria-describedby={!gate.enabled ? reasonId : undefined}
        aria-label="Saved Patterns"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="controller-saved-patterns-trigger"
        onClick={() => {
          if (!gate.enabled) return
          if (open) close(true)
          else {
            menuLifecycleRef.current += 1
            setFailure(null)
            setOpen(true)
            onOpen?.()
          }
        }}
        className="controller-saved-patterns-trigger"
      >
        {children}
        <ChevronDown size={14} aria-hidden className="controller-title-chevron" />
      </button>
      {!gate.enabled && <DisabledReasonTip id={reasonId}>{gate.reason}</DisabledReasonTip>}
      </span>
      {open && (
        <div
          ref={menuRef}
          data-testid="controller-program-menu"
          onKeyDown={onMenuKeyDown}
          className="controller-saved-patterns-menu absolute left-2 right-2 z-20 flex max-h-[60vh] flex-col overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 shadow-2xl"
        >
          {view.showFilter && (
            <input
              ref={filterRef}
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter saved Patterns…"
              aria-label="Filter saved Patterns"
              className="m-1.5 h-7 rounded-sm border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-live/60 focus:outline-none"
            />
          )}
          {failure && (
            <p role="alert" className="border-y border-red-400/20 bg-red-500/5 px-3 py-1.5 text-[10px] leading-4 text-red-300">
              Switch failed: {failure.message}
            </p>
          )}
          <ul
            role="listbox"
            id={menuId}
            aria-label="Saved Patterns"
            aria-busy={switchingId !== null}
            className="min-h-0 overflow-y-auto py-1"
          >
            {view.grouped ? <>
              {view.runOnlyRows.map(renderRow)}
              <li role="presentation" className="controller-program-group">Saved PXLBLZ Patterns <span>{view.ownedCount}</span></li>
              {view.ownedRows.map(renderRow)}
              {view.otherCount > 0 && <li role="presentation">
                <button type="button" className="controller-program-group" aria-expanded={otherExpanded} disabled={switchingId !== null} onClick={() => setExpanded('controller:saved-patterns-other', !otherExpanded)}>
                  <ChevronRight size={12} aria-hidden />Other Patterns <span>{view.otherCount}</span>
                </button>
              </li>}
              {view.otherRows.map(renderRow)}
            </> : view.rows.map(renderRow)}
            {view.rows.filter((row) => !row.unsaved).length === 0 && (
              <li role="presentation" className="px-3 py-1.5 text-[11px] text-zinc-600">
                No saved Patterns match.
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  )
}
