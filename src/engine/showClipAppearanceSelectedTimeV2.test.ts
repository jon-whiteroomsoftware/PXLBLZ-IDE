import { expect, it } from 'vitest'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { editShowClipAppearanceV2, type ShowClipAppearanceEditIntentV2, type ShowClipAppearancePatchV2 } from './showClipAppearanceEditsV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import type { ShowClipEffect } from './personalContentRecords'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from './showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT } from './showClipViewport'

const source = 'export var level=.2; export var elapsed=0; export function sliderLevel(v){level=v} export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(level+x/4,elapsed/2000,y/2)}'
function fixture(): ShowRecordV2 {
  const legacy = convertibleV1Show()
  legacy.composition!.scenes[0].zones[0].overlays = []
  const conversion = convertShowRecordV1ToV2(legacy)
  if (conversion.status !== 'converted') throw new Error(JSON.stringify(conversion))
  const record = conversion.record
  record.composition.executionModel = 'continuous'
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .2 }
  const clip = record.composition.clips[0], first = clip.appearance.keys[0]
  clip.entryPolicy = 'continue'
  clip.appearance.keys = [0, 400, 800].map((timeMs, index) => ({ ...structuredClone(first), id: `appearance-${index}`, timeMs,
    value: { ...structuredClone(first.value), opacity: 1 - index / 5, view: { mirror: false, phase: index / 5, brightness: 1 } } }))
  record.composition.propertyTracks = [{ id: 'level', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'level-first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'level-last', timeMs: 1000, value: .6, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
function reopen(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened))
  return opened.record
}
function prepare(record: ShowRecordV2) {
  const opened = reopen(record)
  return prepareShowV2ForCompile(opened, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(opened).composition.patternInstances.map(instance => [instance.id, source])) }, { libraries: {} })
}
function delivered(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const opened = reopen(record), ready = prepare(opened)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Admitted selected-time consumer refused')
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(opened, artifact.code, { id: 'selected-appearance-proof', stampedAt: '2026-09-16T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  const openedEpe = parseEpe(exported.text)
  expect(openedEpe.src).toBe(exported.source)
  return createFastReplayRuntime({ ...artifact, code: openedEpe.src, fxCode: emitFixedPoint(openedEpe.src), dimension: 2 },
    { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }, { sample: [.75, .5], pos: [.75, .5] }] })
}
function compareDelivered(actual: ShowRecordV2, expected: ShowRecordV2) {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const a = delivered(actual, fidelity), b = delivered(expected, fidelity)
    for (const atMs of [0, 1, 99, 100, 101, 199, 200, 201, 299, 300, 301, 399, 400, 401, 599, 600, 601, 799, 800, 801, 999, 1001, 1201, 1401]) {
      const x = a.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }), y = b.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(x.frame).toEqual(y.frame)
      expect(x.exports).toEqual(y.exports)
      expect(Object.keys(x.exports)).not.toHaveLength(0)
    }
  }
}
function selected(kind: ShowClipAppearanceEditIntentV2['kind'], atMs: number, fields: object, identity: 'retain' | 'insert' = 'insert', id = `selected-${atMs}`): ShowClipAppearanceEditIntentV2 {
  return { kind, clipId: 'clip', scope: 'selected-time', atMs, keyIdentity: { kind: identity, appearanceKeyId: id }, ...fields } as unknown as ShowClipAppearanceEditIntentV2
}
function emptyAffected(result: ReturnType<typeof editShowClipAppearanceV2>) {
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || ['removedIds', 'discardedControlTargets'].includes(key)) expect(value).toEqual([])
}

it('inserts one complete selected-time value until the next key without moving shared animation', () => {
  const record = fixture(), before = structuredClone(record)
  expect(prepare(record).status).toBe('ready')
  const requested = selected('appearance', 200, { patch: { opacity: .7, view: { mirror: true } } }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200,
    value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), opacity: .7, view: { mirror: true, phase: 0, brightness: 1 } } })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedClipIds).toEqual(['clip'])
  expect(result.affectedAppearanceKeyIds).toEqual(['selected-200'])
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
  compareDelivered(result.record, expected)
  result.record.composition.clips[0].appearance.keys[1].value.view.phase = .9
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
})

