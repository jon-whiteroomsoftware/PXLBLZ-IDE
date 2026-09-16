import { expect, it } from 'vitest'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { editShowClipAppearanceV2, type ShowClipAppearanceEditIntentV2 } from './showClipAppearanceEditsV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import type { ShowClipEffect } from './personalContentRecords'

const source = 'export var level=.2; export var elapsed=0; export function sliderLevel(v){level=v} export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(level+x/4,elapsed/2000,y/2)}'
function fixture(): ShowRecordV2 {
  const legacy = convertibleV1Show()
  legacy.composition!.scenes[0].zones[0].overlays = []
  const converted = convertShowRecordV1ToV2(legacy)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .2 }
  record.composition.executionModel = 'continuous'
  const clip = record.composition.clips[0]
  const first = clip.appearance.keys[0]
  clip.appearance.keys = [0, 400, 800].map((timeMs, index) => ({ ...structuredClone(first), id: `appearance-${index}`, timeMs,
    value: { ...structuredClone(first.value), opacity: 1 - index / 5 } }))
  record.composition.propertyTracks = [{ id: 'level', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'last', timeMs: 1000, value: .6, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
function reopen(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(opened.status).toBe('opened')
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}
function prepare(record: ShowRecordV2) {
  const opened = reopen(record)
  return prepareShowV2ForCompile(opened, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(opened).composition.patternInstances.map(instance => [instance.id, source])) }, { libraries: {} })
}
function delivered(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const opened = reopen(record)
  const ready = prepare(opened)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(opened, artifact.code, { id: 'appearance-proof', stampedAt: '2026-09-16T00:00:00.000Z' })
  expect(exported.status).toBe('exported')
  if (exported.status !== 'exported') throw new Error(exported.message)
  const epe = parseEpe(exported.text)
  expect(epe.src).toBe(exported.source)
  return createFastReplayRuntime({ ...artifact, code: epe.src, fxCode: emitFixedPoint(epe.src), dimension: 2 },
    { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }, { sample: [.75, .5], pos: [.75, .5] }] })
}
function compareDelivered(actual: ShowRecordV2, expected: ShowRecordV2) {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const a = delivered(actual, fidelity), b = delivered(expected, fidelity)
    for (const atMs of [0, 1, 199, 200, 201, 399, 400, 401, 799, 800, 801, 999, 1001, 1401]) {
      const x = a.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }), y = b.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(x.frame).toEqual(y.frame)
      expect(x.exports).toEqual(y.exports)
      expect(Object.keys(x.exports).length).toBeGreaterThan(0)
    }
  }
}
function intent(kind: ShowClipAppearanceEditIntentV2['kind'], fields: object): ShowClipAppearanceEditIntentV2 {
  return { kind, clipId: 'clip', scope: 'whole-clip', ...fields } as ShowClipAppearanceEditIntentV2
}
function emptyAffected(result: ReturnType<typeof editShowClipAppearanceV2>) {
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || ['removedIds', 'discardedControlTargets'].includes(key)) expect(value).toEqual([])
}
it('applies finite whole-Clip fields without flattening held keys or changing shared instance animation', () => {
  const record = fixture(), before = structuredClone(record)
  const preimage = prepare(record)
  expect(preimage.status, JSON.stringify(preimage)).toBe('ready')
  const requested = intent('appearance', { patch: { opacity: .7, view: { mirror: true } } }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) { key.value.opacity = .7; key.value.view.mirror = true }
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedClipIds).toEqual(['clip'])
  expect(result.affectedAppearanceKeyIds).toEqual(['appearance-0', 'appearance-1', 'appearance-2'])
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  compareDelivered(result.record, expected)
  result.record.composition.clips[0].appearance.keys[0].value.view.phase = .9
  expect(record).toEqual(before)
})

it('adds an explicit fresh Effect identity across all held stacks without altering other values or animation', () => {
  const record = fixture(), before = structuredClone(record)
  const requested = intent('add-effect', { effect: { id: 'fresh-hue', kind: 'hue', turns: .2 } }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects!.push({ id: 'fresh-hue', kind: 'hue', turns: .2 })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedAppearanceKeyIds).toEqual(['appearance-0', 'appearance-1', 'appearance-2'])
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  compareDelivered(result.record, expected)
})

