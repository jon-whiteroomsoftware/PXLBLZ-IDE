import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures/authenticated'
import type { ShowRecord } from '../src/engine/personalContentRecords'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import {
  assessBehaviorPair,
  assessVisualPair,
  normalizeShowEquivalenceRecord,
  type VisualPairAssessment,
} from '../src/test/showEditorEquivalenceOracle'
import { SHOW_ARTIFACT_BUDGET_BYTES } from '../src/engine/showVmResourceLedger'
import type { DomStateEvidence } from '../src/test/showCaptureRasterNoiseClassifier'
import type { PixelMeasurement, PixelSample } from '../src/test/showCapturePixelEvidence'
import {
  classifySurfaceNoisePlan,
  controlGroupLabel,
  reclassifyVisualPairWithCaptureNoise,
  type PhaseAcquisition,
  type PhaseCapture,
  type PlannedClassification,
  type PlannedComparison,
} from '../src/test/showSurfaceNoisePlan'
import {
  formatDeliveredBytes,
  qualifySourceSizeExceptionWithQualifiedCaptureNoise,
  reclassifyVisualPairWithSourceGaugeException,
  type DemonstratedRestorationSideEffect,
  type GaugeVariant,
  type GaugeVersionEvidence,
  type SourceGaugeExceptionWithNoiseAssessment,
} from '../src/test/showSourceGaugeExceptionOracle'
import {
  demonstrateRestorationSideEffect,
  type RestorationCapture,
} from '../src/test/showRestorationSideEffect'
import {
  applyCommonGaugeValues,
  canonicalizePercent,
  collectPointChains,
  differenceBetweenCaptures,
  rebuildDeliveredArtifact,
  readSurfaceState,
  reproductionPair,
  restoreGaugeValues,
  sampleCapture,
  type CapturedPixelDifference,
  type GaugeReading,
  type SurfaceStateReading,
} from './support/showSurfaceNoiseEvidence'

type FixturePair = {
  source: ShowRecord
  converted: ShowRecordV2
  conversionReport: { retiredSilentRuntimeUses: unknown[] } & Record<string, unknown>
}
type Fixture = { key: string; fixedTimeMs: number } & FixturePair
type Manifest = { version: number; corpus: Fixture[]; behavior: FixturePair }
type SeededPair = {
  key: string
  name: string
  v1Id: string
  v2Id: string
  v1: ShowRecord
  v2: ShowRecordV2
  conversionReport: unknown
  captureId: string
  captureSource: ShowRecord
  captureConverted: ShowRecordV2
}
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

/**
 * The counterfactual's sentinel value, in delivered bytes (#1065).
 *
 * The common value the plan writes is v1's own displayed value, so writing it straight into a v1 row
 * changes nothing and that row's normalized capture is an un-mutated raster, while v2's is a fresh
 * one. Chromium re-rasters the mutated layer, and at 390 that re-raster lands the preview help icon
 * one level different, so the counterfactual was refused for a difference neither version owns. Both
 * versions therefore pass through this one sentinel first, with a presented frame, so each normalized
 * capture is reached by the same two real writes. This is symmetry, not tolerance: the counterfactual
 * still has to be exactly zero, restoration still has to reproduce the raw capture, and the strict
 * verdict is untouched. The value is checked against each version's own value at run time rather than
 * assumed distinct, and it is well outside every corpus artifact size and inside the pinned budget.
 */
const GAUGE_SENTINEL_BYTES = 52_429

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

