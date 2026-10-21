import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { artifactHash } from '../src/engine/artifactStamp'
import { parseEpe } from '../src/engine/epeImport'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { changedPixelsBetween, measuredExact, samplesAt, type Rgba, type RgbaImage } from '../src/test/showCapturePixelEvidence'
import { showMcpReplacementCases } from '../src/test/showMcpReplacementFixtures'
import { expect, test } from './fixtures/authenticated'
import { squareWorkspaceShow } from './fixtures/showWorkspace'
import { findStoredShowV2, listStoredShowsV2, seedShowV2 } from './support/showBackingRecords'
import { connectShowMcp, type ShowMcpClient } from './support/agentMcpClient'

const relevantTestFiles = [
  'e2e/agent-mcp-replacement.auth.spec.ts',
  'e2e/fixtures/authenticated.ts',
  'e2e/support/agentMcpClient.ts',
  'e2e/support/showBackingRecords.ts',
  'src/test/showCapturePixelEvidence.ts',
  'src/test/showMcpReplacementFixtures.ts',
]
const previewSettings = { isRunning: false, fidelity: 'fast', speed: 1, brightness: 1, lightSize: 0.5, diffusion: 0 } as const
const red: Rgba = [255, 0, 0, 255]
const green: Rgba = [0, 255, 0, 255]
const solidCase = showMcpReplacementCases[0]
const zoneCase = showMcpReplacementCases[3]

interface CaptureWindow extends Window {
  __pxlblzShow?: {
    showId: string
    setPreview(settings: typeof previewSettings): void
    captureSequence(options: { frames: number; fps: number; startMs: number; prefix: string }): Promise<{
      frames: number; startMs: number; names: string[]; failures: Array<{ name: string; error: string }>
    }>
  }
}

function solidShow(id: string): ShowRecordV2 {
  const show = solidCase.buildShow(id)
  if (show.outputContract.kind !== 'portable-2d') throw new Error('Solid fixture must have portable 2D output')
  show.stageMapId = 'plane'
  show.outputContract.referencePixelCount = 1024
  show.zones[0].nominalPixelCount = 1024
  return show
}

function swappingZoneShow(id: string): ShowRecordV2 {
  const show = zoneCase.buildShow(id)
  if (show.outputContract.kind !== 'portable-2d') throw new Error('Zone fixture must have portable 2D output')
  show.stageMapId = 'plane'
  show.outputContract.referencePixelCount = 1024
  for (const zone of show.zones) zone.nominalPixelCount = 512
  const [leftRed, rightGreen] = show.composition.clips
  leftRed.durationMs = 500
  rightGreen.durationMs = 500
  show.composition.clips.push({
    ...structuredClone(leftRed), id: 'left-green-clip', instanceId: 'green-instance', startMs: 500,
    appearance: { keys: [{ ...structuredClone(leftRed.appearance.keys[0]), id: 'left-green-appearance', timeMs: 500 }] },
  }, {
    ...structuredClone(rightGreen), id: 'right-red-clip', instanceId: 'red-instance', startMs: 500,
    appearance: { keys: [{ ...structuredClone(rightGreen.appearance.keys[0]), id: 'right-red-appearance', timeMs: 500 }] },
  })
  return show
}

function greenShow(id: string): ShowRecordV2 {
  const show = solidShow(id)
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'mcp-green' }
  show.composition.patternInstances[0].patternName = 'Solid green'
  show.composition.layers[0].name = 'Green'
  return show
}

function overlaidShow(id: string): ShowRecordV2 {
  const show = solidShow(id)
  const redClip = show.composition.clips[0]
  redClip.id = 'base-red-clip'
  redClip.appearance.keys[0].id = 'base-red-appearance'
  show.composition.patternInstances.push({
    ...structuredClone(greenShow(id).composition.patternInstances[0]), id: 'overlay-green-instance',
  })
  show.composition.layers.push({ id: 'overlay-green-layer', zoneId: 'left', name: 'Green overlay', rank: 1 })
  show.composition.clips.push({
    ...structuredClone(redClip), id: 'overlay-green-clip',
    instanceId: 'overlay-green-instance', layerId: 'overlay-green-layer',
    appearance: { keys: [{ ...structuredClone(redClip.appearance.keys[0]), id: 'overlay-green-appearance' }] },
  })
  return show
}

async function seedPatterns(page: Page): Promise<void> {
  for (const pattern of zoneCase.patterns) {
    const response = await page.context().request.post('/api/patterns', { data: pattern })
    expect(response.ok(), `POST /api/patterns/${pattern.id}: HTTP ${response.status()}`).toBe(true)
  }
}

async function seedSolid(page: Page, id: string, name: string): Promise<ShowRecordV2> {
  return seedShowV2(page, { ...squareWorkspaceShow(1), id, name }, name, {
    edit: converted => {
      Object.assign(converted, solidShow(id), { name, updatedAt: converted.updatedAt })
    },
  })
}

async function seed(page: Page, id: string, name: string): Promise<ShowRecordV2> {
  const show = await seedShowV2(page, { ...squareWorkspaceShow(1), id, name }, name)
  await seedPatterns(page)
  return show
}

async function openEditor(page: Page, show: ShowRecordV2): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`studio/shows/${show.id}?capture`)
  await expect(page.getByRole('button', { name: 'Show properties', exact: true })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: show.name, exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('show-stage-canvas-frame')).toHaveAttribute('aria-busy', 'false')
  await page.waitForFunction(id => (window as CaptureWindow).__pxlblzShow?.showId === id, show.id)
  expect(await page.evaluate(() => (window as CaptureWindow).__pxlblzShow?.showId)).toBe(show.id)
  await page.evaluate(settings => (window as CaptureWindow).__pxlblzShow!.setPreview(settings), previewSettings)
}

async function armDrawer(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: /^Open the Agent drawer/ })
  if (await open.isVisible()) await open.click()
  await page.getByRole('button', { name: 'Connect your agent with MCP' }).click()
  const drawer = page.getByRole('complementary', { name: 'Agent drawer', exact: true })
  await expect(drawer.getByRole('button', { name: 'Ready to connect' })).toBeVisible()
  await drawer.getByRole('button', { name: 'Ready to connect' }).click()
  await expect(drawer.getByRole('button', { name: 'Cancel connection attempt' })).toBeVisible()
}

async function boundClient(page: Page, show: ShowRecordV2): Promise<ShowMcpClient> {
  await armDrawer(page)
  const client = await connectShowMcp(page, show.id)
  const drawer = page.getByRole('complementary', { name: 'Agent drawer', exact: true })
  await expect(drawer.getByRole('img', { name: 'Connected' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible()
  const read = await client.tool('read_show', { binding_id: client.bindingId })
  expect(read).toMatchObject({ code: 'read', show: { id: show.id, name: show.name } })
  return client
}

async function replace(client: ShowMcpClient, candidate: ShowRecordV2, intent: string): Promise<Record<string, unknown>> {
  const current = await client.tool('read_show', { binding_id: client.bindingId })
  expect(current).toMatchObject({ code: 'read', show: { id: candidate.id } })
  const begun = await client.tool('begin_edit', { binding_id: client.bindingId, intent, idempotency_key: randomUUID() })
  expect(begun.code).toBe('begun')
  expect(typeof begun.operation_id).toBe('string')
  const identity = { binding_id: client.bindingId, operation_id: begun.operation_id as string }
  expect((await client.tool('replace_show', { ...identity, idempotency_key: randomUUID(), show: candidate })).code).toBe('changed')
  expect((await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })).code).toBe('outcome')
  await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'applied', settlement: 'saved' })
  return identity
}

