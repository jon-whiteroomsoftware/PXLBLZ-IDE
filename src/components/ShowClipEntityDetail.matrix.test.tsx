import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ShowClipEntityDetail,
  type ShowClipEntityDetailProps,
} from './ShowClipEntityDetail'
import { InspectorPanel, InspectorReadOnlyContext } from './ShowEditor'
import { resetShowClipDetailTabMemory } from '@/engine/showClipDetailTabs'
import { createDefaultShow } from '@/engine/showModel'
import { enableViewportForContent } from '@/engine/showClipPlacementPad'
import { normalizeShowClipEffects } from '@/engine/showEffects'
import {
  projectShowClipInspector,
  showClipInspectorCapabilities,
  updateShowClipInspector,
  type ShowClipInspectorOwner,
  type ShowClipInspectorPatch,
  type ShowClipInspectorValue,
} from '@/engine/showClipInspectorModel'
import { validateShowComposition } from '@/engine/showCompositionModel'
import type { ShowClipEffect, ShowCompositionV1, ShowRecord } from '@/engine/personalContentRecords'

/*
  White-box qualification matrix for the Clip Entity Detail dialog (#658).

  The per-issue suites in ShowClipEntityDetail.test.tsx protect specific past
  defects. This file walks the surface systematically instead, closing the
  loop the bespoke tests leave open: every editable control's emitted patch is
  applied through the real engine (updateShowClipInspector), re-projected
  (projectShowClipInspector), and the re-projected value must be exactly what
  the dialog would then display - including clamping and normalization. Two
  layers that each pass their own suites can no longer disagree at this seam
  without a row failing.

  Partitions and executable coverage are declared in
  docs/agents/clip-detail-test-matrix.md.
*/

type Scope = ShowClipInspectorValue['scope']

const SCOPES: Scope[] = ['global', 'scene-main', 'scene-overlay']

/**
 * One real ShowRecord backing all three scopes, mirroring the inspector model
 * suite's fixture. The global cell deliberately has no control targets while
 * both instances do, so the same checkbox row can qualify enable and disable
 * directions without bespoke state plumbing.
 */
function fixture(): ShowRecord {
  const show = createDefaultShow('clip-detail-matrix', 'Clip detail matrix', 1)
  const cell = {
    ...show.cells[0],
    adaptations: {
      ...show.cells[0].adaptations,
      timeScale: 1,
      timeOffsetMs: 0,
      mirror: false,
      phase: 0.25,
      brightness: 0.8,
    },
  }
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{
      id: 'instance-main',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
      controlTargets: { sliderSpeed: 0.4 },
    }, {
      id: 'instance-overlay',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
      controlTargets: { sliderSpeed: 0.4 },
    }],
    scenes: [{
      sceneId: show.scenes[0].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          id: 'placement-main',
          instanceId: 'instance-main',
          startMs: 0,
          durationMs: 10_000,
          view: { mirror: false, phase: 0.25, brightness: 0.8 },
        }],
        overlays: [{
          id: 'layer-front',
          name: 'Front',
          placements: [{
            id: 'placement-overlay',
            instanceId: 'instance-overlay',
            startMs: 1_000,
            durationMs: 2_000,
            opacity: 0.75,
            view: { mirror: false, phase: 0.25, brightness: 0.8 },
          }],
        }, {
          id: 'layer-back',
          name: 'Back',
          placements: [],
        }],
      }],
    }],
  }
  return { ...show, cells: [cell, ...show.cells.slice(1)], composition }
}

function ownerFor(show: ShowRecord, scope: Scope): ShowClipInspectorOwner {
  if (scope === 'global') return { kind: 'global', cellId: show.cells[0].id }
  if (scope === 'scene-main') {
    return {
      kind: 'scene-main',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'placement-main',
    }
  }
  return {
    kind: 'scene-overlay',
    sceneId: show.scenes[0].id,
    zoneId: show.zones[0].id,
    layerId: 'layer-front',
    placementId: 'placement-overlay',
  }
}