test('the capture arrangement holds Show identity fixed, and a distinct identity would corrupt the Stage comparison', async ({ page }) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(10_000)
  page.setDefaultNavigationTimeout(15_000)
  await mkdir(outputRoot, { recursive: true })
  const fixture = manifest.corpus.find(item => item.key === 'installation-layouts')!
  const surface = surfaces.find(item => item.name === 'stage-canvas')!
  const viewport = viewportCases[0]
  const pair = await seedPair(page, fixture.key, fixture)

  // A distinct row carrying the same converted content is the arrangement this
  // repair replaces. It is converted from its own source so nothing but the
  // Show identity distinguishes it from the capture row's v2 state.
  const distinctId = `${pair.captureId}-distinct-identity`
  const distinctSource = { ...structuredClone(pair.captureSource), id: distinctId }
  const distinctConversion = await convertInBrowser(page, distinctSource, 'distinct-identity-probe')
  expect(distinctConversion.status).toBe('converted')
  if (distinctConversion.status !== 'converted') return
  expect(normalizeShowEquivalenceRecord(distinctConversion.record))
    .toEqual(normalizeShowEquivalenceRecord(pair.captureConverted))

  const capturedV1Identity = await stageCaptureRow(page, pair, 'v1')
  await openAtFixedState(page, pair.captureId, fixture.fixedTimeMs, viewport)
  const sameIdentityV1 = await captureSurface(page, `${pair.key}-identity`, viewport.key, surface, 'same-identity-v1')
  const capturedV2Identity = await stageCaptureRow(page, pair, 'v2')
  await openAtFixedState(page, pair.captureId, fixture.fixedTimeMs, viewport)
  const sameIdentityV2 = await captureSurface(page, `${pair.key}-identity`, viewport.key, surface, 'same-identity-v2')
  expect(capturedV1Identity).toBe(capturedV2Identity)
  expect(sameIdentityV1.present && sameIdentityV2.present).toBe(true)
  const heldIdentity = await compareCaptured(page, sameIdentityV1, sameIdentityV2)
  expect(heldIdentity.complete, 'The held-identity Stage captures must be comparable.').toBe(true)
  expect(heldIdentity.changedPixels, 'One Show identity converted in place must render exactly.').toBe(0)
  expect(heldIdentity.maximumChannelDelta).toBe(0)

  await leaveEditorBeforeReplacingRow(page)
  await page.request.delete(`/api/shows/${distinctId}`)
  const createdDistinct = await page.request.post('/api/shows', { data: distinctSource })
  expect(createdDistinct.ok(), await createdDistinct.text()).toBe(true)
  const convertedDistinct = await page.request.put(`/api/shows/${distinctId}?show-version=2`, { data: distinctConversion.record })
  expect(convertedDistinct.ok(), await convertedDistinct.text()).toBe(true)
  await openAtFixedState(page, distinctId, fixture.fixedTimeMs, viewport)
  const distinctIdentity = await captureSurface(page, `${pair.key}-identity`, viewport.key, surface, 'distinct-identity-v2')
  const drift = await compareCaptured(page, sameIdentityV2, distinctIdentity)
  // The distinct row is still mounted here, so it is left through the ordinary
  // lifecycle before it is deleted.
  await releaseCaptureRow(page, distinctId)
  await releaseCaptureRow(page, pair.captureId)
  console.log(`[equivalence] identity sensitivity: held ${JSON.stringify(heldIdentity)}, distinct ${JSON.stringify(drift)}`)
  expect(distinctIdentity.present).toBe(true)
  expect(drift.complete, 'The distinct-identity Stage capture must be comparable.').toBe(true)
  expect(
    drift.changedPixels,
    'Equivalent records under distinct Show ids must still render differently; if this holds, the oracle no longer proves that identity must be held fixed.',
  ).toBeGreaterThan(0)
})

