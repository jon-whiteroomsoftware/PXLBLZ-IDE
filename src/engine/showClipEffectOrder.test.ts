// Two placements of one Pattern instance may carry the same Effects in a
// different order. Before #363 the composition recipe gave every placement of an
// instance the same clip id and then merged their Effect lists by id, so the
// emitted Color & output chain took its sequence from whichever placement was
// seen first. Both placements rendered the same picture with no error.
import { describe, expect, it } from 'vitest'
import type { ShowClipEffect, ShowRecord } from './personalContentRecords'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShowForArtifact } from './showPreviewArtifact'
import { showEffectOrderBaseInstanceId, showEffectOrderVariantClipId } from './showEffects'
import { stockShowById } from '@/pixelblaze/stock/shows'

const DIM_ID = 'shared-dim'
const CUTOFF_ID = 'shared-cutoff'
const dim: ShowClipEffect = { id: DIM_ID, kind: 'brightness', brightness: 0.25 }
const cutoff: ShowClipEffect = { id: CUTOFF_ID, kind: 'threshold', threshold: 0.2, amount: 1 }

/**
 * 104's shape - one instance, four placements on one Zone - with the two
 * ordered Clips deliberately sharing Effect ids.
 */
function sharedIdOrderingShow(): ShowRecord {
  const base = stockShowById('stock-show-104-effects-and-ordering')!.show
  const composition = base.composition!
  const zone = composition.scenes[0].zones[0]
  const main = zone.main.map((placement, index) => {
    if (index === 2) return { ...placement, effects: [dim, cutoff] }
    if (index === 3) return { ...placement, effects: [cutoff, dim] }
    return placement
  })
  return {
    ...base,
    composition: {
      ...composition,
      scenes: [{ ...composition.scenes[0], zones: [{ ...zone, main }] }],
    },
  }
}

function checksumAt(show: ShowRecord, timeMs: number): string {
  const compiled = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
  expect(compiled.error).toBeNull()
  const artifact = compiled.artifact!
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

import { showEffectOrderConflicts } from './showEffects'

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
  it('renders two orders of the same Effect ids differently', () => {
    const show = sharedIdOrderingShow()
    // Clip 3 is Dim then Cutoff, which destroys the picture. Clip 4 is Cutoff
    // then Dim, which keeps it. They cannot be the same frame.
    expect(checksumAt(show, 10_000)).not.toBe(checksumAt(show, 14_000))
  })

  it('emits one Color & output chain per distinct Effect order', () => {
    const compiled = compileShowForArtifact(sharedIdOrderingShow(), [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    // Each emitted chain computes luma once, so the coefficient counts chains.
    const chains = compiled.artifact!.code.split('0.2126').length - 1
    expect(chains, 'Cutoff-only, Dim-then-Cutoff, and Cutoff-then-Dim are three orders')
      .toBeGreaterThanOrEqual(3)
  })

  it('still shares one chain when placements only differ by Effect values', () => {
    // The merge exists so placements can vary constants, and a subset of the
    // Effects, without paying for a second chain. Only a genuine order conflict
    // should split them.
    const base = stockShowById('stock-show-104-effects-and-ordering')!.show
    const composition = base.composition!
    const zone = composition.scenes[0].zones[0]
    const main = zone.main.map((placement, index) => (
      index >= 2
        ? { ...placement, effects: [{ ...dim, brightness: index === 2 ? 0.25 : 0.6 }, cutoff] }
        : placement
    ))
    const show: ShowRecord = {
      ...base,
      composition: {
        ...composition,
        scenes: [{ ...composition.scenes[0], zones: [{ ...zone, main }] }],
      },
    }
    const compiled = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    const chains = compiled.artifact!.code.split('0.2126').length - 1
    expect(chains, 'one Cutoff-only chain plus one shared Dim-then-Cutoff chain').toBe(2)
  })

  it('keeps a split placement bound to its instance for Property tracks', () => {
    // Splitting gives the placement a variant clip id. Instance-scoped tracks
    // resolve through the base id, so animation still reaches it.
    const variant = showEffectOrderVariantClipId('garden', 1)
    expect(variant).not.toBe('garden')
    expect(showEffectOrderBaseInstanceId(variant)).toBe('garden')
    expect(showEffectOrderBaseInstanceId('garden')).toBe('garden')

    const base = stockShowById('stock-show-104-effects-and-ordering')!.show
    const composition = base.composition!
    const zone = composition.scenes[0].zones[0]
    const main = zone.main.map((placement, index) => {
      if (index === 2) return { ...placement, effects: [dim, cutoff] }
      if (index === 3) return { ...placement, effects: [cutoff, dim] }
      return placement
    })
    const show: ShowRecord = {
      ...base,
      composition: {
        ...composition,
        scenes: [{
          ...composition.scenes[0],
          propertyTracks: [{
            id: 'track-instance-speed',
            target: { kind: 'instance-time-scale', instanceId: 'garden' },
            keyframes: [
              { id: 'a', timeMs: 0, value: 0.1, easing: { curve: 'linear' } },
              { id: 'b', timeMs: 16_000, value: 0.9, easing: { curve: 'linear' } },
            ],
          }],
          zones: [{ ...zone, main }],
        }],
      },
    }
    // The split member must still resolve its instance, or emission throws
    // trying to bind the track to a clip it no longer recognizes.
    const compiled = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact!.code.split('0.2126').length - 1).toBeGreaterThanOrEqual(3)
  })
})
