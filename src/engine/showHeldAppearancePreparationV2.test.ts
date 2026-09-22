import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'

const source = 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(x,elapsed/2000,y/2)}'
function fixture(): ShowRecordV2 {
  const legacy = convertibleV1Show()
  legacy.composition!.scenes[0].zones[0].overlays = []
  const converted = convertShowRecordV1ToV2(legacy)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.composition.executionModel = 'continuous'
  const clip = record.composition.clips[0], first = clip.appearance.keys[0]
  clip.entryPolicy = 'restart'
  clip.appearance.keys = [0, 400, 800].map((timeMs, index) => ({ ...structuredClone(first), id: `appearance-${index}`, timeMs,
    value: { ...structuredClone(first.value), view: { mirror: false, phase: index / 5, brightness: 1 }, presentation: { mode: 'freeze' } } }))
  const layout = record.composition.layoutOccurrences[0]
  record.composition.layoutOccurrences = [0, 200, 600].map((startMs, index) => ({ ...structuredClone(layout), id: `layout-${index}`, startMs,
    durationMs: [200, 400, 400][index] }))
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}
function prepare(record: ShowRecordV2) {
  const opened = reopen(record)
  return prepareShowV2ForCompile(opened, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(opened).composition.patternInstances.map(instance => [instance.id, source])) }, { libraries: {} })
}
// Three independently authored adjacent consumers describe the three cache runs.
function expectedRuns(record: ShowRecordV2): ShowRecordV2 {
  const expected = structuredClone(record), clip = record.composition.clips[0]
  expected.composition.clips = clip.appearance.keys.map((key, index) => ({ ...structuredClone(clip), id: `expected-run-${index}`, startMs: key.timeMs,
    durationMs: (clip.appearance.keys[index + 1]?.timeMs ?? 1000) - key.timeMs, entryPolicy: index === 0 ? 'restart' : 'continue',
    appearance: { keys: [structuredClone(key)] } }))
  return expected
}
function delivered(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Preparation refused')
  expect(ready.recipe.clips.filter(clip => !clip.compilerOwnedEmpty)).toHaveLength(1)
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(record, artifact.code, { id: 'held-appearance-proof', stampedAt: '2026-09-16T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  const opened = parseEpe(exported.text)
  expect(opened.src).toBe(exported.source)
  return createFastReplayRuntime({ ...artifact, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2 },
    { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }, { sample: [.75, .5], pos: [.75, .5] }] })
}
function compareDelivered(actual: ShowRecordV2, expected: ShowRecordV2) {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const a = delivered(actual, fidelity), b = delivered(expected, fidelity)
    for (const atMs of [0, 1, 99, 100, 101, 149, 150, 151, 199, 200, 201, 299, 300, 301, 399, 400, 401, 449, 450, 451, 549, 550, 551,
      599, 600, 601, 699, 700, 701, 799, 800, 801, 949, 950, 951, 999, 1001, 1201, 1401]) {
      const x = a.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }), y = b.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(x.frame).toEqual(y.frame)
      expect(x.exports).toEqual(y.exports)
      expect(Object.keys(x.exports).length).toBeGreaterThan(0)
    }
    for (const atMs of [450, 199, 801]) {
      const x = delivered(actual, fidelity).advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const y = delivered(expected, fidelity).advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(x.frame).toEqual(y.frame)
      expect(x.exports).toEqual(y.exports)
    }
  }
}
function compatibilityFixture(mode: 'live' | 'freeze' | 'strobe' | 'transition'): ShowRecordV2 {
  if (mode === 'transition') {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const record = converted.record
    for (const clip of record.composition.clips) {
      const first = clip.appearance.keys[0]
      clip.appearance.keys = [clip.startMs, clip.startMs + 200].map((timeMs, index) => ({ ...structuredClone(first), id: `${clip.id}:key-${index}`, timeMs,
        value: { ...structuredClone(first.value), view: index === 0 ? { mirror: false, phase: 0, brightness: 1 } : { brightness: 1, phase: 0, mirror: false } } }))
    }
    return record
  }
  const record = fixture()
  for (const [index, key] of record.composition.clips[0].appearance.keys.entries()) {
    key.value.view = index === 0 ? { mirror: false, phase: 0, brightness: 1 } : { brightness: 1, phase: 0, mirror: false }
    key.value.opacity = 1 - index / 5
    key.value.transform = { positionX: index / 10, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
    key.value.aperture = { enabled: false, x: 0, y: 0, width: .8 + index / 10, height: 1 }
    key.value.effects = index === 0 ? [{ id: 'hue', kind: 'hue', turns: .1 }] : [{ turns: .1, kind: 'hue', id: 'hue' }]
    key.value.presentation = mode === 'strobe' ? { mode: 'strobe', cadenceMs: 150 } : { mode }
  }
  return record
}
function fingerprint(record: ShowRecordV2) {
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(record, artifact.code, { id: 'held-byte-proof', stampedAt: '2026-09-16T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  expect(parseEpe(exported.text).src).toBe(exported.source)
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  return { recipe: hash(JSON.stringify(ready.recipe)), source: hash(artifact.code), epe: hash(exported.text) }
}
it('retains Freeze cache through interior Layout sections and recaptures only at the next held presentation run', () => {
  const record = fixture(), before = structuredClone(record), expected = expectedRuns(record)
  const oracle = prepare(expected)
  expect(oracle.status, JSON.stringify(oracle)).toBe('ready')
  const result = prepare(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  expect(record).toEqual(before)
  compareDelivered(record, expected)
})

it('retains Strobe cadence across interior Layout and held scalar sections without resetting private state', () => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) key.value.presentation = { mode: 'strobe', cadenceMs: 150 }
  record.composition.propertyTracks = [{ id: 'scale', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [0, 100, 900].map((timeMs, index) => ({ id: `scalar-${index}`, timeMs, value: 1, easing: { curve: 'hold', at: 1 } })) }]
  const before = structuredClone(record), expected = expectedRuns(record)
  const oracle = prepare(expected)
  expect(oracle.status, JSON.stringify(oracle)).toBe('ready')
  const result = prepare(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  compareDelivered(record, expected)
  expect(record).toEqual(before)
})

it('retargets nonlinear Clip animation to each exact derived run/section identity without changing activation or source curves', () => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) {
    key.value.presentation = { mode: 'live' }
    key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }]
  }
  record.composition.propertyTracks = [{ id: 'opacity', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'last', timeMs: 1000, value: .8, easing: { curve: 'linear' } }] }]
  const expected = expectedRuns(record)
  // Worked sine kernel at u0/.4/.8/1; retained coefficients remain the source kernel.
  const times = [0, 400, 800, 1000], values = [.2, .40729490168751575, .7427050983124843, .8]
  expected.composition.propertyTracks = [0, 1, 2].map(index => ({ id: `expected-opacity-${index}`, target: { kind: 'clip-opacity', clipId: `expected-run-${index}` },
    activeStartMs: times[index], activeDurationMs: times[index + 1] - times[index], keyframes: [
      { id: `expected-first-${index}`, timeMs: times[index], value: values[index], easing: { curve: 'sine', direction: 'in-out' },
        curveSegment: { baseValue: .2, deltaValue: .6000000000000001, easing: { curve: 'sine', direction: 'in-out' }, sourceDurationMs: 1000, elapsedOffsetMs: times[index] } },
      { id: `expected-last-${index}`, timeMs: times[index + 1], value: values[index + 1], easing: { curve: 'linear' } },
    ] }))
  expect(prepare(expected).status).toBe('ready')
  const before = structuredClone(record), result = prepare(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  compareDelivered(record, expected)
  expect(record).toEqual(before)
})

