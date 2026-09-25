import { describe, expect, it } from 'vitest'
import { stockShowV2ById } from '../pixelblaze/stock/showsV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import type { ShowRecordV2 } from './showCompositionV2'
import type { GeneratedShowArtifact } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'

// #822: every Luma Sources beat is bare for its first half, then brought
// alive by one animated property. Compiling a trackless clone gives the
// exact bare baseline: the first half must match it frame-for-frame, and
// the second half must diverge (the animation is real, not decorative).

const MAP_POINTS = Array.from({ length: 256 }, (_, index) => ({
  sample: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
}))

function compileRecordV2(record: ShowRecordV2): GeneratedShowArtifact {
  const capture = captureShowStageEditV2(record, { patterns: [], libraries: [], maps: [], profiles: [], stageMap: resolveShowV2StageMap(record.stageMapId, []) })
  if (capture.prepared.status !== 'ready') throw new Error('stock v2 Show failed preparation')
  return capture.prepared.bundle.artifact
}

function checksumAt(artifact: GeneratedShowArtifact, timeMs: number): string {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: MAP_POINTS, randomSeed: 7, fidelity: 'fast' })
  return runtime.advanceTo(timeMs, { stepMs: 50 }).checksum
}

describe('Luma Sources showcase animation contract (#822)', () => {
  it('holds each beat bare for its first half and animates its second half', () => {
    const record = stockShowV2ById('stock-show-showcase-luma-sources')!
    const animated = compileRecordV2(record)

    // The Scene-local property tracks live on the Show-level track list on
    // v2 (ShowCompositionV2.propertyTracks): clearing it gives the bare baseline.
    const bareRecord = structuredClone(record)
    bareRecord.composition.propertyTracks = []
    const bare = compileRecordV2(bareRecord)

    for (let index = 0; index < 8; index++) {
      const start = index * 4_000
      // 1.5 s in: still inside the bare half - identical to the trackless clone.
      expect(
        checksumAt(animated, start + 1_500),
        `beat ${index + 1} bare half`,
      ).toBe(checksumAt(bare, start + 1_500))
      // 3.5 s in: the animation must have moved the image away from bare.
      expect(
        checksumAt(animated, start + 3_500),
        `beat ${index + 1} animated half`,
      ).not.toBe(checksumAt(bare, start + 3_500))
    }
  })
})
