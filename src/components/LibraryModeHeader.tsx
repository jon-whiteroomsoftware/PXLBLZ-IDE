import { Code2 } from 'lucide-react'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { useEditorStore } from '@/store/editorStore'
import { useLibraryStore } from '@/store/libraryStore'
import { usePatternStore } from '@/store/patternStore'
import { useRouterStore } from '@/store/routerStore'
import { useWorkspaceStore } from '@/store/workspaceStore'

export function LibraryModeHeader() {
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const isReadOnly = useEditorStore((s) => s.isReadOnly)
  const editingLibrary = useLibraryStore((s) => s.editingLibrary)
  const cloneStockLibrary = useLibraryStore((s) => s.cloneStockLibrary)
  const navigate = useRouterStore((s) => s.navigate)
  const personalWorkspaceAuthenticated = useWorkspaceStore((s) => s.personalWorkspaceAuthenticated)
  const name = activeLibraryName ?? 'Library'

  async function handleCloneStockLibrary(id: string) {
    const recordId = await cloneStockLibrary(id)
    if (recordId) navigate({ kind: 'studio', entity: { kind: 'libraries', id: recordId } })
  }

  return (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <Code2 size={14} aria-hidden className="shrink-0 text-zinc-500" />
        <span className="truncate text-zinc-200">{name}</span>
        <CompileStatusBadge />
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none">
          library
        </span>
        {isReadOnly && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none">
            read-only
          </span>
        )}
      </span>
      {editingLibrary?.kind === 'stock' && personalWorkspaceAuthenticated && (
        <button
          type="button"
          onClick={() => void handleCloneStockLibrary(editingLibrary.id)}
          title="Clone into Libraries"
          className="shrink-0 h-6 px-2 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-amber-400/80 transition-colors"
        >
          Clone
        </button>
      )}
    </>
  )
}