it('updates an exact Effect parameter in every span while preserving span-local values and numeric animation', () => {
  const record = fixture()
  record.composition.clips[0].appearance.keys.forEach(key => { key.value.effects = [{ id: 'filter', kind: 'threshold', threshold: .2, amount: .4 }] })
  const preimage = prepare(record)
  expect(preimage.status, JSON.stringify(preimage)).toBe('ready')
  const before = structuredClone(record)
  const requested = intent('update-effect', { effectId: 'filter', effectKind: 'threshold', parameter: 'amount', value: .6 })
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) {
    const effect = key.value.effects![0]
    if (effect.kind !== 'threshold') throw new Error('Expected threshold Effect')
    effect.amount = .6
  }
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('preserves span-varying Effect values and Clip Effect animation structurally without claiming final source eligibility', () => {
  const record = fixture()
  record.composition.clips[0].appearance.keys.forEach((key, index) => { key.value.effects = [{ id: 'filter', kind: 'threshold', threshold: .1 + index / 10, amount: .4 }] })
  record.composition.propertyTracks.push({ id: 'filter-animation', target: { kind: 'clip-effect', clipId: 'clip', effectId: 'filter', effectKind: 'threshold', parameterId: 'threshold' }, activeStartMs: 200, activeDurationMs: 400,
    keyframes: [{ id: 'filter-first', timeMs: 200, value: .1, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'filter-last', timeMs: 600, value: .4, easing: { curve: 'linear' } }] })
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('update-effect', { effectId: 'filter', effectKind: 'threshold', parameter: 'amount', value: .6 }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) {
    const effect = key.value.effects![0]
    if (effect.kind !== 'threshold') throw new Error('Expected threshold Effect')
    effect.amount = .6
  }
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
})

it('duplicates a whole-Clip Effect under one explicit fresh ID, keeping animation on its original owner', () => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }]
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('duplicate-effect', { effectId: 'hue', effectKind: 'hue', newEffectId: 'hue-copy' }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects!.push({ id: 'hue-copy', kind: 'hue', turns: .1 })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('reorders an exact same-stage whole-Clip Effect without moving other stage slots or changing values', () => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [
    { id: 'bright', kind: 'brightness', brightness: .7 }, { id: 'pose', kind: 'translate', x: .1, y: .1 }, { id: 'contrast', kind: 'contrast', contrast: 1.3 }]
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('reorder-effect', { effectId: 'bright', effectKind: 'brightness', targetEffectId: 'contrast', targetEffectKind: 'contrast', edge: 'after' }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) {
    const [bright, pose, contrast] = key.value.effects!
    key.value.effects = [contrast, pose, bright]
  }
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('applies finite optional appearance components explicitly while preserving held key timing and unrelated fields', () => {
  const record = fixture(), before = structuredClone(record)
  const patch = { transform: { positionX: .1, scaleX: .8 }, aperture: { enabled: true, width: .8, aperture: 'ellipse' as const, edge: 'hard' as const },
    presentation: { mode: 'live' as const }, blink: { rateHz: 2, duty: .6, phase: .1 } }
  const result = editShowClipAppearanceV2(record, intent('appearance', { patch }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) {
    key.value.transform = { positionX: .1, positionY: 0, rotation: 0, scaleX: .8, scaleY: 1 }
    key.value.aperture = { enabled: true, x: 0, y: 0, width: .8, height: 1, aperture: 'ellipse', edge: 'hard' }
    key.value.presentation = { mode: 'live' }
    key.value.blink = { rateHz: 2, duty: .6, phase: .1 }
  }
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('refuses a complete candidate with an existing invalid numeric Effect parameter instead of preserving an unusable target', () => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }]
  record.composition.propertyTracks.push({ id: 'invalid-effect-track', target: { kind: 'clip-effect', clipId: 'clip', effectId: 'hue', effectKind: 'hue', parameterId: 'unknown' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'first', timeMs: 0, value: .1, easing: { curve: 'linear' } }, { id: 'last', timeMs: 1000, value: .2, easing: { curve: 'linear' } }] })
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('appearance', { patch: { opacity: .7 } }))
  expect(result.status, JSON.stringify(result)).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

const families: ShowClipEffect[] = [
  { id: 'new-effect', kind: 'opacity', opacity: .6 }, { id: 'new-effect', kind: 'brightness', brightness: 1.4 },
  { id: 'new-effect', kind: 'hue', turns: .1 }, { id: 'new-effect', kind: 'saturation', saturation: 1.4 }, { id: 'new-effect', kind: 'contrast', contrast: 1.3 },
  { id: 'new-effect', kind: 'invert', amount: .25 }, { id: 'new-effect', kind: 'threshold', threshold: .4, amount: .5 },
  { id: 'new-effect', kind: 'luma-key', target: .2, tolerance: .1, softness: .2 }, { id: 'new-effect', kind: 'chroma-key', color: '#448844', tolerance: .1, softness: .2 },
  { id: 'new-effect', kind: 'posterize', levels: 5, amount: .5 }, { id: 'new-effect', kind: 'vignette', amount: .5, radius: .5, softness: .2, centerX: .5, centerY: .5, aspect: 1 },
  { id: 'new-effect', kind: 'color-map', amount: .5, shadowR: .1, shadowG: .2, shadowB: .3, highlightR: .7, highlightG: .8, highlightB: .9 },
  { id: 'new-effect', kind: 'translate', x: .1, y: .1 }, { id: 'new-effect', kind: 'rotate', turns: .1 }, { id: 'new-effect', kind: 'scale', x: .8, y: 1.2 },
  { id: 'new-effect', kind: 'shear', x: .1, y: .1 }, { id: 'new-effect', kind: 'ripple', amount: .1, frequency: 3, phase: .2, centerX: .5, centerY: .5 },
  { id: 'new-effect', kind: 'swirl', amount: 1, radius: .6, centerX: .5, centerY: .5 }, { id: 'new-effect', kind: 'bulge', amount: .5, radius: .6, centerX: .5, centerY: .5 },
  { id: 'new-effect', kind: 'pixelate', amount: .5, columns: 4, rows: 4 }, { id: 'new-effect', kind: 'kaleidoscope', amount: .5, segments: 3, rotation: .1, centerX: .5, centerY: .5 },
  { id: 'new-effect', kind: 'wrap' },
]
it.each(families)('delivers whole-Clip $kind Effect with exact literal values through native EPE Fast/Precise', effect => {
  const record = fixture()
  if (effect.kind === 'wrap') for (const key of record.composition.clips[0].appearance.keys) key.value.transform = { positionX: .5, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
  const preimage = prepare(record)
  expect(preimage.status, JSON.stringify(preimage)).toBe('ready')
  const before = structuredClone(record)
  const requested = intent('add-effect', { effect }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects!.push(structuredClone(effect))
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  compareDelivered(result.record, expected)
})

it.each([
  ['unknown top-level field', { patch: { simulation: { timeScale: 2 } } }], ['effects in appearance patch', { patch: { effects: [] } }],
  ['NaN opacity', { patch: { opacity: NaN } }], ['infinite view', { patch: { view: { brightness: Infinity } } }], ['out-of-range view', { patch: { view: { phase: 1.1 } } }],
  ['null required view', { patch: { view: null } }], ['string mirror', { patch: { view: { mirror: 'true' } } }], ['unknown view', { patch: { view: { rotation: 1 } } }],
  ['invalid transform scale', { patch: { transform: { scaleX: 0 } } }], ['unknown transform', { patch: { transform: { id: 'pose' } } }],
  ['null required aperture field', { patch: { aperture: { enabled: null } } }], ['unknown aperture shape', { patch: { aperture: { aperture: 'square' } } }],
  ['invalid feather', { patch: { aperture: { feather: 0 } } }], ['invalid shape count', { patch: { aperture: { starPoints: 13 } } }],
  ['invalid cadence', { patch: { presentation: { mode: 'strobe', cadenceMs: 15 } } }], ['extraneous presentation', { patch: { presentation: { mode: 'live', cadenceMs: 16 } } }],
  ['incomplete blink', { patch: { blink: { rateHz: 2 } } }], ['out-of-range blink', { patch: { blink: { rateHz: 61, duty: .5, phase: 0 } } }],
  ['explicit undefined opacity', { patch: { opacity: undefined } }], ['nonfinite optional field', { patch: { aperture: { rotation: -Infinity } } }],
] as const)('refuses malformed finite appearance intent atomically (%s)', (_name, fields) => {
  const record = fixture(), before = structuredClone(record), requested = intent('appearance', fields), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  emptyAffected(result)
})

it.each(['update-effect', 'duplicate-effect', 'reorder-effect'] as const)('refuses %s when the exact source is absent or changes kind in a later held stack', kind => {
  for (const replacement of [[], [{ id: 'hue', kind: 'brightness' as const, brightness: 1 }]]) {
    const record = fixture()
    for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'other', kind: 'contrast', contrast: 1.2 }]
    record.composition.clips[0].appearance.keys[2].value.effects = replacement
    const before = structuredClone(record)
    const result = editShowClipAppearanceV2(record, intent(kind, { effectId: 'hue', effectKind: 'hue',
      ...(kind === 'update-effect' ? { parameter: 'turns', value: .2 } : kind === 'duplicate-effect' ? { newEffectId: 'copy' }
        : { targetEffectId: 'other', targetEffectKind: 'contrast', edge: 'after' }) }))
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
    emptyAffected(result)
  }
})

it.each(['add-effect', 'duplicate-effect'] as const)('rejects %s IDs used only in the final held stack and blank caller IDs', kind => {
  for (const id of ['later', '', '  ']) {
    const record = fixture()
    for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }]
    record.composition.clips[0].appearance.keys[2].value.effects!.push({ id: 'later', kind: 'invert', amount: .2 })
    const before = structuredClone(record)
    const result = editShowClipAppearanceV2(record, intent(kind, kind === 'add-effect' ? { effect: { id, kind: 'hue', turns: .2 } }
      : { effectId: 'hue', effectKind: 'hue', newEffectId: id }))
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
    emptyAffected(result)
  }
})

