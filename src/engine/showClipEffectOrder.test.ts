// Two placements of one Pattern instance may carry the same Effects in a
// different order. Before #363 the composition recipe gave every placement of an
// instance the same clip id and then merged their Effect lists by id, so the
// emitted Color & output chain took its sequence from whichever placement was
// seen first. Both placements rendered the same picture with no error.
// V2 does not yet support shared Effect ids in opposite orders (#1131).
import { describe, expect, it } from 'vitest'
import type { ShowClipEffect } from './personalContentRecords'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { showEffectOrderBaseInstanceId, showEffectOrderConflicts, showEffectOrderVariantClipId } from './showEffects'
import { LIBRARIES } from '@/pixelblaze/libs'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '@/pixelblaze/stock/showsV2Compile'

const DIM_ID = 'shared-dim'
const CUTOFF_ID = 'shared-cutoff'
const dim: ShowClipEffect = { id: DIM_ID, kind: 'brightness', brightness: 0.25 }
const cutoff: ShowClipEffect = { id: CUTOFF_ID, kind: 'threshold', threshold: 0.2, amount: 1 }

/**
 * 104's shape - one instance, four Clips on one Zone - with distinct Effect
 * ids in opposite orders (learn104V2 in showsV2.ts): a threshold-only Clip,
 * a brightness-then-threshold Clip, and a threshold-then-brightness Clip.
 */
function opposedOrderShow(): ShowRecordV2 {
  return structuredClone(stockShowV2ById('stock-show-104-effects-and-ordering')!)
}

/**
 * 104's shape - one instance, four Clips on one Zone - with two opposite
 * Effect orders (learn104V2 in showsV2.ts): a
 * threshold-only Clip, a brightness-then-threshold Clip and a
 * threshold-then-brightness Clip. The latter two share Effect ids in
 * opposite orders.
 */
function sharedIdOrderingShow(): ShowRecordV2 {
  const show = opposedOrderShow()
  for (const clip of show.composition.clips) {
    const key = clip.appearance.keys[0]
    if (!key) throw new Error('104 clip has no appearance key.')
    if (clip.id === 'clip-brightness-threshold') key.value.effects = [dim, cutoff]
    if (clip.id === 'clip-threshold-brightness') key.value.effects = [cutoff, dim]
  }
  const brightnessThreshold = show.composition.clips.find((clip) => clip.id === 'clip-brightness-threshold')
  const thresholdBrightness = show.composition.clips.find((clip) => clip.id === 'clip-threshold-brightness')
  const firstEffects = brightnessThreshold?.appearance.keys[0]?.value.effects
  const secondEffects = thresholdBrightness?.appearance.keys[0]?.value.effects
  if (!firstEffects || !secondEffects || !showEffectOrderConflicts(firstEffects, secondEffects)) {
    throw new Error('104 Clips must carry shared Effect ids in opposite orders.')
  }
  return show
}

function compileOrderingShow(show: ShowRecordV2): GeneratedShowArtifact {
  const prepared = prepareShowV2ForCompile(show, nativeStockSourceLookupV2(show), { libraries: LIBRARIES })
  if (prepared.status !== 'ready') throw new Error(show.id + ': ' + prepared.issues.map((issue) => issue.path + ': ' + issue.message).join('; '))
  return compileShow(prepared.recipe, LIBRARIES)
}

function checksumAt(show: ShowRecordV2, timeMs: number): string {
  const artifact = compileOrderingShow(show)
  const side = 44
  const mapPoints = Array.from({ length: side * side }, (_, index) => ({
    sample: [(index % side) / (side - 1), Math.floor(index / side) / (side - 1)] as [number, number],
    pos: [(index % side) / (side - 1), Math.floor(index / side) / (side - 1)] as [number, number],
  }))
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 363, fidelity: 'fast' })
  return runtime.advanceTo(timeMs, { stepMs: 16, presentTargetFrame: true }).checksum
}