function matrixProps(
  scope: Scope,
  value: ShowClipInspectorValue,
  onPatch: ShowClipEntityDetailProps['onPatch'],
): ShowClipEntityDetailProps {
  return {
    value,
    title: 'Matrix clip',
    readOnly: false,
    patternOptions: [
      { value: 'stock:TestPattern1D', label: 'TestPattern1D', group: 'Built-in' },
      { value: 'stock:CometLoom', label: 'CometLoom', group: 'Built-in' },
    ],
    patternControls: [{ exportName: 'sliderSpeed', label: 'Speed', min: 0, max: 1, defaultValue: 0.5 }],
    layerOptions: scope === 'scene-overlay'
      ? [{ value: 'layer-front', label: 'Front' }, { value: 'layer-back', label: 'Back' }]
      : undefined,
    onPatch,
    onMoveLayer: vi.fn(),
  }
}

type TabName = 'Pattern' | 'Place' | 'Effects' | 'Playback'

function showTab(name: TabName) {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }))
}

function typeAndCommit(name: string, text: string) {
  const field = screen.getByRole('textbox', { name })
  fireEvent.change(field, { target: { value: text } })
  fireEvent.blur(field)
}

function choose(name: string, optionValue: string) {
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value: optionValue } })
}

function toggle(name: string) {
  fireEvent.click(screen.getByRole('checkbox', { name }))
}

interface RoundTripRow {
  name: string
  scopes: Scope[]
  tab?: TabName
  /** Applied through the engine before projecting, to reach a non-default start state. */
  seed?: ShowClipInspectorPatch
  /** UI steps after the tab switch that must not themselves commit a patch. */
  prepare?: () => void
  drive: () => void
  /** The expected re-projection, from the pre-state and the emitted patches. */
  expected: (value: ShowClipInspectorValue, patches: ShowClipInspectorPatch[]) => ShowClipInspectorValue
  /**
   * Display oracle, asserted after re-rendering with the re-projected value:
   * the control must show the stored value, not merely accept it.
   */
  display: (next: ShowClipInspectorValue) => void
  /** The engine must refuse the commit and preserve the exact prior state. */
  refused?: boolean
}

function expectValue(name: string, expected: string) {
  expect(screen.getByRole('textbox', { name })).toHaveValue(expected)
}