it('copies each span own Effect value without retargeting or copying the original numeric animation', () => {
  const record = fixture()
  for (const [index, key] of record.composition.clips[0].appearance.keys.entries()) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 + index / 10 }]
  record.composition.propertyTracks.push({ id: 'hue-animation', target: { kind: 'clip-effect', clipId: 'clip', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'hue-first', timeMs: 0, value: .1, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'hue-last', timeMs: 1000, value: .3, easing: { curve: 'linear' } }] })
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('duplicate-effect', { effectId: 'hue', effectKind: 'hue', newEffectId: 'copy' }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects!.push({ ...key.value.effects![0], id: 'copy' })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
})

it('reports only changed held keys and preserves original identity for whole-Clip no-ops', () => {
  const record = fixture()
  const mixed = editShowClipAppearanceV2(record, intent('appearance', { patch: { opacity: .8 } }))
  expect(mixed.status).toBe('changed')
  expect(mixed.affectedAppearanceKeyIds).toEqual(['appearance-0', 'appearance-2'])
  for (const requested of [intent('appearance', { patch: {} }), intent('appearance', { patch: { view: { mirror: record.composition.clips[0].appearance.keys[0].value.view.mirror } } })]) {
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
  for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'other', kind: 'contrast', contrast: 1.2 }]
  for (const requested of [intent('update-effect', { effectId: 'hue', effectKind: 'hue', parameter: 'turns', value: .1 }),
    intent('reorder-effect', { effectId: 'hue', effectKind: 'hue', targetEffectId: 'other', targetEffectKind: 'contrast', edge: 'before' }),
    intent('reorder-effect', { effectId: 'hue', effectKind: 'hue', targetEffectId: 'hue', targetEffectKind: 'hue', edge: 'after' })]) {
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
})

