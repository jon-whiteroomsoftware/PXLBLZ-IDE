import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { panelSectionDefault, panelSectionKey } from '@/engine/previewPanel'

interface PanelPreferences {
  expanded: Record<string, boolean>
  overlays: Record<string, boolean>
  setExpanded: (key: string, expanded: boolean) => void
  setOverlay: (mode: string, enabled: boolean) => void
}
export const usePanelPreferencesStore = create<PanelPreferences>()(persist((set) => ({
  expanded: {}, overlays: {},
  setExpanded: (key, value) => set(s => ({ expanded: { ...s.expanded, [key]: value } })),
  setOverlay: (mode, value) => set(s => ({ overlays: { ...s.overlays, [mode]: value } })),
}), { name: 'pxlblz-panel-preferences', partialize: s => ({ expanded: s.expanded, overlays: s.overlays }) }))
export function usePanelSection(mode: string, section: string): [boolean, (value: boolean) => void] {
  const key = panelSectionKey(mode, section)
  const expanded = usePanelPreferencesStore(s => s.expanded[key] ?? panelSectionDefault(section))
  const setExpanded = usePanelPreferencesStore(s => s.setExpanded)
  return [expanded, value => setExpanded(key, value)]
}