// Captured through public preparation/compile/EPE on exact old adapter f3db7122.
const admittedBytes = {
  live: { recipe: '1c52218ff19acc8d514b15b6f21ea8e207e3c8aa521fca3e1804abab2b11b888', source: '485e662f754d1808d4075e1dcc8c403c09dd0ee534418ca491fdebceac957587', epe: 'e5c36e9bfcf0a607d41623d3490697cef5a581f22e7ca6439a38f9e27e421163' },
  freeze: { recipe: '1eb4dcb94501a648ccd1d6dba0d28fd1c102e507414a0ccea2385aa88d8bcf6f', source: '0c50989922888e0f2539f68fc88209d175b8a18bca8b7e38959163725ccb5d17', epe: 'f6b9d18255e1a04ba10741e80419e5efca6479f52910cbe0624b01bf1cee7f14' },
  strobe: { recipe: '7d3b82d5dc7403ba7cbf380f7e47909cb71e959726364a4245e70b1c91a2fd5b', source: '0f05af8bc43750dff2711ca2a0c8d4a24c49e5db27d9fe99bb5fd4218612530a', epe: 'b3ff080f1d2ff1f94f9e0fc4af7f7e90fe7d003341cccda0e9e57512cec18152' },
  transition: { recipe: '9717492149aab2138f42bc870ad3732d1a04e6c8b4484fd4d94063e13d9e51b0', source: '81403e5d2573b3f97853bc5190890c493da09a4938335d8a652c716a7cb48e35', epe: '2f7d3ef1f8868614dc5b7ee688a79a8cdea386d69f7d359bf030e1bc93148fd4' },
}
it.each(['live', 'freeze', 'strobe', 'transition'] as const)('preserves pinned admitted %s recipe/source/EPE bytes including canonical field-order equivalence', mode => {
  const record = compatibilityFixture(mode), before = structuredClone(record)
  expect(fingerprint(record)).toEqual(admittedBytes[mode])
  expect(record).toEqual(before)
})

