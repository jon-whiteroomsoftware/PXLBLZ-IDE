import {
  SHOW_VISUAL_TOOLKIT_CONTRACT_VERSION,
  allShowVisualToolkitFixtures,
  buildShowVisualToolkitFreeze,
  measureShowVisualToolkitFreeze,
} from './showVisualToolkitFreeze'
import { compileShow } from './showCompiler'
import { buildShowEpeExport } from './showEpeExport'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import {
  createDefaultShow,
  normalizeShowTransitionState,
  showRecordToCompileRecipe,
  updateShowTransition,
} from './showModel'
import type { ShowRecord } from './personalContentRecords'
import {
  captureShowToolkitFixture,
  roundTripShowToolkitFixtureRecord,
} from './showVisualToolkitFixtures'

describe('Show visual-toolkit integration freeze (#459)', () => {
  it('covers every registered variant with a versioned, deterministic fixture contract', () => {
    const freeze = buildShowVisualToolkitFreeze()

    expect(SHOW_VISUAL_TOOLKIT_CONTRACT_VERSION).toBe(1)
    expect(freeze.errors).toEqual([])
    expect(freeze.fingerprint).toBe('68ba010c')
    expect(freeze.variants.length).toBeGreaterThan(0)
    expect(freeze.variants.every((variant) => variant.fixtureIds.length > 0)).toBe(true)
    expect(freeze.variants.filter((variant) => variant.kind === 'property-animation').map((variant) => variant.id))
      .toEqual(['animation-speed', 'brightness', 'pattern-control', 'split-position', 'repeat-scale'])
  })

  it('measures source size, renderer formulas, memory, and compatibility across the frozen matrix', () => {
    const measurement = measureShowVisualToolkitFreeze()

    expect(measurement.fixtureCount).toBe(104)
    expect(Object.values(measurement.patternFormulaCounts).reduce((sum, count) => sum + count, 0)).toBe(104)
    expect(measurement.overBudgetFixtureIds).toEqual([])
    expect(measurement.maxArtifact.artifactBytes).toBeLessThan(measurement.maxArtifact.budgetBytes)
    expect(measurement.maxGeneratedScalarGlobals.value).toBeGreaterThanOrEqual(0)
    expect(measurement.maxGeneratedArrayElements.value).toBeGreaterThanOrEqual(0)
    expect(measurement.representativeHardwareFps).toBeNull()
  })

  it('compiles, captures, seeks, costs, and reloads the complete fixture matrix without drift', () => {
    for (const fixture of allShowVisualToolkitFixtures()) {
      const artifact = compileShow(fixture.recipe, {})
      const first = captureShowToolkitFixture(fixture)
      const second = captureShowToolkitFixture(fixture)

      expect(first, fixture.id).toEqual(second)
      expect(first.generatedCode, fixture.id).toBe(artifact.code)
      expect(roundTripShowToolkitFixtureRecord(fixture), fixture.id).toEqual(fixture.persistedRecord)
      expect(artifact.summary.cost.code.artifactBytes, fixture.id).toBeLessThan(artifact.summary.cost.code.budgetBytes)
      expect(artifact.summary.cost.cpu.patternEvaluations, fixture.id).toBeDefined()
      expect(artifact.summary.cost.compatibility.warnings, fixture.id).toEqual(expect.any(Array))
    }
  })

  it('exports and reloads a compiled catalogue artifact through the standard EPE envelope', () => {
    const fixture = allShowVisualToolkitFixtures().find((candidate) => candidate.id === 'effect-distortion-animated')!
    const capture = captureShowToolkitFixture(fixture)
    const exported = buildShowEpeExport(fixture.persistedRecord, capture.generatedCode, {
      id: 'pxb45900000000000',
      preview: '/9j/freeze-preview',
      stampedAt: '2026-07-14T09:00:00.000Z',
    })
    const reloaded = parseEpe(exported.text)

    expect(reloaded.name).toBe(fixture.persistedRecord.name)
    expect(reloaded.stamp).toMatchObject({ kind: 'show', id: fixture.persistedRecord.id })
    expect(reloaded.src).toContain(capture.generatedCode)
  })

  it('migrates a legacy easing and Dissolve record without generated or visual drift', () => {
    const source = 'export function render2D(index, x, y) { rgb(x, y, 1) }'
    const legacy = updateShowTransition(createDefaultShow('legacy-freeze', 'Legacy freeze', 459), 'scene-1', 'dither', 1000)
    legacy.transitions![0].easing = 'ease-in-out'
    const modern = normalizeShowTransitionState(JSON.parse(JSON.stringify(legacy)) as ShowRecord)
    const lookup = { byCellId: Object.fromEntries(legacy.cells.map((cell) => [cell.id, source])), stageDimension: 2 as const }
    const legacyArtifact = compileShow(showRecordToCompileRecipe(legacy, lookup), {})
    const modernArtifact = compileShow(showRecordToCompileRecipe(modern, lookup), {})
    const mapPoints = Array.from({ length: 256 }, (_, index) => ({
      sample: [(index % 16) / 15, Math.floor(index / 16) / 15],
    }))
    const capture = (artifact: typeof legacyArtifact) => createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints, randomSeed: 459 }).advanceTo(30_500, { stepMs: 50 }).checksum

    expect(modern.transitions![0]).toMatchObject({
      kind: 'dither',
      easing: { curve: 'quadratic', direction: 'in-out' },
    })
    expect(normalizeShowTransitionState(JSON.parse(JSON.stringify(modern)) as ShowRecord)).toEqual(modern)
    expect(modernArtifact.code).toBe(legacyArtifact.code)
    expect(capture(modernArtifact)).toBe(capture(legacyArtifact))
  })
})
