import { describe, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { normalizeShowClipEffects } from './showEffects'
import { editShowClipAppearanceV2 } from './showClipAppearanceEditsV2'
import {
  planShowV2ClipInspectorPatch,
  type ShowV2ClipInspectorPlan,
} from './showV2ClipAppearancePlanning'
import type { ShowClipInspectorPatch } from './showClipInspectorModel'
import type { ShowClipEffect } from './personalContentRecords'

function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

function plan(record: ShowRecordV2, patch: ShowClipInspectorPatch): ShowV2ClipInspectorPlan {
  return planShowV2ClipInspectorPatch(record, 'clip', patch)
}

describe('v2 Clip inspector appearance planning (#1066 slice 3)', () => {
  it('routes brightness through the appearance door with whole-Clip scope', () => {
    const outcome = plan(fixture(), { view: { brightness: 0.63 } })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { view: { brightness: 0.63 } } },
    })
  })

  it('routes opacity, phase and mirror through the appearance door', () => {
    expect(plan(fixture(), { local: { opacity: 0.5 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { opacity: 0.5 } },
    })
    expect(plan(fixture(), { view: { phase: 0.25 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { view: { phase: 0.25 } } },
    })
    expect(plan(fixture(), { view: { mirror: true } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { view: { mirror: true } } },
    })
  })

  it('routes transform fields through the appearance door', () => {
    expect(plan(fixture(), { transform: { positionX: 0.25 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { transform: { positionX: 0.25 } } },
    })
    expect(plan(fixture(), { transform: { rotation: -0.25 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { transform: { rotation: -0.25 } } },
    })
  })

  it('routes aperture geometry through the appearance door', () => {
    expect(plan(fixture(), { viewport: { enabled: true, x: 0.25 } })).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'appearance', clipId: 'clip', scope: 'whole-clip',
        patch: { aperture: { enabled: true, x: 0.25 } },
      },
    })
  })

  it('spells rectangle and cleared fields as deletions, mirroring the viewport normalizer', () => {
    const record = fixture()
    const key = record.composition.clips[0].appearance.keys[0]
    key.value.aperture = { enabled: true, x: 0, y: 0, width: 1, height: 1, aperture: 'ellipse', feather: 0.1, invert: true }
    expect(plan(record, { viewport: { aperture: 'rectangle' } })).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'appearance', clipId: 'clip', scope: 'whole-clip',
        patch: {
          aperture: {
            aperture: null, ringWidth: null, cornerRadius: null, crossWidth: null,
            starPoints: null, starInner: null, crescentOffset: null, polygonSides: null,
          },
        },
      },
    })
    expect(plan(record, { viewport: { feather: undefined, invert: undefined } })).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'appearance', clipId: 'clip', scope: 'whole-clip',
        patch: { aperture: { feather: null, invert: null } },
      },
    })
  })

  it('drops the previous shape parameters when the silhouette changes', () => {
    const record = fixture()
    record.composition.clips[0].appearance.keys[0].value.aperture = {
      enabled: true, x: 0, y: 0, width: 1, height: 1, aperture: 'ring', ringWidth: 0.5,
    }
    expect(plan(record, { viewport: { aperture: 'ellipse' } })).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'appearance', clipId: 'clip', scope: 'whole-clip',
        patch: {
          aperture: {
            aperture: 'ellipse', ringWidth: null, cornerRadius: null, crossWidth: null,
            starPoints: null, starInner: null, crescentOffset: null, polygonSides: null,
          },
        },
      },
    })
  })

  it('routes presentation and blink through the appearance door', () => {
    expect(plan(fixture(), { presentation: { mode: 'strobe', cadenceMs: 1_000 } })).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'appearance', clipId: 'clip', scope: 'whole-clip',
        patch: { presentation: { mode: 'strobe', cadenceMs: 1_000 } },
      },
    })
    expect(plan(fixture(), { blink: { rateHz: 2, duty: 0.5, phase: 0 } })).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'appearance', clipId: 'clip', scope: 'whole-clip',
        patch: { blink: { rateHz: 2, duty: 0.5, phase: 0 } },
      },
    })
    const lit = fixture()
    lit.composition.clips[0].appearance.keys[0].value.blink = { rateHz: 2, duty: 0.5, phase: 0 }
    expect(plan(lit, { blink: null })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { blink: null } },
    })
  })

  it('routes speed, evaluation and the stepped clock through the instance door', () => {
    expect(plan(fixture(), { simulation: { timeScale: 2 } })).toEqual({
      kind: 'instance-properties',
      intent: { clipId: 'clip', properties: { time_scale: 2 } },
    })
    expect(plan(fixture(), { evaluationPolicy: 'freeze-at-entry' })).toEqual({
      kind: 'instance-properties',
      intent: { clipId: 'clip', properties: { evaluation: 'freeze-at-entry' } },
    })
    expect(plan(fixture(), { simulation: { steppedClock: { stepMs: 250 } } })).toEqual({
      kind: 'instance-properties',
      intent: { clipId: 'clip', properties: { stepped_clock: { stepMs: 250 } } },
    })
  })

  it('spells an unchecked stutter as a clear, mirroring the legacy spread', () => {
    const record = fixture()
    record.composition.patternInstances[0].time.steppedClock = { stepMs: 250 }
    expect(plan(record, { simulation: { steppedClock: undefined } })).toEqual({
      kind: 'instance-properties',
      intent: { clipId: 'clip', properties: { stepped_clock: null } },
    })
  })

  it('sends only added and changed control targets, never a removal', () => {
    const record = fixture()
    record.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2 }
    expect(plan(record, { simulation: { controlTargets: { sliderLevel: 0.75 } } })).toEqual({
      kind: 'instance-properties',
      intent: { clipId: 'clip', properties: { controls: { sliderLevel: 0.75 } } },
    })
    expect(plan(record, { simulation: { controlTargets: { sliderLevel: 0.2, extra: 0.5 } } })).toEqual({
      kind: 'instance-properties',
      intent: { clipId: 'clip', properties: { controls: { extra: 0.5 } } },
    })
  })

  it('reads an appended stack write as one add-effect intent', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    const outcome = plan(record, { effects: [effect] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: { kind: 'add-effect', clipId: 'clip', scope: 'whole-clip', effect },
    })
  })

  it('reads a single removal as one remove-effect intent', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    expect(plan(record, { effects: [] })).toEqual({
      kind: 'appearance',
      intent: { kind: 'remove-effect', clipId: 'clip', scope: 'whole-clip', effectId: 'ripple', effectKind: 'ripple' },
    })
  })

  it('reads one parameter change as one update-effect intent', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    const outcome = plan(record, { effects: [{ ...effect, amount: 0.2 } as ShowClipEffect] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'update-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'ripple', effectKind: 'ripple', parameter: 'amount', value: 0.2,
      },
    })
  })

  it('reads an inserted copy as one duplicate-effect intent', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    const outcome = plan(record, { effects: [effect, { ...effect, id: 'ripple-2' }] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'duplicate-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'ripple', effectKind: 'ripple', newEffectId: 'ripple-2',
      },
    })
  })

  it('reads a same-stage neighbour swap as one reorder-effect intent', () => {
    const record = fixture()
    const ripple = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    const swirl = normalizeShowClipEffects([{ id: 'swirl', kind: 'swirl' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [ripple, swirl]
    // The swap moves ripple later, so the later-travelled id names the
    // move; the simulation check proves it permutes to the same stack.
    expect(plan(record, { effects: [swirl, ripple] })).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'reorder-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'ripple', effectKind: 'ripple',
        targetEffectId: 'swirl', targetEffectKind: 'swirl', edge: 'after',
      },
    })
  })

  it('reads a same-stage move past a trailing other-stage Effect as a sibling reorder', () => {
    const record = fixture()
    const ripple = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    const swirl = normalizeShowClipEffects([{ id: 'swirl', kind: 'swirl' } as ShowClipEffect])[0] as ShowClipEffect
    const brightness = normalizeShowClipEffects([{ id: 'brightness', kind: 'brightness' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [ripple, swirl, brightness]
    // The shipped control moves within the distort siblings; the planner must
    // name the sibling target (swirl), not the raw-array neighbour (brightness).
    const outcome = plan(record, { effects: [swirl, ripple, brightness] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'reorder-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'ripple', effectKind: 'ripple',
        targetEffectId: 'swirl', targetEffectKind: 'swirl', edge: 'after',
      },
    })
    // The named intent reproduces the exact stack through the owner.
    if (outcome.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    const applied = editShowClipAppearanceV2(record, outcome.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error('Expected the owner to accept the intent.')
    expect(applied.record.composition.clips[0].appearance.keys[0].value.effects)
      .toEqual([swirl, ripple, brightness])
  })

  it('reads an interleaved same-stage swap as a sibling reorder', () => {
    const record = fixture()
    const ripple = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    const brightness = normalizeShowClipEffects([{ id: 'brightness', kind: 'brightness' } as ShowClipEffect])[0] as ShowClipEffect
    const swirl = normalizeShowClipEffects([{ id: 'swirl', kind: 'swirl' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [ripple, brightness, swirl]
    // The within-stage swap exchanges raw-array indices 0 and 2, which no
    // single-element removal over the full array can explain.
    const outcome = plan(record, { effects: [swirl, brightness, ripple] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'reorder-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'ripple', effectKind: 'ripple',
        targetEffectId: 'swirl', targetEffectKind: 'swirl', edge: 'after',
      },
    })
    if (outcome.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    const applied = editShowClipAppearanceV2(record, outcome.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error('Expected the owner to accept the intent.')
    expect(applied.record.composition.clips[0].appearance.keys[0].value.effects)
      .toEqual([swirl, brightness, ripple])
  })

  it('refuses a reorder smuggling a parameter change rather than dropping it', () => {
    const record = fixture()
    const ripple = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    const swirl = normalizeShowClipEffects([{ id: 'swirl', kind: 'swirl' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [ripple, swirl]
    // The ids reorder cleanly, but the moved Effect also retunes amount; an
    // id-only check would name a reorder and silently drop the retune.
    expect(plan(record, { effects: [swirl, { ...ripple, amount: 0.2 } as ShowClipEffect] })).toEqual({
      kind: 'refuse',
      reason: 'ambiguous-effects',
      message: 'One stack write carries one Effect change; combined stack rewrites stay unconnected.',
    })
  })

  it('reads a single colour string change as one update-effect intent', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{ id: 'chroma', kind: 'chroma-key' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    const outcome = plan(record, { effects: [{ ...effect, color: '#ff0000' } as ShowClipEffect] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'update-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'chroma', effectKind: 'chroma-key', parameter: 'color', value: '#ff0000',
      },
    })
    if (outcome.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    const applied = editShowClipAppearanceV2(record, outcome.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error('Expected the owner to accept the intent.')
    expect(applied.record.composition.clips[0].appearance.keys[0].value.effects)
      .toEqual([{ ...effect, color: '#ff0000' }])
  })

  it('refuses a mixed Effect and appearance write rather than dropping a facet', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    expect(plan(record, {
      view: { brightness: 0.5 },
      effects: [{ ...effect, amount: 0.2 } as ShowClipEffect],
    })).toEqual({
      kind: 'refuse',
      reason: 'mixed-facets',
      message: 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.',
    })
  })

  it('reports an unchanged patch as a no-op without naming an intent', () => {
    const record = fixture()
    expect(plan(record, {})).toEqual({ kind: 'no-op' })
    expect(plan(record, { view: { brightness: 1 } })).toEqual({ kind: 'no-op' })
    expect(plan(record, { simulation: { timeScale: 1 } })).toEqual({ kind: 'no-op' })
    expect(plan(record, { local: { opacity: 1 } })).toEqual({ kind: 'no-op' })
    expect(plan(record, { blink: null })).toEqual({ kind: 'no-op' })
    expect(plan(record, { effects: [] })).toEqual({ kind: 'no-op' })
  })

  it('refuses a Clip that does not exist and a Group child identity', () => {
    const record = fixture()
    expect(planShowV2ClipInspectorPatch(record, 'missing', { view: { brightness: 0.5 } })).toEqual({
      kind: 'refuse', reason: 'missing-clip', message: 'Clip "missing" does not exist.',
    })
    expect(planShowV2ClipInspectorPatch(record, 'group:child', { view: { brightness: 0.5 } })).toEqual({
      kind: 'refuse', reason: 'group-child', message: 'A Group Clip use is edited through its Group occurrence.',
    })
  })

  it('plans a Pattern swap through the replacement door', () => {
    expect(plan(fixture(), { pattern: { ref: { kind: 'stock', id: 'TestPattern2D' }, name: 'TestPattern2D' } })).toEqual({
      kind: 'replacement',
      clipId: 'clip',
      reference: { kind: 'stock', id: 'TestPattern2D' },
      name: 'TestPattern2D',
    })
  })

  it('treats re-picking the current Pattern as a no-op', () => {
    const record = fixture()
    const instance = record.composition.patternInstances[0]
    expect(plan(record, { pattern: { ref: { ...instance.pattern }, name: instance.patternName } })).toEqual({
      kind: 'no-op',
    })
  })

  it('refuses a malformed Pattern reference', () => {
    expect(plan(fixture(), { pattern: { ref: { kind: 'user', id: '' }, name: 'Missing' } })).toEqual({
      kind: 'refuse', reason: 'invalid-request', message: 'Choose one captured Pattern with a name.',
    })
    expect(plan(fixture(), { pattern: { ref: { kind: 'stock', id: 'TestPattern2D' }, name: '' } })).toEqual({
      kind: 'refuse', reason: 'invalid-request', message: 'Choose one captured Pattern with a name.',
    })
  })

  it('refuses a Pattern swap mixed with another facet rather than splitting history', () => {
    expect(plan(fixture(), {
      pattern: { ref: { kind: 'stock', id: 'TestPattern2D' }, name: 'TestPattern2D' },
      view: { brightness: 0.5 },
    })).toEqual({
      kind: 'refuse',
      reason: 'mixed-facets',
      message: 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.',
    })
  })

  it('refuses a Pattern swap when the Clip has no Pattern instance', () => {
    const record = fixture()
    record.composition.patternInstances = []
    expect(plan(record, { pattern: { ref: { kind: 'stock', id: 'TestPattern2D' }, name: 'TestPattern2D' } })).toEqual({
      kind: 'refuse', reason: 'missing-clip', message: 'Clip "clip" has no Pattern instance.',
    })
  })

  it('plans an entry-policy change through the entry-policy door', () => {
    const record = fixture()
    const current = record.composition.clips[0].entryPolicy
    const next = current === 'restart' ? 'continue' : 'restart'
    expect(plan(record, { entryPolicy: next })).toEqual({
      kind: 'entry-policy',
      intent: { kind: 'set-entry-policy', clipId: 'clip', entryPolicy: next },
    })
  })

  it('treats an unchanged entry policy as a no-op', () => {
    const record = fixture()
    expect(plan(record, { entryPolicy: record.composition.clips[0].entryPolicy })).toEqual({ kind: 'no-op' })
  })

  it('refuses a malformed or mixed entry-policy write', () => {
    expect(plan(fixture(), { entryPolicy: 'sometimes' as never })).toEqual({
      kind: 'refuse', reason: 'invalid-request', message: 'Choose Continue or Restart for one ordinary Clip.',
    })
    expect(plan(fixture(), { entryPolicy: 'restart', simulation: { timeScale: 2 } })).toEqual({
      kind: 'refuse',
      reason: 'mixed-facets',
      message: 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.',
    })
  })

  it('refuses header timing for the temporal owners', () => {
    expect(plan(fixture(), { local: { startMs: 500 } })).toEqual({
      kind: 'refuse', reason: 'timing-edit', message: 'Clip timing travels through the temporal owners, not this surface.',
    })
    expect(plan(fixture(), { local: { durationMs: 500 } })).toEqual({
      kind: 'refuse', reason: 'timing-edit', message: 'Clip timing travels through the temporal owners, not this surface.',
    })
  })

  it('refuses a control-target removal the merge owner cannot express', () => {
    const record = fixture()
    record.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2 }
    expect(plan(record, { simulation: { controlTargets: undefined } })).toEqual({
      kind: 'refuse',
      reason: 'control-target-removal',
      message: 'Removing the sliderLevel control target has no instance owner on this surface.',
    })
    expect(plan(record, { simulation: { controlTargets: {} } })).toEqual({
      kind: 'refuse',
      reason: 'control-target-removal',
      message: 'Removing the sliderLevel control target has no instance owner on this surface.',
    })
  })

  it('refuses a light-shutter write with no instance owner', () => {
    expect(plan(fixture(), { simulation: { lightShutter: { rateHz: 2, duty: 0.5, phase: 0, clockBehavior: 'continue' } } })).toEqual({
      kind: 'refuse',
      reason: 'unsupported-simulation',
      message: 'The light shutter has no instance owner on this surface.',
    })
  })

  it('refuses a whole-Clip appearance write on a multi-key Clip', () => {
    const record = fixture()
    const key = record.composition.clips[0].appearance.keys[0]
    record.composition.clips[0].appearance.keys = [
      key,
      { ...structuredClone(key), id: 'appearance-2', timeMs: 500, value: { ...structuredClone(key.value), opacity: 0.5 } },
    ]
    expect(validateShowRecordV2(record)).toEqual([])
    expect(plan(record, { view: { brightness: 0.5 } })).toEqual({
      kind: 'refuse',
      reason: 'multi-key-clip',
      message: 'A Clip with held appearance variation keeps its segments; whole-Clip appearance writes stay unconnected.',
    })
    // Instance values are per-runtime, shared by every segment in both
    // backings, so they stay connected on a multi-key Clip.
    expect(plan(record, { simulation: { timeScale: 2 } })).toEqual({
      kind: 'instance-properties',
      intent: { clipId: 'clip', properties: { time_scale: 2 } },
    })
  })

  it('refuses a combined stack rewrite no single intent can carry', () => {
    const record = fixture()
    const ripple = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
    const swirl = normalizeShowClipEffects([{ id: 'swirl', kind: 'swirl' } as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [ripple]
    expect(plan(record, { effects: [swirl] })).toEqual({
      kind: 'refuse',
      reason: 'ambiguous-effects',
      message: 'One stack write carries one Effect change; combined stack rewrites stay unconnected.',
    })
    expect(plan(record, { effects: [{ ...ripple, amount: 0.2 } as ShowClipEffect, swirl] })).toEqual({
      kind: 'refuse',
      reason: 'ambiguous-effects',
      message: 'One stack write carries one Effect change; combined stack rewrites stay unconnected.',
    })
  })

  it('names a packed shadow color edit as one shadowColor update (#1069)', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{
      id: 'grade', kind: 'color-map', amount: 1,
      shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 1, highlightB: 1,
    } as unknown as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    const next = {
      ...effect, shadowR: 0x80 / 255, shadowG: 0x40 / 255, shadowB: 0x20 / 255,
    } as ShowClipEffect
    const outcome = plan(record, { effects: [next] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'update-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'grade', effectKind: 'color-map', parameter: 'shadowColor', value: '#804020',
      },
    })
    if (outcome.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    const applied = editShowClipAppearanceV2(record, outcome.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error('Expected the owner to accept the intent.')
    expect(applied.record.composition.clips[0].appearance.keys[0].value.effects).toEqual([next])
  })

  it('names a packed highlight color edit as one highlightColor update (#1069)', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{
      id: 'grade', kind: 'color-map', amount: 1,
      shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 1, highlightB: 1,
    } as unknown as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    const next = {
      ...effect, highlightR: 0x12 / 255, highlightG: 0x34 / 255, highlightB: 0x56 / 255,
    } as ShowClipEffect
    const outcome = plan(record, { effects: [next] })
    expect(outcome).toEqual({
      kind: 'appearance',
      intent: {
        kind: 'update-effect', clipId: 'clip', scope: 'whole-clip',
        effectId: 'grade', effectKind: 'color-map', parameter: 'highlightColor', value: '#123456',
      },
    })
    if (outcome.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    const applied = editShowClipAppearanceV2(record, outcome.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error('Expected the owner to accept the intent.')
    expect(applied.record.composition.clips[0].appearance.keys[0].value.effects).toEqual([next])
  })

  it('refuses a packed edit mixing shadow and highlight channels (#1069)', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{
      id: 'grade', kind: 'color-map', amount: 1,
      shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 1, highlightB: 1,
    } as unknown as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    expect(plan(record, {
      effects: [{ ...effect, shadowR: 0x80 / 255, highlightB: 0x80 / 255 } as ShowClipEffect],
    })).toEqual({
      kind: 'refuse',
      reason: 'ambiguous-effects',
      message: 'One stack write carries one Effect change; combined stack rewrites stay unconnected.',
    })
  })

  it('refuses a packed color edit combined with another field (#1069)', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{
      id: 'grade', kind: 'color-map', amount: 1,
      shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 1, highlightB: 1,
    } as unknown as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    expect(plan(record, {
      effects: [{
        ...effect, shadowR: 0x80 / 255, shadowG: 0x40 / 255, shadowB: 0x20 / 255, amount: 0.5,
      } as ShowClipEffect],
    })).toEqual({
      kind: 'refuse',
      reason: 'ambiguous-effects',
      message: 'One stack write carries one Effect change; combined stack rewrites stay unconnected.',
    })
  })

  it('refuses a packed triple no color string reproduces (#1069)', () => {
    const record = fixture()
    const effect = normalizeShowClipEffects([{
      id: 'grade', kind: 'color-map', amount: 1,
      shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 1, highlightB: 1,
    } as unknown as ShowClipEffect])[0] as ShowClipEffect
    record.composition.clips[0].appearance.keys[0].value.effects = [effect]
    expect(plan(record, {
      effects: [{ ...effect, shadowR: 0.123456789 } as ShowClipEffect],
    })).toEqual({
      kind: 'refuse',
      reason: 'ambiguous-effects',
      message: 'One stack write carries one Effect change; combined stack rewrites stay unconnected.',
    })
  })

  it('clamps aperture values to the viewport ranges before the owner (#1069)', () => {
    expect(plan(fixture(), { viewport: { feather: 0.0005 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { aperture: { feather: 0.001 } } },
    })
    expect(plan(fixture(), { viewport: { feather: 2 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { aperture: { feather: 1 } } },
    })
    expect(plan(fixture(), { viewport: { starPoints: 2.6 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { aperture: { starPoints: 3 } } },
    })
    expect(plan(fixture(), { viewport: { width: 0.001 } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { aperture: { width: 0.01 } } },
    })
    const record = fixture()
    record.composition.clips[0].appearance.keys[0].value.aperture = {
      enabled: true, x: 0, y: 0, width: 1, height: 1, feather: 0.1,
    }
    expect(plan(record, { viewport: { feather: undefined } })).toEqual({
      kind: 'appearance',
      intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { aperture: { feather: null } } },
    })
  })

  it('lands a clamped sub-minimum feather through the owner (#1069)', () => {
    const record = fixture()
    const outcome = plan(record, { viewport: { feather: 0.0005 } })
    if (outcome.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    const applied = editShowClipAppearanceV2(record, outcome.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error('Expected the owner to accept the intent.')
    expect(applied.record.composition.clips[0].appearance.keys[0].value.aperture?.feather).toBe(0.001)
  })

  it('refuses a mixed appearance and instance write rather than splitting history', () => {
    expect(plan(fixture(), { view: { brightness: 0.5 }, simulation: { timeScale: 2 } })).toEqual({
      kind: 'refuse',
      reason: 'mixed-facets',
      message: 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.',
    })
  })
})

describe('v2 Clip inspector conversion provenance (#1068 gap 8, part A2)', () => {
  it('refuses an inspector patch that carries logicalClipId', () => {
    const record = fixture()
    const before = structuredClone(record)
    const outcome = plan(record, { view: { brightness: 0.5 }, logicalClipId: 'solo' } as unknown as ShowClipInspectorPatch)
    expect(outcome).toMatchObject({ kind: 'refuse' })
    if (outcome.kind !== 'refuse') return
    expect(outcome.message).toContain('conversion provenance')
    expect(record).toEqual(before)
  })
})