it('projects held Group presentation runs while ordinary and Group consumers retain one shared private runtime', () => {
  const record = fixture(), clip = record.composition.clips[0]
  for (const key of clip.appearance.keys) key.value.presentation = { mode: 'live' }
  record.composition.layers.push({ id: 'overlay', name: 'Overlay', zoneId: 'zone', rank: 1 })
  record.composition.groupDefinitions = [{ id: 'group', name: 'Group', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }], clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200,
      entryPolicy: 'continue', zoneSampleMode: 'span', appearance: { keys: [0, 100].map((timeMs, index) => ({ ...structuredClone(clip.appearance.keys[0]), id: `local-${index}`, timeMs,
        value: { ...structuredClone(clip.appearance.keys[0].value), opacity: .5, view: { mirror: false, phase: index * .3, brightness: 1 } } })) } }], transitions: [], propertyTracks: [] }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: 'zone', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    startMs: 100, translationX: 0, translationY: 0, holds: [{ id: 'beat', localTimeMs: 50, durationMs: 100 }], instanceBindings: { slot: 'instance' },
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: 'overlay' }] }]
  const expected = expectedRuns(record)
  expected.composition.groupOccurrences = []
  for (const [index, startMs] of [100, 300].entries()) expected.composition.clips.push({ ...structuredClone(clip), id: `expected-group-${index}`, startMs,
    durationMs: index === 0 ? 200 : 100, layerId: 'overlay', entryPolicy: 'continue', appearance: { keys: [{ id: `expected-group-key-${index}`, timeMs: startMs,
      value: { ...structuredClone(clip.appearance.keys[0].value), opacity: .5, view: { mirror: false, phase: index * .3, brightness: 1 } } }] } })
  const oracle = prepare(expected)
  expect(oracle.status, JSON.stringify(oracle)).toBe('ready')
  const before = structuredClone(record), result = prepare(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  compareDelivered(record, expected)
  expect(record).toEqual(before)
})

