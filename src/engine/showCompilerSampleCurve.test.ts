import { expect, it } from 'vitest'
import { compileShow, type ShowRecipe } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { buildShowEpeExport } from './showEpeExport'
import { convertibleV1Show } from '../test/showV2TracerFixture'

it.each(['fast', 'fidelity'] as const)('reopened sample descriptor preserves original kernel, exact right key, activation resume and wrap in %s', fidelity => {
  const recipe: ShowRecipe = {
    clips: ['first', 'second'].map(id => ({ id, source: 'export function render2D(index, x, y) { rgb(x, y, 0) }' })),
    sceneSequence: { scenes: [{ clipId: 'first', holdMs: 500, transitionOut: { kind: 'cut', durationMs: 0 } }, { clipId: 'second', holdMs: 500 }] },
    samplePropertyRamps: { repeatScale: { initial: 1, ramps: [
      { atMs: 250, from: 1, to: 2.125, durationMs: 0, easing: { curve: 'linear' } },
      { atMs: 250, from: 2.125, to: 2.5, durationMs: 250, easing: { curve: 'quadratic', direction: 'in' }, curveSegment: { baseValue: 2, deltaValue: 2, sourceDurationMs: 1000, elapsedOffsetMs: 250, easing: { curve: 'quadratic', direction: 'in' } } },
      { atMs: 750, from: 2.5, to: 1, durationMs: 0, easing: { curve: 'linear' } },
    ] } },
  }
  const artifact = compileShow(recipe, {})
  const epe = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'descriptor-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
  const runtime = createFastReplayRuntime({ ...artifact, code: epe.src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.3, 0.25], pos: [0.3, 0.25] }] })
  for (const time of [125, 250, 375, 500, 625, 750, 875, 1125, 1250, 1375]) {
    const phase = time % 1000
    const scale = phase < 250 || phase >= 750 ? 1 : phase >= 500 ? 2.5 : 2 + 2 * (phase / 1000) ** 2
    const expected = 0.3 * scale % 1
    const frame = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true }).frame
    expect(Math.abs(frame[0] - expected), `sample@${time}`).toBeLessThan(fidelity === 'fast' ? 1e-12 : 5 / 65536)
    expect(Math.floor(frame[0] * 255), `display@${time}`).toBe(Math.floor(expected * 255))
  }
})