function expectedStored(candidate: ShowRecordV2, original: ShowRecordV2, actual: ShowRecordV2): ShowRecordV2 {
  return { ...candidate, id: original.id, name: original.name, updatedAt: actual.updatedAt }
}

async function assertStored(page: Page, original: ShowRecordV2, candidate: ShowRecordV2): Promise<ShowRecordV2> {
  await expect.poll(async () => {
    const actual = await findStoredShowV2(page, original.id)
    return actual && { ...actual, updatedAt: 0 }
  }).toEqual({ ...candidate, id: original.id, name: original.name, updatedAt: 0 })
  const stored = await findStoredShowV2(page, original.id)
  expect(stored).toBeDefined()
  expect(stored).toEqual(expectedStored(candidate, original, stored!))
  return stored!
}

interface CaptureEvidence {
  name: string
  timeMs: number
  path: string
  sha256: string
  bytes: number
  width: number
  height: number
  positions: Array<{ x: number; y: number; rgba: Rgba }>
  image: RgbaImage
}

function centres(image: RgbaImage) {
  return [
    { x: Math.round((8.5 / 32) * image.width), y: Math.round((16.5 / 32) * image.height) },
    { x: Math.round((24.5 / 32) * image.width), y: Math.round((16.5 / 32) * image.height) },
  ]
}

function assertSamples(capture: CaptureEvidence, colors: readonly [Rgba, Rgba]): void {
  const samples = samplesAt(capture.image, centres(capture.image))
  expect(samples, `32x32 declared grid centres on ${capture.width}x${capture.height} canvas`).toHaveLength(2)
  expect(samples.map(sample => sample.rgba), `${capture.name} at ${capture.timeMs} ms; canvas ${capture.width}x${capture.height}`).toEqual(colors)
}

/** A remounted Stage canvas stays at its 1x1 initial viewport until its ResizeObserver commits (#1177). */
async function waitForSizedStageCanvas(page: Page): Promise<void> {
  const canvas = page.getByTestId('show-stage-canvas-frame').locator('canvas')
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width > 1 && element.height > 1),
    { message: 'Stage canvas sized past its 1x1 initial viewport' }).toBe(true)
}

function captureHarness(page: Page, testInfo: TestInfo, prefix: string) {
  const testIdHash = createHash('sha256').update(testInfo.testId).digest('hex').slice(0, 16)
  const runDirectory = join(process.cwd(), 'playwright-report', 'agent-mcp',
    `${testIdHash}-worker-${testInfo.workerIndex}-retry-${testInfo.retry}-repeat-${testInfo.repeatEachIndex}`)
  const written = new Map<string, string>()
  const captures: CaptureEvidence[] = []
  let captureMs = 0
  const install = async () => {
    await page.route('**/__capture?name=*', async route => {
      const name = new URL(route.request().url()).searchParams.get('name')
      if (!name || !new RegExp(`^${prefix}-[a-z0-9-]+-00000\\.png$`).test(name)) throw new Error(`Unexpected capture name: ${name}`)
      const bytes = route.request().postDataBuffer()
      if (!bytes || bytes.length === 0) throw new Error(`Empty canvas capture: ${name}`)
      const path = testInfo.outputPath(name)
      await writeFile(path, bytes)
      written.set(name, path)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path, bytes: bytes.length }) })
    })
  }
  const capture = async (label: string, timeMs: number): Promise<CaptureEvidence> => {
    const start = performance.now()
    await expect(page.getByTestId('show-stage-canvas-frame')).toHaveAttribute('aria-busy', 'false')
    await waitForSizedStageCanvas(page)
    const result = await page.evaluate(async ({ startMs, namePrefix }) => (window as CaptureWindow).__pxlblzShow!.captureSequence({ frames: 1, fps: 1000, startMs, prefix: namePrefix }), {
      startMs: timeMs, namePrefix: `${prefix}-${label}`,
    })
    expect(result).toMatchObject({ frames: 1, startMs: timeMs, failures: [] })
    expect(result.names).toHaveLength(1)
    const name = result.names[0]
    const output = written.get(name)
    expect(output, `Missing POST /__capture for ${name}`).toBeDefined()
    const bytes = await readFile(output!)
    const image = await page.evaluate(async base64 => {
      const bitmap = new Image()
      bitmap.src = `data:image/png;base64,${base64}`
      await bitmap.decode()
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.naturalWidth
      canvas.height = bitmap.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(bitmap, 0, 0)
      return { width: canvas.width, height: canvas.height, pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) }
    }, bytes.toString('base64'))
    const evidencePath = join(runDirectory, name)
    await mkdir(runDirectory, { recursive: true })
    await copyFile(output!, evidencePath)
    const value: CaptureEvidence = {
      name, timeMs, path: name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
      width: image.width, height: image.height, positions: samplesAt(image, centres(image)), image,
    }
    captures.push(value)
    captureMs += performance.now() - start
    return value
  }
  return { install, capture, captures, captureMs: () => captureMs, runDirectory }
}

async function writeEvidence(name: string, testInfo: TestInfo, show: ShowRecordV2, harness: ReturnType<typeof captureHarness>, client: ShowMcpClient, timing: object, extra: object, browserErrors: string[], issue = 1160): Promise<void> {
  expect(browserErrors).toEqual([])
  expect(harness.captures.length).toBeGreaterThan(0)
  for (const capture of harness.captures) {
    const bytes = await readFile(join(harness.runDirectory, capture.path))
    expect(bytes.length, `${capture.path} byte count`).toBe(capture.bytes)
    expect(createHash('sha256').update(bytes).digest('hex'), `${capture.path} SHA-256`).toBe(capture.sha256)
  }
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const testFileStatus = execFileSync('git', ['status', '--short', '--', ...relevantTestFiles],
    { encoding: 'utf8', maxBuffer: 8192 }).trim().split('\n').filter(Boolean)
  const manifest = {
    issue, sourceCommit, test: name,
    workers: testInfo.config.workers, workerIndex: testInfo.workerIndex, parallelIndex: testInfo.parallelIndex,
    retry: testInfo.retry, repeatEachIndex: testInfo.repeatEachIndex,
    testFilesUncommitted: testFileStatus.length > 0, testFileStatus,
    syntheticAccountConsumption: 'one account per test', show: { id: show.id, name: show.name },
    viewport: { width: 1280, height: 900 }, map: 'plane', referencePixelCount: 1024,
    previewSettings, captureSettings: { frames: 1, fps: 1000, fixedVirtualTime: true },
    browserErrors, timing, transcript: client.safeTranscript, ...extra,
    captures: harness.captures.map(({ image: _image, ...capture }) => capture),
  }
  await writeFile(join(harness.runDirectory, `${name}.json`), JSON.stringify(manifest, null, 2) + '\n')
}

