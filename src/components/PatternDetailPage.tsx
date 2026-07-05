import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Pause, Play, Radio, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Preview } from '@/components/Preview'
import { PreviewDeck } from '@/components/PreviewDeck'
import { SendToController } from '@/components/SendToController'
import { useRouterStore } from '@/store/routerStore'
import { openDemoPattern } from '@/store/openPattern'
import type { GalleryPattern } from '@/engine/galleryCatalog'
import { useControlStore } from '@/store/controlStore'
import { usePreviewStore } from '@/store/previewStore'
import { usePatternStore } from '@/store/patternStore'
import { hasActiveOverrides, resetActiveSettings } from '@/store/settingsCascade'

export function PatternDetailPage({ pattern }: { pattern: GalleryPattern }) {
  const navigate = useRouterStore((s) => s.navigate)
  const preserveControlsForNextReset = useControlStore((s) => s.preserveForNextReset)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const togglePreview = usePreviewStore((s) => s.toggle)
  usePatternStore((s) => s.activePatternId)
  usePatternStore((s) => s.activeDemoName)
  usePatternStore((s) => s.userPatterns)
  usePatternStore((s) => s.demoOverrides)
  const showReset = hasActiveOverrides()
  const [copied, setCopied] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routeBase = window.location.pathname.split('/p/')[0]
  const shareUrl = `${window.location.origin}${routeBase}/p/${pattern.slug}`

  useEffect(() => {
    openDemoPattern(pattern.name)
  }, [pattern.name])

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    },
    [],
  )

  const openInStudio = () => {
    preserveControlsForNextReset(useControlStore.getState().controlValues)
    navigate({ kind: 'studio', entity: null })
  }

  const copyShareUrl = () => {
    void navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="flex-1 overflow-auto bg-zinc-950" data-testid="pattern-detail-page">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-[22px] py-[18px]">
        <div className="flex flex-wrap items-center gap-2 font-mono">
          <Button
            size="xs"
            variant="ghost"
            className="h-7 border border-seam bg-panel text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={() => navigate({ kind: 'gallery' })}
          >
            <ArrowLeft size={13} aria-hidden />
            Gallery
          </Button>
          <span className="min-w-0 truncate text-xs text-structural">/p/{pattern.slug}</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-h-[360px] overflow-hidden rounded-lg border border-seam bg-black lg:min-h-[620px]">
            <Preview showDeck={false} />
          </section>

          <aside className="rounded-lg border border-seam bg-panel font-mono">
            <div className="border-b border-seam px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h1 className="min-w-0 truncate text-lg font-semibold text-zinc-100">
                    {pattern.name}
                  </h1>
                  <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-structural">
                    {pattern.dim}D
                  </span>
                </div>
                {showReset && (
                  <button
                    type="button"
                    aria-label="Reset preview"
                    title="Reset preview settings"
                    onClick={() => void resetActiveSettings()}
                    className="grid size-8 shrink-0 place-items-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-amber-400"
                  >
                    <RotateCcw size={15} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={isRunning ? 'Pause preview' : 'Run preview'}
                  title={isRunning ? 'Pause preview' : 'Run preview'}
                  onClick={togglePreview}
                  className={`grid size-8 shrink-0 place-items-center rounded transition-colors hover:bg-zinc-800 ${
                    isRunning ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'
                  }`}
                >
                  {isRunning ? <Play size={21} aria-hidden /> : <Pause size={21} aria-hidden />}
                </button>
              </div>
            </div>

            <div className="border-b border-seam py-1 pr-1">
              <PreviewDeck showPrimaryBand={false} />
            </div>

            <div className="space-y-2 border-b border-seam px-4 py-3">
              <Button
                size="sm"
                className="w-full justify-center border border-live/50 bg-live/15 font-mono text-xs text-live hover:bg-live/25 hover:text-amber-100"
                onClick={openInStudio}
              >
                Open in Studio
                <ArrowRight size={13} aria-hidden />
              </Button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  size="xs"
                  variant="ghost"
                  className="justify-center border border-zinc-800 bg-zinc-900/70 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  aria-expanded={sourceOpen}
                  onClick={() => setSourceOpen((open) => !open)}
                >
                  <FileText size={13} aria-hidden />
                  View source
                </Button>
                <div className="flex items-center justify-center rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1">
                  <Radio size={13} aria-hidden className="mr-1.5 text-zinc-500" />
                  <SendToController />
                </div>
              </div>
              {sourceOpen && (
                <pre className="mt-2 max-h-72 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
                  <code>{pattern.src}</code>
                </pre>
              )}
            </div>

            <div className="px-4 py-3">
              <button
                type="button"
                onClick={copyShareUrl}
                className="flex w-full items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-left text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
              >
                {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{shareUrl}</span>
                <span className="shrink-0 text-structural">{copied ? 'copied' : 'copy'}</span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
