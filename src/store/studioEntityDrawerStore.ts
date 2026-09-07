import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StudioEntityKind } from '@/engine/routes'
import type { StudioEntityDrawerPinPreferences } from '@/engine/studioEntityDrawer'

const STUDIO_ENTITY_KINDS: StudioEntityKind[] = [
  'patterns',
  'shows',
  'maps',
  'controllers',
  'mixins',
  'libraries',
]

interface StudioEntityDrawerStoreState {
  pinPreferences: StudioEntityDrawerPinPreferences
  setPinned: (place: StudioEntityKind, pinned: boolean) => void
}

export function sanitizeStudioEntityDrawerPinPreferences(value: unknown): StudioEntityDrawerPinPreferences {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(STUDIO_ENTITY_KINDS.flatMap((kind) => (
    typeof (value as Record<string, unknown>)[kind] === 'boolean'
      ? [[kind, (value as Record<string, boolean>)[kind]]]
      : []
  )))
}

export const useStudioEntityDrawerStore = create<StudioEntityDrawerStoreState>()(
  persist(
    (set) => ({
      pinPreferences: {},
      setPinned: (place, pinned) => set((state) => ({
        pinPreferences: { ...state.pinPreferences, [place]: pinned },
      })),
    }),
    {
      name: 'pxlblz-studio-entity-drawer',
      partialize: (state) => ({ pinPreferences: state.pinPreferences }),
      merge: (persisted, current) => ({
        ...current,
        pinPreferences: sanitizeStudioEntityDrawerPinPreferences(
          (persisted as { pinPreferences?: unknown } | null)?.pinPreferences,
        ),
      }),
    },
  ),
)
