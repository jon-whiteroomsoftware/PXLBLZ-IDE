import { nativeDim } from '@/engine/dimLens'
import { SHAPES } from '@/engine/shapes'
import { SURFACES } from '@/engine/surfaces'
import { STOCK_MAPS, isMapWrappable } from '@/store/mapStore'
import { DEMOS, RECOMMENDED_SETTINGS } from './patterns'

const INTENTIONAL_LOW_DENSITY = new Set([
  'EasedSweep',
  'IQPalettes',
  'MetaballGarden',
  'TestPattern2D',
  'TestPattern3D',
])

describe('stock Pattern recommendations', () => {
  it('references only current maps, shapes, and surfaces', () => {
    const mapIds = new Set(STOCK_MAPS.map((map) => map.id))
    for (const [name, settings] of Object.entries(RECOMMENDED_SETTINGS)) {
      if (settings.mapId) expect(mapIds.has(settings.mapId), `${name}: ${settings.mapId}`).toBe(true)
      if (settings.shapeId) expect(settings.shapeId in SHAPES, `${name}: ${settings.shapeId}`).toBe(true)
      if (settings.surfaceId) expect(settings.surfaceId in SURFACES, `${name}: ${settings.surfaceId}`).toBe(true)
      if (settings.surfaceId === 'cylinder' && settings.mapId) {
        const map = STOCK_MAPS.find((candidate) => candidate.id === settings.mapId)!
        expect(isMapWrappable({ id: map.id, dim: map.dim }), `${name}: ${map.id}`).toBe(true)
      }
    }
  })

  it('gives every curated Pattern a complete, plausible presentation', () => {
    expect(Object.keys(RECOMMENDED_SETTINGS).sort()).toEqual(Object.keys(DEMOS).sort())
    for (const [name, source] of Object.entries(DEMOS)) {
      const settings = RECOMMENDED_SETTINGS[name]
      expect(settings.pixelCount, name).toBeGreaterThan(0)
      expect(settings.pixelCount, name).toBeLessThanOrEqual(2048)
      expect(settings.lightSize, name).toBeGreaterThan(0)
      expect(settings.diffusion, name).toBeGreaterThanOrEqual(0)
      expect(settings.diffusion, name).toBeLessThanOrEqual(1)
      if (nativeDim(source) >= 2 && !INTENTIONAL_LOW_DENSITY.has(name)) {
        expect(settings.pixelCount, name).toBeGreaterThanOrEqual(1000)
      }
    }
  })
})
