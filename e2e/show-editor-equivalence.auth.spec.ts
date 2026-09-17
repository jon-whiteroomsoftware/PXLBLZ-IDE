import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page } from './fixtures/authenticated'
import type { ShowRecord } from '../src/engine/personalContentRecords'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import {
  assessBehaviorPair,
  assessVisualPair,
  normalizeShowEquivalenceRecord,
  type VisualPairAssessment,
} from '../src/test/showEditorEquivalenceOracle'

type FixturePair = {
  source: ShowRecord
  converted: ShowRecordV2
  conversionReport: { retiredSilentRuntimeUses: unknown[] } & Record<string, unknown>
}
type Fixture = { key: string; fixedTimeMs: number } & FixturePair
type Manifest = { version: number; corpus: Fixture[]; behavior: FixturePair }
type SeededPair = { key: string; name: string; v1Id: string; v2Id: string; v1: ShowRecord; v2: ShowRecordV2; conversionReport: unknown }
type CaptureFailure = 'unavailable' | 'capture-error'
type CapturedSurface = {
  present: boolean
  x?: number
  y?: number
  width?: number
  height?: number
  path?: string
  sha256?: string
  bytes?: Buffer
  failure?: CaptureFailure
  detail?: string
}
type PixelComparison = { changedPixels?: number; maximumChannelDelta?: number; complete: boolean }
type HistoryShape = { past: number; future: number }
type BehaviorOutcome = {
  version: 'v1' | 'v2'
  available: boolean
  error?: string
  saved?: unknown
  historyAfterDrag?: HistoryShape
  savesAfterDrag?: number
  movedPreservedOnFreshPage?: boolean
  historyAfterUndo?: HistoryShape
  savesAfterUndo?: number
  undoRestoredAfterReload?: boolean
}
type PrepareKind = 'clip' | 'show-actions' | 'show-properties' | 'zones' | 'zone-map' | 'zone-layout'
  | 'transition-authoring' | 'transition-palette' | 'animation'
type SurfaceSpec = {
  name: string
  fixture: '*' | Fixture['key']
  selector?: string
  prepare?: PrepareKind
}

const manifest = JSON.parse(await readFile(new URL('./fixtures/showEditorEquivalence.json', import.meta.url), 'utf8')) as Manifest
const runId = process.env.PXLBLZ_EQUIVALENCE_RUN_ID
  ?? new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
const outputRoot = resolve(
  process.env.PXLBLZ_EQUIVALENCE_OUTPUT ?? `/tmp/pxlblz-show-editor-equivalence/${runId}`,
)
const viewportCases = [
  { key: 'desktop', width: 1440, height: 1000 },
  { key: 'narrow', width: 390, height: 844 },
] as const
const fixtureFilter = process.env.PXLBLZ_EQUIVALENCE_FIXTURE
const viewportFilter = process.env.PXLBLZ_EQUIVALENCE_VIEWPORT
const surfaceFilter = process.env.PXLBLZ_EQUIVALENCE_SURFACE

const surfaces: readonly SurfaceSpec[] = [
  { name: 'whole-editor', fixture: '*', selector: '[data-testid="editor-pane"]' },
  { name: 'full-window-diagnostic', fixture: '*' },
  { name: 'timeline', fixture: '*', selector: '[aria-label="Show timeline"]' },
  { name: 'toolbar', fixture: '*', selector: '[data-testid="show-timeline-toolbar"]' },
  { name: 'stage-canvas', fixture: '*', selector: '[data-testid="show-stage-canvas-frame"]' },
  { name: 'preview-strip', fixture: '*', selector: '[data-testid="show-stage-preview"][data-presentation="strip"]' },
  { name: 'header', fixture: '*', selector: '.show-pane-header' },
  { name: 'show-actions', fixture: '*', selector: '[role="menu"][aria-label="Show actions"]', prepare: 'show-actions' },
  { name: 'clip-detail-panel', fixture: 'fresh', selector: '[role="dialog"][aria-label="Entity Detail Panel"]:has([data-entity-family="clip"])', prepare: 'clip' },
  { name: 'transition-authoring', fixture: 'fresh', selector: '[role="dialog"][aria-label="Entity Detail Panel"]:has([data-entity-family="transition"])', prepare: 'transition-authoring' },
  { name: 'transition-palette', fixture: 'fresh', selector: '[role="dialog"][aria-label="Choose Transition"]', prepare: 'transition-palette' },
  { name: 'property-animation-editor', fixture: 'groups-animation', selector: '[role="dialog"][data-show-detail-owned-portal="true"]', prepare: 'animation' },
  { name: 'zones-rail', fixture: 'installation-layouts', selector: '[data-testid="show-timeline-grid"]', prepare: 'zones' },
  { name: 'zone-map', fixture: 'installation-layouts', selector: '[role="dialog"][aria-label="Zone Map"]', prepare: 'zone-map' },
  { name: 'zone-layout-panel', fixture: 'installation-layouts', selector: '[role="dialog"][aria-label="Entity Detail Panel"]:has([data-entity-family="zone-layout"])', prepare: 'zone-layout' },
  { name: 'show-properties', fixture: 'fresh', selector: '[role="dialog"][aria-label="Entity Detail Panel"]:has([data-entity-family="show"])', prepare: 'show-properties' },
] as const