it('removes only explicitly optional components and nested aperture fields without normalizing unrelated authored values', () => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) {
    key.value.transform = { positionX: .1, positionY: .2, rotation: .3, scaleX: 1, scaleY: 1 }
    key.value.aperture = { enabled: true, x: 0, y: 0, width: 1, height: 1, aperture: 'ellipse', feather: .2, starPoints: 5 }
    key.value.presentation = { mode: 'freeze' }
    key.value.blink = { rateHz: 1, duty: .5, phase: .1 }
  }
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('appearance', { patch: { transform: null, aperture: { feather: null }, presentation: null, blink: null } }))
  expect(result.status).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) { delete key.value.transform; delete key.value.aperture!.feather; delete key.value.presentation; delete key.value.blink }
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('keeps Effect IDs Clip-scoped and preserves shared runtime users and their animation', () => {
  const record = fixture()
  record.composition.clips[0].durationMs = 500
  record.composition.clips[0].appearance.keys.forEach(key => { key.timeMs /= 2 })
  const other = structuredClone(record.composition.clips[0])
  other.id = 'other-clip'; other.startMs = 500
  for (const key of other.appearance.keys) { key.id = `other:${key.id}`; key.timeMs += 500; key.value.effects = [{ id: 'fresh', kind: 'hue', turns: .4 }] }
  record.composition.clips.push(other)
  const before = structuredClone(record)
  expect(prepare(record).status).toBe('ready')
  const result = editShowClipAppearanceV2(record, intent('add-effect', { effect: { id: 'fresh', kind: 'hue', turns: .2 } }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects!.push({ id: 'fresh', kind: 'hue', turns: .2 })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.record.composition.clips[1]).toEqual(before.composition.clips[1])
  expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it.each([
  ['hue', 'turns', .3, { turns: .3 }], ['translate', 'translateX', .2, { x: .2 }], ['translate', 'y', .2, { y: .2 }],
  ['scale', 'scaleY', .8, { y: .8 }], ['shear', 'shearX', .2, { x: .2 }], ['posterize', 'levels', 6.4, { levels: 6 }],
  ['chroma-key', 'color', '#00ff00', { color: '#00ff00' }], ['color-map', 'shadowColor', '#00ff00', { shadowR: 0, shadowG: 1, shadowB: 0 }],
  ['color-map', 'highlightColor', '#ff0000', { highlightR: 1, highlightG: 0, highlightB: 0 }], ['color-map', 'shadowR', .4, { shadowR: .4 }],
] as const)('updates %s parameter %s with explicit descriptor/alias values and literal delivered output', (kind, parameter, value, patch) => {
  const record = fixture(), original = families.find(effect => effect.kind === kind)!
  for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [structuredClone(original)]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('update-effect', { effectId: 'new-effect', effectKind: kind, parameter, value }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) Object.assign(key.value.effects![0], patch)
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it.each([
  ['unknown', .2], ['id', 'changed'], ['kind', 'brightness'], ['turns', NaN], ['turns', Infinity], ['turns', 20], ['turns', '.2'],
] as const)('rejects unknown, nonfinite and out-of-domain Effect parameter (%s=%s)', (parameter, value) => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }]
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('update-effect', { effectId: 'hue', effectKind: 'hue', parameter, value }))
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it('preserves admitted nonlinear numeric Effect animation through whole-Clip update and duplicate', () => {
  const record = fixture()
  record.composition.clips[0].appearance.keys = [record.composition.clips[0].appearance.keys[0]]
  record.composition.clips[0].appearance.keys[0].value.effects = [{ id: 'filter', kind: 'threshold', threshold: .2, amount: .4 }]
  record.composition.propertyTracks.push({ id: 'filter-animation', target: { kind: 'clip-effect', clipId: 'clip', effectId: 'filter', effectKind: 'threshold', parameterId: 'threshold' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'filter-first', timeMs: 0, value: .1, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'filter-last', timeMs: 1000, value: .6, easing: { curve: 'linear' } }] })
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  for (const requested of [intent('update-effect', { effectId: 'filter', effectKind: 'threshold', parameter: 'amount', value: .6 }),
    intent('duplicate-effect', { effectId: 'filter', effectKind: 'threshold', newEffectId: 'copy' })]) {
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status, JSON.stringify(result)).toBe('changed')
    const expected = structuredClone(before)
    if (requested.kind === 'update-effect') Object.assign(expected.composition.clips[0].appearance.keys[0].value.effects![0], { amount: .6 })
    else expected.composition.clips[0].appearance.keys[0].value.effects!.push({ id: 'copy', kind: 'threshold', threshold: .2, amount: .4 })
    expect(reopen(result.record)).toEqual(expected)
    expect(result.affectedTrackIds).toEqual([])
    expect(record).toEqual(before)
    compareDelivered(result.record, expected)
  }
})

it('keeps same-ID Group Effects and held shared runtime contribution exact', () => {
  const record = fixture(), clip = record.composition.clips[0]
  clip.durationMs = 500
  clip.appearance.keys.forEach(key => { key.timeMs /= 2 })
  record.composition.groupDefinitions = [{ id: 'group', name: 'Group', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }], clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200,
      entryPolicy: 'restart', zoneSampleMode: 'span', appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'local-key', timeMs: 0,
        value: { ...structuredClone(clip.appearance.keys[0].value), effects: [{ id: 'fresh', kind: 'hue', turns: .4 }] } }] } }], transitions: [], propertyTracks: [] }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: 'zone', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    startMs: 500, translationX: .1, translationY: 0, holds: [{ id: 'beat', localTimeMs: 100, durationMs: 100 }], instanceBindings: { slot: 'instance' },
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: clip.layerId }] }]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('add-effect', { effect: { id: 'fresh', kind: 'hue', turns: .2 } }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects!.push({ id: 'fresh', kind: 'hue', turns: .2 })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(result.record.composition.groupOccurrences).toEqual(before.composition.groupOccurrences)
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it.each(['turns', 'unknown', 'color'] as const)('retains valid numeric Transition Effect ramps or refuses incompatible parameter %s without cascade', parameterId => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record, transition = record.composition.transitions[0]
  const incoming = record.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!
  for (const key of incoming.appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .2 }]
  transition.propertyRamps = [{ participantId: transition.participants[0].id,
    target: { kind: 'clip-effect', clipId: incoming.id, effectId: 'hue', effectKind: 'hue', parameterId }, from: .1, easing: { curve: 'sine', direction: 'in-out' } }]
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, { kind: 'appearance', clipId: incoming.id, scope: 'whole-clip', patch: { opacity: .7 } })
  if (parameterId === 'turns') {
    expect(result.status, JSON.stringify(result)).toBe('changed')
    const expected = structuredClone(before)
    for (const key of expected.composition.clips.find(clip => clip.id === incoming.id)!.appearance.keys) key.value.opacity = .7
    expect(reopen(result.record)).toEqual(expected)
    expect(result.affectedTransitionIds).toEqual([])
  } else {
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
  expect(record).toEqual(before)
})

