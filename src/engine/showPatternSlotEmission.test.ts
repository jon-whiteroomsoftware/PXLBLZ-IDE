import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShow } from './showCompiler'
import { compileShowForArtifact } from './showPreviewArtifact'

const propertyShow = STOCK_SHOWS.find((entry) => entry.id === 'stock-show-reference-property-animation')!.show
const installationShow = STOCK_SHOWS.find((entry) => entry.id === 'stock-show-205-installation-composition')!.show
const mapPoints = Array.from({ length: 64 }, (_, index) => ({
  sample: [(index % 8) / 7, Math.floor(index / 8) / 7],
}))

function compile(show: typeof propertyShow, patternSlotSharing: 'none' | 'force') {
  const result = compileShowForArtifact(show, [], undefined, {}, {
    stageDimension: 2,
    patternSlotSharing,
  })
  if (!result.artifact) throw new Error(result.error ?? 'Property Animation did not compile.')
  return result.artifact
}

function sampleTimesMs(show: typeof propertyShow): number[] {
  let cursor = 0
  return show.scenes.flatMap((scene) => {
    const points = [cursor + 1, cursor + scene.durationMs / 2, cursor + scene.durationMs - 1]
    cursor += scene.durationMs
    const transition = show.transitions?.find((entry) => entry.afterSceneId === scene.id)
    if (transition && transition.durationMs > 0) {
      points.push(cursor + transition.durationMs / 2)
      cursor += transition.durationMs
    }
    return points
  })
}

function checksums(
  artifact: ReturnType<typeof compile>,
  show: typeof propertyShow,
  fidelity: 'fast' | 'fidelity',
): string[] {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 546, fidelity })
  return sampleTimesMs(show).map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 100 }).checksum)
}

describe('whole-Pattern Restart slot emission (#546)', () => {
  it('normalizes omitted owner adaptations before emitting a shared slot', () => {
    const source = `var initialPixels = pixelCount
var phase = 0
export function beforeRender(delta) { phase = phase + delta / 1000 }
export function render2D(index, x, y) { hsv(phase + x, 1, initialPixels / pixelCount) }`
    const zones = [{ id: 'all', name: 'All', ranges: [{ start: 0, end: 7 }] }]
    const artifact = compileShow({
      masterPixelCount: 8,
      loopDurationMs: 2_000,
      clips: [{ id: 'first', source }, { id: 'second', source }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1_000,
            placements: [{ placementId: 'first-placement', zoneName: 'All', clipId: 'first' }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1_000,
            placements: [{ placementId: 'second-placement', zoneName: 'All', clipId: 'second' }],
          },
        ],
      },
    }, {}, { patternSlotSharing: 'force' })

    expect(artifact.summary.specializations.patternSlots).toMatchObject({
      selected: true,
      logicalMemberCount: 2,
      physicalSlotCount: 1,
    })
    expect(artifact.expandedCode).toContain('_switchOwner(nextOwner)')
    expect(artifact.expandedCode).toMatch(/__pxlblz_show_c0_pixelCount = 8\s+__pxlblz_show_c0_switchOwner/)
  })

  it('compiles Property Animation from 17 logical instances into eight physical machines', () => {
    const baseline = compile(propertyShow, 'none')
    const selected = compile(propertyShow, 'force')

    expect(baseline.summary.clipCount).toBe(17)
    expect(selected.summary.clipCount).toBe(8)
    expect(selected.summary.specializations.patternSlots).toMatchObject({
      selected: true,
      representation: 'lifetime-colored-restart-slots',
      logicalMemberCount: 17,
      physicalSlotCount: 8,
      reclaimedMachineCount: 9,
      steadyStateRenderOperationsAdded: 0,
    })
    expect(selected.code).toMatch(/function \w+\(nextOwner\) \{/)
    expect(selected.code).not.toContain('(nextOwner, timeOffsetMs, brightness, phase, timeScale, mirror)')
    expect(selected.summary.artifactBytes).toBeLessThan(baseline.summary.artifactBytes)
    expect(baseline.summary.artifactBytes).toBe(81_499)
    expect(selected.summary.artifactBytes).toBe(64_922)
    expect(selected.summary.resources).toMatchObject({
      auxiliaryCacheWords: 228,
      totalWords: 6_240,
      remainingWords: 4_000,
      persistentGlobals: 197,
      remainingGlobals: 59,
      blockers: [],
    })
  })

  it('matches the unshared artifact at Scene and transition samples in Fast and Precise replay', () => {
    const baseline = compile(propertyShow, 'none')
    const selected = compile(propertyShow, 'force')

    expect(checksums(selected, propertyShow, 'fast')).toEqual(checksums(baseline, propertyShow, 'fast'))
    expect(checksums(selected, propertyShow, 'fidelity')).toEqual(checksums(baseline, propertyShow, 'fidelity'))
  }, 20_000)

  it('also shares exact non-overlapping machines in 205 Installation Composition', () => {
    const baseline = compile(installationShow, 'none')
    const selected = compile(installationShow, 'force')

    expect(baseline.summary.clipCount).toBe(12)
    expect(selected.summary.clipCount).toBe(10)
    expect(selected.summary.specializations.patternSlots).toMatchObject({
      selected: true,
      logicalMemberCount: 12,
      physicalSlotCount: 10,
      reclaimedMachineCount: 2,
    })
    expect(selected.summary.artifactBytes).toBeLessThan(baseline.summary.artifactBytes)
    expect(baseline.summary.artifactBytes).toBe(76_383)
    expect(selected.summary.artifactBytes).toBe(69_076)
    expect(selected.summary.resources).toMatchObject({
      auxiliaryCacheWords: 216,
      totalWords: 708,
      remainingWords: 9_532,
      persistentGlobals: 239,
      remainingGlobals: 17,
      remainingArtifactBytes: -692,
    })
    expect(checksums(selected, installationShow, 'fast')).toEqual(checksums(baseline, installationShow, 'fast'))
    expect(checksums(selected, installationShow, 'fidelity')).toEqual(checksums(baseline, installationShow, 'fidelity'))
  }, 20_000)
})
