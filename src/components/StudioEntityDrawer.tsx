import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ChevronRight } from 'lucide-react'
import {
  createStudioEntityDrawerState,
  studioEntityDrawerIsPinned,
  studioEntityDrawerMode,
  transitionStudioEntityDrawer,
  type StudioEntityDrawerBusyKind,
  type StudioEntityDrawerEvent,
  type StudioEntityDrawerState,
} from '@/engine/studioEntityDrawer'
import type { StudioEntityKind } from '@/engine/routes'
import { studioPlaceDefinition } from '@/engine/studioPlaces'
import { studioControlOwnsKeyboardEvent } from '@/engine/keyboardShortcuts'
import { useStudioEntityDrawerStore } from '@/store/studioEntityDrawerStore'
import { StudioPlaceIcon } from '@/components/StudioPlaceControl'
import {
  STUDIO_ENTITY_DRAWER_OWNER,
  StudioEntityDrawerContext,
  studioEntityDrawerOwnedSurfaceProps,
} from '@/components/studioEntityDrawerContext'

const CLOSE_DELAY_MS = 600
const BUSY_KINDS: StudioEntityDrawerBusyKind[] = ['drag', 'field', 'menu', 'dialog']

export interface StudioEntityDrawerHandle {
  openAfterPlaceSelection: (place: StudioEntityKind) => void
  closeAfterEntitySelection: () => void
}

