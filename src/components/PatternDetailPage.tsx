import { useEffect, useState } from 'react'
import { ArrowLeft, Code2, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Preview } from '@/components/Preview'
import { PreviewDeck } from '@/components/PreviewDeck'
import { PATTERN_DETAIL_PIXEL_COUNT_MULTIPLIER } from '@/engine/previewPixelCount'
import { PixelblazeCodeEditor } from '@/components/PixelblazeCodeEditor'
import { PatternDetailActionBar } from '@/components/PatternDetailActionBar'
import { EmbeddingSelect, useEmbeddingSelectMeta } from '@/components/LayoutSelector'
import { useRouterStore } from '@/store/routerStore'
import { openDemoPattern } from '@/store/openPattern'
import type { GalleryPattern } from '@/engine/galleryCatalog'
import { usePreviewStore } from '@/store/previewStore'
import { usePatternStore } from '@/store/patternStore'
import { hasActiveOverrides, resetActiveSettings } from '@/store/settingsCascade'

export function PatternDetailPage({
  pattern,
  onOpenInStudio,
}: {
  pattern: GalleryPattern
  onOpenInStudio: (pattern: GalleryPattern) => void
}) {
  const navigate = useRouterStore((s) => s.navigate)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const togglePreview = usePreviewStore((s) => s.toggle)
  usePatternStore((s) => s.activePatternId)
  usePatternStore((s) => s.activeDemoName)
  usePatternStore((s) => s.userPatterns)
  usePatternStore((s) => s.demoOverrides)
  const showReset = hasActiveOverrides()
  const { hasEmbeddingChoice } = useEmbeddingSelectMeta()
  const [stageView, setStageView] = useState<'preview' | 'code'>('preview')

  useEffect(() => {
    openDemoPattern(pattern.name)
  }, [pattern.name])

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

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
          <section
            className={`relative overflow-hidden rounded-lg border border-seam bg-black ${
              stageView === 'code' ? 'min-h-[440px] md:min-h-[620px]' : ''
            }`}
          >
            <div
              className={stageView === 'preview' ? 'relative' : 'hidden'}
              aria-hidden={stageView !== 'preview'}
            >
              <Preview
                showDeck={false}
                pixelCountMultiplier={PATTERN_DETAIL_PIXEL_COUNT_MULTIPLIER}
              />
            </div>

            <div
              className={`bg-zinc-950 ${
                stageView === 'code'
                  ? 'relative h-[70vh] min-h-[360px] md:absolute md:inset-0 md:h-auto md:min-h-0'
                  : 'hidden'
              }`}
              aria-hidden={stageView !== 'code'}
              data-testid="pattern-code-stage"
            >
              <div className="h-full min-h-0" aria-label={`${pattern.name} read-only source code`}>
                <PixelblazeCodeEditor value={pattern.src} readOnly />
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-seam bg-panel font-mono">
            <div className="border-b border-seam px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h1 className="min-w-0 truncate text-lg font-semibold text-zinc-100">
                    {pattern.name}
                  </h1>
                  <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-structural">
                    {pattern.dim}D
                  </span>
                </div>
                {!hasEmbeddingChoice && showReset && (
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
              {hasEmbeddingChoice && (
                <div data-testid="pattern-detail-minor-row" className="mt-2 flex min-w-0 items-center gap-3">
                  <EmbeddingSelect showLabel />
                  {showReset && (
                    <button
                      type="button"
                      aria-label="Reset preview"
                      title="Reset preview settings"
                      onClick={() => void resetActiveSettings()}
                      className="flex h-5 shrink-0 items-center gap-1 rounded border border-zinc-700 px-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800/70 hover:text-amber-400"
                    >
                      <RotateCcw size={13} aria-hidden />
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border-b border-seam py-1 pr-1">
              <PreviewDeck showPrimaryBand={false} />
            </div>

            <div className="space-y-2 border-b border-seam px-4 py-3">
              <Button
                size="sm"
                className="w-full justify-center border border-live/50 bg-live/15 font-mono text-xs text-live hover:bg-live/25 hover:text-amber-100"
                onClick={() => onOpenInStudio(pattern)}
              >
                <Code2 data-icon="inline-start" />
                Open in Studio
              </Button>
              <PatternDetailActionBar
                stageView={stageView}
                onToggleStage={() => setStageView((view) => (view === 'code' ? 'preview' : 'code'))}
              />
            </div>

          </aside>
        </div>
      </div>
    </main>
  )
}
