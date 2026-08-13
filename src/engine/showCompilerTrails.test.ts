import { createFastReplayRuntime } from './fastReplay'
import { compileShow } from './showCompiler'

const ALTERNATING_PATTERN = `
var live = 0
export function beforeRender(delta) { live = live ? 0 : 1 }
export function render(index) { rgb(live, 0, 0) }
`

describe('Show output Trails Effect (#537)', () => {
  it('reuses the three-plane arena for linear-RGB previous-frame decay', () => {
    const artifact = compileShow({
      clips: [{ id: 'pulse', source: ALTERNATING_PATTERN }],
      masterPixelCount: 1,
      outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.5 }],
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1,
    }, {
      mapPoints: [{ sample: [] }],
      randomSeed: 537,
    })

    expect(runtime.renderCurrentFrame().pixels[0]).toEqual([1, 0, 0])
    expect(runtime.advanceLive(16).pixels[0]).toEqual([0.5, 0, 0])
    expect(artifact.metadata.temporalFeedback).toEqual({
      previewSeekModeVar: '__pxlblz_show_trails_preview_seek',
    })
    expect(artifact.metadata.deterministicReplay).toBeUndefined()
    expect(artifact.summary.outputEffects).toEqual([expect.objectContaining({
      id: 'trails',
      kind: 'trails',
      status: 'selected',
      retention: 0.5,
      seekPolicy: 'clear-at-target',
      transitionSnapshotPolicy: 'suspend-clear',
      additionalArrayWords: 0,
    })])
    expect(artifact.summary.sourceInventory.chunks.some((chunk) => (
      chunk.category === 'effects-transitions' && chunk.bytes > 0
    ))).toBe(true)
    expect(artifact.expandedCode.match(/\barray\s*\(/g)).toHaveLength(3)
  })

  it.each(['fast', 'fidelity'] as const)('runs Trails in %s preview fidelity', (fidelity) => {
    const artifact = compileShow({
      clips: [{ id: 'pulse', source: ALTERNATING_PATTERN }],
      masterPixelCount: 1,
      outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.5 }],
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1,
    }, {
      mapPoints: [{ sample: [] }],
      randomSeed: 537,
      fidelity,
    })

    expect(runtime.renderCurrentFrame().pixels[0]).toEqual([1, 0, 0])
    expect(runtime.advanceLive(16).pixels[0]).toEqual([0.5, 0, 0])
  })

  it('clears compiled Trails on preview seek and resumes them on live playback', () => {
    const artifact = compileShow({
      clips: [{ id: 'pulse', source: ALTERNATING_PATTERN }],
      masterPixelCount: 1,
      outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.5 }],
    }, {})
    const prepared = {
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1 as const,
    }
    const options = { mapPoints: [{ sample: [] }], randomSeed: 537 }

    expect(createFastReplayRuntime(prepared, options).advanceTo(20, { stepMs: 10 }).pixels[0][0]).toBe(0.5)
    const cleared = createFastReplayRuntime(prepared, options)
    expect(cleared.advanceTo(20, {
      stepMs: 10,
      temporalFeedbackSeek: 'clear-at-target',
    }).pixels[0][0]).toBe(0)
    expect(cleared.advanceLive(10).pixels[0][0]).toBe(1)
  })

  it('suspends and reseeds Trails while a required Transition snapshot owns the arena', () => {
    const artifact = compileShow({
      clips: [
        { id: 'light', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'dark', source: 'export function render(index) { rgb(0, 0, 0) }' },
      ],
      crossfade: { startMs: 10, durationMs: 10, crossfadePolicy: 'snapshot-live' },
      masterPixelCount: 1,
      outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.5 }],
    }, {})
    const assignments = artifact.summary.renderTargetPlan.assignments
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1,
    }, {
      mapPoints: [{ sample: [] }],
      randomSeed: 537,
    })

    expect(assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateId: 'output-effect:trails', planes: [0, 1, 2] }),
      expect.objectContaining({ candidateId: 'transition:direct:snapshot-live', planes: [0, 1, 2] }),
    ]))
    expect(runtime.renderCurrentFrame().pixels[0]).toEqual([1, 0, 0])
    expect(runtime.advanceLive(10).pixels[0]).toEqual([1, 0, 0])
    expect(runtime.advanceLive(10).pixels[0]).toEqual([0, 0, 0])
  })
})
