import { useEditorStore } from '@/store/editorStore'

export function CompileStatusBadge() {
  const status = useEditorStore((s) => s.compileStatus)

  return (
    <span
      data-testid="compile-status"
      data-status={status}
      className={`w-2 h-2 rounded-full shrink-0 ${status === 'good' ? 'bg-emerald-400' : 'bg-red-400'}`}
    />
  )
}
