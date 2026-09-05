// V2-authored for #945 (candidate review of a4e11cc0, P2): the critique
// compares Pattern sources by their canonical stock id. The adjacent-
// repetition key and the distinct-source count used the raw id, so a Show
// mixing the retired DoomFire with its successor DoomFireV20_2D was not the
// same Show as one naming the successor twice. Boundary: critiqueShow over a
// valid record. Invariant: a Show carrying a retired id yields exactly the
// findings of the same Show carrying the superseding id. Oracles: finding
// equality between the two Shows, and the specific finding (or its absence)
// the canonical count produces.
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { RETIRED_STOCK_PATTERN_IDS } from '@/pixelblaze/stock/patterns'
import { critiqueShow } from '../shows/critique.js'
import { validateShowDocument } from '../shows/evaluate.js'

const RETIRED_ID = 'DoomFire'
const CURRENT_ID = RETIRED_STOCK_PATTERN_IDS[RETIRED_ID]

interface SceneSpec {
  durationMs: number
  pattern: string
  transitionKind?: string
}

/** One Zone, one cell per Scene; Doom Fire cells share a display name so only the id differs. */
function buildShow(scenes: SceneSpec[]): ShowRecord {
  const record = {
    id: 'critique-alias-fixture',
    name: 'Critique Alias Fixture',
    scenes: scenes.map((scene, index) => ({ id: `scene-${index}`, name: `Scene ${index}`, durationMs: scene.durationMs })),
    zones: [{ id: 'zone-main', name: 'Main', nominalPixelCount: 64 }],
    cells: scenes.map((scene, index) => ({
      id: `cell-${index}`,
      zoneId: 'zone-main',
      sceneId: `scene-${index}`,
      sceneSpan: 1,
      pattern: { kind: 'stock' as const, id: scene.pattern },
      patternName: scene.pattern === RETIRED_ID || scene.pattern === CURRENT_ID ? 'Doom Fire' : scene.pattern,
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
    })),
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
  const validated = validateShowDocument(record)
  expect(validated.errors, JSON.stringify(validated.errors)).toEqual([])
  return record
}

describe('critique compares stock sources by canonical id (#945 repair)', () => {
  it('names a real retired id', () => {
    expect(CURRENT_ID).toBeDefined()
    expect(CURRENT_ID).not.toBe(RETIRED_ID)
  })

  it('flags the retired id beside its successor as back-to-back repetition', () => {
    const mixed = buildShow([
      { durationMs: 8_000, pattern: RETIRED_ID, transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: CURRENT_ID, transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: 'Caustics' },
    ])
    const canonical = buildShow([
      { durationMs: 8_000, pattern: CURRENT_ID, transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: CURRENT_ID, transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: 'Caustics' },
    ])
    const findings = critiqueShow(mixed)
    expect(findings).toEqual(critiqueShow(canonical))
    const repetition = findings.find((finding) => finding.rule === 'adjacent-pattern-repetition')
    expect(repetition).toBeDefined()
    expect(repetition!.where).toBe('Zone "zone-main", Scenes 1–2')
    expect(repetition!.message).toContain('Doom Fire')
  })

  it('counts the retired id and its successor as one distinct source for budget headroom', () => {
    const mixed = buildShow([
      { durationMs: 8_000, pattern: RETIRED_ID, transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'CompassRose', transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: CURRENT_ID, transitionKind: 'cut' },
      { durationMs: 11_000, pattern: 'Caustics' },
    ])
    const canonical = buildShow([
      { durationMs: 8_000, pattern: CURRENT_ID, transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'CompassRose', transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: CURRENT_ID, transitionKind: 'cut' },
      { durationMs: 11_000, pattern: 'Caustics' },
    ])
    const findings = critiqueShow(mixed, { budgetRatio: 0.1 })
    expect(findings).toEqual(critiqueShow(canonical, { budgetRatio: 0.1 }))
    const headroom = findings.find((finding) => finding.rule === 'budget-headroom')
    expect(headroom).toBeDefined()
    expect(headroom!.message).toContain('3 distinct Patterns')

    // A fourth real source silences the finding for both spellings alike.
    const four = buildShow([
      { durationMs: 8_000, pattern: RETIRED_ID, transitionKind: 'crossfade' },
      { durationMs: 15_000, pattern: 'CompassRose', transitionKind: 'wipe' },
      { durationMs: 5_000, pattern: 'ClockworkIris', transitionKind: 'cut' },
      { durationMs: 11_000, pattern: 'Caustics' },
    ])
    expect(critiqueShow(four, { budgetRatio: 0.1 }).map((finding) => finding.rule)).not.toContain('budget-headroom')
  })
})
