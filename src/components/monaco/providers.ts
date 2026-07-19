import type * as monacoType from 'monaco-editor'
import { BUILTIN_FUNCTIONS, BUILTIN_CONSTANTS, resolveSignatureContext } from '@/engine/builtins'
import { buildLibraryDocIndex, type LibraryDocIndex } from '@/engine/libraryDocs'
import { compileLibraries } from '@/engine/libraries'
import { LIBRARIES } from '@/pixelblaze/libs'
import { useLibraryStore } from '@/store/libraryStore'
import { PIXELBLAZE_LANG_ID } from './pixelblazeLanguage'

interface HoverContent {
  signature: string
  doc: string
}

export function registerProviders(monaco: typeof monacoType): void {
  registerCompletion(monaco)
  registerSignatureHelp(monaco)
  registerHover(monaco)
}

function registerCompletion(monaco: typeof monacoType): void {
  monaco.languages.registerCompletionItemProvider(PIXELBLAZE_LANG_ID, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range: monacoType.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const fnItems = BUILTIN_FUNCTIONS.map((fn) => {
        const hasParams = fn.params.length > 0
        const snippetBody = hasParams
          ? `${fn.name}(${fn.params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})$0`
          : `${fn.name}()`
        return {
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: snippetBody,
          insertTextRules: hasParams
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          documentation: fn.doc ? { value: fn.doc } : undefined,
          range,
        }
      })

      const constItems = BUILTIN_CONSTANTS.map((c) => ({
        label: c.name,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: c.name,
        documentation: c.doc ? { value: c.doc } : undefined,
        range,
      }))

      return { suggestions: [...fnItems, ...constItems] }
    },
  })
}

function registerSignatureHelp(monaco: typeof monacoType): void {
  monaco.languages.registerSignatureHelpProvider(PIXELBLAZE_LANG_ID, {
    signatureHelpTriggerCharacters: ['('],
    signatureHelpRetriggerCharacters: [','],

    provideSignatureHelp(model, position): monacoType.languages.SignatureHelpResult | null {
      const line = model.getLineContent(position.lineNumber)
      const ctx = resolveSignatureContext(line, position.column - 1)
      if (!ctx) return null

      const fn = BUILTIN_FUNCTIONS.find((f) => f.name === ctx.fnName)
      if (!fn || fn.params.length === 0) return null

      const label = `${fn.name}(${fn.params.join(', ')})`
      const parameters = fn.params.map((p) => ({ label: p }))

      return {
        value: {
          signatures: [{ label, parameters, documentation: fn.doc ? { value: fn.doc } : undefined }],
          activeSignature: 0,
          activeParameter: Math.min(ctx.activeParam, fn.params.length - 1),
        },
        dispose() {},
      }
    },
  })
}

function registerHover(monaco: typeof monacoType): void {
  monaco.languages.registerHoverProvider(PIXELBLAZE_LANG_ID, {
    provideHover(model, position): monacoType.languages.Hover | null {
      const word = model.getWordAtPosition(position)
      if (!word) return null

      const lineContent = model.getLineContent(position.lineNumber)
      const content = resolvePixelblazeHover(
        lineContent,
        word.startColumn,
        word.word,
        currentLibraryDocIndex(),
      )
      return content ? hoverCard(content.signature, content.doc) : null
    },
  })
}

function currentLibraryDocIndex(): LibraryDocIndex {
  return buildLibraryDocIndex(compileLibraries(LIBRARIES, useLibraryStore.getState().userLibraries))
}

export function resolvePixelblazeHover(
  lineContent: string,
  wordStartColumn: number,
  word: string,
  libraryDocs: LibraryDocIndex,
): HoverContent | null {
  const charBefore = lineContent[wordStartColumn - 2]

  if (charBefore === '.') {
    const beforeDot = lineContent.slice(0, wordStartColumn - 2)
    const inlineMatch = beforeDot.match(/(\w+)\.inline$/)
    if (inlineMatch) {
      const namespace = inlineMatch[1]
      const fnDoc = libraryDocs[namespace]?.[word]
      if (!fnDoc?.inlineEligible) return null
      return {
        signature: `${namespace}.inline.${word}(${fnDoc.params.join(', ')})`,
        doc: fnDoc.doc,
      }
    }
    const nsMatch = beforeDot.match(/(\w+)$/)
    if (!nsMatch) return null
    const namespace = nsMatch[1]
    const fnDoc = libraryDocs[namespace]?.[word]
    if (!fnDoc) return null
    return {
      signature: `${namespace}.${word}(${fnDoc.params.join(', ')})`,
      doc: fnDoc.doc,
    }
  }

  const fn = BUILTIN_FUNCTIONS.find((candidate) => candidate.name === word)
  if (fn) return { signature: `${fn.name}(${fn.params.join(', ')})`, doc: fn.doc }

  const constant = BUILTIN_CONSTANTS.find((candidate) => candidate.name === word)
  if (constant) return { signature: constant.name, doc: constant.doc }

  return null
}

function hoverCard(signature: string, doc: string): monacoType.languages.Hover {
  const contents: monacoType.IMarkdownString[] = [
    { value: `\`\`\`javascript\n${signature}\n\`\`\`` },
  ]
  if (doc) contents.push({ value: doc })
  return { contents }
}
