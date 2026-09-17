import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { ShowStagePreview } from './ShowStagePreview'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { prepareShowStageV2, type ShowPreparedStageBundleV2 } from '@/engine/showPreparedStageV2'
import { buildShowStageOccurrenceProjectionV2 } from '@/engine/showStagePresentationV2'
import { applyShowStageMaskPacked, createShowStageMaskPlan } from '@/engine/zonePreview'
import { createCustomMap } from '@/engine/maps'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import * as replay from '@/engine/fastReplay'
import * as rendering from '@/engine/renderer'
import * as previewCompilation from '@/engine/showPreviewArtifact'
import { showInitialState, useShowStore } from '@/store/showStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'

const STAGE_POINTS: [number, number][] = [[0, 0], [0.25, 0], [0.75, 1], [1, 1]]

/**
 * Four Stage pixels, two Zones and two physical Layouts that swap their halves
 * at 500 ms, so a soloed Zone owns different pixels before and after the switch.
 */
function isolationBundle(options: { narrowLater?: boolean } = {}): ShowPreparedStageBundleV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion refused')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.stageMapId = 'stage'
  record.outputContract = createInstallationShowOutputContract({ outputMapId: 'stage', pixelCount: 4 })
  record.zones = [
    { id: 'zone', name: 'Main', nominalPixelCount: 2 },
    { id: 'accent', name: 'Accent', nominalPixelCount: 2 },
  ]
  record.zoneLayouts = [
    {
      id: 'layout',
      name: 'First',
      zones: [
        { zoneId: 'zone', ranges: [{ start: 0, end: 1 }] },
        { zoneId: 'accent', ranges: [{ start: 2, end: 3 }] },
      ],
    },
    {
      id: 'later',
      name: 'Later',
      zones: options.narrowLater
        ? [
          { zoneId: 'zone', ranges: [{ start: 2, end: 2 }] },
          { zoneId: 'accent', ranges: [{ start: 3, end: 3 }] },
        ]
        : [
          { zoneId: 'zone', ranges: [{ start: 2, end: 3 }] },
          { zoneId: 'accent', ranges: [{ start: 0, end: 1 }] },
        ],
    },
  ]
  record.composition.layoutOccurrences = [
    { id: 'a', layoutId: 'layout', startMs: 0, durationMs: 500, parameters: {} },
    { id: 'b', layoutId: 'later', startMs: 500, durationMs: 500, parameters: {} },
  ]
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'pattern' }
  record.composition.patternInstances.push({
    id: 'accent-instance', pattern: { kind: 'user', id: 'accent-pattern' }, patternName: 'Blue',
    time: { timeScale: 1, timeOffsetMs: 0 },
  })
  record.composition.layers.push({ id: 'accent-layer', zoneId: 'accent', name: 'Main', rank: 0 })
  record.composition.clips.push({
    ...structuredClone(record.composition.clips[0]),
    id: 'accent-clip', instanceId: 'accent-instance', zoneId: 'accent', layerId: 'accent-layer',
  })
  const result = prepareShowStageV2(record, {
    patterns: [
      { id: 'pattern', name: 'Red', src: 'export function render2D(i,x,y){rgb(1,0,0)}', updatedAt: 1, controls: {} },
      { id: 'accent-pattern', name: 'Blue', src: 'export function render2D(i,x,y){rgb(0,0,1)}', updatedAt: 1, controls: {} },
    ],
    libraries: [], maps: [], profiles: [],
    stageMap: createCustomMap(STAGE_POINTS, { id: 'stage', name: 'Stage' }),
  })
  if (result.status !== 'ready') throw new Error(result.status === 'refused' ? result.message : 'Unexpected empty')
  return result.bundle
}

function maskedBy(bundle: ShowPreparedStageBundleV2, layoutId: string, frame: Float64Array, soloZoneId: string | null) {
  const projection = buildShowStageOccurrenceProjectionV2(bundle.record, layoutId, {
    mapPoints: bundle.presentation.layout.mapPoints,
    splitPosition: 0.5,
  })
  return applyShowStageMaskPacked(frame, createShowStageMaskPlan(projection, 4), soloZoneId).slice()
}

function trackPaints() {
  const paints: Float64Array[] = []
  const originalRenderer = rendering.createRenderer
  vi.spyOn(rendering, 'createRenderer').mockImplementation((...args) => {
    const renderer = originalRenderer(...args)
    const originalPaint = renderer.paint.bind(renderer)
    renderer.paint = (...paintArgs) => {
      const frame = paintArgs[0]
      if (!(frame instanceof Float64Array)) throw new Error('Expected packed Float64 Stage frame')
      paints.push(frame.slice())
      originalPaint(...paintArgs)
    }
    return renderer
  })
  return paints
}

function oracleRuntime(bundle: ShowPreparedStageBundleV2) {
  return createFastReplayRuntime({ ...bundle.artifact, dimension: 2 }, {
    fidelity: usePreviewStore.getState().fidelity,
    randomSeed: 1038,
    mapPoints: bundle.presentation.layout.mapPoints,
  })
}

