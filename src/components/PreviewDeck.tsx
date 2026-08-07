import { useEffect } from 'react'
import { Lock, Play, Pause, RotateCcw } from 'lucide-react'
import { usePreviewStore, MIN_LIGHT_SIZE, MAX_LIGHT_SIZE } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore, defaultPixelCountForDim, resolveMap } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import {
  writeCascadedOverride,
  writeHybrid,
  resetActiveSettings,
  hasActiveOverrides,
} from '@/store/settingsCascade'
import { effectivePixelCount } from '@/engine/layout'
import { CoordinateViewSelect, MapSelect, EmbeddingSelect, useMapSelectMeta } from '@/components/LayoutSelector'
import { SpeedSelector } from '@/components/SpeedSelector'
import { DeckSelect } from '@/components/DeckSelect'
import { DeckSlider } from '@/components/DeckSlider'
import { ControlsPanel } from '@/components/ControlsPanel'
import { DimPills } from '@/components/DimPills'
import { exportedDims } from '@/engine/exportedDims'
import { Variables } from '@/components/Variables'
import { PixelCountPopover } from '@/components/PixelCountPopover'
import { previewResolutionSteps, realizedResolutionCount } from '@/engine/previewResolution'
import {
  DeckSection,
  DeckSectionHint,
  DeckGrid,
  DeckCell,
  DeckField,
  DeckTelemetry,
} from '@/components/Deck'

// Card content for the two viewport sections. The contrast is the point: the
// Pixelblaze section is real device state that travels to hardware; the Preview
// section is renderer-only and never leaves the browser.
const PIXELBLAZE_HINT = (
  <DeckSectionHint
    heading="Pixelblaze controller settings"
    items={[
      ['map', 'the coordinates sampled by each physical pixel in 1D/2D/3D space'],
      ['brightness', 'master output level applied to every pixel'],
      ['fit', 'pixel map normalization to pattern space — Contain keeps the aspect ratio, Fill stretches each axis to fill it'],
      ['pixel count', 'how many LEDs the pattern drives'],
    ]}
  />
)

const PREVIEW_HINT = (
  <DeckSectionHint
    heading="PXLBLZ Preview settings"
    items={[
      ['light size', 'on-screen LED size'],
      ['diffusion', 'soften and blend lights'],
      ['interior opacity', 'opacity for surface maps'],
      ['renderer', 'Fast (native float math) or Precise (hardware-accurate fixed-point)'],
      ['speed', 'playback rate of the preview'],
      ['fps', 'live preview frame rate'],
      ['elapsed', 'elapsed preview run time'],
      ['layout', 'map grid dimensions, e.g. 16×16 — grid-shaped maps only (squares, rectangles, cubes)'],
    ]}
  />
)

const SHOW_PREVIEW_HINT = (
  <DeckSectionHint
    heading="Show Stage preview settings"
    items={[
      ['light size', 'on-screen LED size'],
      ['diffusion', 'soften and blend lights'],
      ['renderer', 'Fast (native float math) or Precise (hardware-accurate fixed-point)'],
      ['fps', 'live Stage frame rate'],
    ]}
  />
)

// The preview control deck (#150): everything below the canvas, stacked by visual
// prominence. Primary band = the pattern name, layout, and play/pause; secondary
// band = the remaining controls split into a Pixelblaze group (real device settings)
// and a Preview group (renderer-only constructs + the read-only telemetry that used
// to be its own Readout section — both are preview-only, so they share one section);
// then the author's pattern controls; then the Variables turn-down.
export function PreviewDeck({ showPrimaryBand = true }: { showPrimaryBand?: boolean }) {
  return (
    <div className="font-mono pl-3">
      {showPrimaryBand && <PrimaryBand />}
      <SecondaryBand />
      <ControlsPanel />
      <Variables />
    </div>
  )
}

