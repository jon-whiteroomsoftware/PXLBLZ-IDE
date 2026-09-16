import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime, prepareFastReplay, type PreparedFastReplay } from './fastReplay'
import { inspectPatternMetadata } from './bundle'

const source = 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(x,elapsed/2000,y/2)}'
const priorGlobals = new Map<string, PropertyDescriptor | undefined>()
afterEach(() => {
  for (const [name, descriptor] of priorGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  priorGlobals.clear()
})
function fixture(mode: 'live' | 'freeze' | 'strobe'): ShowRecordV2 {
  const legacy = convertibleV1Show()
  legacy.composition!.scenes[0].zones[0].overlays = []
  const converted = convertShowRecordV1ToV2(legacy)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.composition.clips[0].entryPolicy = 'continue'
  record.composition.clips[0].appearance.keys[0].value.presentation = mode === 'strobe' ? { mode, cadenceMs: 150 } : { mode }
  return record
}
function delivered(record: ShowRecordV2, patternSource = source): PreparedFastReplay & { epeText: string; fxCode: string } {
  const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (reopened.status !== 'opened') throw new Error(JSON.stringify(reopened))
  const ready = prepareShowV2ForCompile(reopened.record, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, patternSource])) }, { libraries: {} })
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Admitted checkpoint fixture refused')
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(reopened.record, artifact.code, { id: 'checkpoint', stampedAt: '2026-09-16T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  const opened = parseEpe(exported.text)
  expect(opened.src).toBe(exported.source)
  return { ...artifact, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2, epeText: exported.text }
}
function isolateUndeclaredBindings(prepared: PreparedFastReplay) {
  const declared = new Set(inspectPatternMetadata(prepared.code).patternVars)
  // The existing unused scheduler assignment can leak into the test process and
  // conceal the first-capture error. Each consumer starts with fresh-page globals.
  for (const binding of Object.values(prepared.metadata.patternVarBindings ?? {})) {
    if (declared.has(binding)) continue
    if (!priorGlobals.has(binding)) priorGlobals.set(binding, Object.getOwnPropertyDescriptor(globalThis, binding))
    Reflect.deleteProperty(globalThis, binding)
  }
}
function runtime(prepared: PreparedFastReplay, fidelity: 'fast' | 'fidelity') {
  isolateUndeclaredBindings(prepared)
  return createFastReplayRuntime(prepared, { fidelity, randomSeed: 1038,
    mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }, { sample: [.75, .5], pos: [.75, .5] }] })
}

it.each(['fast', 'fidelity'] as const)('captures imported no-Transition Live/Freeze before first execution without claiming unavailable storage (%s)', fidelity => {
  for (const mode of ['live', 'freeze'] as const) {
    const prepared = delivered(fixture(mode)), consumer = runtime(prepared, fidelity)
    const checkpoint = consumer.snapshot()
    expect(prepared.metadata.patternVars).toContain('__pxlblz_show_mix')
    expect(prepared.metadata.patternVarBindings).not.toHaveProperty('__pxlblz_show_mix')
    expect(checkpoint.runtimeState.__pxlblz_show_mix).toBeUndefined()
    consumer.advanceTo(300, { stepMs: 1, forceFullIntermediateRender: true })
    consumer.restore(checkpoint)
    expect(consumer.getElapsedMs()).toBe(0)
    expect(consumer.snapshot().runtimeState.__pxlblz_show_mix).toBeUndefined()
  }
})