const activeFixtures = manifest.corpus.filter(item => !fixtureFilter || item.key === fixtureFilter)
const activeViewports = viewportCases.filter(item => !viewportFilter || item.key === viewportFilter)
const activeSurfaces = surfaces.filter(item => !surfaceFilter || item.name === surfaceFilter)
const activeFilters = {
  fixture: fixtureFilter ?? null,
  viewport: viewportFilter ?? null,
  surface: surfaceFilter ?? null,
}
const partialCoverage = Boolean(fixtureFilter || viewportFilter || surfaceFilter)
if (activeFixtures.length === 0) throw new Error(`Unknown Show editor equivalence fixture filter: ${fixtureFilter}`)
if (activeViewports.length === 0) throw new Error(`Unknown Show editor equivalence viewport filter: ${viewportFilter}`)
if (activeSurfaces.length === 0) throw new Error(`Unknown Show editor equivalence surface filter: ${surfaceFilter}`)

test('capture setup resets persisted per-Show Zones rail state before every capture', async ({ page }) => {
  page.setDefaultTimeout(10_000)
  const fixture = manifest.corpus.find(item => item.key === 'installation-layouts')!
  const pair = await seedPair(page, fixture.key, fixture)
  const viewport = viewportCases[0]

  await openAtFixedState(page, pair.v1Id, fixture.fixedTimeMs, viewport)
  await page.getByRole('button', { name: 'Open Zones' }).click()
  await expect(page.getByRole('button', { name: 'Close Zones' })).toBeVisible()
  expect(await readZoneWorkspaceOpen(page, pair.v1Id)).toBe(true)

  await openAtFixedState(page, pair.v1Id, fixture.fixedTimeMs, viewport)
  await expect(page.getByRole('button', { name: 'Open Zones' })).toBeVisible()
  expect(await readZoneWorkspaceOpen(page, pair.v1Id)).toBe(false)
})

test('pair seeding converts the persisted v1 representation without erasing storage defaults', async ({ page }) => {
  const pair = await seedPair(page, 'pointer-drag', manifest.behavior)
  expect(Object.hasOwn(pair.v1, 'stageMapId')).toBe(true)
  expect(pair.v1.stageMapId).toBeNull()
  expect(Object.hasOwn(pair.v2, 'stageMapId')).toBe(true)
  expect(pair.v2.stageMapId).toBeNull()

  const persistedSource = {
    ...structuredClone(pair.v1),
    id: pair.v2Id,
    updatedAt: 1,
  }
  const conversion = await convertInBrowser(page, persistedSource, 'pointer-drag-persisted-proof')
  expect(conversion.status).toBe('converted')
  if (conversion.status !== 'converted') return
  expect(normalizeShowEquivalenceRecord(conversion.record)).toEqual(
    normalizeShowEquivalenceRecord(pair.v2),
  )
})

