import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useMemo,
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
  type StudioEntityDrawerMode,
} from '@/engine/studioEntityDrawer'
import type { StudioEntityKind } from '@/engine/routes'
import { studioPlaceDefinition } from '@/engine/studioPlaces'
import { claimStudioPreviewSpace, studioControlOwnsKeyboardEvent } from '@/engine/keyboardShortcuts'
import { useStudioEntityDrawerStore } from '@/store/studioEntityDrawerStore'
import { StudioPlaceIcon } from '@/components/StudioPlaceControl'
import {
  STUDIO_ENTITY_DRAWER_OWNER,
  StudioEntityDrawerContext,
} from '@/components/studioEntityDrawerContext'

const HOVER_OPEN_DELAY_MS = 300
const CLOSE_DELAY_MS = 600
const BUSY_KINDS: StudioEntityDrawerBusyKind[] = ['drag', 'field', 'menu', 'dialog']

export interface StudioEntityDrawerHandle {
  openAfterPlaceSelection: (place: StudioEntityKind) => void
  closeAfterEntitySelection: () => void
}

export const StudioEntityDrawer = forwardRef<StudioEntityDrawerHandle, {
  place: StudioEntityKind
  enabled?: boolean
  side?: 'left' | 'right'
  label?: string
  owner?: string
  edgeContent?: ReactNode
  edgeLabel?: string
  pinPreference?: boolean
  onPinPreferenceChange?: (pinned: boolean) => void
  requestedMode?: StudioEntityDrawerMode
  onModeChange?: (mode: StudioEntityDrawerMode) => void
  routeKey?: string
  narrow: boolean
  width: number
  drawer: ReactNode
  divider: ReactNode
  onPreviewSpace: () => void
  dismissOwnedBusy?: () => boolean
  children: ReactNode
}>(function StudioEntityDrawer({
  place,
  enabled = true,
  side = 'left',
  label,
  owner = STUDIO_ENTITY_DRAWER_OWNER,
  edgeContent,
  edgeLabel,
  pinPreference,
  onPinPreferenceChange,
  requestedMode,
  onModeChange,
  routeKey,
  narrow,
  width,
  drawer,
  divider,
  onPreviewSpace,
  dismissOwnedBusy,
  children,
}, ref) {
  const storedPinPreferences = useStudioEntityDrawerStore((store) => store.pinPreferences)
  const pinPreferences = useMemo(() => pinPreference === undefined ? storedPinPreferences : { [place]: pinPreference }, [pinPreference, place, storedPinPreferences])
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
  const hoverTimerRef = useRef<number | null>(null)
  const pointerPressedRef = useRef(false)
  const nativeDragRef = useRef(false)
  const cancelHoverOpen = useCallback(() => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }, [])

  const apply = useCallback((event: StudioEntityDrawerEvent) => {
    cancelHoverOpen()
    if (event.type === 'open' && event.source === 'keyboard') {
      focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      keyboardRefocusAllowedRef.current = true
    }
    const result = transitionStudioEntityDrawer(stateRef.current, event, label)
    stateRef.current = result.state
    if (studioEntityDrawerMode(result.state) !== 'open') keyboardRefocusAllowedRef.current = false
    setState(result.state)
    onModeChange?.(studioEntityDrawerMode(result.state))
    if (result.announce) setAnnouncement(result.announce)
    if (result.focus === 'restore') {
      const target = focusReturnRef.current
      focusReturnRef.current = null
      window.setTimeout(() => target?.focus(), 0)
    }
    return result
  }, [cancelHoverOpen, onModeChange, label])

  useEffect(() => {
    cancelHoverOpen()
    return cancelHoverOpen
  }, [cancelHoverOpen, routeKey])

  useEffect(() => {
    if (!requestedMode || requestedMode === studioEntityDrawerMode(stateRef.current)) return
    if (requestedMode === 'pinned') apply({ type: 'set-pinned', pinned: true })
    else {
      if (studioEntityDrawerIsPinned(stateRef.current)) apply({ type: 'set-pinned', pinned: false })
      apply(requestedMode === 'open' ? { type: 'open', source: 'pointer' } : { type: 'close', reason: 'button' })
    }
  }, [apply, requestedMode])

  useEffect(() => {
    const pressed = () => { pointerPressedRef.current = true; cancelHoverOpen() }
    const released = () => { pointerPressedRef.current = false }
    const dragStarted = () => { nativeDragRef.current = true; cancelHoverOpen() }
    const dragEnded = () => { nativeDragRef.current = false }
    const blurred = () => { released(); dragEnded(); cancelHoverOpen() }
    window.addEventListener('pointerdown', pressed, true)
    window.addEventListener('pointerup', released, true)
    window.addEventListener('pointercancel', released, true)
    window.addEventListener('dragstart', dragStarted, true)
    window.addEventListener('dragend', dragEnded, true)
    window.addEventListener('drop', dragEnded, true)
    window.addEventListener('blur', blurred)
    return () => {
      window.removeEventListener('pointerdown', pressed, true)
      window.removeEventListener('pointerup', released, true)
      window.removeEventListener('pointercancel', released, true)
      window.removeEventListener('dragstart', dragStarted, true)
      window.removeEventListener('dragend', dragEnded, true)
      window.removeEventListener('drop', dragEnded, true)
      window.removeEventListener('blur', blurred)
    }
  }, [cancelHoverOpen])

  useEffect(() => { apply({ type: 'set-place', place }) }, [apply, place])
  useEffect(() => { apply({ type: 'set-pin-preferences', pinPreferences }) }, [apply, pinPreferences])
  useEffect(() => { apply({ type: 'set-narrow', narrow }) }, [apply, narrow])

  useEffect(() => {
    if (mode !== 'open' || state.openSource !== 'keyboard') return
    const focusList = () => {
      const rail = drawerRef.current
      if (!keyboardRefocusAllowedRef.current || !rail || rail.contains(document.activeElement)) return
      const search = rail.querySelector<HTMLInputElement>('input[data-rail-search]')
      const selected = rail.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]')
      const first = rail.querySelector<HTMLElement>('[role="treeitem"]')
      const initial = rail.querySelector<HTMLElement>('[data-drawer-initial-focus]')
      ;(initial ?? search ?? selected ?? first)?.focus()
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
      && active.closest(`[data-studio-drawer-owner="${owner}"]`)
    ) next.add('field')
    document.querySelectorAll<HTMLElement>(
      `[data-studio-drawer-owner="${owner}"][data-studio-drawer-busy="true"]`,
    ).forEach((surface) => {
      const kind = surface.dataset.studioDrawerBusyKind as StudioEntityDrawerBusyKind | undefined
      if (kind && BUSY_KINDS.includes(kind)) next.add(kind)
    })
    for (const kind of BUSY_KINDS) {
      const activeNow = stateRef.current.busy.includes(kind)
      if (next.has(kind) !== activeNow) apply({ type: 'set-busy', kind, active: next.has(kind) })
    }
    return next
  }, [apply, owner])

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
      if (target instanceof Element && target.closest(`[data-studio-drawer-owner="${owner}"]`)) return
      const busy = syncBusy()
      if (busy.size > 0) return
      apply({ type: 'close', reason: 'outside' })
    }
    window.addEventListener('pointerdown', closeOutside, true)
    return () => window.removeEventListener('pointerdown', closeOutside, true)
  }, [apply, mode, owner, syncBusy])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = side === 'left' && (event.metaKey || event.ctrlKey)
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
        if (active instanceof HTMLInputElement && active.hasAttribute('data-rail-search')) {
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
  }, [apply, dismissOwnedBusy, side, syncBusy])

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
      if (onPinPreferenceChange) onPinPreferenceChange(nextPinned)
      else persistPinned(stateRef.current.place, nextPinned)
      apply({ type: 'set-pinned', pinned: nextPinned })
    },
    close() { apply({ type: 'close', reason: 'button' }) },
  }

  const drawerPane = (
    <StudioEntityDrawerContext.Provider key="drawer" value={controls}>
      <aside
        ref={drawerRef}
        aria-label={label ?? `${definition.label} list`}
        data-testid="studio-entity-drawer"
        data-drawer-mode={mode}
        data-studio-drawer-owner={owner}
        onPointerEnter={() => apply({ type: 'pointer', inside: true })}
        onPointerLeave={() => apply({ type: 'pointer', inside: false })}
        className={mode === 'pinned'
          ? 'relative flex h-full shrink-0 flex-col'
          : `absolute inset-y-0 ${side === 'right' ? 'right-0 border-l z-[85]' : 'left-0 border-r z-[55]'} flex flex-col bg-zinc-950 shadow-2xl motion-reduce:transition-none ${mode === 'open' ? 'visible translate-x-0 border-zinc-700 shadow-black/60 [transition:translate_225ms_ease-in-out,visibility_0s_linear_0s]' : `invisible ${side === 'right' ? 'translate-x-full' : '-translate-x-full'} border-seam shadow-transparent [transition:translate_225ms_ease-in-out,visibility_0s_linear_225ms]`}`}
        style={{ width, maxWidth: side === 'right' ? 'calc(100vw - 22px)' : mode === 'pinned' ? '34vw' : 'calc(100vw - 22px)' }}
      >
        {drawer}
      </aside>
    </StudioEntityDrawerContext.Provider>
  )

  return (
    <div className={`relative flex min-h-0 min-w-0 flex-1 ${side === 'right' ? 'flex-row-reverse' : ''}`} data-testid={side === 'right' ? 'agent-drawer-layout' : 'studio-drawer-layout'} data-drawer-mode={mode}>
      {enabled && (mode === 'pinned' ? (
        <>
          {drawerPane}
          {divider}
        </>
      ) : (
        <>
          <div key="tab" className={`h-full w-[22px] shrink-0 ${side === 'right' ? 'relative z-[85] border-l' : 'border-r'} border-seam bg-zinc-950/35`}>
            <button
              type="button"
              data-testid={side === 'right' ? 'agent-drawer-edge-tab' : 'studio-drawer-edge-tab'}
              aria-label={edgeLabel ?? `Open the ${label ?? `${definition.label} list`}`}
              aria-expanded={mode === 'open'}
              tabIndex={mode === 'open' ? -1 : 0}
              data-studio-space-preview="true"
              data-studio-drawer-owner={owner}
                    onPointerEnter={(event) => {
                apply({ type: 'pointer', inside: true })
                if (event.pointerType === 'touch' || event.buttons > 0 || pointerPressedRef.current || nativeDragRef.current || mode !== 'tucked') return
                hoverTimerRef.current = window.setTimeout(() => {
                  hoverTimerRef.current = null
                  if (!pointerPressedRef.current && !nativeDragRef.current && studioEntityDrawerMode(stateRef.current) === 'tucked') apply({ type: 'open', source: 'pointer' })
                }, HOVER_OPEN_DELAY_MS)
              }}
              onPointerLeave={() => apply({ type: 'pointer', inside: false })}
              onPointerUp={(event) => event.currentTarget.blur()}
              onClick={() => apply({ type: 'open', source: 'pointer' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.stopPropagation()
                  apply({ type: 'open', source: 'keyboard' })
                } else if (event.code === 'Space') {
                  event.stopPropagation()
                  if (claimStudioPreviewSpace(event.nativeEvent)) onPreviewSpace()
                }
              }}
              className={`flex h-full w-[22px] flex-col items-center gap-2 pt-2 text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-live/70 ${mode === 'open' ? 'pointer-events-none opacity-0' : ''}`}
            >
              {edgeContent ?? <><StudioPlaceIcon place={state.place} size={14} />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] [writing-mode:vertical-rl] rotate-180">{definition.label}</span>
              <ChevronRight size={12} aria-hidden /></>}
            </button>
          </div>
          {drawerPane}
        </>
      ))}
      <Fragment key="workspace">{side === 'right' ? <div className="flex min-h-0 min-w-0 flex-1">{children}</div> : children}</Fragment>
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  )
})