function compareExports(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  expect(Object.keys(actual)).toEqual(Object.keys(expected))
  for (const [name, value] of Object.entries(expected)) {
    if (typeof value === 'function') {
      expect(typeof actual[name]).toBe('function')
      const restored = actual[name] as () => void
      expect(restored.name).toBe(value.name)
      expect(restored.toString()).toBe(value.toString())
    } else expect(actual[name]).toEqual(value)
  }
}
function compareRestore(prepared: PreparedFastReplay, fidelity: 'fast' | 'fidelity', checkpointMs = 300, targetMs = 900) {
  const consumer = runtime(prepared, fidelity)
  consumer.advanceTo(checkpointMs, { stepMs: 1, forceFullIntermediateRender: true })
  const checkpoint = consumer.snapshot()
  consumer.advanceTo(1300, { stepMs: 1, forceFullIntermediateRender: true })
  consumer.restore(checkpoint)
  const restored = consumer.advanceTo(targetMs, { stepMs: 1, forceFullIntermediateRender: true })
  const cold = runtime(prepared, fidelity)
  const expected = cold.advanceTo(targetMs, { stepMs: 1, forceFullIntermediateRender: true })
  const sourceImported = runtime(prepareFastReplay(prepared.code, {}), fidelity)
    .advanceTo(targetMs, { stepMs: 1, forceFullIntermediateRender: true })
  expect(restored.frame).toEqual(expected.frame)
  expect(restored.frame).toEqual(sourceImported.frame)
  compareExports(restored.exports, expected.exports)
  expect(consumer.snapshot().runtimeState).toEqual(cold.snapshot().runtimeState)
  const later = consumer.advanceTo(1600, { stepMs: 1, forceFullIntermediateRender: true })
  const laterCold = cold.advanceTo(1600, { stepMs: 1, forceFullIntermediateRender: true })
  expect(later.frame).toEqual(laterCold.frame)
  compareExports(later.exports, laterCold.exports)
  expect(consumer.snapshot().runtimeState).toEqual(cold.snapshot().runtimeState)
}

it.each(['fast', 'fidelity'] as const)('restores actual imported Live/Freeze/Strobe caches and scheduler state across a loop (%s)', fidelity => {
  for (const mode of ['live', 'freeze', 'strobe'] as const) compareRestore(delivered(fixture(mode)), fidelity)
})

it.each(['fast', 'fidelity'] as const)('preserves semantic/compacted mutable array aliases, cycles and function-valued private state (%s)', fidelity => {
  const pattern = `export var elapsed=0
var bag=array(2)
var alias=bag
var callback=first
function first(delta){elapsed+=delta;bag[1]+=1}
function second(delta){elapsed+=delta*2;bag[1]+=2}
export function beforeRender(delta){bag[0]=bag;callback(delta);if(elapsed>=400)callback=second}
export function render2D(index,x,y){rgb(x,elapsed/4000,alias[1]/4000)}`
  const prepared = delivered(fixture('live'), pattern), consumer = runtime(prepared, fidelity)
  consumer.advanceTo(300, { stepMs: 1, forceFullIntermediateRender: true })
  const checkpoint = consumer.snapshot()
  const bagName = prepared.metadata.patternVars.find(name => name.endsWith('_bag'))!
  const aliasName = prepared.metadata.patternVars.find(name => name.endsWith('_alias'))!
  expect(bagName).toBeTruthy(); expect(aliasName).toBeTruthy()
  const compactedBag = prepared.metadata.patternVarBindings![bagName]
  expect(prepared.metadata.runtimeVars).toContain(compactedBag)
  const bag = checkpoint.runtimeState[bagName] as unknown[]
  expect(bag).toBe(checkpoint.runtimeState[compactedBag])
  expect(bag).toBe(checkpoint.runtimeState[aliasName])
  expect(bag[0]).toBe(bag)
  consumer.advanceTo(1300, { stepMs: 1, forceFullIntermediateRender: true })
  consumer.restore(checkpoint)
  const restored = consumer.snapshot().runtimeState
  expect(restored[bagName]).toBe(restored[compactedBag])
  expect(restored[bagName]).toBe(restored[aliasName])
  expect((restored[bagName] as unknown[])[0]).toBe(restored[bagName])
  compareRestore(prepared, fidelity)
})

it.each(['fast', 'fidelity'] as const)('preserves actual declared-but-undefined globals through initialization and restore (%s)', fidelity => {
  const prepared = delivered(fixture('live'), `var unset
export var elapsed=0
export function beforeRender(delta){elapsed+=delta;if(elapsed>100)unset=1}
export function render2D(index,x,y){if(unset==1)rgb(1,0,0);else rgb(0,1,0)}`)
  const consumer = runtime(prepared, fidelity), initial = consumer.snapshot()
  const logical = prepared.metadata.patternVars.find(name => name.endsWith('_unset'))!
  const binding = prepared.metadata.patternVarBindings![logical]
  expect(binding).toBeTruthy(); expect(prepared.metadata.runtimeVars).toContain(binding)
  expect(initial.runtimeState[binding]).toBeUndefined()
  consumer.advanceTo(300, { stepMs: 1, forceFullIntermediateRender: true })
  consumer.restore(initial)
  expect(consumer.snapshot().runtimeState[binding]).toBeUndefined()
  const result = consumer.advanceTo(50, { stepMs: 1, forceFullIntermediateRender: true })
  const cold = runtime(prepared, fidelity).advanceTo(50, { stepMs: 1, forceFullIntermediateRender: true })
  expect(result.frame).toEqual(cold.frame)
})

