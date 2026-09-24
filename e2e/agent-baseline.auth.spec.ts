import { showLayerTransitionCommandFixture } from '../src/test/showLayerTransitionCommandFixture'
import { showAnimationCommandFixture } from '../src/test/showAnimationCommandFixture'
import { showBoundaryCommandFixture } from '../src/test/showBoundaryCommandFixture'
// Agent-editing baseline on the live editor (#945): known-outcome
// reproductions, not product acceptance. Every sequence drives the real
// Show editor route in Chromium, injects the real chat overlay served by a
// real scripted bridge process (HTTP, NDJSON, MCP, grammar session, turn
// runner; no paid model call), submits through the overlay's own input, and
// judges what the author sees, what the store persists, and what the
// network carried. Most assertions encode the bad outcomes observed on the
// current code so their owning roadmap slices can invert them in place.
// Sequence E is the first green regression: an accepted agent replacement is
// restamped at editor adoption, so a later failed save recovers the same
// record that storage and a reopened editor expose (#948).
//
//   npm run test:e2e:agent-baseline
//
// Raw records (overlay request phases, bridge phase clock, editor and
// preview observations, /api/shows writes, visible and durable facts) and a
// screenshot per sequence land under reports/agent-harness/baseline/browser/.
// Not part of the push gates: this is an explicit diagnostic command.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Page, Request } from '@playwright/test'
import { expect, test } from './fixtures/authenticated'
import {
  BASELINE_LIBRARY,
  BASELINE_LIBRARY_PATTERN,
  personalBaseShow,
  resizeBoundaryShow,
  personalLibraryPatternShow,
} from '../src/agent-harness/baseline/fixtures'
import type { ShowRecord } from '../src/engine/personalContentRecords'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { createShowWithOutputContract } from '../src/engine/showModel'
import { createInstallationShowOutputContract } from '../src/engine/showOutputContract'
import { showRemoveClipFixture } from '../src/test/showRemoveClipFixture'
import { showOverlayLayerFixture } from '../src/test/showOverlayLayerFixture'
import { showSplitClipFixture } from '../src/test/showSplitClipFixture'
import { showOutputLayoutFixture } from '../src/test/showCommandFixture'

const TOOLBAR_SPLIT_ID = '00000992-0000-4000-8000-000000000001'

