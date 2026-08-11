import type * as monacoType from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { flushPendingAutosave } from '@/store/autosaveSync'
import { validateLibraryContent } from '@/engine/bundle'
import { validateSource } from '@/engine/validate'
import { parseMapSource } from '@/engine/maps'
import { parseMixinHeader } from '@/engine/mixins'
import { PixelblazeCodeEditor } from '@/components/PixelblazeCodeEditor'

const SYNC_TICK_MS = 4000
const PREVIEW_DEBOUNCE_MS = 600

export function Editor() {
  const source = useEditorStore((s) => s.source)
  const isReadOnly = useEditorStore((s) => s.isReadOnly)
  const editorFlavor = useEditorStore((s) => s.editorFlavor)
  const setSource = useEditorStore((s) => s.setSource)
  const setCompileStatus = useEditorStore((s) => s.setCompileStatus)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const activePatternId = usePatternStore((s) => s.activePatternId)

  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoType | null>(null)
  const syncRef = useRef({ source, compileStatus, activePatternId, editorFlavor })
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep a ref current so the interval closure always reads the latest values
  useEffect(() => {
    syncRef.current = { source, compileStatus, activePatternId, editorFlavor }
  }, [source, compileStatus, activePatternId, editorFlavor])

  // Persistence tick: every SYNC_TICK_MS, auto-save the clean editor buffer to
  // D1 through the shared autosave pass (#810) — once per tick, never per
  // keystroke (a runaway map loop would freeze the tab). The same pass runs on
  // unmount so leaving the Studio surface doesn't drop the last partial tick;
  // the buffer-replacing open paths flush from their own seams. Bake and write
  // failures surface via the stores and the save-status glyph.
  useEffect(() => {
    const id = setInterval(flushPendingAutosave, SYNC_TICK_MS)
    return () => {
      clearInterval(id)
      flushPendingAutosave()
    }
  }, [])

  const handleMount = (editor: monacoType.editor.IStandaloneCodeEditor, monaco: typeof monacoType) => {
    editorRef.current = editor
    monacoRef.current = monaco
  }

  const handleChange = (value: string) => {
    setSource(value)
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      const { compileStatus: status, activePatternId: pid } = syncRef.current
      if (status === 'good' && pid) setPreviewSource(value)
    }, PREVIEW_DEBOUNCE_MS)
  }

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel()
    if (!model) return

    // Read-only demos are curated and valid — skip validation, but mark the status
    // 'good' so a stale 'broken' from a previously open pattern doesn't linger and
    // block Send-to-Controller for a demo (#208). Library mode still validates its
    // top-level content rule so the same badge path is ready for cloud libraries.
    if (isReadOnly && editorFlavor !== 'library') {
      monaco.editor.setModelMarkers(model, 'pixelblaze', [])
      setCompileStatus('good')
      return
    }

    // Map mode (#151) authors plain JS, so the badge is a parse-only
    // check. Mixin mode validates the structured pass header only: binding
    // placeholders are resolved where the mixin is used, not inside the source.
    const errors = editorFlavor === 'map'
      ? parseMapSource(source)
      : editorFlavor === 'mixin'
        ? parseMixinHeader(source)
        : editorFlavor === 'library'
          ? validateLibraryContent(source)
          : validateSource(source)
    setCompileStatus(errors.length === 0 ? 'good' : 'broken')

    monaco.editor.setModelMarkers(
      model,
      'pixelblaze',
      errors.map((err) => {
        const startColumn = err.column + 1
        const endColumn = Math.max(startColumn + 1, model.getLineMaxColumn(err.line))
        return {
          severity: monaco.MarkerSeverity.Error,
          message: err.message,
          startLineNumber: err.line,
          startColumn,
          endLineNumber: err.line,
          endColumn,
        }
      }),
    )
  }, [source, isReadOnly, editorFlavor, setCompileStatus])

  return (
    <PixelblazeCodeEditor
      value={source}
      flavor={editorFlavor}
      readOnly={isReadOnly}
      onMount={handleMount}
      onChange={handleChange}
    />
  )
}
