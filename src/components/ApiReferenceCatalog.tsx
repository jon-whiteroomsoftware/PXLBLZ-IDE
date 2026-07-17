import { useEffect, useRef, type MouseEvent } from 'react'
import { Braces } from 'lucide-react'
import type { ApiReferenceDocument } from '@/engine/apiReferenceCatalog'
import { routePath } from '@/engine/routes'
import { useRouterStore } from '@/store/routerStore'

const GROUPS: Array<{ kind: ApiReferenceDocument['kind']; label: string }> = [
  { kind: 'builtin', label: 'Pixelblaze' },
  { kind: 'provided', label: 'Provided libraries' },
  { kind: 'personal', label: 'My libraries' },
]

export function ApiReferenceCatalog({
  documents,
  activeId,
}: {
  documents: ApiReferenceDocument[]
  activeId: string
}) {
  const navigate = useRouterStore((state) => state.navigate)
  const navRef = useRef<HTMLElement>(null)
  const activeLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const nav = navRef.current
    const activeLink = activeLinkRef.current
    if (!nav || !activeLink) return
    const navBounds = nav.getBoundingClientRect()
    const linkBounds = activeLink.getBoundingClientRect()
    if (linkBounds.top < navBounds.top) nav.scrollTop -= navBounds.top - linkBounds.top
    else if (linkBounds.bottom > navBounds.bottom) nav.scrollTop += linkBounds.bottom - navBounds.bottom
  }, [activeId])

  function openReference(event: MouseEvent<HTMLAnchorElement>, libraryId: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate({ kind: 'api-reference', libraryId })
  }

  return (
    <aside
      data-testid="api-reference-catalog"
      className="flex max-h-52 w-full shrink-0 flex-col border-b border-seam bg-panel/70 font-mono sm:h-full sm:max-h-none sm:w-72 sm:border-b-0 sm:border-r"
    >
      <div className="flex items-center gap-2 border-b border-seam px-3 py-2.5">
        <Braces size={15} aria-hidden className="text-zinc-500" />
        <h1 className="text-sm font-semibold text-zinc-200">API Reference</h1>
      </div>
      <nav ref={navRef} aria-label="API Reference" className="rail-list-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {GROUPS.map((group) => {
          const groupDocuments = documents.filter((document) => document.kind === group.kind)
          if (groupDocuments.length === 0) return null
          return (
            <section key={group.kind} aria-labelledby={`api-group-${group.kind}`} className="pb-1">
              <h2
                id={`api-group-${group.kind}`}
                className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-structural"
              >
                {group.label}
              </h2>
              {groupDocuments.map((document) => {
                const active = document.id === activeId
                return (
                  <a
                    key={document.id}
                    ref={active ? activeLinkRef : undefined}
                    href={routePath({ kind: 'api-reference', libraryId: document.id }, import.meta.env.BASE_URL)}
                    aria-current={active ? 'page' : undefined}
                    onClick={(event) => openReference(event, document.id)}
                    className={[
                      'group block border-l-2 px-3 py-2 transition-colors',
                      active
                        ? 'border-live bg-live/8 text-zinc-100'
                        : 'border-transparent text-zinc-400 hover:bg-zinc-900/65 hover:text-zinc-200',
                    ].join(' ')}
                  >
                    <span className="block text-xs font-medium">{document.name}</span>
                    <span className="mt-1 block font-sans text-[11px] leading-4 text-zinc-500 group-hover:text-zinc-400">
                      {document.summary}
                    </span>
                  </a>
                )
              })}
            </section>
          )
        })}
      </nav>
    </aside>
  )
}
