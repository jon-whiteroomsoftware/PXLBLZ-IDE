import { Code2, FileCode2 } from 'lucide-react'
import { parseLibraryApiReference, type LibraryApiReference } from '@/engine/libraryDocs'
import { LIBRARIES } from '@/pixelblaze/libs'
import { useEditorStore } from '@/store/editorStore'
import { useLibraryStore } from '@/store/libraryStore'
import { usePatternStore } from '@/store/patternStore'

function FactRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-900/80 py-1.5">
      <span className="text-zinc-500">{label}</span>
      <b className="min-w-0 truncate text-right font-mono text-[11px] font-semibold text-zinc-300">{value}</b>
    </div>
  )
}

function EmptyLibraryPane() {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950/40 px-6 font-mono">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-md border border-zinc-800 bg-panel text-zinc-500">
          <Code2 size={18} aria-hidden />
        </div>
        <h2 className="text-sm font-semibold text-zinc-300">No library selected</h2>
        <p className="mt-2 text-xs leading-5 text-zinc-500">Select one of your libraries or a built-in library from the rail.</p>
      </div>
    </div>
  )
}

function resolveOpenLibrary(
  editingLibrary: ReturnType<typeof useLibraryStore.getState>['editingLibrary'],
  userLibraries: ReturnType<typeof useLibraryStore.getState>['userLibraries'],
  activeLibraryName: string | null,
  source: string,
): { name: string; source: string; kind: 'stock' | 'cloud' } | null {
  if (editingLibrary?.kind === 'stock') {
    const stockSource = LIBRARIES[editingLibrary.id]
    if (!stockSource) return null
    return { name: editingLibrary.id, source: source || stockSource, kind: 'stock' }
  }
  if (editingLibrary?.kind === 'existing') {
    const record = userLibraries.find((library) => library.id === editingLibrary.id)
    if (!record) return null
    return { name: activeLibraryName ?? record.name, source: source || record.src, kind: 'cloud' }
  }
  return null
}

function ApiEntry({ namespace, fn }: { namespace: string; fn: LibraryApiReference['functions'][number] }) {
  const signature = `${namespace}.${fn.name}(${fn.params.join(', ')})`
  return (
    <div className="border-b border-zinc-900/80 py-2 last:border-b-0">
      <div className="font-mono text-xs leading-tight text-zinc-200">{signature}</div>
      <div className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
        {fn.doc || 'No doc comment.'}
      </div>
    </div>
  )
}

function ApiReference({ reference }: { reference: LibraryApiReference }) {
  if (reference.functions.length === 0) {
    return (
      <div className="mt-2 border border-dashed border-zinc-700/80 bg-zinc-950/25 px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
        No function declarations.
      </div>
    )
  }

  const documented = reference.functions.filter((fn) => fn.doc.length > 0)
  if (documented.length === 0) {
    return (
      <div className="mt-2 border border-dashed border-zinc-700/80 bg-zinc-950/25 px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
        No documented functions yet.
      </div>
    )
  }

  return (
    <div className="mt-2 divide-y divide-zinc-900/80">
      {reference.functions.map((fn) => (
        <ApiEntry key={fn.name} namespace={reference.namespace} fn={fn} />
      ))}
    </div>
  )
}

export function LibraryContextPane() {
  const source = useEditorStore((s) => s.source)
  const editingLibrary = useLibraryStore((s) => s.editingLibrary)
  const userLibraries = useLibraryStore((s) => s.userLibraries)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const openLibrary = resolveOpenLibrary(editingLibrary, userLibraries, activeLibraryName, source)

  if (!openLibrary) return <EmptyLibraryPane />

  const reference = parseLibraryApiReference(openLibrary.name, openLibrary.source, Object.keys(LIBRARIES))
  const outVars = reference.outVars.length ? reference.outVars.join(', ') : '-'
  const stockCalls = reference.referencedStockLibraries.length ? reference.referencedStockLibraries.join(', ') : '-'

  return (
    <div className="flex h-full flex-col border-l border-seam bg-panel/70">
      <div className="border-b border-seam px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <FileCode2 size={14} className="text-zinc-500" aria-hidden />
          <span className="truncate">{openLibrary.name}</span>
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wide text-structural">
          {openLibrary.kind} library
        </div>
      </div>

      <div className="rail-list-scroll flex-1 overflow-y-auto px-3 py-3 text-xs">
        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">API Reference</h3>
          <ApiReference reference={reference} />
        </section>

        <section className="mt-5">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">Facts</h3>
          <div className="mt-2 text-[11px]">
            <FactRow label="functions" value={reference.functions.length} />
            <FactRow label="out-vars" value={outVars} />
            <FactRow label="stock calls" value={stockCalls} />
          </div>
        </section>
      </div>
    </div>
  )
}
