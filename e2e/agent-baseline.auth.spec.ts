// Agent-editing baseline on the live editor (#945): known-outcome
// reproductions, not product acceptance. Every sequence drives the real
// Show editor route in Chromium, injects the real chat overlay served by a
// real scripted bridge process (HTTP, NDJSON, MCP, grammar session, turn
// runner; no paid model call), submits through the overlay's own input, and
// judges what the author sees, what the store persists, and what the
// network carried. The assertions encode the outcomes observed on the
// current code, including the stale whole-record overwrite and the
// durable-baseline mismatch the contracts describe as unfixed. When a later
// slice fixes one of them this suite goes red on purpose: invert that case
// into a regression test rather than deleting it.
//
//   npm run test:e2e:agent-baseline
//
// Raw records (overlay request phases, bridge phase clock, editor and
// preview observations, /api/shows writes, visible and durable facts) and a
// screenshot per sequence land under reports/agent-harness/baseline/browser/.
// Not part of the push gates: this is an explicit diagnostic command.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Page, Request } from '@playwright/test'
import { expect, test } from './fixtures/authenticated'
import {
  BASELINE_LIBRARY,
  BASELINE_LIBRARY_PATTERN,
  personalBaseShow,
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
    let body: PersistedShow | null = null
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
  await page.goto('studio/shows')
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)
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

  test('A: a delayed reply overwrites a manual edit made during inference (stale whole record)', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShow(page)
    await injectOverlay(page, bridge.url)
    const before = await visibleClipFacts(page, 'TestPattern1D')
    expect(before).toEqual({ durationSeconds: '30', brightnessPercent: '100' })

    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, requestId)
    // Manual edit B while the candidate is pending on the bridge.
    const manualAt = Date.now()
    await setClipBrightness(page, 'TestPattern1D', '75')
    await waitForDurable(page, showId, (show) => firstMain(show)?.brightness === 0.75)

    const request = await waitForDone(page, requestId)
    expect(request.changed).toBe(true)
    expect(request.applied).toBe(true)

    // Visible: the agent's resize landed and the manual brightness is gone.
    const after = await visibleClipFacts(page, 'TestPattern1D')
    expect(after).toEqual({ durationSeconds: '12', brightnessPercent: '100' })
    // Durable: the candidate's whole record, stamped older than the manual save it replaced.
    await waitForDurable(page, showId, (show) => firstMain(show)?.durationMs === 12_000)
    const durable = await durableShow(page, showId)
    expect(firstMain(durable)?.brightness).toBe(1)
    // The route as the author sees it once the reply has replaced the manual edit.
    await page.screenshot({ path: join(REPORT_DIR, 'A-stale-overwrite.png'), fullPage: true })
    const patches = writes.filter((write) => write.method === 'PATCH')
    expect(patches.map((write) => write.firstMain)).toEqual([
      { durationMs: 30_000, brightness: 0.75 },
      { durationMs: 12_000, brightness: 1 },
    ])
    expect(patches[1].updatedAt).toBe(request.capturedUpdatedAt)
    expect(patches[1].updatedAt!).toBeLessThan(patches[0].updatedAt!)
    expect(durable?.updatedAt).toBe(request.capturedUpdatedAt)
    // History: the replacement is one entry above the manual edit.
    expect(await undoEnabled(page)).toBe(true)
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    expect(await visibleClipFacts(page, 'TestPattern1D')).toEqual({ durationSeconds: '30', brightnessPercent: '75' })

    const observations = await readObservations(page)
    const phases = observations.filter((entry) => entry.kind === 'agent-apply' && entry.requestId === requestId).map((entry) => entry.phase)
    expect(phases).toEqual(['admitted', 'adopted', 'settled'])
    const adopted = observations.find((entry) => entry.kind === 'agent-apply' && entry.requestId === requestId && entry.phase === 'adopted')
    expect(observations.some((entry) => entry.kind === 'preview-published' && entry.digest === adopted?.digest && entry.at >= adopted.at)).toBe(true)

    await page.screenshot({ path: join(REPORT_DIR, 'A-after-undo.png'), fullPage: true })
    saveRecord('A-stale-overwrite', {
      showId, manualEditAt: manualAt, request, writes, observations, visible: { before, after },
      durable: { updatedAt: durable?.updatedAt, firstMain: firstMain(durable) },
      timeline: phaseTimeline(request, observations, writes),
    })
  })

  test('B: a delayed reply resurrects the target Clip deleted during inference and reverts a neighbour move', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShow(page)
    await injectOverlay(page, bridge.url)

    // Delete the target while the reply is pending.
    const deleteId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, deleteId)
    const target = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    await target.click()
    await page.keyboard.press('Delete')
    await expect(target).toHaveCount(0)
    await waitForDurable(page, showId, (show) => mainPlacements(show).length === 1)
    const deleteRequest = await waitForDone(page, deleteId)
    expect(deleteRequest.applied).toBe(true)
    await expect(target).toBeVisible()
    const afterDelete = await visibleClipFacts(page, 'TestPattern1D')
    expect(afterDelete.durationSeconds).toBe('12')
    await waitForDurable(page, showId, (show) => firstMain(show)?.durationMs === 12_000 && mainPlacements(show).length === 2)

    // Move the neighbour while a second reply is pending: the whole-record
    // replacement reverts that unrelated move too.
    const moveId = await submitUtterance(page, MARKER_UTTERANCE)
    await waitForAccepted(page, moveId)
    await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    const start = panel.getByRole('textbox', { name: 'Start seconds exact time' })
    const startBefore = await start.inputValue()
    await start.fill('35')
    await start.press('Enter')
    const movedVisible = await start.inputValue()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    const moveRequest = await waitForDone(page, moveId)
    await page.getByRole('button', { name: 'Select CometLoom', exact: true }).first().click()
    const startAfterReply = await panel.getByRole('textbox', { name: 'Start seconds exact time' }).inputValue()
    await page.keyboard.press('Escape')
    const durable = await durableShow(page, showId)

    const observations = await readObservations(page)
    await page.screenshot({ path: join(REPORT_DIR, 'B-target-delete-move.png'), fullPage: true })
    saveRecord('B-target-delete-move', {
      showId, deleteRequest, moveRequest, writes, observations,
      visible: { afterDelete, neighbourStart: { before: startBefore, moved: movedVisible, afterReply: startAfterReply } },
      durableMain: mainPlacements(durable),
      timelines: [phaseTimeline(deleteRequest, observations, writes), phaseTimeline(moveRequest, observations, writes)],
    })
    // Reproduction: the move the author made during inference did not survive
    // when the manual move was accepted; when the editor refused the move the
    // record documents that instead of asserting it.
    if (movedVisible !== startBefore) {
      expect(moveRequest.applied).toBe(true)
      expect(startAfterReply).toBe(startBefore)
    }
  })

  test('C: time inserted before the target during inference is undone by the reply', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    const showId = await createPersonalShow(page)
    await injectOverlay(page, bridge.url)
    const durableBefore = await durableShow(page, showId)

    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, requestId)
    await page.getByRole('button', { name: 'Add to Show' }).click()
    await page.getByRole('menuitem', { name: 'Time' }).click()
    const popover = page.getByRole('dialog', { name: 'Insert Time' })
    await expect(popover).toBeVisible()
    const amount = popover.getByRole('textbox', { name: 'Time to insert in seconds' })
    await amount.fill('5')
    await amount.press('Enter')
    const insertButton = popover.getByRole('button', { name: 'Insert' })
    const insertEnabled = await insertButton.isEnabled()
    const reason = insertEnabled ? null : await popover.textContent()
    if (insertEnabled) {
      await insertButton.click()
      await expect(popover).toHaveCount(0)
      await waitForDurable(page, showId, (show) => (firstMain(show)?.startMs ?? 0) === 5_000 || (show.composition?.durationMs ?? 0) > (durableBefore?.composition?.durationMs ?? 0))
    } else {
      await page.keyboard.press('Escape')
    }
    const insertedDurable = await durableShow(page, showId)

    const request = await waitForDone(page, requestId)
    expect(request.applied).toBe(true)
    await waitForDurable(page, showId, (show) => firstMain(show)?.durationMs === 12_000)
    const durable = await durableShow(page, showId)
    const visible = await visibleRecord(page)
    const observations = await readObservations(page)
    await page.screenshot({ path: join(REPORT_DIR, 'C-insert-time.png'), fullPage: true })
    saveRecord('C-insert-time', {
      showId, insertEnabled, reason, request, writes, observations,
      durable: { before: durableBefore?.composition, inserted: insertedDurable?.composition, afterReply: durable?.composition },
      visibleFirstMain: firstMain(visible),
      timeline: phaseTimeline(request, observations, writes),
    })
    if (insertEnabled) {
      // Reproduction: the inserted time is gone from both the visible and the durable record.
      expect(firstMain(insertedDurable)?.startMs).toBe(5_000)
      expect(firstMain(durable)?.startMs).toBe(0)
      expect(firstMain(visible)?.startMs).toBe(0)
      expect(durable?.composition?.durationMs ?? null).toBe(durableBefore?.composition?.durationMs ?? null)
    }
  })

  test('D: navigating away and back during inference applies the late reply to the new editor install', async ({ page }) => {
    test.setTimeout(90_000)
    const writes = watchShowWrites(page)
    // A second personal Show, seeded through the API, is the place to navigate away to.
    const other = personalBaseShow(`baseline-away-${Date.now().toString(36)}`)
    const seeded = await page.context().request.post('/api/shows', { data: other })
    expect(seeded.status(), await seeded.text()).toBe(201)
    const showId = await createPersonalShow(page)
    await injectOverlay(page, bridge.url)

    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    await waitForAccepted(page, requestId)
    const navigatedAwayAt = Date.now()
    await page.getByRole('treeitem', { name: other.name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${other.id}$`))
    await page.getByRole('treeitem', { name: 'Untitled Show', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${showId}$`))
    const navigatedBackAt = Date.now()
    await expect(page.getByTestId('agent-chat-input')).toBeVisible()

    const request = await waitForDone(page, requestId)
    const visible = await visibleClipFacts(page, 'TestPattern1D')
    const observations = await readObservations(page)
    const durable = await durableShow(page, showId)
    await page.screenshot({ path: join(REPORT_DIR, 'D-navigate-away-back.png'), fullPage: true })
    saveRecord('D-navigate-away-back', {
      showId, navigatedAwayAt, navigatedBackAt, request, writes, observations, visible,
      durableFirstMain: firstMain(durable),
      timeline: phaseTimeline(request, observations, writes),
    })
    // Reproduction: the response outlived the editor install it was captured
    // in and still applied to the re-opened Show.
    expect(request.doneAt!).toBeGreaterThan(navigatedBackAt)
    expect(request.applied).toBe(true)
    expect(visible.durationSeconds).toBe('12')
    expect(firstMain(durable)?.durationMs).toBe(12_000)
    const adopted = observations.find((entry) => entry.kind === 'agent-apply' && entry.requestId === requestId && entry.phase === 'adopted')
    expect(adopted && adopted.at > navigatedBackAt).toBe(true)
  })

  test.describe('E: failed save after the reply', () => {
    test.use({ allowedBrowserErrors: [/net::ERR_FAILED|Failed to fetch/] })

    test('E: a later failed save restores a durable baseline that no longer matches storage', async ({ page }) => {
      test.setTimeout(90_000)
      const writes = watchShowWrites(page)
      const showId = await createPersonalShow(page)
      await injectOverlay(page, bridge.url)

      // Same race as A: manual save B after capture, then the older-stamped candidate.
      const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
      await waitForAccepted(page, requestId)
      await setClipBrightness(page, 'TestPattern1D', '75')
      await waitForDurable(page, showId, (show) => firstMain(show)?.brightness === 0.75)
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
      await page.screenshot({ path: join(REPORT_DIR, 'E-failed-save-baseline.png'), fullPage: true })

      await page.reload()
      await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
      const visibleAfterReload = await visibleClipFacts(page, 'TestPattern1D')
      saveRecord('E-failed-save-baseline', {
        showId, request, writes, observations,
        durable: { afterCandidate: firstMain(durableAfterCandidate), afterFailure: firstMain(durableAfterFailure) },
        visible: { afterFailure: visibleAfterFailure, afterReload: visibleAfterReload },
        timeline: phaseTimeline(request, observations, writes),
      })
      // Reproduction: the rollback restored the manual save B (the stale
      // durable baseline) while storage still holds the candidate.
      expect(visibleAfterFailure).toEqual({ durationSeconds: '30', brightnessPercent: '75' })
      expect(firstMain(durableAfterFailure)).toMatchObject({ durationMs: 12_000, brightness: 1 })
      expect(firstMain(durableAfterFailure)?.brightness ?? 1).toBe(1)
      expect(visibleAfterReload).toEqual({ durationSeconds: '12', brightnessPercent: '100' })
    })
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
    await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')
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

    await page.goto(`studio/shows/${record.id}`)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    await injectOverlay(page, bridge.url)
    const requestId = await submitUtterance(page, RESIZE_UTTERANCE)
    const request = await waitForDone(page, requestId)
    expect(request.applied).toBe(true)
    const visible = await visibleClipFacts(page, BASELINE_LIBRARY_PATTERN.name)
    expect(visible.durationSeconds).toBe('12')
    await waitForDurable(page, record.id, (show) => firstMain(show)?.durationMs === 12_000)
    const observations = await readObservations(page)
    const previewText = await page.getByTestId('preview-pane').textContent().catch(() => null)
    await page.screenshot({ path: join(REPORT_DIR, 'H-personal-library.png'), fullPage: true })
    saveRecord('H-personal-library', {
      showId: record.id, request, writes, observations, visible,
      previewPublished: observations.some((entry) => entry.kind === 'preview-published'),
      previewText,
      timeline: phaseTimeline(request, observations, writes),
    })
  })
})
