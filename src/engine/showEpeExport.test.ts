import { parseEpe } from './epeImport'
import { parsePxlblzBanner } from './artifactStamp'
import { addShowRoutingLayout, addShowZone, createDefaultShow, createShowWithOutputContract, updateShowBoundaryTransition, updateShowRoutingLayout, updateShowRoutingSwitch, updateShowTransition } from './showModel'
import { buildShowEpeExport } from './showEpeExport'
import { createAdaptivePatternPrismShow } from './patternPrismShow'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import { compileShowForArtifact } from './showPreviewArtifact'

describe('Show EPE export (#399)', () => {
  it('exports the exact compiled Scene composition artifact with instance provenance (#488)', () => {
    const show = createDefaultShow('show-composition-epe', 'Local cuts', 1)
    const patterns = [{
      id: 'private-member',
      name: 'Private member',
      src: 'export function render(index) { rgb(0.2, 0.4, 0.6) }',
      controls: {},
      updatedAt: 1,
    }]
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'private-instance',
        pattern: { kind: 'user', id: 'private-member' },
        patternName: 'Private member',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [
        { sceneId: 'scene-1', zones: [{ zoneId: 'zone-1', main: [{
          id: 'private-placement', instanceId: 'private-instance', startMs: 0, durationMs: 30_000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }], overlays: [] }] },
        { sceneId: 'scene-2', zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] },
      ],
    }
    const compiled = compileShowForArtifact(show, patterns, undefined, {})
    expect(compiled.error).toBeNull()
    const artifact = compiled.artifact!

    const exported = buildShowEpeExport(show, artifact.code, { attribution: artifact.attribution })
    const source = parseEpe(exported.text).src

    expect(source).toContain('- Private member [user:private-member]')
    expect(source).toContain('0.2, 0.4, 0.6')
    expect(source.endsWith(artifact.code)).toBe(true)
  })

  it('credits Pattern authors from structured metadata in exported Show source', () => {
    const show = createDefaultShow('show-credits', 'Credit Roll', 1000)
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'user', id: 'community-pattern' },
      patternName: 'Community Sparkles',
    }
    const patterns = [{
      id: 'community-pattern',
      name: 'Community Sparkles',
      src: '// Author: Jane Pixels <jane@example.test>\nexport function render(index) { rgb(1, 0, 0) }',
      controls: {},
      updatedAt: 1,
    }]

    const compiled = compileShowForArtifact(show, patterns, undefined, {})
    expect(compiled.error).toBeNull()
    const artifact = compiled.artifact!
    const exported = buildShowEpeExport(show, artifact.code, { attribution: artifact.attribution })
    const source = parseEpe(exported.text).src

    expect(source).toContain(' * By: PXLBLZ <pxlblz@whiteroomsoftware.com>')
    expect(source).toContain(' * - Community Sparkles by Jane Pixels <jane@example.test> [user:community-pattern]')
  })

  it('round-trips a stamped generated Show through the standard EPE importer', () => {
    const base = createDefaultShow('show-1', 'Pattern Prism', 1000)
    const withLayout = addShowRoutingLayout(base, 'Quadrants', base.routingLayouts[0].id)
    const show = updateShowRoutingSwitch(withLayout, base.scenes[0].id, withLayout.routingLayouts[1].id)
    const generatedCode = 'export function render(index) { rgb(index, 0, 0) }'

    const exported = buildShowEpeExport(show, generatedCode, {
      id: 'pxb22222222222222',
      preview: '/9j/test-preview',
      stampedAt: '2026-07-10T12:00:00.000Z',
    })
    const envelope = JSON.parse(exported.text)
    const parsed = parseEpe(exported.text)

    expect(exported.filename).toBe('pattern-prism.epe')
    expect(envelope.id).toBe('pxb22222222222222')
    expect(envelope.preview).toBe('/9j/test-preview')
    expect(Object.keys(envelope)).toEqual(['name', 'id', 'sources', 'preview'])
    expect(parsed.name).toBe('Pattern Prism')
    expect(parsePxlblzBanner(parsed.src)).toMatchObject({
      kind: 'show',
      id: 'show-1',
      name: 'Pattern Prism',
      stamped: '2026-07-10T12:00:00.000Z',
    })
    expect(parsed.src).toContain('Compiled PXLBLZ Show: Pattern Prism')
    expect(parsed.src).toContain('Source Patterns:')
    expect(parsed.src).toContain('- TestPattern1D [stock:TestPattern1D]')
    expect(parsed.src).toContain('Routing Layouts: Default -> Quadrants')
    expect(parsed.src).toContain('Scene 1 (30s): crossfade 2s: switch to Quadrants after scene')
    expect(parsed.src).toContain('Generated orchestration follows; member bindings are isolated with collision-safe prefixes.')
    expect(parsed.src).toContain(generatedCode)
  })

  it('makes a safe ASCII filename without changing the Show name in the envelope', () => {
    const show = createDefaultShow('show-2', '  Ribbons / Stars!  ', 1000)
    const exported = buildShowEpeExport(show, 'export function render() {}', {
      stampedAt: '2026-07-10T12:00:00.000Z',
    })

    expect(exported.filename).toBe('ribbons-stars.epe')
    expect(parseEpe(exported.text).name).toBe('Ribbons / Stars!')
  })

  it('explains a progressive routing transfer in exported source', () => {
    const base = addShowRoutingLayout(createDefaultShow('show-403', 'Routing transfer'), 'Alternate')
    const routed = updateShowRoutingSwitch(base, 'scene-1', base.routingLayouts[1].id)
    const transition = routed.transitions?.find((candidate) => candidate.kind === 'routing')
    const show = updateShowBoundaryTransition(routed, transition!.id, {
      durationMs: 2000,
      easing: { curve: 'quadratic', direction: 'in-out' },
      routingDirection: 'reverse',
    })

    const exported = buildShowEpeExport(show, 'export function render() {}')

    expect(parseEpe(exported.text).src).toContain(
      'transfer reverse to Alternate over 2s (ease-in-out) after scene',
    )
  })

  it('explains the selected spatial shape in exported source (#404)', () => {
    const show = updateShowTransition(
      { ...createDefaultShow('show-404', 'Shockwave'), stageMapId: 'plane' },
      'scene-1',
      'portal',
      2000,
      0.1,
      { centerX: 0.4, centerY: 0.6, revealMode: 'grow-incoming', featherPolicy: 'dither', shape: 'ring', scale: 1.2, ringWidth: 0.2 },
    )

    const exported = buildShowEpeExport(show, 'export function render2D() {}')

    expect(parseEpe(exported.text).src).toContain(
      'ring 2s, center 0.4/0.6, scale 1.2, width 0.2, outward, dither feather 0.1',
    )
  })

  it('derives an adaptive preferred stock-map contract into machine and human-readable source (#411)', () => {
    const show = createAdaptivePatternPrismShow()
    const exported = buildShowEpeExport(show, 'export function render2D(index, x, y) {}', {
      stampedAt: '2026-07-12T00:00:00.000Z',
    })

    expect(parsePxlblzBanner(exported.source)).toMatchObject({
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
      compatibility: {
        portability: 'adaptive',
        dimensions: [2],
        mapClasses: ['surface'],
        resolution: 'adaptive',
        exactMap: false,
      },
    })
    expect(exported.source).toContain('Preferred map: Square [stock:plane].')
    expect(exported.source).toContain('Compatibility: adaptive 2D surface maps at adaptive resolution; other compatible maps may change the composition.')
  })

  it('retains adaptive artifact compatibility for a production spatial operator (#507)', () => {
    let show = addShowZone(createShowWithOutputContract(
      'show-507-epe',
      'Adaptive Wave',
      createPortableShowOutputContract({ referenceMapId: 'wide', referencePixelCount: 1536 }),
      1000,
    ), { name: 'alternate', nominalPixelCount: 60 })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: {
        kind: 'wave',
        zoneIds: show.zones.map((zone) => zone.id),
        axis: 'x',
        bands: 6,
        amplitude: 0.25,
        frequency: 2,
        phase: 0.1,
      },
    })

    const exported = buildShowEpeExport(show, 'export function render2D(index, x, y) {}', {
      stampedAt: '2026-07-18T00:00:00.000Z',
    })
    const parsed = parseEpe(exported.text)

    expect(parsed.stamp?.compatibility).toEqual({
      portability: 'adaptive',
      dimensions: [2],
      mapClasses: ['surface'],
      resolution: 'adaptive',
      exactMap: false,
    })
    expect(parsed.stamp?.showOutputContract).toEqual({
      version: 1,
      kind: 'portable-2d',
      dimensions: [2],
      mapClasses: ['surface'],
      resolution: 'variable',
    })
    expect(parsed.src).toContain('Compiled PXLBLZ Show: Adaptive Wave')
  })

  it('exports a custom-map name without leaking its local database id (#411)', () => {
    const show = createShowWithOutputContract(
      'show-custom',
      'Measured installation',
      createInstallationShowOutputContract({ outputMapId: 'local-map-42', pixelCount: 1 }),
    )
    const exported = buildShowEpeExport(show, 'export function render2D(index, x, y) {}', {
      userMaps: [{
        id: 'local-map-42',
        name: 'Measured wall',
        dim: 2,
        generator: 'custom',
        params: {},
        points: [[0, 0]],
        updatedAt: 1,
      }],
      stampedAt: '2026-07-12T00:00:00.000Z',
    })

    expect(parsePxlblzBanner(exported.source)).toMatchObject({
      preferredMap: { kind: 'custom', name: 'Measured wall' },
      compatibility: {
        portability: 'installation-bound',
        dimensions: [2],
        mapClasses: ['custom'],
        resolution: 'fixed',
        exactMap: true,
      },
    })
    expect(exported.source).not.toContain('local-map-42')
    expect(exported.source).toContain('this artifact expects the authored installation/map')
  })

  it('round-trips exact Installation output facts and a map fingerprint (#437)', () => {
    const show = createShowWithOutputContract(
      'show-fixed',
      'Measured wall Show',
      createInstallationShowOutputContract({ outputMapId: 'local-map-42', pixelCount: 4 }),
      1000,
    )
    const exported = buildShowEpeExport(show, 'export function render2D() {}', {
      userMaps: [{
        id: 'local-map-42',
        name: 'Measured wall',
        dim: 2,
        generator: 'custom',
        params: {},
        points: [[0, 0], [1, 0], [0, 1], [1, 1]],
        updatedAt: 1,
      }],
      stampedAt: '2026-07-12T00:00:00.000Z',
    })

    expect(parseEpe(exported.text).stamp?.showOutputContract).toEqual({
      version: 1,
      kind: 'installation',
      pixelCount: 4,
      outputMap: {
        kind: 'custom',
        name: 'Measured wall',
        fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/),
      },
    })
    expect(exported.source).toContain('Output contract: Installation · 4 px fixed · Measured wall')
  })

  it('round-trips Portable compatibility without promoting its reference output (#437)', () => {
    const show = createShowWithOutputContract(
      'show-portable',
      'Portable Show',
      createPortableShowOutputContract({ referenceMapId: 'wide', referencePixelCount: 1536 }),
      1000,
    )
    const exported = buildShowEpeExport(show, 'export function render2D() {}', {
      stampedAt: '2026-07-12T00:00:00.000Z',
    })

    expect(parseEpe(exported.text).stamp?.showOutputContract).toEqual({
      version: 1,
      kind: 'portable-2d',
      dimensions: [2],
      mapClasses: ['surface'],
      resolution: 'variable',
    })
    expect(exported.source).toContain('Output contract: Portable 2D · variable resolution · compatible surface maps')
    expect(exported.source).not.toContain('1536 px fixed')
  })
})
