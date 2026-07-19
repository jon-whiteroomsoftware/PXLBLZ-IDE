import { nativeDim } from '@/engine/dimLens'
import { bundle } from '@/engine/bundle'
import { parsePatternManifest } from '@/engine/patternManifest'
import { SHAPES } from '@/engine/shapes'
import { SURFACES } from '@/engine/surfaces'
import { LIBRARIES } from '@/pixelblaze/libs'
import { STOCK_MAPS, isMapWrappable } from '@/store/mapStore'
import { DEMO_AUTHORS, DEMOS, RECOMMENDED_SETTINGS } from './patterns'

const INTENTIONAL_LOW_DENSITY = new Set([
  'EasedSweep',
  'IQPalettes',
  'MetaballGarden',
  'TestPattern2D',
  'TestPattern3D',
])

const EXPECTED_UPSTREAM_AUTHORS: Record<string, string[]> = {
  IQPalettes: ['Inigo Quilez'],
  IridescentFibers: ['evesira'],
  Kishimisu: ['kishimisu'],
  NeonSquircles: ['kishimisu'],
  PhantomStar: ['aiekick'],
  ShaderShowcase: ['Inigo Quilez'],
  StarNestReimagined: ['Pablo Roman Andrioli (Kali)'],
  ZippyZaps: ['SnoopethDuckDuck'],
}

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

describe('stock Pattern source manifests', () => {
  it('names, locates, and documents every curated Pattern and control', () => {
    for (const [name, source] of Object.entries(DEMOS)) {
      const manifest = parsePatternManifest(source)
      expect(manifest, name).not.toBeNull()
      if (!manifest) continue

      expect(identifierWords(manifest.name), `${name}: manifest name`).toBe(identifierWords(name))
      expect(manifest.runsOn, `${name}: native dimension`).toContain(`${nativeDim(source)}D`)

      const controls = bundle(source, LIBRARIES).metadata.controls
      if (controls.length === 0) {
        expect(manifest.controls, `${name}: no controls`).toBe('None.')
      } else {
        for (const control of controls) {
          expect(manifest.controls, `${name}: ${control.label}`).toContain(`${control.label} —`)
        }
      }
    }
  })

  it('retains structured upstream authors and a URL for every credit', () => {
    const attributed = Object.fromEntries(
      Object.entries(DEMO_AUTHORS).filter(([, authors]) => authors.length > 0),
    )
    expect(attributed).toEqual(EXPECTED_UPSTREAM_AUTHORS)

    for (const name of Object.keys(EXPECTED_UPSTREAM_AUTHORS)) {
      const manifest = parsePatternManifest(DEMOS[name])
      expect(manifest?.credits.length, name).toBeGreaterThan(0)
      for (const credit of manifest?.credits ?? []) {
        expect(credit, name).toMatch(/https:\/\//)
      }
    }
  })
})

function identifierWords(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
}