beforeEach(() => {
  useShowStore.setState(showInitialState)
  usePreviewStore.setState({ ...previewInitialState, isRunning: false })
  useShowTransportStore.setState(showTransportInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
})
afterEach(() => { vi.restoreAllMocks() })

it.each(['fast', 'fidelity'] as const)('isolates the soloed Zone through the active Layout in %s without touching renderer input', async fidelity => {
  const captured = isolationBundle()
  usePreviewStore.setState({ fidelity })
  const compile = vi.spyOn(previewCompilation, 'compileShowForPreview')
  const runtimeFactory = vi.spyOn(replay, 'createFastReplayRuntime')
  const paints = trackPaints()
  const user = userEvent.setup()
  render(<ShowStagePreview kind="prepared-v2" bundle={captured} />)

  // Generated output, compilation and runtime identity never observe presentation.
  expect(compile).not.toHaveBeenCalled()
  expect(runtimeFactory).toHaveBeenCalledTimes(1)
  expect(runtimeFactory.mock.calls[0][0]).toMatchObject({ code: captured.artifact.code, metadata: captured.artifact.metadata, dimension: 2 })
  expect(runtimeFactory.mock.calls[0][1]).toMatchObject({ mapPoints: captured.presentation.layout.mapPoints, fidelity })

  const oracle = oracleRuntime(captured)
  const first = oracle.renderCurrentFrame().frame.slice()
  // Complete Layout coverage: presentation adds nothing until a Zone is soloed.
  expect(paints[0]).toEqual(first)

  await user.click(screen.getByRole('button', { name: 'Solo zone Main' }))
  expect(paints[paints.length - 1]).toEqual(maskedBy(captured, 'layout', first, 'zone'))
  expect(Array.from(paints[paints.length - 1].slice(6))).toEqual([0, 0, 0, 0, 0, 0])

  act(() => { useShowTransportStore.getState().requestSeek(captured.record.id, 625) })
  await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
  const later = oracle.advanceTo(625, { stepMs: 1000 / 60, forceFullIntermediateRender: true }).frame.slice()
  // The same soloed Zone owns the other Stage half once the later Layout runs.
  expect(paints[paints.length - 1]).toEqual(maskedBy(captured, 'later', later, 'zone'))
  expect(Array.from(paints[paints.length - 1].slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0])
  expect(paints[paints.length - 1][6]).toBe(1)

  // No presentation toggle recompiled or re-created a runtime for another artifact.
  expect(compile).not.toHaveBeenCalled()
  expect(runtimeFactory.mock.calls.every(([program]) => program.code === captured.artifact.code)).toBe(true)

  await user.click(screen.getByRole('button', { name: 'Show all zones' }))
  expect(paints[paints.length - 1]).toEqual(later)
  expect(useShowTransportStore.getState().positionMs).toBe(625)
})

it('dims only the pixels the active Layout leaves unstaged and says how many', async () => {
  const captured = isolationBundle({ narrowLater: true })
  const paints = trackPaints()
  render(<ShowStagePreview kind="prepared-v2" bundle={captured} />)

  const oracle = oracleRuntime(captured)
  expect(paints[0]).toEqual(oracle.renderCurrentFrame().frame)
  expect(screen.queryByText(/stage pixels are not covered by a show zone/)).not.toBeInTheDocument()

  act(() => { useShowTransportStore.getState().requestSeek(captured.record.id, 625) })
  await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
  const later = oracle.advanceTo(625, { stepMs: 1000 / 60, forceFullIntermediateRender: true }).frame.slice()
  expect(paints[paints.length - 1]).toEqual(maskedBy(captured, 'later', later, null))
  expect(Array.from(paints[paints.length - 1].slice(0, 6))).toEqual([0.055, 0.055, 0.06, 0.055, 0.055, 0.06])
  await waitFor(() => expect(screen.getByText('2 stage pixels are not covered by a show zone.')).toBeInTheDocument())
})

it('draws authored Zone guides from the active Layout occurrence', async () => {
  const captured = isolationBundle()
  const user = userEvent.setup()
  render(<ShowStagePreview kind="prepared-v2" bundle={captured} />)

  expect(screen.queryByTestId('show-stage-zone-outlines')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Show Zone outlines' }))
  const rects = () => [...screen.getByTestId('show-stage-zone-outlines').querySelectorAll('rect')]
    .map(rect => [rect.getAttribute('x'), rect.getAttribute('width')])
  expect(rects()).toEqual([['0', '0.25'], ['0.75', '0.25']])

  act(() => { useShowTransportStore.getState().requestSeek(captured.record.id, 625) })
  await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
  await waitFor(() => expect(rects()).toEqual([['0.75', '0.25'], ['0', '0.25']]))

  // The Scene-derived Clip outline stays a legacy-only control.
  expect(screen.queryByRole('button', { name: /Selected Clip outline/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Hide Zone outlines' }))
  expect(screen.queryByTestId('show-stage-zone-outlines')).not.toBeInTheDocument()
})