const ROWS: RoundTripRow[] = [
  {
    name: 'header Start moves the logical Clip',
    scopes: ['scene-overlay'],
    drive: () => typeAndCommit('Start seconds exact time', '2'),
    expected: (value) => ({ ...value, local: { ...value.local!, startMs: 2_000 } }),
    display: () => expectValue('Start seconds exact time', '2'),
  },
  {
    name: 'header Duration resizes the logical Clip',
    scopes: ['scene-overlay'],
    drive: () => typeAndCommit('Duration seconds exact time', '3'),
    expected: (value) => ({ ...value, local: { ...value.local!, durationMs: 3_000 } }),
    display: () => expectValue('Duration seconds exact time', '3'),
  },
  {
    name: 'header Brightness stores a placement view fraction',
    scopes: SCOPES,
    drive: () => typeAndCommit('Brightness exact percentage', '35%'),
    expected: (value) => ({ ...value, view: { ...value.view, brightness: 0.35 } }),
    display: () => expectValue('Brightness exact percentage', '35'),
  },
  {
    name: 'header Opacity stores the overlay source-over fraction',
    scopes: ['scene-overlay'],
    drive: () => typeAndCommit('Opacity exact percentage', '50%'),
    expected: (value) => ({ ...value, local: { ...value.local!, opacity: 0.5 } }),
    display: () => expectValue('Opacity exact percentage', '50'),
  },
  {
    name: 'Source pattern swaps the Pattern reference and drops stale control targets',
    scopes: SCOPES,
    tab: 'Pattern',
    drive: () => {
      const pattern = screen.getByRole('combobox', { name: 'Source pattern' })
      fireEvent.focus(pattern)
      fireEvent.change(pattern, { target: { value: 'comet' } })
      fireEvent.click(screen.getByRole('option', { name: 'CometLoom' }))
    },
    expected: (value) => ({
      ...value,
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
      // A different Pattern invalidates the previous export targets. The global
      // cell has none to begin with, so its projection is unchanged here.
      simulation: { ...value.simulation, controlTargets: undefined },
    }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Source pattern' })).toHaveValue('CometLoom')
    },
  },
  {
    name: 'Speed stores the instance time scale',
    scopes: SCOPES,
    tab: 'Pattern',
    drive: () => typeAndCommit('Animation speed exact multiplier', '2x'),
    expected: (value) => ({ ...value, simulation: { ...value.simulation, timeScale: 2 } }),
    display: () => expectValue('Animation speed exact multiplier', '2'),
  },
  {
    name: 'enabling a Pattern control target adopts the Studio default',
    scopes: ['global'],
    tab: 'Pattern',
    drive: () => toggle('Set Speed target'),
    expected: (value) => ({
      ...value,
      simulation: { ...value.simulation, controlTargets: { sliderSpeed: 0.5 } },
    }),
    display: () => {
      expect(screen.getByRole('checkbox', { name: 'Set Speed target' })).toBeChecked()
      expectValue('Speed target exact percentage', '50')
    },
  },
  {
    name: 'disabling the last Pattern control target clears the map',
    scopes: ['scene-main'],
    tab: 'Pattern',
    drive: () => toggle('Set Speed target'),
    expected: (value) => ({
      ...value,
      simulation: { ...value.simulation, controlTargets: undefined },
    }),
    display: () => {
      expect(screen.getByRole('checkbox', { name: 'Set Speed target' })).not.toBeChecked()
      expect(screen.queryByRole('textbox', { name: 'Speed target exact percentage' })).toBeNull()
    },
  },
  {
    name: 'a Pattern control target value stores as a clamped fraction',
    scopes: ['scene-overlay'],
    tab: 'Pattern',
    drive: () => typeAndCommit('Speed target exact percentage', '75%'),
    expected: (value) => ({
      ...value,
      simulation: { ...value.simulation, controlTargets: { sliderSpeed: 0.75 } },
    }),
    display: () => expectValue('Speed target exact percentage', '75'),
  },
  {
    name: 'Content X stores a placement-unit position',
    scopes: ['global', 'scene-main'],
    tab: 'Place',
    drive: () => typeAndCommit('Content X exact position', '0.25'),
    expected: (value) => ({ ...value, transform: { ...value.transform, positionX: 0.25 } }),
    display: () => expectValue('Content X exact position', '0.25'),
  },
  {
    name: 'Content Y stores a placement-unit position',
    scopes: ['scene-main'],
    tab: 'Place',
    drive: () => typeAndCommit('Content Y exact position', '-0.5'),
    expected: (value) => ({ ...value, transform: { ...value.transform, positionY: -0.5 } }),
    display: () => expectValue('Content Y exact position', '-0.5'),
  },
  {
    name: 'Content Width stores a placement-unit scale',
    scopes: ['scene-main'],
    tab: 'Place',
    drive: () => typeAndCommit('Content Width exact multiplier', '1.5x'),
    expected: (value) => ({ ...value, transform: { ...value.transform, scaleX: 1.5 } }),
    display: () => expectValue('Content Width exact multiplier', '1.5'),
  },
  {
    name: 'Content Height stores a placement-unit scale',
    scopes: ['scene-main'],
    tab: 'Place',
    drive: () => typeAndCommit('Content Height exact multiplier', '0.5x'),
    expected: (value) => ({ ...value, transform: { ...value.transform, scaleY: 0.5 } }),
    display: () => expectValue('Content Height exact multiplier', '0.5'),
  },
  {
    name: 'Rotation displays degrees and stores turns',
    scopes: ['scene-main'],
    tab: 'Place',
    drive: () => typeAndCommit('Rotation exact rotation', '90'),
    expected: (value) => ({ ...value, transform: { ...value.transform, rotation: 0.25 } }),
    display: () => expectValue('Rotation exact rotation', '90'),
  },
  {
    name: 'selecting the Aperture summary enables the Viewport from content bounds',
    scopes: ['scene-main'],
    tab: 'Place',
    drive: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    expected: (value) => ({
      ...value,
      viewport: enableViewportForContent({
        transform: value.transform,
        viewport: value.viewport,
        grid: 3,
      }),
    }),
    display: (next) => {
      // The click also moved focus to the aperture, so the geometry stack now
      // edits the enabled Viewport.
      expectValue('Viewport X exact position', String(next.viewport.x))
      expectValue('Viewport Y exact position', String(next.viewport.y))
    },
  },
  {
    name: 'Viewport X stores aperture geometry once enabled',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Viewport X exact position', '0.25'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, x: 0.25 } }),
    display: () => expectValue('Viewport X exact position', '0.25'),
  },
  {
    name: 'Viewport Y stores aperture geometry once enabled',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Viewport Y exact position', '0.5'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, y: 0.5 } }),
    display: () => expectValue('Viewport Y exact position', '0.5'),
  },
  {
    name: 'Viewport Width stores aperture geometry once enabled',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Viewport Width exact multiplier', '0.5x'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, width: 0.5 } }),
    display: () => expectValue('Viewport Width exact multiplier', '0.5'),
  },
  {
    name: 'Viewport Height stores aperture geometry once enabled',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Viewport Height exact multiplier', '2x'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, height: 2 } }),
    display: () => expectValue('Viewport Height exact multiplier', '2'),
  },
  {
    name: 'Aperture shape stores the inscribed ellipse',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => choose('Aperture shape', 'ellipse'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, aperture: 'ellipse' } }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Aperture shape' })).toHaveValue('ellipse')
      // Every Aperture defaults the edge Soft, so the width field appears.
      expect(screen.getByRole('combobox', { name: 'Aperture edge' })).toHaveValue('soft')
      expect(screen.getByRole('textbox', { name: 'Aperture edge width' })).toBeInTheDocument()
    },
  },
  {
    name: 'Aperture shape compacts back to the rectangle default',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'ellipse' } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => choose('Aperture shape', 'rectangle'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, aperture: undefined } }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Aperture shape' })).toHaveValue('rectangle')
      expect(screen.getByRole('combobox', { name: 'Aperture edge' })).toHaveValue('soft')
      expect(screen.getByRole('textbox', { name: 'Aperture edge width' })).toBeInTheDocument()
    },
  },
  {
    name: 'Aperture shape stores each catalogue silhouette',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => choose('Aperture shape', 'diamond'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, aperture: 'diamond' } }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Aperture shape' })).toHaveValue('diamond')
      expect(screen.getByRole('combobox', { name: 'Aperture edge' })).toHaveValue('soft')
    },
  },
  {
    name: 'Ring width stores a clamped band fraction',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'ring' } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Aperture ring width', '0.5'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, ringWidth: 0.5 } }),
    display: () => expectValue('Aperture ring width', '0.5'),
  },
  {
    name: 'Corner radius stores a clamped rounding fraction',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'rounded-box' } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Aperture corner radius', '0.4'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, cornerRadius: 0.4 } }),
    display: () => expectValue('Aperture corner radius', '0.4'),
  },
  {
    name: 'leaving a parametered shape drops its parameter',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'ring', ringWidth: 0.5 } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => choose('Aperture shape', 'ellipse'),
    expected: (value) => ({
      ...value,
      viewport: { ...value.viewport, aperture: 'ellipse', ringWidth: undefined },
    }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Aperture shape' })).toHaveValue('ellipse')
      expect(screen.queryByRole('textbox', { name: 'Aperture ring width' })).toBeNull()
    },
  },
  {
    name: 'Aperture edge stores an explicit hard override',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'ellipse' } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => choose('Aperture edge', 'hard'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, edge: 'hard' } }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Aperture edge' })).toHaveValue('hard')
      expect(screen.queryByRole('textbox', { name: 'Aperture edge width' })).toBeNull()
    },
  },
  {
    name: 'Aperture edge stores the Stable Dither policy',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'ellipse' } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => choose('Aperture edge', 'dither'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, edge: 'dither' } }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Aperture edge' })).toHaveValue('dither')
      // Dither thresholds the same band, so the width field stays.
      expect(screen.getByRole('textbox', { name: 'Aperture edge width' })).toBeInTheDocument()
    },
  },
  {
    name: 'Aperture edge width stores an authored feather',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'ellipse' } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Aperture edge width', '0.05'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, feather: 0.05 } }),
    display: () => expectValue('Aperture edge width', '0.05'),
  },
  {
    name: 'a zero edge width restores the density default',
    scopes: ['scene-main'],
    tab: 'Place',
    seed: { viewport: { enabled: true, aperture: 'ellipse', feather: 0.05 } },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' })),
    drive: () => typeAndCommit('Aperture edge width', '0'),
    expected: (value) => ({ ...value, viewport: { ...value.viewport, feather: undefined } }),
    display: () => expectValue('Aperture edge width', '0'),
  },
  {
    name: 'adding a stack Effect appends one normalized Effect',
    scopes: ['scene-main'],
    tab: 'Effects',
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Add Effect' })),
    drive: () => fireEvent.click(screen.getByRole('button', { name: 'Add Translate Effect' })),
    // Only the generated id comes from the patch; the kind and its normalized
    // defaults are pinned independently, so a palette entry applying the wrong
    // Effect cannot satisfy its own oracle.
    expected: (value, patches) => ({
      ...value,
      effects: normalizeShowClipEffects([{
        id: patches[patches.length - 1].effects?.[0]?.id ?? '',
        kind: 'translate',
      } as ShowClipEffect]),
    }),
    display: () => {
      expect(screen.getByRole('button', { name: 'More actions for Translate Effect' })).toBeInTheDocument()
    },
  },
  {
    name: 'removing the only stack Effect empties the stack',
    scopes: ['scene-main'],
    tab: 'Effects',
    seed: { effects: [{ id: 'fx-seed', kind: 'translate', x: 0.2, y: 0.1 }] },
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'More actions for Translate Effect' })),
    drive: () => fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Translate Effect' })),
    expected: (value) => ({ ...value, effects: [] }),
    display: () => {
      expect(screen.queryByRole('button', { name: 'More actions for Translate Effect' })).toBeNull()
    },
  },
  {
    name: 'adding Mirror routes to the placement view instead of the stack',
    scopes: ['scene-overlay'],
    tab: 'Effects',
    prepare: () => fireEvent.click(screen.getByRole('button', { name: 'Add Effect' })),
    drive: () => fireEvent.click(screen.getByRole('button', { name: 'Add Mirror Effect' })),
    expected: (value) => ({ ...value, view: { ...value.view, mirror: true } }),
    display: () => {
      expect(screen.getByTestId('show-effect-mirror')).toBeInTheDocument()
    },
  },
  {
    name: 'Presentation Strobe stores its default cadence',
    scopes: ['scene-main'],
    tab: 'Playback',
    drive: () => choose('Clip presentation', 'strobe'),
    expected: (value) => ({ ...value, presentation: { mode: 'strobe', cadenceMs: 1_000 } }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Clip presentation' })).toHaveValue('strobe')
      expectValue('Strobe cadence seconds exact time', '1')
    },
  },
  {
    name: 'Strobe cadence stores rounded milliseconds',
    scopes: ['scene-main'],
    tab: 'Playback',
    seed: { presentation: { mode: 'strobe', cadenceMs: 1_000 } },
    drive: () => typeAndCommit('Strobe cadence seconds exact time', '0.5'),
    expected: (value) => ({ ...value, presentation: { mode: 'strobe', cadenceMs: 500 } }),
    display: () => expectValue('Strobe cadence seconds exact time', '0.5'),
  },
  {
    name: 'enabling Blink adopts the default gate',
    scopes: ['scene-overlay'],
    tab: 'Playback',
    drive: () => toggle('Blink Clip output'),
    expected: (value) => ({ ...value, blink: { rateHz: 2, duty: 0.5, phase: 0 } }),
    display: () => {
      expect(screen.getByRole('checkbox', { name: 'Blink Clip output' })).toBeChecked()
      expect(screen.getByRole('textbox', { name: 'Blink rate Hz' })).toBeInTheDocument()
    },
  },
  {
    name: 'Blink rate stores clamped Hz',
    scopes: ['scene-main'],
    tab: 'Playback',
    seed: { blink: { rateHz: 2, duty: 0.5, phase: 0 } },
    drive: () => typeAndCommit('Blink rate Hz', '4'),
    expected: (value) => ({ ...value, blink: { ...value.blink!, rateHz: 4 } }),
    display: () => expectValue('Blink rate Hz', '4'),
  },
  {
    name: 'Blink duty stores a clamped fraction',
    scopes: ['scene-main'],
    tab: 'Playback',
    seed: { blink: { rateHz: 2, duty: 0.5, phase: 0 } },
    drive: () => typeAndCommit('Blink duty exact percentage', '25%'),
    expected: (value) => ({ ...value, blink: { ...value.blink!, duty: 0.25 } }),
    display: () => expectValue('Blink duty exact percentage', '25'),
  },
  {
    name: 'Blink phase stores a clamped fraction',
    scopes: ['scene-main'],
    tab: 'Playback',
    seed: { blink: { rateHz: 2, duty: 0.5, phase: 0 } },
    drive: () => typeAndCommit('Blink phase exact phase', '0.5'),
    expected: (value) => ({ ...value, blink: { ...value.blink!, phase: 0.5 } }),
    display: () => expectValue('Blink phase exact phase', '0.5'),
  },
  {
    name: 'Phase stores a placement view fraction',
    scopes: SCOPES,
    tab: 'Playback',
    drive: () => typeAndCommit('Phase exact phase', '0.5'),
    expected: (value) => ({ ...value, view: { ...value.view, phase: 0.5 } }),
    display: () => expectValue('Phase exact phase', '0.5'),
  },
  {
    name: 'Evaluation stores freeze-at-entry',
    scopes: SCOPES,
    tab: 'Playback',
    drive: () => choose('Clip evaluation', 'freeze-at-entry'),
    expected: (value) => ({ ...value, evaluationPolicy: 'freeze-at-entry' }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Clip evaluation' })).toHaveValue('freeze-at-entry')
    },
  },
  {
    name: 'Evaluation stores rolling-refresh',
    scopes: ['global'],
    tab: 'Playback',
    drive: () => choose('Clip evaluation', 'rolling-refresh'),
    expected: (value) => ({ ...value, evaluationPolicy: 'rolling-refresh' }),
    display: () => {
      expect(screen.getByRole('combobox', { name: 'Clip evaluation' })).toHaveValue('rolling-refresh')
    },
  },
  {
    name: 'an impossible Duration is refused without partial state',
    scopes: ['scene-overlay'],
    drive: () => typeAndCommit('Duration seconds exact time', '1000'),
    expected: (value) => value,
    display: () => expectValue('Duration seconds exact time', '2'),
    refused: true,
  },
]

