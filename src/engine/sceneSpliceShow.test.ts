import { parsePxlblzBanner } from './artifactStamp'
import { parseEpe } from './epeImport'
import { createSceneSpliceShow } from './sceneSpliceShow'
import { buildShowEpeExport } from './showEpeExport'
import { showLoopDurationMs } from './showModel'
import { compileShowForPreview } from './showPreviewArtifact'

describe('Scene Splice catalog Show (#402)', () => {
  it('defines the exact warm-to-cool portal loop', () => {
    const show = createSceneSpliceShow()

    expect(show.name).toBe('Scene Splice Showcase')
    expect(show.stageMapId).toBe('plane')
    expect(show.scenes.map((scene) => scene.name)).toEqual([
      'Heat shimmer',
      'Neon circuitry',
      'Heat shimmer return',
    ])
    expect(show.cells.map((cell) => cell.pattern.id)).toEqual([
      'HeatShimmerTiles',
      'NeonCircuitBoard',
      'HeatShimmerTiles',
    ])
    expect(showLoopDurationMs(show)).toBe(16100)
    expect(show.transitions[0]).toMatchObject({
      kind: 'portal',
      revealMode: 'grow-incoming',
      featherPolicy: 'blend',
      centerX: 0.5,
      centerY: 0.5,
    })
    expect(show.transitions[1]).toMatchObject({
      kind: 'portal',
      revealMode: 'shrink-outgoing',
      featherPolicy: 'dither',
      centerX: 0.28,
      centerY: 0.68,
    })
  })

  it('compiles two shared members and two bounded spatial transitions', () => {
    const show = createSceneSpliceShow()
    const compiled = compileShowForPreview(show, [], undefined, {}, { stageDimension: 2 })

    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true })
    expect(compiled.artifact?.summary).toMatchObject({
      clipCount: 2,
      transitionCount: 2,
      renderPolicy: 'spatial-route-bounded-feather',
      transitionCost: 'bounded-renderer-window',
      worstInstantRenderersPerPixel: 2,
    })
    expect(compiled.artifact?.expandedCode).toContain('__pxlblz_show_transition == 0')
    expect(compiled.artifact?.expandedCode).toContain('__pxlblz_show_transition == 1')
  })

  it('exports through the standard Show EPE path with spatial provenance', () => {
    const show = createSceneSpliceShow()
    const compiled = compileShowForPreview(show, [], undefined, {}, { stageDimension: 2 })
    const exported = buildShowEpeExport(show, compiled.artifact!.code, {
      id: 'pxb402SceneSplice',
      preview: '/9j/scene-splice-preview',
      stampedAt: '2026-07-10T22:00:00.000Z',
    })
    const parsed = parseEpe(exported.text)

    expect(exported.filename).toBe('scene-splice-showcase.epe')
    expect(parsed.name).toBe(show.name)
    expect(parsed.src).toContain('Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/')
    expect(parsed.src).toContain('Heat Shimmer Tiles [stock:HeatShimmerTiles]')
    expect(parsed.src).toContain('Neon Circuit Board [stock:NeonCircuitBoard]')
    expect(parsed.src).toContain('portal 3s, center 0.5/0.5, outward, blend feather 0.14')
    expect(parsed.src).toContain('portal 2.6s, center 0.28/0.68, inward, dither feather 0.08')
    expect(parsePxlblzBanner(parsed.src)).toMatchObject({
      kind: 'show',
      id: 'catalog-scene-splice-showcase',
      transforms: ['show', 'spatial-transitions'],
    })
  })

  it('keeps the reviewed Electromage artifact importable', () => {
    const text = readFileSync(resolve('artifacts/electromage/scene-splice-showcase.epe'), 'utf8')
    const envelope = JSON.parse(text) as { preview: string }
    const parsed = parseEpe(text)
    const jpeg = Buffer.from(envelope.preview, 'base64')

    expect(parsed.name).toBe('Scene Splice Showcase')
    expect(parsePxlblzBanner(parsed.src)).toMatchObject({
      kind: 'show',
      id: 'catalog-scene-splice-showcase',
      transforms: ['show', 'spatial-transitions'],
    })
    expect(parsed.src).toContain('// License: ISC')
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    expect(jpeg.length).toBeGreaterThan(1000)
  })
})
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