it('refuses foreign or missing reorder targets, cross-stage placement, unknown edges and malformed Effects atomically', () => {
  const record = fixture()
  for (const key of record.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'pose', kind: 'translate', x: .1, y: .1 }]
  const before = structuredClone(record)
  for (const requested of [
    intent('reorder-effect', { effectId: 'hue', effectKind: 'hue', targetEffectId: 'pose', targetEffectKind: 'translate', edge: 'after' }),
    intent('reorder-effect', { effectId: 'hue', effectKind: 'hue', targetEffectId: 'missing', targetEffectKind: 'hue', edge: 'before' }),
    intent('reorder-effect', { effectId: 'hue', effectKind: 'hue', targetEffectId: 'hue', targetEffectKind: 'brightness', edge: 'before' }),
    intent('reorder-effect', { effectId: 'hue', effectKind: 'hue', targetEffectId: 'hue', targetEffectKind: 'hue', edge: 'around' }),
    intent('add-effect', { effect: { id: 'fresh', kind: 'hue', turns: NaN } }),
    intent('add-effect', { effect: { id: 'fresh', kind: 'hue', turns: 20 } }),
    intent('add-effect', { effect: { id: 'fresh', kind: 'hue', turns: .1, unknown: 1 } }),
    intent('add-effect', { effect: { id: 'fresh', kind: 'unsupported' } }),
    intent('add-effect', { effect: { id: 'fresh', kind: 'chroma-key', color: 'invalid', tolerance: .1, softness: .1 } }),
  ]) {
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
    emptyAffected(result)
  }
})