it.each([0, 400, 800])('retains the authored key at nominal time%i and changes only its held value', atMs => {
  const record = fixture(), before = structuredClone(record)
  const index = atMs / 400
  const result = editShowClipAppearanceV2(record, selected('appearance', atMs, { patch: { view: { brightness: .5 } } }, 'retain', `appearance-${index}`))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys[index].value.view.brightness = .5
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedAppearanceKeyIds).toEqual([`appearance-${index}`])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it.each([201, 799, 900])('seeds the complete current value at interior%i including the final held span', atMs => {
  const record = fixture(), before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected('appearance', atMs, { patch: { opacity: .9 } }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  const index = atMs < 400 ? 0 : atMs < 800 ? 1 : 2
  expected.composition.clips[0].appearance.keys.splice(index + 1, 0, { id: `selected-${atMs}`, timeMs: atMs,
    value: { ...structuredClone(before.composition.clips[0].appearance.keys[index].value), opacity: .9 } })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedAppearanceKeyIds).toEqual([`selected-${atMs}`])
  expect(record).toEqual(before)
})

it('retains a new key on repeated selected-time editing and keeps whole-Clip application explicit', () => {
  const record = fixture()
  const first = editShowClipAppearanceV2(record, selected('appearance', 200, { patch: { opacity: .7 } }))
  expect(first.status).toBe('changed')
  const repeated = editShowClipAppearanceV2(first.record, selected('appearance', 200, { patch: { view: { brightness: .6 } } }, 'retain', 'selected-200'))
  expect(repeated.status).toBe('changed')
  expect(repeated.record.composition.clips[0].appearance.keys.map(key => [key.id, key.timeMs])).toEqual([
    ['appearance-0', 0], ['selected-200', 200], ['appearance-1', 400], ['appearance-2', 800],
  ])
  expect(repeated.record.composition.clips[0].appearance.keys.map(key => key.value.opacity)).toEqual([1, .7, .8, .6])
  const whole = editShowClipAppearanceV2(repeated.record, { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { opacity: .5 } })
  expect(whole.status).toBe('changed')
  expect(whole.record.composition.clips[0].appearance.keys.map(key => key.value.opacity)).toEqual([.5, .5, .5, .5])
  expect(record.composition.clips[0].appearance.keys).toHaveLength(3)
})

it.each([
  { view: { phase: .3, brightness: .5, mirror: true } },
  { transform: { positionX: .1, positionY: .2, rotation: .1, scaleX: .8, scaleY: 1.2 } },
  { aperture: { enabled: true, x: .1, y: .1, width: .8, height: .8, aperture: 'ellipse', edge: 'hard', feather: .1, rotation: .1, invert: true } },
  { aperture: { enabled: true, aperture: 'star', starPoints: 5.4, starInner: .4 } },
  { aperture: { enabled: true, aperture: 'polygon', polygonSides: 5.4 } },
  { presentation: { mode: 'freeze' } }, { presentation: { mode: 'strobe', cadenceMs: 64.4 } },
  { blink: { rateHz: 2, duty: .6, phase: .1 } },
] satisfies ShowClipAppearancePatchV2[])('delivers complete selected appearance component %j only until the next key', patch => {
  const record = fixture()
  // Freeze/Strobe output requires an unkeyed cache consumer. The keyed-control
  // combination has its own explicit compiler-refusal test below.
  if ('presentation' in patch) record.composition.propertyTracks = []
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), requested = selected('appearance', 200, { patch }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const value = structuredClone(before.composition.clips[0].appearance.keys[0].value)
  if ('view' in patch) Object.assign(value.view, patch.view)
  if ('transform' in patch) value.transform = { ...NEUTRAL_SHOW_CLIP_TRANSFORM, ...patch.transform }
  if ('aperture' in patch) {
    value.aperture = { ...DEFAULT_SHOW_CLIP_VIEWPORT, ...patch.aperture }
    if (value.aperture.starPoints !== undefined) value.aperture.starPoints = 5
    if (value.aperture.polygonSides !== undefined) value.aperture.polygonSides = 5
  }
  if ('presentation' in patch) value.presentation = patch.presentation!.mode === 'strobe' ? { mode: 'strobe', cadenceMs: 64 } : { mode: 'freeze' }
  if ('blink' in patch) value.blink = structuredClone(patch.blink)
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200, value })
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
  compareDelivered(result.record, expected)
  result.record.composition.clips[0].appearance.keys[1].value.view.phase = .9
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
})

