/**
 * Author "Teaser 01: Coronal Mass Ejection" as a personal Show and save it
 * through the local dev API.
 *
 * One CME Clip on one Layer. A single 36s gesture: half-speed intro, rotation
 * eases in, speed and rotation accelerate together to a crescendo of on-beat
 * brightness pulses, then both wind down to a dead stop as the pulses spread
 * apart (ritardando), hold two beats, fade to black.
 *
 *   npx tsx scripts/promo/cme-teaser.ts --dry   # build + validate + compile only
 *   npx tsx scripts/promo/cme-teaser.ts         # also save via http://localhost:8788
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  createShowWithOutputContract,
  extendShowCell,
  removeShowBoundaryTransition,
  removeShowClip,
  updateShowCellAdaptations,
  updateShowCellPattern,
  updateShowScene,
} from '../../src/engine/showModel'
import { compileShowForPreview } from '../../src/engine/showPreviewArtifact'
import type { PatternRecord } from '../../src/engine/personalContentRecords'
import { createPortableShowOutputContract } from '../../src/engine/showOutputContract'
import {
  normalizeShowComposition,
  projectFlatShowToCompositionV1WithCellOrigins,
  validateShowComposition,
} from '../../src/engine/showCompositionModel'
import {
  addShowPropertyKeyframe,
  addShowPropertyTrack,
} from '../../src/engine/showPropertyAnimation'
import type {
  ShowCompositionV1,
  ShowPropertyAnimationTarget,
  ShowRecord,
  ShowStructuredEasing,
} from '../../src/engine/personalContentRecords'
import { createSessionToken, sessionCookieName } from '../../src/cloudflare/auth'
import { readDevVarsFile } from '../dev-runtime-auth'

const SHOW_ID = 'teaser-cme-01'
const SHOW_NAME = 'Teaser 01: Coronal Mass Ejection'
const CME_PATTERN_ID = '5ae230d0-c9e8-442d-8904-e2be1d3c5a56'
const USER_ID = 'github:59668898'
const API_BASE = 'http://localhost:8788'
/** 36s gesture plus two bars of black before the loop restarts. */
const DURATION_MS = 40_000
/**
 * Chosen so the frozen final frame lands in the red/orange band of
 * t1 = time(.2). The show's elapsed pattern-time is close to two full 13.1s
 * hue cycles, so this offset warms the opening frames too.
 */
const TIME_OFFSET_MS = 2_450

const LINEAR: ShowStructuredEasing = { curve: 'linear' }
const CUBIC_IN: ShowStructuredEasing = { curve: 'cubic', direction: 'in' }
const QUAD_IN: ShowStructuredEasing = { curve: 'quadratic', direction: 'in' }
const CUBIC_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'out' }
const SINE_IN_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'in-out' }
const SINE_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'out' }

type Keyframe = { timeMs: number; value: number; easing: ShowStructuredEasing }

const dry = process.argv.includes('--dry')
const repoRoot = path.resolve(import.meta.dirname, '..', '..')

async function fetchCmePattern(cookie: string): Promise<PatternRecord> {
  const response = await fetch(`${API_BASE}/api/patterns`, { headers: { cookie } })
  if (!response.ok) throw new Error(`GET /api/patterns failed: ${response.status}`)
  const { patterns } = await response.json() as { patterns: PatternRecord[] }
  const cme = patterns.find((pattern) => pattern.id === CME_PATTERN_ID)
  if (!cme) throw new Error(`Pattern ${CME_PATTERN_ID} not found for ${USER_ID}`)
  return cme
}

function mustEdit(
  label: string,
  previous: ShowCompositionV1,
  next: ShowCompositionV1,
): ShowCompositionV1 {
  if (next === previous) throw new Error(`Edit rejected: ${label}`)
  return next
}

function addTrack(
  show: Pick<ShowRecord, 'scenes'>,
  composition: ShowCompositionV1,
  sceneId: string,
  trackId: string,
  target: ShowPropertyAnimationTarget,
  keyframes: Keyframe[],
): ShowCompositionV1 {
  const [first, second, ...rest] = keyframes
  if (!first || !second) throw new Error(`${trackId}: needs at least two keyframes`)
  let next = mustEdit(`${trackId} (track)`, composition, addShowPropertyTrack(show, composition, sceneId, {
    id: trackId,
    target,
    keyframes: [first, second].map((keyframe, index) => ({ id: `${trackId}-kf-${index + 1}`, ...keyframe })),
  }))
  rest.forEach((keyframe, index) => {
    next = mustEdit(`${trackId} kf@${keyframe.timeMs}`, next, addShowPropertyKeyframe(show, next, sceneId, trackId, {
      id: `${trackId}-kf-${index + 3}`,
      ...keyframe,
    }))
  })
  return next
}

