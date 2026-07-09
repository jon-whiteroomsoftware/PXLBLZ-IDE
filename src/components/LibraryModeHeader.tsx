import { Code2 } from 'lucide-react'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'

export function LibraryModeHeader() {
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const isReadOnly = useEditorStore((s) => s.isReadOnly)
  const name = activeLibraryName ?? 'Library'

  return (
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
  )
}
