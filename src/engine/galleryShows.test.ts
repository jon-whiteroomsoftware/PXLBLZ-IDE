import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import {
  GALLERY_SHOWS,
  galleryShowBandBox,
  galleryShowBySlug,
  galleryShowFacts,
  galleryShowInsertionIndexes,
  prepareGalleryShow,
  resolveGalleryShowGeometry,
  stageAspect,
} from './galleryShows'
import type { MapPoint } from './maps'

describe('Gallery Shows catalogue', () => {
  it('lists the curated Shows in the agreed order with unique slugs', () => {
    expect(GALLERY_SHOWS.map((show) => show.slug)).toEqual([
      'overture-installation',
      'quadrille',
      'redline-installation',
      'coronal-mass-ejection-remix',
    ])
    expect(new Set(GALLERY_SHOWS.map((show) => show.slug)).size).toBe(GALLERY_SHOWS.length)
    expect(galleryShowBySlug('quadrille')?.id).toBe('stock-show-remix-quadrille')
    expect(galleryShowBySlug('nope')).toBeUndefined()
  })

  it('every Gallery Show is a stock Show with facts, a stage, and a compilable artifact', () => {
    for (const show of GALLERY_SHOWS) {
      const facts = galleryShowFacts(show)
      expect(facts.title.length).toBeGreaterThan(0)
      expect(facts.loopSeconds).toBeGreaterThan(0)
      expect(facts.sceneCount).toBeGreaterThan(0)
      const geometry = resolveGalleryShowGeometry(show)
      expect(geometry.mapPoints.length).toBeGreaterThan(100)
      expect(geometry.aspect).toBeGreaterThan(0)
      const prepared = prepareGalleryShow(show, geometry)
      const runtime = createFastReplayRuntime(prepared, { mapPoints: geometry.mapPoints, randomSeed: 1, fidelity: 'fast' })
      const result = runtime.advanceLive(16)
      expect(result.frame.length).toBe(geometry.mapPoints.length * 3)
    }
  })

  it('keeps a wide stage wide and a 3D stage square', () => {
    const wide: MapPoint[] = [{ pos: [0, 0] }, { pos: [1, 0.25] }] as never
    expect(stageAspect(wide, 2)).toBeCloseTo(4)
    expect(stageAspect(wide, 3)).toBe(1)
    expect(stageAspect([], 2)).toBe(1)
  })
})

describe('galleryShowBandBox', () => {
  it('fixes the height from the grid width and lets the width follow the aspect', () => {
    expect(galleryShowBandBox(1000, 1)).toEqual({ width: 400, height: 400 })
    expect(galleryShowBandBox(1000, 1.5)).toEqual({ width: 600, height: 400 })
  })

  it('caps a very wide stage at the max width and gives up height instead', () => {
    const box = galleryShowBandBox(1000, 4)
    expect(box.width).toBe(700)
    expect(box.height).toBe(175)
  })
})

describe('galleryShowInsertionIndexes', () => {
  it('puts the hero first and spreads the rest evenly', () => {
    expect(galleryShowInsertionIndexes(4, 88)).toEqual([0, 22, 44, 66])
    expect(galleryShowInsertionIndexes(1, 10)).toEqual([0])
    expect(galleryShowInsertionIndexes(0, 10)).toEqual([])
  })
})