/** Applies each emitted patch exactly as ShowEditor's store wiring would. */
function applyPatches(
  show: ShowRecord,
  owner: ShowClipInspectorOwner,
  patches: ShowClipInspectorPatch[],
): ShowRecord {
  return patches.reduce((current, patch) => updateShowClipInspector(current, owner, patch), show)
}

beforeEach(resetShowClipDetailTabMemory)

describe('Clip detail field round-trip matrix (#658)', () => {
  const cases = ROWS.flatMap((row) => row.scopes.map((scope) => ({ row, scope })))

  it.each(cases.map(({ row, scope }) => [`${row.name} (${scope})`, row, scope] as const))(
    '%s',
    (_title, row, scope) => {
      let show = fixture()
      const owner = ownerFor(show, scope)
      if (row.seed) {
        const seeded = updateShowClipInspector(show, owner, row.seed)
        expect(seeded, 'seed patch must be accepted').not.toBe(show)
        show = seeded
      }
      const value = projectShowClipInspector(show, owner)
      expect(value).not.toBeNull()

      // Mirrors ShowEditor.commitClipInspectorPatch exactly: apply through the
      // real engine, return false on refusal so fields revert their drafts.
      let current = show
      const patches: ShowClipInspectorPatch[] = []
      const onPatch = vi.fn((patch: ShowClipInspectorPatch) => {
        patches.push(patch)
        const applied = updateShowClipInspector(current, owner, patch)
        if (applied === current) return false
        current = applied
        return Promise.resolve()
      })
      const props = matrixProps(scope, value!, onPatch)
      const { rerender } = render(<ShowClipEntityDetail {...props} />)
      if (row.tab) showTab(row.tab)

      row.prepare?.()
      const patchesBeforeDrive = patches.length
      row.drive()
      expect(patches.length, 'the drive must emit at least one patch').toBeGreaterThan(patchesBeforeDrive)

      const next = current
      if (row.refused) {
        expect(next, 'a refused edit must return the same ShowRecord reference').toBe(show)
      } else {
        expect(next, 'an accepted edit must produce a new ShowRecord').not.toBe(show)
      }
      if (scope !== 'global') {
        expect(validateShowComposition(next, next.composition!)).toEqual([])
      }

      const nextValue = projectShowClipInspector(next, owner)
      expect(nextValue).not.toBeNull()
      expect(nextValue).toEqual(row.expected(value!, patches))

      // The dialog must display exactly what the engine stored.
      rerender(<ShowClipEntityDetail {...props} value={nextValue!} />)
      row.display(nextValue!)
    },
  )
})