it('removes optional components only from the complete selected value and retains original neighboring values', () => {
  const record = fixture(), first = record.composition.clips[0].appearance.keys[0]
  record.composition.propertyTracks = []
  first.value.transform = { positionX: .1, positionY: .2, rotation: .1, scaleX: 1, scaleY: 1 }
  first.value.aperture = { enabled: true, x: 0, y: 0, width: 1, height: 1, aperture: 'ellipse', feather: .2 }
  first.value.presentation = { mode: 'freeze' }; first.value.blink = { rateHz: 1, duty: .5, phase: .1 }
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), result = editShowClipAppearanceV2(record, selected('appearance', 200, { patch: { transform: null, aperture: { feather: null }, presentation: null, blink: null } }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const value = structuredClone(first.value)
  delete value.transform; delete value.aperture!.feather; delete value.presentation; delete value.blink
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200, value })
  expect(reopen(result.record)).toEqual(expected); expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it.each(['freeze', 'strobe'] as const)('records the existing keyed instance-control %s compiler restriction separately from structural authoring', mode => {
  const record = fixture(), preimage = prepare(record)
  expect(preimage.status).toBe('ready')
  if (preimage.status === 'ready') expect(() => compileShow(preimage.recipe, {})).not.toThrow()
  const before = structuredClone(record), result = editShowClipAppearanceV2(record, selected('appearance', 200, { patch: { presentation: mode === 'strobe' ? { mode, cadenceMs: 64 } : { mode } } }))
  expect(result.status).toBe('changed'); expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  const admission = prepare(result.record)
  expect(admission.status).toBe('ready')
  if (admission.status === 'ready') expect(() => compileShow(admission.recipe, {})).toThrow('requires one static, unkeyed Clip')
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(record).toEqual(before)
})

it.each([
  selected('appearance', 200, { patch: {} }),
  selected('appearance', 200, { patch: { opacity: 1 } }),
  selected('appearance', 200, { patch: { transform: {}, aperture: { feather: null } } }),
  selected('appearance', 0, { patch: { presentation: null, blink: null } }, 'retain', 'appearance-0'),
])('keeps no-op selected value/key identity and absent optional components', requested => {
  const record = fixture(), before = structuredClone(record), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('unchanged')
  expect(result.record).toBe(record)
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
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
it.each(families)('delivers selected-time $kind addition only until the next key through native EPE Fast/Precise', effect => {
  const record = fixture()
  if (effect.kind === 'wrap') record.composition.clips[0].appearance.keys[0].value.transform = { positionX: .5, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), requested = selected('add-effect', 200, { effect }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200,
    value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [structuredClone(effect)] } })
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
  expect(result.affectedAppearanceKeyIds).toEqual(['selected-200'])
  compareDelivered(result.record, expected)
})

it.each([
  ['hue', 'turns', .3, { turns: .3 }], ['translate', 'translateX', .2, { x: .2 }], ['translate', 'y', .2, { y: .2 }],
  ['scale', 'scaleY', .8, { y: .8 }], ['shear', 'shearX', .2, { x: .2 }], ['posterize', 'levels', 6.4, { levels: 6 }],
  ['chroma-key', 'color', '#00ff00', { color: '#00ff00' }], ['color-map', 'shadowColor', '#00ff00', { shadowR: 0, shadowG: 1, shadowB: 0 }],
  ['color-map', 'highlightColor', '#ff0000', { highlightR: 1, highlightG: 0, highlightB: 0 }], ['color-map', 'shadowR', .4, { shadowR: .4 }],
] as const)('updates selected %s parameter %s without requiring source in other spans', (kind, parameter, value, patch) => {
  const record = fixture(), original = families.find(effect => effect.kind === kind)!
  record.composition.clips[0].appearance.keys[0].value.effects = [structuredClone(original)]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected('update-effect', 200, { effectId: 'new-effect', effectKind: kind, parameter, value }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200,
    value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [{ ...structuredClone(original), ...patch } as ShowClipEffect] } })
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('duplicates the selected authored value while nonlinear animation remains attached only to its original Effect', () => {
  const record = fixture()
  for (const [index, key] of record.composition.clips[0].appearance.keys.entries()) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 + index / 10 }]
  record.composition.propertyTracks.push({ id: 'hue-animation', target: { kind: 'clip-effect', clipId: 'clip', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' }, activeStartMs: 100, activeDurationMs: 500,
    keyframes: [{ id: 'hue-first', timeMs: 100, value: .1, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'hue-last', timeMs: 600, value: .6, easing: { curve: 'linear' } }] })
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected('duplicate-effect', 200, { effectId: 'hue', effectKind: 'hue', newEffectId: 'copy' }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200,
    value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'copy', kind: 'hue', turns: .1 }] } })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(result.affectedTrackIds).toEqual([])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('refuses a selected-time reorder that reverses Effects held elsewhere in the Clip (#1131)', () => {
  const record = fixture()
  record.composition.clips[0].appearance.keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'pose', kind: 'rotate', turns: .1 }, { id: 'other', kind: 'invert', amount: .3 }]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected('reorder-effect', 200, { effectId: 'hue', effectKind: 'hue', targetEffectId: 'other', targetEffectKind: 'invert', edge: 'after' }))
  // #1131 brief: a selected-time inversion now refuses at the appearance owner.
  expect(result.status, JSON.stringify(result)).toBe('refused')
  if (result.status === 'refused') expect(result.code).toBe('effect-order-conflict')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
})

