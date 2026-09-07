import type { StudioEntityKind } from './routes'

export type StudioEntityDrawerMode = 'pinned' | 'tucked' | 'open'
export type StudioEntityDrawerOpenSource = 'pointer' | 'keyboard' | 'place-selection'
export type StudioEntityDrawerCloseReason = 'entity-chosen' | 'escape' | 'outside' | 'timer' | 'button'
export type StudioEntityDrawerBusyKind = 'drag' | 'field' | 'menu' | 'dialog'

export type StudioEntityDrawerPinPreferences = Partial<Record<StudioEntityKind, boolean>>

export interface StudioEntityDrawerState {
  place: StudioEntityKind
  pinPreferences: StudioEntityDrawerPinPreferences
  narrow: boolean
  open: boolean
  openSource: StudioEntityDrawerOpenSource | null
  pointerInside: boolean
  busy: StudioEntityDrawerBusyKind[]
  timerArmed: boolean
}

export type StudioEntityDrawerEvent =
  | { type: 'set-place'; place: StudioEntityKind; openAfterSelection?: boolean }
  | { type: 'set-pin-preferences'; pinPreferences: StudioEntityDrawerPinPreferences }
  | { type: 'set-narrow'; narrow: boolean }
  | { type: 'set-pinned'; pinned: boolean }
  | { type: 'open'; source: StudioEntityDrawerOpenSource }
  | { type: 'close'; reason: StudioEntityDrawerCloseReason }
  | { type: 'pointer'; inside: boolean }
  | { type: 'set-busy'; kind: StudioEntityDrawerBusyKind; active: boolean }
  | { type: 'timer-elapsed' }

export interface StudioEntityDrawerTransition {
  state: StudioEntityDrawerState
  announce?: string
  focus?: 'list' | 'restore'
  closeBlocked?: boolean
}

export function createStudioEntityDrawerState(
  place: StudioEntityKind,
  pinPreferences: StudioEntityDrawerPinPreferences = {},
  narrow = false,
): StudioEntityDrawerState {
  return {
    place,
    pinPreferences,
    narrow,
    open: false,
    openSource: null,
    pointerInside: true,
    busy: [],
    timerArmed: false,
  }
}

export function studioEntityDrawerIsPinned(state: StudioEntityDrawerState): boolean {
  return !state.narrow && state.pinPreferences[state.place] !== false
}

export function studioEntityDrawerMode(state: StudioEntityDrawerState): StudioEntityDrawerMode {
  if (studioEntityDrawerIsPinned(state)) return 'pinned'
  return state.open ? 'open' : 'tucked'
}

export function studioEntityDrawerTimerEligible(state: StudioEntityDrawerState): boolean {
  return studioEntityDrawerMode(state) === 'open'
    && state.openSource !== 'keyboard'
    && state.busy.length === 0
}

export function transitionStudioEntityDrawer(
  state: StudioEntityDrawerState,
  event: StudioEntityDrawerEvent,
): StudioEntityDrawerTransition {
  switch (event.type) {
    case 'set-place': {
      if (event.place === state.place && !event.openAfterSelection) return { state }
      const next = {
        ...state,
        place: event.place,
        open: false,
        openSource: null,
        timerArmed: false,
        busy: [],
      }
      if (!event.openAfterSelection || studioEntityDrawerIsPinned(next)) return { state: next }
      return openDrawer(next, 'place-selection')
    }
    case 'set-pin-preferences': {
      const next = { ...state, pinPreferences: event.pinPreferences }
      return studioEntityDrawerIsPinned(next)
        ? { state: closeWithoutEffects(next) }
        : { state: next }
    }
    case 'set-narrow': {
      if (event.narrow === state.narrow) return { state }
      const next = { ...state, narrow: event.narrow, timerArmed: false }
      return studioEntityDrawerIsPinned(next)
        ? { state: closeWithoutEffects(next) }
        : { state: { ...next, open: false, openSource: null, busy: [] } }
    }
    case 'set-pinned': {
      const next = {
        ...state,
        pinPreferences: { ...state.pinPreferences, [state.place]: event.pinned },
        open: false,
        openSource: null,
        busy: [],
        timerArmed: false,
      }
      return { state: next, announce: `${placeLabel(state.place)} list ${event.pinned ? 'pinned' : 'unpinned'}` }
    }
    case 'open':
      return openDrawer(state, event.source)
    case 'close':
      return closeDrawer(state, event.reason)
    case 'pointer': {
      const next = { ...state, pointerInside: event.inside }
      return {
        state: {
          ...next,
          timerArmed: !event.inside && studioEntityDrawerTimerEligible(next),
        },
      }
    }
    case 'set-busy': {
      const busy = event.active
        ? uniqueBusy([...state.busy, event.kind])
        : state.busy.filter((kind) => kind !== event.kind)
      const next = { ...state, busy, timerArmed: false }
      return {
        state: {
          ...next,
          timerArmed: !next.pointerInside && studioEntityDrawerTimerEligible(next),
        },
      }
    }
    case 'timer-elapsed':
      return state.timerArmed ? closeDrawer(state, 'timer') : { state }
  }
}

function openDrawer(
  state: StudioEntityDrawerState,
  source: StudioEntityDrawerOpenSource,
): StudioEntityDrawerTransition {
  if (studioEntityDrawerIsPinned(state) || state.open) return { state }
  return {
    state: { ...state, open: true, openSource: source, timerArmed: false },
    announce: `${placeLabel(state.place)} list open`,
    ...(source === 'keyboard' ? { focus: 'list' as const } : {}),
  }
}

function closeDrawer(
  state: StudioEntityDrawerState,
  reason: StudioEntityDrawerCloseReason,
): StudioEntityDrawerTransition {
  if (studioEntityDrawerMode(state) !== 'open') return { state }
  if (state.busy.length > 0 && (reason === 'outside' || reason === 'timer' || reason === 'escape')) {
    return { state: { ...state, timerArmed: false }, closeBlocked: true }
  }
  const restore = state.openSource === 'keyboard'
  return {
    state: closeWithoutEffects(state),
    announce: `${placeLabel(state.place)} list closed`,
    ...(restore ? { focus: 'restore' as const } : {}),
  }
}

function closeWithoutEffects(state: StudioEntityDrawerState): StudioEntityDrawerState {
  return { ...state, open: false, openSource: null, timerArmed: false, busy: [] }
}

function uniqueBusy(kinds: StudioEntityDrawerBusyKind[]): StudioEntityDrawerBusyKind[] {
  return [...new Set(kinds)]
}

function placeLabel(place: StudioEntityKind): string {
  return place[0].toLocaleUpperCase() + place.slice(1)
}
