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
    test.setTimeout(90_000)
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
    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    const request = await waitForDone(page, requestId)
    expect(request.applied, JSON.stringify(request)).toBe(true)
    const visible = await visibleClipFacts(page, BASELINE_LIBRARY_PATTERN.name)
    expect(visible.durationSeconds).toBe('12')
    await waitForDurable(page, record.id, (show) => firstMain(show)?.durationMs === 12_000)
    const observations = await readObservations(page)
    const previewText = await page.getByTestId('show-stage-preview').textContent()
    await page.screenshot({ path: join(REPORT_DIR, 'H-personal-library.png'), fullPage: true })
    saveRecord('H-personal-library', {
      showId: record.id, request, writes, observations, visible,
      previewPublished: observations.some((entry) => entry.kind === 'preview-published'),
      previewText,
      timeline: phaseTimeline(request, observations, writes),
    })
  })
})
