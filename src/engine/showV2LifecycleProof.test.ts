import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } from './showCompositionV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { runtimeParity } from '../../scripts/show-v2-parity'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { parseEpe } from './epeImport'
import { exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'

const code = 'export var calls=0; export var elapsed=0; export function beforeRender(delta){calls++;elapsed+=delta/1000} export function render2D(index,x,y){rgb(x,elapsed,calls/100)}'
const lookup = { byCellId: {}, byPatternInstanceId: { instance: code }, stageDimension: 2 as const }

it.each(['gap', 'strobe', 'trails', 'rolling-refresh'] as const)('preserves %s lifecycle through authored and compiled artifact reopening', mode => {
  const source = convertibleV1Show()
  const zone = source.composition!.scenes[0].zones[0]
  const clip = zone.main[0]
  clip.durationMs = 200
  zone.main.push({ ...structuredClone(clip), id: 'return', startMs: 600, durationMs: 400 })
  if (mode === 'strobe') for (const placement of zone.main) placement.presentation = { mode: 'strobe', cadenceMs: 100 }
  if (mode === 'trails') source.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.6 }]
  if (mode === 'rolling-refresh') source.composition!.patternInstances[0].evaluationPolicy = 'rolling-refresh'
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(converted.record))
  expect(opened).toEqual({ status: 'opened', record: converted.record })
  if (opened.status !== 'opened') return
  const prepared = prepareShowV2ForCompile(opened.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const a = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const b = compileShow(prepared.recipe, LIBRARIES)
  expect(prepared.recipe.clips.filter(clip => !clip.compilerOwnedEmpty)).toHaveLength(1)
  expect(b.summary.clips.map(clip => clip.id).sort()).toEqual(a.summary.clips.map(clip => clip.id).sort())
  const exported = exportShowEpeV2ForTest(converted.record, b.code, { id: 'show-v2-lifecycle-proof', stampedAt: '2026-09-15T00:00:00.000Z' })
  const epe = parseEpe(exported.text)
  expect(epe).toMatchObject({ name: source.name, stamp: { kind: 'show' } })
  expect(epe.src).toContain(b.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    expect(runtimeParity(a, b, source, opened.record, fidelity, [])).toMatchObject({ matched: true, secondLoopMatched: true, coldSeekMatchedContinuous: true })
    expect(runtimeParity(b, { ...b, code: epe.src }, source, opened.record, fidelity, [])).toMatchObject({ matched: true, secondLoopMatched: true, coldSeekMatchedContinuous: true })
  }
  expect(source).toEqual(before)
})

it.each(['fast', 'fidelity'] as const)('advances a shared instance exactly once per frame across Zones and Layers in %s', fidelity => {
  const source = convertibleV1Show()
  const zone = source.composition!.scenes[0].zones[0]
  zone.overlays = [{ id: 'overlay', name: 'Overlay', placements: [{ ...structuredClone(zone.main[0]), id: 'overlay-clip', opacity: 0.5 }] }]
  source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
  source.routingLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'other'] }
  source.composition!.scenes[0].zones.push({ zoneId: 'other', main: [{ ...structuredClone(zone.main[0]), id: 'other-clip' }], overlays: [] })
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  expect(artifact.summary.clips).toHaveLength(1)
  const runtime = createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns) }, { fidelity, randomSeed: 1034, mapPoints: [{ sample: [0.25, 0.25], pos: [0.25, 0.25] }, { sample: [0.75, 0.75], pos: [0.75, 0.75] }] })
  const key = `${artifact.summary.clips[0].prefix}_calls`
  const initial = Number(runtime.renderCurrentFrame().exports[key])
  const one = fidelity === 'fidelity' ? 65536 : 1
  expect(Number(runtime.advanceTo(16, { stepMs: 16, forceFullIntermediateRender: true }).exports[key]) - initial).toBe(one)
  expect(Number(runtime.advanceTo(32, { stepMs: 16, forceFullIntermediateRender: true }).exports[key]) - initial).toBe(2 * one)
})
