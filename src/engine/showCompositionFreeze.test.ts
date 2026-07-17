import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { normalizeShowComposition, validateShowComposition } from './showCompositionModel'
import {
  buildShowCompositionFreezeCases,
  measureShowCompositionFreeze,
} from './showCompositionFreeze'
import { prepareShowControllerArtifact } from './showControllerArtifact'
import { buildShowEpeExport } from './showEpeExport'
import { compileShowForArtifact, compileShowForPreview } from './showPreviewArtifact'

describe('Scene-composition release freeze (#492)', () => {
  it('covers Portable and fixed multi-zone Installation output with production-path compositions', () => {
    expect(buildShowCompositionFreezeCases().map((fixture) => fixture.id)).toEqual([
      'portable-local-composition',
      'installation-routed-composition',
    ])
  })

  it('keeps preview, artifact, replay, Controller preparation, and normalized JSON in agreement', () => {
    for (const fixture of buildShowCompositionFreezeCases()) {
      const preview = compileShowForPreview(
        fixture.show,
        fixture.patterns,
        undefined,
        {},
        { stageDimension: 2 },
      )
      const artifact = compileShowForArtifact(
        fixture.show,
        fixture.patterns,
        undefined,
        {},
        { stageDimension: 2 },
      )

      expect(preview.error, fixture.id).toBeNull()
      expect(artifact.error, fixture.id).toBeNull()
      expect(artifact.artifact?.code, fixture.id).toBe(preview.artifact?.code)
      expect(validateShowComposition(fixture.show, fixture.show.composition!), fixture.id).toEqual([])
      if (fixture.id === 'installation-routed-composition') {
        expect(artifact.artifact?.summary).toMatchObject({
          steadyStateRenderersPerPixel: 2,
          worstInstantRenderersPerPixel: 4,
          cost: { cpu: { patternEvaluations: { formula: 'S * N', samplesPerPixel: 4 } } },
        })
      }

      const normalized = normalizeShowComposition(fixture.show, fixture.show.composition!)
      expect(normalizeShowComposition(
        fixture.show,
        JSON.parse(JSON.stringify(normalized)),
      ), fixture.id).toEqual(normalized)

      const compiled = artifact.artifact!
      const capture = () => {
        const runtime = createFastReplayRuntime({
          code: compiled.code,
          metadata: compiled.metadata,
          dimension: nativeDimension(compiled.metadata.renderFns),
        }, { mapPoints: fixture.mapPoints, randomSeed: 492 })
        return fixture.sampleTimesMs.map((atMs) => runtime.advanceTo(atMs, { stepMs: 50 }).checksum)
      }
      expect(capture(), fixture.id).toEqual(capture())

      const exported = buildShowEpeExport(fixture.show, compiled.code, {
        stampedAt: '2026-07-15T00:00:00.000Z',
      })
      const prepared = prepareShowControllerArtifact(
        exported.source,
        2,
        '3.67',
        fixture.controller,
      )
      expect(prepared.blocked, fixture.id).toBe(false)
      expect(prepared.source, fixture.id).toBe(exported.source)
    }
  }, 15_000)

  it('publishes factual artifact and simultaneous-renderer pressure for the release fixtures', () => {
    const measurement = measureShowCompositionFreeze()

    expect(measurement.fixtureCount).toBe(2)
    expect(measurement.maxArtifact).toEqual({
      fixtureId: 'portable-local-composition',
      artifactBytes: 19_708,
      budgetBytes: 68_384,
      budgetRatio: 19_708 / 68_384,
    })
    expect(measurement.maxWorstInstantRenderersPerPixel).toEqual({
      fixtureId: 'installation-routed-composition',
      value: 4,
    })
    expect(measurement.maxArtifact.artifactBytes).toBeLessThan(measurement.maxArtifact.budgetBytes)
    expect(measurement.maxArtifact.budgetRatio).toBeLessThan(1)
    expect(measurement.maxWorstInstantRenderersPerPixel.value).toBeGreaterThanOrEqual(3)
    expect(measurement.overBudgetFixtureIds).toEqual([])
    expect(measurement.representativeHardwareFps).toBeNull()
  })

  it('keeps long Installation scene schedules inside the Pixelblaze 16.16 range', () => {
    const fixture = buildShowCompositionFreezeCases().find((candidate) => (
      candidate.id === 'installation-routed-composition'
    ))!
    const compiled = compileShowForArtifact(
      fixture.show,
      fixture.patterns,
      undefined,
      {},
      { stageDimension: 2 },
    ).artifact!
    expect(compiled.expandedCode).toContain('var __pxlblz_show_elapsed_s = 0')
    expect(compiled.expandedCode).toContain('__pxlblz_show_elapsed_s = (__pxlblz_show_elapsed_s + delta / 1000) % 62')
    expect(compiled.expandedCode).toContain('__pxlblz_show_elapsed_s < 30')
    expect(compiled.expandedCode).toContain('__pxlblz_show_elapsed_s < 32')
    expect(compiled.expandedCode).toContain('__pxlblz_show_elapsed_s < 62')
    expect(compiled.expandedCode).not.toContain('__pxlblz_show_elapsed_ms = (__pxlblz_show_elapsed_ms + delta) % 62000')
  })
})
