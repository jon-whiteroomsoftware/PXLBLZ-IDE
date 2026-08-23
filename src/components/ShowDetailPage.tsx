// A Gallery Show's public page at /s/<slug> (#894): the stage preview at full
// size, the byline and premise, and the Show's arc as a scene list. Where a
// visitor lands from a band; the Show editor stays behind sign-in.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { controlIcon } from '@/components/iconScale'
import { Button } from '@/components/ui/button'
import {
  GALLERY_SHOW_PIXEL_COUNT,
  galleryShowFacts,
  galleryShowStock,
  resolveGalleryShowGeometry,
  type GalleryShow,
} from '@/engine/galleryShows'
import { galleryReturnPathFromHistoryState } from '@/engine/routes'
import { useRouterStore } from '@/store/routerStore'
import { GalleryLivePreview } from './GalleryLivePreview'

export function ShowDetailPage({ show }: { show: GalleryShow }) {
  const navigate = useRouterStore((state) => state.navigate)
  const facts = useMemo(() => galleryShowFacts(show), [show])
  const stock = useMemo(() => galleryShowStock(show), [show])
  const aspect = useMemo(() => resolveGalleryShowGeometry(show).aspect, [show])
  const subject = useMemo(() => ({ kind: 'show' as const, id: show.id }), [show.id])
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(960)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const measure = () => setFrameWidth(Math.max(1, frame.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [])
  // Fit the stage inside the frame: full width, or height-bound for tall stages.
  const maxHeight = 620
  const width = Math.round(Math.min(frameWidth, maxHeight * aspect))
  const height = Math.round(width / aspect)

  const backToGallery = () => {
    const returnPath = galleryReturnPathFromHistoryState(window.history.state)
    if (returnPath) {
      window.history.back()
      return
    }
    navigate({ kind: 'gallery' })
  }

  return (
    <main className="flex-1 overflow-auto bg-zinc-950" data-testid="show-detail-page">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pb-8 pt-[18px] sm:px-[22px]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={backToGallery} aria-label="Gallery" className="gap-1.5 font-mono text-[11.5px]">
            <ArrowLeft {...controlIcon} aria-hidden />
            Gallery
          </Button>
        </div>
        <div ref={frameRef} className="flex w-full justify-center">
          <div
            className="relative overflow-hidden rounded-[4px] bg-black"
            style={{ width, height }}
            data-testid="show-detail-stage"
          >
            <GalleryLivePreview
              subject={subject}
              index={0}
              cost={GALLERY_SHOW_PIXEL_COUNT}
              loopMs={facts.loopSeconds * 1000}
              label={facts.title}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 font-mono" style={{ maxWidth: Math.round(width * 0.8) }}>
          <h1 className="text-[19px] text-zinc-100">
            <em>{facts.title}</em>
            <span className="text-[12px] text-zinc-400"> {show.byline}</span>
          </h1>
          <p className="text-[13px] leading-relaxed text-zinc-300">{show.premise}</p>
          <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.08em] text-structural">
            <span>{facts.loopSeconds}s loop</span>
            <span>{facts.sceneCount} scenes</span>
            <span>{facts.zoneCount} zones</span>
            <span>{facts.track}</span>
          </div>
        </div>
        <section aria-label="Scenes" className="font-mono">
          <h2 className="mb-2 text-[10.5px] uppercase tracking-[0.08em] text-structural">The arc</h2>
          <ol className="flex flex-col gap-1 text-[12px] text-zinc-300" data-testid="show-detail-scenes">
            {stock.show.scenes.map((scene, index) => (
              <li key={scene.id} className="flex items-baseline gap-3">
                <span className="w-5 shrink-0 text-right text-structural">{index + 1}</span>
                <span className="min-w-0 truncate">{scene.name}</span>
                <span className="ml-auto shrink-0 text-[10.5px] text-structural">{Math.round(scene.durationMs / 1000)}s</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  )
}
