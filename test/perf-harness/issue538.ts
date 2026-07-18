// Shared generated Effect-kernel capacity regression for issue #538.
// Run with: npm run issue538

import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'

const MEMBER_SOURCE = 'export function render2D(index, x, y) { rgb(x, y, index / max(1, pixelCount - 1)) }'
export const issue538MemberCounts = [2, 5, 10] as const
export const issue538ScoreTimesMs = [0, 250, 750, 1_250, 1_750]

export function issue538Recipe(memberCount: number): ShowRecipe {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 15 }] }]
  const clips = Array.from({ length: memberCount }, (_, index) => ({
    id: `member-${index}`,
    source: MEMBER_SOURCE,
    effects: [{ id: `scale-${index}`, kind: 'scale' as const, x: 0.7 + index * 0.01, y: 0.9 }],
  }))
  return {
    masterPixelCount: 16,
    clips,
    zones,
    routingLayouts: [{ id: 'main', name: 'main', zones }],
    routedSceneSequence: {
      scenes: clips.map((clip, index) => ({
        holdMs: 2_000,
        placements: [{
          placementId: `placement-${index}`,
          zoneName: 'main',
          clipId: clip.id,
          effects: clip.effects,
        }],
        propertyTracks: [{
          id: `track-${index}`,
          target: {
            kind: 'placement-effect' as const,
            placementId: `placement-${index}`,
            effectId: clip.effects[0].id,
            effectKind: 'scale' as const,
            parameterId: 'x',
          },
          keyframes: [
            { id: `start-${index}`, timeMs: 0, value: clip.effects[0].x, easing: { curve: 'linear' as const } },
            { id: `end-${index}`, timeMs: 2_000, value: clip.effects[0].x + 0.1, easing: { curve: 'linear' as const } },
          ],
        }],
        ...(index < clips.length - 1
          ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } }
          : {}),
      })),
    },
    loopDurationMs: memberCount * 2_000,
  }
}

function compilePair(memberCount: number) {
  const recipe = issue538Recipe(memberCount)
  return {
    baseline: compileShow(recipe, {}, { generatedEffectKernelSharing: false }),
    shared: compileShow(recipe, {}, { generatedEffectKernelSharing: true }),
  }
}

function checksums(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity'): string[] {
  const mapPoints = Array.from({ length: 16 }, (_, index) => ({
    sample: [(index % 4) / 3, Math.floor(index / 4) / 3],
  }))
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, { mapPoints, randomSeed: 538, fidelity })
  return issue538ScoreTimesMs.map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

function branchCount(source: string): number {
  const renderStart = source.indexOf('export function render2D(')
  if (renderStart < 0) return 0
  return source.slice(renderStart).match(/\bif\s*\(/g)?.length ?? 0
}

export const issue538Cases = issue538MemberCounts.map((memberCount) => {
  const artifacts = compilePair(memberCount)
  const baselineFast = checksums(artifacts.baseline, 'fast')
  const baselinePrecise = checksums(artifacts.baseline, 'fidelity')
  const sharedFast = checksums(artifacts.shared, 'fast')
  const sharedPrecise = checksums(artifacts.shared, 'fidelity')
  const describe = (artifact: GeneratedShowArtifact) => ({
    sourceBytes: artifact.summary.artifactBytes,
    expandedSourceBytes: artifact.summary.expandedArtifactBytes,
    persistentGlobals: artifact.summary.resources.persistentGlobals,
    vmWords: artifact.summary.resources.totalWords,
    perPixelBranches: branchCount(artifact.expandedCode),
  })
  return {
    memberCount,
    artifacts,
    baseline: describe(artifacts.baseline),
    shared: describe(artifacts.shared),
    delta: {
      sourceBytes: artifacts.shared.summary.artifactBytes - artifacts.baseline.summary.artifactBytes,
      expandedSourceBytes: artifacts.shared.summary.expandedArtifactBytes - artifacts.baseline.summary.expandedArtifactBytes,
      persistentGlobals: artifacts.shared.summary.resources.persistentGlobals - artifacts.baseline.summary.resources.persistentGlobals,
      vmWords: artifacts.shared.summary.resources.totalWords - artifacts.baseline.summary.resources.totalWords,
      perPixelBranches: branchCount(artifacts.shared.expandedCode) - branchCount(artifacts.baseline.expandedCode),
    },
    parity: {
      fast: sharedFast.every((checksum, index) => checksum === baselineFast[index]),
      precise: sharedPrecise.every((checksum, index) => checksum === baselinePrecise[index]),
    },
  }
})

export const issue538Report = {
  family: 'animated affine Scale Effect',
  cases: issue538Cases.map(({ artifacts: _artifacts, ...entry }) => entry),
}

if (process.env.ISSUE538_REPORT || !process.env.VITEST) console.log(JSON.stringify(issue538Report, null, 2))