test('visual oracle compares stable v1/v2 stored rows over the corpus', async ({ page }) => {
  // A surface whose strict comparison differs also runs the bounded control plan, which reopens the
  // row and walks the surface's computed styles once per capture. Measured, not estimated: the
  // retained `tip-6ee11aa7` run in docs/reference/evidence/issue-1065-equivalence-oracle/ took 9.0
  // minutes for this test and 9.7 minutes for the whole spec on the development machine, so 20
  // minutes is a 2.2x margin. That summary records its own duration, so this figure can be
  // re-checked against it rather than trusted.
  test.setTimeout(20 * 60_000)
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
        const identity: Record<'v1' | 'v2', string | undefined> = { v1: undefined, v2: undefined }
        for (const version of ['v1', 'v2'] as const) {
          console.log(`[equivalence] opening ${pair.key}/${viewport.key}/${surface.name}/${version}`)
          try {
            const id = await stageCaptureRow(page, pair, version)
            identity[version] = id
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
        // The bounded control plan runs once, for any surface whose strict comparison differs, and
        // only on stable captures: classifying an unstable capture would explain nothing. The
        // full-window diagnostic is never a verdict, so it is never qualified either.
        let noise: SurfaceNoiseReport | null = null
        if (assessment.reason === 'pixels-differ' && v1Stable && v2Stable
          && surface.name !== 'full-window-diagnostic') {
          console.log(`[equivalence] collecting noise controls for ${pair.key}/${viewport.key}/${surface.name}`)
          try {
            noise = await collectSurfaceNoise(page, pair, fixture, viewport, surface)
          } catch (error) {
            noise = {
              ran: false,
              detail: `The bounded control plan did not complete: ${error instanceof Error ? error.message : String(error)}`,
              gauge: { usable: false, detail: 'not reached' },
              captures: [],
              measurements: [],
              classifications: [],
              restorationDemonstrations: [],
              delivered: null,
              exception: null,
            }
          }
        }
        const qualified = !noise?.ran
          ? assessment
          : noise.exception
            ? reclassifyVisualPairWithSourceGaugeException(assessment, noise.exception)
            : reclassifyVisualPairWithCaptureNoise(assessment,
              noise.classifications.find(entry => entry.key === 'delivered v1 vs v2'),
              await strictDifferencePositions(page, captures.v1a, captures.v2a))
        comparisons.push({
          fixture: pair.key,
          viewport: viewport.key,
          ...qualified,
          strict: {
            equivalent: assessment.equivalent,
            reason: assessment.reason,
            changedPixels: parity.changedPixels,
            maximumChannelDelta: parity.maximumChannelDelta,
            note: 'The run\'s original captures and their exact difference, retained whatever the'
              + ' qualified verdict says. Nothing here is relabelled by a later classification.',
          },
          noisePlan: noise,
          captures: Object.fromEntries(Object.entries(captures).map(([key, capture]) => [key, reportEndpoint(capture)])),
          stability: { v1: stableV1, v2: stableV2 },
          identity: {
            ...identity,
            same: Boolean(identity.v1) && identity.v1 === identity.v2,
          },
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
    captureIdentity: {
      policy: 'Each comparison renders one capture row under a single Show id: recreated as the persisted v1 record, captured, recreated, then converted in place through PUT /api/shows/<id>?show-version=2 and captured again. The editor is left through ordinary in-app navigation before the row is replaced.',
      reason: 'The Show stage preview seeds its random Pattern replay from the Show id, so the seeded oracle-<key>-v1 and oracle-<key>-v2 rows render different output for equivalent records. The renderer and its seed policy are unchanged.',
      rows: pairs.map(pair => ({ key: pair.key, captureId: pair.captureId, route: `/PXLBLZ-IDE/studio/shows/${pair.captureId}` })),
      inspectionNote: 'The paired routes above remain seeded for coordinator inspection and are never opened by this run. Their identity-seeded random Pattern output differs by construction; compare structure, layout and authored content there, not random Pattern pixels.',
    },
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
  expect(
    comparisons.filter(comparison => !(comparison.identity as { same: boolean }).same),
    'Both storage versions of a pair must be rendered under one Show identity; distinct ids are not equivalent rendering inputs.',
  ).toEqual([])
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


/** Everything the bounded noise plan collected for one surface, recorded whatever it concluded. */
type SurfaceNoiseReport = {
  ran: boolean
  detail: string
  gauge: { usable: boolean; detail: string; variant?: GaugeVariant; placement?: 'inside' | 'behind' }
  captures: readonly PhaseCapture[]
  measurements: readonly ({ key: string } & PixelMeasurement)[]
  classifications: readonly PlannedClassification[]
  restorationDemonstrations: readonly DemonstratedRestorationSideEffect[]
  delivered: Record<'v1' | 'v2', { path: string; route: string; sourceBytes: number }> | null
  exception: SourceGaugeExceptionWithNoiseAssessment | null
}

/**
 * Runs the one fixed, bounded control plan for a surface whose strict comparison differs (#1065).
 *
 * Controls first, candidates afterwards, in the order written here and nowhere else. Every control
 * is an independently acquired capture of an unchanged state: two independent opens of the same
 * row, plus, where the gauge is present, the restored state after each normalization cycle. The
 * candidates are then captured fresh, after every control, so no candidate image can establish its
 * own allowable variants. The run's original captures are untouched and keep the strict verdict.
 *
 * This is executed at most once per surface. The trigger is the strict result, the plan is fixed
 * here, and there is no second attempt: a residual that is not demonstrated noise stays residual.
 */
async function collectSurfaceNoise(
  page: Page,
  pair: SeededPair,
  fixture: Fixture,
  viewport: typeof viewportCases[number],
  surface: typeof surfaces[number],
): Promise<SurfaceNoiseReport> {
  const phases: PhaseCapture[] = []
  const retained = new Map<string, Buffer>()
  const readings = new Map<string, SurfaceStateReading>()
  const deliveredToken: Partial<Record<'v1' | 'v2', string>> = {}
  const deliveredReading: Partial<Record<'v1' | 'v2', SurfaceStateReading>> = {}
  const normalizedReading: Partial<Record<'v1' | 'v2', SurfaceStateReading>> = {}
  const delivered: Partial<Record<'v1' | 'v2', { path: string; route: string; sourceBytes: number; epeText: string }>> = {}
  const canonical: Partial<Record<'v1' | 'v2', { percent: number; serialized: string }>> = {}
  let sequence = 0
  let common: { token: string; inlineWidth: string } | undefined
  let sentinel: { token: string; inlineWidth: string } | undefined
  let gaugeDetail = 'not inspected'
  let variant: GaugeVariant | undefined

  const open = async (version: 'v1' | 'v2') => {
    const id = await stageCaptureRow(page, pair, version)
    await openAtFixedState(page, id, fixture.fixedTimeMs, viewport)
    const blocked = await prepareSurface(page, surface.prepare)
    if (blocked) throw new Error(`The ${surface.name} surface could not be prepared for ${version}: ${blocked.detail}`)
    await warmCaptureApparatus()
    return id
  }

  /**
   * One discarded screenshot per open, before anything is read or retained (#1065).
   *
   * Playwright's `animations: 'disabled'` sets and then clears inline styles while it screenshots,
   * which leaves an empty `style` attribute behind on the elements it froze - here the three range
   * inputs in the preview strip. It paints nothing, but it is part of the surface DOM, so without
   * this the first reading of an open describes a page that has never been screenshotted and every
   * later reading describes one that has. The fingerprints then split on capture order instead of
   * on surface state, and the classifier refuses any comparison that pairs a first capture with a
   * later one - which is exactly `delivered vs restored`. Warming the page makes every reading and
   * every retained capture of that open share one condition. It changes no value and no pixel.
   */
  const warmCaptureApparatus = async () => {
    const locator = surface.selector ? page.locator(surface.selector).first() : undefined
    if (locator && (await locator.count() === 0 || !await locator.isVisible())) return
    if (locator) await locator.screenshot({ type: 'png', animations: 'disabled' })
    else await page.screenshot({ type: 'png', animations: 'disabled' })
  }

  const take = async (
    version: 'v1' | 'v2',
    state: 'delivered' | 'normalized',
    label: string,
    role: 'control' | 'candidate',
    group: string | undefined,
    mutationHistory: string,
    acquisition: PhaseAcquisition = 'direct',
  ) => {
    const reading = await readSurfaceState(page, surface.selector, deliveredToken[version])
    const captured = await captureSurface(page, pair.key, viewport.key, surface, label)
    if (!captured.present || !captured.bytes || !captured.path || !captured.sha256) {
      throw new Error(`The ${surface.name} surface was not capturable for ${label}.`)
    }
    sequence += 1
    phases.push({
      label, role, group, version, state, acquisition, sequence,
      path: captured.path, sha256: captured.sha256, fingerprint: reading.fingerprint, mutationHistory,
    })
    retained.set(label, captured.bytes)
    readings.set(label, reading)
    return reading
  }

  // A gauge qualifies this surface when it can actually paint into the capture: drawn inside it, or
  // lying behind a translucent one (#1065, Jon 2026-09-18). The placement travels with the evidence
  // and the pure oracle re-checks the overlap itself; nothing here decides the exception.
  const gaugeOf = (reading: SurfaceStateReading | undefined): Extract<GaugeReading, { present: true }> | null =>
    reading && reading.gauge.present && reading.gauge.reachesSurface ? reading.gauge : null

  /**
   * Writes the sentinel, then the common value, so this version's normalized capture is a fresh
   * raster reached by two real writes - the same history the other version's normalized capture has.
   * Each write is proved to change what this row displays rather than assumed to; a sentinel that
   * matched a row's own value, or the common value, would silently restore the asymmetry it exists
   * to remove. `applyCommonGaugeValues` presents a frame after each write.
   */
  const normalizeThroughSentinel = async (version: 'v1' | 'v2') => {
    const gauge = gaugeOf(deliveredReading[version])
    if (!gauge || !common || !sentinel) {
      throw new Error(`The ${version} counterfactual cannot run without a usable gauge, common value and sentinel.`)
    }
    for (const [what, held, written] of [
      ['token', gauge.token, sentinel.token],
      ['fill width', gauge.inlineWidth, sentinel.inlineWidth],
    ] as const) {
      if (held === written) {
        throw new Error(`The counterfactual sentinel ${what} "${written}" is the ${version} row's own value.`)
      }
    }
    for (const [what, next, after] of [
      ['token', sentinel.token, common.token],
      ['fill width', sentinel.inlineWidth, common.inlineWidth],
    ] as const) {
      if (next === after) throw new Error(`The counterfactual sentinel ${what} "${next}" is the common value.`)
    }
    await applyCommonGaugeValues(page, sentinel.token, sentinel.inlineWidth)
    await applyCommonGaugeValues(page, common.token, common.inlineWidth)
  }

  /**
   * One normalization cycle on the page as it stands: normalize through the sentinel, capture the
   * normalized control, restore, capture the restored control. The restored capture joins the
   * `restored` control group, never the pristine one: it is the same numeric phase reached a
   * different way, and pooling the two would put both values in one group by construction and
   * forgive exactly the systematic post-restoration re-raster the restoration comparison exists to
   * catch (#1065).
   */
  const runNormalizationCycle = async (version: 'v1' | 'v2', cycle: 1 | 2) => {
    await normalizeThroughSentinel(version)
    const normalized = await take(version, 'normalized', `${version}-normalized-control-${cycle}`, 'control',
      controlGroupLabel(version, 'normalized'), `normalized to the common value through the sentinel, cycle ${cycle}`)
    if (!await restoreGaugeValues(page)) throw new Error(`The ${version} gauge slots did not restore.`)
    await take(version, 'delivered', `${version}-restored-control-${cycle}`, 'control',
      controlGroupLabel(version, 'delivered', 'restored'), `restored after normalization cycle ${cycle}`, 'restored')
    return normalized
  }

  // Controls, both versions, before any candidate.
  for (const version of ['v1', 'v2'] as const) {
    const id = await open(version)
    const first = await take(version, 'delivered', `${version}-delivered-control-a`, 'control',
      controlGroupLabel(version, 'delivered'), 'unmutated; first independent open')
    deliveredReading[version] = first
    const gauge = gaugeOf(first)
    if (gauge) {
      deliveredToken[version] = gauge.token
      const artifact = await rebuildDeliveredArtifact(page, id, version)
      const path = resolve(outputRoot, `${pair.key}-${viewport.key}-${surface.name}-${version}.epe`)
      await writeFile(path, artifact.epeText)
      delivered[version] = { path, route: artifact.route, sourceBytes: artifact.sourceBytes, epeText: artifact.epeText }
      canonical[version] = await canonicalizePercent(page, artifact.sourceBytes, SHOW_ARTIFACT_BUDGET_BYTES)
      variant = gauge.elements.some(element => element.attributes.title !== undefined) ? 'compile-bar' : 'portal'
      if (version === 'v1') {
        common = { token: gauge.token, inlineWidth: gauge.inlineWidth }
        sentinel = {
          token: formatDeliveredBytes(GAUGE_SENTINEL_BYTES),
          inlineWidth: (await canonicalizePercent(page, GAUGE_SENTINEL_BYTES, SHOW_ARTIFACT_BUDGET_BYTES)).serialized,
        }
      }
    } else {
      gaugeDetail = first.gauge.present
        ? first.gauge.placement === 'behind'
          ? 'gauge-behind-but-not-over-surface'
          : 'gauge-not-fully-within-surface'
        : (first.gauge as Extract<GaugeReading, { present: false }>).reason
    }
    // One normalization cycle per open, so the two members of every control group - pristine,
    // normalized and restored alike - come from independent opens rather than from one page walked
    // twice. Two restorations that disagree then disagree across opens, which is the only evidence
    // that could show a restoration residual is nondeterministic rather than systematic (#1065).
    if (gauge && common) {
      normalizedReading[version] = await runNormalizationCycle(version, 1)
    }
    await open(version)
    await take(version, 'delivered', `${version}-delivered-control-b`, 'control',
      controlGroupLabel(version, 'delivered'), 'unmutated; second independent open')
    if (gauge && common) await runNormalizationCycle(version, 2)
  }
  const gaugeUsable = Boolean(gaugeOf(deliveredReading.v1) && gaugeOf(deliveredReading.v2)
    && common && sentinel && delivered.v1 && delivered.v2 && normalizedReading.v1 && normalizedReading.v2)
  const gaugePlacement = gaugeOf(deliveredReading.v1)?.placement ?? 'inside'
  if (gaugeUsable) {
    gaugeDetail = gaugePlacement === 'behind'
      ? 'present behind the captured surface, overlapping it'
      : 'present and wholly inside the captured surface'
  }

  const comparisons: PlannedComparison[] = []
  const measurements: ({ key: string } & PixelMeasurement)[] = []
  const chains = new Map<string, Map<string, DomStateEvidence['points'][number]>>()

  /**
   * Compares the named pairs and collects the chain evidence for their positions immediately, while
   * the page is still in the state those captures were taken in. The live state is re-read and its
   * fingerprint must match the captures', so a chain can never be recorded from another state; when
   * it does not match, no chain is recorded and every pixel of that comparison stays residual.
   */
  const compareAndChain = async (
    version: 'v1' | 'v2',
    pairs: readonly { key: string; left: string; right: string }[],
  ) => {
    const positions = new Map<string, { x: number; y: number }>()
    for (const { key, left, right } of pairs) {
      const difference = await differenceBetweenCaptures(page, retained.get(left)!, retained.get(right)!)
      measurements.push({ key, ...difference })
      // A pair that could not be compared contributes no comparison and no count. It is recorded as
      // not measured, and every consumer below refuses on that rather than reading a zero.
      if (!difference.comparable) continue
      comparisons.push({
        key, left, right, changedPixels: difference.pixels, reportedChangedPixels: difference.changedPixels,
      })
      for (const pixel of difference.pixels) positions.set(`${pixel.x},${pixel.y}`, { x: pixel.x, y: pixel.y })
    }
    if (positions.size === 0) return
    const fingerprint = phases.find(phase => phase.label === pairs[0].left)!.fingerprint
    const live = await readSurfaceState(page, surface.selector, deliveredToken[version])
    if (live.fingerprint !== fingerprint) return
    const collected = await collectPointChains(page, surface.selector, fingerprint, [...positions.values()])
    const merged = chains.get(fingerprint) ?? new Map<string, DomStateEvidence['points'][number]>()
    for (const point of collected.points) merged.set(`${point.x},${point.y}`, point)
    chains.set(fingerprint, merged)
  }

  // Candidates, fresh, after every control. Each comparison is read and its chain evidence collected
  // in the very state its captures were taken in, before the page moves on.
  for (const version of ['v1', 'v2'] as const) {
    await open(version)
    await take(version, 'delivered', `${version}-delivered-candidate`, 'candidate', undefined,
      'unmutated; captured after all control collection')
    if (!gaugeUsable || !common) {
      // A gauge-bearing surface's delivered pair is the true exported values and belongs to the
      // gauge exception; only an ordinary surface's delivered pair is offered to the classifier.
      if (version === 'v2') {
        await compareAndChain(version, [{
          key: 'delivered v1 vs v2', left: 'v1-delivered-candidate', right: 'v2-delivered-candidate',
        }])
      }
      continue
    }
    await normalizeThroughSentinel(version)
    await take(version, 'normalized', `${version}-normalized-candidate`, 'candidate', undefined,
      'normalized to the common value through the sentinel, cycle 3')
    await take(version, 'normalized', `${version}-normalized-candidate-repeat`, 'candidate', undefined,
      'normalized to the common value through the sentinel, cycle 3, repeated capture')
    await compareAndChain(version, [
      { key: `${version} normalized repeat`, left: `${version}-normalized-candidate`, right: `${version}-normalized-candidate-repeat` },
      ...(version === 'v2'
        ? [{ key: 'normalized v1 vs v2', left: 'v1-normalized-candidate', right: 'v2-normalized-candidate' }]
        : []),
    ])
    if (!await restoreGaugeValues(page)) throw new Error(`The ${version} gauge slots did not restore.`)
    await take(version, 'delivered', `${version}-restored-candidate`, 'candidate', undefined,
      'restored after normalization cycle 3', 'restored')
    await compareAndChain(version, [{
      key: `${version} delivered vs restored`, left: `${version}-delivered-candidate`, right: `${version}-restored-candidate`,
    }])
  }

  // The gauge's own raw difference is recorded for the report and never offered to the classifier.
  // The independent delivered control pair is captured alongside it: the pure oracle reproduces the
  // candidate's raw difference against exactly these controls from separate opens, so a transient
  // capture pixel cannot be charged to the gauge (#1065).
  let rawCandidateDifference: CapturedPixelDifference | null = null
  let rawControlDifference: CapturedPixelDifference | null = null
  if (gaugeUsable) {
    rawCandidateDifference = await differenceBetweenCaptures(
      page, retained.get('v1-delivered-candidate')!, retained.get('v2-delivered-candidate')!)
    measurements.push({ key: 'delivered v1 vs v2', ...rawCandidateDifference })
    rawControlDifference = await differenceBetweenCaptures(
      page, retained.get('v1-delivered-control-a')!, retained.get('v2-delivered-control-a')!)
    measurements.push({ key: 'delivered control v1 vs v2', ...rawControlDifference })
  }

  /**
   * The second restoration path Jon approved on 2026-09-18: a restoration residual qualifies when it
   * is byte-exact, or when the controls independently reproduce it exactly (#1065).
   *
   * Both comparisons this needs are between control captures the plan already collected, so nothing
   * new is opened, captured or retried: the pristine control of the first open against that open's
   * restored control, and the two restored controls from independent opens against each other. Both
   * are recorded as measurements whatever they show, and the pure oracle decides.
   */
  const captureRef = (label: string): RestorationCapture => {
    const phase = phases.find(entry => entry.label === label)!
    return { label: phase.label, path: phase.path, sha256: phase.sha256, sequence: phase.sequence }
  }
  const restorationDemonstrations: DemonstratedRestorationSideEffect[] = []
  if (gaugeUsable) {
    for (const version of ['v1', 'v2'] as const) {
      const candidate = comparisons.find(entry => entry.key === `${version} delivered vs restored`)
      if (!candidate || candidate.changedPixels.length === 0) continue
      const control = await differenceBetweenCaptures(
        page, retained.get(`${version}-delivered-control-a`)!, retained.get(`${version}-restored-control-1`)!)
      measurements.push({ key: `${version} control delivered vs restored`, ...control })
      const agreement = await differenceBetweenCaptures(
        page, retained.get(`${version}-restored-control-1`)!, retained.get(`${version}-restored-control-2`)!)
      measurements.push({ key: `${version} restored controls agree`, ...agreement })
      if (!control.comparable) continue
      restorationDemonstrations.push({
        measurement: `restored-${version}`,
        demonstration: demonstrateRestorationSideEffect({
          comparison: `${version} delivered vs restored`,
          version,
          candidate: {
            left: captureRef(`${version}-delivered-candidate`),
            right: captureRef(`${version}-restored-candidate`),
            changedPixels: candidate.changedPixels,
            reportedChangedPixels: candidate.reportedChangedPixels,
          },
          control: {
            left: captureRef(`${version}-delivered-control-a`),
            right: captureRef(`${version}-restored-control-1`),
            changedPixels: control.pixels,
            reportedChangedPixels: control.changedPixels,
          },
          restoredControls: [
            captureRef(`${version}-restored-control-1`), captureRef(`${version}-restored-control-2`),
          ],
          restoredControlAgreement: [{
            left: `${version}-restored-control-1`,
            right: `${version}-restored-control-2`,
            measurement: agreement.comparable
              ? {
                comparable: true,
                changedPixels: agreement.changedPixels,
                maximumChannelDelta: agreement.maximumChannelDelta,
              }
              : { comparable: false, detail: agreement.detail },
          }],
        }),
      })
    }
  }

  const implicated = new Set(comparisons.flatMap(comparison =>
    comparison.changedPixels.map(pixel => `${pixel.x},${pixel.y}`)))
  const wantedPositions = [...implicated].map(key => {
    const [x, y] = key.split(',').map(Number)
    return { x, y }
  })
  const samples: Record<string, readonly PixelSample[]> = {}
  for (const phase of phases) samples[phase.label] = await sampleCapture(page, retained.get(phase.label)!, wantedPositions)

  const classifications = classifySurfaceNoisePlan({
    surface: surface.name,
    viewport: { width: viewport.width, height: viewport.height },
    showId: pair.captureId,
    authoredState: `fixedTimeMs=${fixture.fixedTimeMs};prepare=${surface.prepare ?? 'none'}`,
    captureSettings: `element-clip;animations=disabled;selector=${surface.selector ?? 'viewport'}`,
    fingerprintPolicy: 'surface DOM, geometry and every collected computed and pseudo style, with the'
      + ' fixed gauge value fields replaced in place',
    captures: phases,
    comparisons,
    samples,
    domStates: [...chains].map(([fingerprint, points]) => ({ fingerprint, points: [...points.values()] })),
  })

  let exception: SourceGaugeExceptionWithNoiseAssessment | null = null
  if (gaugeUsable && common) {
    // A key the run never measured is reported as not measured, never as zero: the gauge exception
    // refuses on it rather than reading an absent comparison as proof of equality (#1065).
    const measurementFor = (key: string): PixelMeasurement => {
      const found = measurements.find(entry => entry.key === key)
      if (!found) return { comparable: false, detail: `The run recorded no "${key}" measurement.` }
      const { key: _key, ...measurement } = found
      return measurement
    }
    const evidenceFor = (version: 'v1' | 'v2'): GaugeVersionEvidence => ({
      deliveredEpeText: delivered[version]!.epeText,
      deliveredArtifact: { path: delivered[version]!.path, route: delivered[version]!.route },
      raw: deliveredReading[version]!.gauge.present ? deliveredReading[version]!.gauge.elements : [],
      normalized: normalizedReading[version]!.gauge.present ? normalizedReading[version]!.gauge.elements : [],
      authoredInlineWidth: (deliveredReading[version]!.gauge as Extract<GaugeReading, { present: true }>).inlineWidth,
      canonicalInlineWidth: canonical[version]!,
      budgetToken: (deliveredReading[version]!.gauge as Extract<GaugeReading, { present: true }>).budgetToken,
    })
    const named = (key: string, measurement: string) => {
      const planned = classifications.find(entry => entry.key === key)
      return planned?.classification ? [{ measurement, classification: planned.classification }] : []
    }
    const v1Gauge = gaugeOf(deliveredReading.v1)!
    exception = qualifySourceSizeExceptionWithQualifiedCaptureNoise({
      surface: surface.name,
      variant: variant ?? 'portal',
      // The behind case names both boxes so the oracle can re-check for itself that the gauge lies
      // over the capture. It is evidence the harness measured, not a claim the harness makes.
      placement: v1Gauge.placement === 'behind'
        ? { kind: 'behind', surfaceBox: v1Gauge.surfaceBox, trackBox: v1Gauge.trackBox }
        : { kind: 'inside' },
      budget: {
        bytes: SHOW_ARTIFACT_BUDGET_BYTES,
        provenance: 'SHOW_ARTIFACT_BUDGET_BYTES measured device budget, asserted in showCompiler.test.ts',
      },
      v1: evidenceFor('v1'),
      v2: evidenceFor('v2'),
      rawCapturePaths: phases
        .filter(phase => phase.label.endsWith('delivered-candidate'))
        .map(phase => phase.path),
      rawDifference: measurementFor('delivered v1 vs v2'),
      rawCaptures: {
        left: captureRef('v1-delivered-candidate'),
        right: captureRef('v2-delivered-candidate'),
      },
      rawReproduction: {
        candidate: reproductionPair(
          rawCandidateDifference!,
          captureRef('v1-delivered-candidate'), captureRef('v2-delivered-candidate')),
        control: reproductionPair(
          rawControlDifference!,
          captureRef('v1-delivered-control-a'), captureRef('v2-delivered-control-a')),
      },
      counterfactual: {
        commonToken: common.token,
        commonInlineWidth: common.inlineWidth,
        counterfactual: measurementFor('normalized v1 vs v2'),
        repeat: { v1: measurementFor('v1 normalized repeat'), v2: measurementFor('v2 normalized repeat') },
        restored: {
          v1: measurementFor('v1 delivered vs restored'),
          v2: measurementFor('v2 delivered vs restored'),
        },
        capturePaths: phases.filter(phase => phase.role === 'candidate').map(phase => phase.path),
      },
    }, [
      ...named('normalized v1 vs v2', 'counterfactual'),
      ...named('v1 normalized repeat', 'repeat-v1'),
      ...named('v2 normalized repeat', 'repeat-v2'),
      ...named('v1 delivered vs restored', 'restored-v1'),
      ...named('v2 delivered vs restored', 'restored-v2'),
    ], restorationDemonstrations)
  }

  return {
    ran: true,
    detail: gaugeUsable
      ? `The gauge is ${gaugePlacement === 'behind' ? 'behind' : 'in'} this surface, so its exported values`
        + ' are proved by the gauge exception and only the counterfactual, repeat and restoration'
        + ' residuals were offered to the classifier, with each restoration residual additionally'
        + ' offered to the demonstrated-side-effect path against its own controls.'
      : 'No usable gauge in this surface, so the fresh delivered pair itself must be exact or fully classified.',
    gauge: { usable: gaugeUsable, detail: gaugeDetail, variant, ...(gaugeUsable ? { placement: gaugePlacement } : {}) },
    captures: phases,
    measurements,
    classifications,
    restorationDemonstrations,
    delivered: delivered.v1 && delivered.v2
      ? {
        v1: { path: delivered.v1.path, route: delivered.v1.route, sourceBytes: delivered.v1.sourceBytes },
        v2: { path: delivered.v2.path, route: delivered.v2.route, sourceBytes: delivered.v2.sourceBytes },
      }
      : null,
    exception,
  }
}

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

  for (const id of [v1Id, v2Id, `oracle-${key}-capture`]) await page.request.delete(`/api/shows/${id}`)
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

  // The paired v1/v2 rows stay seeded for coordinator inspection, but they are
  // not the rows the visual oracle renders. The Show stage preview seeds its
  // random Pattern replay from the Show id, so two rows with distinct ids are
  // not equivalent rendering inputs even when their records are equivalent.
  // Every visual comparison therefore renders one dedicated capture row,
  // recreated as the persisted v1 representation and then converted in place.
  const captureId = `oracle-${key}-capture`
  const captureSource = { ...structuredClone(persistedV1), id: captureId, name, updatedAt: 1 }
  const captureConversion = await convertInBrowser(page, captureSource, `${key}-capture-row`)
  if (captureConversion.status !== 'converted') {
    throw new Error(`${key} capture row conversion refused: ${JSON.stringify(captureConversion.issues)}`)
  }
  if (captureConversion.record.id !== captureId) {
    throw new Error(`${key} capture row conversion did not preserve the capture Show identity.`)
  }
  if (!isDeepStrictEqual(
    normalizeShowEquivalenceRecord(captureConversion.record),
    normalizeShowEquivalenceRecord(persistedConversion.record),
  )) {
    throw new Error(`${key} capture row does not carry the same converted content as the seeded v2 row.`)
  }

  return {
    key,
    name,
    v1Id,
    v2Id,
    v1: persistedV1,
    v2: persistedV2,
    conversionReport: persistedConversion.report,
    captureId,
    captureSource,
    captureConverted: captureConversion.record,
  }
}

/**
 * Writes the pair's one capture row for one storage version and returns the
 * rendered Show identity. Both versions use that single id, so the renderer's
 * identity-seeded replay is constant across the comparison. The row is
 * recreated from the persisted v1 record every time, so a prepared interaction
 * that mutated the previous capture cannot leak into the next one, and no
 * capture can inherit the other version's stored state. Every request is
 * asserted, and the stored row is read back before the capture: an unreseeded,
 * unconverted or altered row fails the comparison instead of being captured
 * silently.
 */
async function stageCaptureRow(page: Page, pair: SeededPair, version: 'v1' | 'v2'): Promise<string> {
  await leaveEditorBeforeReplacingRow(page)
  const removed = await page.request.delete(`/api/shows/${pair.captureId}`)
  expect(removed.ok(), await removed.text()).toBe(true)
  const created = await page.request.post('/api/shows', { data: pair.captureSource })
  expect(created.ok(), await created.text()).toBe(true)
  if (version === 'v2') {
    const migrated = await page.request.put(`/api/shows/${pair.captureId}?show-version=2`, { data: pair.captureConverted })
    expect(migrated.ok(), await migrated.text()).toBe(true)
  }
  const stored = await readStoredShow(page, pair.captureId, version)
  expect(stored, `The ${version} capture row ${pair.captureId} is absent from the ${version} storage listing.`).toBeDefined()
  expect(
    normalizeShowEquivalenceRecord(stored),
    `The ${version} capture row ${pair.captureId} is not the seeded record; stored content was altered before capture.`,
  ).toEqual(normalizeShowEquivalenceRecord(version === 'v1' ? pair.captureSource : pair.captureConverted))
  return pair.captureId
}

/** Removes a synthetic row through the ordinary editor-leaving lifecycle. */
async function releaseCaptureRow(page: Page, id: string): Promise<void> {
  await leaveEditorBeforeReplacingRow(page)
  const released = await page.request.delete(`/api/shows/${id}`)
  expect(released.ok(), await released.text()).toBe(true)
}

/**
 * Leaves an open editor through ordinary in-app navigation before its row is
 * replaced, so no mounted editor can save over the reseeded row.
 *
 * The agent browser session is closed by a React effect cleanup, which only
 * runs on a client-side unmount: a hard `page.goto` destroys the document
 * without it, so the session's `leave` is never posted and the account's
 * rendezvous registrations accumulate. This awaits the ordinary `leave`
 * response, which is also the evidence that the editor really unmounted.
 */
async function leaveEditorBeforeReplacingRow(page: Page): Promise<void> {
  if (!/\/studio\/shows\/[^/?#]+/.test(page.url())) return
  const left = page.waitForResponse(response => {
    const request = response.request()
    if (request.method() !== 'POST' || !new URL(response.url()).pathname.endsWith('/api/agent/channel')) return false
    try {
      return (JSON.parse(request.postData() ?? '{}') as { type?: string }).type === 'leave'
    } catch {
      return false
    }
  }, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Open Gallery', exact: true }).click()
  await page.waitForURL(url => !/\/studio\/shows\/[^/?#]+/.test(url.pathname), { timeout: 15_000 })
  const response = await left
  expect(response.ok(), `The editor session did not leave cleanly: ${response.status()} ${await response.text()}`).toBe(true)
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
  let size: { x: number; y: number; width: number; height: number } | null
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

/**
 * The strict pair's difference positions for the capture-noise coverage gate (#1064): the fresh
 * pair only clears a strict verdict whose every differing position it re-captured. A pair that
 * could not be compared yields no positions, and the pure oracle refuses to clear on that rather
 * than reading an absent comparison as coverage.
 */
async function strictDifferencePositions(
  page: Page,
  left: CapturedSurface,
  right: CapturedSurface,
): Promise<readonly { x: number; y: number }[] | undefined> {
  if (!left.bytes || !right.bytes) return undefined
  const difference = await differenceBetweenCaptures(page, left.bytes, right.bytes)
  if (!difference.comparable) return undefined
  return difference.pixels.map(pixel => ({ x: pixel.x, y: pixel.y }))
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