export const StudioEntityDrawer = forwardRef<StudioEntityDrawerHandle, {
  place: StudioEntityKind
  narrow: boolean
  width: number
  drawer: ReactNode
  divider: ReactNode
  onPreviewSpace: () => void
  dismissOwnedBusy?: () => boolean
  children: ReactNode
}>(function StudioEntityDrawer({
  place,
  narrow,
  width,
  drawer,
  divider,
  onPreviewSpace,
  dismissOwnedBusy,
  children,
}, ref) {
  const pinPreferences = useStudioEntityDrawerStore((store) => store.pinPreferences)
  const persistPinned = useStudioEntityDrawerStore((store) => store.setPinned)
  const [state, setState] = useState<StudioEntityDrawerState>(() => (
    createStudioEntityDrawerState(place, pinPreferences, narrow)
  ))
  const [announcement, setAnnouncement] = useState('')
  const stateRef = useRef(state)
  const drawerRef = useRef<HTMLElement>(null)
  const focusReturnRef = useRef<HTMLElement | null>(null)
  const keyboardRefocusAllowedRef = useRef(false)
  const mode = studioEntityDrawerMode(state)

  const apply = useCallback((event: StudioEntityDrawerEvent) => {
    if (event.type === 'open' && event.source === 'keyboard') {
      focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      keyboardRefocusAllowedRef.current = true
    }
    const result = transitionStudioEntityDrawer(stateRef.current, event)
    stateRef.current = result.state
    if (studioEntityDrawerMode(result.state) !== 'open') keyboardRefocusAllowedRef.current = false
    setState(result.state)
    if (result.announce) setAnnouncement(result.announce)
    if (result.focus === 'restore') {
      const target = focusReturnRef.current
      focusReturnRef.current = null
      window.setTimeout(() => target?.focus(), 0)
    }
    return result
  }, [])

  useEffect(() => { apply({ type: 'set-place', place }) }, [apply, place])
  useEffect(() => { apply({ type: 'set-pin-preferences', pinPreferences }) }, [apply, pinPreferences])
  useEffect(() => { apply({ type: 'set-narrow', narrow }) }, [apply, narrow])

  useEffect(() => {
    if (mode !== 'open' || state.openSource !== 'keyboard') return
    const focusList = () => {
      const rail = drawerRef.current
      if (!keyboardRefocusAllowedRef.current || !rail || rail.contains(document.activeElement)) return
      const search = rail.querySelector<HTMLInputElement>('input[aria-label="Search by name"]')
      const selected = rail.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]')
      const first = rail.querySelector<HTMLElement>('[role="treeitem"]')
      ;(search ?? selected ?? first)?.focus()
    }
    const rail = drawerRef.current
    const observer = new MutationObserver(focusList)
    if (rail) observer.observe(rail, { childList: true, subtree: true })
    const stopRefocusingAfterIntentionalDeparture = (event: FocusEvent) => {
      if (
        rail?.contains(event.target as Node)
        && event.relatedTarget instanceof Node
        && !rail.contains(event.relatedTarget)
      ) keyboardRefocusAllowedRef.current = false
    }
    rail?.addEventListener('focusout', stopRefocusingAfterIntentionalDeparture)
    const initial = window.setTimeout(focusList, 0)
    const stop = window.setTimeout(() => observer.disconnect(), 1_000)
    return () => {
      window.clearTimeout(initial)
      window.clearTimeout(stop)
      rail?.removeEventListener('focusout', stopRefocusingAfterIntentionalDeparture)
      observer.disconnect()
    }
  }, [mode, state.openSource])

  useEffect(() => {
    if (!state.timerArmed) return
    const timer = window.setTimeout(() => apply({ type: 'timer-elapsed' }), CLOSE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [apply, state.timerArmed])

  const syncBusy = useCallback(() => {
    const next = new Set<StudioEntityDrawerBusyKind>()
    const active = document.activeElement
    if (
      active instanceof HTMLElement
      && active.matches('input, textarea, select, [contenteditable="true"]')
      && active.closest(`[data-studio-drawer-owner="${STUDIO_ENTITY_DRAWER_OWNER}"]`)
    ) next.add('field')
    document.querySelectorAll<HTMLElement>(
      `[data-studio-drawer-owner="${STUDIO_ENTITY_DRAWER_OWNER}"][data-studio-drawer-busy="true"]`,
    ).forEach((surface) => {
      const kind = surface.dataset.studioDrawerBusyKind as StudioEntityDrawerBusyKind | undefined
      if (kind && BUSY_KINDS.includes(kind)) next.add(kind)
    })
    for (const kind of BUSY_KINDS) {
      const activeNow = stateRef.current.busy.includes(kind)
      if (next.has(kind) !== activeNow) apply({ type: 'set-busy', kind, active: next.has(kind) })
    }
    return next
  }, [apply])

  useEffect(() => {
    if (mode !== 'open') return
    const observer = new MutationObserver(syncBusy)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-studio-drawer-busy', 'data-studio-drawer-busy-kind'],
    })
    document.addEventListener('focusin', syncBusy)
    document.addEventListener('focusout', syncBusy)
    syncBusy()
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', syncBusy)
      document.removeEventListener('focusout', syncBusy)
    }
  }, [mode, syncBusy])

  useEffect(() => {
    if (mode !== 'open') return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest(`[data-studio-drawer-owner="${STUDIO_ENTITY_DRAWER_OWNER}"]`)) return
      const busy = syncBusy()
      if (busy.size > 0) return
      apply({ type: 'close', reason: 'outside' })
    }
    window.addEventListener('pointerdown', closeOutside, true)
    return () => window.removeEventListener('pointerdown', closeOutside, true)
  }, [apply, mode, syncBusy])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = (event.metaKey || event.ctrlKey)
        && event.shiftKey
        && !event.altKey
        && event.key.toLocaleLowerCase() === 'l'
      if (shortcut && !studioControlOwnsKeyboardEvent(event.target)) {
        if (studioEntityDrawerIsPinned(stateRef.current)) return
        event.preventDefault()
        event.stopPropagation()
        if (studioEntityDrawerMode(stateRef.current) === 'open') apply({ type: 'close', reason: 'escape' })
        else apply({ type: 'open', source: 'keyboard' })
        return
      }
      if (event.key !== 'Escape' || studioEntityDrawerMode(stateRef.current) !== 'open') return
      const busy = syncBusy()
      if (busy.size > 0) {
        const active = document.activeElement
        if (active instanceof HTMLInputElement && active.getAttribute('aria-label') === 'Search by name') {
          keyboardRefocusAllowedRef.current = false
          active.blur()
        }
        else dismissOwnedBusy?.()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      apply({ type: 'close', reason: 'escape' })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [apply, dismissOwnedBusy, syncBusy])

  useEffect(() => {
    if (!ref) return
    const handle: StudioEntityDrawerHandle = {
      openAfterPlaceSelection(nextPlace) {
        apply({ type: 'set-place', place: nextPlace, openAfterSelection: true })
      },
      closeAfterEntitySelection() {
        apply({ type: 'close', reason: 'entity-chosen' })
      },
    }
    if (typeof ref === 'function') ref(handle)
    else ref.current = handle
    return () => {
      if (typeof ref === 'function') ref(null)
      else ref.current = null
    }
  }, [apply, ref])

  const pinned = studioEntityDrawerIsPinned(state)
  const definition = studioPlaceDefinition(state.place)
  const controls = {
    pinned,
    pinDisabled: state.narrow,
    timerArmed: state.timerArmed,
    setPinned(nextPinned: boolean) {
      if (stateRef.current.narrow) return
      persistPinned(stateRef.current.place, nextPinned)
      apply({ type: 'set-pinned', pinned: nextPinned })
    },
    close() { apply({ type: 'close', reason: 'button' }) },
  }

  const drawerPane = (
    <StudioEntityDrawerContext.Provider value={controls}>
      <aside
        ref={drawerRef}
        aria-label={`${definition.label} list`}
        data-testid="studio-entity-drawer"
        data-drawer-mode={mode}
        {...studioEntityDrawerOwnedSurfaceProps}
        onPointerEnter={() => apply({ type: 'pointer', inside: true })}
        onPointerLeave={() => apply({ type: 'pointer', inside: false })}
        className={mode === 'pinned'
          ? 'relative flex h-full shrink-0 flex-col'
          : `absolute inset-y-0 left-0 z-[55] flex flex-col border-r bg-zinc-950 shadow-2xl [transition:transform_150ms_ease-out,visibility_0s_linear_150ms] ${mode === 'open' ? 'visible translate-x-0 border-zinc-700 shadow-black/60 [transition-delay:0s]' : 'invisible -translate-x-full border-seam shadow-transparent'}`}
        style={{ width, maxWidth: mode === 'pinned' ? '34vw' : 'calc(100vw - 22px)' }}
      >
        {drawer}
      </aside>
    </StudioEntityDrawerContext.Provider>
  )

  return (
    <div className="relative flex min-h-0 flex-1" data-testid="studio-drawer-layout" data-drawer-mode={mode}>
      {mode === 'pinned' ? (
        <>
          {drawerPane}
          {divider}
        </>
      ) : (
        <>
          <div className="h-full w-[22px] shrink-0 border-r border-seam bg-zinc-950/35">
            <button
              type="button"
              data-testid="studio-drawer-edge-tab"
              aria-label={`Open the ${definition.label} list`}
              aria-expanded={mode === 'open'}
              aria-hidden={mode === 'open' || undefined}
              tabIndex={mode === 'open' ? -1 : 0}
              data-studio-space-preview="true"
              {...studioEntityDrawerOwnedSurfaceProps}
              onClick={() => apply({ type: 'open', source: 'pointer' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.stopPropagation()
                  apply({ type: 'open', source: 'keyboard' })
                } else if (event.code === 'Space') {
                  event.preventDefault()
                  event.stopPropagation()
                  onPreviewSpace()
                }
              }}
              className={`flex h-full w-[22px] flex-col items-center gap-2 pt-2 text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-live/70 ${mode === 'open' ? 'pointer-events-none opacity-0' : ''}`}
            >
              <StudioPlaceIcon place={state.place} size={14} />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] [writing-mode:vertical-rl] rotate-180">{definition.label}</span>
              <ChevronRight size={12} aria-hidden />
            </button>
          </div>
          {drawerPane}
        </>
      )}
      {children}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  )
})
