import type * as monacoType from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { useMapStore } from '@/store/mapStore'
import { validateSource } from '@/engine/validate'
import { parseMapSource } from '@/engine/maps'
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
  const updatePatternSrc = usePatternStore((s) => s.updatePatternSrc)

  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoType | null>(null)
  const syncRef = useRef({ source, compileStatus, activePatternId, editorFlavor })
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep a ref current so the interval closure always reads the latest values
  useEffect(() => {
    syncRef.current = { source, compileStatus, activePatternId, editorFlavor }
  }, [source, compileStatus, activePatternId, editorFlavor])

  // Persistence tick: every SYNC_TICK_MS, auto-save the clean editor buffer to
      // D1. For a pattern that's clean source → the pattern record. For an open
  // map (flavor 'map'), a clean (parse-good) buffer is evaluated + baked into the
  // map record (#143) — once per tick, never per keystroke (a runaway
  // map loop would freeze the tab). Bake failures surface via the store.
  useEffect(() => {
    const id = setInterval(() => {
      const { source: s, compileStatus: status, activePatternId: pid, editorFlavor: flavor } = syncRef.current
      if (status !== 'good' || s === '') return
      if (flavor === 'map') void useMapStore.getState().bakeEditingMap()
      else if (pid) updatePatternSrc(pid, s)
    }, SYNC_TICK_MS)
    return () => clearInterval(id)
  }, [updatePatternSrc])

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

    // Read-only content (shipped demos, library files) is curated and valid — skip
    // validation, but mark the status 'good' so a stale 'broken' from a previously
    // open pattern doesn't linger and block Send-to-Controller for a demo (#208).
    if (isReadOnly) {
      monaco.editor.setModelMarkers(model, 'pixelblaze', [])
      setCompileStatus('good')
      return
    }

    // Map mode (#151) authors plain JS, so the badge is a parse-only
    // check (no Pixelblaze dialect rules); patterns keep the dialect validator.
    const errors = editorFlavor === 'map' ? parseMapSource(source) : validateSource(source)
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