async function createPersonalShow(page: Page, name: string): Promise<ShowRecordV2> {
  await page.goto('studio/shows')
  await seedPatterns(page)
  const priorIds = (await listStoredShowsV2(page)).map(show => show.id)
  await expect(page.getByRole('button', { name: /Account menu for playwright-worker-\d+/i })).toBeVisible()
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Portable Show' }).click()
  await page.getByRole('textbox', { name: 'Show name' }).fill(name)
  await page.getByRole('combobox', { name: 'Reference map' }).selectOption('plane')
  const previewPixels = page.getByRole('textbox', { name: 'Preview pixels exact pixel count' })
  await previewPixels.fill('1024')
  await previewPixels.press('Enter')
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[0-9a-f-]{36}$/)
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  expect(id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
  expect(priorIds).not.toContain(id)
  await expect.poll(async () => await findStoredShowV2(page, id)).toBeDefined()
  const created = (await findStoredShowV2(page, id))!
  expect(created).toMatchObject({
    version: 2, id, name, stageMapId: 'plane',
    outputContract: { kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 1024 },
  })
  expect(created.composition.clips).toHaveLength(2)
  expect(created.composition.layers).toHaveLength(1)
  expect(created.composition.transitions).toHaveLength(1)
  const personalTree = page.getByRole('tree', { name: 'Shows', exact: true })
  const builtInTree = page.getByRole('tree', { name: 'Built-in Shows', exact: true })
  await expect(personalTree.getByRole('treeitem', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(builtInTree.getByRole('treeitem', { name, exact: true })).toHaveCount(0)
  return created
}

function changedIds(reply: Record<string, unknown>, field: 'layers' | 'clips' | 'instances' | 'appearanceKeys'): string[] {
  expect(reply.code).toBe('changed')
  const changes = reply.changes as Array<{ details: Record<string, string[]> }>
  expect(changes.length).toBeGreaterThan(0)
  const ids = changes.flatMap(change => change.details[field] ?? [])
  expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
  return [...new Set(ids)]
}

async function downloadAndReopenShow(
  page: Page, saved: ShowRecordV2, runDirectory: string, label: string,
): Promise<{ showFile: object; epe: object }> {
  await mkdir(runDirectory, { recursive: true })
  const showDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Show actions' }).click()
  await page.getByRole('menuitem', { name: 'Export Show file…' }).click()
  const showDownload = await showDownloadPromise
  expect(showDownload.suggestedFilename()).toMatch(/\.pxlshow$/)
  const showPath = join(runDirectory, `${label}.pxlshow`)
  await showDownload.saveAs(showPath)
  const showBytes = await readFile(showPath)
  expect(showBytes.length).toBeGreaterThan(0)
  const reopened = await page.evaluate(async bytes => {
    const load = (path: string) => import(path)
    const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
    return parseShowFileBundle(new Uint8Array(bytes), { acceptV2: true })
  }, [...showBytes])
  expect(reopened.show).toEqual(saved)

  const epeDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Show actions' }).click()
  await page.getByRole('menuitem', { name: 'Download .epe' }).click()
  const epeDownload = await epeDownloadPromise
  expect(epeDownload.suggestedFilename()).toMatch(/\.epe$/)
  const epePath = join(runDirectory, `${label}.epe`)
  await epeDownload.saveAs(epePath)
  const epeBytes = await readFile(epePath)
  const parsed = parseEpe(epeBytes.toString('utf8'))
  expect(parsed.stamp).toMatchObject({
    kind: 'show', id: saved.id,
    showOutputContract: { version: 1, kind: 'portable-2d', dimensions: [2], mapClasses: ['surface'], resolution: 'variable' },
  })
  expect(parsed.stamp!.hash).toBe(artifactHash(parsed.src))
  expect(parsed.src).toMatch(/export function render/)
  return {
    showFile: { path: `${label}.pxlshow`, filename: showDownload.suggestedFilename(), bytes: showBytes.length,
      sha256: createHash('sha256').update(showBytes).digest('hex'), reopened: true },
    epe: { path: `${label}.epe`, filename: epeDownload.suggestedFilename(), bytes: epeBytes.length,
      sha256: createHash('sha256').update(epeBytes).digest('hex'), reopened: true, sourceHash: artifactHash(parsed.src) },
  }
}

test('real MCP authors an empty UI-created personal Show incrementally (#1166)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const created = await createPersonalShow(page, `MCP created sequence ${randomUUID().slice(0, 8)}`)
  await openEditor(page, created)
  const harness = captureHarness(page, testInfo, 'create-sequence')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, created)
  const bindingMs = performance.now() - bindingStart
  let clientClosed = false
  let reloadClient: ShowMcpClient | undefined
  try {
    const initialRead = await client.tool('read_show', { binding_id: client.bindingId })
    expect(initialRead).toMatchObject({ code: 'read', show: created })
    const starter = initialRead.show as ShowRecordV2
    const begun = await client.tool('begin_edit', {
      binding_id: client.bindingId, intent: 'Remove starter content to author an empty personal Show', idempotency_key: randomUUID(),
    })
    expect(begun.code).toBe('begun')
    const removal = { binding_id: client.bindingId, operation_id: begun.operation_id as string }
    expect((await client.tool('remove_clips', {
      ...removal, idempotency_key: randomUUID(), clip_ids: starter.composition.clips.map(clip => clip.id),
    })).code).toBe('changed')
    for (const layer of starter.composition.layers) {
      expect((await client.tool('remove_layer', {
        ...removal, idempotency_key: randomUUID(), layer_id: layer.id,
      })).code).toBe('changed')
    }
    expect((await client.tool('set_show_end', {
      ...removal, idempotency_key: randomUUID(), end_ms: 1000,
    })).code).toBe('changed')
    expect((await client.tool('commit_edit', { ...removal, idempotency_key: randomUUID() })).code).toBe('outcome')
    await expect.poll(async () => (await client.tool('get_outcome', removal)).receipt).toMatchObject({ status: 'applied', settlement: 'saved' })
    const emptyExpected = structuredClone(created)
    emptyExpected.composition = {
      ...emptyExpected.composition, showEndMs: 1000, patternInstances: [], layers: [], clips: [], transitions: [],
      propertyTracks: [], layoutOccurrences: emptyExpected.composition.layoutOccurrences.map(occurrence => ({ ...occurrence, durationMs: 1000 })),
    }
    const emptySaved = await assertStored(page, created, emptyExpected)
    expect(emptySaved.composition.clips).toEqual([])
    expect(emptySaved.composition.patternInstances).toEqual([])
    expect(emptySaved.composition.layers).toEqual([])
    expect(emptySaved.composition.transitions).toEqual([])

    const emptyRead = await client.tool('read_show', { binding_id: client.bindingId })
    expect(emptyRead).toMatchObject({ code: 'read', show: emptySaved })
    const authored = await client.tool('begin_edit', {
      binding_id: client.bindingId, intent: 'Author adjacent red and green Clips on a new Layer', idempotency_key: randomUUID(),
    })
    expect(authored.code).toBe('begun')
    const edit = { binding_id: client.bindingId, operation_id: authored.operation_id as string }
    const zoneId = created.zones[0].id
    const redReply = await client.tool('create_layers', {
      ...edit, idempotency_key: randomUUID(),
      layers: [{ zone_id: zoneId, name: 'Authored sequence', clips: [{
        zone_id: zoneId, start_ms: 0, duration_ms: 500, pattern: { kind: 'user', id: 'mcp-red' }, instance: 'sole',
      }] }],
    })
    const [layerId] = changedIds(redReply, 'layers')
    const [redClipId] = changedIds(redReply, 'clips')
    const [redInstanceId] = changedIds(redReply, 'instances')
    const [redAppearanceId] = changedIds(redReply, 'appearanceKeys')
    expect([layerId, redClipId, redInstanceId, redAppearanceId].every(Boolean)).toBe(true)
    expect(changedIds(redReply, 'layers')).toHaveLength(1)
    expect(changedIds(redReply, 'clips')).toHaveLength(1)
    expect(changedIds(redReply, 'instances')).toHaveLength(1)
    expect(changedIds(redReply, 'appearanceKeys')).toHaveLength(1)
    const greenReply = await client.tool('create_clips', {
      ...edit, idempotency_key: randomUUID(),
      clips: [{ zone_id: zoneId, layer_id: layerId, start_ms: 500, duration_ms: 500,
        pattern: { kind: 'user', id: 'mcp-green' }, instance: 'sole' }],
    })
    const [greenClipId] = changedIds(greenReply, 'clips')
    const [greenInstanceId] = changedIds(greenReply, 'instances')
    const [greenAppearanceId] = changedIds(greenReply, 'appearanceKeys')
    expect(changedIds(greenReply, 'clips')).toHaveLength(1)
    expect(changedIds(greenReply, 'instances')).toHaveLength(1)
    expect(changedIds(greenReply, 'appearanceKeys')).toHaveLength(1)
    expect(new Set([layerId, redClipId, redInstanceId, redAppearanceId, greenClipId, greenInstanceId, greenAppearanceId]).size).toBe(7)
    expect(await findStoredShowV2(page, created.id)).toEqual(emptySaved)
    expect((await client.tool('commit_edit', { ...edit, idempotency_key: randomUUID() })).code).toBe('outcome')
    await expect.poll(async () => (await client.tool('get_outcome', edit)).receipt).toMatchObject({ status: 'applied', settlement: 'saved' })

    const expected = structuredClone(emptyExpected)
    expected.composition.patternInstances = [
      { id: redInstanceId, pattern: { kind: 'user', id: 'mcp-red' }, patternName: 'Solid red', time: { timeScale: 1, timeOffsetMs: 0 } },
      { id: greenInstanceId, pattern: { kind: 'user', id: 'mcp-green' }, patternName: 'Solid green', time: { timeScale: 1, timeOffsetMs: 0 } },
    ]
    expected.composition.layers = [{ id: layerId, zoneId, name: 'Authored sequence', rank: 0 }]
    const appearance = (id: string, timeMs: number) => ({
      keys: [{ id, timeMs, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }],
    })
    expected.composition.clips = [
      { id: redClipId, instanceId: redInstanceId, zoneId, layerId, startMs: 0, durationMs: 500,
        entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance(redAppearanceId, 0) },
      { id: greenClipId, instanceId: greenInstanceId, zoneId, layerId, startMs: 500, durationMs: 500,
        entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance(greenAppearanceId, 500) },
    ]
    const saved = await assertStored(page, created, expected)
    await expect(page.getByRole('button', { name: 'Select Solid red', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select Solid green', exact: true })).toBeVisible()
    await expect(page.getByRole('tree', { name: 'Shows', exact: true }).getByRole('treeitem', { name: created.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    const at250 = await harness.capture('authored-250', 250)
    let faultExcerpt = ''
    try { assertSamples(at250, [red, green]) } catch (error) { faultExcerpt = String(error).slice(0, 500) }
    expect(faultExcerpt).toContain('Expected')
    assertSamples(at250, [red, red])
    assertSamples(await harness.capture('authored-750', 750), [green, green])

    await client.close()
    clientClosed = true
    await page.reload()
    await page.waitForFunction(id => (window as CaptureWindow).__pxlblzShow?.showId === id, created.id)
    await page.evaluate(settings => (window as CaptureWindow).__pxlblzShow!.setPreview(settings), previewSettings)
    await assertStored(page, created, expected)
    await expect(page.getByRole('tree', { name: 'Shows', exact: true }).getByRole('treeitem', { name: created.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    assertSamples(await harness.capture('reload-250', 250), [red, red])
    assertSamples(await harness.capture('reload-750', 750), [green, green])
    reloadClient = await boundClient(page, created)
    const reloadedRead = await reloadClient.tool('read_show', { binding_id: reloadClient.bindingId })
    expect(reloadedRead.code).toBe('read')
    expect(reloadedRead.show).toEqual(saved)
    const artifacts = await downloadAndReopenShow(page, saved, harness.runDirectory, 'authored-reload')
    await writeEvidence('create-sequence', testInfo, created, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        creation: { path: 'Studio Shows > Add show > New show > Create Portable Show', returnedUuid: created.id,
          preexistingIdAbsent: true, starterClipsRemovedThroughMcp: starter.composition.clips.map(clip => clip.id) },
        saves: ['starter removal saved', 'two-Clips authoring saved'], completeRecordAssertions: ['empty composition', 'authored composition', 'reload composition'],
        reloadRead: { code: reloadedRead.code, id: (reloadedRead.show as ShowRecordV2).id, exact: true },
        reloadTranscript: reloadClient.safeTranscript, faultControl: { image: at250.path, rejectedExpected: [red, green],
          rejected: true, excerpt: faultExcerpt, restoredExpected: [red, red] }, artifacts,
      }, browserErrors, 1166)
  } finally {
    if (reloadClient) await reloadClient.close()
    if (!clientClosed) await client.close()
  }
})

test('real MCP uploads a complete Show into a separate UI-created personal Show (#1166)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const created = await createPersonalShow(page, `MCP uploaded composition ${randomUUID().slice(0, 8)}`)
  await openEditor(page, created)
  const harness = captureHarness(page, testInfo, 'create-upload')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, created)
  const bindingMs = performance.now() - bindingStart
  let clientClosed = false
  try {
    const candidate = swappingZoneShow(created.id)
    expect(candidate.name).not.toBe(created.name)
    await replace(client, candidate, 'Upload two-Zone swapping content to this new personal Show')
    const saved = await assertStored(page, created, candidate)
    expect(saved.composition.clips.map(clip => clip.id)).not.toContain('clip-1')
    expect(saved.composition.clips.map(clip => clip.id)).not.toContain('clip-2')
    expect(saved.composition.transitions).toEqual([])
    expect(saved.composition.patternInstances.map(instance => instance.pattern.id)).not.toContain('TestPattern1D')
    expect(saved.composition.patternInstances.map(instance => instance.pattern.id)).not.toContain('CometLoom')
    await expect(page.getByRole('tree', { name: 'Shows', exact: true }).getByRole('treeitem', { name: created.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tree', { name: 'Built-in Shows', exact: true }).getByRole('treeitem', { name: created.name, exact: true })).toHaveCount(0)
    const at250 = await harness.capture('uploaded-250', 250)
    let faultExcerpt = ''
    try { assertSamples(at250, [green, red]) } catch (error) { faultExcerpt = String(error).slice(0, 500) }
    expect(faultExcerpt).toContain('Expected')
    assertSamples(at250, [red, green])
    assertSamples(await harness.capture('uploaded-750', 750), [green, red])

    await client.close()
    clientClosed = true
    await page.reload()
    await page.waitForFunction(id => (window as CaptureWindow).__pxlblzShow?.showId === id, created.id)
    await page.evaluate(settings => (window as CaptureWindow).__pxlblzShow!.setPreview(settings), previewSettings)
    await assertStored(page, created, candidate)
    await expect(page.getByRole('tree', { name: 'Shows', exact: true }).getByRole('treeitem', { name: created.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    assertSamples(await harness.capture('reload-250', 250), [red, green])
    assertSamples(await harness.capture('reload-750', 750), [green, red])
    const artifacts = await downloadAndReopenShow(page, saved, harness.runDirectory, 'uploaded-reload')
    await writeEvidence('create-upload', testInfo, created, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        creation: { path: 'Studio Shows > Add show > New show > Create Portable Show', returnedUuid: created.id,
          preexistingIdAbsent: true, starterContentReplacedThroughMcp: true },
        saves: ['uploaded replacement saved'], completeRecordAssertions: ['uploaded composition', 'reload composition'],
        faultControl: { image: at250.path, rejectedExpected: [green, red], rejected: true,
          excerpt: faultExcerpt, restoredExpected: [red, green] }, artifacts,
      }, browserErrors, 1166)
  } finally {
    if (!clientClosed) await client.close()
  }
})

test('real MCP replacement publishes known pixels, Undo/Redo, and reload (#1160)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seed(page, 'agent-mcp-1160-adoption', 'MCP replacement browser proof')
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'adoption')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  try {
    const solid = solidShow(original.id)
    await replace(client, solid, 'Show solid red')
    await assertStored(page, original, solid)
    await expect(page.getByRole('treeitem', { name: original.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Select Solid red', exact: true })).toBeVisible()
    const solid250 = await harness.capture('solid-250', 250)
    assertSamples(solid250, [red, red])
    const solidControl = await harness.capture('solid-control-250', 250)
    assertSamples(solidControl, [red, red])
    const unchanged = changedPixelsBetween(solid250.image, solidControl.image)
    const unchangedMeasurement = { comparable: true as const, changedPixels: unchanged.length,
      maximumChannelDelta: unchanged.reduce((max, pixel) => Math.max(max, ...pixel.left.map((value, index) => Math.abs(value - pixel.right[index]))), 0) }

    const zones = swappingZoneShow(original.id)
    await replace(client, zones, 'Show two Zones swapping colour at 500 ms')
    await assertStored(page, original, zones)
    await expect(page.getByRole('treeitem', { name: original.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Select Solid green', exact: true }).first()).toBeVisible()
    const zones250 = await harness.capture('zones-250', 250)
    assertSamples(zones250, [red, green])
    const zones750 = await harness.capture('zones-750', 750)
    assertSamples(zones750, [green, red])
    let faultExcerpt = ''
    try { assertSamples(solid250, [red, green]) } catch (error) { faultExcerpt = String(error).slice(0, 500) }
    expect(faultExcerpt).toContain('Expected')
    const restored = await harness.capture('zones-control-250', 250)
    assertSamples(restored, [red, green])

    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await assertStored(page, original, solid)
    const undone = await harness.capture('undo-solid-250', 250)
    assertSamples(undone, [red, red])
    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    await assertStored(page, original, zones)
    assertSamples(await harness.capture('redo-zones-250', 250), [red, green])
    assertSamples(await harness.capture('redo-zones-750', 750), [green, red])

    await page.reload()
    await expect(page.getByRole('treeitem', { name: original.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.waitForFunction(id => (window as CaptureWindow).__pxlblzShow?.showId === id, original.id)
    await page.evaluate(settings => (window as CaptureWindow).__pxlblzShow!.setPreview(settings), previewSettings)
    await assertStored(page, original, zones)
    assertSamples(await harness.capture('reload-zones-250', 250), [red, green])
    assertSamples(await harness.capture('reload-zones-750', 750), [green, red])
    await writeEvidence('adoption', testInfo, original, harness, client, { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
      unchangedState: { first: solid250.sha256, second: solidControl.sha256, sampleExact: true, allImage: unchangedMeasurement, allImageExact: measuredExact(unchangedMeasurement) },
      faultControl: { injectedImage: solid250.path, target: zones250.path, rejected: true, excerpt: faultExcerpt, restoredImage: restored.path },
      assertions: ['saved complete authored record', 'retained name and selected rail row', 'Undo/Redo durable records', 'reload durable record', 'literal grid-centre RGBA'],
    }, browserErrors)
  } finally { await client.close() }
})

test('dirty duration refuses a stale MCP replacement after manual commit (#1160)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seed(page, 'agent-mcp-1160-dirty', 'MCP dirty field browser proof')
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'dirty')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  try {
    const solid = solidShow(original.id)
    await replace(client, solid, 'Seed solid red')
    const before = await assertStored(page, original, solid)
    const candidate = greenShow(original.id)
    const read = await client.tool('read_show', { binding_id: client.bindingId })
    expect(read).toMatchObject({ code: 'read', show: { id: original.id } })
    const begun = await client.tool('begin_edit', { binding_id: client.bindingId, intent: 'Change solid red to green', idempotency_key: randomUUID() })
    expect(begun.code).toBe('begun')
    const identity = { binding_id: client.bindingId, operation_id: begun.operation_id as string }
    expect((await client.tool('replace_show', { ...identity, idempotency_key: randomUUID(), show: candidate })).code).toBe('changed')
    await page.getByRole('button', { name: 'Select Solid red', exact: true }).first().click()
    const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
    await duration.fill('0.75')
    await expect(duration).toBeFocused()
    expect((await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })).code).toBe('outcome')
    await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'waiting' })
    await expect(duration).toBeFocused()
    expect(await findStoredShowV2(page, original.id)).toEqual(before)
    await duration.press('Enter')
    await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
    await expect(duration).toHaveValue('0.75')
    const manual = structuredClone(solid)
    manual.composition.clips[0].durationMs = 750
    const stored = await assertStored(page, original, manual)
    expect(stored.composition.showEndMs).toBe(1000)
    expect(stored.composition.patternInstances.map(instance => instance.pattern.id)).not.toContain('mcp-green')
    await expect(page.getByRole('treeitem', { name: original.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Select Solid red', exact: true })).toBeVisible()
    assertSamples(await harness.capture('manual-250', 250), [red, red])
    await writeEvidence('dirty-field', testInfo, original, harness, client, { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
      waiting: { focusedField: 'Duration seconds exact time', draft: '0.75', durableUnchanged: true },
      refusal: { status: 'refused', reason: 'revision-conflict', manualClipDurationMs: 750, showEndMs: 1000, candidatePatternAbsent: 'mcp-green' },
    }, browserErrors)
  } finally { await client.close() }
})

test('MCP replacement reconciles Clip selection, UI Delete, and keyboard history (#1162)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seed(page, 'agent-mcp-1162-selection', 'MCP selection and history proof')
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'selection')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  const selections: Array<Record<string, unknown>> = []
  const rail = page.getByRole('treeitem', { name: original.name, exact: true })
  const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
  try {
    const solid = solidShow(original.id)
    await replace(client, solid, 'Show solid red before Clip selection')
    await assertStored(page, original, solid)
    const redClip = page.getByRole('button', { name: 'Select Solid red', exact: true })
    await redClip.click()
    await expect(duration).toBeVisible()
    await expect(duration).toHaveValue('1')
    selections.push({ step: 'selected original red Clip', railSelected: await rail.getAttribute('aria-selected'),
      durationVisible: await duration.isVisible(), durationValue: await duration.inputValue() })

    const overlaid = overlaidShow(original.id)
    const deleted = structuredClone(overlaid)
    deleted.composition.clips = deleted.composition.clips.filter(clip => clip.id !== 'overlay-green-clip')
    deleted.composition.patternInstances = deleted.composition.patternInstances.filter(instance => instance.id !== 'overlay-green-instance')
    await replace(client, overlaid, 'Replace selected Clip with red base and green overlay')
    await assertStored(page, original, overlaid)
    await expect(duration).not.toBeVisible()
    await expect(rail).toHaveAttribute('aria-selected', 'true')
    await expect(redClip).toBeVisible()
    const greenClip = page.getByRole('button', { name: 'Select Solid green', exact: true })
    await expect(greenClip).toBeVisible()
    selections.push({ step: 'replacement reconciled missing selected Clip', railSelected: await rail.getAttribute('aria-selected'),
      oldDurationVisible: await duration.isVisible(), redVisible: await redClip.isVisible(), greenVisible: await greenClip.isVisible() })
    const overlaid250 = await harness.capture('overlaid-250', 250)
    assertSamples(overlaid250, [green, green])
    let faultExcerpt = ''
    try { assertSamples(overlaid250, [red, red]) } catch (error) { faultExcerpt = String(error).slice(0, 500) }
    expect(faultExcerpt).toContain('Expected')
    assertSamples(overlaid250, [green, green])

    await greenClip.click()
    await expect(duration).toBeVisible()
    await greenClip.click()
    await expect(duration).not.toBeVisible()
    await expect(greenClip).toBeFocused()
    await page.keyboard.press('Delete')
    await assertStored(page, original, deleted)
    await expect(greenClip).toHaveCount(0)
    await expect(redClip).toBeVisible()
    selections.push({ step: 'deleted green Clip from timeline button', keyboardTarget: 'Select Solid green',
      greenCount: await greenClip.count(), redVisible: await redClip.isVisible() })
    assertSamples(await harness.capture('deleted-red-250', 250), [red, red])

    await redClip.click()
    await redClip.click()
    await expect(redClip).toBeFocused()
    await redClip.press('ControlOrMeta+z')
    await assertStored(page, original, overlaid)
    await expect(greenClip).toBeVisible()
    selections.push({ step: 'keyboard Undo restored replacement', keyboardTarget: 'Select Solid red',
      greenVisible: await greenClip.isVisible() })
    assertSamples(await harness.capture('undo-green-250', 250), [green, green])

    await redClip.press('ControlOrMeta+Shift+z')
    await assertStored(page, original, deleted)
    await expect(greenClip).toHaveCount(0)
    await expect(redClip).toBeVisible()
    selections.push({ step: 'keyboard Redo restored deletion', keyboardTarget: 'Select Solid red',
      greenCount: await greenClip.count(), redVisible: await redClip.isVisible() })
    assertSamples(await harness.capture('redo-red-250', 250), [red, red])
    await writeEvidence('selection-history', testInfo, original, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        selections, assertions: ['complete saved record after each replacement, Delete, Undo, and Redo',
          'old selected Clip detail removed while Show rail selection persists', 'literal green/red Stage pixels at 250 ms'],
        faultControl: { image: overlaid250.path, rejectedExpected: [red, red], rejected: true,
          excerpt: faultExcerpt, restoredExpected: [green, green] },
      }, browserErrors, 1162)
  } finally { await client.close() }
})

test('navigation retires an uncommitted MCP replacement without saving either Show (#1162)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const showA = await seedSolid(page, 'agent-mcp-1162-navigation-a', 'MCP private Show A')
  const showB = await seedSolid(page, 'agent-mcp-1162-navigation-b', 'MCP private Show B')
  await seedPatterns(page)
  const originalA = await findStoredShowV2(page, showA.id)
  const originalB = await findStoredShowV2(page, showB.id)
  expect(originalA).toEqual(showA)
  expect(originalB).toEqual(showB)
  const assertUnchanged = async () => {
    expect(await findStoredShowV2(page, showA.id)).toEqual(originalA)
    expect(await findStoredShowV2(page, showB.id)).toEqual(originalB)
  }
  await openEditor(page, showA)
  const harness = captureHarness(page, testInfo, 'navigation')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, showA)
  const bindingMs = performance.now() - bindingStart
  const selections: Array<Record<string, unknown>> = []
  const railA = page.getByRole('treeitem', { name: /^MCP private Show A(?: More actions for MCP private Show A)?$/ })
  const railB = page.getByRole('treeitem', { name: /^MCP private Show B(?: More actions for MCP private Show B)?$/ })
  const identity = { binding_id: client.bindingId, operation_id: '' }
  try {
    await expect(railA).toHaveAttribute('aria-selected', 'true')
    await expect(railB).toBeVisible()
    expect((await client.tool('read_show', { binding_id: client.bindingId })).code).toBe('read')
    const begun = await client.tool('begin_edit', {
      binding_id: client.bindingId, intent: 'Private green candidate that must retire on navigation', idempotency_key: randomUUID(),
    })
    expect(begun.code).toBe('begun')
    expect(typeof begun.operation_id).toBe('string')
    identity.operation_id = begun.operation_id as string
    expect((await client.tool('replace_show', { ...identity, idempotency_key: randomUUID(), show: greenShow(showA.id) })).code).toBe('changed')
    await assertUnchanged()
    selections.push({ step: 'private green candidate on A', selectedA: await railA.getAttribute('aria-selected'),
      selectedB: await railB.getAttribute('aria-selected'), showId: await page.evaluate(() => (window as CaptureWindow).__pxlblzShow?.showId) })
    assertSamples(await harness.capture('a-before-navigation-250', 250), [red, red])

    await railB.click()
    await expect(railB).toHaveAttribute('aria-selected', 'true')
    await page.waitForFunction(id => (window as CaptureWindow).__pxlblzShow?.showId === id, showB.id)
    await expect(page.getByTestId('show-stage-canvas-frame')).toHaveAttribute('aria-busy', 'false')
    await page.evaluate(settings => (window as CaptureWindow).__pxlblzShow!.setPreview(settings), previewSettings)
    await expect.poll(async () => (await client.tool('read_show', { binding_id: client.bindingId })).code).toBe('no_live_editor')
    const refusedAtB = await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })
    expect(refusedAtB.code).toBe('no_live_editor')
    await assertUnchanged()
    selections.push({ step: 'B selected after old binding retired', selectedA: await railA.getAttribute('aria-selected'),
      selectedB: await railB.getAttribute('aria-selected'), showId: await page.evaluate(() => (window as CaptureWindow).__pxlblzShow?.showId),
      commitCode: refusedAtB.code })
    assertSamples(await harness.capture('b-250', 250), [red, red])

    await railA.click()
    await expect(railA).toHaveAttribute('aria-selected', 'true')
    await page.waitForFunction(id => (window as CaptureWindow).__pxlblzShow?.showId === id, showA.id)
    await expect(page.getByTestId('show-stage-canvas-frame')).toHaveAttribute('aria-busy', 'false')
    await page.evaluate(settings => (window as CaptureWindow).__pxlblzShow!.setPreview(settings), previewSettings)
    const refusedAtReturn = await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })
    expect(refusedAtReturn.code).toBe('no_live_editor')
    await assertUnchanged()
    selections.push({ step: 'A selected again without binding resurrection', selectedA: await railA.getAttribute('aria-selected'),
      selectedB: await railB.getAttribute('aria-selected'), showId: await page.evaluate(() => (window as CaptureWindow).__pxlblzShow?.showId),
      commitCode: refusedAtReturn.code })
    assertSamples(await harness.capture('a-return-250', 250), [red, red])
    await writeEvidence('navigation-retirement', testInfo, showA, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        shows: [{ id: showA.id, name: showA.name }, { id: showB.id, name: showB.name }],
        selections, refusals: { atB: refusedAtB.code, atReturn: refusedAtReturn.code },
        assertions: ['A and B complete durable records remain their pre-navigation snapshots at every step',
          'old binding returns no_live_editor after B selection and after returning to A',
          'both editors display literal solid-red Stage pixels at 250 ms'],
      }, browserErrors, 1162)
  } finally { await client.close() }
})

test('dirty duration Escape releases a waiting MCP replacement as one history step (#1165)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seedSolid(page, 'agent-mcp-1165-escape', 'MCP Escape wait proof')
  await seedPatterns(page)
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'escape')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  try {
    const before = await assertStored(page, original, original)
    assertSamples(await harness.capture('red-before-250', 250), [red, red])
    const candidate = greenShow(original.id)
    expect((await client.tool('read_show', { binding_id: client.bindingId })).code).toBe('read')
    const begun = await client.tool('begin_edit', { binding_id: client.bindingId, intent: 'Replace red after duration Escape', idempotency_key: randomUUID() })
    expect(begun.code).toBe('begun')
    expect(typeof begun.operation_id).toBe('string')
    const identity = { binding_id: client.bindingId, operation_id: begun.operation_id as string }
    expect((await client.tool('replace_show', { ...identity, idempotency_key: randomUUID(), show: candidate })).code).toBe('changed')
    const redClip = page.getByRole('button', { name: 'Select Solid red', exact: true })
    await redClip.click()
    const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
    await duration.fill('0.75')
    await expect(duration).toBeFocused()
    expect((await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })).code).toBe('outcome')
    await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'waiting' })
    await expect(duration).toBeFocused()
    expect(await findStoredShowV2(page, original.id)).toEqual(before)
    await duration.press('Escape')
    await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'applied', settlement: 'saved' })
    await assertStored(page, original, candidate)
    await expect(duration).not.toBeVisible()
    await expect(redClip).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Select Solid green', exact: true })).toBeVisible()
    assertSamples(await harness.capture('green-after-escape-250', 250), [green, green])
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await assertStored(page, original, original)
    await expect(redClip).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select Solid green', exact: true })).toHaveCount(0)
    assertSamples(await harness.capture('red-after-undo-250', 250), [red, red])
    await writeEvidence('escape-release', testInfo, original, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        waiting: { focusedField: 'Duration seconds exact time', draft: '0.75', durableUnchanged: true },
        outcome: { status: 'applied', settlement: 'saved', release: 'Escape', undoRestoredOriginal: true },
      }, browserErrors, 1165)
  } finally { await client.close() }
})

