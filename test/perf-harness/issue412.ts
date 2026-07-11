/**
 * Issue #412: deterministic Fast-renderer Show seek replay spike.
 *
 * Runs compiled Show/Pattern artifacts through the real Fast shim and render
 * loop from a freshly-created runtime, advancing at a canonical 60 Hz without
 * WebGL/React work. Output is JSON so the archived findings remain reproducible.
 */
import { compileShow, type GeneratedShowArtifact, type ShowSceneSequenceTransitionRecipe } from '../../src/engine/showCompiler'
import {
  createFastReplayRuntime,
  prepareFastReplay,
  type PreparedFastReplay,
} from '../../src/engine/fastReplay'
import { createPlaneMap } from '../../src/engine/maps/plane'

const STEP_MS = 1000 / 60
const PIXEL_COUNTS = [256, 1024, 2048] as const
const TARGETS_MS = [15_000, 60_000, 180_000] as const
const RANDOM_SEED = 412

const CHEAP = `
var t = 0
export function beforeRender(delta) { t = t + delta * 0.0001 }
export function render2D(index, x, y) { hsv(x + y * 0.2 + t, 1, 0.75) }
`

const STATEFUL = `
var t = 0
var renderCalls = 0
var bins = array(16)
export function beforeRender(delta) {
  t = t + delta * 0.00012
  bins[floor(t * 100) % 16] = random(1)
}
export function render2D(index, x, y) {
  renderCalls = renderCalls + 1
  var slot = floor((x + y) * 7.5) % 16
  hsv(t + bins[slot], 0.8, 0.35 + bins[slot] * 0.65)
}
`

const HEAVY_A = `
var t = 0
export function beforeRender(delta) { t = t + delta * 0.00008 }
export function render2D(index, x, y) {
  var v = 0
  for (var i = 1; i <= 8; i = i + 1) {
    v = v + wave((x * i + sin(y * 6.283 + t * i)) * 0.35 + t)
  }
  hsv(t + v * 0.08, 0.85, v / 8)
}
`

const HEAVY_B = `
var t = 0
export function beforeRender(delta) { t = t + delta * 0.00011 }
export function render2D(index, x, y) {
  var dx = x - 0.5
  var dy = y - 0.5
  var v = 0
  for (var i = 1; i <= 8; i = i + 1) {
    v = v + wave(hypot(dx, dy) * i * 1.7 - t * i + sin((x - y) * i * 3.14))
  }
  hsv(v * 0.09 - t, 0.9, v / 8)
}
`

interface Fixture {
  id: 'cheap' | 'stateful-render-mutation' | 'route-wipe' | 'crossfade'
  prepared: PreparedFastReplay
  memberCalls: (frames: number, pixelCount: number) => number
}

interface MatrixResult {
  fixture: Fixture['id']
  pixelCount: number
  targetMs: number
  constructionMs: number
  replayMs: number
  realTimeMultiple: number
  simulatedFrames: number
  outerRendererCalls: number
  estimatedMemberRendererCalls: number
  checksum: string
  heapDeltaBytes: number
  uxTier: 'instant' | 'progress-indicated' | 'checkpoint-candidate'
}

function preparedShow(kind: ShowSceneSequenceTransitionRecipe['kind']): PreparedFastReplay {
  const transition = (transitionKind: ShowSceneSequenceTransitionRecipe['kind']): ShowSceneSequenceTransitionRecipe => ({
    kind: transitionKind,
    durationMs: transitionKind === 'cut' ? 0 : 5000,
    ...(transitionKind === 'wipe' ? { feather: 0.12 } : {}),
  })
  const artifact: GeneratedShowArtifact = compileShow({
    clips: [
      { id: 'a', source: HEAVY_A },
      { id: 'b', source: HEAVY_B },
    ],
    sceneSequence: {
      scenes: [
        { clipId: 'a', holdMs: 5000, transitionOut: transition(kind) },
        { clipId: 'b', holdMs: 5000, transitionOut: transition(kind) },
        { clipId: 'a', holdMs: 5000, transitionOut: transition('cut') },
        { clipId: 'b', holdMs: 5000 },
      ],
    },
  }, {})
  return { code: artifact.code, metadata: artifact.metadata, dimension: 2 }
}

