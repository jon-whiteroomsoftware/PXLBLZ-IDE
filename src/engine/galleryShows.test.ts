import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { showLoopDurationMs } from './showModel'
import { stockShowById } from '@/pixelblaze/stock/shows'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import { resolveMap } from '@/store/mapStore'
import { applyNormalizeMode } from './maps'
import { createFastReplayRuntime } from './fastReplay'
import {
  GALLERY_SHOWS,
  GALLERY_SHOW_PIXEL_COUNT,
  galleryShowBandBox,
  galleryShowPixelCount,
  galleryShowBySlug,
  galleryShowChapters,
  galleryShowFacts,
  galleryShowInsertionIndexes,
  prepareGalleryShow,
  resolveGalleryShowGeometry,
  stageAspect,
} from './galleryShows'
import type { MapPoint } from './maps'

describe('Gallery Shows catalogue', () => {
  // Delete this v1 projection test when shows.ts is deleted.
  it('keeps facts and geometry equal to the pinned v1 Gallery Shows', () => {
    for (const show of GALLERY_SHOWS) {
      const legacy = stockShowById(show.id)!
      const expectedLoopMs = showLoopDurationMs(legacy.show)
      expect(galleryShowFacts(show), show.id).toEqual({
        title: legacy.name,
        loopMs: expectedLoopMs,
        loopSeconds: Math.round(expectedLoopMs / 1000),
        zoneCount: legacy.show.zones.length,
        track: legacy.track,
      })
      const contract = legacy.show.outputContract
      const pixelCount = contract?.kind === 'installation' && contract.pixelCount > 0
        ? contract.pixelCount : GALLERY_SHOW_PIXEL_COUNT
      expect(galleryShowPixelCount(show), show.id).toBe(pixelCount)
      const legacyMap = resolveMap(legacy.show.stageMapId ?? 'plane', [])
      const geometry = resolveGalleryShowGeometry(show)
      const points = applyNormalizeMode(legacyMap.resolve(Math.max(1, pixelCount)), 'contain')
      const expectedPoints = points.map(point => {
        const raw = point.pos ?? point.sample
        return { pos: legacyMap.dim === 3
          ? [raw[0] ?? 0.5, raw[1] ?? 0.5, raw[2] ?? 0.5]
          : [raw[0] ?? 0.5, raw[1] ?? 0.5] }
      }) as MapPoint[]
      expect({ mapId: geometry.mapId, dim: geometry.dim, aspect: geometry.aspect }, show.id).toEqual({
        mapId: legacyMap.id,
        dim: legacyMap.dim,
        aspect: stageAspect(expectedPoints, legacyMap.dim),
      })
    }
  })

  it('compiles each Gallery Show from its native v2 Stage capture', () => {
    for (const show of GALLERY_SHOWS) {
      const record = stockShowV2ById(show.id)!
      const dependencies = { patterns: [], libraries: [], maps: [], profiles: [], stageMap: resolveShowV2StageMap(record.stageMapId, []) }
      const captured = captureShowStageEditV2(record, dependencies).prepared
      expect(captured.status, show.id).toBe('ready')
      if (captured.status !== 'ready') continue
      expect(prepareGalleryShow(show, resolveGalleryShowGeometry(show)).code, show.id).toBe(captured.bundle.artifact.code)
    }
  })

  it('does not import v1 Show modules in Gallery production code', () => {
    const source = readFileSync(new URL('./galleryShows.ts', import.meta.url), 'utf8')
    const legacyImports = /from ['"](?:@\/pixelblaze\/stock\/shows|\.\/showModel|\.\/showPreviewArtifact|\.\/showCompositionModel)['"]/
    expect(source).not.toMatch(legacyImports)
  })

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
      const geometry = resolveGalleryShowGeometry(show)
      expect(geometry.mapPoints.length).toBeGreaterThan(100)
      expect(geometry.aspect).toBeGreaterThan(0)
      const prepared = prepareGalleryShow(show, geometry)
      const runtime = createFastReplayRuntime(prepared, { mapPoints: geometry.mapPoints, randomSeed: 1, fidelity: 'fast' })
      const result = runtime.advanceLive(16)
      expect(result.frame.length).toBe(geometry.mapPoints.length * 3)
    }
  })

  it('projects named chapters from the prepared native record, ordered and inside the loop', () => {
    for (const show of GALLERY_SHOWS) {
      const chapters = galleryShowChapters(show)
      const facts = galleryShowFacts(show)
      expect(chapters.length, show.slug).toBeGreaterThan(0)
      expect(chapters.map(chapter => chapter.timeMs)).toEqual([...chapters.map(chapter => chapter.timeMs)].sort((a, b) => a - b))
      for (const chapter of chapters) {
        expect(chapter.name, `${show.slug}:${chapter.id}`).toBeTruthy()
        expect(chapter.timeMs).toBeLessThan(facts.loopMs)
        expect(chapter.durationMs).toBeGreaterThan(0)
      }
      expect(chapters.reduce((total, chapter) => total + chapter.durationMs, 0)).toBe(facts.loopMs)
    }
  })

  it('keeps the Coronal Mass Ejection remix general Markers out of its chapter list', () => {
    const remix = GALLERY_SHOWS.find(show => show.slug === 'coronal-mass-ejection-remix')!
    expect(galleryShowChapters(remix).map(chapter => chapter.name)).toEqual(['Intro', 'Gesture'])
    const markers = stockShowById(remix.id)!.show.composition!.markers ?? []
    expect(markers.length).toBeGreaterThan(2)
  })

  it('resolves installation Shows at their contract count and portable Shows at the Gallery count', () => {
    for (const show of GALLERY_SHOWS) {
      const contract = stockShowById(show.id)!.show.outputContract
      const expected = contract?.kind === 'installation' ? contract.pixelCount : GALLERY_SHOW_PIXEL_COUNT
      expect(galleryShowPixelCount(show)).toBe(expected)
      expect(resolveGalleryShowGeometry(show).mapPoints.length).toBe(expected)
    }
    expect(GALLERY_SHOWS.some((show) => stockShowById(show.id)!.show.outputContract?.kind === 'installation')).toBe(true)
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
