import type { ReactNode } from 'react'
import { DeckSection } from './Deck'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { panelSectionKey } from '@/engine/previewPanel'
import { showStripSectionDefault } from '@/engine/showStripPanel'

export function useShowStripSection(label: string): [boolean, (value: boolean) => void] {
  const key = panelSectionKey('show-strip', label)
  const expanded = usePanelPreferencesStore(state => state.expanded[key] ?? showStripSectionDefault(label))
  const setExpanded = usePanelPreferencesStore(state => state.setExpanded)
  return [expanded, value => setExpanded(key, value)]
}

export function ShowStripSection({ label, summary, actions, children }: { label: string; summary?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const [expanded, setExpanded] = useShowStripSection(label)
  return <DeckSection previewSpace label={label} summaryRow collapsible expanded={expanded} onExpandedChange={setExpanded} summary={summary} actions={actions}>{children}</DeckSection>
}
