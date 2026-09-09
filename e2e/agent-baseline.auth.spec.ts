import { showLayerTransitionCommandFixture } from '../src/test/showLayerTransitionCommandFixture'
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
import { showRemoveClipFixture } from '../src/test/showRemoveClipFixture'
import { showOverlayLayerFixture } from '../src/test/showOverlayLayerFixture'
import { showSplitClipFixture } from '../src/test/showSplitClipFixture'

const TOOLBAR_SPLIT_ID = '00000992-0000-4000-8000-000000000001'

function splitFixtureExpected(before: ShowRecord, rightId = 'clip-1'): ShowRecord {
  const expected = structuredClone(before)
  expected.composition!.scenes[0].zones[0].main[1].durationMs = 4000
  expected.composition!.scenes[0].zones[0].main.push({ id: rightId, instanceId: 'instance-b', startMs: 16000, durationMs: 14000, view: { mirror: false, phase: 0, brightness: 1 } })
  expected.composition!.scenes[1].zones[0].main[0] = { id: `${rightId}--span-scene-2`, logicalClipId: rightId, instanceId: 'instance-b', startMs: 0, durationMs: 6000, view: { mirror: false, phase: 0, brightness: 1 } }
  expected.composition!.scenes[0].propertyTracks!.splice(1, 0, {
    id: `track-b-${rightId}`, target: { kind: 'placement-view', placementId: rightId, property: 'brightness' },
    keyframes: [{ id: `kf-1-${rightId}`, timeMs: 12000, value: 1, easing: { curve: 'linear' } }, { id: `kf-2-${rightId}`, timeMs: 19000, value: 0.2, easing: { curve: 'linear' } }],
  })
  expected.composition!.scenes[1].propertyTracks![0].target = { kind: 'placement-view', placementId: `${rightId}--span-scene-2`, property: 'brightness' }
  expected.composition!.transitions![1].fromPlacementId = `${rightId}--span-scene-2`
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
  scenes?: Array<{ id: string; durationMs: number }>
  cells?: Array<{ id: string; sceneId: string; adaptations?: { brightness?: number } }>
  composition?: {
    durationMs?: number
    markers?: Array<{ name?: string; timeMs: number }>
    scenes: Array<{ zones: Array<{ main: Array<{ id: string; startMs: number; durationMs: number; view?: { brightness?: number } }> }> }>
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
    const firstMain = body?.composition?.scenes?.[0]?.zones?.[0]?.main?.[0]
    const write: ShowWrite = {
      method: request.method(),
      url: request.url(),
      at: Date.now(),
      status: null,
      updatedAt: body?.updatedAt ?? null,
      firstMainStartMs: firstMain?.startMs ?? null,
      firstMain: firstMain
        ? { durationMs: firstMain.durationMs ?? null, brightness: firstMain.view?.brightness ?? null }
        : null,
      compositionDurationMs: body?.composition?.durationMs ?? null,
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

async function createPersonalShow(page: Page): Promise<string> {
  await page.goto('studio/shows?agent=1')
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+\?agent=1$/)
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  return new URL(page.url()).pathname.split('/').at(-1)!
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

async function visibleRecord(page: Page): Promise<PersistedShow | undefined> {
  return page.evaluate(() => (window as unknown as { __pxlblzEditor?: { getShow: () => PersistedShow | undefined } }).__pxlblzEditor?.getShow())
}

async function durableShow(page: Page, id: string): Promise<PersistedShow | undefined> {
  const response = await page.context().request.get('/api/shows')
  expect(response.ok()).toBe(true)
  const { shows } = (await response.json()) as { shows: PersistedShow[] }
  return shows.find((show) => show.id === id)
}

async function waitForDurable(page: Page, id: string, predicate: (show: PersistedShow) => boolean): Promise<void> {
  await expect.poll(async () => {
    try {
      const show = await durableShow(page, id)
      return show ? predicate(show) : false
    } catch {
      return false
    }
  }).toBe(true)
}

/**
 * Main placements of a record in timeline order, read from the composition
 * when the record carries one and from the flat cells otherwise (a Clip
 * delete through the legacy path can leave the record flat).
 */
function mainPlacements(show: PersistedShow | undefined): MainFacts[] {
  if (!show) return []
  if (show.composition) {
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

function firstMain(show: PersistedShow | undefined): MainFacts | undefined {
  return mainPlacements(show)[0]
}

/** Open the Clip's detail panel, read the fields the author sees, and close it. */
async function visibleClipFacts(page: Page, patternName: string): Promise<{ durationSeconds: string; brightnessPercent: string }> {
  await page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first().click()
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  await expect(panel).toBeVisible()
  const durationSeconds = await panel.getByRole('textbox', { name: 'Duration seconds exact time' }).inputValue()
  const brightnessPercent = await panel.getByRole('textbox', { name: /^Brightness exact/ }).inputValue()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  return { durationSeconds, brightnessPercent }
}

async function visibleClipStart(page: Page, patternName: string): Promise<string> {
  await page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first().click()
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
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
  const candidateWrite = adopted ? writes.find((write) => write.method === 'PATCH' && write.at >= adopted.at) : undefined
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

  test('B2 gate: off injection, query retirement and same-URL rerenders preserve manual ownership', async ({ page }) => {
    test.setTimeout(90_000)
    const showId = await createPersonalShow(page)
    for (const search of ['', '?agent', '?agent=0', '?agent=true', '?agent=1&agent=0']) {
      await page.evaluate(search => window.history.replaceState(null, '', window.location.pathname + search), search)
      await page.addScriptTag({ url: `${bridge.url}/chat.js` })
      await expect(page.getByTestId('agent-chat-panel')).toHaveCount(0)
      expect(await page.evaluate(() => !!(window as unknown as { __pxlblzEditor?: unknown }).__pxlblzEditor)).toBe(false)
    }
    await setClipBrightness(page, 'TestPattern1D', '75')
    await waitForDurable(page, showId, show => firstMain(show)?.brightness === 0.75)
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
      return { same, old: original.applyShow({ ...captured.show, name: 'Stale' }, captured.request), changed: win.__pxlblzEditor.sessionId !== original.sessionId }
    })
    expect(result).toEqual({ same: true, old: { request: expect.any(Object), status: 'retired' }, changed: true })
    await expect(page.getByTestId('agent-chat-panel')).toHaveCount(0)
    expect(new URL(page.url()).searchParams.get('unrelated')).toBe('kept')
    expect((await durableShow(page, showId))?.name).toBe('Untitled Show')
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await waitForDurable(page, showId, show => firstMain(show)?.brightness === 1)
  })

  test('A: a delayed reply refuses after a manual edit and preserves its durable record', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShow(page)
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
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
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
    const showId = await createPersonalShow(page)
    await injectOverlay(page, bridge.url)
    const deleteId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, deleteId)
    const target = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    await target.click()
    await page.keyboard.press('Delete')
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
    await dragClipToStart(page, 'TestPattern1D', 12_000, 15_000)
    await waitForDurable(page, showId, show => firstMain(show)?.startMs === 15_000)
    const moved = await durableShow(page, showId)
    expect((await waitForDone(page, moveId)).applied).toBe(false)
    expect(await durableShow(page, showId)).toEqual(moved)
    expect(await visibleClipStart(page, 'TestPattern1D')).toBe('15')
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(4)
    await page.screenshot({ path: join(REPORT_DIR, 'B-target-refused.png'), fullPage: true })
  })

  test('C: time inserted during inference is preserved when the reply refuses', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShow(page)
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
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
    await page.screenshot({ path: join(REPORT_DIR, 'C-insert-preserved.png'), fullPage: true })
  })

  test('D: departure clears the transcript and a late reply cannot apply on same-Show reopen', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const other = personalBaseShow(`baseline-away-${Date.now().toString(36)}`)
    const seeded = await page.context().request.post('/api/shows', { data: other })
    expect(seeded.status(), await seeded.text()).toBe(201)
    const showId = await createPersonalShow(page)
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
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(0)
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
      const showId = await createPersonalShow(page)
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
        if (blockWrites && route.request().method() === 'PATCH') return route.abort()
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
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
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
      await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for active editing')
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
        expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
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
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
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
        await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for active editing')
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
        const expected = structuredClone(before!)
        expected.composition!.scenes[0].zones[0].main[0].durationMs = adopted ? 8000 : 7000
        expect(current).toEqual({ ...expected, updatedAt: current!.updatedAt })
        expect(await durableShow(page, record.id)).toEqual(current)
        expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Show actions' }).click()
        const download = page.waitForEvent('download')
        await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
        const file = await download
        const reopened = await page.evaluate(async bytes => {
          const load = (path: string) => import(path)
          const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
          return parseShowFileBundle(new Uint8Array(bytes))
        }, [...readFileSync((await file.path())!)])
        expect(reopened.show).toEqual(current)
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 4000)
        expect(await visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      }
      saveRecord(`FA-${action}`, { actualField: true, before, done, current: await visibleRecord(page), durable: await durableShow(page, record.id), writes })
    }
  })

  test('GA: real timeline gestures wait and settle after cancellation or manual adoption', async ({ page }) => {
    test.setTimeout(150000)
    const pageErrors: string[] = []
    page.on('pageerror', error => { pageErrors.push(error.stack ?? error.message); saveRecord('GA-page-errors', pageErrors) })
    for (const action of ['resize-cancel', 'resize-commit', 'end-commit'] as const) {
      await page.setViewportSize({ width: action === 'end-commit' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`gesture-${action}-${Date.now().toString(36)}`)
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
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
      const id = await submitUtterance(page, 'make the first Clip exactly eight seconds')
      const handle = action === 'end-commit'
        ? page.getByRole('button', { name: 'Show End at 20 seconds' })
        : page.getByRole('separator', { name: 'Resize CometLoom end' }).first()
      await handle.scrollIntoViewIfNeeded()
      const bounds = (await handle.boundingBox())!
      const clip = (await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().boundingBox())!
      const surface = (await page.getByLabel('Timeline Markers and Show End', { exact: true }).boundingBox())!
      const x = bounds.x + bounds.width / 2
      const y = bounds.y + bounds.height / 2
      await page.keyboard.down('Alt')
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(action === 'end-commit' ? x - surface.width / 10 : x + clip.width * 3 / 4, y, { steps: 3 })
      await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for active editing')
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
      await expect.poll(() => writes.filter(write => write.method === 'PATCH' && write.status === 200).length).toBe(1)
      const current = await visibleRecord(page)
      const expected = structuredClone(before!)
      if (action === 'end-commit') {
        expected.composition!.durationMs = 18000
        expected.scenes![0].durationMs = 18000
      } else expected.composition!.scenes[0].zones[0].main[0].durationMs = action === 'resize-cancel' ? 8000 : 7000
      expect(current).toEqual({ ...expected, updatedAt: current!.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(current)
      expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
      await page.getByRole('button', { name: 'Show actions' }).click()
      const download = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await download
      const reopened = await page.evaluate(async bytes => {
        const load = (path: string) => import(path)
        const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
        return parseShowFileBundle(new Uint8Array(bytes))
      }, [...readFileSync((await file.path())!)])
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
    expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
    const writes = watchShowWrites(page)
    await page.goto(`studio/shows/${record.id}?agent=1`)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    await expect.poll(() => page.evaluate(async () => {
      const load = (path: string) => import(path)
      const [{ usePatternStore }, { useLibraryStore }, { useMapStore }] = await Promise.all([
        load('/PXLBLZ-IDE/src/store/patternStore.ts'), load('/PXLBLZ-IDE/src/store/libraryStore.ts'), load('/PXLBLZ-IDE/src/store/mapStore.ts'),
      ])
      return usePatternStore.getState().patternsLoaded && useLibraryStore.getState().librariesLoaded && useMapStore.getState().mapsLoaded
    })).toBe(true)
    await injectOverlay(page, bridge.url)
    const before = await visibleRecord(page)
    // Pair real manual entry points with the scripted canonical operation.
    const handle = page.getByRole('separator', { name: 'Resize CometLoom end' }).first()
    const lane = page.locator('[data-show-layer-kind="main"]').first()
    const rect = (await lane.boundingBox())!
    const edge = (await handle.boundingBox())!
    await page.keyboard.down('Alt')
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
    await page.mouse.down()
    await page.mouse.move(edge.x + edge.width / 2 + rect.width * 0.4, edge.y + edge.height / 2)
    expect(await visibleRecord(page)).toEqual(before)
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(0)
    await page.screenshot({ path: join(REPORT_DIR, 'R-manual-preview.png'), fullPage: true })
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 8000)
    const pointerAfter = await visibleRecord(page)
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
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
    const expected = structuredClone(before!)
    expected.composition!.scenes[0].zones[0].main[0].durationMs = 8000
    expect(after).toEqual({ ...expected, updatedAt: after!.updatedAt })
    const durable = await durableShow(page, record.id)
    expect(durable).toEqual(after)
    expect(pointerAfter).toEqual({ ...after, updatedAt: pointerAfter!.updatedAt })
    const inspectorExpected = structuredClone(after!)
    inspectorExpected.composition!.scenes[0].zones[0].main[0].durationMs = 7999
    expect(inspectorAfter).toEqual({ ...inspectorExpected, updatedAt: inspectorAfter!.updatedAt })
    await page.getByRole('button', { name: 'Show actions' }).click()
    const downloadPending = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
    const downloaded = await downloadPending
    const reopened = await page.evaluate(async bytes => {
      const load = (path: string) => import(path)
      const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
      return parseShowFileBundle(new Uint8Array(bytes))
    }, [...readFileSync((await downloaded.path())!)])
    expect(reopened.show).toEqual(after)
    await page.screenshot({ path: join(REPORT_DIR, 'R-exact-boundary.png'), fullPage: true })
    const noop = await waitForDone(page, await submitUtterance(page, 'make the first Clip exactly eight seconds'))
    expect(noop.changed).toBe(false)
    expect(await visibleRecord(page)).toEqual(after)
    expect(await durableShow(page, record.id)).toEqual(durable)
    const refused = await waitForDone(page, await submitUtterance(page, 'try twelve seconds with the next Clip at eight'))
    expect(refused.changed).toBe(false)
    const refusedTools = (refused.bridgeTiming as { toolCalls: Array<{ name: string; isError?: boolean; issue?: string }> }).toolCalls
    expect(refusedTools.find(tool => tool.name === 'resize_clip')).toMatchObject({ isError: true, issue: 'The same-Layer range at this start is 0–8000 ms.' })
    await expect(page.getByText('The requested twelve seconds do not fit. Available range: 0–8000 ms.', { exact: false })).toBeVisible()
    expect(await visibleRecord(page)).toEqual(after)
    expect(await durableShow(page, record.id)).toEqual(durable)
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(5)
    await page.screenshot({ path: join(REPORT_DIR, 'R-noop-refused.png'), fullPage: true })
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    expect(await visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    expect(await visibleRecord(page)).toEqual({ ...after, updatedAt: expect.any(Number) })
    saveRecord('R-exact-resize', { before, pointerAfter, inspectorAfter, reopened, after, durable, accepted, noop, refused, writes, observations: await readObservations(page) })
  })

  test('TR: typed resize preserves independent pending edits and bounded active input', async ({ page }) => {
    test.setTimeout(180000)
    const wireRecord = (show: ShowRecord | null) => Object.fromEntries(Object.entries({ ...show, targetControllerProfileId: show?.targetControllerProfileId ?? null }).filter(([key]) => key !== 'id'))
    for (const action of ['independent', 'conflict', 'draft-cancel', 'draft-commit'] as const) {
      await page.setViewportSize({ width: action === 'draft-cancel' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`targeted-${action}-${Date.now().toString(36)}`)
      const zone = record.composition!.scenes[0].zones[0]
      record.composition!.patternInstances.push({ id: 'independent-pattern', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } })
      zone.overlays = [{ id: 'independent-layer', name: 'Independent', placements: [{ ...zone.main.pop()!, instanceId: 'independent-pattern', startMs: 0, durationMs: 4000, opacity: 1 }] }]
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const { useEntityOrganizationStore } = await load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')
        return useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      const before = await visibleRecord(page)
      const writes: unknown[] = []
      const captureWrite = (request: Request) => { if (request.method() === 'PATCH' && request.url().endsWith(`/api/shows/${record.id}`)) writes.push(request.postDataJSON()) }
      page.on('request', captureWrite)
      await page.evaluate(bridgeUrl => {
        const w = window as unknown as { __pxlblzEditor: ReturnType<typeof import('../src/dev/agentEditorAdmission').createAgentEditorAdmission>; __targetedProof?: unknown }
        const api = w.__pxlblzEditor
        const captured = api.beginResizeRequest('targeted-proof', { clipId: 'resize-a', durationMs: 6000 })!
        const proof = { captured, response: null as unknown, delivery: null as unknown }
        w.__targetedProof = proof
        void fetch(`${bridgeUrl}/resize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(captured.intent) }).then(response => response.json()).then(result => {
          proof.response = result
          proof.delivery = result.kind === 'proposal' ? api.applyResize(result.intent, captured.request) : api.complete(captured.request, 'incomplete')
        })
      }, bridge.url)
      const independent = action === 'independent'
      await page.getByRole('button', { name: independent ? 'Select TestPattern1D' : 'Select CometLoom', exact: true }).click()
      const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
      await duration.fill('7')
      const dirty = action === 'draft-cancel' || action === 'draft-commit'
      if (dirty) {
        await expect.poll(() => page.evaluate(() => (window as unknown as { __targetedProof: { delivery?: { status: string } } }).__targetedProof.delivery?.status)).toBe('waiting')
        expect(await visibleRecord(page)).toEqual(before)
        expect(writes).toEqual([])
        await expect(duration).toBeFocused()
        await page.screenshot({ path: join(REPORT_DIR, `TR-${action}-waiting.png`), fullPage: true })
      } else expect(await page.evaluate(() => (window as unknown as { __targetedProof: { response: unknown } }).__targetedProof.response)).toBeNull()
      await duration.press(action === 'draft-cancel' ? 'Escape' : 'Enter')
      const applied = independent || action === 'draft-cancel'
      await expect.poll(() => page.evaluate(() => (window as unknown as { __targetedProof: { response: unknown } }).__targetedProof.response)).not.toBeNull()
      await expect.poll(() => page.evaluate(() => {
        const w = window as unknown as { __pxlblzEditor: { readOutcome: (request: unknown) => { status: string } }; __targetedProof: { captured: { request: unknown } } }
        return w.__pxlblzEditor.readOutcome(w.__targetedProof.captured.request)?.status
      })).toBe(applied ? 'applied' : 'refused')
      await expect.poll(async () => (await durableShow(page, record.id))?.composition).toEqual((await visibleRecord(page))!.composition)
      const after = await visibleRecord(page)
      const expected = structuredClone(before!)
      if (independent) expected.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 7000
      expected.composition!.scenes[0].zones[0].main[0].durationMs = applied ? 6000 : 7000
      expect(after).toEqual({ ...expected, updatedAt: after!.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(after)
      expect(writes).toHaveLength(independent ? 2 : 1)
      expect(writes.at(-1)).toEqual(wireRecord(after))
      await page.keyboard.press('Escape')
      if (applied) {
        await page.getByRole('button', { name: 'Show actions' }).click()
        const downloading = page.waitForEvent('download')
        await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
        const download = await downloading
        const reopened = await page.evaluate(async bytes => {
          const load = (path: string) => import(path)
          return (await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')).parseShowFileBundle(new Uint8Array(bytes))
        }, [...readFileSync((await download.path())!)])
        expect(reopened.show).toEqual(after)
        saveRecord(`TR-${action}-export`, reopened)
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 4000)
        const undone = await visibleRecord(page)
        const expectedUndo = structuredClone(expected)
        expectedUndo.composition!.scenes[0].zones[0].main[0].durationMs = 4000
        expect(undone).toEqual({ ...expectedUndo, updatedAt: undone!.updatedAt })
        expect(await durableShow(page, record.id)).toEqual(undone)
        await page.getByRole('button', { name: 'Redo Show edit' }).click()
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 6000)
      }
      await page.screenshot({ path: join(REPORT_DIR, `TR-${action}-result.png`), fullPage: true })
      const proof = await page.evaluate(() => (window as unknown as { __targetedProof: unknown }).__targetedProof)
      saveRecord(`TR-${action}`, { before, after, proof, writes, durable: await durableShow(page, record.id) })
      page.off('request', captureWrite)
    }
  })

  test('MR: mixed move-resize batches preserve complete records through adoption and active input', async ({ page }) => {
    test.setTimeout(180000)
    const wireRecord = (show: ShowRecord | null) => Object.fromEntries(Object.entries({ ...show, targetControllerProfileId: show?.targetControllerProfileId ?? null }).filter(([key]) => key !== 'id'))
    const utterance = 'move the second Clip to sixteen seconds then make the first Clip twelve seconds'
    for (const action of ['apply', 'refuse', 'incomplete', 'draft-cancel', 'manual-commit', 'pending-conflict'] as const) {
      await page.setViewportSize({ width: action === 'draft-cancel' || action === 'refuse' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`mixed-${action}-${Date.now().toString(36)}`)
      record.composition!.scenes[0].zones[0].main[1].durationMs = 4000
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
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
      const completeWrites: unknown[] = []
      const captureWrite = (request: Request) => {
        if (request.method() === 'PATCH' && request.url().endsWith(`/api/shows/${record.id}`)) completeWrites.push(request.postDataJSON())
      }
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
          await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for active editing')
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
      expect(tools.filter(tool => tool.name !== 'describe_show').map(tool => tool.name)).toEqual(action === 'incomplete' ? ['move_clip'] : ['move_clip', 'resize_clip'])
      expect(tools.find(tool => tool.name === 'move_clip')).toMatchObject({ name: 'move_clip' })
      expect(tools.find(tool => tool.name === 'move_clip')?.isError).not.toBe(true)
      if (action === 'refuse') expect(tools.find(tool => tool.name === 'resize_clip')).toMatchObject({ isError: true })
      const expected = structuredClone(before!)
      if (applied) {
        expected.composition!.scenes[0].zones[0].main[0].durationMs = 12000
        expected.composition!.scenes[0].zones[0].main[1].startMs = 16000
      } else if (manual) expected.composition!.scenes[0].zones[0].main[0].durationMs = 7000
      if (applied || manual) await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === (applied ? 12000 : 7000))
      const after = await visibleRecord(page)
      expect(after).toEqual({ ...expected, updatedAt: applied || manual ? after!.updatedAt : before!.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(applied || manual ? after : durableBefore)
      expect(completeWrites).toEqual(applied || manual ? [wireRecord(after)] : [])
      await page.keyboard.press('Escape')
      if (applied) {
        await page.getByRole('button', { name: 'Show actions' }).click()
        const download = page.waitForEvent('download')
        await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
        const file = await download
        const reopened = await page.evaluate(async bytes => {
          const load = (path: string) => import(path)
          const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
          return parseShowFileBundle(new Uint8Array(bytes))
        }, [...readFileSync((await file.path())!)])
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
        expect(completeWrites).toEqual([after, undone, redone].map(wireRecord))
      } else {
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Redo Show edit' })).toBeDisabled()
      }
      saveRecord(`MR-${action}`, { before, after, done, completeWrites, writes, durable: await durableShow(page, record.id), observations: await readObservations(page) })
      page.off('request', captureWrite)
    }
  })

  test('B5: explicit stable resize retry preserves manual work and composer history', async ({ page }) => {
    test.setTimeout(180000)
    const wire = (show: PersistedShow | undefined) => Object.fromEntries(Object.entries({ ...show, targetControllerProfileId: (show as ShowRecord)?.targetControllerProfileId ?? null }).filter(([key]) => key !== 'id'))
    for (const action of ['apply', 'narrow', 'deleted', 'dismiss', 'cancel'] as const) {
      await page.setViewportSize({ width: action === 'narrow' || action === 'dismiss' ? 800 : 1440, height: 900 })
      const record = resizeBoundaryShow(`retry-${action}-${Date.now().toString(36)}`)
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        return (await load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')).useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      const before = await visibleRecord(page)
      const completeWrites: unknown[] = []
      const requests: Record<string, unknown>[] = []
      const capture = (request: Request) => {
        if (request.method() === 'PATCH' && request.url().endsWith(`/api/shows/${record.id}`)) completeWrites.push(request.postDataJSON())
        if (request.method() === 'POST' && request.url() === `${bridge.url}/utterance`) requests.push(request.postDataJSON())
      }
      page.on('request', capture)
      try {
        const first = await submitUtterance(page, 'make the first Clip exactly eight seconds')
        await waitForAccepted(page, first)
        await page.locator('[data-show-selection-key="clip:resize-a"]').click()
        const start = page.getByRole('textbox', { name: 'Start seconds exact time' })
        await start.fill('12')
        await start.press('Enter')
        await page.keyboard.press('Escape')
        const failed = await waitForDone(page, first)
        expect(failed).toMatchObject({ applied: false, outcome: { status: 'refused', reason: 'revision-conflict' } })
        await expect(page.getByTestId('agent-chat-retry')).toBeVisible()
        await page.locator('[data-show-selection-key="clip:resize-b"]').click()
        await page.keyboard.press('Escape')
        if (action === 'deleted') {
          await page.locator('[data-show-selection-key="clip:resize-a"]').click()
          await page.getByRole('button', { name: 'Delete clip CometLoom' }).click()
        }
        const manual = await visibleRecord(page)
        await expect.poll(() => durableShow(page, record.id)).toEqual(manual)
        const writesBeforeRetry = completeWrites.length
        const composer = page.getByTestId('agent-chat-input')
        await composer.fill('Keep this unrelated draft')
        await composer.press('Home')
        await composer.press('ArrowRight')
        await composer.press('Shift+ArrowRight')
        const selection = await composer.evaluate(element => [(element as HTMLInputElement).selectionStart, (element as HTMLInputElement).selectionEnd])
        expect(requests).toHaveLength(1)
        await page.screenshot({ path: join(REPORT_DIR, `B5-${action}-ready.png`), fullPage: true })
        if (action === 'dismiss') {
          await page.getByTestId('agent-chat-dismiss').click()
          await expect(page.getByTestId('agent-chat-retry')).toHaveCount(0)
          await expect(page.getByTestId('agent-chat-log')).toContainText('revision-conflict')
          expect(requests).toHaveLength(1)
        } else {
          await page.getByTestId('agent-chat-retry').click()
          await expect.poll(() => requests.length).toBe(2)
          const retryId = (await overlayRequests(page))[1].requestId
          expect(retryId).not.toBe(first)
          expect(requests[1]).toMatchObject({ retryResize: { clipId: 'resize-a', durationMs: 8000 }, utterance: requests[0].utterance, history: requests[0].history, context: requests[0].context })
          expect(requests[1].show).toEqual(manual)
          if (action === 'cancel') await page.evaluate(() => (window as unknown as { __pxlblzChat: { cancel: () => void } }).__pxlblzChat.cancel())
          const done = await waitForDone(page, retryId)
          const applied = action === 'apply' || action === 'narrow'
          expect(done.applied).toBe(applied ? true : action === 'deleted' ? null : false)
          if (applied) {
            const after = await visibleRecord(page)
            const expected = structuredClone(manual!)
            expected.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'resize-a')!.durationMs = 8000
            expect(after).toEqual({ ...expected, updatedAt: after!.updatedAt })
            await expect.poll(() => durableShow(page, record.id)).toEqual(after)
            expect(completeWrites.slice(writesBeforeRetry)).toEqual([wire(after)])
            await expect(composer).toHaveValue('Keep this unrelated draft')
            await expect(composer).toBeFocused()
            expect(await composer.evaluate(element => [(element as HTMLInputElement).selectionStart, (element as HTMLInputElement).selectionEnd])).toEqual(selection)
            await page.screenshot({ path: join(REPORT_DIR, `B5-${action}-applied.png`), fullPage: true })
            await page.getByRole('button', { name: 'Show actions' }).click()
            const download = page.waitForEvent('download')
            await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
            const file = await download
            const reopened = await page.evaluate(async bytes => {
              const load = (path: string) => import(path)
              return (await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')).parseShowFileBundle(new Uint8Array(bytes))
            }, [...readFileSync((await file.path())!)])
            expect(reopened.show).toEqual(after)
            await page.getByRole('button', { name: 'Undo Show edit' }).click()
            await expect.poll(async () => (await visibleRecord(page))?.composition?.scenes[0].zones[0].main.find(clip => clip.id === 'resize-a')?.durationMs).toBe(4000)
            const undone = await visibleRecord(page)
            expect(undone).toEqual({ ...manual, updatedAt: undone!.updatedAt })
            await expect.poll(() => durableShow(page, record.id)).toEqual(undone)
            saveRecord(`B5-${action}-export`, reopened)
          } else {
            expect(await visibleRecord(page)).toEqual(manual)
            expect(await durableShow(page, record.id)).toEqual(manual)
            expect(completeWrites.length).toBe(writesBeforeRetry)
          }
        }
        await expect(composer).toHaveValue('Keep this unrelated draft')
        await page.screenshot({ path: join(REPORT_DIR, `B5-${action}-result.png`), fullPage: true })
        saveRecord(`B5-${action}`, { before, manual, after: await visibleRecord(page), durable: await durableShow(page, record.id), requests, completeWrites, outcomes: await overlayRequests(page) })
      } finally { page.off('request', capture) }
    }
  })

  test('PP: private pair overlap saves one complete record and rejects stale or incomplete delivery', async ({ page }) => {
    test.setTimeout(120000)
    for (const action of ['apply', 'incomplete', 'stale'] as const) {
      const record = resizeBoundaryShow(`private-pair-${action}-${Date.now().toString(36)}`)
      record.composition!.scenes[0].zones[0].main[1].durationMs = 6000
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const { useEntityOrganizationStore } = await load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')
        return useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      const before = await visibleRecord(page)
      const durableBefore = await durableShow(page, record.id)
      const completeWrites: unknown[] = []
      const captureWrite = (request: Request) => {
        if (request.method() === 'PATCH' && request.url().endsWith(`/api/shows/${record.id}`)) completeWrites.push(request.postDataJSON())
      }
      page.on('request', captureWrite)
      const id = await submitUtterance(page, action === 'incomplete' ? 'leave the private overlap incomplete' : 'swap the two plain Clips through a private overlap')
      expect(await visibleRecord(page)).toEqual(before)
      expect(await durableShow(page, record.id)).toEqual(durableBefore)
      expect(completeWrites).toEqual([])
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      if (action === 'stale') {
        await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
        const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
        await duration.fill('7')
        await duration.press('Enter')
      }
      const done = await waitForDone(page, id)
      if (action === 'incomplete') expect(done).toMatchObject({ changed: false, applied: null })
      else expect(done.applied, JSON.stringify(done)).toBe(action === 'apply')
      const expected = structuredClone(before!)
      const clips = expected.composition!.scenes[0].zones[0].main
      if (action === 'apply') {
        expected.composition!.scenes[0].zones[0].main = [{ ...clips[1], startMs: 0 }, { ...clips[0], startMs: 8000 }]
      } else if (action === 'stale') clips[0].durationMs = 7000
      if (action !== 'incomplete') await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === (action === 'apply' ? 6000 : 7000))
      const after = await visibleRecord(page)
      expect(after).toEqual({ ...expected, updatedAt: action === 'incomplete' ? before!.updatedAt : after!.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(action === 'incomplete' ? durableBefore : after)
      const wire = (show: ShowRecord | null) => Object.fromEntries(Object.entries({ ...show, targetControllerProfileId: show?.targetControllerProfileId ?? null }).filter(([key]) => key !== 'id'))
      expect(completeWrites).toEqual(action === 'incomplete' ? [] : [wire(after)])
      await page.keyboard.press('Escape')
      if (action === 'apply') {
        await page.getByRole('button', { name: 'Show actions' }).click()
        const download = page.waitForEvent('download')
        await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
        const file = await download
        const reopened = await page.evaluate(async bytes => {
          const load = (path: string) => import(path)
          const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
          return parseShowFileBundle(new Uint8Array(bytes))
        }, [...readFileSync((await file.path())!)])
        expect(reopened.show).toEqual(after)
        saveRecord('PP-export', reopened)
      }
      await page.screenshot({ path: join(REPORT_DIR, `PP-${action}.png`), fullPage: true })
      if (action !== 'incomplete') {
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await waitForDurable(page, record.id, show => firstMain(show)?.durationMs === 4000)
        const undone = await visibleRecord(page)
        expect(undone).toEqual({ ...before, updatedAt: undone!.updatedAt })
        expect(await durableShow(page, record.id)).toEqual(undone)
        await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      }
      saveRecord(`PP-${action}`, { before, after, done, completeWrites, durable: await durableShow(page, record.id) })
      page.off('request', captureWrite)
    }
  })

  test('F: a multi-operation reply lands as one history entry and one save', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShow(page)
    await injectOverlay(page, bridge.url)

    const requestId = await submitUtterance(page, BATCH_UTTERANCE)
    const request = await waitForDone(page, requestId)
    expect(request.applied).toBe(true)
    const visible = await visibleClipFacts(page, 'TestPattern1D')
    expect(visible).toEqual({ durationSeconds: '12', brightnessPercent: '50' })
    await waitForDurable(page, showId, (show) => firstMain(show)?.durationMs === 12_000 && firstMain(show)?.brightness === 0.5)
    const patches = writes.filter((write) => write.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0].firstMain).toEqual({ durationMs: 12_000, brightness: 0.5 })

    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    expect(await visibleClipFacts(page, 'TestPattern1D')).toEqual({ durationSeconds: '30', brightnessPercent: '100' })
    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    expect(await visibleClipFacts(page, 'TestPattern1D')).toEqual({ durationSeconds: '12', brightnessPercent: '50' })

    const observations = await readObservations(page)
    const tools = ((request.bridgeTiming ?? {}) as { toolCalls?: Array<{ name: string }> }).toolCalls?.map((call) => call.name)
    // The scripted agent re-reads the Show before each placeholder; the
    // mutating calls are the two operations of the one committed turn.
    expect(tools?.filter((name) => name !== 'describe_show')).toEqual(['resize_clip', 'set_clip_view'])
    await page.screenshot({ path: join(REPORT_DIR, 'F-batch.png'), fullPage: true })
    saveRecord('F-batch', { showId, request, writes, observations, visible, timeline: phaseTimeline(request, observations, writes) })
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
    const created = await api.post('/api/shows', { data: record })
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
    const before = await visibleRecord(page) as unknown as ShowRecord
    expect(before.composition).toBeUndefined()
    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    const sentBody = (await sent).postDataJSON() as { show: ShowRecord }
    const request = await waitForDone(page, requestId)
    expect(sentBody.show.composition).toBeDefined()
    expect(request.applied, JSON.stringify(request)).toBe(true)
    const visible = await visibleClipFacts(page, BASELINE_LIBRARY_PATTERN.name)
    expect(visible.durationSeconds).toBe('12')
    await waitForDurable(page, record.id, (show) => firstMain(show)?.durationMs === 12_000)
    const current = await visibleRecord(page) as unknown as ShowRecord
    const expected = structuredClone(sentBody.show)
    expected.composition!.scenes[0].zones[0].main[0].durationMs = 12_000
    expect(current).toEqual({ ...expected, updatedAt: current.updatedAt })
    expect(await durableShow(page, record.id)).toEqual(current)
    expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Show actions' }).click()
    const downloaded = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
    const file = await downloaded
    const reopened = await page.evaluate(async bytes => {
      const load = (path: string) => import(path)
      const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
      return parseShowFileBundle(new Uint8Array(bytes))
    }, [...readFileSync((await file.path())!)])
    expect(reopened.show).toEqual(current)
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
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
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
      const before = await visibleRecord(page) as unknown as ShowRecord
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
      await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for active editing')
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
      await expect.poll(() => writes.filter(write => write.method === 'PATCH' && write.status === 200).length).toBe(1)
      const current = await visibleRecord(page) as unknown as ShowRecord
      const expected = structuredClone(before)
      const expectedClip = expected.composition!.scenes[0].zones[0].main[0]
      if (action.endsWith('cancel')) expectedClip.durationMs = 8000
      else if (placement) {
        const transform = current.composition!.scenes[0].zones[0].main[0].transform!
        expect(transform.positionX).toBeGreaterThan(0)
        expectedClip.transform = transform
      } else expectedClip.effects = [expectedClip.effects![1], expectedClip.effects![0]]
      expect(current).toEqual({ ...expected, updatedAt: current.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(current)
      expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
      await page.screenshot({ path: join(REPORT_DIR, `DA-${action}-saved.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Show actions' }).click({ timeout: 15000 })
      const downloaded = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await downloaded
      const reopened = await page.evaluate(async bytes => {
        const load = (path: string) => import(path)
        const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
        return parseShowFileBundle(new Uint8Array(bytes))
      }, [...readFileSync((await file.path())!)])
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
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        const [p, l, m] = await Promise.all(['pattern', 'library', 'map'].map(name => load(`/PXLBLZ-IDE/src/store/${name}Store.ts`)))
        return p.usePatternStore.getState().patternsLoaded && l.useLibraryStore.getState().librariesLoaded && m.useMapStore.getState().mapsLoaded
      })).toBe(true)
      await injectOverlay(page, bridge.url)
      const open = page.getByRole('button', { name: 'Open Zones', exact: true })
      if (await open.count()) await open.click()
      await page.getByRole('button', { name: 'Open zone Main properties' }).click()
      await page.getByRole('button', { name: 'Select Main LEDs on output map' }).click()
      const surface = page.getByRole('img', { name: 'Select LEDs for zone Main' })
      await expect(surface).toBeVisible()
      const before = await visibleRecord(page) as unknown as ShowRecord
      const durableBefore = await durableShow(page, record.id)
      const writes = watchShowWrites(page)
      let done: unknown
      if (action === 'clean') {
        // The current scripted grammar has no physical-range operation. This
        // case uses the existing diagnostic adapter with a complete candidate.
        await surface.focus()
        done = await page.evaluate(() => {
          const editor = (window as unknown as { __pxlblzEditor: {
            beginRequest: (id: string, utterance: string, history: unknown[]) => { show: ShowRecord; request: unknown }
            applyShow: (show: ShowRecord, request: unknown) => unknown
          } }).__pxlblzEditor
          const captured = editor.beginRequest('clean-spatial', 'Change physical indexes', [])
          const candidate = structuredClone(captured.show)
          candidate.routingLayouts[0].zones[0].ranges = [{ start: 1, end: 2 }]
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
        await expect(page.getByTestId('agent-chat-log')).toContainText('Waiting for active editing')
        expect(await visibleRecord(page)).toEqual(before)
        expect(await durableShow(page, record.id)).toEqual(durableBefore)
        expect(writes).toHaveLength(0)
        await page.screenshot({ path: join(REPORT_DIR, `SA-${action}-waiting.png`), fullPage: true })
        await page.getByRole('button', { name: action === 'save' ? 'Save physical zone' : 'Zone properties', exact: true }).click()
        done = await waitForDone(page, id)
        expect((done as OverlayRequest).applied).toBe(action !== 'save')
      }
      const writeCount = action === 'clean' ? 2 : 1
      await expect.poll(() => writes.filter(write => write.method === 'PATCH' && write.status === 200).length).toBe(writeCount)
      const current = await visibleRecord(page) as unknown as ShowRecord
      const expected = structuredClone(before)
      if (action === 'clean') expected.routingLayouts[0].zones[0].ranges = [{ start: 1, end: 2 }]
      else if (action === 'save') expected.routingLayouts[0].zones[0].ranges = [{ start: 1, end: 1 }]
      else expected.composition!.scenes[0].zones[0].main[0].durationMs = 8000
      expect(current).toEqual({ ...expected, updatedAt: current.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(current)
      expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(writeCount)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Show actions' }).click()
      const delivery = page.getByRole('menuitem', { name: 'Download .epe', exact: true })
      await expect(delivery).toBeDisabled()
      const downloaded = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await downloaded
      const reopened = await page.evaluate(async bytes => {
        const load = (path: string) => import(path)
        const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
        return parseShowFileBundle(new Uint8Array(bytes))
      }, [...readFileSync((await file.path())!)])
      expect(reopened.show).toEqual(current)
      await page.screenshot({ path: join(REPORT_DIR, `SA-${action}-saved.png`), fullPage: true })
      if (action === 'clean') await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
      await expect(page.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
      expect(pageErrors).toEqual([])
      saveRecord(`SA-${action}`, { boundary: action === 'clean' ? 'direct diagnostic adapter' : 'scripted bridge', before, durableBefore, done, current, reopened: reopened.show, writes, pageErrors })
    }
  })

  const admissionCases: Array<{
    id: string
    command: string
    args: Record<string, unknown>
    utterance: string
    fixture: () => ShowRecord
    expectedFacts: (before: ShowRecord) => ShowRecord
    unchangedUtterances?: string[]
    staleCommand?: { command: string; args: Record<string, unknown> }
    toolbarSplit?: { atMs: number; clipId: string | null; accepted: boolean }
  }> = [
    ...[
      { id: 'V953', command: 'set_clip_view', args: { clip_id: 'clip-ov', mirror: true, phase: 0.25, brightness: 0.5 }, utterance: 'dim and mirror the overlay Clip' },
      { id: 'C953', command: 'set_clip_control_target', args: { clip_id: 'clip-a', export_name: 'sliderSpeed', value: 0.75 }, utterance: 'set the first Clip speed control to three quarters' },
      { id: 'T953', command: 'set_clip_time', args: { clip_id: 'clip-a', time_scale: 0.5, time_offset_ms: 250 }, utterance: 'slow the first Clip shared instance to half speed' },
      { id: 'E953', command: 'set_clip_evaluation', args: { clip_id: 'clip-a', policy: 'freeze-at-entry' }, utterance: 'freeze the first Clip shared instance at entry' },
    ].map(row => ({
      ...row,
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `${row.id.toLowerCase()}-${Date.now().toString(36)}`; return record },
      expectedFacts: (before: ShowRecord) => {
        const expected = structuredClone(before)
        const composition = expected.composition!
        if (row.id === 'V953') composition.scenes[0].zones[0].overlays[0].placements[0].view = { mirror: true, phase: 0.25, brightness: 0.5 }
        if (row.id === 'C953') composition.patternInstances[0].controlTargets = { sliderSpeed: 0.75 }
        if (row.id === 'T953') composition.patternInstances[0].time = { timeScale: 0.5, timeOffsetMs: 250 }
        if (row.id === 'E953') composition.patternInstances[0].evaluationPolicy = 'freeze-at-entry'
        return expected
      },
    })),

    {
      id: 'ILT952', command: 'insert_layer_transition', args: { from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 1500, easing: 'ease-in' },
      utterance: 'insert a fifteen hundred millisecond Layer crossfade with ease in',
      fixture: () => { const record = showLayerTransitionCommandFixture(); record.id = `layer-insert-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'clip-b')!.startMs = 11500
        for (const track of expected.composition!.scenes[0].propertyTracks ?? []) if (['track-b', 'track-inst-b'].includes(track.id)) for (const key of track.keyframes) key.timeMs += 1500
        expected.composition!.transitions = [{ id: 'transition-1', fromPlacementId: 'clip-a', toPlacementId: 'clip-b', kind: 'crossfade', durationMs: 1500, easing: { curve: 'quadratic', direction: 'in' }, crossfadePolicy: 'snapshot-live' }]
        return expected
      },
    },
    {
      id: 'RLT952', command: 'resize_layer_transition', args: { transition_id: 'connected-transition', duration_ms: 1500 },
      utterance: 'make the overlay Layer Transition fifteen hundred milliseconds',
      fixture: () => { const record = showLayerTransitionCommandFixture(true, true); record.id = `layer-resize-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition!.scenes[0].zones[0].overlays[0].placements.find(clip => clip.id === 'clip-b')!.startMs = 11500
        for (const track of expected.composition!.scenes[0].propertyTracks ?? []) if (['track-b', 'track-inst-b'].includes(track.id)) for (const key of track.keyframes) key.timeMs += 500
        expected.composition!.transitions![0].durationMs = 1500
        return expected
      },
    },
    {
      id: 'RLC952', command: 'reset_layer_transition_to_cut', args: { transition_id: 'connected-transition' },
      utterance: 'reset the Layer Transition to Cut',
      fixture: () => { const record = showLayerTransitionCommandFixture(false, true); record.id = `layer-cut-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'clip-b')!.startMs = 10000
        for (const track of expected.composition!.scenes[0].propertyTracks ?? []) if (['track-b', 'track-inst-b'].includes(track.id)) for (const key of track.keyframes) key.timeMs -= 1000
        expected.composition!.transitions = []
        return expected
      },
    },
    {
      id: 'CCR952', command: 'resize_clip', args: { clip_id: 'clip-b', duration_ms: 9000 },
      utterance: 'make the connected overlay Clip nine seconds',
      fixture: () => { const record = showLayerTransitionCommandFixture(true, true); record.id = `connected-resize-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => { const expected = structuredClone(before); expected.composition!.scenes[0].zones[0].overlays[0].placements.find(clip => clip.id === 'clip-b')!.durationMs = 9000; return expected },
    },
    {
      id: 'BT952', command: 'set_boundary_transition', args: { transition_id: 'transition-scene-1', kind: 'fade-color', variant: 'through-color', duration_ms: 1500 },
      utterance: 'make the Boundary fade through black over fifteen hundred milliseconds',
      fixture: () => { const record = showBoundaryCommandFixture(); record.id = `boundary-kind-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => { const expected = structuredClone(before); expected.transitions[0] = { id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'fade-color', durationMs: 1500, easing: { curve: 'linear' }, color: '#000000' }; return expected },
    },
    {
      id: 'BTT952', command: 'set_boundary_transition_timing', args: { transition_id: 'transition-scene-1', duration_ms: 1500, easing: 'ease-in' },
      utterance: 'set the Boundary to fifteen hundred milliseconds with ease in',
      fixture: () => { const record = showBoundaryCommandFixture(); record.id = `boundary-timing-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => { const expected = structuredClone(before); expected.transitions[0].durationMs = 1500; expected.transitions[0].easing = { curve: 'quadratic', direction: 'in' }; return expected },
    },
    {
      id: 'BTP952', command: 'update_boundary_transition_parameter', args: { transition_id: 'transition-scene-1', parameter: 'easing', value: 'sine-in' },
      utterance: 'set the Boundary easing parameter to sine in',
      fixture: () => { const record = showBoundaryCommandFixture(); record.id = `boundary-parameter-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => { const expected = structuredClone(before); expected.transitions[0].easing = { curve: 'sine', direction: 'in' }; return expected },
    },
    {
      id: 'BL952', command: 'set_boundary_layout', args: { transition_id: 'transition-scene-1', layout_id: 'layout-2' },
      utterance: 'switch to the second Layout at the Boundary',
      fixture: () => { const record = showBoundaryCommandFixture(); record.id = `boundary-layout-952-${Date.now().toString(36)}`; return record },
      expectedFacts: before => { const expected = structuredClone(before); expected.transitions.push({ id: 'routing-scene-1', afterSceneId: 'scene-1', kind: 'routing', durationMs: 0, easing: { curve: 'linear' }, layoutId: 'layout-2' }); return expected },
    },

    {
      id: 'AC951',
      command: 'add_clip',
      args: { zone_id: 'zone-1', start_ms: 29000, duration_ms: 1000, overlay_layer_index: 0, pattern_kind: 'stock', pattern_id: 'CometLoom' },
      utterance: 'add CometLoom to the overlay at twenty nine seconds',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `add-951-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition!.patternInstances.unshift({ id: 'instance-1', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom', time: { timeScale: 1, timeOffsetMs: 0 } })
        expected.composition!.scenes[0].zones[0].overlays[0].placements.push({ id: 'clip-1', instanceId: 'instance-1', startMs: 29000, durationMs: 1000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } })
        return expected
      },
    },
    {
      id: 'IC951',
      command: 'make_clip_pattern_independent',
      args: { clip_id: 'clip-c' },
      utterance: 'make the third Clip Pattern independent',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `independent-951-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition!.patternInstances.unshift({ ...structuredClone(before.composition!.patternInstances.find(instance => instance.id === 'instance-a')!), id: 'instance-1' })
        expected.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'clip-c')!.instanceId = 'instance-1'
        const original = before.composition!.scenes[0].propertyTracks!.find(track => track.id === 'track-inst')!
        expected.composition!.scenes[0].propertyTracks!.push({ ...structuredClone(original), id: 'track-inst-instance-1', target: { kind: 'instance-time-scale', instanceId: 'instance-1' }, keyframes: original.keyframes.map(keyframe => ({ ...structuredClone(keyframe), id: `${keyframe.id}-instance-1` })) })
        return expected
      },
    },
    {
      id: 'RJ951',
      command: 'rejoin_clip_pattern_instance',
      args: { clip_id: 'clip-b', target_clip_id: 'clip-a' },
      utterance: 'rejoin the second Clip to the first Pattern instance',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `rejoin-951-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.composition!.patternInstances = expected.composition!.patternInstances.filter(instance => instance.id !== 'instance-b')
        expected.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'clip-b')!.instanceId = 'instance-a'
        expected.composition!.scenes[0].propertyTracks = expected.composition!.scenes[0].propertyTracks!.filter(track => track.id !== 'track-inst-b')
        return expected
      },
    },
    {
      id: 'IT951',
      command: 'insert_time',
      args: { at_ms: 29000, duration_ms: 1000 },
      utterance: 'insert one second at twenty nine seconds',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `insert-time-951-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.scenes[0].durationMs += 1000
        expected.composition!.durationMs = 63000
        return expected
      },
    },
    {
      id: 'SE951',
      command: 'set_show_end',
      args: { end_ms: 70000 },
      utterance: 'set Show End to seventy seconds',
      fixture: () => { const record = showOverlayLayerFixture(); record.id = `show-end-951-${Date.now().toString(36)}`; return record },
      expectedFacts: before => {
        const expected = structuredClone(before)
        expected.scenes[1].durationMs = 38000
        expected.composition!.durationMs = 70000
        return expected
      },
    },
    {
      id: 'M951',
      command: 'move_clip',
      args: { clip_id: 'resize-b', start_ms: 6000 },
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
      expectedFacts: (before: ShowRecord) => {
        const expected = structuredClone(before)
        expected.composition!.scenes[0].zones[0].main[0].startMs = 3000
        expected.composition!.scenes[0].zones[0].main[1].startMs = 6000
        return expected
      },
      unchangedUtterances: ['keep the connected second Clip at six seconds', 'move the connected second Clip to overlay zero']
    },
    {
      id: 'RC951',
      command: 'remove_clip',
      args: { clip_id: 'clip-b' },
      utterance: 'remove the connected target Clip',
      fixture: () => {
        const record = showRemoveClipFixture()
        record.id = `remove-951-${Date.now().toString(36)}`
        return record
      },
      expectedFacts: (before: ShowRecord) => {
        const expected = structuredClone(before)
        expected.composition!.scenes[0].zones[0].main.splice(1, 1)
        expected.composition!.patternInstances.splice(1, 1)
        expected.composition!.scenes[0].propertyTracks = [expected.composition!.scenes[0].propertyTracks![1]]
        expected.composition!.transitions = []
        delete expected.composition!.executionModel
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
      expectedFacts: splitFixtureExpected
    },
    {
      id: 'DC951',
      command: 'duplicate_clip',
      args: { clip_id: 'clip-ov' },
      utterance: 'duplicate the overlay Clip independently',
      fixture: () => {
        const record = showSplitClipFixture()
        record.id = `duplicate-951-${Date.now().toString(36)}`
        return record
      },
      expectedFacts: (before: ShowRecord) => {
        const expected = structuredClone(before)
        expected.composition!.patternInstances.unshift({ ...structuredClone(before.composition!.patternInstances.find(instance => instance.id === 'instance-ov')!), id: 'instance-1' })
        expected.composition!.scenes[0].zones[0].overlays[0].placements.push({ id: 'clip-1', instanceId: 'instance-1', startMs: 8000, durationMs: 6000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } })
        return expected
      }
    },
    {
      id: 'L951',
      command: 'add_overlay_layer',
      args: { zone_id: 'zone-1' },
      utterance: 'add a topmost overlay Layer',
      fixture: () => {
        const record = showOverlayLayerFixture()
        record.composition!.scenes[1].zones[0].overlays = []
        record.id = `layer-951-${Date.now().toString(36)}`
        return record
      },
      expectedFacts: (before: ShowRecord) => {
        const expected = structuredClone(before)
        expected.composition!.scenes[1].zones[0].overlays = [{ id: 'scene-2:zone-1:group-layer:1', name: 'Layer 1', placements: [] }]
        expected.composition!.scenes[0].zones[0].overlays.unshift({ id: 'layer-1', name: 'Layer 3', placements: [] })
        expected.composition!.scenes[1].zones[0].overlays.unshift({ id: 'layer-2', name: 'Layer 3', placements: [] })
        return expected
      },
      staleCommand: { command: 'add_clip', args: { zone_id: 'zone-1', overlay_layer_index: 0, start_ms: 0, duration_ms: 1000, pattern_kind: 'stock', pattern_id: 'CometLoom' } }
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
      expectedFacts: (before: ShowRecord) => {
        const expected = structuredClone(before)
        expected.composition!.markers!.push({ id: 'marker-2', timeMs: 9000, name: 'Final', color: '#38bdf8' })
        return expected
      },
      unchangedUtterances: ['keep the final marker unchanged', 'remove the missing marker']
    },
    ...[
      { partition: 'Main', atMs: 16000, clipId: 'clip-b', accepted: true },
      { partition: 'overlay', atMs: 5000, clipId: 'clip-ov', accepted: true },
      { partition: 'gap', atMs: 45000, clipId: null, accepted: false },
      { partition: 'Cut', atMs: 30000, clipId: 'clip-b', accepted: false },
    ].map(toolbarSplit => ({
      id: `S992-${toolbarSplit.partition}`,
      command: 'split_clip',
      args: { clip_id: toolbarSplit.clipId, at_ms: toolbarSplit.atMs },
      utterance: '',
      toolbarSplit,
      fixture: () => {
        const record = showSplitClipFixture()
        record.id = `toolbar-split-${toolbarSplit.partition.toLowerCase()}-${Date.now().toString(36)}`
        if (toolbarSplit.partition === 'overlay') {
          record.composition!.scenes[0].zones[0].main.shift()
          record.composition!.transitions!.shift()
        }
        return record
      },
      expectedFacts: (before: ShowRecord) => {
        if (!toolbarSplit.accepted) return structuredClone(before)
        if (toolbarSplit.partition === 'Main') return splitFixtureExpected(before, TOOLBAR_SPLIT_ID)
        const expected = structuredClone(before)
        const clips = expected.composition!.scenes[0].zones[0].overlays[0].placements
        clips[0].durationMs = 3000
        clips.push({ id: TOOLBAR_SPLIT_ID, instanceId: 'instance-ov', startMs: 5000, durationMs: 3000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } })
        return expected
      },
    }))
  ]

  // The table owns operation facts; this sequence owns the live admission contract.
  for (const admission of admissionCases) {
    test(`${admission.id}: ${admission.toolbarSplit ? 'toolbar Split matches selected Split or refuses without saving' : 'command admission saves once, reopens, undoes, refuses stale and deduplicates'}`, async ({ page }) => {
      test.setTimeout(90000)
      await page.setViewportSize({ width: 1440, height: 900 })
      const record = admission.fixture()
      expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
      await page.goto(`studio/shows/${record.id}?agent=1`)
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      await expect.poll(() => page.evaluate(async () => {
        const load = (path: string) => import(path)
        return (await load('/PXLBLZ-IDE/src/store/entityOrganizationStore.ts')).useEntityOrganizationStore.getState().loaded.libraries
      })).toBe(true)
      if (!admission.toolbarSplit) await injectOverlay(page, bridge.url)
      const before = (await visibleRecord(page)) as unknown as ShowRecord
      const writes = watchShowWrites(page)
      const successfulSaves = () => writes.filter(write => write.method === 'PATCH' && write.status === 200).length
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
      const accepted = admission.toolbarSplit?.accepted ?? true
      await expect.poll(successfulSaves).toBe(accepted ? 1 : 0)
      const after = (await visibleRecord(page)) as unknown as ShowRecord
      expect(after).toEqual({ ...admission.expectedFacts(before), updatedAt: after.updatedAt })
      expect(await durableShow(page, record.id)).toEqual(after)
      expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(accepted ? 1 : 0)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Show actions' }).click()
      const download = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
      const file = await download
      const reopened = await page.evaluate(async bytes => {
        const load = (path: string) => import(path)
        return (await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')).parseShowFileBundle(new Uint8Array(bytes))
      }, [...readFileSync((await file.path())!)])
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
        expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
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
        expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(saveCount)
        await page.getByRole('button', { name: 'Undo Show edit' }).click()
        await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
        await expect.poll(successfulSaves).toBe(++saveCount)
        expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
        saveRecord(admission.id, { before, after, selected, writes, reopened })
        return
      }
      // Capture before the real manual Add menu changes the Show revision.
      await page.evaluate(async ({ id, command, args }) => {
        const load = (path: string) => import(path)
        const { applyShowCommand } = await load('/PXLBLZ-IDE/src/engine/showCommands/registry.ts')
        const win = window as unknown as { __pxlblzEditor: { beginRequest: (id: string, text: string, history: unknown[]) => { request: unknown; show: ShowRecord } }; __admissionPending?: unknown }
        const captured = win.__pxlblzEditor.beginRequest(`${id}-stale`, command, [])
        const { usePatternStore } = await load('/PXLBLZ-IDE/src/store/patternStore.ts')
        const { useLibraryStore } = await load('/PXLBLZ-IDE/src/store/libraryStore.ts')
        const { DEMOS, resolveStockPatternId } = await load('/PXLBLZ-IDE/src/pixelblaze/stock/patterns.ts')
        const { LIBRARIES } = await load('/PXLBLZ-IDE/src/pixelblaze/libs.ts')
        const patterns = structuredClone(usePatternStore.getState().userPatterns) as Array<{ id: string; src: string }>
        const libraries = structuredClone(useLibraryStore.getState().userLibraries) as Array<{ name: string; src: string }>
        const context = {
          source: (ref: { kind: string; id: string }) => ref.kind === 'stock' ? DEMOS[resolveStockPatternId(ref.id)] : patterns.find(pattern => pattern.id === ref.id)?.src,
          libraries: { ...LIBRARIES, ...Object.fromEntries(libraries.map(library => [library.name, library.src])) },
        }
        const outcome = applyShowCommand(captured.show, command, args, context)
        if (!outcome.ok) throw new Error(JSON.stringify(outcome))
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
      expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(saveCount)
      const duplicate = await page.evaluate(async ({ id, command, args }) => {
        const load = (path: string) => import(path)
        const { applyShowCommand } = await load('/PXLBLZ-IDE/src/engine/showCommands/registry.ts')
        const api = (window as unknown as { __pxlblzEditor: { beginRequest: (id: string, text: string, history: unknown[]) => { request: unknown; show: ShowRecord }; applyShow: (show: unknown, request: unknown) => Promise<unknown> } }).__pxlblzEditor
        const captured = api.beginRequest(`${id}-duplicate`, command, [])
        const { usePatternStore } = await load('/PXLBLZ-IDE/src/store/patternStore.ts')
        const { useLibraryStore } = await load('/PXLBLZ-IDE/src/store/libraryStore.ts')
        const { DEMOS, resolveStockPatternId } = await load('/PXLBLZ-IDE/src/pixelblaze/stock/patterns.ts')
        const { LIBRARIES } = await load('/PXLBLZ-IDE/src/pixelblaze/libs.ts')
        const patterns = structuredClone(usePatternStore.getState().userPatterns) as Array<{ id: string; src: string }>
        const libraries = structuredClone(useLibraryStore.getState().userLibraries) as Array<{ name: string; src: string }>
        const context = {
          source: (ref: { kind: string; id: string }) => ref.kind === 'stock' ? DEMOS[resolveStockPatternId(ref.id)] : patterns.find(pattern => pattern.id === ref.id)?.src,
          libraries: { ...LIBRARIES, ...Object.fromEntries(libraries.map(library => [library.name, library.src])) },
        }
        const outcome = applyShowCommand(captured.show, command, args, context)
        if (!outcome.ok) throw new Error(JSON.stringify(outcome))
        return { first: await api.applyShow(outcome.record, captured.request), second: await api.applyShow(outcome.record, captured.request) }
      }, { id: admission.id, command: admission.command, args: admission.args })
      expect(duplicate.first).toMatchObject({ status: 'applied' })
      expect(duplicate.second).toMatchObject({ status: 'applied' })
      await expect.poll(successfulSaves).toBe(++saveCount)
      expect(writes.filter(write => write.method === 'PATCH')).toHaveLength(saveCount)
      expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
      await page.getByRole('button', { name: 'Undo Show edit' }).click()
      await expect.poll(() => visibleRecord(page)).toEqual({ ...manual, updatedAt: expect.any(Number) })
      await expect.poll(successfulSaves).toBe(saveCount + 1)
      expect(await durableShow(page, record.id)).toEqual(await visibleRecord(page))
      saveRecord(admission.id, { before, after, done, manual, stale, duplicate, writes, observations: await readObservations(page) })
    })
  }


  test('SC951-overlay: manual overlay split persists after a Main split and Undo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const record = showSplitClipFixture()
    record.id = `split-overlay-951-${Date.now().toString(36)}`
    expect((await page.context().request.post('/api/shows', { data: record })).ok()).toBe(true)
    await page.goto(`studio/shows/${record.id}?agent=1`)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    const before = await visibleRecord(page) as unknown as ShowRecord
    const responses: unknown[] = []
    page.on('response', async response => {
      if (response.request().method() === 'PATCH' && response.url().includes(`/api/shows/${record.id}`)) responses.push({ status: response.status(), body: await response.text(), sent: response.request().postDataJSON() })
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
    const after = await visibleRecord(page) as unknown as ShowRecord
    const expected = structuredClone(before)
    const right = after.composition!.scenes[0].zones[0].overlays[0].placements[1]
    expected.composition!.scenes[0].zones[0].overlays[0].placements = [
      { ...before.composition!.scenes[0].zones[0].overlays[0].placements[0], durationMs: 3000 },
      { id: right.id, instanceId: 'instance-ov', startMs: 5000, durationMs: 3000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
    ]
    expect(after).toEqual({ ...expected, updatedAt: after.updatedAt })
    expect(await durableShow(page, record.id)).toEqual(after)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await expect.poll(() => visibleRecord(page)).toEqual({ ...before, updatedAt: expect.any(Number) })
    await expect.poll(() => responses.length).toBe(4)
    saveRecord('SC951-overlay', { before, after, responses })
  })
})