import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'

export const ISSUE535_PIXEL_COUNTS = [256, 1_000, 2_000] as const
export const ISSUE535_REFRESH_CADENCES_MS = [250, 1_000, 2_000] as const
export const ISSUE535_ROLLING_SLICES = [2, 4, 8] as const

const HEAVY_BACKGROUND = `
var t = 0
export function beforeRender(delta) { t = t + delta / 1000 }
export function render(index) {
  var x = index / max(1, pixelCount - 1)
  var a = sin((x * 7 + t * 0.11) * 6.283185307179586)
  var b = cos((x * 13 - t * 0.07) * 6.283185307179586)
  var c = wave(x * 19 + a * 0.19 + b * 0.13 + t * 0.03)
  var d = sin((x * 29 + c * 0.17) * 6.283185307179586)
  rgb(a * a * 0.7 + c * 0.3, b * b * 0.65 + d * d * 0.35, c * c)
}
`

const LIVE_OVERLAY = `
var t = 0
export function beforeRender(delta) { t = t + delta / 1000 }
export function render(index) {
  var pulse = wave(t * 0.25)
  rgb(pulse, 0, index == floor(pixelCount * 0.5) ? 1 : 0)
}
`

export interface Issue535Artifacts {
  pixelCount: number
  live: GeneratedShowArtifact
  freeze: GeneratedShowArtifact
  refresh: Map<number, GeneratedShowArtifact>
  rollingRefresh: Map<number, GeneratedShowArtifact>
}

export function buildIssue535Artifacts(pixelCount: number): Issue535Artifacts {
  return {
    pixelCount,
    live: compileShow(recipe(pixelCount, 'live'), {}),
    freeze: compileShow(recipe(pixelCount, 'freeze-at-entry'), {}),
    refresh: new Map(ISSUE535_REFRESH_CADENCES_MS.map((cadenceMs) => [
      cadenceMs,
      compileShow(recipe(pixelCount, 'refresh', cadenceMs), {}),
    ])),
    rollingRefresh: new Map(ISSUE535_ROLLING_SLICES.map((slices) => [
      slices,
      compileShow(recipe(pixelCount, 'rolling-refresh', undefined, slices), {}),
    ])),
  }
}

export function buildIssue535Report() {
  return ISSUE535_PIXEL_COUNTS.map((pixelCount) => {
    const artifacts = buildIssue535Artifacts(pixelCount)
    return {
      pixelCount,
      live: describe(artifacts.live),
      freeze: describe(artifacts.freeze),
      refresh: Object.fromEntries([...artifacts.refresh].map(([cadenceMs, artifact]) => [cadenceMs, {
        ...describe(artifact),
        selectedScenes: artifact.summary.specializations.refresh.selectedSceneCount,
        cadenceMs: artifact.summary.specializations.refresh.cadenceMs,
        evaluationsAvoidedPerReplayFrame: artifact.summary.specializations.refresh.evaluationsAvoidedPerReplayFrame,
      }])),
      rollingRefresh: Object.fromEntries([...artifacts.rollingRefresh].map(([slices, artifact]) => [slices, {
        ...describe(artifact),
        selectedScenes: artifact.summary.specializations.rollingRefresh.selectedSceneCount,
        slices: artifact.summary.specializations.rollingRefresh.slices,
        maxPixelAgeFrames: artifact.summary.specializations.rollingRefresh.maxPixelAgeFrames,
        evaluationsAvoidedPerFrame: artifact.summary.specializations.rollingRefresh.evaluationsAvoidedPerFrame,
      }])),
    }
  })
}

function recipe(
  pixelCount: number,
  evaluationPolicy: 'live' | 'freeze-at-entry' | 'refresh' | 'rolling-refresh',
  refreshIntervalMs?: number,
  rollingRefreshSlices?: number,
): ShowRecipe {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: pixelCount - 1 }] }]
  const placements = [
    { placementId: 'background', zoneName: 'main', clipId: 'heavy', stackOrder: 0 },
    { placementId: 'overlay', zoneName: 'main', clipId: 'overlay', stackOrder: 1, opacity: 0.12 },
  ]
  return {
    masterPixelCount: pixelCount,
    clips: [{
      id: 'heavy',
      source: HEAVY_BACKGROUND,
      ...(evaluationPolicy === 'live' ? {} : { evaluationPolicy }),
      ...(evaluationPolicy === 'refresh' ? { refreshIntervalMs } : {}),
      ...(evaluationPolicy === 'rolling-refresh' ? { rollingRefreshSlices } : {}),
    }, {
      id: 'overlay',
      source: LIVE_OVERLAY,
    }],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [0, 1].map((sceneIndex) => ({
        holdMs: 10_000,
        placements: placements.map((placement) => ({
          ...placement,
          placementId: `${placement.placementId}-${sceneIndex}`,
        })),
      })),
    },
    loopDurationMs: 20_000,
  }
}

function describe(artifact: GeneratedShowArtifact) {
  return {
    sourceBytes: artifact.summary.artifactBytes,
    expandedSourceBytes: artifact.summary.expandedArtifactBytes,
    vmWords: artifact.summary.resources.totalWords,
    arenaWords: artifact.summary.resources.renderTargetWords,
    remainingVmWords: artifact.summary.resources.remainingWords,
  }
}

export const issue535Report = buildIssue535Report()

if (process.env.ISSUE535_REPORT || !process.env.VITEST) console.log(JSON.stringify(issue535Report, null, 2))
