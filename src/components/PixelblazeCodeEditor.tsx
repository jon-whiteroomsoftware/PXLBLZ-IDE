import MonacoEditor, { BeforeMount, OnChange, OnMount } from '@monaco-editor/react'
import type * as monacoType from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { registerPixelblazeLanguage, PIXELBLAZE_LANG_ID } from './monaco/pixelblazeLanguage'

type PixelblazeCodeEditorProps = {
  value: string
  readOnly?: boolean
  flavor?: 'pattern' | 'map'
  onChange?: (value: string) => void
  onMount?: (editor: monacoType.editor.IStandaloneCodeEditor, monaco: typeof monacoType) => void
}

// Upper bound on lines we synchronously tokenize on a source swap (see effect).
const FORCE_TOKENIZE_LINE_CAP = 2000

// Synchronously tokenize the model up to the cap so syntax colors are present
// before Monaco's next paint, avoiding a flash of plain (white) text. Pattern
// and library files are small; any lines past the cap tokenize lazily on scroll.
// `tokenization.forceTokenization` is a real runtime API but not part of
// monaco's public ITextModel type surface, so reach for it through a cast.
function forceTokenizeModel(model: monacoType.editor.ITextModel | null): void {
  if (!model) return
  const target = Math.min(model.getLineCount(), FORCE_TOKENIZE_LINE_CAP)
  if (target <= 0) return
  const tokenization = (model as unknown as { tokenization?: { forceTokenization?: (line: number) => void } })
    .tokenization
  tokenization?.forceTokenization?.(target)
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14.3,
  lineHeight: 22,
  fontFamily: "'IBM Plex Mono', 'Cascadia Code', 'Fira Code', monospace",
  fontLigatures: true,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  wrappingIndent: 'same' as const,
  renderLineHighlight: 'all' as const,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  padding: { top: 12, bottom: 12 },
}

export function PixelblazeCodeEditor({
  value,
  readOnly = false,
  flavor = 'pattern',
  onChange,
  onMount,
}: PixelblazeCodeEditorProps) {
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)

  const handleBeforeMount: BeforeMount = (monaco) => {
    registerPixelblazeLanguage(monaco)
    // Map mode uses Monaco's built-in `javascript` language for syntax coloring,
    // but a map source is a bare `function(pixelCount){…}` expression — not a
    // valid top-level statement/module — so Monaco's TS worker flags it with a
    // spurious "unexpected identifier" squiggle. We feed our own parse-only markers
    // (owner 'pixelblaze'), so disable the worker's diagnostics entirely.
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true,
    })
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    // On first load the source is often set before Monaco finishes mounting, so
    // the [value] effect below ran with no editor yet. Tokenize the initial
    // content here, before the editor's first paint, to avoid the white flash.
    forceTokenizeModel(editor.getModel())
    onMount?.(editor, monaco)
  }

  // When the source swaps (switching patterns/libraries) @monaco-editor/react
  // applies the new value via executeEdits and Monaco repaints on its next
  // animation frame. Background tokenization is async, so that first paint would
  // show plain (white) text before syntax colors land. This effect runs after
  // the child's value-applying effect (child effects fire before parent
  // effects), so the model already holds the new text — we force it to tokenize
  // synchronously, before Monaco paints. (First-load content, set before mount,
  // is handled in handleMount instead.)
  useEffect(() => {
    forceTokenizeModel(editorRef.current?.getModel() ?? null)
  }, [value])

  const handleChange: OnChange = (nextValue) => {
    if (nextValue === undefined) return
    onChange?.(nextValue)
  }

  return (
    <MonacoEditor
      height="100%"
      language={flavor === 'map' ? 'javascript' : PIXELBLAZE_LANG_ID}
      theme="pixelblaze-dark"
      value={value}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={handleChange}
      options={{ ...EDITOR_OPTIONS, readOnly, domReadOnly: readOnly }}
    />
  )
}
