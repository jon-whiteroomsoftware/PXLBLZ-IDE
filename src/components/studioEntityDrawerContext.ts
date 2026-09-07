import { createContext, useContext } from 'react'

export const STUDIO_ENTITY_DRAWER_OWNER = 'studio-entity-list'

export interface StudioEntityDrawerControls {
  pinned: boolean
  pinDisabled: boolean
  timerArmed: boolean
  setPinned: (pinned: boolean) => void
  close: () => void
}

export const StudioEntityDrawerContext = createContext<StudioEntityDrawerControls | null>(null)

export function useStudioEntityDrawerControls(): StudioEntityDrawerControls | null {
  return useContext(StudioEntityDrawerContext)
}

export const studioEntityDrawerOwnedSurfaceProps = {
  'data-studio-drawer-owner': STUDIO_ENTITY_DRAWER_OWNER,
} as const

export function studioEntityDrawerBusySurfaceProps(kind: 'drag' | 'field' | 'menu' | 'dialog') {
  return {
    ...studioEntityDrawerOwnedSurfaceProps,
    'data-studio-drawer-busy': 'true',
    'data-studio-drawer-busy-kind': kind,
  } as const
}