it('delivers an admitted selected-key reorder with one runtime and preserves other stages', () => {
  const record = fixture(), first = record.composition.clips[0].appearance.keys[0]
  first.value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'pose', kind: 'rotate', turns: .1 }, { id: 'other', kind: 'invert', amount: .3 }]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected('reorder-effect', 0, { effectId: 'hue', effectKind: 'hue', targetEffectId: 'other', targetEffectKind: 'invert', edge: 'after' }, 'retain', 'appearance-0'))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys[0].value.effects = [structuredClone(first.value.effects[2]), structuredClone(first.value.effects[1]), structuredClone(first.value.effects[0])]
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedAppearanceKeyIds).toEqual(['appearance-0'])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('keeps the lowering refusal for directly authored opposite Effect orders (#1131)', () => {
  const record = fixture(), clip = record.composition.clips[0]
  record.composition.propertyTracks = []
  clip.appearance.keys.splice(1)
  clip.appearance.keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'invert', kind: 'invert', amount: .3 }]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected('reorder-effect', 200, { effectId: 'hue', effectKind: 'hue', targetEffectId: 'invert', targetEffectKind: 'invert', edge: 'after' }))
  // #1131 brief: the owner refuses this path; the adjacent record below is written directly.
  expect(result.status).toBe('refused')
  if (result.status === 'refused') expect(result.code).toBe('effect-order-conflict')
  expect(result.record).toBe(record)
  const adjacent = structuredClone(before), first = adjacent.composition.clips[0]
  first.durationMs = 200
  adjacent.composition.clips.push({ ...structuredClone(clip), id: 'adjacent', startMs: 200, durationMs: 800,
    appearance: { keys: [{ id: 'adjacent-key', timeMs: 200, value: { ...structuredClone(clip.appearance.keys[0].value), effects: [structuredClone(clip.appearance.keys[0].value.effects![1]), structuredClone(clip.appearance.keys[0].value.effects![0])] } }] } })
  expect(validateShowRecordV2(reopen(adjacent))).toEqual([])
  const admission = prepare(adjacent)
  expect(admission.status).toBe('refused')
  if (admission.status === 'refused') expect(admission.issues[0].code).toBe('unsupported-runtime-sharing')
  expect(record).toEqual(before)
})

