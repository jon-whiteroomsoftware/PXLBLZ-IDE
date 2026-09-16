import { showV2GroupOccurrenceEditorFixture } from './showV2GroupOccurrenceEditorFixture'
/** Thirty-one-second continuous shared runtime and a held Group spanning a switch. */
export function showV2LayoutEditorFixture() {
  const fixture = showV2GroupOccurrenceEditorFixture()
  const { record } = fixture
  record.id = 'layout-editor-fixture'; record.name = 'Layout coverage'
  record.composition.groupDefinitions[0].transitions = []
  const first = record.composition.layoutOccurrences[0]
  first.durationMs = 5000
  record.composition.layoutOccurrences.push({ ...structuredClone(first), id: 'later-layout', startMs: 5000, durationMs: 26000 })
  record.zoneLayouts.push({ ...structuredClone(record.zoneLayouts[0]), id: 'alternate-layout', name: 'Alternate' })
  return fixture
}