describe('Clip detail scope capability sweep (#658)', () => {
  function renderScope(scope: Scope, overrides: Partial<ShowClipEntityDetailProps> = {}) {
    const show = fixture()
    const owner = ownerFor(show, scope)
    const value = projectShowClipInspector(show, owner)!
    render(
      <ShowClipEntityDetail
        {...matrixProps(scope, value, vi.fn())}
        {...overrides}
      />,
    )
    return { value }
  }

  it.each(SCOPES)('renders exactly the %s header fields the capabilities declare', (scope) => {
    const capabilities = showClipInspectorCapabilities(scope)
    renderScope(scope)
    const rendered = [...screen.getByTestId('clip-header-fields').querySelectorAll('[data-header-field]')]
      .map((field) => field.getAttribute('data-header-field'))
    const expected = [
      ...(capabilities.localTiming ? ['start', 'duration'] : []),
      'brightness',
      ...(capabilities.sourceOverOpacity ? ['opacity'] : []),
    ]
    expect(rendered).toEqual(expected)
  })

  it.each(SCOPES)('renders exactly the %s Pattern tab controls the capabilities declare', (scope) => {
    const capabilities = showClipInspectorCapabilities(scope)
    renderScope(scope)
    expect(screen.getByRole('combobox', { name: 'Source pattern' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Animation speed exact multiplier' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Pattern controls' })).toBeInTheDocument()
    expect(Boolean(screen.queryByRole('combobox', { name: 'Overlay target layer' })))
      .toBe(capabilities.layerAssignment)
  })

  it.each(SCOPES)('renders exactly the %s Playback rows the capabilities declare', (scope) => {
    const capabilities = showClipInspectorCapabilities(scope)
    renderScope(scope)
    showTab('Playback')
    const table = screen.getByRole('table', { name: 'Playback controls' })
    const rows = within(table).getAllByRole('rowheader').map((header) => header.textContent ?? '')
    const expected = [
      // Presentation and Blink gate whole-Clip playback, which only exists for
      // placements: capabilities.localActions is the declared flag for that cut.
      ...(capabilities.localActions ? ['Presentation', 'Blink output'] : []),
      expect.stringContaining('Phase'),
      'Evaluation',
    ]
    expect(rows).toEqual(expected)
  })

  it.each(SCOPES)('offers every tab to %s, and Place only on a 2D Stage', (scope) => {
    renderScope(scope)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace('(has changes)', '')))
      .toEqual(['Pattern', 'Place', 'Effects', 'Playback'])
  })

  it.each(SCOPES)('drops only the Place tab off a 2D Stage for %s', (scope) => {
    renderScope(scope, { transformEnabled: false })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace('(has changes)', '')))
      .toEqual(['Pattern', 'Effects', 'Playback'])
  })
})