/**
 * One on-beat stab: fast drop landing the valley on the beat, a held dark
 * floor, then a smooth recovery.
 */
function pulse(atMs: number, depth: number, holdMs = 150, recoverMs = 500): Keyframe[] {
  return [
    { timeMs: atMs - 100, value: 1, easing: CUBIC_OUT },
    { timeMs: atMs, value: depth, easing: LINEAR },
    { timeMs: atMs + holdMs, value: depth, easing: SINE_IN_OUT },
    { timeMs: atMs + holdMs + recoverMs, value: 1, easing: LINEAR },
  ]
}

// --- Flat record: two Scenes cut at the 8s bar line, one CME cell in each.
// The same Pattern instance continues through the cut, so motion is seamless;
// Scene 1 is the untouched half-speed intro and Scene 2 owns every track.
const INTRO_MS = 8_000
let show = createShowWithOutputContract(
  SHOW_ID,
  SHOW_NAME,
  createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 2000 }),
)
show = updateShowScene(show, 'scene-1', { name: 'Intro', durationMs: INTRO_MS })
show = updateShowScene(show, 'scene-2', { name: 'Gesture', durationMs: DURATION_MS - INTRO_MS })
show = removeShowBoundaryTransition(show, 'transition-scene-1')
show = removeShowClip(show, show.cells[1].id)
const cellId = show.cells[0].id
show = updateShowCellPattern(show, cellId, {
  pattern: { kind: 'user', id: CME_PATTERN_ID },
  patternName: 'Coronal Mass Ejection',
})
show = updateShowCellAdaptations(show, cellId, { timeScale: 0.5, timeOffsetMs: TIME_OFFSET_MS })
show = extendShowCell(show, cellId, 2)
if (show.cells.length !== 1 || show.cells[0].sceneSpan !== 2) {
  throw new Error('Expected one held CME cell spanning both Scenes')
}
const cellSources = Object.fromEntries(show.cells.map((cell) => [cell.id, '']))
const nonCutTransitions = show.transitions.filter((transition) => transition.kind !== 'cut')
if (show.scenes.length !== 2 || nonCutTransitions.length !== 0) {
  throw new Error(`Unexpected flat shape: ${show.scenes.length} scenes, ${nonCutTransitions.length} non-cut transitions`)
}

