import { usePatternStore, type PatternRecord } from './patternStore'
import { useEditorStore } from './editorStore'
import { useMapStore } from './mapStore'
import { useMixinStore } from './mixinStore'
import { useDocsStore } from './docsStore'
import { useLibraryStore } from './libraryStore'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { validateSource } from '@/engine/validate'

// The full open-a-user-pattern sequence (active id + editor + preview), shared
// by the rail click path and the route application path (#308) so a deep link
// lands in exactly the state a rail click produces.
export function openPatternRecord(record: PatternRecord): void {
  useMapStore.getState().closeMapEditor()
  useMixinStore.getState().closeMixinEditor()
  useLibraryStore.getState().closeLibraryEditor()
  useDocsStore.getState().closeDocs()
  usePatternStore.getState().setActivePattern(record.id)
  const editor = useEditorStore.getState()
  editor.setEditorFlavor('pattern')
  editor.setSource(record.src)
  const sourceErrors = validateSource(record.src)
  editor.setCompileStatus(sourceErrors.length === 0 ? 'good' : 'broken')
  if (record.src === '') editor.setPreviewUnavailable('empty-source')
  else if (sourceErrors.length > 0) editor.setPreviewUnavailable('broken-source')
  else editor.setPreviewSource(record.src)
  editor.setPreviewPatternName(record.name)
  editor.setIsReadOnly(false)
}

export function openDemoPattern(name: string, options: { rememberLastActive?: boolean } = {}): void {
  const src = DEMOS[name]
  if (!src) return
  useMapStore.getState().closeMapEditor()
  useMixinStore.getState().closeMixinEditor()
  useLibraryStore.getState().closeLibraryEditor()
  useDocsStore.getState().closeDocs()
  if (options.rememberLastActive === false) {
    usePatternStore.setState({
      activeDemoName: name,
      activeLibraryName: null,
      activePatternId: null,
    })
  } else {
    usePatternStore.getState().setActiveDemo(name)
  }
  const editor = useEditorStore.getState()
  editor.setEditorFlavor('pattern')
  editor.setSource(src)
  editor.setCompileStatus('good')
  editor.setPreviewSource(src)
  editor.setPreviewPatternName(name)
  editor.setIsReadOnly(true)
}