describe('Clip detail read-only sweep (#658)', () => {
  /**
   * Seeds every optional sub-surface (strobe cadence, blink timing, an Effect,
   * an enabled viewport) so the sweep sees the maximal control set, then walks
   * every tab interacting with everything.
   *
   * The sweep renders the production read-only composition, not a stand-in:
   * both ShowEditor call sites pass readOnly={false} to the dialog and the
   * disabling comes entirely from InspectorPanel's context-controlled
   * fieldset. Rendering through the exported InspectorPanel under the
   * exported context means removing or relocating that fieldset fails this
   * sweep, exactly the drift it exists to catch.
   */
  function renderReadOnly(scope: Scope) {
    let show = fixture()
    const owner = ownerFor(show, scope)
    const seeds: ShowClipInspectorPatch[] = [
      { presentation: { mode: 'strobe', cadenceMs: 1_000 } },
      { blink: { rateHz: 2, duty: 0.5, phase: 0 } },
      { effects: [{ id: 'fx-seed', kind: 'translate', x: 0.2, y: 0.1 }] },
      { viewport: { enabled: true } },
    ]
    show = applyPatches(show, owner, seeds)
    const value = projectShowClipInspector(show, owner)!
    const onPatch = vi.fn()
    const onMoveLayer = vi.fn()
    render(
      <InspectorReadOnlyContext.Provider value={true}>
        <InspectorPanel family="Clip" heading={value.patternName} icon={<span aria-hidden />}>
          <ShowClipEntityDetail
            {...matrixProps(scope, value, onPatch)}
            onMoveLayer={onMoveLayer}
            readOnly={false}
            embedded
          />
        </InspectorPanel>
      </InspectorReadOnlyContext.Provider>,
    )
    return { onPatch, onMoveLayer }
  }

  it.each(SCOPES)('disables every %s control and emits no patch under any interaction', (scope) => {
    const { onPatch, onMoveLayer } = renderReadOnly(scope)
    const tabs: TabName[] = ['Pattern', 'Place', 'Effects', 'Playback']
    for (const tab of tabs) {
      showTab(tab)
      expect(screen.getByRole('tabpanel')).toHaveAttribute('data-active-tab', tab.toLowerCase())
      for (const control of [
        ...screen.queryAllByRole('textbox'),
        ...screen.queryAllByRole('combobox'),
        ...screen.queryAllByRole('checkbox'),
        ...screen.queryAllByRole('spinbutton'),
      ]) {
        // Disabled is the whole contract for form controls: a real browser
        // never dispatches change events on a disabled control, so firing one
        // synthetically would only test React, not the dialog.
        expect(control, `${tab}: ${control.getAttribute('aria-label')}`).toBeDisabled()
      }
      // Click whatever is genuinely clickable. The :disabled matcher is the
      // one a real browser enforces - it includes fieldset-inherited
      // disabling, which the disabled attribute alone misses. Buttons
      // revealed by clicks (portal menus) join the walk until nothing new
      // appears.
      const clicked = new Set<HTMLElement>()
      for (;;) {
        const fresh = screen.queryAllByRole('button')
          .filter((button) => !button.matches(':disabled') && !clicked.has(button))
        if (fresh.length === 0) break
        for (const button of fresh) {
          clicked.add(button)
          fireEvent.click(button)
        }
      }
      expect(screen.queryAllByRole('menuitem'), `${tab}: no action menu may open`).toEqual([])
    }
    // The Effect action-menu trigger and parameter editors must be inside the
    // disabled boundary - the reviewer scenario is a read-only user editing or
    // removing an Effect through them.
    showTab('Effects')
    expect(screen.getByRole('button', { name: 'More actions for Translate Effect' })).toBeDisabled()
    expect(onPatch).not.toHaveBeenCalled()
    expect(onMoveLayer).not.toHaveBeenCalled()
  })
})