it.each(['update-effect', 'reorder-effect'] as const)('does not insert a redundant key for selected %s no-op', kind => {
  const record = fixture()
  record.composition.clips[0].appearance.keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'other', kind: 'invert', amount: .3 }]
  const fields = kind === 'update-effect' ? { effectId: 'hue', effectKind: 'hue', parameter: 'turns', value: .1 }
    : { effectId: 'hue', effectKind: 'hue', targetEffectId: 'other', targetEffectKind: 'invert', edge: 'before' }
  const before = structuredClone(record), result = editShowClipAppearanceV2(record, selected(kind, 200, fields))
  expect(result.status).toBe('unchanged'); expect(result.record).toBe(record)
  expect(record).toEqual(before); emptyAffected(result)
})

it('keeps authored opacity separate from nonlinear numeric animation and resumes the selected static fallback', () => {
  const record = fixture()
  record.composition.propertyTracks.push({ id: 'opacity-animation', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: 100, activeDurationMs: 200,
    keyframes: [{ id: 'opacity-first', timeMs: 100, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'opacity-last', timeMs: 300, value: .5, easing: { curve: 'linear' } }] })
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), result = editShowClipAppearanceV2(record, selected('appearance', 200, { patch: { opacity: .7 } }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200, value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), opacity: .7 } })
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(result.affectedTrackIds).toEqual([]); expect(result.affectedPropertyKeyIds).toEqual([])
  compareDelivered(result.record, expected)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const actual = delivered(result.record, fidelity), original = delivered(before, fidelity)
    const active = actual.advanceTo(250, { stepMs: 1 }), beforeActive = original.advanceTo(250, { stepMs: 1 })
    // The independent complete-key oracle above remains exact in both modes.
    // Pin the measured unsplit-versus-sectioned Precise discrepancy explicitly;
    // it is not a widened preservation oracle or a byte-exact playback claim.
    if (fidelity === 'fast') expect(active.frame).toEqual(beforeActive.frame)
    else {
      expect(Array.from(beforeActive.frame)).toEqual([.147705078125, .0573577880859375, .1147308349609375, .205078125, .0573577880859375, .1147308349609375])
      expect(Array.from(active.frame)).toEqual([.1477203369140625, .0573577880859375, .1147308349609375, .205078125, .0573577880859375, .1147308349609375])
    }
    expect(active.exports).toEqual(beforeActive.exports)
    expect(actual.advanceTo(350, { stepMs: 1 }).frame).not.toEqual(original.advanceTo(350, { stepMs: 1 }).frame)
    expect(actual.advanceTo(450, { stepMs: 1 }).frame).toEqual(original.advanceTo(450, { stepMs: 1 }).frame)
  }
})

