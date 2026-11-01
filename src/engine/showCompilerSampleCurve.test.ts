import { expect, it } from 'vitest'
import { compileShow, type ShowRecipe } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { convertibleV2Record, exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'

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
  const epe = parseEpe(exportShowEpeV2ForTest(convertibleV2Record(), artifact.code, { id: 'descriptor-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
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

it('updates the sample remap from the held clock, after the advance has finished (#1204)', () => {
  const recipe: ShowRecipe = {
    clips: ['first', 'second'].map(id => ({ id, source: 'export function render2D(index, x, y) { rgb(x, y, 0) }' })),
    sceneSequence: { scenes: [{ clipId: 'first', holdMs: 24_300, transitionOut: { kind: 'cut', durationMs: 0 } }, { clipId: 'second', holdMs: 24_300 }] },
    samplePropertyRamps: { repeatScale: { initial: 1, ramps: [{ atMs: 0, from: 1, to: 2, durationMs: 48_600, easing: { curve: 'linear' } }] } },
  }
  const lines = compileShow(recipe, {}).expandedCode.split('\n').map(line => line.trim())
  const derive = lines.findIndex(line => line.startsWith('__pxlblz_show_elapsed_s = __pxlblz_show_clock_s + __pxlblz_show_clock_ms / 1000'))
  expect(derive).toBeGreaterThan(0)
  // The advance's last statement holds the register below the loop point; the
  // remap must read the held value, so it runs on the next line, not between.
  expect(lines[derive + 1]).toBe('if (__pxlblz_show_elapsed_s >= 48.6) __pxlblz_show_elapsed_s = 48.6 - 0.0000152587890625')
  expect(lines[derive + 2]).toBe('__pxlblz_show_update_sample_remap()')
  expect(lines.filter(line => line === '__pxlblz_show_update_sample_remap()')).toHaveLength(1)
})