test('cancel_edit during dirty-input wait preserves red and permits a fresh replacement (#1165)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seedSolid(page, 'agent-mcp-1165-cancel', 'MCP cancel wait proof')
  await seedPatterns(page)
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'cancel')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  try {
    const before = await assertStored(page, original, original)
    const candidate = greenShow(original.id)
    expect((await client.tool('read_show', { binding_id: client.bindingId })).code).toBe('read')
    const begun = await client.tool('begin_edit', { binding_id: client.bindingId, intent: 'Cancel green candidate during duration wait', idempotency_key: randomUUID() })
    expect(begun.code).toBe('begun')
    expect(typeof begun.operation_id).toBe('string')
    const identity = { binding_id: client.bindingId, operation_id: begun.operation_id as string }
    expect((await client.tool('replace_show', { ...identity, idempotency_key: randomUUID(), show: candidate })).code).toBe('changed')
    await page.getByRole('button', { name: 'Select Solid red', exact: true }).click()
    const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
    await duration.fill('0.75')
    await expect(duration).toBeFocused()
    expect((await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })).code).toBe('outcome')
    await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'waiting' })
    expect(await findStoredShowV2(page, original.id)).toEqual(before)
    const cancelled = await client.tool('cancel_edit', { ...identity, idempotency_key: randomUUID() })
    expect(cancelled).toMatchObject({ code: 'outcome', receipt: { status: 'cancelled' } })
    await duration.press('Escape')
    await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'cancelled' })
    await assertStored(page, original, original)
    await expect(page.getByRole('button', { name: 'Select Solid red', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select Solid green', exact: true })).toHaveCount(0)
    assertSamples(await harness.capture('red-after-cancel-250', 250), [red, red])
    const freshIdentity = await replace(client, candidate, 'Fresh green replacement after cancellation')
    await assertStored(page, original, candidate)
    await expect(page.getByRole('button', { name: 'Select Solid green', exact: true })).toBeVisible()
    assertSamples(await harness.capture('green-after-fresh-250', 250), [green, green])
    expect((await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'cancelled' })
    await writeEvidence('cancel-wait', testInfo, original, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        cancelledOperationId: identity.operation_id, freshOperationId: freshIdentity.operation_id,
        assertions: ['cancelled receipt remains terminal after draft Escape and a fresh saved replacement', 'complete red then green records and literal Stage pixels'],
      }, browserErrors, 1165)
  } finally { await client.close() }
})