it('preserves a held Group using the same runtime and foreign Clip-scoped key/Effect identities', () => {
  const record = fixture(), clip = record.composition.clips[0]
  clip.durationMs = 500; clip.appearance.keys.forEach(key => { key.timeMs /= 2 })
  record.composition.groupDefinitions = [{ id: 'group', name: 'Group', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }], clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200,
      entryPolicy: 'restart', zoneSampleMode: 'span', appearance: { keys: [{ id: 'selected-100', timeMs: 0,
        value: { ...structuredClone(clip.appearance.keys[0].value), effects: [{ id: 'new-effect', kind: 'hue', turns: .4 }] } }] } }], transitions: [], propertyTracks: [] }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: 'zone', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    startMs: 500, translationX: .1, translationY: 0, holds: [{ id: 'beat', localTimeMs: 100, durationMs: 100 }], instanceBindings: { slot: 'instance' }, layerBindings: [{ definitionLayerId: 'local-layer', layerId: clip.layerId }] }]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), result = editShowClipAppearanceV2(record, selected('add-effect', 100, { effect: { id: 'new-effect', kind: 'hue', turns: .2 } }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-100', timeMs: 100, value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [{ id: 'new-effect', kind: 'hue', turns: .2 }] } })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(result.record.composition.groupOccurrences).toEqual(before.composition.groupOccurrences)
  expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  compareDelivered(result.record, expected)
})

it('keeps another ordinary shared runtime user exact and deeply unaliases the copied Effect and complete held value', () => {
  const record = fixture(), clip = record.composition.clips[0]
  clip.durationMs = 500; clip.appearance.keys.forEach(key => { key.timeMs /= 2 })
  const other = structuredClone(clip)
  other.id = 'other'; other.startMs = 500
  other.appearance.keys.forEach((key, index) => { key.timeMs += 500; key.id = index === 0 ? 'selected-100' : key.id; key.value.effects = [{ id: 'fresh', kind: 'hue', turns: .4 }] })
  record.composition.clips.push(other)
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), requested = selected('add-effect', 100, { effect: { id: 'fresh', kind: 'hue', turns: .2 } }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-100', timeMs: 100, value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [{ id: 'fresh', kind: 'hue', turns: .2 }] } })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.record.composition.clips[1]).toEqual(before.composition.clips[1])
  compareDelivered(result.record, expected)
  const effect = result.record.composition.clips[0].appearance.keys[1].value.effects![0]
  if (effect.kind === 'hue') effect.turns = .9
  result.record.composition.propertyTracks[0].keyframes[0].value = .9
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
})

it.each([400, 401])('admits exact Effect activation adjacency or refuses the invalid cross-span preimage ending at%i', endMs => {
  const record = fixture()
  record.composition.clips[0].appearance.keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }]
  record.composition.propertyTracks.push({ id: 'hue-track', target: { kind: 'clip-effect', clipId: 'clip', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' }, activeStartMs: 100, activeDurationMs: endMs - 100,
    keyframes: [{ id: 'first', timeMs: 100, value: .1, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'last', timeMs: endMs, value: .5, easing: { curve: 'linear' } }] })
  if (endMs === 400) expect(validateShowRecordV2(record)).toEqual([])
  else expect(validateShowRecordV2(record)[0].code).toBe('invalid-property-target')
  const before = structuredClone(record), result = editShowClipAppearanceV2(record, selected('update-effect', 200, { effectId: 'hue', effectKind: 'hue', parameter: 'turns', value: .3 }))
  if (endMs === 400) {
    expect(prepare(record).status).toBe('ready')
    expect(result.status).toBe('changed')
    const expected = structuredClone(before)
    expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200, value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [{ id: 'hue', kind: 'hue', turns: .3 }] } })
    expect(reopen(result.record)).toEqual(expected)
    compareDelivered(result.record, expected)
  } else {
    expect(result.status).toBe('refused'); expect(result.record).toBe(record); emptyAffected(result)
  }
  expect(record).toEqual(before)
})

