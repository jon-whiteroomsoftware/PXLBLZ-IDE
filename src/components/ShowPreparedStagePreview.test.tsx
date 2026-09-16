import { act, render, screen, waitFor } from '@testing-library/react'
import { expect, it, beforeEach, afterEach, vi } from 'vitest'
import { ShowStagePreview } from './ShowStagePreview'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { prepareShowStageV2 } from '@/engine/showPreparedStageV2'
import { createCustomMap } from '@/engine/maps'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import * as replay from '@/engine/fastReplay'
import * as rendering from '@/engine/renderer'
import * as checkpoints from '@/engine/fastReplayCheckpoints'
import * as observations from '@/dev/agentObservation'
import * as previewCompilation from '@/engine/showPreviewArtifact'
import { showInitialState, useShowStore } from '@/store/showStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'

function bundle(options: { dimension?: 2 | 3; id?: string; stamp?: number } = {}) {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion refused')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  if (options.id) record.id = options.id
  if (options.stamp) record.updatedAt = options.stamp
  record.stageMapId = 'stage'
  record.outputContract = createInstallationShowOutputContract({ outputMapId: 'stage', pixelCount: 2 })
  record.zoneLayouts = [
    { id: 'layout', name: 'First', zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: 0 }] }] },
    { id: 'later', name: 'Later', zones: [{ zoneId: 'zone', ranges: [{ start: 1, end: 1 }] }] },
  ]
  record.composition.layoutOccurrences = [{ id: 'a', layoutId: 'layout', startMs: 0, durationMs: 500, parameters: {} }, { id: 'b', layoutId: 'later', startMs: 500, durationMs: 500, parameters: {} }]
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'pattern' }
  const result = prepareShowStageV2(record, { patterns: [{ id: 'pattern', name: 'Red', src: 'export function render2D(i,x,y){rgb(1,0,0)}', updatedAt: 1, controls: {} }], libraries: [], maps: [], profiles: [], stageMap: createCustomMap(options.dimension === 3 ? [[0, 0, 0], [1, 1, 1]] : [[0, 0], [1, 1]], { id: 'stage', name: 'Stage' }) })
  if (result.status !== 'ready') throw new Error(result.status === 'refused' ? result.message : 'Unexpected empty')
  return result.bundle
}
beforeEach(() => {
  useShowStore.setState(showInitialState)
  usePreviewStore.setState({ ...previewInitialState, isRunning: false })
  useShowTransportStore.setState(showTransportInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
})
afterEach(() => { vi.restoreAllMocks() })
it.each(['fast', 'fidelity'] as const)('prepared%s Stage paints complete compiler frames across Layout switch without recompile/solo/guides', async fidelity => {
  const captured = bundle()
  usePreviewStore.setState({ fidelity })
  useShowEditorSessionStore.setState({ diagnostics: { ...showEditorSessionInitialState.diagnostics, zoneOutlines: true, clipOutlines: true } })
  const compile = vi.spyOn(previewCompilation, 'compileShowForPreview')
  const runtimeFactory = vi.spyOn(replay, 'createFastReplayRuntime')
  const originalRenderer = rendering.createRenderer
  const paints: Float64Array[] = []
  vi.spyOn(rendering, 'createRenderer').mockImplementation((...args) => {
    const renderer = originalRenderer(...args)
    const originalPaint = renderer.paint.bind(renderer)
    renderer.paint = (...paintArgs) => { const frame = paintArgs[0]; if (frame instanceof Float64Array) paints.push(frame.slice()); else throw new Error('Expected packed Float64 Stage frame');originalPaint(...paintArgs) }
    return renderer
  })
  render(<ShowStagePreview kind="prepared-v2" bundle={captured} />)
  expect(compile).not.toHaveBeenCalled()
  expect(runtimeFactory).toHaveBeenCalledTimes(1)
  expect(runtimeFactory.mock.calls[0][0]).toMatchObject({ code: captured.artifact.code, metadata: captured.artifact.metadata, dimension: 2 })
  expect(screen.queryByRole('button', { name: /Solo zone|Show Zone outlines|Show Selected Clip outline/ })).not.toBeInTheDocument()
  expect(screen.queryByTestId('show-stage-zone-outlines')).not.toBeInTheDocument()
  const oracle = createFastReplayRuntime({ ...captured.artifact, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: captured.presentation.layout.mapPoints })
  expect(paints[0]).toEqual(oracle.renderCurrentFrame().frame)
  act(() => useShowTransportStore.getState().requestSeek(captured.record.id, 625))
  await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
  expect(paints[paints.length - 1]).toEqual(oracle.advanceTo(625, { stepMs: 1000 / 60, forceFullIntermediateRender: true }).frame)
  expect(paints[paints.length - 1][3]).toBe(1)
})


it.each(['record', 'dependency/dimension', 'navigation', 'unmount'] as const)('retires captured prepared publication after delayed seek and %s replacement', async change => {
  const first = bundle()
  useShowTransportStore.getState().openShow(first.record.id, first.presentation.durationMs)
  useShowTransportStore.getState().setPosition(first.record.id, 625)
  const original = checkpoints.reconstructFastReplayWithCheckpoints
  const completions: Array<() => Promise<void>> = []
  vi.spyOn(checkpoints, 'reconstructFastReplayWithCheckpoints').mockImplementation(options => new Promise((resolve, reject) => {
    completions.push(async () => {
      try { resolve(await original({ ...options, isCurrent: () => true })) }
      catch (error) { reject(error) }
    })
  }))
  const published = vi.spyOn(observations, 'recordAgentObservation')
  const view = render(<ShowStagePreview kind="prepared-v2" bundle={first} />)
  expect(completions).toHaveLength(1)
  const next = bundle({ stamp: 2, dimension: change === 'dependency/dimension' ? 3 : 2, id: change === 'navigation' ? 'next-captured-show' : first.record.id })
  // Original reference tokens are never reread for published semantic stamps.
  first.identity.record.updatedAt = 999
  if (change === 'unmount') view.unmount()
  else {
    view.rerender(<ShowStagePreview kind="prepared-v2" bundle={next} />)
    if (completions.length > 1) await act(async () => { await completions[completions.length - 1]() })
  }
  const current = published.mock.calls.filter(([event]) => event.kind === 'preview-published')
  if (change === 'unmount') expect(current).toEqual([])
  else {
    expect(current.length).toBeGreaterThan(0)
    expect(current[current.length - 1][0]).toMatchObject({ showId: next.record.id, digest: next.digest, updatedAt: 2 })
  }
  await act(async () => { await completions[0]() })
  expect(published.mock.calls.filter(([event]) => event.kind === 'preview-published')).toHaveLength(current.length)
})
