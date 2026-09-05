// Provenance: pxlblz-v3 test/critiqueShow.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { critiqueShow } from '../shows/critique.js'
import { validateShowDocument } from '../shows/evaluate.js'

interface SceneSpec {
  durationMs: number
  /** Stock pattern id for this Scene's single cell; null leaves blank time. */
  pattern: string | null
  transitionKind?: string
}

// Minimal valid portable Show: one zone, one cell per non-blank Scene, one
// boundary Transition after every Scene but the last.
function buildShow(scenes: SceneSpec[]): ShowRecord {
  const record = {
    id: 'critique-fixture',
    name: 'Critique Fixture',
    scenes: scenes.map((scene, index) => ({ id: `scene-${index}`, name: `Scene ${index}`, durationMs: scene.durationMs })),
    zones: [{ id: 'zone-main', name: 'Main', nominalPixelCount: 64 }],
    cells: scenes.flatMap((scene, index) =>
      scene.pattern === null
        ? []
        : [{
            id: `cell-${index}`,
            zoneId: 'zone-main',
            sceneId: `scene-${index}`,
            sceneSpan: 1,
            pattern: { kind: 'stock' as const, id: scene.pattern },
            patternName: scene.pattern,
            adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
          }],
    ),
    routingLayouts: [
      { id: 'layout-full', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['zone-main'] } },
    ],
    transitions: scenes.slice(0, -1).map((scene, index) => ({
      id: `t-${index}`,
      afterSceneId: `scene-${index}`,
      kind: scene.transitionKind ?? 'cut',
      durationMs: scene.transitionKind && scene.transitionKind !== 'cut' ? 1000 : 0,
      easing: { curve: 'linear' },
    })),
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 256,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    updatedAt: 0,
  } as unknown as ShowRecord
  // Fixtures must stay legal: critique presumes a valid document.
  const validated = validateShowDocument(record)
  expect(validated.errors, JSON.stringify(validated.errors)).toEqual([])
  return record
}

const rulesIn = (show: ShowRecord, context = {}) => critiqueShow(show, context).map((finding) => finding.rule)

describe('critique_show heuristics (#11)', () => {
  it('flags pacing monotony when every Scene runs the same length', () => {
    const monotone = buildShow([
      { durationMs: 10_000, pattern: 'CompassRose', transitionKind: 'crossfade' },
      { durationMs: 10_000, pattern: 'Caustics', transitionKind: 'wipe' },
      { durationMs: 10_000, pattern: 'ClockworkIris' },
    ])
    expect(rulesIn(monotone)).toContain('pacing-monotony')

    const varied = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose', transitionKind: 'crossfade' },
      { durationMs: 22_000, pattern: 'Caustics', transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: 'ClockworkIris' },
    ])
    expect(rulesIn(varied)).not.toContain('pacing-monotony')
  })

  it('flags the same pattern in back-to-back Scenes on one Zone', () => {
    const repeated = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose', transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'CompassRose', transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: 'Caustics' },
    ])
    const findings = critiqueShow(repeated)
    const repetition = findings.find((finding) => finding.rule === 'adjacent-pattern-repetition')
    expect(repetition).toBeDefined()
    expect(repetition!.message).toContain('CompassRose')
    expect(repetition!.message).toContain('sceneSpan')

    const spaced = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose', transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'Caustics', transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: 'CompassRose' },
    ])
    expect(rulesIn(spaced)).not.toContain('adjacent-pattern-repetition')
  })

  it('flags monotone transitions and stays quiet below three boundaries', () => {
    const allCuts = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose' },
      { durationMs: 15_000, pattern: 'Caustics' },
      { durationMs: 5_000, pattern: 'ClockworkIris' },
      { durationMs: 11_000, pattern: 'CompassRose' },
    ])
    expect(rulesIn(allCuts)).toContain('transition-variety')

    const mixed = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose', transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'Caustics', transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: 'ClockworkIris', transitionKind: 'cut' },
      { durationMs: 11_000, pattern: 'CompassRose' },
    ])
    expect(rulesIn(mixed)).not.toContain('transition-variety')

    const short = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose' },
      { durationMs: 15_000, pattern: 'Caustics' },
    ])
    expect(rulesIn(short)).not.toContain('transition-variety')
  })

  it('flags a 1D pattern on a 2D portable Stage, and only there', () => {
    const oneD = buildShow([
      { durationMs: 8_000, pattern: 'TestPattern1D', transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'Caustics' },
    ])
    const findings = critiqueShow(oneD)
    const fit = findings.find((finding) => finding.rule === 'dimensional-fit')
    expect(fit).toBeDefined()
    expect(fit!.message).toContain('stripes')

    const twoD = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose', transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'Caustics' },
    ])
    expect(rulesIn(twoD)).not.toContain('dimensional-fit')
  })

  it('flags unused budget headroom only with a known low ratio and few patterns', () => {
    const sparse = buildShow([
      { durationMs: 8_000, pattern: 'CompassRose', transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'Caustics' },
    ])
    expect(rulesIn(sparse, { budgetRatio: 0.12 })).toContain('budget-headroom')
    expect(rulesIn(sparse, { budgetRatio: 0.55 })).not.toContain('budget-headroom')
    expect(rulesIn(sparse, {})).not.toContain('budget-headroom')
  })

  // "returns zero findings for curated good stock Shows" drifted against the
  // current V2 compiler and lives in critiqueShow.drift.diagnostic.ts,
  // run by `npm run agent:diagnostics` rather than ordinary CI (#945).

  it('phrases every finding as an actionable suggestion', () => {
    const noisy = buildShow([
      { durationMs: 10_000, pattern: 'TestPattern1D' },
      { durationMs: 10_000, pattern: 'TestPattern1D' },
      { durationMs: 10_000, pattern: 'CompassRose' },
      { durationMs: 10_000, pattern: 'CompassRose' },
    ])
    const findings = critiqueShow(noisy, { budgetRatio: 0.1 })
    expect(findings.length).toBeGreaterThanOrEqual(4)
    for (const finding of findings) {
      expect(finding.severity).toBe('suggestion')
      expect(finding.where.length).toBeGreaterThan(0)
      // "What to try" is present: every message proposes an alternative.
      expect(finding.message).toMatch(/\b(try|either|consider|pick|keep|room for)\b/i)
    }
  })
})
