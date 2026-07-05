import { create } from 'zustand'

export type ControlValue = number | [number, number, number]

interface ControlState {
  controlValues: Record<string, ControlValue>
  nextResetOverride: Record<string, ControlValue> | null
  setControlValue: (name: string, value: ControlValue) => void
  resetControls: (defaults: Record<string, ControlValue>) => void
  preserveForNextReset: (values: Record<string, ControlValue>) => void
}

export const controlInitialState = {
  controlValues: {} as Record<string, ControlValue>,
  nextResetOverride: null as Record<string, ControlValue> | null,
}

export const useControlStore = create<ControlState>()((set) => ({
  ...controlInitialState,
  setControlValue: (name, value) =>
    set((s) => ({ controlValues: { ...s.controlValues, [name]: value } })),
  resetControls: (defaults) =>
    set((s) => ({
      controlValues: { ...defaults, ...(s.nextResetOverride ?? {}) },
      nextResetOverride: null,
    })),
  preserveForNextReset: (values) => set({ nextResetOverride: { ...values } }),
}))