it('retains run ownership across whole-output incoming/outgoing contributions and an interior Layout switch', () => {
  const record = fixture(), clip = record.composition.clips[0]
  for (const key of clip.appearance.keys) key.value.presentation = { mode: 'live' }
  clip.durationMs = 400; clip.appearance.keys = clip.appearance.keys.slice(0, 2)
  clip.appearance.keys[1].timeMs = 200
  const right = structuredClone(clip)
  right.id = 'right'; right.startMs = 500; right.durationMs = 500; right.entryPolicy = 'continue'
  right.appearance.keys = [500, 800].map((timeMs, index) => ({ ...structuredClone(clip.appearance.keys[index]), id: `right-key-${index}`, timeMs,
    value: { ...structuredClone(clip.appearance.keys[index].value), view: { mirror: false, phase: .4 + index / 5, brightness: 1 } } }))
  record.composition.clips.push(right)
  record.composition.transitions = [{ id: 'whole', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    wholeOutput: { startMs: 400, fromClipIds: ['clip'], toClipIds: ['right'] }, participants: [], propertyRamps: [] }]
  const expected = structuredClone(record)
  expected.composition.clips = [
    { ...structuredClone(clip), id: 'expected-out-0', durationMs: 200, appearance: { keys: [structuredClone(clip.appearance.keys[0])] } },
    { ...structuredClone(clip), id: 'expected-out-1', startMs: 200, durationMs: 200, entryPolicy: 'continue', appearance: { keys: [structuredClone(clip.appearance.keys[1])] } },
    { ...structuredClone(right), id: 'expected-in-0', durationMs: 300, appearance: { keys: [structuredClone(right.appearance.keys[0])] } },
    { ...structuredClone(right), id: 'expected-in-1', startMs: 800, durationMs: 200, appearance: { keys: [structuredClone(right.appearance.keys[1])] } },
  ]
  expected.composition.transitions[0].wholeOutput = { startMs: 400, fromClipIds: ['expected-out-1'], toClipIds: ['expected-in-0'] }
  const oracle = prepare(expected)
  expect(oracle.status, JSON.stringify(oracle)).toBe('ready')
  const before = structuredClone(record), result = prepare(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  compareDelivered(record, expected)
  expect(record).toEqual(before)
})

it('starts a fresh Freeze owner when a prior presentation recurs after another run', () => {
  const record = fixture()
  record.composition.clips[0].appearance.keys[2].value.view.phase = 0
  const expected = expectedRuns(record)
  expect(prepare(expected).status).toBe('ready')
  compareDelivered(record, expected)
})

it.each(['effects', 'presentation'] as const)('preserves distinct %s cache runs with one executing private runtime', kind => {
  const record = fixture()
  for (const [index, key] of record.composition.clips[0].appearance.keys.entries()) {
    key.value.view.phase = 0
    if (kind === 'effects') key.value.effects = [{ id: 'hue', kind: 'hue', turns: index / 5 }]
    else key.value.presentation = { mode: index === 1 ? 'live' : 'freeze' }
  }
  const expected = expectedRuns(record), before = structuredClone(record)
  expect(prepare(expected).status).toBe('ready')
  compareDelivered(record, expected)
  expect(record).toEqual(before)
})

it('keeps opacity-only held changes inside a divergent Freeze run instead of recapturing its private-state image', () => {
  const record = fixture(), clip = record.composition.clips[0]
  clip.appearance.keys[1].value.opacity = .8; clip.appearance.keys[2].value.opacity = .6
  clip.appearance.keys[2].value.view.phase = .2
  const expected = structuredClone(record)
  expected.composition.clips = [
    { ...structuredClone(clip), id: 'expected-first', durationMs: 400, appearance: { keys: [structuredClone(clip.appearance.keys[0])] } },
    { ...structuredClone(clip), id: 'expected-second', startMs: 400, durationMs: 600, entryPolicy: 'continue', appearance: { keys: structuredClone(clip.appearance.keys.slice(1)) } },
  ]
  expect(prepare(expected).status).toBe('ready')
  compareDelivered(record, expected)
})

it.each(['clip--appearance-1', 'clip--appearance-1--span-v2-section:3'])('allocates collision-free run owners and retargets only the selected Clip animation (%s)', collisionId => {
  const record = fixture(), clip = record.composition.clips[0]
  for (const key of clip.appearance.keys) key.value.presentation = { mode: 'live' }
  record.composition.layers.push({ id: 'overlay', name: 'Overlay', zoneId: 'zone', rank: 1 })
  const other = structuredClone(clip)
  other.id = collisionId; other.layerId = 'overlay'; other.entryPolicy = 'continue'; other.appearance.keys = [other.appearance.keys[0]]
  other.appearance.keys[0].id = 'other-key'; other.appearance.keys[0].value.opacity = .3
  record.composition.clips.push(other)
  record.composition.propertyTracks = [{ id: 'brightness', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'first', timeMs: 0, value: .7, easing: { curve: 'linear' } }, { id: 'last', timeMs: 1000, value: .7, easing: { curve: 'linear' } }] }]
  const expected = expectedRuns(record)
  expected.composition.propertyTracks = expected.composition.clips.map((consumer, index) => ({ id: `expected-brightness-${index}`,
    target: { kind: 'clip-view', clipId: consumer.id, property: 'brightness' }, activeStartMs: consumer.startMs, activeDurationMs: consumer.durationMs,
    keyframes: [{ id: `expected-first-${index}`, timeMs: consumer.startMs, value: .7, easing: { curve: 'linear' } },
      { id: `expected-last-${index}`, timeMs: consumer.startMs + consumer.durationMs, value: .7, easing: { curve: 'linear' } }] }))
  expected.composition.clips.push(structuredClone(other))
  expect(prepare(expected).status).toBe('ready')
  const before = structuredClone(record), result = prepare(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  compareDelivered(record, expected)
  expect(record).toEqual(before)
})
