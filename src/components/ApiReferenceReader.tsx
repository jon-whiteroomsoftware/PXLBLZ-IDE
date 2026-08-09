import { ExternalLink } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { ApiReferenceDocument } from '@/engine/apiReferenceCatalog'
import { routePath } from '@/engine/routes'
import { useRouterStore } from '@/store/routerStore'

function EmptyReference({ reason }: { reason: ApiReferenceDocument['emptyReason'] }) {
  return (
    <p className="mt-6 max-w-xl text-sm leading-6 text-zinc-500">
      {reason === 'undocumented'
        ? 'No API documentation yet. This library has functions, but none have doc comments. Add comments above them to make their API documentation available here.'
        : 'This library does not declare any functions to document.'}
    </p>
  )
}

export function ApiReferenceReader({ document }: { document: ApiReferenceDocument }) {
  const navigate = useRouterStore((state) => state.navigate)

  function editLibrary(event: MouseEvent<HTMLAnchorElement>, libraryId: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate({ kind: 'studio', entity: { kind: 'libraries', id: libraryId } })
  }

  return (
    <div data-testid="api-reference-reader" className="h-full overflow-hidden bg-zinc-950 text-[0.8125rem]">
      <article className="h-full overflow-y-auto px-5 py-5 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-seam pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-live/75">
                {document.kind === 'builtin' ? 'Language' : `${document.kind} library`}
              </p>
              <h1 className="mt-1 font-mono text-xl font-semibold text-zinc-100">{document.name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-zinc-500">{document.summary}</p>
            </div>
            {document.editLibraryId ? (
              <a
                href={routePath({ kind: 'studio', entity: { kind: 'libraries', id: document.editLibraryId } }, import.meta.env.BASE_URL)}
                onClick={(event) => editLibrary(event, document.editLibraryId!)}
                className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
              >
                Edit in Libraries
              </a>
            ) : document.sourceHref ? (
              <a
                href={document.sourceHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                View source <ExternalLink size={12} aria-hidden />
              </a>
            ) : null}
          </div>

          {document.sections.length === 0 ? (
            <EmptyReference reason={document.emptyReason} />
          ) : (
            document.sections.map((section) => (
              <section key={section.title} className="mt-7">
                <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {section.title}
                </h2>
                <div className="grid grid-cols-1 border-t border-zinc-900/90 lg:grid-cols-2 lg:gap-x-8">
                  {section.entries.map((entry, index) => (
                    <div key={`${entry.signature}-${index}`} className="border-b border-zinc-900/90 py-2.5">
                      <code className="font-mono text-xs leading-5 text-[#9CDCFE]">{entry.signature}</code>
                      {entry.inlineSignature && (
                        <div className="flex min-w-0 items-baseline gap-1.5 font-mono text-[10px] leading-4">
                          <span className="shrink-0 rounded-sm border border-cyan-900/80 bg-cyan-950/30 px-1 py-px uppercase tracking-wide text-cyan-600">
                            inline
                          </span>
                          <code className="min-w-0 truncate text-cyan-300/75">{entry.inlineSignature}</code>
                        </div>
                      )}
                      {entry.description && (
                        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{entry.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </article>
    </div>
  )
}
