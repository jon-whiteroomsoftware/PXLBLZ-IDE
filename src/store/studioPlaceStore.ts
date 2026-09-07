import { create } from 'zustand'
import type { StudioEntityKind } from '@/engine/routes'

export type RememberedStudioPlaces = Record<StudioEntityKind, string | null>

export const EMPTY_REMEMBERED_STUDIO_PLACES: RememberedStudioPlaces = {
  patterns: null,
  shows: null,
  maps: null,
  controllers: null,
  mixins: null,
  libraries: null,
}

interface StudioPlaceState {
  remembered: RememberedStudioPlaces
  remember: (kind: StudioEntityKind, id: string) => void
}

export const useStudioPlaceStore = create<StudioPlaceState>()((set) => ({
  remembered: EMPTY_REMEMBERED_STUDIO_PLACES,
  remember: (kind, id) => set((state) => (
    state.remembered[kind] === id
      ? state
      : { remembered: { ...state.remembered, [kind]: id } }
  )),
}))
