import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { USER_DOCS, type DocId } from '@/docs/catalog'
import { useDocsStore } from '@/store/docsStore'
import { useMapStore } from '@/store/mapStore'

export function DocsMenu() {
  const activeDocId = useDocsStore((s) => s.activeDocId)
  const openDoc = useDocsStore((s) => s.openDoc)
  const closeMapEditor = useMapStore((s) => s.closeMapEditor)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function selectDoc(id: DocId) {
    closeMapEditor()
    openDoc(id)
    setOpen(false)
    history.replaceState(null, '', `#/docs/${id}`)
  }

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        data-testid="docs-menu-button"
        aria-label="Docs"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-6 rounded border px-2 font-mono text-xs transition-colors select-none focus:outline-none ${
          open
            ? 'border-zinc-400 bg-zinc-800 text-zinc-100'
            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
        }`}
      >
        <BookOpen size={14} aria-hidden className="shrink-0 text-zinc-400" />
        <span className="hidden min-[720px]:inline">Docs</span>
        <ChevronDown size={13} aria-hidden className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          data-testid="docs-menu-dropdown"
          className="absolute left-0 top-8 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
        >
          {USER_DOCS.map((doc) => {
            const active = activeDocId === doc.id
            return (
              <button
                key={doc.id}
                type="button"
                data-testid="docs-menu-item"
                onClick={() => selectDoc(doc.id)}
                className={[
                  'group flex w-full flex-col gap-0.5 px-3 py-2 text-left select-none transition-colors',
                  active ? 'bg-live/10 text-live' : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100',
                ].join(' ')}
              >
                <span className="font-mono text-[10px] uppercase tracking-wide text-structural group-hover:text-zinc-400">
                  {doc.menuKicker}
                </span>
                <span className="font-mono text-xs">{doc.menuLabel}</span>
                <span className="font-sans text-[11px] leading-snug text-zinc-500 group-hover:text-zinc-400">
                  {doc.summary}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
