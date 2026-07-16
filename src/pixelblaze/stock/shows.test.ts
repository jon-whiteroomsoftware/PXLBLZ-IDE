import { describe, expect, it } from 'vitest'
import { validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import { buildShowEpeExport } from '@/engine/showEpeExport'
import { parseEpe } from '@/engine/epeImport'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { compileShowForArtifact, sourceForShowCell } from '@/engine/showPreviewArtifact'
import { validatePortableShowCompatibility } from '@/engine/showPortableCompatibility'
import { loadPattern } from '@/engine/loadPattern'
import { createShim } from '@/engine/shim'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { getUserDoc } from '@/docs/catalog'
import { DEMOS } from './patterns'
import { STOCK_SHOWS } from './shows'

describe('stock Show curriculum (#363)', () => {
  it('ships the stable Learn 100, Learn 200, and showcase catalogue', () => {
    expect(STOCK_SHOWS).toHaveLength(13)
    expect(new Set(STOCK_SHOWS.map((item) => item.id)).size).toBe(STOCK_SHOWS.length)
    expect(STOCK_SHOWS.map((item) => [item.name, item.collection, item.level, item.order])).toEqual([
      ['101 Clips and Crossfade', 'learn', 100, 1],
      ['102 Transitions and Values', 'learn', 100, 2],
      ['103 Effects', 'learn', 100, 3],
      ['104 Portable Zones', 'learn', 100, 4],
      ['105 Built from Basics', 'learn', 100, 5],
      ['201 Scene-local Cuts', 'learn', 200, 1],
      ['202 Layers and Local Animation', 'learn', 200, 2],
      ['203 Dynamic Zone Layouts', 'learn', 200, 3],
      ['204 Installation Mapping', 'learn', 200, 4],
      ['205 Installation Composition', 'learn', 200, 5],
      ['Transform Effects', 'showcases', null, 1],
      ['Distortion Effects', 'showcases', null, 2],
      ['Color and Output Effects', 'showcases', null, 3],
    ])
    expect(STOCK_SHOWS.every((item) => item.show.id === item.id)).toBe(true)
    expect(new Set(STOCK_SHOWS.map((item) => `${item.collection}:${item.level}:${item.order}`)).size)
      .toBe(STOCK_SHOWS.length)
  })

  it('gives every Show a complete guide note outside the compiled record', () => {
    for (const item of STOCK_SHOWS) {
      expect(item.note.purpose, item.name).not.toBe('')
      expect(item.note.notice, item.name).not.toBe('')
      expect(item.note.prompts, item.name).toHaveLength(2)
      expect(item.note.guide.documentId, item.name).toBe('show-visual-toolkit')
      expect(item.note.guide.heading, item.name).toMatch(/^[a-z0-9-]+$/)
      const guideHeadings = getUserDoc(item.note.guide.documentId)!.source
        .split('\n')
        .filter((line) => /^#{2,6} /.test(line))
        .map((line) => line.replace(/^#{2,6} /, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      expect(guideHeadings, item.name).toContain(item.note.guide.heading)
      expect('note' in item.show, item.name).toBe(false)
    }
  })

  it('keeps the first lesson to two Clips and one boundary-owned Crossfade', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-101-clips-crossfade')!
    expect(item.show.scenes.map((scene) => [scene.name, scene.durationMs])).toEqual([
      ['Water', 8_000], ['Mechanism', 8_000],
    ])
    expect(item.show.cells.map((cell) => cell.patternName)).toEqual(['Caustics', 'ClockworkIris'])
    expect(item.show.transitions).toEqual([
      expect.objectContaining({ afterSceneId: 'water', kind: 'crossfade', durationMs: 3_000 }),
    ])
    expect(item.show.composition).toBeUndefined()
    expect(item.show.zones).toHaveLength(1)
  })

  it('ships valid local Main scheduling and typed overlay animation in Learn 200', () => {
    for (const id of ['stock-show-201-scene-local-cuts', 'stock-show-202-layers-local-animation']) {
      const item = STOCK_SHOWS.find((candidate) => candidate.id === id)!
      expect(item.show.composition, item.name).toBeDefined()
      expect(validateShowComposition(item.show, item.show.composition!), item.name).toEqual([])
    }

    const cuts = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-201-scene-local-cuts')!
    expect(cuts.show.composition!.scenes[0].zones[0].main.map((placement) => [placement.startMs, placement.durationMs]))
      .toEqual([[0, 6_000], [6_000, 6_000], [12_000, 6_000]])

    const layered = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-202-layers-local-animation')!
    expect(layered.show.composition!.scenes[0].propertyTracks?.[0]).toMatchObject({
      target: { kind: 'placement-opacity', placementId: 'overlay-signal' },
      keyframes: [
        { timeMs: 3_000, value: 0 }, { timeMs: 5_000, value: 0.72 },
        { timeMs: 11_000, value: 0.72 }, { timeMs: 13_000, value: 0 },
      ],
    })
  })

  it('covers every Effect kind in the three data-driven showcases', () => {
    const kinds = STOCK_SHOWS
      .filter((item) => item.collection === 'showcases')
      .flatMap((item) => item.show.cells.flatMap((cell) => cell.effects?.map((effect) => effect.kind) ?? []))
    const counts = Object.fromEntries([...new Set(kinds)].map((kind) => [kind, kinds.filter((candidate) => candidate === kind).length]))

    expect(Object.keys(counts).sort()).toEqual([
      'brightness', 'bulge', 'color-map', 'contrast', 'hue', 'invert', 'kaleidoscope', 'opacity',
      'pixelate', 'posterize', 'ripple', 'rotate', 'saturation', 'scale', 'shear', 'swirl',
      'threshold', 'translate', 'wrap',
    ])
    expect(counts).toMatchObject({ translate: 2, wrap: 1 })
    expect(Object.entries(counts).filter(([kind]) => kind !== 'translate').every(([, count]) => count === 1)).toBe(true)
  })

  it('uses real stock Patterns and satisfies every output contract', () => {
    for (const item of STOCK_SHOWS) {
      expect(item.show.cells.length, item.name).toBeGreaterThan(0)
      for (const cell of item.show.cells) {
        expect(cell.pattern.kind, item.name).toBe('stock')
        expect(DEMOS[cell.pattern.id], `${item.name}: ${cell.pattern.id}`).toBeTypeOf('string')
      }

      if (item.track === 'portable') {
        const compatibility = validatePortableShowCompatibility(
          item.show,
          item.show.cells.map((cell) => ({
            cellId: cell.id,
            patternName: cell.patternName,
            source: sourceForShowCell(cell, []),
          })),
          2,
        )
        expect(compatibility?.compatible, `${item.name}: ${compatibility?.issues.join('; ')}`).toBe(true)
      } else {
        expect(validateInstallationCoverage(item.show), item.name).toMatchObject({ valid: true })
      }
    }
  })

  it('keeps curriculum Pattern clocks slow enough to reveal routing and Scene changes', () => {
    for (const item of STOCK_SHOWS) {
      for (const cell of item.show.cells) {
        expect(cell.adaptations.timeScale, `${item.name}: ${cell.patternName}`).toBeGreaterThan(0)
        expect(cell.adaptations.timeScale, `${item.name}: ${cell.patternName}`).toBeLessThanOrEqual(0.7)
      }
    }
  })

  it('uses representative high-density square Stages for the reviewed Portable compositions', () => {
    for (const id of ['stock-show-101-clips-crossfade', 'stock-show-105-built-from-basics']) {
      const item = STOCK_SHOWS.find((candidate) => candidate.id === id)!
      expect(item.show.outputContract).toMatchObject({
        kind: 'portable-2d',
        referencePixelCount: 2_000,
      })
      expect(item.show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)).toBe(2_000)
    }
  })

  it('compiles every lesson through the production artifact pipeline', () => {
    for (const item of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      expect(compiled.artifact?.code.length, item.name).toBeGreaterThan(1_000)
      expect(compiled.artifact?.metadata.renderFns.hasRender2D, item.name).toBe(true)
      expect(compiled.artifact?.summary.cost.code.artifactBytes, item.name).toBeGreaterThan(1_000)
    }
  })

  it('plays distinct routed content after each top-level Scene boundary (#478)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-205-installation-composition')!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    const pixelCount = 256
    const mapPoints = Array.from({ length: pixelCount }, (_, index) => ({
      sample: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
      pos: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
    }))
    const shim = createShim({ pixelCount, dimensions: 2, mapPoints, getVirtualTime: () => 0, randomSeed: 1 })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    const sample = () => [0, 100, 200].map((index) => {
      handle.render2D(index, (index % 16) / 15, Math.floor(index / 16) / 15)
      return shim.capturedPixel()
    })

    handle.beforeRender(1_000)
    const establish = sample()
    handle.beforeRender(6_000)
    const develop = sample()
    handle.beforeRender(7_000)
    const resolve = sample()

    expect(develop).not.toEqual(establish)
    expect(resolve).not.toEqual(develop)
    expect(compiled.artifact?.summary.clipCount).toBeGreaterThanOrEqual(12)
  })

  it('keeps Portable logical Zones independent while advancing the Scene schedule (#478)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-104-portable-zones')!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    const pixelCount = 1024
    const mapPoints = Array.from({ length: pixelCount }, (_, index) => ({
      sample: [(index % 32) / 31, Math.floor(index / 32) / 31] as [number, number],
      pos: [(index % 32) / 31, Math.floor(index / 32) / 31] as [number, number],
    }))
    const shim = createShim({ pixelCount, dimensions: 2, mapPoints, getVirtualTime: () => 0, randomSeed: 1 })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    const renderAt = (index: number, x: number, y: number) => {
      handle.render2D(index, x, y)
      return shim.capturedPixel()
    }
    const renderZone = (right: boolean) => [0.1, 0.25, 0.4].map((localX, sampleIndex) => {
      const x = right ? 0.5 + localX * 0.5 : localX * 0.5
      return renderAt(16 * 32 + Math.round(x * 31) + sampleIndex, x, 0.5)
    })

    handle.beforeRender(1_000)
    const firstLeft = renderZone(false)
    const firstRight = renderZone(true)
    handle.beforeRender(8_000)
    const secondLeft = renderZone(false)
    const secondRight = renderZone(true)

    expect(firstLeft).not.toEqual(firstRight)
    expect(secondLeft).not.toEqual(firstLeft)
    expect(secondRight).not.toEqual(firstRight)
  })

  it('exports every lesson as a stamped, importable Show EPE', () => {
    for (const item of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      const exported = buildShowEpeExport(item.show, compiled.artifact!.code, {
        id: `curriculum-${item.id}`,
        stampedAt: '2026-07-14T00:00:00.000Z',
      })
      const parsed = parseEpe(exported.text)

      expect(parsed.name).toBe(item.name)
      expect(parsed.stamp).toMatchObject({ kind: 'show', id: item.id })
      expect(parsed.src).toContain(`Compiled PXLBLZ Show: ${item.name}`)
    }
  })

  it.each([['plane', 256], ['wide', 1536]] as const)(
    'keeps Portable choreography unchanged on the %s reference output',
    (referenceMapId, referencePixelCount) => {
      for (const item of STOCK_SHOWS.filter((candidate) => candidate.track === 'portable')) {
        const adapted = {
          ...item.show,
          outputContract: createPortableShowOutputContract({ referenceMapId, referencePixelCount }),
          stageMapId: referenceMapId,
        }
        const compiled = compileShowForArtifact(adapted, [], undefined, {}, { stageDimension: 2 })

        expect(compiled.error, item.name).toBeNull()
        expect(adapted.cells, item.name).toEqual(item.show.cells)
        expect(adapted.transitions, item.name).toEqual(item.show.transitions)
      }
    },
  )
})
