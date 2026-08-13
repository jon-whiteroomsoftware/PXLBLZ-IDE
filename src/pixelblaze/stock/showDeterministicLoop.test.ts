import { describe, expect, it } from 'vitest'
import { applyShowPatternSlotSelections, restoreShowReferencePatternSlots } from '@/engine/showReferenceShow'
import { replaceShowPatternInstance } from '@/engine/showCompositionModel'
import { compileShowForArtifact } from '@/engine/showPreviewArtifact'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import { nativeDimension } from '@/engine/loadPattern'
import { projectShowTimeline } from '@/engine/showModel'
import { SOURCE_STOCK_MAPS } from './maps/stockCatalogue'
import { STOCK_SHOWS } from './shows'
import { DEMOS } from './patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { bundledPatternSliderNames } from '@/engine/showPatternControls'

// The deterministic-loop execution contract claims that every member returns
// to its authored initial state at Show End, and the seek/checkpoint work
// (#841-#843) trusts that claim. A stamp on a Show whose member state cannot
// be reconstructed exactly is therefore a latent correctness bug, not a
// stylistic nit - it shipped once during the #823 recompilation and was
// caught in review. This census measures the claim for every stamped stock
// Show: frames sampled early in loop two must be checksum-identical to the
// same phase in loop one. Shows whose members drift (102, 201, 202, 203,
// 204, 301, 302 at the time of writing) withhold the stamp in shows.ts and
// note the #841 upgrade path.
describe('stock deterministic-loop census (#823)', () => {
  it('wraps every stamped Show back to its exact loop-one state', { timeout: 300_000 }, () => {
    const stamped = STOCK_SHOWS.filter((item) => (
      item.show.composition?.executionModel === 'deterministic-loop'
    ))
    expect(stamped.length).toBeGreaterThan(0)

    for (const item of stamped) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      const mapId = item.show.stageMapId ?? 'plane'
      const mapSource = SOURCE_STOCK_MAPS.find((map) => map.id === mapId)
        ?? SOURCE_STOCK_MAPS.find((map) => map.id === 'plane')!
      const contract = item.show.outputContract
      const pixelCount = (contract && 'pixelCount' in contract ? contract.pixelCount : contract?.referencePixelCount) ?? 1_936
      const mapPoints = mapSource.resolve(pixelCount)
      const runtimeFor = () => createFastReplayRuntime({
        code: compiled.artifact!.code,
        fxCode: compiled.artifact!.fxCode,
        metadata: compiled.artifact!.metadata,
        dimension: nativeDimension(compiled.artifact!.metadata.renderFns),
      }, { mapPoints, randomSeed: 823, fidelity: 'fast' })
      const durationMs = item.show.composition!.durationMs
        ?? projectShowTimeline(item.show).durationMs
      expect(durationMs, `${item.name} has a measurable duration`).toBeGreaterThan(0)

      // Sample early and mid in EVERY scene of the loop, not just its first
      // seconds: a voice whose state drifted but only becomes visible or
      // routed in a later passage (GlyphRain in 100, IceFloes2D in 206, the
      // Zone Layout showcases' later partitions) is invisible to an opening
      // sample - the first census shipped with exactly that blind spot
      // (#823 review P1).
      let cursorMs = 0
      const sampleTimesMs: number[] = []
      for (const scene of item.show.scenes) {
        sampleTimesMs.push(Math.min(cursorMs + 400, durationMs - 100))
        sampleTimesMs.push(Math.min(cursorMs + Math.floor(scene.durationMs / 2), durationMs - 100))
        cursorMs += scene.durationMs
      }
      const orderedSamples = [...new Set(sampleTimesMs)].sort((left, right) => left - right)
      const loopOne = runtimeFor()
      const loopTwo = runtimeFor()
      for (const timeMs of orderedSamples) {
        const first = loopOne.advanceTo(timeMs, { stepMs: 50 }).checksum
        const second = loopTwo.advanceTo(durationMs + timeMs, { stepMs: 50 }).checksum
        expect(second, `${item.name} at ${timeMs}ms wraps exactly`).toBe(first)
      }
    }
  })

  it('forfeits the stamp when Try with Pattern swaps in an unproven source (#823 review P1)', () => {
    // The wrap census proves the AUTHORED cast; a slot projection can swap
    // in a Pattern whose state the loop reset cannot reconstruct (105's
    // water slot accepts IceFloes2D, the exact voice the census removed).
    const stamped = STOCK_SHOWS.filter((item) => (
      item.show.composition?.executionModel === 'deterministic-loop'
      && (item.patternSlots?.length ?? 0) > 0
      && item.patternSlots!.some((group) => group.instanceIds.length > 0)
    ))
    expect(stamped.length).toBeGreaterThan(0)
    for (const item of stamped) {
      const projected = applyShowPatternSlotSelections(
        item.show,
        item.patternSlots!,
        { 0: { kind: 'stock', id: 'IceFloes2D' } },
        (ref) => ref.id,
        (ref) => bundledPatternSliderNames(DEMOS[ref.id], LIBRARIES),
      )
      expect(projected.composition?.executionModel, item.name).toBeUndefined()
    }
  })

  it('forfeits the stamp on permanent reassignment and restores it on unwind (#823 review)', () => {
    const item = STOCK_SHOWS.find((entry) => (
      entry.show.composition?.executionModel === 'deterministic-loop'
      && entry.patternSlots?.some((group) => group.instanceIds.length > 0)
    ))!
    const instanceId = item.patternSlots!.find((group) => group.instanceIds.length > 0)!.instanceIds[0]
    // Permanent Clip Detail-style reassignment forfeits the cast-bound proof.
    const replaced = replaceShowPatternInstance(
      item.show.composition!, instanceId, { pattern: { kind: 'stock', id: 'IceFloes2D' }, patternName: 'IceFloes2D' },
    )
    expect(replaced.executionModel).toBeUndefined()
    // Restoring the authored cast after a transient projection restores it.
    const projected = applyShowPatternSlotSelections(
      item.show, item.patternSlots!, { 0: { kind: 'stock', id: 'IceFloes2D' } }, (ref) => ref.id,
      (ref) => bundledPatternSliderNames(DEMOS[ref.id], LIBRARIES),
    )
    const restored = restoreShowReferencePatternSlots(projected, item.show, {
      pattern: { kind: 'stock', id: 'IceFloes2D' },
      patternName: 'IceFloes2D',
      ...item.patternSlots![0],
    })
    expect(restored.composition?.executionModel).toBe('deterministic-loop')
  })
})