it.each(['incoming', 'outgoing'] as const)('delivers a legal nominal %s edit throughout its inherited Transition contribution', direction => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  const record = converted.record
  record.composition.executionModel = 'continuous'
  for (const clip of record.composition.clips) clip.entryPolicy = 'continue'
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), clip = record.composition.clips.find(candidate => candidate.id === (direction === 'incoming' ? 'in' : 'out'))!
  const atMs = direction === 'incoming' ? clip.startMs : 200
  const requested = { ...selected('appearance', atMs, { patch: { opacity: .3 } }, direction === 'incoming' ? 'retain' : 'insert', direction === 'incoming' ? clip.appearance.keys[0].id : 'selected-200'), clipId: clip.id }
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before), edited = expected.composition.clips.find(candidate => candidate.id === clip.id)!
  if (direction === 'incoming') edited.appearance.keys[0].value.opacity = .3
  else edited.appearance.keys.push({ id: 'selected-200', timeMs: 200, value: { ...structuredClone(clip.appearance.keys[0].value), opacity: .3 } })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.record.composition.transitions).toEqual(before.composition.transitions)
  compareDelivered(result.record, expected)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    // Incoming starts contributing at400 before its nominal start600; outgoing
    // continues after nominal end400. Legal keys govern these inherited spans.
    const actual = delivered(result.record, fidelity), original = delivered(before, fidelity)
    expect(actual.advanceTo(500, { stepMs: 1 }).frame).not.toEqual(original.advanceTo(500, { stepMs: 1 }).frame)
  }
  expect(record).toEqual(before)
})

it.each(['turns', 'unknown', 'color'] as const)('retains incoming numeric Transition ramp or refuses incompatible target %s without cascade', parameterId => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  const record = converted.record, transition = record.composition.transitions[0], incoming = record.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!
  incoming.appearance.keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .2 }]
  transition.propertyRamps = [{ participantId: transition.participants[0].id, target: { kind: 'clip-effect', clipId: incoming.id, effectId: 'hue', effectKind: 'hue', parameterId }, from: .1, easing: { curve: 'sine', direction: 'in-out' } }]
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, { ...selected('update-effect', incoming.startMs, { effectId: 'hue', effectKind: 'hue', parameter: 'turns', value: .3 }, 'retain', incoming.appearance.keys[0].id), clipId: incoming.id })
  if (parameterId === 'turns') {
    expect(result.status, JSON.stringify(result)).toBe('changed')
    const expected = structuredClone(before)
    expected.composition.clips.find(clip => clip.id === incoming.id)!.appearance.keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .3 }]
    expect(reopen(result.record)).toEqual(expected)
    expect(result.affectedTransitionIds).toEqual([])
  } else {
    expect(result.status).toBe('refused'); expect(result.record).toBe(record); emptyAffected(result)
  }
  expect(record).toEqual(before)
})

it('keeps known participant property-track refusal in final preparation rather than compiling inside the owner', () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  const record = converted.record, outgoing = record.composition.clips.find(clip => clip.id === 'out')!
  record.composition.patternInstances.find(instance => instance.id === outgoing.instanceId)!.controlTargets = { sliderLevel: .2 }
  record.composition.propertyTracks = [{ id: 'participant-control', target: { kind: 'instance-control', instanceId: outgoing.instanceId, exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'last', timeMs: 1000, value: .6, easing: { curve: 'linear' } }] }]
  expect(prepare(record).status, JSON.stringify(prepare(record))).toBe('ready')
  const before = structuredClone(record), result = editShowClipAppearanceV2(record, { ...selected('appearance', 200, { patch: { view: { mirror: true } } }), clipId: 'out' })
  expect(result.status).toBe('changed'); expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  const admission = prepare(result.record)
  expect(admission.status).toBe('refused')
  if (admission.status === 'refused') expect(admission.issues[0].code).toBe('unsupported-transition-property-track')
  expect(record).toEqual(before)
})