function PrimaryBand() {
  const isRunning = usePreviewStore((s) => s.isRunning)
  const toggle = usePreviewStore((s) => s.toggle)
  const previewPatternName = useEditorStore((s) => s.previewPatternName)
  const previewSource = useEditorStore((s) => s.previewSource)
  const hasPattern = Boolean(previewPatternName.trim() || previewSource.trim())
  const displayRunning = hasPattern && isRunning

  useEffect(() => {
    if (!hasPattern) usePreviewStore.getState().setRunning(false)
  }, [hasPattern])

  // The layer-1 reset affordance (#63): a rewind icon in the primary action cluster,
  // immediately before the viewport embedding chooser. It stays in the main row so it
  // is findable, but reads as an action rather than status. It pops in only when the
  // active pattern/demo carries overrides to clear (so it's never a no-op) — a demo
  // reverts to its developer recommendation, a user pattern to the app defaults
  // (resetActiveSettings picks the floor). We subscribe to the override sources so it
  // appears/disappears live as controls are touched; the divergence check itself is
  // `hasActiveOverrides()`. Clicking resets and the icon disappears.
  usePatternStore((s) => s.activePatternId)
  usePatternStore((s) => s.activeDemoName)
  usePatternStore((s) => s.userPatterns)
  usePatternStore((s) => s.demoOverrides)
  const showReset = hasActiveOverrides()

  // The name truncates first; the embedding control and play/pause never do (both
  // `shrink-0`), so the controls stay fully readable and only the title gives up space
  // (#63). The MAP control no longer lives here — it moved to the PIXELBLAZE block
  // (#253); this row holds only viewport affordances + transport.
  return (
    <div className="flex items-center gap-3 py-2 pr-3 border-b border-zinc-800">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="min-w-0 truncate text-sm text-zinc-200" title={previewPatternName || 'No pattern'}>
          {previewPatternName || '—'}
        </span>
        <DimPills dims={exportedDims(previewSource)} />
      </div>
      {showReset && (
        <button
          type="button"
          aria-label="Reset preview"
          title="Reset preview settings"
          onClick={() => void resetActiveSettings()}
          className="flex items-center justify-center h-5 w-5 shrink-0 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      )}
      <EmbeddingSelect portaled />
      <button
        aria-label={hasPattern ? (isRunning ? 'Pause' : 'Run') : 'No pattern loaded'}
        title={hasPattern ? (isRunning ? 'Pause preview' : 'Run preview') : 'No pattern loaded'}
        disabled={!hasPattern}
        onClick={hasPattern ? toggle : undefined}
        className={`flex items-center justify-center w-8 h-8 rounded shrink-0 hover:bg-zinc-700 transition-colors ${
          displayRunning
            ? 'text-green-500 hover:text-green-400'
            : hasPattern
              ? 'text-red-500 hover:text-red-400'
              : 'cursor-default text-red-500/45'
        }`}
      >
        {displayRunning ? <Play size={20} /> : <Pause size={20} />}
      </button>
    </div>
  )
}

function PixelCountInput() {
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const userMaps = useMapStore((s) => s.userMaps)
  const setActivePixelCount = useMapStore((s) => s.setActivePixelCount)
  const { mapDim } = useMapSelectMeta()
  const activeMap = resolveMap(activeMapId, userMaps)
  if (activeMap.fixedPixelCount !== undefined) {
    const count = activeMap.fixedPixelCount.toLocaleString()
    return (
      <span
        aria-label={`Fixed pixel count: ${count}`}
        title={`This map has a fixed size of ${count} pixels. Pixel count cannot resize it.`}
        className="inline-flex h-5 min-w-[42px] items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-900/60 px-1.5 text-[10px] tabular-nums text-zinc-400"
      >
        <Lock size={10} aria-hidden />
        {count}
      </span>
    )
  }
  const resolutionSteps = previewResolutionSteps({
    mapDim,
    gridRecipe: mapDim === 1 ? undefined : activeMap.gridRecipe,
    bakedCount: activeMap.bakedCount,
  })

  // The effective modeled count, via the same `effectivePixelCount` selector the
  // renderer feeds every layout branch through — the per-pattern value
  // (already seeded with any demo recommendation by the cascade), else the
  // dimension's default. Keyed off the selected map/sample dimension, not the
  // Pattern or viewport dimension, so the box reads the count actually rendered. (No `baked`
  // slot: the deck has no resolved map.)
  const effectiveCount = effectivePixelCount({
    persisted: activePixelCount,
    fallback: defaultPixelCountForDim(mapDim),
  })
  function commit(n: number) {
    setActivePixelCount(n)
    writeCascadedOverride('pixelCount', n)
  }

  return (
    <PixelCountPopover
      value={effectiveCount}
      triggerLabel="Edit pixel count"
      inputLabel="Pixel count"
      portaled
      quickSelect={resolutionSteps.length > 0 ? {
        steps: resolutionSteps,
        dimensionsFor: (count) => mapDim === 1 ? null : activeMap.gridDims(count),
        realizedCountFor: (count, dimensions) => realizedResolutionCount(count, dimensions, activeMap.gridRecipe),
        onSelect: commit,
      } : undefined}
      onApply={commit}
    />
  )
}

// Secondary band: the viewport controls, in two labeled sections (#174) that make
// visible the boundary already drawn in code — real Pixelblaze device
// settings (pixels, fit, brightness) that exist on hardware and would round-trip to a
// controller, vs the preview-only Preview section (light size, diffusion, solidity,
// renderer, speed — "never serialize toward a controller") which also
// absorbs the read-only telemetry (fps/elapsed/layout). All sliders use the one shared
// long DeckSlider style; non-slider rows stay on the deck's 2-col label/value grid.
function SecondaryBand() {
  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const renderAdaptation = useEditorStore((s) => s.renderAdaptation)
  // Fill/Contain (#174): a real Mapper map-coordinate normalization setting, so it
  // sits in the Pixelblaze section. Contain (default) preserves aspect; Fill stretches
  // each axis to fill the unit square. Persisted per-pattern.
  const normalizeMode = useMapStore((s) => s.activeNormalizeMode)
  const setNormalizeMode = useMapStore((s) => s.setActiveNormalizeMode)
  // Solidity rides in the Preview section only when the active embedding is
  // solid-eligible (it supplies a per-point normal); it appears/disappears as a unit
  // with that embedding. The canonical term is `solidity`; the slider is labelled
  // by its physical spectrum, Transparent ↔ Solid.
  // Map stays available across dimensions. Fit keys off the selected map and is
  // absent for 1D because Contain and Fill are equivalent on one axis.
  const { hasMapChoice, hasMappedCoordinates } = useMapSelectMeta()

  return (
    <div className="text-xs pr-3">
      <DeckSection label="Pixelblaze" hint={PIXELBLAZE_HINT} collapsible>
        <DeckGrid>
          {/* Row 1 is the two controls that want room: map (stacked, so its dropdown
              gets the full column width for long map names) and brightness (the stacked
              slider). Row 2 holds the two compact one-liners: fit and pixel count, as
              inline label-left/value-right cells. Fit drops out for an active 1D map;
              the Map control remains because Other dimensions are always available. */}
          {hasMapChoice && (
            <DeckField label="map">
              <div className="flex flex-col items-end">
                <MapSelect portaled />
                <CoordinateViewSelect portaled />
              </div>
            </DeckField>
          )}
          <DeckSlider
            label="brightness"
            ariaLabel="Brightness"
            value={brightness}
            min={0}
            max={1}
            step={0.01}
            presentation="percentage"
            curve={2}
            onChange={(v) => {
              setBrightness(v)
              writeCascadedOverride('brightness', v)
            }}
          />
          {hasMappedCoordinates && (
            <DeckCell label="fit">
              <DeckSelect
                ariaLabel="Map normalization (Fill / Contain)"
                value={normalizeMode}
                options={[
                  { value: 'contain', label: 'Contain', title: 'Contain — keep aspect ratio, fit the longest axis' },
                  { value: 'fill', label: 'Fill', title: 'Fill — stretch each axis to fill the unit square' },
                ]}
                onChange={(mode) => {
                  setNormalizeMode(mode)
                  writeCascadedOverride('normalize', mode)
                }}
                menuWidthClass="w-28"
                portaled
              />
            </DeckCell>
          )}
          <DeckCell label="pixel count">
            <PixelCountInput />
          </DeckCell>
        </DeckGrid>
        {renderAdaptation && (
          <div
            role="status"
            className="mt-1.5 border-l border-amber-500/40 pl-2 text-[10px] leading-4 text-zinc-400"
          >
            {renderAdaptation}
          </div>
        )}
      </DeckSection>
      <PreviewViewportSection profile="pattern" />
    </div>
  )
}

export function PreviewViewportSection({ profile }: { profile: 'pattern' | 'show' }) {
  const lightSize = usePreviewStore((s) => s.lightSize)
  const setLightSize = usePreviewStore((s) => s.setLightSize)
  const setLightSizeSticky = usePreviewStore((s) => s.setLightSizeSticky)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const setDiffusion = usePreviewStore((s) => s.setDiffusion)
  const setDiffusionSticky = usePreviewStore((s) => s.setDiffusionSticky)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const setFidelity = usePreviewStore((s) => s.setFidelity)
  const fps = usePreviewStore((s) => s.fps)
  const elapsed = usePreviewStore((s) => s.elapsed)
  const layoutLabel = useEditorStore((s) => s.layoutLabel)
  const solidEligible = useEditorStore((s) => s.solidEligible)
  const solidity = useMapStore((s) => s.activeSolidity)
  const setSolidity = useMapStore((s) => s.setActiveSolidity)
  const pattern = profile === 'pattern'

  const updateLightSize = (value: number) => {
    setLightSize(value)
    if (pattern) writeHybrid('lightSize', value)
    else setLightSizeSticky(value)
  }
  const updateDiffusion = (value: number) => {
    setDiffusion(value)
    if (pattern) writeHybrid('diffusion', value)
    else setDiffusionSticky(value)
  }

  return (
    <DeckSection
      label="Preview"
      hint={pattern ? PREVIEW_HINT : SHOW_PREVIEW_HINT}
      collapsible={pattern}
    >
      <DeckGrid className="mb-2">
        <DeckSlider
          label="light size"
          ariaLabel="Light size"
          value={lightSize}
          min={MIN_LIGHT_SIZE}
          max={MAX_LIGHT_SIZE}
          step={0.05}
          onChange={updateLightSize}
        />
        <DeckSlider
          label="diffusion"
          ariaLabel="Diffusion"
          value={diffusion}
          min={0}
          max={1}
          step={0.01}
          presentation="percentage"
          onChange={updateDiffusion}
        />
        {pattern && solidEligible && (
          <DeckSlider
            label="interior opacity"
            ariaLabel="Interior opacity (Transparent ↔ Solid)"
            value={solidity}
            min={0}
            max={1}
            step={0.01}
            presentation="percentage"
            onChange={(value) => {
              setSolidity(value)
              writeCascadedOverride('solidity', value)
            }}
          />
        )}
      </DeckGrid>
      <DeckGrid gapY="gap-y-1" className="mb-2">
        <DeckCell label="renderer">
          <DeckSelect
            ariaLabel="Renderer"
            value={fidelity}
            options={[
              { value: 'fast', label: 'Fast', title: 'Fast (float64, plain JS preview)' },
              { value: 'fidelity', label: 'Precise', title: 'Precise (16.16 fixed-point, hardware-accurate)' },
            ]}
            onChange={setFidelity}
            menuWidthClass="w-28"
            portaled={pattern}
          />
        </DeckCell>
        {pattern ? (
          <DeckCell label="speed">
            <SpeedSelector portaled />
          </DeckCell>
        ) : (
          <DeckTelemetry label="fps" value={fps === null ? '—' : fps.toFixed(1)} />
        )}
      </DeckGrid>
      {pattern && (
        <DeckGrid gapY="gap-y-1" className="mb-2 -mt-1.5">
          <DeckTelemetry label="fps" value={fps === null ? '—' : fps.toFixed(1)} />
          <DeckTelemetry label="elapsed" value={elapsed === null ? '—' : `${(elapsed / 1000).toFixed(1)}s`} />
          {layoutLabel && <DeckTelemetry label="layout" value={layoutLabel} />}
        </DeckGrid>
      )}
    </DeckSection>
  )
}
