import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePxlblzBanner } from './artifactStamp'
import { compileShowForPreview } from './showPreviewArtifact'
import { parseEpe } from './epeImport'
import { buildShowEpeExport } from './showEpeExport'
import { createAdaptivePatternPrismShow, createPatternPrismShow } from './patternPrismShow'
import { loadPattern } from './loadPattern'
import { createShim } from './shim'

describe('Pattern Prism catalog Show (#401)', () => {
  it('defines the exact five-scene Ribbon Loom routing composition', () => {
    const show = createPatternPrismShow()

    expect(show.name).toBe('Pattern Prism: One Pattern, Many Layouts')
    expect(show.stageMapId).toBe('plane')
    expect(show.scenes.map((scene) => scene.name)).toEqual([
      'Full panel',
      'Four quadrants',
      'Vertical strips',
      'Pinwheel weave',
      'Full panel return',
    ])
    expect(show.routingLayouts.map((layout) => layout.name)).toEqual([
      'Full panel',
      'Four quadrants',
      'Alternating vertical strips',
      'Pinwheel interleave',
    ])
    expect(show.routingSwitches).toEqual([
      { afterSceneId: 'scene-1', layoutId: 'layout-quadrants' },
      { afterSceneId: 'scene-2', layoutId: 'layout-strips' },
      { afterSceneId: 'scene-3', layoutId: 'layout-pinwheel' },
      { afterSceneId: 'scene-4', layoutId: 'layout-full' },
    ])
    expect(show.cells).toHaveLength(1)
    expect(show.cells.every((cell) => cell.pattern.kind === 'stock' && cell.pattern.id === 'RibbonLoom')).toBe(true)
    expect(show.cells.every((cell) => cell.sceneSpan === 5)).toBe(true)
    expect(show.cells[0]).toMatchObject({ zoneSpan: 4, zoneMode: 'repeat' })
  })

  it('covers every matrix pixel exactly once in every layout', () => {
    const show = createPatternPrismShow()

    for (const layout of show.routingLayouts) {
      const pixels = layout.zones.flatMap((zone) => zone.ranges.flatMap((range) => (
        Array.from({ length: range.end - range.start + 1 }, (_, offset) => range.start + offset)
      )))
      expect(pixels.sort((a, b) => a - b), layout.name).toEqual(Array.from({ length: 256 }, (_, index) => index))
    }
  })

  it('compiles and exports through the normal Show pipeline', () => {
    const show = createPatternPrismShow()
    const compiled = compileShowForPreview(show, [], undefined, {}, { stageDimension: 2 })

    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true })
    expect(compiled.artifact?.summary).toMatchObject({
      renderPolicy: 'route-one-renderer-per-pixel',
      worstInstantRenderersPerPixel: 1,
      transitionCount: 4,
      clipCount: 1,
      routingRepresentation: 'packed-pixels',
    })
    expect(compiled.artifact?.code).toContain('Ribbon Loom')
    expect(compiled.artifact?.code).toContain('export function render2D(index, x, y)')
    expect(compiled.artifact?.code).toContain('var __pxlblz_show_route_pixels = array(1024)')

    const exported = buildShowEpeExport(show, compiled.artifact!.code, {
      id: 'pxb401PatternPrsm',
      preview: '/9j/pattern-prism-preview',
      stampedAt: '2026-07-10T21:00:00.000Z',
    })
    const parsed = parseEpe(exported.text)
    expect(exported.filename).toBe('pattern-prism-one-pattern-many-layouts.epe')
    expect(parsed.name).toBe(show.name)
    expect(parsed.src).toContain('Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/')
    expect(parsed.src).toContain('Ribbon Loom [stock:RibbonLoom]')
    expect(parsed.src).toContain('Routing Layouts: Full panel -> Four quadrants -> Alternating vertical strips -> Pinwheel interleave')
    expect(parsed.src).toContain('switch to Pinwheel interleave after scene')
  })

  it('keeps the reviewed Electromage artifact importable and identical to the generated Show', () => {
    const text = readFileSync(resolve('artifacts/electromage/pattern-prism.epe'), 'utf8')
    const envelope = JSON.parse(text) as { preview: string }
    const parsed = parseEpe(text)
    const compiled = compileShowForPreview(createPatternPrismShow(), [], undefined, {}, { stageDimension: 2 })
    const jpeg = Buffer.from(envelope.preview, 'base64')

    expect(parsed.name).toBe('Pattern Prism: One Pattern, Many Layouts')
    expect(parsePxlblzBanner(parsed.src)).toMatchObject({
      kind: 'show',
      id: 'catalog-pattern-prism',
      transforms: ['show', 'routing-layouts'],
    })
    expect(parsed.src.endsWith(compiled.artifact!.code)).toBe(true)
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    expect(jpeg.length).toBeGreaterThan(1000)
  })

  it('compiles an adaptive sibling without a fixed-pixel routing table (#409)', () => {
    const compiled = compileShowForPreview(createAdaptivePatternPrismShow(), [], undefined, {}, { stageDimension: 2 })

    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.summary.routingRepresentation).toBe('coordinate-predicates')
    expect(compiled.artifact?.code).not.toContain('__pxlblz_show_route_pixels')
    expect(compiled.artifact?.code).not.toContain('if (index < 256)')
  })

  it('keeps the generated adaptive EPE standalone and importable (#409)', () => {
    const parsed = parseEpe(readFileSync(resolve('artifacts/electromage/pattern-prism-adaptive.epe'), 'utf8'))

    expect(parsed.name).toBe('Pattern Prism: Adaptive Layouts')
    expect(parsed.src).toContain('var __pxlblz_show_route_turn = frac(')
    expect(parsed.src).not.toContain('__pxlblz_show_route_pixels')
  })

  it.each([256, 1024])('routes the adaptive artifact by Stage coordinate at %s pixels (#409)', (pixelCount) => {
    const compiled = compileShowForPreview(createAdaptivePatternPrismShow(), [], undefined, {}, { stageDimension: 2 })
    const shim = createShim({ pixelCount, dimensions: 2, mapPoints: [], getVirtualTime: () => 0 })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)

    for (const delta of [16, 5000, 5000, 5000]) {
      handle.beforeRender(delta)
      handle.render2D(0, 0.75, 0.75)
      const first = shim.capturedPixel()
      handle.render2D(pixelCount - 1, 0.75, 0.75)

      expect(shim.capturedPixel()).toEqual(first)
      expect(first.every(Number.isFinite)).toBe(true)
    }
  })

  it.each([16, 32])('produces a non-black frame in every adaptive layout at %sx%s (#409)', (size) => {
    const compiled = compileShowForPreview(createAdaptivePatternPrismShow(), [], undefined, {}, { stageDimension: 2 })
    const shim = createShim({ pixelCount: size * size, dimensions: 2, mapPoints: [], getVirtualTime: () => 0 })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)

    for (const delta of [16, 5000, 5000, 5000]) {
      handle.beforeRender(delta)
      let brightest = 0
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          const index = row * size + column
          handle.render2D(index, column / (size - 1), row / (size - 1))
          brightest = Math.max(brightest, ...shim.capturedPixel())
        }
      }
      expect(brightest).toBeGreaterThan(0)
    }
  })
})