test('visual oracle compares stable v1/v2 stored rows over the corpus', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  page.setDefaultTimeout(10_000)
  page.setDefaultNavigationTimeout(15_000)
  await mkdir(outputRoot, { recursive: true })
  const pairs = await seedCorpus(page)
  const comparisons: Array<VisualPairAssessment & Record<string, unknown>> = []

  for (const pair of pairs) {
    const fixture = manifest.corpus.find(item => item.key === pair.key)!
    for (const viewport of activeViewports) {
      for (const surface of activeSurfaces.filter(item => item.fixture === '*' || item.fixture === pair.key)) {
        const captures: Record<'v1a' | 'v1b' | 'v2a' | 'v2b', CapturedSurface> = {} as never
        for (const version of ['v1', 'v2'] as const) {
          const id = version === 'v1' ? pair.v1Id : pair.v2Id
          console.log(`[equivalence] opening ${pair.key}/${viewport.key}/${surface.name}/${version}`)
          try {
            await openAtFixedState(page, id, fixture.fixedTimeMs, viewport)
            const unavailable = await prepareSurface(page, surface.prepare)
            if (unavailable) {
              captures[`${version}a`] = unavailable
              captures[`${version}b`] = unavailable
            } else {
              captures[`${version}a`] = await captureSurface(page, pair.key, viewport.key, surface, `${version}-a`)
              captures[`${version}b`] = await captureSurface(page, pair.key, viewport.key, surface, `${version}-b`)
            }
            console.log(`[equivalence] captured ${pair.key}/${viewport.key}/${surface.name}/${version}`)
          } catch (error) {
            const failed: CapturedSurface = {
              present: false,
              failure: 'capture-error',
              detail: error instanceof Error ? error.message : String(error),
            }
            captures[`${version}a`] = failed
            captures[`${version}b`] = failed
          }
        }
        const stableV1 = await compareCaptured(page, captures.v1a, captures.v1b)
        const stableV2 = await compareCaptured(page, captures.v2a, captures.v2b)
        const v1Stable = repeatCaptureIsStable(captures.v1a, captures.v1b, stableV1)
        const v2Stable = repeatCaptureIsStable(captures.v2a, captures.v2b, stableV2)
        const parity = v1Stable && v2Stable
          ? await compareCaptured(page, captures.v1a, captures.v2a)
          : { complete: false }
        const assessment = assessVisualPair({
          surface: surface.name,
          v1: reportEndpoint(captures.v1a),
          v2: reportEndpoint(captures.v2a),
          changedPixels: parity.changedPixels,
          maximumChannelDelta: parity.maximumChannelDelta,
        })
        comparisons.push({
          fixture: pair.key,
          viewport: viewport.key,
          ...assessment,
          captures: Object.fromEntries(Object.entries(captures).map(([key, capture]) => [key, reportEndpoint(capture)])),
          stability: { v1: stableV1, v2: stableV2 },
          classification: captures.v1a.failure === 'unavailable'
            ? 'invalid-v1-baseline'
            : v1Stable && v2Stable
              ? 'product-comparison'
              : 'unstable-capture',
        })
      }
    }
  }

  const verdictComparisons = comparisons.filter(comparison => comparison.surface !== 'full-window-diagnostic')
  const report = {
    schemaVersion: 1,
    runId,
    generatedAt: new Date().toISOString(),
    outputRoot,
    issue: 1065,
    expectedToday: 'different',
    filters: activeFilters,
    partialCoverage,
    widths: activeViewports.map(viewport => viewport.width),
    routes: pairs.map(pair => ({ key: pair.key, v1: `/PXLBLZ-IDE/studio/shows/${pair.v1Id}`, v2: `/PXLBLZ-IDE/studio/shows/${pair.v2Id}` })),
    conversionReports: pairs.map(pair => ({
      key: pair.key,
      report: pair.conversionReport,
      note: 'Reported for diagnosis only; converter differences are not a visual allowlist.',
    })),
    comparisons,
    verdictCount: verdictComparisons.length,
    equivalent: verdictComparisons.length > 0 && verdictComparisons.every(comparison => comparison.equivalent),
  }
  await writeFile(resolve(outputRoot, 'visual-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  expect(comparisons.filter(comparison => comparison.classification === 'invalid-v1-baseline'), 'A missing v1 baseline is invalid evidence, not an expected product mismatch.').toEqual([])
  expect(comparisons.filter(comparison => comparison.classification === 'unstable-capture'), 'Capture instability is infrastructure failure, not UX evidence.').toEqual([])
  expect(report.equivalent, `Show editor equivalence failed; see ${resolve(outputRoot, 'visual-report.json')}`).toBe(true)
})

test('the same pointer Clip drag has equal durable result, exact history and one save', async ({ page }) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(5_000)
  await mkdir(outputRoot, { recursive: true })
  const pair = await seedPair(page, 'pointer-drag', manifest.behavior)
  const outcomes: BehaviorOutcome[] = []
  for (const version of ['v1', 'v2'] as const) {
    const id = version === 'v1' ? pair.v1Id : pair.v2Id
    const outcome: BehaviorOutcome = { version, available: false }
    let saves = 0
    const countSave = (request: import('@playwright/test').Request) => {
      if ((request.method() === 'PATCH' || request.method() === 'PUT') && request.url().includes(`/api/shows/${id}`)) saves += 1
    }
    page.on('request', countSave)
    try {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto(`studio/shows/${id}`)
      await expect(page.getByTestId('show-stage-preview')).toBeVisible()
      await closeAgentDrawer(page)
      const preimage = await readStoredShow(page, id, version)
      const pause = page.getByRole('button', { name: 'Pause Show preview' }).first()
      if (await pause.isVisible()) await pause.click()
      await page.getByRole('button', { name: 'Go to Show start' }).first().click()
      await dragFirstOrdinaryClip(page, version)
      outcome.available = true
      await expect.poll(() => saves).toBe(1)
      const saved = await readStoredShow(page, id, version)
      outcome.saved = saved
      outcome.savesAfterDrag = saves
      outcome.historyAfterDrag = await readHistoryShape(page, id, version)
      const freshPage = await page.context().newPage()
      try {
        await freshPage.goto(`studio/shows/${id}`)
        await expect(freshPage.getByTestId('show-stage-preview')).toBeVisible()
        const hydratedMoved = await readHydratedShow(freshPage, id, version)
        outcome.movedPreservedOnFreshPage = isDeepStrictEqual(
          normalizeShowEquivalenceRecord(hydratedMoved),
          normalizeShowEquivalenceRecord(saved),
        )
      } finally {
        await freshPage.close()
      }
      await undoThroughUi(page)
      await expect.poll(() => saves).toBe(2)
      await expect.poll(async () => isDeepStrictEqual(
        normalizeShowEquivalenceRecord(await readStoredShow(page, id, version)),
        normalizeShowEquivalenceRecord(preimage),
      )).toBe(true)
      outcome.savesAfterUndo = saves
      outcome.historyAfterUndo = await readHistoryShape(page, id, version)
      await page.reload()
      await expect(page.getByTestId('show-stage-preview')).toBeVisible()
      const restoredAfterReload = await readStoredShow(page, id, version)
      outcome.undoRestoredAfterReload = isDeepStrictEqual(
        normalizeShowEquivalenceRecord(restoredAfterReload),
        normalizeShowEquivalenceRecord(preimage),
      )
    } catch (error) {
      outcome.error = error instanceof Error ? error.message : String(error)
    } finally {
      page.off('request', countSave)
      outcomes.push(outcome)
    }
  }

  let assessment: ReturnType<typeof assessBehaviorPair> | undefined
  let assessmentError: string | undefined
  const [v1, v2] = outcomes
  if (v1.available && v2.available) {
    const conversion = await convertInBrowser(page, v1.saved as ShowRecord, 'post-gesture-v1')
    if (conversion.status === 'converted') {
      assessment = assessBehaviorPair({
        convertedV1: conversion.record,
        savedV2: v2.saved,
        history: { v1: v1.historyAfterDrag!.past, v2: v2.historyAfterDrag!.past },
        saves: { v1: v1.savesAfterDrag!, v2: v2.savesAfterDrag! },
        reloadPreserved: { v1: v1.movedPreservedOnFreshPage!, v2: v2.movedPreservedOnFreshPage! },
        undoRestored: { v1: v1.undoRestoredAfterReload!, v2: v2.undoRestoredAfterReload! },
      })
    } else assessmentError = `Post-gesture v1 record refused conversion: ${JSON.stringify(conversion.issues)}`
  } else assessmentError = 'The ordinary pointer Clip gesture was unavailable on at least one stored row.'
  const report = {
    schemaVersion: 1,
    runId,
    generatedAt: new Date().toISOString(),
    outputRoot,
    issue: 1065,
    gesture: 'pointer Clip drag by +2000ms',
    outcomes,
    assessment,
  }
  if (assessmentError) Object.assign(report, { assessmentError })
  await writeFile(resolve(outputRoot, 'behavior-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  expect(outcomes.map(outcome => outcome.available), `Gesture availability failed; see ${resolve(outputRoot, 'behavior-report.json')}`).toEqual([true, true])
  expect(outcomes.map(outcome => outcome.savesAfterDrag)).toEqual([1, 1])
  expect(outcomes.map(outcome => outcome.movedPreservedOnFreshPage)).toEqual([true, true])
  expect(outcomes.map(outcome => outcome.historyAfterDrag)).toEqual([{ past: 1, future: 0 }, { past: 1, future: 0 }])
  expect(outcomes.map(outcome => outcome.savesAfterUndo)).toEqual([2, 2])
  expect(outcomes.map(outcome => outcome.historyAfterUndo)).toEqual([{ past: 0, future: 1 }, { past: 0, future: 1 }])
  expect(assessment?.equivalent, `Behavioral equivalence failed; see ${resolve(outputRoot, 'behavior-report.json')}`).toBe(true)
})

async function seedCorpus(page: Page): Promise<SeededPair[]> {
  const pairs: SeededPair[] = []
  for (const fixture of activeFixtures) {
    pairs.push(await seedPair(page, fixture.key, fixture))
  }
  return pairs
}

async function seedPair(page: Page, key: string, fixture: FixturePair): Promise<SeededPair> {
  if (!page.url().startsWith('http')) await page.goto('studio/shows?capture')
  const name = fixture.source.name
  const v1Id = `oracle-${key}-v1`
  const v2Id = `oracle-${key}-v2`
  const rawV1 = { ...structuredClone(fixture.source), id: v1Id, name, updatedAt: 1 }
  const rawV2Source = { ...structuredClone(fixture.source), id: v2Id, name, updatedAt: 1 }
  const committedV2 = { ...structuredClone(fixture.converted), id: v2Id, name, updatedAt: 1 }
  if (fixture.conversionReport.retiredSilentRuntimeUses.length > 0) {
    throw new Error(`${key} carries retired silent runtime use and is unsuitable for the basic equivalence corpus.`)
  }

  // The committed fixture still detects converter drift. It is not the row
  // seeded for comparison: storage may add authored defaults such as
  // stageMapId:null, so the actual pair must be based on the persisted v1 row.
  const fixtureConversion = await convertInBrowser(page, rawV2Source, `${key}-fixture-freshness`)
  if (fixtureConversion.status !== 'converted') {
    throw new Error(`${key} current fixture conversion refused: ${JSON.stringify(fixtureConversion.issues)}`)
  }
  if (!isDeepStrictEqual(fixtureConversion.record, committedV2)) {
    throw new Error(`${key} committed converted fixture is stale against the runtime converter.`)
  }

  for (const id of [v1Id, v2Id]) await page.request.delete(`/api/shows/${id}`)
  const createdV1 = await page.request.post('/api/shows', { data: rawV1 })
  expect(createdV1.ok(), await createdV1.text()).toBe(true)
  const persistedV1 = await readStoredShow(page, v1Id, 'v1') as ShowRecord
  const persistedV2Source = {
    ...structuredClone(persistedV1),
    id: v2Id,
    name,
    updatedAt: 1,
  }
  const createdV2Source = await page.request.post('/api/shows', { data: persistedV2Source })
  expect(createdV2Source.ok(), await createdV2Source.text()).toBe(true)

  const persistedConversion = await convertInBrowser(page, persistedV2Source, `${key}-persisted-v1`)
  if (persistedConversion.status !== 'converted') {
    throw new Error(`${key} persisted v1 conversion refused: ${JSON.stringify(persistedConversion.issues)}`)
  }
  if (persistedConversion.report.retiredSilentRuntimeUses.length > 0) {
    throw new Error(`${key} persisted v1 row carries retired silent runtime use.`)
  }
  const stored = await page.request.put(`/api/shows/${v2Id}?show-version=2`, { data: persistedConversion.record })
  expect(stored.ok(), await stored.text()).toBe(true)
  const persistedV2 = await readStoredShow(page, v2Id, 'v2') as ShowRecordV2
  return {
    key,
    name,
    v1Id,
    v2Id,
    v1: persistedV1,
    v2: persistedV2,
    conversionReport: persistedConversion.report,
  }
}

async function convertInBrowser(page: Page, source: ShowRecord, key: string) {
  return page.evaluate(async ({ record, fixtureKey }) => {
    const load = (path: string) => import(path)
    const { convertShowRecordV1ToV2 } = await load('/PXLBLZ-IDE/src/engine/showRecordV1ToV2.ts')
    let byCellId: Record<string, string> = {}
    if (record.cells.length > 0) {
      const { DEMOS, resolveStockPatternId } = await load('/PXLBLZ-IDE/src/pixelblaze/stock/patterns.ts')
      byCellId = Object.fromEntries(record.cells.map(cell => {
        if (cell.pattern.kind !== 'stock') throw new Error(`${fixtureKey} has a non-stock flat Pattern dependency.`)
        const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
        if (!patternSource) throw new Error(`${fixtureKey} is missing stock Pattern source ${cell.pattern.id}.`)
        return [cell.id, patternSource]
      }))
    }
    return convertShowRecordV1ToV2(record, { byCellId })
  }, { record: source, fixtureKey: key }) as Promise<
    | { status: 'converted'; record: ShowRecordV2; report: { retiredSilentRuntimeUses: unknown[] } & Record<string, unknown> }
    | { status: 'refused'; issues: unknown[]; report: Record<string, unknown> }
  >
}

async function openAtFixedState(page: Page, id: string, fixedTimeMs: number, viewport: typeof viewportCases[number]) {
  await page.setViewportSize(viewport)
  await page.goto(`studio/shows/${id}?capture`, { waitUntil: 'domcontentloaded', timeout: 15_000 })
  await expect(page.getByTestId('show-stage-preview')).toBeVisible()
  await resetCaptureSessionState(page, id)
  await closeAgentDrawer(page)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  const pause = page.getByRole('button', { name: 'Pause Show preview' }).first()
  if (await pause.isVisible()) await pause.click()
  await page.evaluate(async ({ showId, startMs }) => {
    await document.fonts.ready
    const load = (path: string) => import(path)
    const { useShowTransportStore } = await load('/PXLBLZ-IDE/src/store/showTransportStore.ts')
    const transport = useShowTransportStore.getState()
    transport.setPosition(showId, startMs)
    transport.requestSeek(showId, startMs)
  }, { showId: id, startMs: fixedTimeMs })
  await expect.poll(() => page.evaluate(async () => {
    const load = (path: string) => import(path)
    const { useShowTransportStore } = await load('/PXLBLZ-IDE/src/store/showTransportStore.ts')
    return useShowTransportStore.getState().seekStatus
  })).toBe('idle')
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation: none !important;
      caret-color: transparent !important;
      transition: none !important;
    }
  ` })
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.pause()
      animation.currentTime = 0
    }
  })
  await page.keyboard.press('Escape')
  await page.mouse.move(viewport.width / 2, 2)
  await page.evaluate(() => new Promise<void>(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))))
}

async function resetCaptureSessionState(page: Page, showId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const load = (path: string) => import(path)
    const { useShowEditorSessionStore } = await load('/PXLBLZ-IDE/src/store/showEditorSessionStore.ts')
    useShowEditorSessionStore.getState().setZoneWorkspaceOpen(id, false)
  }, showId)
  await expect.poll(() => readZoneWorkspaceOpen(page, showId)).toBe(false)
}

async function readZoneWorkspaceOpen(page: Page, showId: string): Promise<boolean | undefined> {
  return page.evaluate(async (id) => {
    const load = (path: string) => import(path)
    const { useShowEditorSessionStore } = await load('/PXLBLZ-IDE/src/store/showEditorSessionStore.ts')
    return useShowEditorSessionStore.getState().zoneWorkspaceOpenByShowId[id]
  }, showId)
}

async function closeAgentDrawer(page: Page): Promise<void> {
  const drawer = page.getByTestId('agent-drawer-layout')
  if (!await drawer.count()) return
  if (await drawer.getAttribute('data-drawer-mode') === 'pinned') {
    const unpin = page.getByRole('button', { name: 'Unpin the Agent drawer' })
    if (await unpin.isVisible()) await unpin.click()
  }
  if (await drawer.getAttribute('data-drawer-mode') === 'open') {
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveAttribute('data-drawer-mode', 'tucked')
  }
}

async function prepareSurface(page: Page, prepare?: PrepareKind): Promise<CapturedSurface | undefined> {
  if (!prepare) return undefined
  await page.keyboard.press('Escape')
  if (prepare === 'clip') {
    const clip = page.getByRole('button', { name: /^Select / }).first()
    if (!await clip.isVisible()) return unavailable('No ordinary Clip selector is visible.')
    await clip.click()
  } else if (prepare === 'show-actions') {
    const actions = page.getByRole('button', { name: 'Show actions' })
    if (!await actions.isVisible()) return unavailable('The Show actions trigger is unavailable.')
    await actions.click()
  } else if (prepare === 'show-properties') {
    const button = page.getByRole('button', { name: 'Show properties' })
    if (!await button.isVisible()) return unavailable('The Show properties trigger is unavailable.')
    await button.click()
  } else if (prepare === 'zones' || prepare === 'zone-map') {
    const zones = page.getByRole('button', { name: 'Open Zones' })
    if (await zones.isVisible()) await zones.click()
    if (!await page.getByRole('button', { name: 'Close Zones' }).isVisible()) {
      return unavailable('The ordinary Zones rail cannot be opened.')
    }
    if (prepare === 'zones') return undefined
    const map = page.getByRole('button', { name: 'Open Zone Map' })
    if (!await map.isVisible()) return unavailable('The Zone Map trigger is unavailable in the open Zones rail.')
    await map.click()
  } else if (prepare === 'zone-layout') {
    const add = page.getByRole('button', { name: 'Add to Show' })
    if (!await add.isVisible()) return unavailable('The ordinary Add to Show control is unavailable.')
    await add.click()
    const item = page.getByRole('menuitem', { name: 'Zone Layout' })
    if (!await item.isVisible()) return unavailable('The Zone Layout menu item is unavailable.')
    await item.click()
    const edit = page.getByRole('button', { name: "Open this interval's Zone Layout" })
    if (!await edit.isVisible()) return unavailable('The current Zone Layout editor trigger is unavailable.')
    await edit.click()
  } else if (prepare === 'transition-authoring' || prepare === 'transition-palette') {
    const transition = page.getByRole('button', { name: /^Edit .* Transition between / }).first()
    if (!await transition.isVisible()) return unavailable('No ordinary Transition junction is visible.')
    await transition.click()
    if (prepare === 'transition-authoring') return undefined
    const change = page.getByRole('dialog', { name: 'Entity Detail Panel' }).getByRole('button', { name: /· Change/ })
    if (!await change.isVisible()) return unavailable('The Transition palette trigger is unavailable.')
    await change.click()
  } else if (prepare === 'animation') {
    const group = page.getByRole('button', { name: 'Select Group Mandala pulse', exact: true }).first()
    if (!await group.isVisible()) return unavailable('The animated Group selector is unavailable.')
    await group.dblclick()
    const clip = page.getByRole('button', { name: 'Select Group Clip SignalMandala', exact: true }).first()
    if (!await clip.isVisible()) return unavailable('Group isolation did not expose the animated Group Clip.')
    await clip.click()
    const animations = page.getByRole('button', { name: /^Animations — / }).first()
    if (!await animations.isVisible()) return unavailable('The Clip animation overview trigger is unavailable.')
    await animations.click()
    const edit = page.getByRole('button', { name: /^Edit .* animation$/ }).first()
    if (!await edit.isVisible()) return unavailable('No animated property editor trigger is available in the overview.')
    await edit.click()
  }
  return undefined
}

function unavailable(detail: string): CapturedSurface {
  return { present: false, failure: 'unavailable', detail }
}

async function captureSurface(
  page: Page,
  fixture: string,
  viewport: string,
  surface: typeof surfaces[number],
  version: string,
): Promise<CapturedSurface> {
  let locator: Locator | undefined
  if (surface.selector) {
    locator = page.locator(surface.selector).first()
    if (await locator.count() === 0 || !await locator.isVisible()) {
      return unavailable(`Named surface selector is absent or hidden: ${surface.selector}`)
    }
  }
  const path = resolve(outputRoot, `${fixture}-${viewport}-${surface.name}-${version}.png`)
  let bytes: Buffer
  let size: { width: number; height: number } | null
  if (surface.name === 'zones-rail' && locator) {
    const box = await locator.boundingBox()
    const firstTrackWidth = await locator.evaluate(element => {
      const firstTrack = getComputedStyle(element).gridTemplateColumns.split(' ')[0]
      return Number.parseFloat(firstTrack)
    })
    if (!box || !Number.isFinite(firstTrackWidth) || firstTrackWidth <= 0) {
      return { present: false, failure: 'capture-error', detail: 'Could not measure the open Zone rail grid track.' }
    }
    size = { x: box.x, y: box.y, width: firstTrackWidth, height: box.height }
    bytes = await page.screenshot({
      path,
      type: 'png',
      animations: 'disabled',
      clip: { x: box.x, y: box.y, width: firstTrackWidth, height: box.height },
    })
  } else {
    bytes = locator
      ? await locator.screenshot({ path, type: 'png', animations: 'disabled' })
      : await page.screenshot({ path, type: 'png', animations: 'disabled' })
    size = locator
      ? await locator.boundingBox()
      : page.viewportSize() && { x: 0, y: 0, ...page.viewportSize()! }
  }
  return {
    present: true,
    x: size!.x,
    y: size!.y,
    width: Math.round(size!.width),
    height: Math.round(size!.height),
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  }
}

async function compareCaptured(page: Page, left: CapturedSurface, right: CapturedSurface): Promise<PixelComparison> {
  if (!left.present || !right.present || !left.bytes || !right.bytes) return { complete: false }
  return page.evaluate(async ({ leftBase64, rightBase64 }) => {
    const decode = async (base64: string) => {
      const binary = atob(base64)
      const bytes = Uint8Array.from(binary, value => value.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      return { width: bitmap.width, height: bitmap.height, pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data }
    }
    const [a, b] = await Promise.all([decode(leftBase64), decode(rightBase64)])
    if (a.width !== b.width || a.height !== b.height) return { complete: false }
    const load = (path: string) => import(path)
    const { compareRgbaPixels } = await load('/PXLBLZ-IDE/src/test/showEditorEquivalenceOracle.ts')
    return { complete: true, ...compareRgbaPixels(a.pixels, b.pixels) }
  }, { leftBase64: left.bytes.toString('base64'), rightBase64: right.bytes.toString('base64') })
}

function reportEndpoint(capture: CapturedSurface): Omit<CapturedSurface, 'bytes'> {
  const { bytes: _bytes, ...report } = capture
  return report
}

function repeatCaptureIsStable(
  first: CapturedSurface,
  second: CapturedSurface,
  comparison: PixelComparison,
): boolean {
  if (first.failure === 'capture-error' || second.failure === 'capture-error') return false
  if (first.present !== second.present) return false
  if (!first.present && !second.present) return first.failure === second.failure && first.detail === second.detail
  return comparison.complete
    && first.x === second.x
    && first.y === second.y
    && first.width === second.width
    && first.height === second.height
    && comparison.changedPixels === 0
    && comparison.maximumChannelDelta === 0
}

async function dragFirstOrdinaryClip(page: Page, version: 'v1' | 'v2') {
  const clip = page.getByRole('button', { name: /^Select TestPattern1D/ }).first()
  const lane = page.getByTestId('show-timeline-grid')
  const [clipBox, laneBox] = await Promise.all([clip.boundingBox(), lane.boundingBox()])
  expect(clipBox).not.toBeNull()
  expect(laneBox).not.toBeNull()
  const from = { x: clipBox!.x + clipBox!.width / 2, y: clipBox!.y + clipBox!.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + laneBox!.width / 3, from.y, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => {
    const stored = await readStoredShow(page, version === 'v1' ? 'oracle-pointer-drag-v1' : 'oracle-pointer-drag-v2', version)
    if (version === 'v1') return (stored as ShowRecord).composition?.scenes[0].zones[0].main[0].startMs
    return (stored as ShowRecordV2).composition.clips[0].startMs
  }).toBe(2_000)
}

async function readStoredShow(page: Page, id: string, version: 'v1' | 'v2'): Promise<unknown> {
  const response = await page.request.get(version === 'v1' ? '/api/shows' : '/api/shows?show-version=2')
  expect(response.ok(), await response.text()).toBe(true)
  const shows = (await response.json()).shows as Array<{ id: string; version?: number }>
  return shows.find(show => show.id === id)!
}

async function readHydratedShow(page: Page, id: string, version: 'v1' | 'v2'): Promise<unknown> {
  return page.evaluate(async ({ showId, recordVersion }) => {
    const load = (path: string) => import(path)
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(name => /\/src\/store\/showStore\.ts(?:\?|$)/.test(name)).at(-1)!
    const { useShowStore } = await load(url)
    const state = useShowStore.getState()
    return recordVersion === 'v1'
      ? state.shows.find((show: { id: string }) => show.id === showId)
      : state.showV2Pilots[showId]
  }, { showId: id, recordVersion: version })
}

async function readHistoryShape(page: Page, id: string, version: 'v1' | 'v2'): Promise<HistoryShape> {
  return page.evaluate(async ({ showId, recordVersion }) => {
    const load = (path: string) => import(path)
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(name => /\/src\/store\/showStore\.ts(?:\?|$)/.test(name)).at(-1)!
    const { useShowStore } = await load(url)
    const state = useShowStore.getState()
    const history = recordVersion === 'v1' ? state.showHistories[showId] : state.showV2Histories[showId]
    return { past: history?.past.length ?? 0, future: history?.future.length ?? 0 }
  }, { showId: id, recordVersion: version })
}

async function undoThroughUi(page: Page) {
  await page.getByRole('button', { name: 'Undo Show edit', exact: true }).click({ timeout: 5_000 })
}