async function main(): Promise<void> {
  const devVars = readDevVarsFile(path.join(repoRoot, '.dev.vars'))
  const secret = process.env.SESSION_SECRET ?? devVars.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET missing from .dev.vars')
  const token = await createSessionToken({
    userId: USER_ID,
    primaryProvider: 'github',
    primaryHandle: USER_ID.replace(/^github:/, ''),
    githubUserId: USER_ID.replace(/^github:/, ''),
    githubLogin: USER_ID.replace(/^github:/, ''),
    displayName: 'Local Dev',
    avatarUrl: null,
  }, secret)
  const cookie = `${sessionCookieName}=${encodeURIComponent(token)}`
  const cmePattern = await fetchCmePattern(cookie)
  const cmeSource = cmePattern.src

  // --- Composition: same bootstrap the Show editor performs ---
  Object.keys(cellSources).forEach((id) => { cellSources[id] = cmeSource })
  const projection = projectFlatShowToCompositionV1WithCellOrigins(show, {
    byCellId: cellSources,
    stageDimension: 2,
  })
  let composition: ShowCompositionV1 = {
    ...projection.composition,
    executionModel: 'deterministic-loop',
    durationMs: DURATION_MS,
    markers: [
      { id: 'marker-intro', timeMs: 0, name: 'Intro - half speed' },
      { id: 'marker-rotation', timeMs: 8_000, name: 'Rotation begins' },
      { id: 'marker-accel', timeMs: 12_000, name: 'Accelerando' },
      { id: 'marker-crescendo', timeMs: 24_000, name: 'Crescendo - pulses' },
      { id: 'marker-winddown', timeMs: 28_000, name: 'Wind-down' },
      { id: 'marker-stop', timeMs: 32_000, name: 'Stop' },
      { id: 'marker-fade', timeMs: 35_000, name: 'Fade' },
      { id: 'marker-black', timeMs: 36_000, name: 'Black' },
    ],
  }
  const gestureScene = composition.scenes.find((candidate) => candidate.sceneId === 'scene-2')
  const gesturePlacement = gestureScene?.zones[0]?.main[0]
  if (!gestureScene || !gesturePlacement) throw new Error('Projection did not produce the expected Scene 2 placement')
  if (composition.patternInstances.length !== 1) {
    throw new Error(`Expected one continued Pattern instance across the cut, got ${composition.patternInstances.length}`)
  }
  const instanceId = composition.patternInstances[0].id

  // All times below are Scene 2-relative (absolute time minus the 8s intro).
  // Animation speed: half speed, long cubic build to 1.75x, hold, land at 0 on the stop.
  composition = addTrack(show, composition, 'scene-2', 'track-speed',
    { kind: 'instance-time-scale', instanceId },
    [
      { timeMs: 0, value: 0.5, easing: LINEAR },
      { timeMs: 4_000, value: 0.5, easing: CUBIC_IN },
      { timeMs: 16_000, value: 1.75, easing: LINEAR },
      { timeMs: 20_000, value: 1.75, easing: CUBIC_OUT },
      { timeMs: 24_000, value: 0, easing: LINEAR },
    ])

  // Rotation in signed turns. Quadratic ease-in reads as motion within ~2s of
  // the cut; the later values keep angular velocity continuous at every join.
  composition = addTrack(show, composition, 'scene-2', 'track-rotation',
    { kind: 'placement-transform', placementId: gesturePlacement.id, property: 'rotation' },
    [
      { timeMs: 0, value: 0, easing: QUAD_IN },
      { timeMs: 16_000, value: 0.75, easing: LINEAR },
      { timeMs: 20_000, value: 1.125, easing: CUBIC_OUT },
      { timeMs: 24_000, value: 1.25, easing: LINEAR },
    ])

  // Scale: push-in to 1.45 (> sqrt(2)) fast enough to stay ahead of the
  // quadratic rotation's corner exposure at every instant; holds thereafter.
  for (const axis of ['scaleX', 'scaleY'] as const) {
    composition = addTrack(show, composition, 'scene-2', `track-${axis}`,
      { kind: 'placement-transform', placementId: gesturePlacement.id, property: axis },
      [
        { timeMs: 0, value: 1, easing: QUAD_IN },
        { timeMs: 4_000, value: 1.45, easing: LINEAR },
      ])
  }

  // Brightness: on-beat pulses through the crescendo, spreading apart and
  // softening through the wind-down; still through the hold; fade to black.
  composition = addTrack(show, composition, 'scene-2', 'track-brightness',
    { kind: 'placement-view', placementId: gesturePlacement.id, property: 'brightness' },
    [
      { timeMs: 0, value: 1, easing: LINEAR },
      ...[16_000, 17_000, 18_000, 19_000, 20_000].flatMap((atMs) => pulse(atMs, 0.05)),
      ...pulse(21_000, 0.15),
      ...pulse(22_200, 0.3),
      ...pulse(23_500, 0.5, 100, 400),
      { timeMs: 27_000, value: 1, easing: SINE_OUT },
      { timeMs: 28_000, value: 0, easing: LINEAR },
    ])

  composition = normalizeShowComposition(show, composition)
  const issues = validateShowComposition(show, composition)
  if (issues.length > 0) {
    console.error('Composition validation issues:', JSON.stringify(issues, null, 2))
    process.exit(1)
  }
  const record: ShowRecord = { ...show, composition, updatedAt: Date.now() }

  // Compile smoke check through the same wrapper the compile bar uses.
  const compiled = compileShowForPreview(record, [cmePattern], undefined, {}, {
    stageDimension: 2,
    targetPixelCount: 2000,
  })
  if (!compiled.artifact) throw new Error(`Compile failed: ${compiled.error}`)
  console.log(`Compiled: ${compiled.artifact.summary.artifactBytes} bytes, warnings: ${JSON.stringify(compiled.artifact.summary.warnings)}`)

  const outDir = path.join(repoRoot, 'scripts', 'promo', 'out')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'cme-teaser.show.json'), JSON.stringify(record, null, 2))
  fs.writeFileSync(path.join(outDir, 'cme-teaser.generated.js'), compiled.artifact.code)
  console.log('Wrote scripts/promo/out/cme-teaser.show.json and cme-teaser.generated.js')

  if (dry) return

  const listing = await fetch(`${API_BASE}/api/shows`, { headers: { cookie } })
  if (!listing.ok) throw new Error(`GET /api/shows failed: ${listing.status}`)
  const { shows } = await listing.json() as { shows: Array<{ id: string }> }
  const exists = shows.some((candidate) => candidate.id === SHOW_ID)
  const response = exists
    ? await fetch(`${API_BASE}/api/shows/${SHOW_ID}`, {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(record),
      })
    : await fetch(`${API_BASE}/api/shows`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(record),
      })
  if (!response.ok) throw new Error(`Save failed: ${response.status} ${await response.text()}`)
  console.log(`${exists ? 'Updated' : 'Created'} Show ${SHOW_ID}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
