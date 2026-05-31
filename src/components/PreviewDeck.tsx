import { useState, type ReactNode } from 'react'
import { Play, Pause } from 'lucide-react'
import { usePreviewStore, MIN_LIGHT_SIZE, MAX_LIGHT_SIZE } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore, defaultPixelCountForDim } from '@/store/mapStore'
import { MAX_PIXEL_COUNT, clampPixelCount } from '@/engine/camera'
import { LayoutSelector } from '@/components/LayoutSelector'
import { SpeedSelector } from '@/components/SpeedSelector'
import { DeckSelect } from '@/components/DeckSelect'
import { ControlsPanel } from '@/components/ControlsPanel'
import { Readout } from '@/components/Readout'

// The preview control deck (#150): everything below the canvas, stacked by visual
// prominence. Primary band = controls that map to a real pattern/controller property
// (play/pause, brightness, pixel count, layout); secondary band = preview-only
// affordances (light size, diffusion, renderer, speed); then the author's pattern
// controls; then the read-only Readout. Replaces the over-the-canvas gear dialog.
export function PreviewDeck() {
  return (
    <div className="font-mono pl-3">
      <PrimaryBand />
      <SecondaryBand />
      <ControlsPanel />
      <Readout />
    </div>
  )
}

function PrimaryBand() {
  const isRunning = usePreviewStore((s) => s.isRunning)
  const toggle = usePreviewStore((s) => s.toggle)
  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const previewPatternName = useEditorStore((s) => s.previewPatternName)
  const nativeDim = useEditorStore((s) => s.nativeDim)

  return (
    <div className="flex items-center gap-3 py-2 pr-3 border-b border-zinc-800">
      <button
        aria-label={isRunning ? 'Pause' : 'Run'}
        onClick={toggle}
        className={`flex items-center justify-center w-7 h-7 rounded shrink-0 hover:bg-zinc-700 transition-colors ${
          isRunning ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'
        }`}
      >
        {isRunning ? <Play size={18} /> : <Pause size={18} />}
      </button>
      <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-zinc-200">
        <span className="truncate">{previewPatternName || '—'}</span>
        {previewPatternName && (
          <span
            title={`Native dimensionality: ${nativeDim}D (highest render fn)`}
            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none tabular-nums"
          >
            {nativeDim}D
          </span>
        )}
      </span>
      <label className="flex items-center gap-1.5 shrink-0" title="Brightness">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Bright</span>
        <input
          type="range"
          aria-label="Brightness"
          min={0}
          max={1}
          step={0.01}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="w-20 accent-amber-500"
        />
      </label>
      <PixelCountInput />
      <LayoutSelector />
    </div>
  )
}

// Inline pixel-count control (#150): the count is now an editable control in the
// deck, not a read-only echo. Draft/commit logic lifted from the old settings dialog
// — the draft tracks edits until Enter/blur commits a clamped value to the store.
function PixelCountInput() {
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const setActivePixelCount = useMapStore((s) => s.setActivePixelCount)
  const nativeDim = useEditorStore((s) => s.nativeDim)

  // The effective count: the per-pattern value, or the dimension's default. Keyed off
  // the layout's coordinate dimension (nativeDim), not the viewport dimension.
  const effectiveCount = activePixelCount ?? defaultPixelCountForDim(nativeDim)
  const [draftCount, setDraftCount] = useState(String(effectiveCount))

  // Reflect external count changes (pattern switch, default per dimension) into the
  // draft by adjusting state during render (React's recommended pattern over an effect).
  const [lastCount, setLastCount] = useState(effectiveCount)
  if (effectiveCount !== lastCount) {
    setLastCount(effectiveCount)
    setDraftCount(String(effectiveCount))
  }

  function commit() {
    const n = clampPixelCount(parseInt(draftCount, 10) || effectiveCount)
    setDraftCount(String(n))
    setActivePixelCount(n)
  }

  return (
    <label className="flex items-center gap-1.5 shrink-0" title="Pixel count">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Pixels</span>
      <input
        aria-label="Pixel count"
        type="number"
        min={1}
        max={MAX_PIXEL_COUNT}
        value={draftCount}
        onChange={(e) => setDraftCount(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        onBlur={commit}
        className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-amber-500"
      />
    </label>
  )
}

// Secondary band: preview-only affordances, laid out on the SAME label/value grid
// as the Readout below (#150) so everything in the deck aligns on one set of
// columns — label on the left (zinc-400, like fps/elapsed/layout), control flush
// right. Sliders are short; they don't need the full cell width to be usable.
function SecondaryBand() {
  const lightSize = usePreviewStore((s) => s.lightSize)
  const setLightSize = usePreviewStore((s) => s.setLightSize)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const setDiffusion = usePreviewStore((s) => s.setDiffusion)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const setFidelity = usePreviewStore((s) => s.setFidelity)

  return (
    <div className="text-xs py-2 pr-3 border-b border-zinc-800">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 items-center">
        <Cell label="light size">
          <input
            type="range"
            aria-label="Light size"
            min={MIN_LIGHT_SIZE}
            max={MAX_LIGHT_SIZE}
            step={0.05}
            value={lightSize}
            onChange={(e) => setLightSize(Number(e.target.value))}
            className="w-12 accent-amber-500"
          />
        </Cell>
        <Cell label="diffusion">
          <input
            type="range"
            aria-label="Diffusion"
            min={0}
            max={1}
            step={0.01}
            value={diffusion}
            onChange={(e) => setDiffusion(Number(e.target.value))}
            className="w-12 accent-amber-500"
          />
        </Cell>
        <Cell label="renderer">
          <DeckSelect
            ariaLabel="Renderer"
            value={fidelity}
            options={[
              { value: 'fast', label: 'Fast', title: 'Fast (float64, plain JS preview)' },
              { value: 'fidelity', label: 'Precise', title: 'Precise (16.16 fixed-point, hardware-accurate)' },
            ]}
            onChange={setFidelity}
            menuWidthClass="w-28"
          />
        </Cell>
        <Cell label="speed">
          <SpeedSelector />
        </Cell>
      </div>
    </div>
  )
}

// One label/value cell on the deck's shared grid: label flush left (matching the
// Readout's zinc-400 labels), the control flush right.
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-2 min-w-0">
      <span className="text-zinc-400 truncate">{label}</span>
      {children}
    </div>
  )
}
