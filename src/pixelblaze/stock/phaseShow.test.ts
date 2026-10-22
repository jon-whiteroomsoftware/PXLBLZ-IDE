import { afterAll, describe, expect, it } from 'vitest'
import { LIBRARIES } from '@/pixelblaze/libs'
import { GALLERY_SHOWS } from '@/engine/galleryShows'
import { compileShow } from '@/engine/showCompiler'
import { prepareShowV2ForCompile } from '@/engine/showCompositionLoweringV2'
import { validateShowRecordV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { stockShowCatalogueById } from './showCatalogueV2'
import { stockShowV2ById } from './showsV2'
import { nativeStockSourceLookupV2 } from './showsV2Compile'
import { runTelemetry } from '@/agent-harness/telemetry/harness'
import {
  assertCoverage, assertQuarter, circularError, cobaltCount, cobaltShare, compilePhase, HOLDS,
  observe, phaseArtifact, plan, proof, saveProof, SEEDS, STEPS,
} from './phaseShowTestHelpers'

const LINEAR = { curve: 'linear' }
const SINE = { curve: 'sine', direction: 'in-out' }
const CUBIC_OUT = { curve: 'cubic', direction: 'out' }
const keyValues = (record: ShowRecordV2, id: string) => {
  const track = record.composition.propertyTracks.find(track => track.id === id)
  expect(track, id).toBeDefined()
  return track!.keyframes.map(({ timeMs, value, easing }) => ({ timeMs, value, easing }))
}
function phase() {
  const record = stockShowV2ById('stock-show-phase')
  expect(record).toBeDefined()
  return record!
}
function compile(record: ShowRecordV2) {
  const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Phase preparation refused')
  expect(prepared.provenance.derivedSceneIds).toHaveLength(1)
  return compileShow(prepared.recipe, LIBRARIES)
}

describe('Phase (#1205)', () => {
  afterAll(saveProof)

  it('detects a missing quarter move in an in-memory fixture', async () => {
    const { record } = await phaseArtifact()
    const faulty = structuredClone(record)
    faulty.composition.propertyTracks.find(track => track.id === 'phaser-clock')!.keyframes.splice(1, 3)
    const observation = observe(compilePhase(faulty), 10800, 1000 / 60)
    const error = Math.abs(circularError(observation.difference, 0.25))
    expect(error).toBeCloseTo(0.25, 9)
    expect(() => assertQuarter(observation, 10800, 0.002)).toThrow()
    proof.faultSensitivity = { removed: 'first full three-key drift', atMs: 10800, error, detected: true }
  })

  // Each cadence owns a separate ledger, and every observation starts at t0.
  // The 60 Hz prefix through 50.1 s measured 57 s. Scaling by total replayed
  // time predicts 156 s for all holds; 240 s allows loaded-host margin.
  it.each(STEPS)('holds the planned quarters and raw-Pattern coverage at %s ms in Fast and Precise', async stepMs => {
    const { artifact, record } = await phaseArtifact()
    const ledger: Array<ReturnType<typeof plan> & {
      atMs: number; fastError: number; preciseError: number; phaseResidual: number;
      fastCoverage: number; preciseCoverage: number; coverageResidual: number;
    }> = []
    for (const atMs of HOLDS) {
      const fast = observe(artifact, atMs, stepMs)
      const precise = observe(artifact, atMs, stepMs, 'fidelity')
      const planned = plan(atMs)
      const budget = planned.drifts === 0 && planned.snaps === 0 ? planned.budget : stepMs <= 1000 / 30 ? 0.002 : planned.budget
      const fastError = assertQuarter(fast, atMs, budget)
      const preciseError = assertQuarter(precise, atMs, budget)
      const phaseResidual = Math.abs(circularError(precise.difference, fast.difference))
      const coveragePixelDifference = Math.abs(cobaltCount(precise.pixels) - cobaltCount(fast.pixels))
      const coverageResidual = coveragePixelDifference / fast.pixels.length
      expect(phaseResidual, JSON.stringify({ stepMs, atMs, phaseResidual })).toBeLessThanOrEqual(0.002)
      expect(coveragePixelDifference, JSON.stringify({ stepMs, atMs, coverageResidual })).toBeLessThanOrEqual(44)
      const fastCoverage = assertCoverage(record, fast, atMs, stepMs <= 1000 / 30)
      const preciseCoverage = assertCoverage(record, precise, atMs, stepMs <= 1000 / 30)
      ledger.push({ atMs, ...plan(atMs), budget, fastError, preciseError, phaseResidual, fastCoverage, preciseCoverage, coverageResidual })
    }
    const worst = (key: keyof typeof ledger[number]) => ledger.reduce((a, b) => Number(a[key]) >= Number(b[key]) ? a : b)
    proof[`cadence:${stepMs}`] = {
      observations: ledger,
      maxima: Object.fromEntries(['fastError', 'preciseError', 'phaseResidual', 'fastCoverage', 'preciseCoverage', 'coverageResidual']
        .map(key => [key, worst(key as keyof typeof ledger[number])])),
    }
  }, 240_000)

  it.each(SEEDS)('holds every quarter and coverage under jitter seed %s, resetting the error budget at wrap', async seed => {
    const { artifact, record } = await phaseArtifact()
    const ledger = []
    for (const atMs of HOLDS) {
      const observation = observe(artifact, atMs, 125, 'fast', 1936, seed)
      const error = assertQuarter(observation, atMs, plan(atMs).budget)
      const coverageResidual = assertCoverage(record, observation, atMs, false)
      ledger.push({ seed, atMs, ...plan(atMs), error, coverageResidual })
    }
    const wrapped = observe(artifact, 82800, 125, 'fast', 1936, seed)
    const wrapError = assertQuarter(wrapped, 82800, 0.005)
    proof[`jitter:${seed}`] = {
      observations: ledger, wrapError,
      maxError: ledger.reduce((a, b) => a.error >= b.error ? a : b),
      maxCoverage: ledger.reduce((a, b) => a.coverageResidual >= b.coverageResidual ? a : b),
    }
  }, 120_000)

  it.each(STEPS)('repeats both the anchor-only and visible-phaser seam pairs at %s ms', async stepMs => {
    const { artifact } = await phaseArtifact()
    const ledger = []
    for (const atMs of [2400, 10800]) {
      const first = observe(artifact, atMs, stepMs)
      const second = observe(artifact, atMs + 72000, stepMs)
      const phaseResidual = Math.abs(circularError(first.difference, second.difference))
      const frameResidual = Math.max(...first.frame.map((value, index) => Math.abs(value - second.frame[index])))
      expect(phaseResidual).toBeLessThanOrEqual(1e-9)
      expect(frameResidual).toBeLessThanOrEqual(1e-9)
      ledger.push({ atMs, secondAtMs: atMs + 72000, phaseResidual, frameResidual })
    }
    proof[`seam:${stepMs}`] = ledger
  }, 120_000)

  it('keeps both independent clocks running through the phaser entrance and exit', async () => {
    const { artifact } = await phaseArtifact()
    const ledger = []
    for (const [before, after] of [[4700, 4900], [69500, 69700]]) {
      const first = observe(artifact, before, 1000 / 60)
      const second = observe(artifact, after, 1000 / 60)
      for (const clock of ['anchor', 'phaser'] as const) {
        const residual = Math.abs(circularError(second[clock] - first[clock], (after - before) / 2400))
        expect(residual).toBeLessThanOrEqual(1e-9)
        ledger.push({ clock, before, after, residual })
      }
    }
    proof.entryExitClocks = ledger
  })

  it.each([256, 1936])('preserves amber/black, cobalt, sparse Count and white signatures at %s pixels', async count => {
    const { artifact, record } = await phaseArtifact()
    const ledger = []
    for (const atMs of [6000, 10800, 15600, 34800, 65000]) {
      const observation = observe(artifact, atMs, 1000 / 60, 'fast', count)
      const residual = assertCoverage(record, observation, atMs, true)
      expect(observation.frame.every(Number.isFinite)).toBe(true)
      const lit = observation.pixels.filter(pixel => Math.max(...pixel) >= 0.15).length / count
      const amber = observation.pixels.filter(([r, g, b]) => r >= 0.15 && r > g && g > b).length / count
      const black = observation.pixels.filter(pixel => Math.max(...pixel) < 0.15).length / count
      const white = observation.pixels.filter(([r, g, b]) => Math.min(r, g, b) >= 0.15 && Math.max(r, g, b) - Math.min(r, g, b) < 0.01).length / count
      const cobalt = cobaltShare(observation.pixels)
      expect(lit).toBeGreaterThan(0)
      if (atMs === 6000) { expect(amber).toBeGreaterThan(0); expect(black).toBeGreaterThan(0) }
      if ([10800, 15600, 34800].includes(atMs)) expect(cobalt).toBeGreaterThan(0)
      if (atMs === 65000) expect(white).toBeGreaterThan(0)
      ledger.push({ atMs, lit, amber, black, white, cobalt, coverageResidual: residual })
    }
    expect(ledger[3].lit).toBeLessThan(ledger[2].lit)
    expect(ledger[3].black).toBeGreaterThan(ledger[2].black)
    proof[`signatures:${count}`] = ledger
  }, 120_000)

  it.each([256, 1936].flatMap(pixelCount => [30, 8, 5].map(fps => ({ pixelCount, fps }))))(
    'passes the full production flash gate at $pixelCount pixels / $fps fps', async ({ pixelCount, fps }) => {
      const { artifact } = await phaseArtifact()
      const report = runTelemetry(artifact.code, artifact.metadata, { durationMs: 72000, pixelCount, fps })
      const maxPerSecondViolatingFraction = Math.max(...report.flicker.perSecondViolatingFraction)
      proof[`flicker:${pixelCount}:${fps}`] = { ...report.flicker, maxPerSecondViolatingFraction }
      expect(report.flicker.pass, JSON.stringify(report.flicker)).toBe(true)
      expect(maxPerSecondViolatingFraction).toBeLessThan(0.25)
    }, 120_000,
  )
  it('ships the portable two-player score with independent instances and no Transitions', () => {
    const record = phase()
    expect(validateShowRecordV2(record)).toEqual([])
    expect(record).toMatchObject({
      id: 'stock-show-phase', name: 'Phase', stageMapId: 'plane',
      outputContract: {
        version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 1936,
        compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
      },
      composition: { executionModel: 'deterministic-loop', showEndMs: 72_000 },
    })
    expect(record.zones).toHaveLength(1)
    expect(record.zones[0]).toMatchObject({ id: 'zone-1', name: 'Stage', nominalPixelCount: 1936 })
    expect(record.zoneLayouts).toEqual([{
      id: 'layout-main', name: 'Main', zones: [], logical: { kind: 'single', zoneIds: ['zone-1'] },
    }])
    const score = record.composition
    expect(score.layoutOccurrences).toEqual([{
      id: 'layout-occurrence:1', layoutId: 'layout-main', startMs: 0, durationMs: 72_000, parameters: {},
    }])
    expect(score.layers).toEqual([
      { id: 'layer:zone-1:main', zoneId: 'zone-1', name: 'Anchor', rank: 0 },
      { id: 'layer:zone-1:overlay:1', zoneId: 'zone-1', name: 'Phaser', rank: 1 },
    ])
    const controls = {
      sliderLoopInterval: 0.24, sliderDirection: 1, sliderSpacing: 0.3333,
      sliderWidth: 0.5, sliderFeather: 0.12, sliderLean: 0.5, sliderAngle: 0.25,
    }
    expect(score.patternInstances).toEqual(['anchor', 'phaser'].map(id => ({
      id, pattern: { kind: 'stock', id: 'LumaStripes' }, patternName: 'LumaStripes',
      time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: controls,
    })))
    expect(score.clips.map(({ id, instanceId, zoneId, layerId, startMs, durationMs, entryPolicy }) =>
      ({ id, instanceId, zoneId, layerId, startMs, durationMs, entryPolicy }))).toEqual([
      { id: 'anchor-voice', instanceId: 'anchor', zoneId: 'zone-1', layerId: 'layer:zone-1:main', startMs: 0, durationMs: 72_000, entryPolicy: 'continue' },
      { id: 'phaser-voice', instanceId: 'phaser', zoneId: 'zone-1', layerId: 'layer:zone-1:overlay:1', startMs: 0, durationMs: 72_000, entryPolicy: 'continue' },
    ])
    expect(score.clips.map(clip => clip.appearance.keys.map(key => key.value.effects))).toEqual([
      [[{ id: 'tint', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 0.09, highlightG: 0.25, highlightB: 1 }]],
      [[{ id: 'tint', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.54, highlightB: 0 },
        { id: 'key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.1 }]],
    ])
    expect(score.transitions).toEqual([])
    expect(score.groupDefinitions).toEqual([])
    expect(score.groupOccurrences).toEqual([])
    expect(score.markers.map(({ name, timeMs, role }) => ({ name, timeMs, role }))).toEqual([
      { name: 'Anchor', timeMs: 0, role: 'chapter' },
      { name: 'Phase', timeMs: 4800, role: 'chapter' },
      { name: 'Count', timeMs: 24_000, role: 'chapter' },
      { name: 'Clap', timeMs: 43_200, role: 'chapter' },
      { name: 'Unison', timeMs: 64_800, role: 'chapter' },
    ])
    expect(GALLERY_SHOWS.some(show => show.id === record.id)).toBe(false)
    expect(stockShowCatalogueById(record.id)).toMatchObject({
      track: 'portable', collection: 'portable-shows', level: null, order: 4,
      patternSlots: [{ instanceIds: ['anchor'] }, { instanceIds: ['phaser'] }],
      note: { title: 'Phase', label: 'Portable Shows', defaultOpen: false },
    })
  })

  it('scores every drift, 600 ms snap, width change, entrance, exit and white unison over full-Show tracks', () => {
    const record = phase()
    const tracks = record.composition.propertyTracks
    expect(tracks.map(({ id, target, activeStartMs, activeDurationMs }) => ({ id, target, activeStartMs, activeDurationMs }))).toEqual([
      { id: 'phaser-clock', target: { kind: 'instance-time-scale', instanceId: 'phaser' }, activeStartMs: 0, activeDurationMs: 72_000 },
      { id: 'width-anchor', target: { kind: 'instance-control', instanceId: 'anchor', exportName: 'sliderWidth' }, activeStartMs: 0, activeDurationMs: 72_000 },
      { id: 'width-phaser', target: { kind: 'instance-control', instanceId: 'phaser', exportName: 'sliderWidth' }, activeStartMs: 0, activeDurationMs: 72_000 },
      { id: 'phaser-entry', target: { kind: 'clip-view', clipId: 'phaser-voice', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 72_000 },
      { id: 'phaser-white', target: { kind: 'clip-effect', clipId: 'phaser-voice', effectId: 'tint', effectKind: 'color-map', parameterId: 'amount' }, activeStartMs: 0, activeDurationMs: 72_000 },
    ])
    expect(tracks.reduce((count, track) => count + track.keyframes.length, 0)).toBe(67)
    const clock = keyValues(record, 'phaser-clock')
    expect(clock).toHaveLength(49)
    expect(clock[0]).toEqual({ timeMs: 0, value: 1, easing: LINEAR })
    // Authored end times in milliseconds: every drift spans 2400 ms and every snap spans 600 ms.
    const driftEnds = [9600, 14_400, 19_200, 24_000, 28_800, 33_600, 38_400, 43_200]
    driftEnds.forEach((end, index) => expect(clock.slice(1 + index * 3, 4 + index * 3)).toEqual([
      { timeMs: end - 2400, value: 1, easing: SINE },
      { timeMs: end - 1200, value: 1.5, easing: SINE },
      { timeMs: end, value: 1, easing: LINEAR },
    ]))
    const snapEnds = [48_000, 52_800, 57_600, 60_000, 61_200, 62_400, 63_600, 64_800]
    snapEnds.forEach((end, index) => expect(clock.slice(25 + index * 3, 28 + index * 3)).toEqual([
      { timeMs: end - 600, value: 1, easing: SINE },
      { timeMs: end - 300, value: 3, easing: SINE },
      { timeMs: end, value: 1, easing: LINEAR },
    ]))
    const width = [
      { timeMs: 24_000, value: 0.5, easing: SINE },
      { timeMs: 26_400, value: 0.25, easing: LINEAR },
      { timeMs: 43_200, value: 0.25, easing: SINE },
      { timeMs: 45_600, value: 0.5, easing: LINEAR },
    ]
    expect(keyValues(record, 'width-anchor')).toEqual(width)
    expect(keyValues(record, 'width-phaser')).toEqual(width)
    expect(keyValues(record, 'phaser-entry')).toEqual([
      { timeMs: 0, value: 0, easing: LINEAR },
      { timeMs: 4750, value: 0, easing: LINEAR },
      { timeMs: 4800, value: 1, easing: LINEAR },
      { timeMs: 69_550, value: 1, easing: LINEAR },
      { timeMs: 69_600, value: 0, easing: LINEAR },
    ])
    expect(keyValues(record, 'phaser-white')).toEqual([
      { timeMs: 0, value: 1, easing: LINEAR },
      { timeMs: 64_750, value: 1, easing: LINEAR },
      { timeMs: 64_800, value: 0, easing: LINEAR },
      { timeMs: 65_400, value: 0, easing: CUBIC_OUT },
      { timeMs: 66_600, value: 1, easing: LINEAR },
    ])
  })

  it('reopens the production export unchanged and compiles the imported score', async () => {
    const record = phase()
    const input = structuredClone(record)
    const { bundle } = buildShowFileBundle(record, { patterns: [], maps: [], libraries: [] }, {
      appVersion: '1205-phase', exportedAt: '2026-10-22T00:00:00.000Z',
    })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle), { acceptV2: true })
    expect(reopened.version).toBe(2)
    if (reopened.version !== 2) throw new Error('Expected v2 Show export')
    expect(validateShowRecordV2(reopened.show)).toEqual([])
    expect(reopened.show.composition).toEqual(record.composition)
    expect(reopened.show.outputContract).toEqual(record.outputContract)
    expect(reopened.show.stageMapId).toBe(record.stageMapId)
    expect(reopened.patterns).toEqual([])
    expect(reopened.maps).toEqual([])
    expect(reopened.libraries).toEqual([])
    const originalSource = nativeStockSourceLookupV2(record)
    const reopenedSource = nativeStockSourceLookupV2(reopened.show)
    expect(reopenedSource).toEqual(originalSource)
    const original = compile(record)
    const imported = compile(reopened.show)
    expect(imported.summary.resources.blockers).toEqual([])
    expect(imported.code).toBe(original.code)
    expect(imported.fxCode).toBe(original.fxCode)
    expect(imported.metadata).toEqual(original.metadata)
    expect(record).toEqual(input)
  })

  it('compiles one time section with two member evaluations per pixel inside production budgets', () => {
    const artifact = compile(phase())
    expect(artifact.code.length).toBeGreaterThan(0)
    expect(artifact.summary.cost.cpu.patternEvaluations).toMatchObject({ formula: '2N', basePerPixel: 2 })
    const resources = artifact.summary.resources
    expect(resources.blockers).toEqual([])
    expect(resources.artifactBytes).toBeLessThan(68_384)
    expect(resources.persistentGlobals).toBeLessThan(256)
    expect(resources.totalWords).toBeLessThanOrEqual(10_240)
  })
})
