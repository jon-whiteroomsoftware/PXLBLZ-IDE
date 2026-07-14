import { BookOpen, Braces } from 'lucide-react'
import { useReferenceNavigationStore } from '@/store/referenceNavigationStore'
import { useRouterStore } from '@/store/routerStore'

function ReferenceButton({
  label,
  active,
  icon,
  onClick,
}: {
  label: string
  active: boolean
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={active ? `Return from ${label}` : `Open ${label}`}
      onClick={onClick}
      className={[
        'inline-flex h-6 items-center gap-1.5 rounded border px-2 font-mono text-xs transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-live/60',
        active
          ? 'border-live/60 bg-live/10 text-live'
          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100',
      ].join(' ')}
    >
      {icon}
      <span className="hidden min-[720px]:inline">{label}</span>
    </button>
  )
}

export function ReferenceButtons() {
  const routeKind = useRouterStore((state) => state.route.kind)
  const toggleDocs = useReferenceNavigationStore((state) => state.toggleDocs)
  const toggleApi = useReferenceNavigationStore((state) => state.toggleApi)

  return (
    <div className="flex items-center gap-2">
      <ReferenceButton
        label="Docs"
        active={routeKind === 'docs'}
        icon={<BookOpen size={14} aria-hidden className="shrink-0 text-zinc-400" />}
        onClick={toggleDocs}
      />
      <ReferenceButton
        label="API"
        active={routeKind === 'api-reference'}
        icon={<Braces size={14} aria-hidden className="shrink-0 text-zinc-400" />}
        onClick={toggleApi}
      />
    </div>
  )
}