it('validates numeric Effect targets in materialized Groups without editing their scoped owners', () => {
  const record = fixture(), clip = record.composition.clips[0]
  clip.durationMs = 500; clip.appearance.keys.forEach(key => { key.timeMs /= 2 })
  record.composition.groupDefinitions = [{ id: 'group', name: 'Group', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }], clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200,
      entryPolicy: 'continue', zoneSampleMode: 'span', appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'local-key', timeMs: 0,
        value: { ...structuredClone(clip.appearance.keys[0].value), effects: [{ id: 'hue', kind: 'hue', turns: .1 }] } }] } }], transitions: [],
    propertyTracks: [{ id: 'group-effect', target: { kind: 'clip-effect', clipId: 'child', effectId: 'hue', effectKind: 'hue', parameterId: 'unknown' }, activeStartMs: 0, activeDurationMs: 200,
      keyframes: [{ id: 'first', timeMs: 0, value: .1, easing: { curve: 'linear' } }, { id: 'last', timeMs: 200, value: .2, easing: { curve: 'linear' } }] }] }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: 'zone', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    startMs: 500, translationX: 0, translationY: 0, holds: [], instanceBindings: { slot: 'instance' },
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: clip.layerId }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('appearance', { patch: { opacity: .7 } }))
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it.each([200, 201])('checks complete candidate Layout availability beyond the edited Clip (other contribution end %s)', endMs => {
  const record = fixture(), ordinary = record.composition.clips[0]
  ordinary.durationMs = endMs; ordinary.appearance.keys = [ordinary.appearance.keys[0]]
  record.zones.push({ id: 'other-zone', name: 'Other', nominalPixelCount: 16 })
  record.composition.layers.push({ id: 'other-layer', zoneId: 'other-zone', name: 'Other', rank: 0 })
  record.zoneLayouts.push({ id: 'second-layout', name: 'Later', zones: [], logical: { kind: 'single', zoneIds: ['other-zone'] } })
  record.composition.layoutOccurrences[0].durationMs = 200
  record.composition.layoutOccurrences.push({ id: 'second-use', layoutId: 'second-layout', startMs: 200, durationMs: 800, parameters: {} })
  const selected = structuredClone(ordinary)
  selected.id = 'selected'; selected.zoneId = 'other-zone'; selected.layerId = 'other-layer'; selected.startMs = 200; selected.durationMs = 800
  selected.appearance.keys[0].id = 'selected-key'; selected.appearance.keys[0].timeMs = 200
  record.composition.clips.push(selected)
  expect(validateShowRecordV2(record)).toEqual([])
  expect(prepare(record).status).toBe(endMs === 200 ? 'ready' : 'refused')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, { kind: 'appearance', clipId: 'selected', scope: 'whole-clip', patch: { opacity: .7 } })
  if (endMs === 200) {
    expect(result.status, JSON.stringify(result)).toBe('changed')
    const expected = structuredClone(before)
    expected.composition.clips[1].appearance.keys[0].value.opacity = .7
    expect(reopen(result.record)).toEqual(expected)
    compareDelivered(result.record, expected)
  } else {
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
  expect(record).toEqual(before)
})

