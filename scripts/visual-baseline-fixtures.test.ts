import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { RECOMMENDED_SETTINGS } from '../src/pixelblaze/stock/patterns'
import { stockShowV2ById } from '../src/pixelblaze/stock/showsV2'
import { stockShowCatalogueById } from '../src/pixelblaze/stock/showCatalogueV2'
import { VISUAL_BASELINE_FIXTURES, visualBaselineSnapshotName } from './visual-baseline-fixtures'

describe('visual baseline fixtures', () => {
  it('covers the four Pattern and Show partitions', () => {
    expect(VISUAL_BASELINE_FIXTURES.map(fixture => fixture.id).sort()).toEqual([
      'pattern-1d', 'pattern-2d', 'show-installation', 'show-portable',
    ])
    expect(VISUAL_BASELINE_FIXTURES.find(fixture => fixture.id === 'pattern-1d')).toMatchObject({ kind: 'pattern', dimension: '1D' })
    expect(VISUAL_BASELINE_FIXTURES.find(fixture => fixture.id === 'pattern-2d')).toMatchObject({ kind: 'pattern', dimension: '2D' })
    for (const fixture of VISUAL_BASELINE_FIXTURES.filter(fixture => fixture.kind === 'show')) {
      expect(stockShowCatalogueById(fixture.target)?.track).toBe(fixture.id === 'show-portable' ? 'portable' : 'installation')
    }
  })

  it('pins frame roles and unique snapshot names', () => {
    const names: string[] = []
    for (const fixture of VISUAL_BASELINE_FIXTURES) {
      expect(fixture.frames.map(frame => frame.label).sort()).toEqual(fixture.kind === 'show' ? ['hold', 'transition'] : ['still'])
      names.push(...fixture.frames.map(frame => visualBaselineSnapshotName(fixture, frame)))
    }
    expect(new Set(names).size).toBe(names.length)
  })

  it('pins Pattern maps and sources without random calls', () => {
    expect(RECOMMENDED_SETTINGS.PendulumWave).toMatchObject({ shapeId: 'line', pixelCount: 256 })
    expect(RECOMMENDED_SETTINGS.EasedSweep).toMatchObject({ mapId: 'wide', surfaceId: 'flat', pixelCount: 256, normalize: 'contain' })
    for (const fixture of VISUAL_BASELINE_FIXTURES.filter(fixture => fixture.kind === 'pattern')) {
      const source = readFileSync(new URL(`../src/pixelblaze/stock/patterns/${fixture.target}.js`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/\brandom\s*\(/)
    }
  })

  it('pins Show maps and frames within their compositions', () => {
    for (const fixture of VISUAL_BASELINE_FIXTURES.filter(fixture => fixture.kind === 'show')) {
      const show = stockShowV2ById(fixture.target)!
      expect(show.stageMapId).toBe(fixture.id === 'show-portable' ? 'plane' : 'proscenium-stage-2d')
      for (const frame of fixture.frames) {
        expect(frame.startMs).toBeGreaterThanOrEqual(0)
        expect(frame.startMs).toBeLessThan(show.composition.showEndMs)
      }
    }
  })

  it('places the Quadrille transition inside a crossfade and its hold outside transitions', () => {
    const fixture = VISUAL_BASELINE_FIXTURES.find(fixture => fixture.id === 'show-portable')!
    const transitions = stockShowV2ById(fixture.target)!.composition.transitions
    expect(transitions.length).toBeGreaterThan(0)
    expect(transitions.every(transition => transition.wholeOutput !== undefined)).toBe(true)
    const t = fixture.frames.find(frame => frame.label === 'transition')!.startMs
    expect(transitions.some(transition => transition.kind === 'crossfade' &&
      transition.wholeOutput!.startMs < t && t < transition.wholeOutput!.startMs + transition.durationMs)).toBe(true)
    const hold = fixture.frames.find(frame => frame.label === 'hold')!.startMs
    expect(transitions.every(transition => hold < transition.wholeOutput!.startMs ||
      hold >= transition.wholeOutput!.startMs + transition.durationMs)).toBe(true)
  })

  it('places the installation transition at a Cut and its hold away from clip boundaries', () => {
    const fixture = VISUAL_BASELINE_FIXTURES.find(fixture => fixture.id === 'show-installation')!
    const clips = stockShowV2ById(fixture.target)!.composition.clips
    const t = fixture.frames.find(frame => frame.label === 'transition')!.startMs
    expect(t).toBe(7000)
    expect(clips.some(clip => clip.startMs === t && clips.some(previous =>
      previous.zoneId === clip.zoneId && previous.startMs + previous.durationMs === t &&
      previous.instanceId !== clip.instanceId))).toBe(true)
    const hold = fixture.frames.find(frame => frame.label === 'hold')!.startMs
    expect(clips.every(clip => clip.startMs !== hold && clip.startMs + clip.durationMs !== hold)).toBe(true)
  })
})