describe('Clip detail typed-edit lifecycle sweep (#658)', () => {
  /**
   * One representative textbox per tab family. Typing must not commit,
   * Escape must abandon the draft without a patch, and one blur must commit
   * exactly once - the per-field double-commit and drift regressions all
   * violate one of these three.
   */
  const FIELDS: Array<{ name: string; tab?: TabName; field: string; draft: string }> = [
    { name: 'header Brightness', field: 'Brightness exact percentage', draft: '35%' },
    { name: 'Pattern Speed', tab: 'Pattern', field: 'Animation speed exact multiplier', draft: '2x' },
    { name: 'Place Content X', tab: 'Place', field: 'Content X exact position', draft: '0.25' },
    { name: 'Playback Phase', tab: 'Playback', field: 'Phase exact phase', draft: '0.5' },
  ]

  it.each(FIELDS.map((row) => [row.name, row] as const))(
    '%s commits once on blur, never while typing, and abandons on Escape',
    (_title, { tab, field, draft }) => {
      const show = fixture()
      const owner = ownerFor(show, 'scene-main')
      const value = projectShowClipInspector(show, owner)!
      const onPatch = vi.fn()
      render(<ShowClipEntityDetail {...matrixProps('scene-main', value, onPatch)} />)
      if (tab) showTab(tab)

      const control = screen.getByRole('textbox', { name: field })
      const committed = (control as HTMLInputElement).value
      fireEvent.focus(control)
      fireEvent.change(control, { target: { value: draft } })
      expect(onPatch, 'typing must not commit').not.toHaveBeenCalled()

      fireEvent.keyDown(control, { key: 'Escape' })
      expect(onPatch, 'Escape must abandon the draft').not.toHaveBeenCalled()
      expect(control).toHaveValue(committed)

      fireEvent.change(control, { target: { value: draft } })
      fireEvent.blur(control)
      expect(onPatch, 'blur must commit exactly once').toHaveBeenCalledTimes(1)
    },
  )
})
