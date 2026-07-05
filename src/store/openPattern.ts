import { usePatternStore, type PatternRecord } from './patternStore'
import { useEditorStore } from './editorStore'
import { useMapStore } from './mapStore'

// The full open-a-user-pattern sequence (active id + editor + preview), shared
// by the rail click path and the route application path (#308) so a deep link
// lands in exactly the state a rail click produces.
export function openPatternRecord(record: PatternRecord): void {
  useMapStore.getState().closeMapEditor()
  usePatternStore.getState().setActivePattern(record.id)
  const editor = useEditorStore.getState()
  editor.setSource(record.src)
  editor.setPreviewSource(record.src)
  editor.setPreviewPatternName(record.name)
  editor.setIsReadOnly(false)
}