test('textbox Undo leaves MCP history to the timeline (#1165)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seedSolid(page, 'agent-mcp-1165-textbox-undo', 'MCP textbox history proof')
  await seedPatterns(page)
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'textbox-undo')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  try {
    const candidate = greenShow(original.id)
    await replace(client, candidate, 'Replace red with green before textbox Undo')
    const before = await assertStored(page, original, candidate)
    const greenClip = page.getByRole('button', { name: 'Select Solid green', exact: true })
    await greenClip.click()
    const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
    await duration.fill('0.75')
    await expect(duration).toBeFocused()
    await duration.press('ControlOrMeta+z')
    expect(await findStoredShowV2(page, original.id)).toEqual(before)
    await duration.press('Escape')
    await assertStored(page, original, candidate)
    assertSamples(await harness.capture('green-after-textbox-undo-250', 250), [green, green])
    if (await duration.isVisible()) await greenClip.click()
    await expect(duration).not.toBeVisible()
    await expect(greenClip).toBeFocused()
    await greenClip.press('ControlOrMeta+z')
    await assertStored(page, original, original)
    await expect(greenClip).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Select Solid red', exact: true })).toBeVisible()
    assertSamples(await harness.capture('red-after-timeline-undo-250', 250), [red, red])
    await writeEvidence('textbox-history', testInfo, original, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        assertions: ['textbox Undo did not consume document history', 'Escape discarded the duration draft', 'timeline Undo restored the complete original red record'],
      }, browserErrors, 1165)
  } finally { await client.close() }
})