describe('Effect order conflict detection (#363)', () => {
  const fx = (id: string, kind: 'scale' | 'rotate' | 'translate'): ShowClipEffect => (
    kind === 'scale'
      ? { id, kind, x: 0.5, y: 0.5 }
      : kind === 'rotate'
      ? { id, kind, turns: 0.25 }
      : { id, kind, x: 0.3, y: 0 }
  )

  it('detects an inversion the merge itself would introduce', () => {
    // The merge keeps the first sequence and appends unseen ids, so [scale, hue]
    // plus [translate, scale] becomes [scale, hue, translate] - running scale
    // before translate although the second list authored the reverse. Comparing
    // only the shared id (scale) misses it entirely.
    const existing = [fx('scale', 'scale'), fx('spin', 'rotate')]
    const incoming = [fx('move', 'translate'), fx('scale', 'scale')]
    expect(showEffectOrderConflicts(existing, incoming)).toBe(true)
  })

  it('accepts a placement that carries a subset in the same order', () => {
    const existing = [fx('move', 'translate'), fx('scale', 'scale'), fx('spin', 'rotate')]
    expect(showEffectOrderConflicts(existing, [fx('move', 'translate'), fx('spin', 'rotate')])).toBe(false)
    expect(showEffectOrderConflicts(existing, [fx('scale', 'scale')])).toBe(false)
  })

  it('accepts new Effects appended after everything it shares', () => {
    const existing = [fx('move', 'translate'), fx('scale', 'scale')]
    expect(showEffectOrderConflicts(existing, [fx('scale', 'scale'), fx('spin', 'rotate')])).toBe(false)
  })

  it('detects a straight swap of two shared Effects', () => {
    const existing = [fx('move', 'translate'), fx('scale', 'scale')]
    expect(showEffectOrderConflicts(existing, [fx('scale', 'scale'), fx('move', 'translate')])).toBe(true)
  })
})

describe('Clip Effect ordering across placements of one instance (#363)', () => {
  it('renders opposite Effect orders with distinct ids differently', () => {
    const show = opposedOrderShow()
    // clip-brightness-threshold is Dim then Cutoff, which destroys the picture.
    // clip-threshold-brightness is Cutoff then Dim, which keeps it. They cannot
    // be the same frame.
    expect(checksumAt(show, 10_000)).not.toBe(checksumAt(show, 14_000))
  })

  it('emits one Color & output chain per distinct Effect order with distinct ids', () => {
    const artifact = compileOrderingShow(opposedOrderShow())
    // Each emitted chain computes luma once, so the coefficient counts chains.
    const chains = artifact.code.split('0.2126').length - 1
    expect(chains, 'Cutoff-only, Dim-then-Cutoff, and Cutoff-then-Dim are three orders')
      .toBeGreaterThanOrEqual(3)
  })

  it('still shares one chain when placements only differ by Effect values', () => {
    // Clips can vary constants without paying for a second chain. Only a
    // genuine order conflict should split them.
    const show = structuredClone(stockShowV2ById('stock-show-104-effects-and-ordering')!)
    for (const clip of show.composition.clips) {
      const key = clip.appearance.keys[0]
      if (!key) throw new Error('104 clip has no appearance key.')
      if (clip.id === 'clip-brightness-threshold') key.value.effects = [{ ...dim, brightness: 0.25 }, cutoff]
      if (clip.id === 'clip-threshold-brightness') key.value.effects = [{ ...dim, brightness: 0.6 }, cutoff]
    }
    const artifact = compileOrderingShow(show)
    const chains = artifact.code.split('0.2126').length - 1
    expect(chains, 'one Cutoff-only chain plus one shared Dim-then-Cutoff chain').toBe(2)
  })

  it('keeps a split placement bound to its instance for Property tracks with distinct Effect ids', () => {
    // Instance-scoped tracks resolve through the instance id, so animation
    // still reaches every Clip that shares it.
    const variant = showEffectOrderVariantClipId('garden', 1)
    expect(variant).not.toBe('garden')
    expect(showEffectOrderBaseInstanceId(variant)).toBe('garden')
    expect(showEffectOrderBaseInstanceId('garden')).toBe('garden')

    const show = opposedOrderShow()
    show.composition.propertyTracks = [{
      id: 'track-instance-speed',
      target: { kind: 'instance-time-scale', instanceId: 'garden' },
      activeStartMs: 0,
      activeDurationMs: 16_000,
      keyframes: [
        { id: 'a', timeMs: 0, value: 0.1, easing: { curve: 'linear' } },
        { id: 'b', timeMs: 16_000, value: 0.9, easing: { curve: 'linear' } },
      ],
    }]
    // Every Clip must still resolve its instance, or emission throws trying
    // to bind the track to a Clip it no longer recognizes.
    const artifact = compileOrderingShow(show)
    expect(artifact.code.split('0.2126').length - 1).toBeGreaterThanOrEqual(3)
  })

  it('refuses shared Effect ids in opposite orders across one instance (#1131)', () => {
    // When #1131 is fixed, this becomes the shared-id version of the three tests above.
    const show = sharedIdOrderingShow()
    const prepared = prepareShowV2ForCompile(show, nativeStockSourceLookupV2(show), { libraries: LIBRARIES })
    expect(prepared.status).toBe('refused')
    if (prepared.status !== 'refused') throw new Error('104 shared-id Show unexpectedly prepared for compilation.')
    expect(prepared.issues.map((issue) => issue.code)).toContain('unsupported-runtime-sharing')
  })
})
