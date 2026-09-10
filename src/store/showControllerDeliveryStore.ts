import { create } from 'zustand'
import type { ControllerActionSubject } from '@/engine/controllerActionRow'
import type { SendMode } from '@/engine/sendToController'
import type { PreflightWarning } from '@/engine/preflight'

/** Volatile capability published by the mounted Show editor, never persisted. */
export interface ShowControllerDelivery {
  subject: ControllerActionSubject
  mode: SendMode
  pushing: boolean
  succeeded: boolean
  pending: boolean
  warnings: PreflightWarning[]
  blocked: boolean
  request: (mode: SendMode) => void
  confirm: () => Promise<void>
  cancel: () => void
}

interface ShowControllerDeliveryState {
  owner: symbol | null
  delivery: ShowControllerDelivery | null
  publish: (owner: symbol, delivery: ShowControllerDelivery) => void
  retire: (owner: symbol) => void
}

export const useShowControllerDeliveryStore = create<ShowControllerDeliveryState>((set) => ({
  owner: null,
  delivery: null,
  publish: (owner, delivery) => set({ owner, delivery }),
  retire: (owner) => set((state) => state.owner === owner ? { owner: null, delivery: null } : state),
}))