it.each(['fast', 'fidelity'] as const)('preserves positive Crossfade snapshot/live state with actual declared mix and true Restart (%s)', fidelity => {
  for (const policy of ['live-live', 'snapshot-live'] as const) {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', policy))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    const prepared = delivered(converted.record)
    expect(prepared.metadata.patternVarBindings).toHaveProperty('__pxlblz_show_mix')
    compareRestore(prepared, fidelity, 450, 750)
  }
})

it.each(['fast', 'fidelity'] as const)('keeps stale invalid declared metadata strict instead of swallowing missing bindings (%s)', fidelity => {
  const prepared = delivered(fixture('live'))
  prepared.metadata = { ...prepared.metadata, patternVarBindings: { ...prepared.metadata.patternVarBindings, __pxlblz_show_mix: '__checkpoint_absent_binding' } }
  expect(() => runtime(prepared, fidelity).snapshot()).toThrow(/__checkpoint_absent_binding/)
})

// Captured from actual exported/imported artifacts before metadata repair at
// 7523b463. Source inspection and state metadata may change; delivered bytes do not.
it.each([
  ['live', '84091a6ebd2f3318eb5a401042c2cda0aa3d2334b3af6968e9ad2c557fc8e18c', 'de1bc793dea0e21eac3ca949db73498c8823dac39822f2e9128d71be4e5b9c0c', '93976c43c958f50da833fe18f2191c58f17c28807589700d36a6c117554f4d1a'],
  ['freeze', 'b761e9932364fa9b99186cc2720d61c1016a81daab0fd641deee639f661c5dd0', '27ced89596ec55b2296764dfca2a0587c58b4fe6763765812aa689b56b8eeeb3', '74e287d01ea6ab93a14319ef9a35f81e4dffc1f17de087551859b69895e5f68d'],
] as const)('preserves original imported %s source, Precise emission and EPE bytes', (mode, codeHash, fxHash, epeHash) => {
  const prepared = delivered(fixture(mode))
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  expect(hash(prepared.code)).toBe(codeHash)
  expect(hash(prepared.fxCode)).toBe(fxHash)
  expect(hash(prepared.epeText)).toBe(epeHash)
  const original = readFileSync(new URL(`../../docs/reference/evidence/issue-1038-checkpoint-bindings/${mode}.epe`, import.meta.url), 'utf8')
  expect(prepared.epeText).toBe(original)
})

it.each(['fast', 'fidelity'] as const)('keeps compiler-proven skipped renders and checkpoint replay equivalent to full traversal (%s)', fidelity => {
  const prepared = delivered(fixture('live'))
  expect(prepared.metadata.deterministicReplay?.intermediateRender).toBe('state-pure')
  const optimized = runtime(prepared, fidelity), full = runtime(prepared, fidelity)
  optimized.advanceTo(300, { stepMs: 1 })
  full.advanceTo(300, { stepMs: 1, forceFullIntermediateRender: true })
  const checkpoint = optimized.snapshot()
  optimized.advanceTo(1300, { stepMs: 1 })
  optimized.restore(checkpoint)
  const replay = optimized.advanceTo(900, { stepMs: 1 })
  const expected = full.advanceTo(900, { stepMs: 1, forceFullIntermediateRender: true })
  expect(replay.frame).toEqual(expected.frame)
  compareExports(replay.exports, expected.exports)
  expect(optimized.snapshot().runtimeState).toEqual(full.snapshot().runtimeState)
  expect(replay.outerRendererCalls).toBeLessThan(expected.outerRendererCalls)
})