it.each([{ feather: null }, { feather: null, rotation: null }, { aperture: null, invert: null }, {}])('keeps absent aperture absent for removal-only patches %j', aperture => {
  const record = fixture(), before = structuredClone(record)
  const requested = intent('appearance', { patch: { aperture } }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('unchanged')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  emptyAffected(result)
  compareDelivered(result.record, before)
})

it('removes aperture fields only in present spans and reports exactly the changed key without creating absent spans', () => {
  const record = fixture(), keys = record.composition.clips[0].appearance.keys
  keys[1].value.aperture = { enabled: false, x: 0, y: 0, width: 1, height: 1, feather: .2, rotation: .1 }
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('appearance', { patch: { aperture: { feather: null } } }))
  expect(result.status).toBe('changed')
  const expected = structuredClone(before)
  delete expected.composition.clips[0].appearance.keys[1].value.aperture!.feather
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedAppearanceKeyIds).toEqual(['appearance-1'])
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
  result.record.composition.clips[0].appearance.keys[1].value.aperture!.rotation = .9
  expect(record).toEqual(before)
})

it('keeps absent optional components absent and already removed aperture fields unchanged', () => {
  const record = fixture()
  record.composition.clips[0].appearance.keys[1].value.aperture = { enabled: false, x: 0, y: 0, width: 1, height: 1 }
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('appearance', { patch: { transform: null, presentation: null, blink: null, aperture: { feather: null } } }))
  expect(result.status).toBe('unchanged')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
  compareDelivered(result.record, before)
})

it.each(['transform', 'aperture'] as const)('keeps an empty optional %s patch unchanged rather than instantiating defaults', component => {
  const record = fixture(), before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, intent('appearance', { patch: { [component]: {} } }))
  expect(result.status).toBe('unchanged')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})
