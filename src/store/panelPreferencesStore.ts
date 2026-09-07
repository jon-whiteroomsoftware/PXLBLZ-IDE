import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { panelSectionDefault, panelSectionKey } from '@/engine/previewPanel'

interface PanelPreferences {
  expanded: Record<string, boolean>
  setExpanded: (key: string, expanded: boolean) => void
}
export const usePanelPreferencesStore = create<PanelPreferences>()(persist((set) => ({
  expanded: {},
  setExpanded: (key, value) => set(s => ({ expanded: { ...s.expanded, [key]: value } })),
}), { name: 'pxlblz-panel-preferences', partialize: s => ({ expanded: s.expanded }) }))
export function usePanelSection(mode: string, section: string): [boolean, (value: boolean) => void] {
  const key = panelSectionKey(mode, section)
  const expanded = usePanelPreferencesStore(s => s.expanded[key] ?? panelSectionDefault(section))
  const setExpanded = usePanelPreferencesStore(s => s.setExpanded)
  return [expanded, value => setExpanded(key, value)]
}