it('rejects selected source/kind/stage and fresh Effect ID errors without affecting any span', () => {
  const record = fixture(), keys = record.composition.clips[0].appearance.keys
  keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'pose', kind: 'translate', x: .1, y: .1 }]
  keys[2].value.effects = [{ id: 'later-only', kind: 'brightness', brightness: 1 }]
  const before = structuredClone(record)
  for (const requested of [
    selected('add-effect', 200, { effect: { id: 'later-only', kind: 'hue', turns: .2 } }),
    selected('duplicate-effect', 200, { effectId: 'hue', effectKind: 'hue', newEffectId: 'later-only' }),
    selected('update-effect', 200, { effectId: 'missing', effectKind: 'hue', parameter: 'turns', value: .2 }),
    selected('duplicate-effect', 200, { effectId: 'hue', effectKind: 'invert', newEffectId: 'fresh' }),
    selected('reorder-effect', 200, { effectId: 'hue', effectKind: 'hue', targetEffectId: 'pose', targetEffectKind: 'translate', edge: 'after' }),
    selected('update-effect', 200, { effectId: 'hue', effectKind: 'hue', parameter: 'unknown', value: .2 }),
  ]) {
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status).toBe('refused'); expect(result.record).toBe(record); expect(record).toEqual(before); emptyAffected(result)
  }
})

it.each([-1, 1000, 1001, Number.MAX_SAFE_INTEGER])('refuses nominal selected-time boundary%i without creating a key or touching whole-Clip scope', atMs => {
  const record = fixture(), before = structuredClone(record), requested = selected('appearance', atMs, { patch: { opacity: .3 } }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status).toBe('refused'); expect(result.record).toBe(record); emptyAffected(result)
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
  const whole = editShowClipAppearanceV2(record, { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { opacity: .3 } })
  expect(whole.status).toBe('changed')
  expect(whole.record.composition.clips[0].appearance.keys.map(key => key.value.opacity)).toEqual([.3, .3, .3])
  expect(record).toEqual(before)
})

it.each([
  ['out', -1], ['out', 400], ['out', 401], ['out', 599], ['out', 600],
  ['in', 0], ['in', 399], ['in', 400], ['in', 599], ['in', 1000], ['in', 1001],
] as const)('refuses outside-bar selected %s time%i including real inherited contribution without remapping', (clipId, atMs) => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  const record = converted.record, clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  for (const kind of ['insert', 'retain'] as const) {
    const requested = { ...selected('appearance', atMs, { patch: { opacity: .3 } }, kind, kind === 'retain' ? clip.appearance.keys[0].id : `outside-${atMs}`), clipId }, beforeIntent = structuredClone(requested)
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status).toBe('refused'); expect(result.record).toBe(record); emptyAffected(result)
    expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
  }
  const whole = editShowClipAppearanceV2(record, { kind: 'appearance', clipId, scope: 'whole-clip', patch: { opacity: .3 } })
  expect(whole.status).toBe('changed')
  expect(whole.record.composition.clips.find(candidate => candidate.id === clipId)!.appearance.keys[0].value.opacity).toBe(.3)
  expect(record).toEqual(before)
})

it.each([
  selected('appearance', 200.5, { patch: { opacity: .7 } }),
  selected('appearance', 200, { patch: { opacity: NaN } }),
  selected('appearance', 200, { patch: { opacity: .7 } }, 'insert', '   '),
  selected('appearance', 200, { patch: { opacity: .7 } }, 'insert', 'appearance-1'),
  selected('appearance', 400, { patch: { opacity: .7 } }),
  selected('appearance', 200, { patch: { opacity: .7 } }, 'retain', 'appearance-0'),
  selected('appearance', 400, { patch: { opacity: .7 } }, 'retain', 'appearance-0'),
  { ...selected('appearance', 200, { patch: { opacity: .7 } }), keyIdentity: { kind: 'insert' } },
  { ...selected('appearance', 200, { patch: { opacity: .7 } }), keyIdentity: { kind: 'insert', appearanceKeyId: 'fresh', extra: true } },
  { ...selected('appearance', 200, { patch: { opacity: .7 } }), extra: true },
] as ShowClipAppearanceEditIntentV2[])('refuses invalid nominal plans/values atomically', requested => {
  const record = fixture(), before = structuredClone(record), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before); expect(requested).toEqual(beforeIntent)
  emptyAffected(result)
})
