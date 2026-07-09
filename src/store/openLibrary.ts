import { LIBRARIES } from '@/pixelblaze/libs'
import { useDocsStore } from '@/store/docsStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore } from '@/store/mapStore'
import { useMixinStore } from '@/store/mixinStore'
import { usePatternStore } from '@/store/patternStore'

export function openStockLibrary(name: string): void {
  const src = LIBRARIES[name]
  if (!src) return
  useMapStore.getState().closeMapEditor()
  useMixinStore.getState().closeMixinEditor()
  useDocsStore.getState().closeDocs()
  usePatternStore.getState().setActiveLibrary(name)
  const editor = useEditorStore.getState()
  editor.setEditorFlavor('library')
  editor.setSource(src)
  editor.setIsReadOnly(true)
}