function crossfadeMemberCalls(frames: number, pixelCount: number): number {
  let calls = frames * pixelCount
  for (let frame = 1; frame <= frames; frame += 1) {
    const phase = (frame * STEP_MS) % 30_000
    if ((phase > 5000 && phase <= 10_000) || (phase > 15_000 && phase <= 20_000)) calls += pixelCount
  }
  return calls
}

const fixtures: Fixture[] = [
  {
    id: 'cheap',
    prepared: prepareFastReplay(CHEAP, {}),
    memberCalls: (frames, pixels) => frames * pixels,
  },
  {
    id: 'stateful-render-mutation',
    prepared: prepareFastReplay(STATEFUL, {}),
    memberCalls: (frames, pixels) => frames * pixels,
  },
  {
    id: 'route-wipe',
    prepared: preparedShow('wipe'),
    memberCalls: (frames, pixels) => frames * pixels,
  },
  {
    id: 'crossfade',
    prepared: preparedShow('crossfade'),
    memberCalls: crossfadeMemberCalls,
  },
]

function plane(pixelCount: number) {
  const cols = pixelCount === 2048 ? 64 : Math.sqrt(pixelCount)
  const rows = pixelCount / cols
  return createPlaneMap({ rows, cols }).resolve(pixelCount)
}

function buildRuntime(fixture: Fixture, pixelCount: number) {
  return createFastReplayRuntime(fixture.prepared, {
    mapPoints: plane(pixelCount),
    randomSeed: RANDOM_SEED,
  })
}

function classify(replayMs: number): MatrixResult['uxTier'] {
  if (replayMs < 50) return 'instant'
  if (replayMs < 1000) return 'progress-indicated'
  return 'checkpoint-candidate'
}

function verifyDeterminism(fixture: Fixture) {
  const direct = buildRuntime(fixture, 256).advanceTo(15_000, { stepMs: STEP_MS })
  const segmentedRuntime = buildRuntime(fixture, 256)
  segmentedRuntime.advanceTo(5000, { stepMs: STEP_MS })
  const segmented = segmentedRuntime.advanceTo(15_000, { stepMs: STEP_MS })
  return {
    fixture: fixture.id,
    directChecksum: direct.checksum,
    segmentedChecksum: segmented.checksum,
    matches: direct.checksum === segmented.checksum,
  }
}

const verifications = fixtures.map(verifyDeterminism)
const results: MatrixResult[] = []

for (const fixture of fixtures) {
  for (const pixelCount of PIXEL_COUNTS) {
    for (const targetMs of TARGETS_MS) {
      const heapBefore = process.memoryUsage().heapUsed
      const constructionStart = performance.now()
      const runtime = buildRuntime(fixture, pixelCount)
      const constructionMs = performance.now() - constructionStart
      const replayStart = performance.now()
      const replay = runtime.advanceTo(targetMs, { stepMs: STEP_MS })
      const replayMs = performance.now() - replayStart
      const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore
      results.push({
        fixture: fixture.id,
        pixelCount,
        targetMs,
        constructionMs,
        replayMs,
        realTimeMultiple: targetMs / replayMs,
        simulatedFrames: replay.simulatedFrames,
        outerRendererCalls: replay.outerRendererCalls,
        estimatedMemberRendererCalls: fixture.memberCalls(replay.simulatedFrames, pixelCount),
        checksum: replay.checksum,
        heapDeltaBytes,
        uxTier: classify(replayMs),
      })
    }
  }
}

console.log(JSON.stringify({
  issue: 412,
  measuredAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  stepMs: STEP_MS,
  randomSeed: RANDOM_SEED,
  verifications,
  results,
}, null, 2))