test('timeline Undo supersedes a private MCP candidate without truncating Redo (#1165)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seedSolid(page, 'agent-mcp-1165-undo-private', 'MCP stale candidate proof')
  await seedPatterns(page)
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'undo-private')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  try {
    const greenShowRecord = greenShow(original.id)
    await replace(client, greenShowRecord, 'Replace red with green before private edit')
    await assertStored(page, original, greenShowRecord)
    const halfOpacity = structuredClone(greenShowRecord)
    halfOpacity.composition.clips[0].appearance.keys[0].value.opacity = 0.5
    expect((await client.tool('read_show', { binding_id: client.bindingId })).code).toBe('read')
    const begun = await client.tool('begin_edit', { binding_id: client.bindingId, intent: 'Private half-opacity green candidate', idempotency_key: randomUUID() })
    expect(begun.code).toBe('begun')
    expect(typeof begun.operation_id).toBe('string')
    const identity = { binding_id: client.bindingId, operation_id: begun.operation_id as string }
    expect((await client.tool('replace_show', { ...identity, idempotency_key: randomUUID(), show: halfOpacity })).code).toBe('changed')
    const greenClip = page.getByRole('button', { name: 'Select Solid green', exact: true })
    await greenClip.click()
    const duration = page.getByRole('textbox', { name: 'Duration seconds exact time' })
    await expect(duration).toBeVisible()
    await greenClip.click()
    await expect(duration).not.toBeVisible()
    await expect(greenClip).toBeFocused()
    await greenClip.press('ControlOrMeta+z')
    await assertStored(page, original, original)
    const rejected = await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })
    expect(rejected.code).toBe('outcome')
    await expect.poll(async () => (await client.tool('get_outcome', identity)).receipt).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
    await assertStored(page, original, original)
    await expect(greenClip).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Select Solid red', exact: true })).toBeVisible()
    assertSamples(await harness.capture('red-after-refusal-250', 250), [red, red])
    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    await assertStored(page, original, greenShowRecord)
    await expect(greenClip).toBeVisible()
    assertSamples(await harness.capture('green-after-redo-250', 250), [green, green])
    await writeEvidence('undo-private', testInfo, original, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        refusal: { status: 'refused', reason: 'revision-conflict', rejectedOpacity: 0.5 },
        assertions: ['complete red record and pixels survive rejected private commit', 'Redo restores the saved full-green record'],
      }, browserErrors, 1165)
  } finally { await client.close() }
})