// The converted split fixture's clip-b is one global Clip, 12 000–36 000 ms.
// The right piece shares instance-b and enters with `continue`; the outgoing
// Transition's endpoint retargets to it (src/engine/showCommandsV2/clips.ts:286).
// track-b is cut only at the split, as v1 does (#1101): the left keeps its
// activation start and its keys up to 16 000 ms with a curve segment, and the
// right gets a `:split:` copy from the boundary on
// (src/engine/showPropertyAnimationV2.ts:185). tail-track, wholly after the
// split, retargets to the right piece with its activation unchanged.
function splitFixtureExpected(before: ShowRecordV2, rightId = 'clip-b-right'): ShowRecordV2 {
  const expected = structuredClone(before)
  const clips = expected.composition.clips
  const left = clips.find(clip => clip.id === 'clip-b')!
  left.durationMs = 4000
  clips.splice(clips.indexOf(left) + 1, 0, {
    ...structuredClone(left), id: rightId, startMs: 16000, durationMs: 20000,
    appearance: { keys: [{ id: `${rightId}:appearance:1`, timeMs: 16000, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
  })
  expected.composition.transitions.find(transition => transition.id === 'outgoing')!.participants[0].fromClipId = rightId
  const segment = { baseValue: 1, deltaValue: -0.8, easing: { curve: 'linear' as const }, sourceDurationMs: 7000 }
  const boundaryValue = 0.5428571428571429
  const tracks = expected.composition.propertyTracks
  const trackB = tracks.find(track => track.id === 'track-b')!
  trackB.keyframes = [
    { id: 'track-b:boundary:0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
    { ...trackB.keyframes[0], curveSegment: { ...segment, elapsedOffsetMs: 0 } },
    { id: 'track-b:boundary:16000', timeMs: 16000, value: boundaryValue, easing: { curve: 'linear' } },
  ]
  trackB.activeDurationMs = 16000
  const tail = tracks.find(track => track.id === 'tail-track')!
  tail.target = { ...tail.target, clipId: rightId } as typeof tail.target
  // The owner places the right piece directly after the track it split.
  tracks.splice(tracks.indexOf(trackB) + 1, 0, {
    id: `track-b:split:${rightId}`, target: { kind: 'clip-view', clipId: rightId, property: 'brightness' },
    keyframes: [
      { id: `track-b:boundary:16000:split:${rightId}`, timeMs: 16000, value: boundaryValue, easing: { curve: 'linear' }, curveSegment: { ...segment, elapsedOffsetMs: 4000 } },
      { id: 'kf-2', timeMs: 19000, value: 0.2, easing: { curve: 'linear' } },
      { id: 'track-b:boundary:30000', timeMs: 30000, value: 0.2, easing: { curve: 'linear' } },
    ],
    activeStartMs: 16000, activeDurationMs: 14000,
  })
  return expected
}

// clip-ov is 2000–8000 ms on the overlay Layer. Split at 5000 ms, the right
// piece follows it, shares instance-ov with `continue` and takes its held
// appearance from the split on (src/engine/showCommandsV2/clips.ts:286).
function overlaySplitExpected(before: ShowRecordV2, rightId: string): ShowRecordV2 {
  const expected = structuredClone(before)
  const clips = expected.composition.clips
  const left = clips.find(clip => clip.id === 'clip-ov')!
  left.durationMs = 3000
  clips.splice(clips.indexOf(left) + 1, 0, {
    ...structuredClone(left), id: rightId, startMs: 5000, durationMs: 3000,
    appearance: { keys: [{ ...structuredClone(left.appearance.keys[0]), id: `${rightId}:appearance:1`, timeMs: 5000 }] },
  })
  return expected
}

// v1 refused a Split at 30 000 ms, where clip-b's two Scene runs met at a Cut.
// The converted clip-b is one global Clip, 12 000–36 000 ms, so 30 000 ms is
// inside it and the owner splits there (src/engine/showCommandsV2/clips.ts:286).
// track-b's keys all precede the split, so the left keeps them to a 30 000 ms
// boundary key and the right piece gets no split copy; tail-track retargets to
// the right piece (src/engine/showPropertyAnimationV2.ts:195).
function formerCutSplitExpected(before: ShowRecordV2, rightId: string): ShowRecordV2 {
  const expected = structuredClone(before)
  const clips = expected.composition.clips
  const left = clips.find(clip => clip.id === 'clip-b')!
  left.durationMs = 18000
  clips.splice(clips.indexOf(left) + 1, 0, {
    ...structuredClone(left), id: rightId, startMs: 30000, durationMs: 6000,
    appearance: { keys: [{ id: `${rightId}:appearance:1`, timeMs: 30000, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
  })
  expected.composition.transitions.find(transition => transition.id === 'outgoing')!.participants[0].fromClipId = rightId
  // A split cuts tracks only at the split time (#1101): track-b's [0, 30 000)
  // activation lies wholly left of the split and stays unchanged, and
  // tail-track's [30 000, 60 000) lies wholly right and only retargets
  // (src/engine/showPropertyAnimationV2.ts:191-196).
  const tail = expected.composition.propertyTracks.find(track => track.id === 'tail-track')!
  tail.target = { ...tail.target, clipId: rightId } as typeof tail.target
  return expected
}

async function seekToolbarSplit(page: Page, atMs: number): Promise<void> {
  await page.locator('body').press('a')
  const playhead = page.getByRole('slider', { name: 'Show playhead' })
  for (let step = 0; step < atMs / 1000; step++) await playhead.press('ArrowRight')
  await expect(playhead).toHaveValue(String(atMs))
}

async function clickToolbarSplitWithFixedId(page: Page): Promise<void> {
  // Control only the generated identity so selected and unselected actions can
  // be compared as complete records, without normalizing away any references.
  await page.evaluate(rightId => {
    const win = window as unknown as { __restoreSplitId?: () => void }
    const original = crypto.randomUUID
    win.__restoreSplitId = () => { crypto.randomUUID = original }
    crypto.randomUUID = () => rightId as `${string}-${string}-${string}-${string}-${string}`
  }, TOOLBAR_SPLIT_ID)
  try {
    await page.getByRole('button', { name: 'Split at playhead' }).click()
  } finally {
    await page.evaluate(() => (window as unknown as { __restoreSplitId: () => void }).__restoreSplitId())
  }
}

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const REPORT_DIR = resolve('reports', 'agent-harness', 'baseline', 'browser', RUN_ID)
const BRIDGE_DELAY_MS = 2_500
const RESIZE_UTTERANCE = 'make the first Clip twelve seconds'
const BATCH_UTTERANCE = 'make the first Clip twelve seconds and dim it to half'
const MARKER_UTTERANCE = 'add a marker at ten seconds called Drop'

interface BridgeProcess {
  url: string
  child: ChildProcess
  logLines: string[]
  stop: () => Promise<void>
}

interface OverlayRequest {
  requestId: string
  showId: string
  capturedUpdatedAt: number
  submittedAt: number
  responseAt: number | null
  firstEventAt: number | null
  doneAt: number | null
  applyStartedAt: number | null
  applyEndedAt: number | null
  changed: boolean | null
  applied: boolean | null
  error: string | null
  events: Array<{ kind: string; name: string | null; at: number }>
  bridgeTiming?: Record<string, unknown> | null
}

interface ShowWrite {
  method: string
  url: string
  at: number
  status: number | null
  updatedAt: number | null
  firstMainStartMs: number | null
  firstMain: { durationMs: number | null; brightness: number | null } | null
  compositionDurationMs: number | null
  markers: number | null
}

interface PersistedShow {
  id: string
  name: string
  updatedAt: number
  version?: number
  zones?: Array<{ id: string }>
  scenes?: Array<{ id: string; durationMs: number }>
  cells?: Array<{ id: string; sceneId: string; adaptations?: { brightness?: number } }>
  composition?: {
    durationMs?: number
    showEndMs?: number
    markers?: Array<{ name?: string; timeMs: number }>
    scenes?: Array<{ zones: Array<{ main: Array<{ id: string; startMs: number; durationMs: number; view?: { brightness?: number } }> }> }>
    layers?: Array<{ id: string; zoneId: string; rank: number }>
    clips?: Array<{
      id: string
      startMs: number
      durationMs: number
      layerId: string
      zoneId: string
      appearance?: { keys?: Array<{ value?: { view?: { brightness?: number } } }> }
    }>
    transitions?: Array<{ id: string }>
  } | null
}

type Observation = Record<string, unknown> & { kind: string; at: number }

interface MainFacts {
  id: string
  startMs: number
  durationMs: number
  brightness: number
}

test.describe.configure({ mode: 'serial' })

async function startBridgeProcess(): Promise<BridgeProcess> {
  const logLines: string[] = []
  const child = spawn(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), 'src/agent-harness/run.ts', 'src/agent-harness/bridge/server.ts'],
    {
      cwd: process.cwd(),
      env: { ...process.env, BRIDGE_AGENT: 'scripted', BRIDGE_PORT: '0', BRIDGE_DELAY_MS: String(BRIDGE_DELAY_MS) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const url = await new Promise<string>((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error(`the scripted bridge did not start within 90 s:\n${logLines.join('\n')}`)), 90_000)
    const onData = (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.trim()) continue
        logLines.push(line)
        const match = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(line)
        if (match) {
          clearTimeout(timer)
          resolveUrl(match[1])
        }
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`the scripted bridge exited with ${code}:\n${logLines.join('\n')}`))
    })
  })
  return {
    url,
    child,
    logLines,
    stop: () => new Promise<void>((done) => {
      if (child.exitCode !== null) {
        done()
        return
      }
      child.once('exit', () => done())
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }),
  }
}

function saveRecord(name: string, record: unknown): void {
  mkdirSync(REPORT_DIR, { recursive: true })
  writeFileSync(join(REPORT_DIR, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`)
}

function watchShowWrites(page: Page): ShowWrite[] {
  const writes: ShowWrite[] = []
  const pending = new Map<Request, ShowWrite>()
  page.on('request', (request) => {
    if (!request.url().includes('/api/shows') || request.method() === 'GET') return
    let body: PersistedShow | null
    try {
      body = JSON.parse(request.postData() ?? 'null') as PersistedShow | null
    } catch {
      body = null
    }
    // A version-2 save is PUT /api/shows/<id>?show-version=2 and a create is
    // POST /api/shows?show-version=2 (src/engine/remotePersonalContentProvider.ts
    // createShowV2/replaceShowV2). Read the same rank-0 first main as the
    // record readers, Show End from composition.showEndMs, and the Marker count.
    const firstMain = mainPlacements(body ?? undefined)[0]
    const write: ShowWrite = {
      method: request.method(),
      url: request.url(),
      at: Date.now(),
      status: null,
      updatedAt: body?.updatedAt ?? null,
      firstMainStartMs: firstMain?.startMs ?? null,
      firstMain: firstMain
        ? { durationMs: firstMain.durationMs, brightness: firstMain.brightness }
        : null,
      compositionDurationMs: body?.composition?.showEndMs ?? body?.composition?.durationMs ?? null,
      markers: body?.composition?.markers?.length ?? null,
    }
    pending.set(request, write)
    writes.push(write)
  })
  page.on('response', (response) => {
    const write = pending.get(response.request())
    if (write) write.status = response.status()
  })
  page.on('requestfailed', (request) => {
    const write = pending.get(request)
    if (write) write.status = -1
  })
  return writes
}

/**
 * Collect the complete record each version-2 save of one Show carries. A v2
 * save is PUT /api/shows/<id>?show-version=2 with the whole record as its body
 * (src/engine/remotePersonalContentProvider.ts replaceShowV2).
 */
function captureCompleteWrites(showId: string): { completeWrites: unknown[]; captureWrite: (request: Request) => void } {
  const completeWrites: unknown[] = []
  const captureWrite = (request: Request) => {
    if (request.method() === 'PUT' && request.url().endsWith(`/api/shows/${showId}?show-version=2`)) completeWrites.push(request.postDataJSON())
  }
  return { completeWrites, captureWrite }
}

/**
 * Seed one version-1 personal Show and open it with the Agent capability on.
 *
 * B2-only: its subject is the version-1 editor's agent binding and route
 * gating, so it seeds the row it means, in the shape the flow's Installation
 * defaults built. Every other sequence seeds version 2.
 */
async function createPersonalShowV1(page: Page): Promise<string> {
  const show = createShowWithOutputContract(
    randomUUID(),
    'Untitled Show',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }),
  )
  const created = await page.context().request.post('/api/shows', { data: show })
  expect(created.ok(), await created.text()).toBe(true)
  await page.goto(`studio/shows/${show.id}?agent=1`)
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${show.id}\\?agent=1$`))
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  return show.id
}

/**
 * Seed one version-2 personal Show and open it with the Agent capability on.
 *
 * Builds the record through the product's own fresh-Show builder
 * (src/engine/showCreationV2.ts createShowV2WithOutputContract) and creates
 * it through the product's own create call (POST /api/shows?show-version=2,
 * as src/engine/remotePersonalContentProvider.ts createShowV2 does). The
 * builder runs inside the page: it reaches the v2 schema through ?raw, which
 * the spec's own module loader cannot resolve (e2e/support/showBacking.ts
 * runs its converter in the page for the same reason).
 */
async function createPersonalShowV2(page: Page): Promise<string> {
  const id = randomUUID()
  await page.goto('studio/shows')
  const show = (await page.evaluate(async (showId: string) => {
    const load = (path: string) => import(path)
    const [{ createShowV2WithOutputContract }, { createInstallationShowOutputContract }] = await Promise.all([
      load('/PXLBLZ-IDE/src/engine/showCreationV2.ts'),
      load('/PXLBLZ-IDE/src/engine/showOutputContract.ts'),
    ])
    return createShowV2WithOutputContract(showId, 'Untitled Show', createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }))
  }, id)) as { id: string }
  const created = await page.context().request.post('/api/shows?show-version=2', { data: show })
  expect(created.ok(), await created.text()).toBe(true)
  await page.goto(`studio/shows/${show.id}?agent=1`)
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${show.id}\\?agent=1$`))
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  return show.id
}

/**
 * Seed one pinned legacy fixture as a version-2 personal Show, without
 * opening it. The record converts through the app's own converter
 * (src/agent-harness/baseline/fixturesV2.ts convertBaselineRecord) inside the
 * page, for the loader reason createPersonalShowV2 names, and is created
 * through the product's own create call (POST /api/shows?show-version=2).
 */
async function seedConvertedShowV2(page: Page, record: ShowRecord, label: string, edit?: (converted: ShowRecordV2) => void): Promise<ShowRecordV2> {
  await page.goto('studio/shows')
  const converted = (await page.evaluate(async (input) => {
    const load = (path: string) => import(path)
    const { convertBaselineRecord } = await load('/PXLBLZ-IDE/src/agent-harness/baseline/fixturesV2.ts')
    return convertBaselineRecord(input.source, input.label, [])
  }, { source: record, label })) as ShowRecordV2
  edit?.(converted)
  const created = await page.context().request.post('/api/shows?show-version=2', { data: converted })
  expect(created.status(), await created.text()).toBe(201)
  return converted
}

/** A copy of a version-2 record with one Clip's duration replaced. */
function withClipDuration<T extends PersistedShow | undefined>(show: T, clipId: string, durationMs: number): T {
  const next = structuredClone(show)!
  next.composition!.clips!.find(clip => clip.id === clipId)!.durationMs = durationMs
  return next
}

/**
 * A copy of a version-2 record with one unconnected Clip moved to a new start.
 * Its appearance keys are global times, so they shift with it
 * (src/engine/showClipTemporalV2.ts:144 applyShowTransitionClipShiftV2).
 */
function withClipMovedTo<T extends PersistedShow | undefined>(show: T, clipId: string, startMs: number): T {
  const next = structuredClone(show)!
  const clip = next.composition!.clips!.find(candidate => candidate.id === clipId)! as { startMs: number; appearance?: { keys?: Array<{ timeMs: number }> } }
  const deltaMs = startMs - clip.startMs
  clip.startMs = startMs
  for (const key of clip.appearance?.keys ?? []) key.timeMs += deltaMs
  return next
}

/** Reopen an exported Show file through the product import's v2 opt-in (src/components/PatternList.tsx:304-306). */
async function reopenExport(page: Page, path: string): Promise<{ show: unknown }> {
  return page.evaluate(async bytes => {
    const load = (path: string) => import(path)
    const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
    return parseShowFileBundle(new Uint8Array(bytes), { acceptV2: true })
  }, [...readFileSync(path)])
}

async function injectOverlay(page: Page, bridgeUrl: string): Promise<void> {
  await page.evaluate((src) => new Promise<void>((done, fail) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => done()
    script.onerror = () => fail(new Error(`could not load ${src}`))
    document.body.appendChild(script)
  }), `${bridgeUrl}/chat.js`)
  await expect(page.getByTestId('agent-chat-input')).toBeVisible()
}

async function overlayRequests(page: Page): Promise<OverlayRequest[]> {
  return page.evaluate(() => (window as unknown as { __pxlblzChat?: { requests: OverlayRequest[] } }).__pxlblzChat?.requests ?? [])
}

/** Type the utterance into the overlay and press Send; returns the request id it minted. */
async function submitUtterance(page: Page, utterance: string): Promise<string> {
  const before = (await overlayRequests(page)).length
  const edge = page.getByRole('button', { name: /Open the Agent drawer/ })
  if (await edge.count() && await edge.getAttribute('aria-expanded') === 'false') await edge.click()
  await page.getByTestId('agent-chat-input').fill(utterance)
  await page.getByTestId('agent-chat-send').click()
  await expect.poll(async () => (await overlayRequests(page)).length).toBe(before + 1)
  return (await overlayRequests(page))[before].requestId
}

async function overlayRequest(page: Page, requestId: string): Promise<OverlayRequest> {
  const found = (await overlayRequests(page)).find((record) => record.requestId === requestId)
  if (!found) throw new Error(`overlay request ${requestId} is missing`)
  return found
}

async function waitForAccepted(page: Page, requestId: string): Promise<void> {
  await expect.poll(async () => (await overlayRequest(page, requestId)).events.some((event) => event.kind === 'accepted'), {
    timeout: 20_000,
  }).toBe(true)
}

async function waitForDone(page: Page, requestId: string): Promise<OverlayRequest> {
  await expect.poll(async () => {
    const record = await overlayRequest(page, requestId)
    if (record.error) return true
    if (record.doneAt === null) return false
    return record.changed === false || record.applyEndedAt !== null
  }, { timeout: 30_000 }).toBe(true)
  return overlayRequest(page, requestId)
}

async function readObservations(page: Page): Promise<Observation[]> {
  return page.evaluate(() => (window as unknown as { __pxlblzObservations?: { read: () => Observation[] } }).__pxlblzObservations?.read() ?? [])
}

/**
 * The record the open editor holds. For a version-2 Show this is the v2
 * record: getShow returns the route's own version
 * (src/agent/editorAdmission.ts getShow resolves the bound record version).
 */
async function visibleRecord(page: Page): Promise<PersistedShow | undefined> {
  return page.evaluate(() => (window as unknown as { __pxlblzEditor?: { getShow: () => PersistedShow | undefined } }).__pxlblzEditor?.getShow())
}

/**
 * The stored version-2 document for one Show. GET /api/shows?show-version=2
 * returns the union of both versions' rows, so keep only version-2 records
 * (e2e/support/showBackingRecords.ts listStoredShowsV2 filters that union
 * with the product's own isShowRecordV2 the same way).
 */
async function durableShow(page: Page, id: string): Promise<PersistedShow | undefined> {
  const response = await page.context().request.get('/api/shows?show-version=2')
  expect(response.ok()).toBe(true)
  const { shows } = (await response.json()) as { shows: PersistedShow[] }
  return shows.filter((show) => show.version === 2).find((show) => show.id === id)
}

async function waitForDurable(page: Page, id: string, predicate: (show: PersistedShow) => boolean): Promise<void> {
  let last: PersistedShow | undefined
  try {
    await expect.poll(async () => {
      try {
        const show = await durableShow(page, id)
        last = show
        return show ? predicate(show) : false
      } catch {
        return false
      }
    }).toBe(true)
  } catch (error) {
    throw new Error(`durable Show ${id} never satisfied the predicate (last: ${summarizeDurableShow(last)})`, { cause: error })
  }
}

function summarizeDurableShow(show: PersistedShow | undefined): string {
  if (!show) return 'missing'
  const mains = mainPlacements(show).map((clip) => `${clip.id}@${clip.startMs}+${clip.durationMs}`).join(',')
  return `mains=[${mains}] transitions=${show.composition?.transitions?.length ?? 0} layers=${show.composition?.layers?.length ?? 0}`
}

async function durableShowV1(page: Page, id: string): Promise<PersistedShow | undefined> {
  const response = await page.context().request.get('/api/shows')
  expect(response.ok()).toBe(true)
  const { shows } = (await response.json()) as { shows: PersistedShow[] }
  return shows.find((show) => show.id === id)
}

async function waitForDurableV1(page: Page, id: string, predicate: (show: PersistedShow) => boolean): Promise<void> {
  await expect.poll(async () => {
    try {
      const show = await durableShowV1(page, id)
      return show ? predicate(show) : false
    } catch {
      return false
    }
  }).toBe(true)
}

/**
 * Main Clips of a version-2 record in timeline order: the Clips on the rank-0
 * Layer of the first Zone, sorted by startMs. Brightness is the Clip's held
 * appearance, the first appearance key's value.view.brightness (each fresh
 * Clip carries one held key with its view, src/engine/showCreationV2.ts).
 */
function mainPlacements(show: PersistedShow | undefined): MainFacts[] {
  if (!show?.composition?.clips) return []
  const zoneId = show.zones?.[0]?.id
  const mainLayerIds = new Set((show.composition.layers ?? [])
    .filter((layer) => layer.rank === 0 && (zoneId === undefined || layer.zoneId === zoneId))
    .map((layer) => layer.id))
  return show.composition.clips
    .filter((clip) => mainLayerIds.has(clip.layerId))
    .map((clip) => ({
      id: clip.id,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      brightness: clip.appearance?.keys?.[0]?.value?.view?.brightness ?? 1,
    }))
    .sort((a, b) => a.startMs - b.startMs)
}

function firstMain(show: PersistedShow | undefined): MainFacts | undefined {
  return mainPlacements(show)[0]
}

/**
 * Main placements of a version-1 record in timeline order, read from the
 * composition when the record carries one and from the flat cells otherwise
 * (a Clip delete through the legacy path can leave the record flat).
 * B2/D957-only: they seed version-1 rows.
 */
function mainPlacementsV1(show: PersistedShow | undefined): MainFacts[] {
  if (!show) return []
  if (show.composition?.scenes) {
    return show.composition.scenes.flatMap((scene) => (scene.zones[0]?.main ?? []).map((placement) => ({
      id: placement.id,
      startMs: placement.startMs,
      durationMs: placement.durationMs,
      brightness: placement.view?.brightness ?? 1,
    })))
  }
  let cursor = 0
  const starts = new Map<string, number>()
  for (const scene of show.scenes ?? []) {
    starts.set(scene.id, cursor)
    cursor += scene.durationMs
  }
  return (show.cells ?? []).map((cell) => {
    const scene = show.scenes?.find((candidate) => candidate.id === cell.sceneId)
    return {
      id: cell.id,
      startMs: starts.get(cell.sceneId) ?? 0,
      durationMs: scene?.durationMs ?? 0,
      brightness: cell.adaptations?.brightness ?? 1,
    }
  }).sort((a, b) => a.startMs - b.startMs)
}

function firstMainV1(show: PersistedShow | undefined): MainFacts | undefined {
  return mainPlacementsV1(show)[0]
}

/** Open the Clip's detail panel, read the fields the author sees, and close it. */
async function visibleClipFacts(page: Page, patternName: string): Promise<{ durationSeconds: string; brightnessPercent: string }> {
  // A Clip click toggles its own open panel (ShowEditor.tsx:1541-1545), and a drop can leave the moved Clip's panel open, so the helper reads an already-open panel instead of toggling it.
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  if (!(await panel.getByRole('heading', { name: patternName, exact: true }).isVisible())) {
    await page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first().click()
  }
  await expect(panel).toBeVisible()
  const durationSeconds = await panel.getByRole('textbox', { name: 'Duration seconds exact time' }).inputValue()
  const brightnessPercent = await panel.getByRole('textbox', { name: /^Brightness exact/ }).inputValue()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  return { durationSeconds, brightnessPercent }
}

async function visibleClipStart(page: Page, patternName: string): Promise<string> {
  // A Clip click toggles its own open panel (ShowEditor.tsx:1541-1545), and a drop can leave the moved Clip's panel open, so the helper reads an already-open panel instead of toggling it.
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  if (!(await panel.getByRole('heading', { name: patternName, exact: true }).isVisible())) {
    await page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first().click()
  }
  await expect(panel).toBeVisible()
  const startSeconds = await panel.getByRole('textbox', { name: 'Start seconds exact time' }).inputValue()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  return startSeconds
}

/** Drag one visible Clip body to a new start on its current timeline Layer. */
async function dragClipToStart(page: Page, patternName: string, durationMs: number, targetStartMs: number): Promise<string> {
  const clip = page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first()
  const layer = page.locator('[data-show-layer-kind="main"]').filter({ has: clip }).first()
  const [clipBounds, layerBounds] = await Promise.all([clip.boundingBox(), layer.boundingBox()])
  expect(clipBounds).not.toBeNull()
  expect(layerBounds).not.toBeNull()

  const source = {
    x: clipBounds!.x + clipBounds!.width / 2,
    y: clipBounds!.y + clipBounds!.height / 2,
  }
  const pixelsPerMs = clipBounds!.width / durationMs
  const target = {
    x: layerBounds!.x + targetStartMs * pixelsPerMs + clipBounds!.width / 2,
    y: layerBounds!.y + layerBounds!.height / 2,
  }

  const preview = page.getByTestId('show-clip-move-preview')
  let previewTime: string | null
  await page.keyboard.down('Shift')
  try {
    await page.mouse.move(source.x, source.y)
    await page.mouse.down()
    await page.mouse.move(source.x + 6, source.y, { steps: 2 })
    await page.mouse.move(target.x, target.y, { steps: 8 })
    await expect(preview).toBeVisible()
    await expect(preview).toHaveAttribute('data-drag-mode', 'move')
    previewTime = await page.getByTestId('show-clip-move-preview-time').textContent() ?? ''
  } finally {
    await page.mouse.up()
    await page.keyboard.up('Shift')
  }
  await expect(preview).toHaveCount(0)
  return previewTime ?? ''
}

async function setClipBrightness(page: Page, patternName: string, percent: string, options: { expectValue?: boolean } = {}): Promise<void> {
  await page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first().click()
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  await expect(panel).toBeVisible()
  const brightness = panel.getByRole('textbox', { name: /^Brightness exact/ })
  await brightness.fill(percent)
  await brightness.press('Enter')
  // A failing save can roll the field back before it is re-read (sequence E).
  if (options.expectValue !== false) await expect(brightness).toHaveValue(percent)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
}

async function undoEnabled(page: Page): Promise<boolean> {
  return page.getByRole('button', { name: 'Undo Show edit' }).isEnabled()
}

function phaseTimeline(request: OverlayRequest, observations: Observation[], writes: ShowWrite[]) {
  const applies = observations.filter((entry) => entry.kind === 'agent-apply' && entry.requestId === request.requestId)
  const adopted = applies.find((entry) => entry.phase === 'adopted')
  const settled = applies.find((entry) => entry.phase === 'settled' || entry.phase === 'failed')
  const published = observations.find((entry) => entry.kind === 'preview-published' && adopted && entry.digest === adopted.digest && entry.at >= adopted.at)
  const timing = (request.bridgeTiming ?? {}) as Partial<Record<'acceptedAt' | 'agentStartedAt' | 'agentEndedAt' | 'exportedAt' | 'delayMs', number>> & {
    validation?: { at: number; ms: number; ok: boolean }
    toolCalls?: Array<{ name: string; at: number; ms: number }>
  }
  // A version-2 save is PUT /api/shows/<id>?show-version=2 (see watchShowWrites).
  const candidateWrite = adopted ? writes.find((write) => write.method === 'PUT' && write.at >= adopted.at) : undefined
  const delta = (from: number | null | undefined, to: number | null | undefined) =>
    typeof from === 'number' && typeof to === 'number' ? to - from : null
  return {
    requestId: request.requestId,
    // Every figure is a scripted-bridge measurement with a fixed completion
    // delay; none of it is a model-latency claim.
    scripted: true,
    delayMs: timing.delayMs ?? null,
    submitToAcceptedMs: delta(request.submittedAt, timing.acceptedAt),
    acceptedToAgentStartMs: delta(timing.acceptedAt, timing.agentStartedAt),
    agentMs: delta(timing.agentStartedAt, timing.agentEndedAt),
    toolCalls: timing.toolCalls ?? [],
    validationMs: timing.validation?.ms ?? null,
    agentEndToExportMs: delta(timing.agentEndedAt, timing.exportedAt),
    exportToOverlayDoneMs: delta(timing.exportedAt, request.doneAt),
    doneToApplyStartMs: delta(request.doneAt, request.applyStartedAt),
    applyStartToAdoptedMs: delta(request.applyStartedAt, adopted?.at as number | undefined),
    adoptedToSettledMs: delta(adopted?.at as number | undefined, settled?.at as number | undefined),
    settledPhase: settled?.phase ?? null,
    adoptedToPreviewPublishedMs: delta(adopted?.at as number | undefined, published?.at),
    candidatePatchStatus: candidateWrite?.status ?? null,
    submitToApplyEndMs: delta(request.submittedAt, request.applyEndedAt),
  }
}

test.describe('agent editing baseline (#945): reproductions on the live Show editor', () => {
  let bridge: BridgeProcess

  test.beforeAll(async () => {
    bridge = await startBridgeProcess()
  })

  test.afterAll(async () => {
    await bridge.stop()
    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(join(REPORT_DIR, 'bridge.log'), `${bridge.logLines.join('\n')}\n`)
  })

  test('B2 gate: capability admission, query stability and route retirement preserve manual ownership', async ({ page }) => {
    test.setTimeout(90_000)
    const showId = await createPersonalShowV1(page)
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __pxlblzEditor?: { sessionId: string } }
    ).__pxlblzEditor?.sessionId)).toBeTruthy()
    const sessionId = await page.evaluate(() => (
      window as unknown as { __pxlblzEditor: { sessionId: string } }
    ).__pxlblzEditor.sessionId)
    await expect(page.getByTestId('agent-chat-panel')).toHaveCount(1)
    for (const search of ['', '?agent', '?agent=0', '?agent=true', '?agent=1&agent=0']) {
      await page.evaluate(search => window.history.replaceState(null, '', window.location.pathname + search), search)
      await expect(page.getByTestId('agent-chat-panel')).toHaveCount(1)
      expect(await page.evaluate(() => (window as unknown as { __pxlblzEditor?: { sessionId: string } }).__pxlblzEditor?.sessionId)).toBe(sessionId)
    }
    await setClipBrightness(page, 'TestPattern1D', '75')
    await waitForDurableV1(page, showId, show => firstMainV1(show)?.brightness === 0.75)
    await page.evaluate(() => window.history.replaceState(null, '', window.location.pathname + '?capture&agent=1&unrelated=kept'))
    await injectOverlay(page, bridge.url)
    const result = await page.evaluate(() => {
      const win = window as unknown as { __pxlblzEditor: { sessionId: string; beginRequest: (id: string, text: string, history: unknown[]) => { request: unknown; show: Record<string, unknown> }; applyShow: (show: unknown, request: unknown) => { status: string }; getEditorFocus: () => unknown }; __retained?: unknown }
      const original = win.__pxlblzEditor
      const captured = original.beginRequest('retained', 'rename', [])
      window.history.replaceState(null, '', window.location.href)
      const same = win.__pxlblzEditor === original
      window.history.replaceState(null, '', window.location.pathname + '?capture&unrelated=kept')
      window.history.replaceState(null, '', window.location.pathname + '?capture&agent=1&unrelated=kept')
      const queryStable = win.__pxlblzEditor === original
      const showPath = window.location.pathname
      const patternsPath = showPath.replace(/\/shows\/[^/]+$/, '/patterns')
      window.history.replaceState(null, '', `${patternsPath}?unrelated=kept`)
      const inactiveAway = !win.__pxlblzEditor
      const old = original.applyShow({ ...captured.show, name: 'Stale' }, captured.request)
      window.history.replaceState(null, '', `${showPath}?capture&unrelated=kept`)
      return { same, queryStable, inactiveAway, old, changed: win.__pxlblzEditor.sessionId !== original.sessionId }
    })
    expect(result).toEqual({ same: true, queryStable: true, inactiveAway: true, old: { request: expect.any(Object), status: 'retired' }, changed: true })
    await expect(page.getByTestId('agent-chat-panel')).toHaveCount(1)
    expect(new URL(page.url()).searchParams.get('unrelated')).toBe('kept')
    expect((await durableShowV1(page, showId))?.name).toBe('Untitled Show')
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await waitForDurableV1(page, showId, show => firstMainV1(show)?.brightness === 1)
  })

  test('D957: tucked drawer reports owned application and stale refusal with double attribution', async ({ page }) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const record = resizeBoundaryShow(`drawer-957-${Date.now().toString(36)}`)
    record.composition!.scenes[0].zones[0].main[1].startMs = 16000
    expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
    const showId = record.id
    await page.goto(`studio/shows/${showId}?agent=1`)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    await expect.poll(() => page.evaluate(async () => {
      const load = (path: string) => import(path)
      const [{ usePatternStore }, { useLibraryStore }, { useMapStore }, { useEntityOrganizationStore }] = await Promise.all([load('/PXLBLZ-IDE/src/store/patternStore.ts'), load('/PXLBLZ-IDE/src/store/libraryStore.ts'), load('/PXLBLZ-IDE/src/store/mapStore.ts'), load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')])
      return usePatternStore.getState().patternsLoaded && useLibraryStore.getState().librariesLoaded && useMapStore.getState().mapsLoaded && useEntityOrganizationStore.getState().loaded.libraries
    })).toBe(true)
    await injectOverlay(page, bridge.url)
    let releaseSave: () => void = () => {}
    const pendingSave = new Promise<void>(resolve => { releaseSave = resolve })
    page.once('close', releaseSave)
    await page.route(new RegExp(`/api/shows/${showId}$`), async route => {
      if (route.request().method() === 'PATCH') await pendingSave
      await route.continue()
    })
    const responsePromise = page.waitForResponse(response => response.url() === `${bridge.url}/utterance`)
    const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
    await waitForAccepted(page, id)
    await expect(page.locator(`[data-request-id="${id}"]`)).toHaveAttribute('data-outcome', 'applied')
    await expect(page.getByTestId('agent-chat-send')).toBeDisabled()
    await page.screenshot({ path: join(REPORT_DIR, 'D957-applied-saving.png'), fullPage: false, animations: 'disabled' })
    await page.getByRole('button', { name: 'Unpin the Agent drawer' }).click()
    releaseSave()
    await expect(page.getByTestId('agent-drawer-layout')).toHaveAttribute('data-drawer-mode', 'tucked')
    const done = await waitForDone(page, id)
    const bridgeResponse = await responsePromise
    saveRecord('D957-candidate', { request: bridgeResponse.request().postDataJSON(), response: await bridgeResponse.text(), outcome: done, visible: await visibleRecord(page) })
    expect(done.applied, JSON.stringify(done)).toBe(true)
    await expect(page.getByTestId('agent-unread-count')).toHaveText('1')
    const ring = page.locator('[data-agent-highlight="flash"], [data-agent-highlight="settled"]')
    await expect(ring).toHaveCount(1)
    expect(await ring.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('double')
    await page.screenshot({ path: join(REPORT_DIR, 'D957-saved-tucked.png'), fullPage: false, animations: 'disabled' })
    expect(firstMainV1(await durableShowV1(page, showId))?.durationMs).toBe(8000)
    await page.getByRole('button', { name: /^Open the Agent drawer/ }).click()
    await expect(page.getByTestId('agent-unread-count')).toHaveCount(0)
    await expect(page.locator(`[data-request-id="${id}"]`)).toHaveAttribute('data-outcome', 'saved')
    await expect(page.locator(`[data-request-id="${id}"]`).getByTestId('agent-response')).toContainText('8 seconds')
    await page.screenshot({ path: join(REPORT_DIR, 'D957-saved-open.png'), fullPage: false, animations: 'disabled' })
    await page.getByRole('button', { name: 'Pin the Agent drawer' }).click()
    const staleId = await submitUtterance(page, BATCH_UTTERANCE)
    await waitForAccepted(page, staleId)
    await page.getByRole('button', { name: 'Unpin the Agent drawer' }).click()
    await setClipBrightness(page, 'CometLoom', '75')
    const manual = await durableShowV1(page, showId)
    const stale = await waitForDone(page, staleId)
    expect(stale.applied).toBe(false)
    expect(await durableShowV1(page, showId)).toEqual(manual)
    await expect(page.locator('[data-agent-highlight="refused"]')).toHaveCount(1)
    await page.screenshot({ path: join(REPORT_DIR, 'D957-refused-tucked.png'), fullPage: false, animations: 'disabled' })
    await expect(page.getByTestId('agent-unread-count')).toHaveText('1')
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await expect(page.locator('[data-agent-highlight="refused"]')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('A: a delayed reply refuses after a manual edit and preserves its durable record', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShowV2(page)
    await injectOverlay(page, bridge.url)
    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, requestId)
    await setClipBrightness(page, 'TestPattern1D', '75')
    await waitForDurable(page, showId, show => firstMain(show)?.brightness === 0.75)
    const before = await durableShow(page, showId)
    const request = await waitForDone(page, requestId)
    expect(request.applied).toBe(false)
    expect(await durableShow(page, showId)).toEqual(before)
    expect(await visibleClipFacts(page, 'TestPattern1D')).toEqual({ durationSeconds: '30', brightnessPercent: '75' })
    expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    expect(await visibleClipFacts(page, 'TestPattern1D')).toEqual({ durationSeconds: '30', brightnessPercent: '100' })
    const observations = await readObservations(page)
    expect(observations.filter(entry => entry.kind === 'agent-apply' && entry.requestId === requestId).map(entry => entry.phase)).toEqual(['admitted', 'rejected'])
    await page.screenshot({ path: join(REPORT_DIR, 'A-stale-refused.png'), fullPage: true })
    saveRecord('A-stale-refused', { showId, request, writes, observations, preserved: before })
  })

  test('B: a delayed reply cannot resurrect a deleted target or undo its restored manual movement', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShowV2(page)
    await injectOverlay(page, bridge.url)
    const deleteId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, deleteId)
    const target = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    await target.click()
    await page.keyboard.press('Delete')
    // clip-1 carries native transition-1, so Delete only stages the
    // connected-delete confirmation (src/engine/showV2ClipDeletePlanning.ts:63);
    // confirming adopts the Clip plus Transition removal
    // (src/engine/showTransitionsV2.ts:124-127).
    await page.getByRole('button', { name: 'Remove Clip and Transition' }).click()
    await expect(target).toHaveCount(0)
    await waitForDurable(page, showId, show => mainPlacements(show).length === 1)
    const deleted = await durableShow(page, showId)
    expect((await waitForDone(page, deleteId)).applied).toBe(false)
    expect(await durableShow(page, showId)).toEqual(deleted)
    await expect(target).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await expect(target).toBeVisible()
    await target.click()
    const detail = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await detail.getByRole('textbox', { name: 'Duration seconds exact time' }).fill('12')
    await detail.getByRole('textbox', { name: 'Duration seconds exact time' }).press('Enter')
    await page.keyboard.press('Escape')
    await waitForDurable(page, showId, show => firstMain(show)?.durationMs === 12_000)
    const moveId = await submitUtterance(page, MARKER_UTTERANCE)
    await waitForAccepted(page, moveId)
    const movePreviewTime = await dragClipToStart(page, 'TestPattern1D', 12_000, 15_000)
    const movedStartMs = Math.round(Number.parseFloat(movePreviewTime.trim().replace(/s$/, '').trim()) * 1_000)
    expect(movedStartMs).toBeGreaterThan(0)
    expect(movedStartMs).not.toBe(0)
    // On v2 the joined Clip moves its connected component, and the pointer target from the Clip width is approximate, so B asserts the start the drag resolved to (its subject is that a stale reply cannot undo the manual move).
    await waitForDurable(page, showId, show => firstMain(show)?.startMs === movedStartMs)
    const moved = await durableShow(page, showId)
    expect((await waitForDone(page, moveId)).applied).toBe(false)
    expect(await durableShow(page, showId)).toEqual(moved)
    expect(await visibleClipStart(page, 'TestPattern1D')).toBe(String(movedStartMs / 1_000))
    expect(writes.filter(write => write.method === 'PUT')).toHaveLength(4)
    await page.screenshot({ path: join(REPORT_DIR, 'B-target-refused.png'), fullPage: true })
  })

  test('C: time inserted during inference is preserved when the reply refuses', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShowV2(page)
    await injectOverlay(page, bridge.url)
    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, requestId)
    await page.getByRole('button', { name: 'Add to Show' }).click()
    await page.getByRole('menuitem', { name: 'Time' }).click()
    const popover = page.getByRole('dialog', { name: 'Insert Time' })
    const amount = popover.getByRole('textbox', { name: 'Time to insert in seconds' })
    await amount.fill('5')
    await amount.press('Enter')
    await expect(popover.getByRole('button', { name: 'Insert' })).toBeEnabled()
    await popover.getByRole('button', { name: 'Insert' }).click()
    await waitForDurable(page, showId, show => firstMain(show)?.startMs === 5_000)
    const inserted = await durableShow(page, showId)
    expect((await waitForDone(page, requestId)).applied).toBe(false)
    expect(await durableShow(page, showId)).toEqual(inserted)
    expect(firstMain(await visibleRecord(page))?.startMs).toBe(5_000)
    expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
    await page.screenshot({ path: join(REPORT_DIR, 'C-insert-preserved.png'), fullPage: true })
  })

  test('D: departure clears the transcript and a late reply cannot apply on same-Show reopen', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const other = personalBaseShow(`baseline-away-${Date.now().toString(36)}`)
    await page.goto('studio/shows')
    const converted = (await page.evaluate(async (input) => {
      const load = (path: string) => import(path)
      const { convertBaselineRecord } = await load('/PXLBLZ-IDE/src/agent-harness/baseline/fixturesV2.ts')
      return convertBaselineRecord(input.source, 'baseline D away show', input.patterns)
    }, { source: other, patterns: [] })) as ShowRecordV2
    const seeded = await page.context().request.post('/api/shows?show-version=2', { data: converted })
    expect(seeded.status(), await seeded.text()).toBe(201)
    const showId = await createPersonalShowV2(page)
    const original = await durableShow(page, showId)
    await injectOverlay(page, bridge.url)
    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, requestId)
    await page.getByRole('treeitem', { name: other.name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${other.id}\\?agent=1$`))
    await expect(page.getByTestId('agent-chat-panel')).toHaveCount(0)
    await page.getByRole('treeitem', { name: 'Untitled Show', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${showId}\\?agent=1$`))
    await page.waitForTimeout(BRIDGE_DELAY_MS + 1_000)
    expect(await overlayRequests(page)).toEqual([])
    expect(await durableShow(page, showId)).toEqual(original)
    expect(writes.filter(write => write.method === 'PUT')).toHaveLength(0)
    await injectOverlay(page, bridge.url)
    expect(await overlayRequests(page)).toEqual([])
    await expect(page.getByTestId('agent-chat-log')).not.toContainText(RESIZE_UTTERANCE)
    await page.screenshot({ path: join(REPORT_DIR, 'D-session-retired.png'), fullPage: true })
  })

  test.describe('E: failed save after the reply', () => {
    test.use({ allowedBrowserErrors: [/net::ERR_FAILED|Failed to fetch/] })

    test('E: a later failed save restores the saved candidate and reopening keeps it', async ({ page }) => {
      test.setTimeout(90_000)
      const writes = watchShowWrites(page)
      const showId = await createPersonalShowV2(page)
      await injectOverlay(page, bridge.url)

      // Establish an accepted durable candidate before the later failed save.
      const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
      await waitForAccepted(page, requestId)
      const request = await waitForDone(page, requestId)
      expect(request.applied).toBe(true)
      await waitForDurable(page, showId, (show) => firstMain(show)?.durationMs === 12_000)
      const durableAfterCandidate = await durableShow(page, showId)

      // A later manual edit C whose save fails.
      let blockWrites = true
      await page.route('**/api/shows/**', (route) => {
        if (blockWrites && route.request().method() === 'PUT') return route.abort()
        return route.continue()
      })
      await setClipBrightness(page, 'TestPattern1D', '60', { expectValue: false })
      const notice = page.getByTestId('show-save-failure')
      await expect(notice).toBeVisible()
      const visibleAfterFailure = await visibleClipFacts(page, 'TestPattern1D')
      blockWrites = false
      const durableAfterFailure = await durableShow(page, showId)
      const observations = await readObservations(page)
      await page.screenshot({ path: join(REPORT_DIR, 'E-failed-save-recovery.png'), fullPage: true })

      await page.reload()
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      const visibleAfterReopen = await visibleClipFacts(page, 'TestPattern1D')
      const durableAfterReopen = await durableShow(page, showId)
      saveRecord('E-failed-save-recovery', {
        showId, request, writes, observations,
        durable: {
          afterCandidate: firstMain(durableAfterCandidate),
          afterFailure: firstMain(durableAfterFailure),
          afterReopen: firstMain(durableAfterReopen),
        },
        visible: { afterFailure: visibleAfterFailure, afterReopen: visibleAfterReopen },
        timeline: phaseTimeline(request, observations, writes),
      })
      expect(visibleAfterFailure).toEqual({ durationSeconds: '12', brightnessPercent: '100' })
      expect(firstMain(durableAfterFailure)).toMatchObject({ durationMs: 12_000, brightness: 1 })
      expect(visibleAfterReopen).toEqual({ durationSeconds: '12', brightnessPercent: '100' })
      expect(firstMain(durableAfterReopen)).toEqual(firstMain(durableAfterFailure))
    })
  })

  test('W: synthetic activity waits, cancels, or releases one diagnostic candidate', async ({ page }) => {
    test.setTimeout(90000)
    for (const action of ['cancel', 'release'] as const) {
      const record = resizeBoundaryShow(`wait-${action}-${Date.now().toString(36)}`)
      await seedConvertedShowV2(page, record, `baseline W ${action}`)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const [p, l, m] = await Promise.all(['pattern', 'library', 'map'].map(name => load(`/PXLBLZ-IDE/src/store/${name}Store.ts`)))
        return p.usePatternStore.getState().patternsLoaded && l.useLibraryStore.getState().librariesLoaded && m.useMapStore.getState().mapsLoaded
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      const before = await visibleRecord(page)
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      // This internal token is explicit synthetic proof, not real field registration.
      const acquired = await page.evaluate(async () => {
        const load = (path: string) => import(path)
        const url = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /\/src\/store\/showStore\.ts(?:\?|$)/.test(name)).at(-1)!
        const { useShowStore } = await load(url)
        const w = window as unknown as { __pxlblzEditor: { sessionId: string; getShow: () => { id: string } }; syntheticWaitRelease?: () => void }
        const token = useShowStore.getState().acquireShowEditActivity(w.__pxlblzEditor.sessionId, w.__pxlblzEditor.getShow().id, 'dirty-field')
        w.syntheticWaitRelease = () => useShowStore.getState().releaseShowEditActivity(token)
        return !!token
      })
      expect(acquired).toBe(true)
      const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
      await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for you to finish')
      await expect(page.getByTestId('agent-chat-cancel')).toBeVisible()
      expect(await visibleRecord(page)).toEqual(before)
      expect(writes).toHaveLength(0)
      if (action === 'cancel') await page.getByTestId('agent-chat-cancel').click()
      else await page.evaluate(() => (window as unknown as { syntheticWaitRelease: () => void }).syntheticWaitRelease())
      const done = await waitForDone(page, id)
      expect(done.applied).toBe(action === 'release')
      if (action === 'release') {
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 8000)
        expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
        expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
      } else {
        expect(await visibleRecord(page)).toEqual(before)
        expect(await durableShow(page, record.id)).toEqual(durableBefore)
        expect(writes).toHaveLength(0)
      }
      saveRecord(`W-${action}`, { syntheticActivity: true, before, done, current: await visibleRecord(page), durable: await durableShow(page, record.id), writes })
    }
  })

  test('FA: actual duration drafts wait and settle after field or agent cancellation', async ({ page }) => {
    test.setTimeout(150000)
    for (const action of ['draft-cancel', 'manual-commit', 'agent-cancel', 'focus-only'] as const) {
      await page.setViewportSize({ width: action === 'agent-cancel' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`field-${action}-${Date.now().toString(36)}`)
      await seedConvertedShowV2(page, record, `baseline FA ${action}`)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const [p, l, m] = await Promise.all(['pattern', 'library', 'map'].map(name => load(`/PXLBLZ-IDE/src/store/${name}Store.ts`)))
        return p.usePatternStore.getState().patternsLoaded && l.useLibraryStore.getState().librariesLoaded && m.useMapStore.getState().mapsLoaded
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      await expect(page.getByTestId('agent-chat-cancel')).toBeHidden()
      await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
      await expect(page.getByRole('textbox', { name: 'Duration seconds exact time' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('textbox', { name: 'Duration seconds exact time' })).toHaveCount(0)
      const before = await visibleRecord(page)
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
      await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
      const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
      if (action === 'focus-only') await duration.focus()
      else await duration.fill('7')
      if (action !== 'focus-only') {
        await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for you to finish')
        await expect(duration).toBeFocused()
        await expect(duration).toHaveValue('7')
        expect(await visibleRecord(page)).toEqual(before)
        expect(await durableShow(page, record.id)).toEqual(durableBefore)
        expect(writes).toHaveLength(0)
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
        await page.screenshot({ path: join(REPORT_DIR, `FA-${action}-waiting.png`), fullPage: true })
        if (action === 'draft-cancel') {
          await duration.press('Escape')
          await expect(duration).toHaveCount(0)
        }
        else if (action === 'manual-commit') await duration.press('Enter')
        else {
          const edge = page.getByRole('button', { name: /Open the Agent drawer/ })
          if (await edge.count() && await edge.getAttribute('aria-expanded') === 'false') await edge.hover()
          await page.getByTestId('agent-chat-cancel').click()
          await expect(duration).toHaveValue('7')
          await expect(duration).toBeFocused()
        }
      }
      const done = await waitForDone(page, id)
      const adopted = action === 'draft-cancel' || action === 'focus-only'
      expect(done.applied).toBe(adopted)
      if (action === 'agent-cancel') {
        expect(await visibleRecord(page)).toEqual(before)
        expect(await durableShow(page, record.id)).toEqual(durableBefore)
        expect(writes).toHaveLength(0)
        await duration.press('Escape')
      } else {
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === (adopted ? 8000 : 7000))
        const current = await visibleRecord(page)
        const expected = withClipDuration(before, firstMain(before)!.id, adopted ? 8000 : 7000)
        expect(current).toEqual({ ...expected, updatedAt: current!.updatedAt })
        expect(await durableShow(page, record.id)).toEqual(current)
        expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Show actions' }).click()
        const download = page.waitForEvent('download')
        await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
        const file = await download
        const reopened = await reopenExport(page, (await file.path())!)
        expect(reopened.show).toEqual(current)
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 4000)
        expect(await visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      }
      saveRecord(`FA-${action}`, { actualField: true, before, done, current: await visibleRecord(page), durable: await durableShow(page, record.id), writes })
    }
  })

  test('FC957: narrow Cancel remains reachable across detail anchor positions', async ({ page }) => {
    test.setTimeout(120000)
    for (const width of [480, 800]) for (const anchor of ['left', 'right'] as const) {
      await page.setViewportSize({ width, height: 600 })
      const record = resizeBoundaryShow(`cancel-${width}-${anchor}-${Date.now().toString(36)}`)
      if (anchor === 'right') {
        record.composition!.scenes[0].zones[0].main[1].startMs = 8000
        record.composition!.scenes[0].zones[0].main[1].durationMs = 12000
      }
      await seedConvertedShowV2(page, record, `baseline FC957 ${width} ${anchor}`)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const [{ usePatternStore }, { useLibraryStore }, { useMapStore }, { useEntityOrganizationStore }] = await Promise.all([load('/PXLBLZ-IDE/src/store/patternStore.ts'), load('/PXLBLZ-IDE/src/store/libraryStore.ts'), load('/PXLBLZ-IDE/src/store/mapStore.ts'), load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')])
        return usePatternStore.getState().patternsLoaded && useLibraryStore.getState().librariesLoaded && useMapStore.getState().mapsLoaded && useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      const before = await visibleRecord(page)
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
      await page.getByRole('button', { name: 'Agent menu' }).focus()
      await page.keyboard.press('Escape')
      await page.locator(`[data-show-selection-key="clip:${anchor === 'left' ? 'resize-a' : 'resize-b'}"]`).click()
      const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
      await duration.fill('3')
      await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for you to finish')
      await page.getByRole('button', { name: /Open the Agent drawer/ }).hover()
      const cancel = page.getByTestId('agent-chat-cancel')
      await expect(cancel).toBeVisible()
      await cancel.click({ trial: true })
      const panel = (await page.getByRole('dialog', { name: 'Entity Detail Panel' }).boundingBox())!
      const control = (await cancel.boundingBox())!
      await cancel.click()
      await expect(duration).toBeFocused()
      await expect(duration).toHaveValue('3')
      expect((await waitForDone(page, id)).applied).toBe(false)
      expect(await visibleRecord(page)).toEqual(before)
      expect(await durableShow(page, record.id)).toEqual(durableBefore)
      expect(writes).toHaveLength(0)
      saveRecord(`FC957-${width}-${anchor}`, { panel, control, cancelledWithoutWrite: true, focusAndDraftPreserved: true })
      await page.screenshot({ path: join(REPORT_DIR, `FC957-${width}-${anchor}.png`), fullPage: false, animations: 'disabled' })
    }
  })

  test('GA: real timeline gestures wait and settle after cancellation or manual adoption', async ({ page }) => {
    test.setTimeout(150000)
    const pageErrors: string[] = []
    page.on('pageerror', error => { pageErrors.push(error.stack ?? error.message); saveRecord('GA-page-errors', pageErrors) })
    for (const action of ['resize-cancel', 'resize-commit', 'end-commit'] as const) {
      await page.setViewportSize({ width: action === 'end-commit' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`gesture-${action}-${Date.now().toString(36)}`)
      await seedConvertedShowV2(page, record, `baseline GA ${action}`)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const [p, l, m, o] = await Promise.all(['pattern', 'library', 'map', 'entityOrganization'].map(name => load(`/PXLBLZ-IDE/src/store/${name}Store.ts`)))
        return p.usePatternStore.getState().patternsLoaded && l.useLibraryStore.getState().librariesLoaded && m.useMapStore.getState().mapsLoaded && o.useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      const before = await visibleRecord(page)
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      page.on('response', response => {
        if (response.url().includes('/utterance')) void response.text().then(body => saveRecord(`GA-${action}-candidate`, { request: response.request().postDataJSON(), body })).catch(() => {})
      })
      const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
      if (action === 'end-commit') {
        await page.getByRole('button', { name: 'Agent menu', exact: true }).focus()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('complementary', { name: 'Agent drawer' })).toBeHidden()
      }
      const handle = action === 'end-commit'
        ? page.getByRole('button', { name: 'Show End at 20 seconds' })
        : page.getByRole('separator', { name: 'Resize CometLoom end' }).first()
      await handle.scrollIntoViewIfNeeded()
      await handle.hover()
      const bounds = (await handle.boundingBox())!
      const clip = (await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().boundingBox())!
      const surface = (await page.getByLabel('Timeline Markers and Show End', { exact: true }).boundingBox())!
      const x = bounds.x + bounds.width / 2
      const y = bounds.y + bounds.height / 2
      await page.keyboard.down('Alt')
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(action === 'end-commit' ? x - surface.width / 10 : x + clip.width * 3 / 4, y, { steps: 3 })
      try { await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for you to finish') }
      catch (error) {
        saveRecord(`GA-${action}-refusal`, { request: await overlayRequest(page, id), visible: await visibleRecord(page), durable: await durableShow(page, record.id) })
        throw error
      }
      expect(await visibleRecord(page)).toEqual(before)
      expect(await durableShow(page, record.id)).toEqual(durableBefore)
      expect(writes).toHaveLength(0)
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      await page.screenshot({ path: join(REPORT_DIR, `GA-${action}-waiting.png`), fullPage: true })
      if (action === 'resize-cancel') await handle.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true })
      await page.mouse.up()
      await page.keyboard.up('Alt')
      const done = await waitForDone(page, id)
      expect(done.applied).toBe(action === 'resize-cancel')
      await expect.poll(() => writes.filter(write => write.method === 'PUT' && write.status === 200).length).toBe(1)
      const current = await visibleRecord(page)
      let expected = structuredClone(before!)
      if (action === 'end-commit') {
        // Show End is composition.showEndMs on a version-2 record, and the
        // retained final Layout interval is truncated to it where v1 shortened
        // the Scene (src/engine/showCommandsV2/show.ts set_show_end;
        // src/engine/showV2ShowLevelPlanning.ts planShowV2SetShowEnd).
        const v2Expected = expected as unknown as ShowRecordV2
        v2Expected.composition.showEndMs = 18000
        v2Expected.composition.layoutOccurrences.at(-1)!.durationMs = 18000 - v2Expected.composition.layoutOccurrences.at(-1)!.startMs
      } else expected = withClipDuration(before, firstMain(before)!.id, action === 'resize-cancel' ? 8000 : 7000)
      expect(current).toEqual({ ...expected, updatedAt: current!.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(current)
      expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
      await page.getByRole('button', { name: 'Show actions' }).click()
      const download = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await download
      const reopened = await reopenExport(page, (await file.path())!)
      expect(reopened.show).toEqual(current)
      await page.screenshot({ path: join(REPORT_DIR, `GA-${action}-saved.png`), fullPage: true })
      await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      expect(pageErrors).toEqual([])
      saveRecord(`GA-${action}`, { actualGesture: true, before, durableBefore, done, current, reopened: reopened.show, writes, pageErrors })
    }
  })

  test('R: canonical exact resize accepts the boundary, preserves no-op, and refuses excess', async ({ page }) => {
    test.setTimeout(90000)
    const record = resizeBoundaryShow(`resize-r-${Date.now().toString(36)}`)
    await seedConvertedShowV2(page, record, 'baseline R')
    const writes = watchShowWrites(page)
    const saves = () => writes.filter(write => write.method === 'PUT')
    await page.goto(`studio/shows/${record.id}?agent=1`)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    await expect.poll(() => page.evaluate(async () => {
      const load = (path: string) => import(path)
      const { useEntityOrganizationStore } = await load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')
      return useEntityOrganizationStore.getState().loaded.libraries
    })).toBe(true)
    await injectOverlay(page, bridge.url)
    const before = await visibleRecord(page)
    // Pair real manual entry points with the scripted canonical operation. The
    // drag aims at 12 s; the free trailing edge stops at the unconnected
    // `resize-b` start, 8000 ms, exactly as v1 bounds it (#1099).
    const handle = page.getByRole('separator', { name: 'Resize CometLoom end' }).first()
    const lane = page.locator('[data-show-layer-kind="main"]').first()
    const rect = (await lane.boundingBox())!
    const edge = (await handle.boundingBox())!
    await page.keyboard.down('Alt')
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
    await page.mouse.down()
    await page.mouse.move(edge.x + edge.width / 2 + rect.width * 0.4, edge.y + edge.height / 2)
    expect(await visibleRecord(page)).toEqual(before)
    expect(saves()).toHaveLength(0)
    await page.screenshot({ path: join(REPORT_DIR, 'R-manual-preview.png'), fullPage: true })
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 8000)
    const pointerAfter = await visibleRecord(page)
    expect(pointerAfter).toEqual({ ...withClipDuration(before, 'resize-a', 8000), updatedAt: pointerAfter!.updatedAt })
    expect(saves()).toHaveLength(1)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 4000)
    expect(await visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
    await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
    const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
    await duration.fill('7.999')
    await duration.press('Enter')
    await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 7999)
    const inspectorAfter = await visibleRecord(page)
    await page.screenshot({ path: join(REPORT_DIR, 'R-manual-inspector.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 4000)
    expect(await visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    page.on('response', response => {
      if (response.url().includes('/utterance')) void response.text().then(body => saveRecord('R-transport', { body })).catch(() => {})
    })
    const accepted = await waitForDone(page, await submitUtterance(page, 'make the first Clip exactly eight seconds'))
    saveRecord('R-admission', { before, accepted, current: await visibleRecord(page), observations: await readObservations(page) })
    expect(accepted.applied, JSON.stringify(accepted)).toBe(true)
    await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 8000)
    const after = await visibleRecord(page)
    expect(after).toEqual({ ...withClipDuration(before, 'resize-a', 8000), updatedAt: after!.updatedAt })
    const durable = await durableShow(page, record.id)
    expect(durable).toEqual(after)
    expect(pointerAfter).toEqual({ ...after, updatedAt: pointerAfter!.updatedAt })
    expect(inspectorAfter).toEqual({ ...withClipDuration(after, 'resize-a', 7999), updatedAt: inspectorAfter!.updatedAt })
    await page.getByRole('button', { name: 'Show actions' }).click()
    const downloadPending = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
    const downloaded = await downloadPending
    const reopened = await reopenExport(page, (await downloaded.path())!)
    expect(reopened.show).toEqual(after)
    await page.screenshot({ path: join(REPORT_DIR, 'R-exact-boundary.png'), fullPage: true })
    const noop = await waitForDone(page, await submitUtterance(page, 'make the first Clip exactly eight seconds'))
    expect(noop.changed).toBe(false)
    expect(await visibleRecord(page)).toEqual(after)
    expect(await durableShow(page, record.id)).toEqual(durable)
    const refused = await waitForDone(page, await submitUtterance(page, 'try twelve seconds with the next Clip at eight'))
    expect(refused.changed).toBe(false)
    const refusedTools = (refused.bridgeTiming as { toolCalls: Array<{ name: string; isError?: boolean; issue?: string }> }).toolCalls
    // An unconnected neighbour refuses the overlapping v2 resize: no Transition
    // ripples it (src/engine/showCompositionV2.ts:497).
    expect(refusedTools.find(tool => tool.name === 'resize_clip')).toMatchObject({ isError: true })
    await expect(page.getByText('The requested twelve seconds do not fit. Available range: 0–8000 ms.', { exact: false })).toBeVisible()
    expect(await visibleRecord(page)).toEqual(after)
    expect(await durableShow(page, record.id)).toEqual(durable)
    expect(saves()).toHaveLength(5)
    await page.screenshot({ path: join(REPORT_DIR, 'R-noop-refused.png'), fullPage: true })
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    expect(await visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    expect(await visibleRecord(page)).toEqual({ ...after, updatedAt: expect.any(Number) })
    saveRecord('R-exact-resize', { before, pointerAfter, inspectorAfter, reopened, after, durable, accepted, noop, refused, writes, observations: await readObservations(page) })
  })

  test('MR: mixed move-resize batches preserve complete records through adoption and active input', async ({ page }) => {
    test.setTimeout(180000)
    const utterance = 'move the second Clip to sixteen seconds then make the first Clip twelve seconds'
    for (const action of ['apply', 'refuse', 'incomplete', 'draft-cancel', 'manual-commit', 'pending-conflict'] as const) {
      await page.setViewportSize({ width: action === 'draft-cancel' || action === 'refuse' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`mixed-${action}-${Date.now().toString(36)}`)
      record.composition!.scenes[0].zones[0].main[1].durationMs = 4000
      await seedConvertedShowV2(page, record, `baseline MR ${action}`)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        // Startup may reload metadata after creating workspace starters. The
        // final organization load follows that reload; simple loaded flags do not.
        const { useEntityOrganizationStore } = await load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')
        return useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      const before = await visibleRecord(page)
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      const { completeWrites, captureWrite } = captureCompleteWrites(record.id)
      page.on('request', captureWrite)
      const id = await submitUtterance(page, action === 'refuse'
        ? 'move the second Clip to sixteen seconds then try seventeen seconds for the first'
        : action === 'incomplete' ? 'move the second Clip to sixteen seconds but leave the batch incomplete' : utterance)
      const dirty = action === 'draft-cancel' || action === 'manual-commit'
      if (dirty || action === 'pending-conflict') {
        await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
        const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
        await duration.fill('7')
        if (dirty) {
          await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for you to finish')
          await expect(duration).toBeFocused()
          expect(await visibleRecord(page)).toEqual(before)
          expect(await durableShow(page, record.id)).toEqual(durableBefore)
          expect(completeWrites).toEqual([])
          await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
          await page.screenshot({ path: join(REPORT_DIR, `MR-${action}-waiting.png`), fullPage: true })
        } else {
          expect((await overlayRequests(page)).find(request => request.requestId === id)?.doneAt).toBeNull()
        }
        await duration.press(action === 'draft-cancel' ? 'Escape' : 'Enter')
      }
      const done = await waitForDone(page, id)
      const applied = action === 'apply' || action === 'draft-cancel'
      const manual = action === 'manual-commit' || action === 'pending-conflict'
      if (action === 'refuse' || action === 'incomplete') {
        expect(done).toMatchObject({ changed: false, applied: null, outcome: { status: 'completed', completion: action === 'refuse' ? 'refused' : 'incomplete' } })
      } else expect(done.applied, JSON.stringify(done)).toBe(applied)
      const tools = (done.bridgeTiming as { toolCalls: Array<{ name: string; isError?: boolean }> }).toolCalls
      // The v2 move is an update_clips placement patch (src/engine/showCommandsV2/clips.ts:86-145).
      expect(tools.filter(tool => tool.name !== 'describe_show' && tool.name !== 'read_show').map(tool => tool.name)).toEqual(action === 'incomplete' ? ['update_clips'] : ['update_clips', 'resize_clip'])
      expect(tools.find(tool => tool.name === 'update_clips')?.isError).not.toBe(true)
      // Resizing the first Clip to 17 s overlaps the moved, unconnected second
      // Clip at 16 s: no Transition ripples it (clips.ts:258-281), and the v2
      // invariant refuses the overlap (src/engine/showCompositionV2.ts:497).
      if (action === 'refuse') expect(tools.find(tool => tool.name === 'resize_clip')).toMatchObject({ isError: true })
      let expected = before
      if (applied) {
        expected = withClipMovedTo(withClipDuration(before, 'resize-a', 12000), 'resize-b', 16000)
      } else if (manual) expected = withClipDuration(before, 'resize-a', 7000)
      if (applied || manual) await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === (applied ? 12000 : 7000))
      const after = await visibleRecord(page)
      expect(after).toEqual({ ...expected, updatedAt: applied || manual ? after!.updatedAt : before!.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(applied || manual ? after : durableBefore)
      expect(completeWrites).toEqual(applied || manual ? [after] : [])
      await page.keyboard.press('Escape')
      if (applied) {
        await page.getByRole('button', { name: 'Show actions' }).click()
        const download = page.waitForEvent('download')
        await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
        const file = await download
        const reopened = await reopenExport(page, (await file.path())!)
        expect(reopened.show).toEqual(after)
        saveRecord(`MR-${action}-export`, reopened)
      }
      await page.screenshot({ path: join(REPORT_DIR, `MR-${action}-result.png`), fullPage: true })
      if (applied || manual) {
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 4000)
        const undone = await visibleRecord(page)
        expect(undone).toEqual({ ...before, updatedAt: undone!.updatedAt })
        expect(await durableShow(page, record.id)).toEqual(undone)
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
        await page.getByRole('button', { name: 'Redo Show edit' }).click()
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === (applied ? 12000 : 7000))
        const redone = await visibleRecord(page)
        expect(redone).toEqual({ ...after, updatedAt: redone!.updatedAt })
        expect(await durableShow(page, record.id)).toEqual(redone)
        await expect(page.getByRole('button', { name: 'Redo Show edit' })).toBeDisabled()
        expect(completeWrites).toEqual([after, undone, redone])
      } else {
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Redo Show edit' })).toBeDisabled()
      }
      saveRecord(`MR-${action}`, { before, after, done, completeWrites, writes, durable: await durableShow(page, record.id), observations: await readObservations(page) })
      page.off('request', captureWrite)
    }
  })

  test('F: a multi-operation reply lands as one history entry and one save', async ({ page }) => {
    test.setTimeout(90_000)
    const showId = await createPersonalShowV2(page)
    // Measure a plain Clip batch. A trailing resize ripples its connected
    // component through the default crossfade instead of refusing
    // (src/engine/showCommandsV2/clips.ts resize_clip), so fixture setup
    // clears Transitions; setup is outside the measured request.
    const seeded = (await durableShow(page, showId)) as unknown as ShowRecordV2
    const cleared = await page.context().request.put(`/api/shows/${showId}?show-version=2`, {
      data: { ...seeded, composition: { ...seeded.composition, transitions: [] } },
    })
    expect(cleared.ok(), await cleared.text()).toBe(true)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    const writes = watchShowWrites(page)
    await injectOverlay(page, bridge.url)

    const before = await visibleRecord(page)
    const measuredFrom = Date.now()
    const requestId = await submitUtterance(page, BATCH_UTTERANCE)
    const request = await waitForDone(page, requestId)
    expect(request.applied).toBe(true)
    const visible = await visibleClipFacts(page, 'TestPattern1D')
    expect(visible).toEqual({ durationSeconds: '12', brightnessPercent: '50' })
    await waitForDurable(page, showId, (show) => firstMain(show)?.durationMs === 12_000 && firstMain(show)?.brightness === 0.5)
    const saves = writes.filter((write) => write.method === 'PUT')
    expect(saves).toHaveLength(1)
    expect(saves[0].firstMain).toEqual({ durationMs: 12_000, brightness: 0.5 })

    const after = await visibleRecord(page)
    expect(await durableShow(page, showId)).toEqual(after)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    expect(await visibleClipFacts(page, 'TestPattern1D')).toEqual({ durationSeconds: '30', brightnessPercent: '100' })
    expect(await visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    expect(await visibleClipFacts(page, 'TestPattern1D')).toEqual({ durationSeconds: '12', brightnessPercent: '50' })

    const observations = await readObservations(page)
    const tools = ((request.bridgeTiming ?? {}) as { toolCalls?: Array<{ name: string }> }).toolCalls?.map((call) => call.name)
    // The scripted agent re-reads the Show before each placeholder; the
    // mutating calls are the two operations of the one committed turn. The
    // dimming is an update_clips held-appearance patch on v2
    // (src/engine/showCommandsV2/clips.ts update_clips).
    expect(tools?.filter((name) => name !== 'describe_show')).toEqual(['resize_clip', 'update_clips'])
    await page.screenshot({ path: join(REPORT_DIR, 'F-batch.png'), fullPage: true })
    saveRecord('F-batch', { showId, before, after, measuredFrom, topology: 'plain Clips with no Transition; setup excluded', request, writes, observations, visible, timeline: phaseTimeline(request, observations, writes) })
  })

  test('G: a built-in Show draft accepts a reply in memory with no personal write', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time?agent=1')
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    await injectOverlay(page, bridge.url)
    const reset = page.getByRole('button', { name: 'Reset built-in Show' })
    await expect(reset).toBeDisabled()

    const requestId = await submitUtterance(page, MARKER_UTTERANCE)
    const request = await waitForDone(page, requestId)
    expect(request.changed).toBe(true)
    expect(request.applied).toBe(true)
    await expect(reset).toBeEnabled()
    expect(await undoEnabled(page)).toBe(true)
    const visible = await visibleRecord(page)
    expect(visible?.composition?.markers?.some((marker) => marker.name === 'Drop' && marker.timeMs === 10_000)).toBe(true)
    expect(writes).toEqual([])
    const observations = await readObservations(page)
    expect(observations.filter((entry) => entry.kind === 'agent-apply' && entry.requestId === requestId).map((entry) => entry.phase))
      .toEqual(['admitted', 'adopted', 'settled'])
    await page.screenshot({ path: join(REPORT_DIR, 'G-stock-draft.png'), fullPage: true })
    saveRecord('G-stock-draft', { request, writes, observations, markers: visible?.composition?.markers, timeline: phaseTimeline(request, observations, writes) })
  })

  test('H: a personal Show on a personal Pattern that calls a personal Library takes the reply', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    const api = page.context().request
    const library = await api.post('/api/libraries', { data: BASELINE_LIBRARY })
    expect(library.status(), await library.text()).toBe(201)
    const pattern = await api.post('/api/patterns', { data: BASELINE_LIBRARY_PATTERN })
    expect(pattern.status(), await pattern.text()).toBe(201)
    const record = personalLibraryPatternShow(`baseline-library-${Date.now().toString(36)}`)
    // Convert the fixture through the app's own converter
    // (src/agent-harness/baseline/fixturesV2.ts convertBaselineRecord) and
    // post the v2 result through the product's own create call. The converter
    // runs inside the page for the same loader reason createPersonalShowV2
    // names; the personal Pattern source travels in as an argument.
    await page.goto('studio/shows')
    const converted = (await page.evaluate(async (input) => {
      const load = (path: string) => import(path)
      const { convertBaselineRecord } = await load('/PXLBLZ-IDE/src/agent-harness/baseline/fixturesV2.ts')
      return convertBaselineRecord(input.source, 'baseline H personal library', input.patterns)
    }, { source: record, patterns: [BASELINE_LIBRARY_PATTERN] })) as ShowRecordV2
    const created = await api.post('/api/shows?show-version=2', { data: converted })
    expect(created.status(), await created.text()).toBe(201)
    const writes = watchShowWrites(page)

    await page.goto(`studio/shows/${record.id}?agent=1`)
    // H tests an already-loaded source context; hydration during inference is
    // separately a conservative invalidation, not a stable-source acceptance.
    await expect.poll(() => page.evaluate(async () => {
      const load = (path: string) => import(path)
      const [{ usePatternStore }, { useLibraryStore }, { useMapStore }] = await Promise.all([
        load('/PXLBLZ-IDE/src/store/patternStore.ts'), load('/PXLBLZ-IDE/src/store/libraryStore.ts'), load('/PXLBLZ-IDE/src/store/mapStore.ts'),
      ])
      return usePatternStore.getState().patternsLoaded && useLibraryStore.getState().librariesLoaded && useMapStore.getState().mapsLoaded
    })).toBe(true)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    await injectOverlay(page, bridge.url)
    const sent = page.waitForRequest(request => request.url() === `${bridge.url}/utterance` && request.method() === 'POST')
    const before = await visibleRecord(page) as unknown as ShowRecordV2
    // A v2-open editor holds the v2 record, composition included
    // (src/agent/editorAdmission.ts getShow).
    expect(before.composition).toBeDefined()
    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    const sentBody = (await sent).postDataJSON() as { show: ShowRecordV2 }
    const request = await waitForDone(page, requestId)
    expect(sentBody.show.composition).toBeDefined()
    expect(request.applied, JSON.stringify(request)).toBe(true)
    const visible = await visibleClipFacts(page, BASELINE_LIBRARY_PATTERN.name)
    expect(visible.durationSeconds).toBe('12')
    await waitForDurable(page, record.id, (show) => firstMain(show)?.durationMs === 12_000)
    const current = await visibleRecord(page) as unknown as ShowRecordV2
    const expected = structuredClone(sentBody.show)
    // The resize lands on the same rank-0 first main the readers use. The
    // converted record carries no Transition, so nothing ripples
    // (src/engine/showCommandsV2/clips.ts resize_clip).
    expected.composition.clips.find((clip) => clip.id === firstMain(expected as unknown as PersistedShow)?.id)!.durationMs = 12_000
    expect(current).toEqual({ ...expected, updatedAt: current.updatedAt })
    expect(await durableShow(page, record.id)).toEqual(current)
    expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Show actions' }).click()
    const downloaded = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
    const file = await downloaded
    const reopened = await page.evaluate(async bytes => {
      const load = (path: string) => import(path)
      const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
      // H exports a version-2 bundle, so opt in like the product import
      // (src/components/PatternList.tsx:304-306); the Show record stays in
      // `show` on a version-2 bundle (src/engine/showFileBundle.ts:37).
      return parseShowFileBundle(new Uint8Array(bytes), { acceptV2: true })
    }, [...readFileSync((await file.path())!)])
    expect(reopened.show).toEqual(current)
    await expect.poll(async () => phaseTimeline(request, await readObservations(page), writes).adoptedToPreviewPublishedMs).not.toBeNull()
    await expect(page.getByTestId('show-stage-preview')).not.toContainText('Unknown library namespace')
    const observations = await readObservations(page)
    const previewText = await page.getByTestId('show-stage-preview').textContent()
    await page.screenshot({ path: join(REPORT_DIR, 'H-personal-library.png'), fullPage: true })
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
    expect(pageErrors).toEqual([])
    saveRecord('H-personal-library', {
      showId: record.id, before, current, reopened: reopened.show, pageErrors, sentShow: sentBody.show, request, writes, observations, visible,
      previewPublished: observations.some((entry) => entry.kind === 'preview-published'),
      previewText,
      timeline: phaseTimeline(request, observations, writes),
    })
  })

  test('DA: placement and native Effect activity preserve complete editor records', async ({ page }) => {
    test.setTimeout(180000)
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    for (const action of ['placement-cancel', 'placement-commit', 'effect-cancel', 'effect-commit'] as const) {
      await page.setViewportSize({ width: action === 'effect-commit' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`detail-${action}-${Date.now().toString(36)}`)
      record.stageMapId = 'plane'
      record.composition!.scenes[0].zones[0].main[0].effects = [
        { id: 'move', kind: 'translate', x: 0.2, y: 0 },
        { id: 'turn', kind: 'rotate', turns: 0.1 },
      ]
      await seedConvertedShowV2(page, record, `baseline DA ${action}`)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const [p, l, m] = await Promise.all(['pattern', 'library', 'map'].map(name => load(`/PXLBLZ-IDE/src/store/${name}Store.ts`)))
        return p.usePatternStore.getState().patternsLoaded && l.useLibraryStore.getState().librariesLoaded && m.useMapStore.getState().mapsLoaded
      })).toBe(true)
      await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
      const detail = page.getByRole('dialog', { name: 'Entity Detail Panel' })
      await detail.getByRole('tab', { name: action.startsWith('placement') ? /^Place/ : /^Effects/ }).click({ timeout: 15000 })
      await injectOverlay(page, bridge.url)
      const before = await visibleRecord(page) as unknown as ShowRecordV2
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
      await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
      await detail.getByRole('tab', { name: action.startsWith('placement') ? /^Place/ : /^Effects/ }).click({ timeout: 15000 })
      const placement = action.startsWith('placement')
      const target = placement ? detail.getByLabel('Move content', { exact: true })
        : detail.getByRole('button', { name: 'Drag Translate Effect to reorder' })
      const transfer = await page.evaluateHandle(() => new DataTransfer())
      if (placement) {
        const box = (await target.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 3 })
      } else await target.dispatchEvent('dragstart', { dataTransfer: transfer })
      await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for you to finish')
      expect(await visibleRecord(page)).toEqual(before)
      expect(await durableShow(page, record.id)).toEqual(durableBefore)
      expect(writes).toHaveLength(0)
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      await page.screenshot({ path: join(REPORT_DIR, `DA-${action}-waiting.png`), fullPage: true })
      if (placement) {
        if (action === 'placement-cancel') await target.dispatchEvent('lostpointercapture', { pointerId: 1, bubbles: true })
        await page.mouse.up()
      } else {
        if (action === 'effect-commit') await detail.getByTestId('show-effect-turn').dispatchEvent('drop', { dataTransfer: transfer, clientY: 10000 })
        await target.dispatchEvent('dragend', { dataTransfer: transfer })
      }
      await transfer.dispose()
      const done = await waitForDone(page, id)
      expect(done.applied).toBe(action.endsWith('cancel'))
      await expect.poll(() => writes.filter(write => write.method === 'PUT' && write.status === 200).length).toBe(1)
      const current = await visibleRecord(page) as unknown as ShowRecordV2
      const expected = structuredClone(before)
      // A version-2 Clip holds its transform and Effects on its held
      // appearance key (src/engine/showCompositionV2.ts ShowClipAppearanceValueV2).
      const firstId = firstMain(before as unknown as PersistedShow)!.id
      const expectedClip = expected.composition.clips.find(clip => clip.id === firstId)!
      const expectedHeld = expectedClip.appearance.keys[0].value
      if (action.endsWith('cancel')) expectedClip.durationMs = 8000
      else if (placement) {
        const transform = current.composition.clips.find(clip => clip.id === firstId)!.appearance.keys[0].value.transform!
        expect(transform.positionX).toBeGreaterThan(0)
        expectedHeld.transform = transform
      } else expectedHeld.effects = [expectedHeld.effects![1], expectedHeld.effects![0]]
      expect(current).toEqual({ ...expected, updatedAt: current.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(current)
      expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
      await page.screenshot({ path: join(REPORT_DIR, `DA-${action}-saved.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Show actions' }).click({ timeout: 15000 })
      const downloaded = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await downloaded
      const reopened = await reopenExport(page, (await file.path())!)
      expect(reopened.show).toEqual(current)
      await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      expect(pageErrors).toEqual([])
      saveRecord(`DA-${action}`, { before, durableBefore, done, current, reopened: reopened.show, writes, pageErrors })
    }
  })
  test('SA: retained physical-zone drafts and clean source updates preserve editor records', async ({ page }) => {
    test.setTimeout(180000)
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    for (const action of ['clean', 'cancel', 'save', 'clear-cancel'] as const) {
      await page.setViewportSize({ width: action === 'clear-cancel' ? 720 : 1440, height: 900 })
      const record = resizeBoundaryShow(`spatial-${action}-${Date.now().toString(36)}`)
      const mapId = `${record.id}-map`
      expect((await page.context().request.post('/api/maps', { data: {
        id: mapId, name: 'Spatial four', dim: 2, generator: 'custom', params: {},
        points: [[0, 0], [0.3, 0.3], [0.7, 0.7], [1, 1]], updatedAt: Date.now(),
      } })).ok()).toBe(true)
      record.stageMapId = mapId
      record.outputContract = { version: 1, kind: 'installation', outputMapId: mapId, pixelCount: 4, resolution: 'fixed' }
      record.zones[0].nominalPixelCount = 4
      record.zones.push({ id: 'z2', name: 'Accent', nominalPixelCount: 4 })
      record.routingLayouts = [{ id: 'l1', name: 'Physical', zones: [
        { zoneId: 'z1', ranges: [{ start: 0, end: 1 }] },
        { zoneId: 'z2', ranges: [action === 'clean' ? { start: 0, end: 4 } : { start: 3, end: 3 }] },
      ] }]
      await seedConvertedShowV2(page, record, `baseline SA ${action}`)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const [p, l, m] = await Promise.all(['pattern', 'library', 'map'].map(name => load(`/PXLBLZ-IDE/src/store/${name}Store.ts`)))
        return p.usePatternStore.getState().patternsLoaded && l.useLibraryStore.getState().librariesLoaded && m.useMapStore.getState().mapsLoaded
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      if (action === 'clear-cancel') {
        // At 720 px the v2 editor's open Agent drawer covers the Zone rail
        // toggle, so tuck it the way GA and FC957 do before reaching the Zone.
        await page.getByRole('button', { name: 'Agent menu', exact: true }).focus()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('complementary', { name: 'Agent drawer' })).toBeHidden()
      }
      const open = page.getByRole('button', { name: 'Open Zones', exact: true })
      if (await open.count()) await open.click()
      await page.getByRole('button', { name: 'Open zone Main properties' }).click()
      await page.getByRole('button', { name: 'Select Main LEDs on output map' }).click()
      const surface = page.getByRole('img', { name: 'Select LEDs for zone Main' })
      await expect(surface).toBeVisible()
      const before = await visibleRecord(page) as unknown as ShowRecordV2
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      let done: unknown
      if (action === 'clean') {
        // The current scripted grammar has no physical-range operation. This
        // case uses the existing diagnostic adapter with a complete candidate.
        await surface.focus()
        done = await page.evaluate(() => {
          const editor = (window as unknown as { __pxlblzEditor: {
            beginRequest: (id: string, utterance: string, history: unknown[]) => { show: ShowRecordV2; request: unknown }
            applyShow: (show: ShowRecordV2, request: unknown) => unknown
          } }).__pxlblzEditor
          const captured = editor.beginRequest('clean-spatial', 'Change physical indexes', [])
          const candidate = structuredClone(captured.show)
          // A version-2 record keeps physical ranges in zoneLayouts
          // (src/engine/showCompositionV2.ts ShowRecordV2).
          candidate.zoneLayouts[0].zones[0].ranges = [{ start: 1, end: 2 }]
          return editor.applyShow(candidate, captured.request)
        })
        expect(done).toMatchObject({ status: 'applied' })
        await expect(page.getByText('Indexes 1-2', { exact: true })).toBeVisible()
        await expect.poll(() => writes.filter(write => write.status === 200).length).toBe(1)
        await page.screenshot({ path: join(REPORT_DIR, 'SA-clean-open.png'), fullPage: true })
        await page.getByRole('button', { name: 'Save physical zone' }).click()
      } else {
        const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
        if (action === 'clear-cancel') await page.getByRole('button', { name: 'Clear', exact: true }).click()
        const box = (await surface.boundingBox())!
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
        if (action === 'clear-cancel') await surface.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true })
        await page.mouse.up()
        await expect(page.getByText(action === 'clear-cancel' ? 'Indexes none' : 'Indexes 1', { exact: true })).toBeVisible()
        await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for you to finish')
        expect(await visibleRecord(page)).toEqual(before)
        expect(await durableShow(page, record.id)).toEqual(durableBefore)
        expect(writes).toHaveLength(0)
        await page.screenshot({ path: join(REPORT_DIR, `SA-${action}-waiting.png`), fullPage: true })
        await page.getByRole('button', { name: action === 'save' ? 'Save physical zone' : 'Zone properties', exact: true }).click()
        done = await waitForDone(page, id)
        expect((done as OverlayRequest).applied).toBe(action !== 'save')
      }
      // v1 saved the clean-updated ranges again as a second write and history
      // entry; v2 plans a Save of unchanged ranges as a no-op
      // (src/engine/showV2ZonePlanning.ts:153), so the candidate is the one write.
      const writeCount = 1
      await expect.poll(() => writes.filter(write => write.method === 'PUT' && write.status === 200).length).toBe(writeCount)
      const current = await visibleRecord(page) as unknown as ShowRecordV2
      let expected = structuredClone(before)
      if (action === 'clean') expected.zoneLayouts[0].zones[0].ranges = [{ start: 1, end: 2 }]
      else if (action === 'save') expected.zoneLayouts[0].zones[0].ranges = [{ start: 1, end: 1 }]
      else expected = withClipDuration(before as unknown as PersistedShow, firstMain(before as unknown as PersistedShow)!.id, 8000) as unknown as ShowRecordV2
      expect(current).toEqual({ ...expected, updatedAt: current.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(current)
      expect(writes.filter(write => write.method === 'PUT')).toHaveLength(writeCount)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Show actions' }).click()
      const delivery = page.getByRole('menuitem', { name: 'Download .epe', exact: true })
      await expect(delivery).toBeDisabled()
      const downloaded = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await downloaded
      const reopened = await reopenExport(page, (await file.path())!)
      expect(reopened.show).toEqual(current)
      await page.screenshot({ path: join(REPORT_DIR, `SA-${action}-saved.png`), fullPage: true })
      await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      expect(pageErrors).toEqual([])
      saveRecord(`SA-${action}`, { boundary: action === 'clean' ? 'direct diagnostic adapter' : 'scripted bridge', before, durableBefore, done, current, reopened: reopened.show, writes, pageErrors })
    }
  })

  const admissionShow954 = () => {
    const record = showOutputLayoutFixture()
    record.id = `show-layout-954-${Date.now().toString(36)}`
    return record
  }
  // UI954 needs a Zone Layout two intervals share: the v2 owner leaves an
  // interval whose definition is used once unchanged
  // (src/engine/showCommandsV2/layouts.ts:107). A routing cut after scene-1
  // converts into a second `layout-1` interval, `layout-occurrence:2`.
  const sharedLayoutShow954 = () => {
    const record = admissionShow954()
    record.transitions.push({ id: 'routing-scene-1', afterSceneId: 'scene-1', kind: 'routing', durationMs: 0, easing: { curve: 'linear' }, layoutId: 'layout-1' })
    return record
  }
  const admissionCases: Array<{
    id: string
    command: string
    args: Record<string, unknown>
    utterance: string
    fixture: () => ShowRecord
    expectedFacts: (before: ShowRecordV2) => ShowRecordV2
    unchangedUtterances?: string[]
    staleCommand?: { command: string; args: Record<string, unknown> }
    toolbarSplit?: { atMs: number; clipId: string | null; accepted: boolean }
    /** An edit of the converted v2 record before it is seeded. */
    editConverted?: (converted: ShowRecordV2) => void
    /** A known v2 defect (`defect: #<issue> …`); the loop registers the row as fixme until it is fixed. */
    pendingV2?: string
  }> = [
    // Effect rows write clip-ov's one held appearance key (`apply` whole-clip).
    // A new Effect's identity is the owner's `<clip>-<kind>` and a duplicate's
    // `<effect>-copy` (src/engine/showCommandsV2/effects.ts:105, 213), where v1
    // used `opacity` and `brightness-2`. No Property track targets the removed
    // brightness Effect, so RE953's Clip-owned track cascade removes nothing
    // (src/engine/showClipAppearanceEditsV2.ts:135).
    ...[
      { id: 'AE953', command: 'add_clip_effect', args: { clip_id: 'clip-ov', kind: 'opacity', parameters: { opacity: 0.6 }, apply: { scope: 'whole-clip' } }, utterance: 'add an opacity Effect to the overlay Clip' },
      { id: 'UE953', command: 'update_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'brightness', parameters: { brightness: 0.7 }, apply: { scope: 'whole-clip' } }, utterance: 'set the overlay brightness Effect to seven tenths' },
      { id: 'DE953', command: 'duplicate_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'brightness', apply: { scope: 'whole-clip' } }, utterance: 'duplicate the overlay brightness Effect' },
      { id: 'ME953', command: 'move_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'hue', target_effect_id: 'brightness', edge: 'before', apply: { scope: 'whole-clip' } }, utterance: 'move the overlay hue Effect before brightness' },
      { id: 'RE953', command: 'remove_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'brightness', apply: { scope: 'whole-clip' } }, utterance: 'remove the overlay brightness Effect' },
    ].map(row => ({
      ...row,
      fixture: () => {
        const record = showOverlayLayerFixture()
        record.id = `${row.id.toLowerCase()}-${Date.now().toString(36)}`
        record.composition!.scenes[0].zones[0].overlays[0].placements[0].effects = [
          { id: 'translate', kind: 'translate', x: 0.1, y: 0 },
          { id: 'brightness', kind: 'brightness', brightness: 0.4 },
          { id: 'hue', kind: 'hue', turns: 0.2 },
        ]
        return record
      },
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        const key = expected.composition.clips.find(clip => clip.id === 'clip-ov')!.appearance.keys[0]
        const effects = key.value.effects!
        if (row.id === 'AE953') effects.push({ id: 'clip-ov-opacity', kind: 'opacity', opacity: 0.6 })
        if (row.id === 'UE953') effects[1] = { id: 'brightness', kind: 'brightness', brightness: 0.7 }
        if (row.id === 'DE953') effects.splice(2, 0, { id: 'brightness-copy', kind: 'brightness', brightness: 0.4 })
        if (row.id === 'ME953') key.value.effects = [effects[0], effects[2], effects[1]]
        if (row.id === 'RE953') effects.splice(1, 1)
        return expected
      },
    })),
    // View is a whole-clip appearance patch on clip-ov's held key; controls,
    // time and evaluation are instance_properties on clip-a's shared instance-a
    // (src/engine/showInstancePropertiesV2.ts:110, 116-118). The control write
    // checks CometLoom's exported sliders through the editor's captured bundle
    // (src/engine/showInstancePropertiesV2.ts:92-105).
    ...[
      { id: 'V953', command: 'update_clips', args: { updates: [{ clip_id: 'clip-ov', appearance: { view: { mirror: true, phase: 0.25, brightness: 0.5 }, apply: { scope: 'whole-clip' } } }] }, utterance: 'dim and mirror the overlay Clip' },
      { id: 'C953', command: 'update_clips', args: { updates: [{ clip_id: 'clip-a', instance_properties: { controls: { sliderSpeed: 0.75 } } }] }, utterance: 'set the first Clip speed control to three quarters' },
      { id: 'T953', command: 'update_clips', args: { updates: [{ clip_id: 'clip-a', instance_properties: { time_scale: 0.5, time_offset_ms: 250 } }] }, utterance: 'slow the first Clip shared instance to half speed' },
      { id: 'E953', command: 'update_clips', args: { updates: [{ clip_id: 'clip-a', instance_properties: { evaluation: 'freeze-at-entry' } }] }, utterance: 'freeze the first Clip shared instance at entry' },
    ].map(row => ({
      ...row,
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `${row.id.toLowerCase()}-${Date.now().toString(36)}`; return record },
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        const composition = expected.composition
        const instance = composition.patternInstances.find(candidate => candidate.id === 'instance-a')!
        if (row.id === 'V953') composition.clips.find(clip => clip.id === 'clip-ov')!.appearance.keys[0].value.view = { mirror: true, phase: 0.25, brightness: 0.5 }
        if (row.id === 'C953') instance.controlTargets = { sliderSpeed: 0.75 }
        if (row.id === 'T953') instance.time = { timeScale: 0.5, timeOffsetMs: 250 }
        if (row.id === 'E953') instance.evaluationPolicy = 'freeze-at-entry'
        return expected
      },
    })),

    // APT953's constant track takes the owner's default activation, clip-a's
    // span 0–10 000 ms, with a key at each end and owner identities
    // (src/engine/showCommandsV2/animation.ts:135, 185, 201-203), where v1
    // spanned its Scene to 30 000 ms. AK953's key takes the owner's
    // `<track>-key-<at>-<n>` identity (src/engine/showCommandsV2/animation.ts:324).
    // The owner accepts APT953's track, but the bridge's delivery validation
    // refuses the commit: lowering places keys of the untouched track-b,
    // track-inst and track-inst-b outside compiled Scene 2.
    ...[
      {
        id: 'APT953', command: 'add_property_tracks', args: { tracks: [{ target: { kind: 'view-phase', clip_id: 'clip-a' }, initial_value: 0.3 }] }, utterance: 'seed a phase animation track at point three',
        pendingV2: 'defect: #1103 compiler limitation: instance tracks across a whole-output Transition; delivery validation refuses the add_property_tracks commit',
      },
      { id: 'AK953', command: 'edit_property_keyframes', args: { track_id: 'track-b', edits: { add: [{ at_ms: 15000, value: 0.5 }] } }, utterance: 'add a brightness keyframe at fifteen seconds' },
      { id: 'UK953', command: 'edit_property_keyframes', args: { track_id: 'track-b', edits: { update: [{ keyframe_id: 'kf-1', at_ms: 20000 }] } }, utterance: 'move the first brightness keyframe to twenty seconds' },
      { id: 'DK953', command: 'edit_property_keyframes', args: { track_id: 'track-b', edits: { remove: ['middle'] } }, utterance: 'delete the middle brightness keyframe' },
      { id: 'DPT953', command: 'remove_property_tracks', args: { track_ids: ['track-b'] }, utterance: 'remove the brightness animation track' },
    ].map(row => ({ ...row,
      fixture: () => {
        const show = showAnimationCommandFixture()
        show.id = `${row.id.toLowerCase()}-${Date.now().toString(36)}`
        if (row.id === 'DK953') show.composition!.scenes[0].propertyTracks![0].keyframes.splice(1, 0, { id: 'middle', timeMs: 15000, value: 0.5, easing: { curve: 'linear' } })
        return show
      },
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        const composition = expected.composition
        const track = composition.propertyTracks.find(track => track.id === 'track-b')!
        if (row.id === 'APT953') {
          composition.propertyTracks.push({
            id: 'track-view-phase', target: { kind: 'clip-view', clipId: 'clip-a', property: 'phase' }, activeStartMs: 0, activeDurationMs: 10000,
            keyframes: [{ id: 'track-view-phase-key-1', timeMs: 0, value: 0.3, easing: { curve: 'linear' } }, { id: 'track-view-phase-key-2', timeMs: 10000, value: 0.3, easing: { curve: 'linear' } }],
          })
        }
        if (row.id === 'AK953') track.keyframes.splice(1, 0, { id: 'track-b-key-15000-1', timeMs: 15000, value: 0.5, easing: { curve: 'linear' } })
        if (row.id === 'UK953') { const first = track.keyframes.shift()!; track.keyframes.push({ ...first, timeMs: 20000 }) }
        if (row.id === 'DK953') track.keyframes = track.keyframes.filter(key => key.id !== 'middle')
        if (row.id === 'DPT953') composition.propertyTracks = composition.propertyTracks.filter(track => track.id !== 'track-b')
        return expected
      },
    })),

    // Layer Transition rows run on the v2 Transition owner: the incoming Clip,
    // its held appearance key and its Clip and instance tracks ripple by the
    // duration delta, as in v1. A new Transition takes the owner's
    // `transition-<from>-<to>` identity and no crossfade policy
    // (src/engine/showCommandsV2/transitions.ts:69-83), where v1 wrote
    // transition-1 with snapshot-live.
    ...[
      {
        id: 'ILT952', command: 'insert_transition', args: { from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 1500, kind: 'crossfade', easing: 'ease-in' },
        utterance: 'insert a fifteen hundred millisecond Layer crossfade with ease in', overlay: false, attached: false, slug: 'insert', startMs: 11500, deltaMs: 1500,
      },
      {
        id: 'RLT952', command: 'resize_transition', args: { transition_id: 'connected-transition', duration_ms: 1500 },
        utterance: 'make the overlay Layer Transition fifteen hundred milliseconds', overlay: true, attached: true, slug: 'resize', startMs: 11500, deltaMs: 500,
      },
      {
        id: 'RLC952', command: 'remove_transition', args: { transition_id: 'connected-transition' },
        utterance: 'reset the Layer Transition to Cut', overlay: false, attached: true, slug: 'cut', startMs: 10000, deltaMs: -1000,
      },
    ].map(({ overlay, attached, slug, startMs, deltaMs, ...row }) => ({
      ...row,
      fixture: () => { const record = showLayerTransitionCommandFixture(overlay, attached); record.id = `layer-${slug}-952-${Date.now().toString(36)}`; return record },
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        const composition = expected.composition
        const clip = composition.clips.find(clip => clip.id === 'clip-b')!
        clip.startMs = startMs
        clip.appearance.keys[0].timeMs = startMs
        for (const track of composition.propertyTracks) if (['track-b', 'track-inst-b'].includes(track.id)) for (const key of track.keyframes) key.timeMs += deltaMs
        if (row.id === 'ILT952') {
          composition.transitions.push({
            id: 'transition-clip-a-clip-b', kind: 'crossfade', durationMs: 1500, easing: { curve: 'quadratic', direction: 'in' },
            participants: [{ id: 'transition-clip-a-clip-b-pair', zoneId: 'zone-1', layerId: 'layer:zone-1:main', fromClipId: 'clip-a', toClipId: 'clip-b' }],
            propertyRamps: [],
          })
        }
        if (row.id === 'RLT952') composition.transitions.find(transition => transition.id === 'connected-transition')!.durationMs = 1500
        if (row.id === 'RLC952') composition.transitions = composition.transitions.filter(transition => transition.id !== 'connected-transition')
        return expected
      },
    })),
    {
      id: 'CCR952', command: 'resize_clip', args: { clip_id: 'clip-b', duration_ms: 9000 },
      utterance: 'make the connected overlay Clip nine seconds',
      fixture: () => { const record = showLayerTransitionCommandFixture(true, true); record.id = `connected-resize-952-${Date.now().toString(36)}`; return record },
      // clip-b has no connected successor, so the trailing resize ripples nothing
      // (src/engine/showCommandsV2/clips.ts:260).
      expectedFacts: before => { const expected = structuredClone(before); expected.composition.clips.find(clip => clip.id === 'clip-b')!.durationMs = 9000; return expected },
    },
    {
      id: 'RN954', command: 'rename_show', args: { name: 'Night Show' },
      utterance: 'rename this Show Night Show', fixture: admissionShow954,
      unchangedUtterances: ['rename this Show Night Show'],
      expectedFacts: before => ({ ...structuredClone(before), name: 'Night Show' }),
    },
    {
      id: 'SM954', command: 'set_stage_map', args: { stage_map_id: 'plane' },
      utterance: 'stage this Show on the plane map', fixture: admissionShow954,
      unchangedUtterances: ['stage this Show on the plane map'],
      expectedFacts: before => ({ ...structuredClone(before), stageMapId: 'plane' }),
    },
    {
      id: 'CP954', command: 'set_target_controller_profile', args: { profile_id: 'profile-test' },
      utterance: 'target the test controller profile without sending', fixture: admissionShow954,
      expectedFacts: before => ({ ...structuredClone(before), targetControllerProfileId: 'profile-test' }),
    },
    {
      id: 'UZ954', command: 'update_zone', args: { zone_id: 'zone-1', name: 'Front', nominal_pixel_count: 124, color: '#abcdef' },
      utterance: 'name the Zone Front with 124 pixels and color abcdef', fixture: admissionShow954,
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.zones[0] = { ...expected.zones[0], name: 'Front', nominalPixelCount: 124, color: '#abcdef' }
        return expected
      },
    },
    {
      id: 'OC954', command: 'set_output_contract', args: { kind: 'portable-2d', map_id: 'plane', pixel_count: 512 },
      utterance: 'make the output portable with the plane map and 512 reference pixels', fixture: admissionShow954,
      expectedFacts: before => ({
        ...structuredClone(before), stageMapId: 'plane',
        outputContract: { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 512, compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } },
      }),
    },
    {
      id: 'OT954', command: 'set_output_trails', args: { enabled: true, retention: 0.5 },
      utterance: 'enable output Trails at half retention', fixture: admissionShow954,
      expectedFacts: before => ({ ...structuredClone(before), outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.5 }] }),
    },
    // v2 appends a Layout interval after Show End and extends Show End by its
    // duration; no Scene, Boundary or empty Scene composition is authored
    // (src/engine/showCommandsV2/layouts.ts:34, 60). The converted fixture's
    // one interval is `layout-occurrence:1`, 0–62 000 ms.
    ...[
      { id: 'AI954', command: 'add_layout_interval', args: { layout_id: 'layout-1', duration_ms: 1000 }, utterance: 'append a one second Layout interval', occurrenceId: 'layout-interval-62000', duration: 1000 },
      { id: 'DI954', command: 'duplicate_layout_interval', args: { interval_id: 'layout-occurrence:1' }, utterance: 'duplicate the first Layout interval empty', occurrenceId: 'layout-occurrence-1-copy', duration: 62000 },
    ].map(({ occurrenceId, duration, ...row }) => ({
      ...row, fixture: admissionShow954,
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        expected.composition.showEndMs += duration
        expected.composition.layoutOccurrences.push({ id: occurrenceId, layoutId: 'layout-1', startMs: 62000, durationMs: duration, parameters: {} })
        return expected
      },
    })),
    {
      // v2 clones only the Zone Layout definition; Zones and Clips stay shared
      // (src/engine/showCommandsV2/layouts.ts:107), where v1 cloned the Zone.
      id: 'UI954', command: 'make_layout_interval_unique', args: { interval_id: 'layout-occurrence:1' },
      utterance: 'make the first Layout interval unique', fixture: sharedLayoutShow954,
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.zoneLayouts.push({ ...structuredClone(before.zoneLayouts[0]), id: 'layout-1-unique', name: 'Default copy' })
        expected.composition.layoutOccurrences[0].layoutId = 'layout-1-unique'
        return expected
      },
    },
    // The converted Boundary is the existing whole-output Transition
    // transition-scene-1, so its kind, colour and easing are update_transition
    // and its duration resize_transition. BT and BTT952 run both, with the
    // resize as the stale candidate. A converted Boundary's resize is the v1
    // loop commit in global time: the downstream side, its Marker, Group
    // occurrence and Show End move by the delta and the Layout interval
    // shortens with it (src/engine/showTransitionsV2.ts:333-365, 606), where
    // the v1 record changed only the Boundary. The owner accepts that resize,
    // but the bridge's delivery validation refuses the commit: track-b,
    // track-inst and track-inst-b keep their activation to 32 000 ms, and
    // lowering places their keys outside the shortened compiled Scene 1.
    ...[
      {
        id: 'BT952', command: 'update_transition', args: { transition_id: 'transition-scene-1', kind: 'fade-color', parameters: { color: '#000000' } },
        utterance: 'make the Boundary fade through black over fifteen hundred milliseconds', slug: 'kind',
        staleCommand: { command: 'resize_transition', args: { transition_id: 'transition-scene-1', duration_ms: 1500 } },
        pendingV2: 'defect: #1103 compiler limitation: instance tracks across a whole-output Transition; delivery validation refuses the resize_transition commit',
      },
      {
        id: 'BTT952', command: 'update_transition', args: { transition_id: 'transition-scene-1', easing: 'ease-in' },
        utterance: 'set the Boundary to fifteen hundred milliseconds with ease in', slug: 'timing',
        staleCommand: { command: 'resize_transition', args: { transition_id: 'transition-scene-1', duration_ms: 1500 } },
        pendingV2: 'defect: #1103 compiler limitation: instance tracks across a whole-output Transition; delivery validation refuses the resize_transition commit',
      },
      // v2 easing is a Transition field, not a parameter; sine-in is its structured curve.
      {
        id: 'BTP952', command: 'update_transition', args: { transition_id: 'transition-scene-1', easing: { curve: 'sine', direction: 'in' } },
        utterance: 'set the Boundary easing parameter to sine in', slug: 'parameter',
      },
    ].map(({ slug, ...row }) => ({
      ...row,
      fixture: () => { const record = showBoundaryCommandFixture(); record.id = `boundary-${slug}-952-${Date.now().toString(36)}`; return record },
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        const composition = expected.composition
        const boundary = composition.transitions.find(transition => transition.id === 'transition-scene-1')!
        if (row.id === 'BTP952') { boundary.easing = { curve: 'sine', direction: 'in' }; return expected }
        if (row.id === 'BT952') Object.assign(boundary, { kind: 'fade-color', color: '#000000' })
        if (row.id === 'BTT952') boundary.easing = { curve: 'quadratic', direction: 'in' }
        boundary.durationMs = 1500
        composition.showEndMs -= 500
        composition.layoutOccurrences[0].durationMs -= 500
        const right = composition.clips.find(clip => clip.id === 'boundary-right')!
        right.startMs -= 500
        right.appearance.keys[0].timeMs -= 500
        composition.markers.find(marker => marker.id === 'scene-marker:scene-2')!.timeMs -= 500
        const group = composition.groupOccurrences.find(occurrence => occurrence.id === 'group-use')!
        group.startMs -= 500
        group.trackActivation!.startMs -= 500
        return expected
      },
    })),
    {
      // v2 has no Boundary routing record: a Layout switch is the start of a
      // Layout interval. The fixture keeps layout-1 through a routing cut at the
      // Boundary, which converts into a second interval `layout-occurrence:2`
      // from 30 000 ms, and select_layout points that interval at layout-2
      // (src/engine/showCommandsV2/layouts.ts:148-168), where v1 added the
      // routing record itself.
      id: 'BL952', command: 'select_layout', args: { interval_id: 'layout-occurrence:2', layout_id: 'layout-2' },
      utterance: 'switch to the second Layout at the Boundary',
      fixture: () => {
        const record = showBoundaryCommandFixture()
        record.transitions.push({ id: 'routing-scene-1', afterSceneId: 'scene-1', kind: 'routing', durationMs: 0, easing: { curve: 'linear' }, layoutId: 'layout-1' })
        record.id = `boundary-layout-952-${Date.now().toString(36)}`
        return record
      },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition.layoutOccurrences.find(occurrence => occurrence.id === 'layout-occurrence:2')!.layoutId = 'layout-2'
        return expected
      },
    },

    {
      id: 'AC951',
      command: 'create_clips',
      // Every runtime in the fixture plays CometLoom, so D3 cannot pick or
      // create one implicitly: `sole` is ambiguous and `new` refuses once a
      // runtime exists (src/engine/showCommandsV2/clipSpec.ts:144, 151). The
      // Clip names the overlay's own runtime, where v1 created instance-1.
      args: { clips: [{ zone_id: 'zone-1', layer_id: 'layer:zone-1:overlay:2', start_ms: 29000, duration_ms: 1000, pattern: { kind: 'stock', id: 'CometLoom' }, instance: 'instance-ov' }] },
      utterance: 'add CometLoom to the overlay at twenty nine seconds',
      // A Clip ending at 30 000 ms sits inside the converted Scene boundary's
      // whole-output crossfade scope, which refuses it
      // (src/engine/showCompositionV2.ts:517); a Cut boundary keeps the row on
      // Clip creation.
      fixture: () => {
        const record = showOverlayLayerFixture()
        record.transitions = [{ id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } }]
        record.id = `add-951-${Date.now().toString(36)}`
        return record
      },
      // The new Clip's identities are the owner's `clip-<zone>-<start>`
      // (src/engine/showCommandsV2/clipSpec.ts:211, 213).
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition.clips.push({
          id: 'clip-zone-1-29000', instanceId: 'instance-ov', zoneId: 'zone-1', layerId: 'layer:zone-1:overlay:2', startMs: 29000, durationMs: 1000,
          entryPolicy: 'continue', zoneSampleMode: 'span',
          appearance: { keys: [{ id: 'clip-zone-1-29000-appearance', timeMs: 29000, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
        })
        return expected
      },
    },
    {
      id: 'IC951',
      command: 'make_clip_pattern_independent',
      args: { clip_id: 'clip-c' },
      utterance: 'make the third Clip Pattern independent',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `independent-951-${Date.now().toString(36)}`; return record },
      // The copied instance and its instance tracks take the owner's
      // `-independent` identities (src/engine/showCommandsV2/clips.ts:375, 386, 390),
      // where v1 used instance-1.
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition.patternInstances.push({ ...structuredClone(before.composition.patternInstances.find(instance => instance.id === 'instance-a')!), id: 'instance-a-independent' })
        expected.composition.clips.find(clip => clip.id === 'clip-c')!.instanceId = 'instance-a-independent'
        const original = before.composition.propertyTracks.find(track => track.id === 'track-inst')!
        expected.composition.propertyTracks.push({ ...structuredClone(original), id: 'track-inst-independent', target: { kind: 'instance-time-scale', instanceId: 'instance-a-independent' }, keyframes: original.keyframes.map(keyframe => ({ ...structuredClone(keyframe), id: `${keyframe.id}-independent` })) })
        return expected
      },
    },
    {
      id: 'RJ951',
      command: 'rejoin_clip_pattern_instance',
      args: { clip_id: 'clip-b', instance_id: 'instance-a' },
      utterance: 'rejoin the second Clip to the first Pattern instance',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `rejoin-951-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition.patternInstances = expected.composition.patternInstances.filter(instance => instance.id !== 'instance-b')
        expected.composition.clips.find(clip => clip.id === 'clip-b')!.instanceId = 'instance-a'
        expected.composition.propertyTracks = expected.composition.propertyTracks.filter(track => track.id !== 'track-inst-b')
        return expected
      },
    },
    {
      id: 'IT951',
      command: 'insert_time',
      args: { at_ms: 29000, duration_ms: 1000 },
      utterance: 'insert one second at twenty nine seconds',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `insert-time-951-${Date.now().toString(36)}`; return record },
      // Global time mapping: everything at or after 29 000 ms shifts by one
      // second, the Layout interval and Show End grow, and each Property track
      // spanning the insertion holds its value there with a hold and resume key
      // (src/engine/showPropertyTrackTimeMappingV2.ts:176, 178). Every key of
      // these tracks is before 29 000 ms, so the held value is the last one.
      expectedFacts: before => {
        const expected = structuredClone(before)
        const composition = expected.composition
        composition.showEndMs += 1000
        composition.layoutOccurrences[0].durationMs += 1000
        composition.transitions.find(transition => transition.id === 'transition-scene-1')!.wholeOutput!.startMs += 1000
        for (const track of composition.propertyTracks) {
          const value = track.keyframes.at(-1)!.value
          track.keyframes.push(
            { id: `${track.id}:hold:29000`, timeMs: 29000, value, easing: { curve: 'linear' } },
            { id: `${track.id}:resume:30000`, timeMs: 30000, value, easing: { curve: 'linear' } },
          )
          track.activeDurationMs! += 1000
        }
        composition.markers.find(marker => marker.id === 'scene-marker:scene-2')!.timeMs += 1000
        const group = composition.groupOccurrences.find(occurrence => occurrence.id === 'group-use')!
        group.startMs += 1000
        group.trackActivation!.startMs += 1000
        return expected
      },
    },
    {
      id: 'SE951',
      command: 'set_show_end',
      args: { end_ms: 70000 },
      utterance: 'set Show End to seventy seconds',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `show-end-951-${Date.now().toString(36)}`; return record },
      // Lengthening Show End extends the final Layout interval; no Scene exists
      // to lengthen (src/engine/showLayoutIntervalsV2.ts:278).
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition.showEndMs = 70000
        expected.composition.layoutOccurrences[0].durationMs = 70000
        return expected
      },
    },
    {
      id: 'M951',
      command: 'update_clips',
      args: { updates: [{ clip_id: 'resize-b', start_ms: 6000 }] },
      utterance: 'move the connected second Clip five seconds later then two seconds earlier',
      fixture: () => {
        const record = resizeBoundaryShow(`move-951-${Date.now().toString(36)}`)
        const zone = record.composition!.scenes[0].zones[0]
        zone.main[0].durationMs = 2000
        zone.main[1].startMs = 3000
        zone.overlays = [{ id: 'move-overlay', name: 'Destination', placements: [] }]
        record.composition!.transitions = [{ id: 'move-ab', fromPlacementId: 'resize-a', toPlacementId: 'resize-b', kind: 'crossfade', durationMs: 1000, easing: { curve: 'sine', direction: 'in-out' }, crossfadePolicy: 'live-live' }]
        return record
      },
      // The connected move translates the whole component rigidly, held
      // appearance keys included (src/engine/showCommandsV2/clips.ts:131).
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        for (const [id, startMs] of [['resize-a', 3000], ['resize-b', 6000]] as const) {
          const clip = expected.composition.clips.find(candidate => candidate.id === id)!
          clip.startMs = startMs
          clip.appearance.keys[0].timeMs = startMs
        }
        return expected
      },
      unchangedUtterances: ['keep the connected second Clip at six seconds', 'move the connected second Clip to overlay zero']
    },
    {
      id: 'RC951',
      command: 'remove_clips',
      args: { clip_ids: ['clip-b'] },
      utterance: 'remove the connected target Clip',
      fixture: () => {
        const record = showRemoveClipFixture()
        record.id = `remove-951-${Date.now().toString(36)}`
        return record
      },
      // Spec §6 collects the orphaned instance-b and its instance tracks (#1100).
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        const composition = expected.composition
        composition.clips = composition.clips.filter(clip => clip.id !== 'clip-b')
        composition.transitions = composition.transitions.filter(transition => transition.id !== 'connected-transition')
        composition.propertyTracks = composition.propertyTracks.filter(track => !['track-b', 'track-inst-b'].includes(track.id))
        composition.patternInstances = composition.patternInstances.filter(instance => instance.id !== 'instance-b')
        return expected
      }
    },
    {
      id: 'SC951',
      command: 'split_clip',
      args: { clip_id: 'clip-b', at_ms: 16000 },
      utterance: 'split the connected target Clip at sixteen seconds',
      fixture: () => {
        const record = showSplitClipFixture()
        record.id = `split-951-${Date.now().toString(36)}`
        return record
      },
      expectedFacts: before => splitFixtureExpected(before)
    },
    {
      id: 'DC951',
      command: 'duplicate_clip',
      args: { clip_id: 'clip-ov', start_ms: 8000, independent: true },
      utterance: 'duplicate the overlay Clip independently',
      fixture: () => {
        const record = showSplitClipFixture()
        record.id = `duplicate-951-${Date.now().toString(36)}`
        return record
      },
      // v2 needs an explicit start (v1 placed the copy after the source, at
      // 8000 ms). independent gives the copy a fresh instance-ov-independent
      // cloned from instance-ov (src/engine/showCommandsV2/clips.ts:351-358, 375;
      // src/engine/showClipsV2.ts:269-277); instance-ov has no instance tracks to copy.
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        const source = before.composition.clips.find(clip => clip.id === 'clip-ov')!
        const instance = before.composition.patternInstances.find(candidate => candidate.id === 'instance-ov')!
        expected.composition.patternInstances.push({ ...structuredClone(instance), id: 'instance-ov-independent' })
        expected.composition.clips.push({
          ...structuredClone(source), id: 'clip-ov-copy', instanceId: 'instance-ov-independent', startMs: 8000,
          appearance: { keys: [{ ...structuredClone(source.appearance.keys[0]), id: 'clip-ov-appearance-1-copy', timeMs: 8000 }] },
        })
        expected.composition.executionModel = 'continuous'
        return expected
      }
    },
    {
      id: 'L951',
      command: 'create_layers',
      args: { layers: [{ zone_id: 'zone-1' }] },
      utterance: 'add a topmost overlay Layer',
      fixture: () => {
        const record = showOverlayLayerFixture()
        record.composition!.scenes[1].zones[0].overlays = []
        record.id = `layer-951-${Date.now().toString(36)}`
        return record
      },
      // A v2 Layer is Zone-owned for the whole Show: one Layer at the top of
      // zone-1 with the owner's generated identity and name
      // (src/engine/showCommandsV2/layers.ts:102, 107), where v1 added one
      // overlay per Scene.
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        expected.composition.layers.push({ id: 'layer-zone-1', zoneId: 'zone-1', name: 'Layer layer-zone-1', rank: 3 })
        return expected
      },
      staleCommand: { command: 'create_clips', args: { clips: [{ zone_id: 'zone-1', layer_id: 'layer:zone-1:overlay:2', start_ms: 0, duration_ms: 1000, pattern: { kind: 'stock', id: 'CometLoom' }, instance: 'instance-ov' }] } }
    },
    {
      id: 'MK951',
      command: 'add_marker',
      args: { at_ms: 9000, name: 'Final', color: '#38bdf8' },
      utterance: 'add move and update the marker',
      fixture: () => {
        const record = resizeBoundaryShow(`markers-951-${Date.now().toString(36)}`)
        record.composition!.markers = [{ id: 'marker-1', timeMs: 4000, name: 'Existing', color: '#ff8800' }]
        return record
      },
      // The converted record also carries the scene-label chapter Marker; the
      // added Marker's id is the owner's `marker-<at_ms>` of its add step,
      // kept through the later time patches (src/engine/showCommandsV2/markers.ts:40).
      expectedFacts: (before: ShowRecordV2) => {
        const expected = structuredClone(before)
        expected.composition.markers.push({ id: 'marker-1000', timeMs: 9000, name: 'Final', color: '#38bdf8' })
        return expected
      },
      unchangedUtterances: ['keep the final marker unchanged', 'remove the missing marker']
    },
    ...[
      { partition: 'Main', atMs: 16000, clipId: 'clip-b', accepted: true },
      { partition: 'overlay', atMs: 5000, clipId: 'clip-ov', accepted: true },
      { partition: 'gap', atMs: 45000, clipId: null, accepted: false },
      // The former Scene Cut is inside the converted global clip-b, so v2 accepts it.
      { partition: 'Cut', atMs: 30000, clipId: 'clip-b', accepted: true },
    ].map(toolbarSplit => ({
      id: `S992-${toolbarSplit.partition}`,
      command: 'split_clip',
      args: { clip_id: toolbarSplit.clipId, at_ms: toolbarSplit.atMs },
      utterance: '',
      toolbarSplit,
      fixture: () => {
        const record = showSplitClipFixture()
        record.id = `toolbar-split-${toolbarSplit.partition.toLowerCase()}-${Date.now().toString(36)}`
        return record
      },
      // The overlay partition removes the first Main Clip and its incoming
      // Transition from the converted record, so only clip-ov is under the
      // playhead at 5000 ms.
      editConverted: toolbarSplit.partition === 'overlay' ? (converted: ShowRecordV2) => {
        converted.composition.clips = converted.composition.clips.filter(clip => clip.id !== 'clip-a')
        converted.composition.transitions = converted.composition.transitions.filter(transition => transition.id !== 'incoming')
      } : undefined,
      // The Main and Cut partitions split clip-b (at 16 000 ms, SC951's split,
      // and at 30 000 ms); each cuts clip-b's tracks only at the split (#1101).
      // The overlay right piece shares instance-ov with `continue` and takes
      // clip-ov's held appearance at the split (src/engine/showCommandsV2/clips.ts:286).
      expectedFacts: (before: ShowRecordV2) => {
        if (!toolbarSplit.accepted) return structuredClone(before)
        if (toolbarSplit.partition === 'Main') return splitFixtureExpected(before, TOOLBAR_SPLIT_ID)
        if (toolbarSplit.partition === 'Cut') return formerCutSplitExpected(before, TOOLBAR_SPLIT_ID)
        return overlaySplitExpected(before, TOOLBAR_SPLIT_ID)
      },
    }))
  ]

  // The table owns operation facts; this sequence owns the live admission contract.
  for (const admission of admissionCases) {
    // Each row seeds its v1 fixture as a converted v2 Show and counts v2 saves
    // (PUT /api/shows/<id>?show-version=2). A row with a known v2 defect is
    // registered as fixme under the same title.
    const register = admission.pendingV2 ? test.fixme : test
    register(`${admission.id}: ${admission.toolbarSplit ? 'toolbar Split matches selected Split or refuses without saving' : 'command admission saves once, reopens, undoes, refuses stale and deduplicates'}`, async ({ page }) => {
      test.setTimeout(90000)
      await page.setViewportSize({ width: 1440, height: 900 })
      const record = admission.fixture()
      await seedConvertedShowV2(page, record, `baseline ${admission.id}`, admission.editConverted)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        return (await load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')).useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      if (!admission.toolbarSplit) await injectOverlay(page, bridge.url)
      const before = (await visibleRecord(page)) as unknown as ShowRecordV2
      const writes = watchShowWrites(page)
      const successfulSaves = () => writes.filter(write => write.method === 'PUT' && write.status === 200).length
      let done: OverlayRequest | null = null
      if (admission.toolbarSplit) {
        await seekToolbarSplit(page, admission.toolbarSplit.atMs)
        const split = page.getByRole('button', { name: 'Split at playhead' })
        if (admission.toolbarSplit.accepted) await clickToolbarSplitWithFixedId(page)
        else {
          await expect(split).toHaveAttribute('aria-disabled', 'true')
          await split.press('Enter')
          await expect(page.getByRole('status', { name: 'Split unavailable' })).toBeVisible()
        }
      } else {
        done = await waitForDone(page, await submitUtterance(page, admission.utterance))
        expect(done.applied, JSON.stringify(done)).toBe(true)
      }
      if (admission.id === 'IT951') {
        await page.getByRole('button', { name: 'Agent menu' }).focus()
        await page.keyboard.press('Escape')
        const band = page.getByTestId('agent-time-band')
        await expect(band).toBeVisible()
        const geometry = async () => page.evaluate(() => {
          const band = document.querySelector<HTMLElement>('[data-testid="agent-time-band"]')!
          const area = band.parentElement!.getBoundingClientRect()
          const rect = band.getBoundingClientRect()
          return { left: (rect.left - area.left) / area.width, width: rect.width / area.width, pixels: rect.width, x: rect.left }
        })
        const fitted = await geometry()
        expect(fitted.left).toBeCloseTo(29 / 63, 3)
        expect(fitted.width).toBeCloseTo(1 / 63, 3)
        const scroll = page.getByTestId('show-timeline-scroll-region')
        await scroll.hover()
        await page.keyboard.down('Control')
        await page.mouse.wheel(0, -100)
        await page.keyboard.up('Control')
        await expect.poll(async () => (await geometry()).pixels).toBeGreaterThan(fitted.pixels)
        const zoomed = await geometry()
        expect(zoomed.left).toBeCloseTo(29 / 63, 3)
        expect(zoomed.width).toBeCloseTo(1 / 63, 3)
        await page.keyboard.down('Shift')
        await page.mouse.wheel(0, 150)
        await page.keyboard.up('Shift')
        await expect.poll(async () => (await geometry()).x).toBeLessThan(zoomed.x)
        const panned = await geometry()
        expect(panned.width).toBeCloseTo(zoomed.width, 3)
        await expect(band).toBeVisible()
        saveRecord('IT951-band-geometry', { fitted, zoomed, panned })
        await page.screenshot({ path: join(REPORT_DIR, 'IT951-band-panned.png'), fullPage: false, animations: 'disabled' })
      }
      const accepted = admission.toolbarSplit?.accepted ?? true
      await expect.poll(successfulSaves).toBe(accepted ? 1 : 0)
      const after = (await visibleRecord(page)) as unknown as ShowRecordV2
      expect(after).toEqual({ ...admission.expectedFacts(before), updatedAt: after.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(after)
      expect(writes.filter(write => write.method === 'PUT')).toHaveLength(accepted ? 1 : 0)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Show actions' }).click()
      const download = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await download
      const reopened = await reopenExport(page, (await file.path())!)
      expect(reopened.show).toEqual(after)
      saveRecord(`${admission.id}-export`, reopened)
      if (!accepted) {
        expect(after).toEqual(before)
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
        await page.screenshot({ path: join(REPORT_DIR, `${admission.id}-refused.png`), fullPage: true })
        saveRecord(admission.id, { before, after, writes, reopened })
        return
      }
      for (const utterance of admission.unchangedUtterances ?? []) {
        const outcome = await waitForDone(page, await submitUtterance(page, utterance))
        expect(outcome.changed, JSON.stringify(outcome)).toBe(false)
        expect(await visibleRecord(page)).toEqual(after)
        expect(await durableShow(page, record.id)).toEqual(after)
        expect(writes.filter(write => write.method === 'PUT')).toHaveLength(1)
        saveRecord(`${admission.id}-${utterance.startsWith('keep') ? 'noop' : 'refusal'}`, outcome)
      }
      await page.screenshot({ path: join(REPORT_DIR, `${admission.id}-result.png`), fullPage: true })
      let saveCount = 1
      if (admission.id === 'MK951') {
        const removal = await waitForDone(page, await submitUtterance(page, 'remove the final marker'))
        expect(removal.applied).toBe(true)
        await expect.poll(successfulSaves).toBe(++saveCount)
        const removed = (await visibleRecord(page))!
        expect(removed).toEqual({ ...before, updatedAt: removed.updatedAt })
        expect(await durableShow(page, record.id)).toEqual(removed)
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await expect.poll(() => visibleRecord(page)).toEqual({ ...after, updatedAt: expect.any(Number) })
        await expect.poll(successfulSaves).toBe(++saveCount)
        saveRecord('MK951-removal', { removal, removed })
      }
      if (admission.toolbarSplit) await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
      await expect.poll(successfulSaves).toBe(++saveCount)
      expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      if (admission.toolbarSplit) {
        // Closing the inspector preserves selection; Undo removes that selected
        // right half. The same action must resolve the restored Clip again.
        await expect(page.getByRole('button', { name: 'Split at playhead' })).not.toHaveAttribute('aria-disabled', 'true')
        await clickToolbarSplitWithFixedId(page)
        await expect.poll(successfulSaves).toBe(++saveCount)
        expect(await visibleRecord(page)).toEqual({ ...after, updatedAt: expect.any(Number) })
        expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
        await expect.poll(successfulSaves).toBe(++saveCount)
        expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
        // The same real toolbar action with explicit selection must save the
        // exact same complete record (apart from its adoption timestamp).
        await page.locator(`[data-show-selection-key="clip:${admission.toolbarSplit.clipId}"]`).press('Enter')
        await page.keyboard.press('Escape')
        await seekToolbarSplit(page, admission.toolbarSplit.atMs)
        await clickToolbarSplitWithFixedId(page)
        await expect.poll(successfulSaves).toBe(++saveCount)
        const selected = await visibleRecord(page)
        expect(selected).toEqual({ ...after, updatedAt: expect.any(Number) })
        expect(await durableShow(page, record.id)).toEqual(selected)
        expect(writes.filter(write => write.method === 'PUT')).toHaveLength(saveCount)
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
        await expect.poll(successfulSaves).toBe(saveCount + 1)
        expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
        saveRecord(admission.id, { before, after, selected, writes, reopened })
        return
      }
      // Capture before the real manual Add menu changes the Show revision. The
      // v2 catalogue resolves Patterns through the editor's own captured bundle
      // (src/agent/editorAdmission.ts captureCommandContext), as the bridge does.
      await page.evaluate(async ({ id, command, args }) => {
        const load = (path: string) => import(path)
        const { applyShowCommandV2 } = await load('/PXLBLZ-IDE/src/engine/showCommandsV2/registry.ts')
        const win = window as unknown as { __pxlblzEditor: { beginRequest: (id: string, text: string, history: unknown[]) => { request: unknown; show: ShowRecordV2 }; captureCommandContext: () => { commandContext: unknown } | undefined }; __admissionPending?: unknown }
        const captured = win.__pxlblzEditor.beginRequest(`${id}-stale`, command, [])
        const outcome = applyShowCommandV2(captured.show, command, args, win.__pxlblzEditor.captureCommandContext()!.commandContext)
        if (outcome.status === 'refused') throw new Error(JSON.stringify(outcome))
        win.__admissionPending = { captured, candidate: outcome.record }
      }, { id: admission.id, ...(admission.staleCommand ?? { command: admission.command, args: admission.args }) })
      await page.getByRole('button', { name: 'Add to Show', exact: true }).click()
      await page.getByRole('menuitem', { name: /^Layer(?: in |$)/ }).first().click()
      await expect.poll(successfulSaves).toBe(++saveCount)
      const manual = await visibleRecord(page)
      const stale = await page.evaluate(async () => {
        const win = window as unknown as { __pxlblzEditor: { applyShow: (show: unknown, request: unknown) => Promise<unknown> }; __admissionPending: { candidate: unknown; captured: { request: unknown } } }
        return win.__pxlblzEditor.applyShow(win.__admissionPending.candidate, win.__admissionPending.captured.request)
      })
      expect(stale).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
      expect(await visibleRecord(page)).toEqual(manual)
      expect(await durableShow(page, record.id)).toEqual(manual)
      expect(writes.filter(write => write.method === 'PUT')).toHaveLength(saveCount)
      const duplicate = await page.evaluate(async ({ id, command, args }) => {
        const load = (path: string) => import(path)
        const { applyShowCommandV2 } = await load('/PXLBLZ-IDE/src/engine/showCommandsV2/registry.ts')
        const api = (window as unknown as { __pxlblzEditor: { beginRequest: (id: string, text: string, history: unknown[]) => { request: unknown; show: ShowRecordV2 }; captureCommandContext: () => { commandContext: unknown } | undefined; applyShow: (show: unknown, request: unknown) => Promise<unknown> } }).__pxlblzEditor
        const captured = api.beginRequest(`${id}-duplicate`, command, [])
        const outcome = applyShowCommandV2(captured.show, command, args, api.captureCommandContext()!.commandContext)
        if (outcome.status === 'refused') throw new Error(JSON.stringify(outcome))
        return { first: await api.applyShow(outcome.record, captured.request), second: await api.applyShow(outcome.record, captured.request) }
      }, { id: admission.id, command: admission.command, args: admission.args })
      expect(duplicate.first).toMatchObject({ status: 'applied' })
      expect(duplicate.second).toMatchObject({ status: 'applied' })
      await expect.poll(successfulSaves).toBe(++saveCount)
      expect(writes.filter(write => write.method === 'PUT')).toHaveLength(saveCount)
      expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
      await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await expect.poll(() => visibleRecord(page)).toEqual({ ...manual, updatedAt: expect.any(Number) })
      await expect.poll(successfulSaves).toBe(saveCount + 1)
      expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
      saveRecord(admission.id, { before, after, done, manual, stale, duplicate, writes, observations: await readObservations(page) })
    })
  }


  // The Main split selects clip-b at 20 000 ms; it cuts track-b only at the
  // split, so delivery validation admits it (#1101).
  test('SC951-overlay: manual overlay split persists after a Main split and Undo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const record = showSplitClipFixture()
    record.id = `split-overlay-951-${Date.now().toString(36)}`
    await seedConvertedShowV2(page, record, 'baseline SC951-overlay')
    await page.goto(`studio/shows/${record.id}?agent=1`)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    const before = await visibleRecord(page) as unknown as ShowRecordV2
    const responses: unknown[] = []
    page.on('response', async response => {
      if (response.request().method() === 'PUT' && response.url().includes(`/api/shows/${record.id}`)) responses.push({ status: response.status(), body: await response.text(), sent: response.request().postDataJSON() })
    })
    await page.locator('[data-show-selection-key="clip:clip-b"]').click()
    await page.locator('body').press('Escape')
    await page.locator('body').press('a')
    for (let i = 0; i < 4; i++) await page.locator('body').press('ArrowRight')
    await page.getByRole('button', { name: 'Split at playhead' }).click()
    await expect.poll(() => responses.length).toBe(1)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await expect.poll(() => responses.length).toBe(2)
    await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await page.locator('body').press('a')
    await page.locator('[data-show-selection-key="clip:clip-ov"]').click()
    await page.locator('body').press('ArrowRight')
    await expect(page.locator('[data-show-selection-key="clip:clip-ov"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Split at playhead' })).toHaveAttribute('title', 'Split the selected Clip at the playhead.')
    await page.getByRole('button', { name: 'Split at playhead' }).click()
    await expect.poll(() => responses.length).toBe(3)
    saveRecord('SC951-overlay-responses', responses)
    expect(responses[2]).toMatchObject({ status: 200 })
    const after = await visibleRecord(page) as unknown as ShowRecordV2
    // The toolbar's right piece takes a generated identity; it follows clip-ov.
    const right = after.composition.clips[after.composition.clips.findIndex(clip => clip.id === 'clip-ov') + 1]
    expect(after).toEqual({ ...overlaySplitExpected(before, right.id), updatedAt: after.updatedAt })
    expect(await durableShow(page, record.id)).toEqual(after)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await expect.poll(() => responses.length).toBe(4)
    saveRecord('SC951-overlay', { before, after, responses })
  })
})
