import { ArrowLeft, BookOpen, Braces } from 'lucide-react'
import { controlIcon } from '@/components/iconScale'
import type { Route } from '@/engine/routes'
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

function returnDestinationLabel(route: Route | null): string {
  if (!route) return 'Gallery'
  if (route.kind === 'studio' || route.kind === 'studio-welcome') return 'Studio'
  if (route.kind === 'pattern-detail') return 'Pattern'
  return 'Gallery'
}

export function ReferenceButtons() {
  const routeKind = useRouterStore((state) => state.route.kind)
  const returnRoute = useReferenceNavigationStore((state) => state.returnRoute)
  const returnToOrigin = useReferenceNavigationStore((state) => state.returnToOrigin)
  const toggleDocs = useReferenceNavigationStore((state) => state.toggleDocs)
  const toggleApi = useReferenceNavigationStore((state) => state.toggleApi)
  const isReferenceRoute = routeKind === 'docs' || routeKind === 'api-reference'
  const backLabel = `Back to ${returnDestinationLabel(returnRoute)}`

  return (
    <div className="flex items-center gap-2">
      {isReferenceRoute && (
        <button
          type="button"
          aria-label={backLabel}
          title={backLabel}
          onClick={returnToOrigin}
          className="inline-flex h-6 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-zinc-300 transition-colors select-none hover:border-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-live/60"
        >
          <ArrowLeft {...controlIcon} aria-hidden className="shrink-0 text-current" />
          <span>Back</span>
        </button>
      )}
      <ReferenceButton
        label="Docs"
        active={routeKind === 'docs'}
        icon={<BookOpen {...controlIcon} aria-hidden className="shrink-0 text-current" />}
        onClick={toggleDocs}
      />
      <ReferenceButton
        label="API"
        active={routeKind === 'api-reference'}
        icon={<Braces {...controlIcon} aria-hidden className="shrink-0 text-current" />}
        onClick={toggleApi}
      />
    </div>
  )
}