test('reload retires a private MCP candidate and its old binding (#1165)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const started = performance.now()
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const original = await seedSolid(page, 'agent-mcp-1165-reload', 'MCP reload retirement proof')
  await seedPatterns(page)
  await openEditor(page, original)
  const harness = captureHarness(page, testInfo, 'reload-private')
  await harness.install()
  const bindingStart = performance.now()
  const client = await boundClient(page, original)
  const bindingMs = performance.now() - bindingStart
  try {
    const before = await assertStored(page, original, original)
    const candidate = greenShow(original.id)
    expect((await client.tool('read_show', { binding_id: client.bindingId })).code).toBe('read')
    const begun = await client.tool('begin_edit', { binding_id: client.bindingId, intent: 'Private green candidate retired by reload', idempotency_key: randomUUID() })
    expect(begun.code).toBe('begun')
    expect(typeof begun.operation_id).toBe('string')
    const identity = { binding_id: client.bindingId, operation_id: begun.operation_id as string }
    expect((await client.tool('replace_show', { ...identity, idempotency_key: randomUUID(), show: candidate })).code).toBe('changed')
    expect(await findStoredShowV2(page, original.id)).toEqual(before)
    await page.reload()
    await expect(page.getByRole('treeitem', { name: original.name, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('show-stage-canvas-frame')).toHaveAttribute('aria-busy', 'false')
    await page.waitForFunction(id => (window as CaptureWindow).__pxlblzShow?.showId === id, original.id)
    await page.evaluate(settings => (window as CaptureWindow).__pxlblzShow!.setPreview(settings), previewSettings)
    await expect.poll(async () => (await client.tool('read_show', { binding_id: client.bindingId })).code).toBe('no_live_editor')
    expect((await client.tool('commit_edit', { ...identity, idempotency_key: randomUUID() })).code).toBe('no_live_editor')
    await assertStored(page, original, original)
    await expect(page.getByRole('button', { name: 'Select Solid red', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select Solid green', exact: true })).toHaveCount(0)
    assertSamples(await harness.capture('red-after-reload-250', 250), [red, red])
    await writeEvidence('reload-retirement', testInfo, original, harness, client,
      { setupMs: bindingStart - started, bindingMs, captureMs: harness.captureMs(), totalMs: performance.now() - started }, {
        refusals: { read: 'no_live_editor', commit: 'no_live_editor' },
        assertions: ['complete original red record survived reload', 'private green Clip never appeared', 'literal red Stage pixels at 250 ms'],
      }, browserErrors, 1165)
  } finally { await client.close() }
})
