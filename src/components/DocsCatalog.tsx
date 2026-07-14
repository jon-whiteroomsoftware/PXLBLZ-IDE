import { useEffect, useRef, type MouseEvent } from 'react'
import { BookOpen, Bug, ExternalLink } from 'lucide-react'
import { USER_DOCS, docExternalHref, type DocId } from '@/docs/catalog'
import { useRouterStore } from '@/store/routerStore'

export function DocsCatalog({ activeDocId }: { activeDocId: DocId }) {
  const navigate = useRouterStore((state) => state.navigate)
  const navRef = useRef<HTMLElement>(null)
  const activeLinkRef = useRef<HTMLAnchorElement>(null)
  const activeDoc = USER_DOCS.find((doc) => doc.id === activeDocId)!
  const sourcePath = activeDoc.path.split('/').map(encodeURIComponent).join('/')

  useEffect(() => {
    const nav = navRef.current
    const activeLink = activeLinkRef.current
    if (!nav || !activeLink) return
    const navBounds = nav.getBoundingClientRect()
    const linkBounds = activeLink.getBoundingClientRect()
    if (linkBounds.top < navBounds.top) nav.scrollTop -= navBounds.top - linkBounds.top
    else if (linkBounds.bottom > navBounds.bottom) nav.scrollTop += linkBounds.bottom - navBounds.bottom
  }, [activeDocId])

  function openDoc(event: MouseEvent<HTMLAnchorElement>, docId: DocId) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate({ kind: 'docs', docId })
  }

  return (
    <aside
      data-testid="docs-catalog"
      className="flex max-h-52 w-full shrink-0 flex-col border-b border-seam bg-panel/70 font-mono sm:max-h-none sm:h-full sm:w-72 sm:border-b-0 sm:border-r"
    >
      <div className="flex items-center gap-2 border-b border-seam px-3 py-2.5">
        <BookOpen size={15} aria-hidden className="text-zinc-500" />
        <h1 className="text-sm font-semibold text-zinc-200">Documentation</h1>
      </div>
      <nav ref={navRef} aria-label="Documentation" className="rail-list-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {USER_DOCS.map((doc) => {
          const active = doc.id === activeDocId
          return (
            <a
              key={doc.id}
              ref={active ? activeLinkRef : undefined}
              href={docExternalHref(doc.id)}
              aria-current={active ? 'page' : undefined}
              onClick={(event) => openDoc(event, doc.id)}
              className={[
                'group block border-l-2 px-3 py-2.5 transition-colors',
                active
                  ? 'border-live bg-live/8 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:bg-zinc-900/65 hover:text-zinc-200',
              ].join(' ')}
            >
              <span className="block text-[10px] uppercase tracking-wide text-structural">
                {doc.menuKicker}
              </span>
              <span className="mt-0.5 block text-xs font-medium">{doc.menuLabel}</span>
              <span className="mt-1 block font-sans text-[11px] leading-4 text-zinc-500 group-hover:text-zinc-400">
                {doc.summary}
              </span>
            </a>
          )
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-3 border-t border-seam px-3 py-2 text-[10px] text-zinc-500">
        <a
          href={`https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/main/${sourcePath}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-zinc-300"
        >
          <ExternalLink size={11} aria-hidden /> View source
        </a>
        <a
          href="https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-zinc-300"
        >
          <Bug size={11} aria-hidden /> Report a bug
        </a>
      </div>
    </aside>
  )
}
