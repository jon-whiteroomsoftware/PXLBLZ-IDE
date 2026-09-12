import { describe, expect, it } from 'vitest'
import { SHOW_CLIP_APERTURE_SHAPES } from '../showClipViewport'
import { showOverlayLayerFixture } from '../../test/showOverlayLayerFixture'
import { showSplitClipFixture } from '../../test/showSplitClipFixture'
import { applyShowCommand, runShowCommandTransaction } from './registry'

function expectAccepted(command: string, input: Record<string, unknown>) {
  const outcome = applyShowCommand(showOverlayLayerFixture(), command, { clip_id: 'clip-a', ...input })
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  return outcome
}

function expectRefused(command: string, input: Record<string, unknown>) {
  const show = showOverlayLayerFixture()
  const before = structuredClone(show)
  const outcome = applyShowCommand(show, command, { clip_id: 'clip-a', ...input })
  expect(outcome.ok, JSON.stringify(outcome)).toBe(false)
  expect(show).toEqual(before)
  return outcome
}

describe('Clip inspector commands', () => {
  it('sets opacity on a later divergent segment when the first already matches', () => {
    const show = showSplitClipFixture()
    const [firstScene] = show.composition!.scenes
    firstScene.zones[0].main.find(placement => placement.id === 'clip-b')!.opacity = 0.4
    const before = structuredClone(show)

    const outcome = applyShowCommand(show, 'set_clip_opacity', {
      clip_id: 'clip-b',
      opacity: 0.4,
    })

    expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record).not.toBe(show)
    expect(firstScene.zones[0].main.find(placement => placement.id === 'clip-b')!.opacity).toBe(0.4)
    expect(outcome.record.composition!.scenes[0].zones[0].main.find(placement => placement.id === 'clip-b')!.opacity).toBe(0.4)
    expect(outcome.record.composition!.scenes[1].zones[0].main.find(placement => placement.logicalClipId === 'clip-b')!.opacity).toBe(0.4)
    expect(outcome.changes).toMatchObject([{
      command: 'set_clip_opacity',
      targetId: 'clip-b',
      details: {
        patch: { opacity: 0.4 },
        changedPlacements: [{
          sceneId: 'scene-2',
          placementId: 'clip-b--span-scene-2',
          properties: { opacity: { before: 1, after: 0.4 } },
        }],
      },
    }])
    expect(show).toEqual(before)
  })

  it('merges a partial Content Transform into each segment independently', () => {
    const show = showSplitClipFixture()
    const first = show.composition!.scenes[0].zones[0].main.find(placement => placement.id === 'clip-b')!
    const second = show.composition!.scenes[1].zones[0].main.find(placement => placement.logicalClipId === 'clip-b')!
    first.transform = { positionX: 0.25, positionY: 0, rotation: 0, scaleX: 0.5, scaleY: 1 }
    second.transform = { positionX: -0.25, positionY: 0, rotation: 0, scaleX: 2, scaleY: 1 }
    const before = structuredClone(show)

    const outcome = applyShowCommand(show, 'set_clip_transform', {
      clip_id: 'clip-b',
      position_y: 0.5,
      rotation: 0.25,
    })

    expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
    if (!outcome.ok) return
    const [changedFirst, changedSecond] = outcome.record.composition!.scenes.map(scene => (
      scene.zones[0].main.find(placement => (placement.logicalClipId ?? placement.id) === 'clip-b')!
    ))
    expect(changedFirst.transform).toEqual({ positionX: 0.25, positionY: 0.5, rotation: 0.25, scaleX: 0.5, scaleY: 1 })
    expect(changedSecond.transform).toEqual({ positionX: -0.25, positionY: 0.5, rotation: 0.25, scaleX: 2, scaleY: 1 })
    expect(outcome.changes[0].details).toMatchObject({
      patch: { position_y: 0.5, rotation: 0.25 },
      changedPlacements: [
        {
          sceneId: 'scene-1', placementId: 'clip-b',
          properties: { positionY: { before: 0, after: 0.5 }, rotation: { before: 0, after: 0.25 } },
        },
        {
          sceneId: 'scene-2', placementId: 'clip-b--span-scene-2',
          properties: { positionY: { before: 0, after: 0.5 }, rotation: { before: 0, after: 0.25 } },
        },
      ],
    })
    expect(show).toEqual(before)
  })

  it('retains animation tracks and reports only requested animated Transform properties', () => {
    const show = showSplitClipFixture()
    show.composition!.scenes[0].propertyTracks!.push({
      id: 'transform-first',
      target: { kind: 'placement-transform', placementId: 'clip-b', property: 'positionX' },
      keyframes: [
        { id: 'transform-first-a', timeMs: 12_000, value: 0, easing: { curve: 'linear' } },
        { id: 'transform-first-b', timeMs: 20_000, value: 1, easing: { curve: 'linear' } },
      ],
    }, {
      id: 'unrequested-viewport',
      target: { kind: 'placement-viewport', placementId: 'clip-b', property: 'x' },
      keyframes: [
        { id: 'unrequested-viewport-a', timeMs: 12_000, value: 0, easing: { curve: 'linear' } },
        { id: 'unrequested-viewport-b', timeMs: 20_000, value: 1, easing: { curve: 'linear' } },
      ],
    })
    show.composition!.scenes[1].propertyTracks!.push({
      id: 'transform-second',
      target: { kind: 'placement-transform', placementId: 'clip-b--span-scene-2', property: 'positionX' },
      keyframes: [
        { id: 'transform-second-a', timeMs: 0, value: -1, easing: { curve: 'linear' } },
        { id: 'transform-second-b', timeMs: 6_000, value: 1, easing: { curve: 'linear' } },
      ],
    })
    const tracks = structuredClone(show.composition!.scenes.map(scene => scene.propertyTracks))

    const outcome = applyShowCommand(show, 'set_clip_transform', {
      clip_id: 'clip-b',
      position_x: 0.25,
      scale_y: 2,
    })

    expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.composition!.scenes.map(scene => scene.propertyTracks)).toEqual(tracks)
    expect(outcome.changes[0].details?.animatedProperties).toEqual([
      { sceneId: 'scene-1', placementId: 'clip-b', trackId: 'transform-first', property: 'positionX' },
      { sceneId: 'scene-2', placementId: 'clip-b--span-scene-2', trackId: 'transform-second', property: 'positionX' },
    ])
  })

  it('authors an Aperture frame and drops obsolete shape-owned fields per segment', () => {
    const show = showSplitClipFixture()
    const first = show.composition!.scenes[0].zones[0].main.find(placement => placement.id === 'clip-b')!
    const second = show.composition!.scenes[1].zones[0].main.find(placement => placement.logicalClipId === 'clip-b')!
    first.viewport = { enabled: false, x: 0, y: 0.1, width: 1, height: 1, aperture: 'ring', edge: 'hard', feather: 0.2, ringWidth: 0.4 }
    second.viewport = { enabled: false, x: -0.25, y: 0.2, width: 1, height: 0.75, aperture: 'ring', edge: 'dither', feather: 0.3, ringWidth: 0.7, invert: true }
    const before = structuredClone(show)

    const outcome = applyShowCommand(show, 'set_clip_aperture', {
      clip_id: 'clip-b',
      enabled: true,
      x: 0.5,
      width: 0.5,
      aperture: 'ellipse',
      edge: 'soft',
      feather: null,
    })

    expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
    if (!outcome.ok) return
    const [changedFirst, changedSecond] = outcome.record.composition!.scenes.map(scene => (
      scene.zones[0].main.find(placement => (placement.logicalClipId ?? placement.id) === 'clip-b')!
    ))
    expect(changedFirst.viewport).toEqual({ enabled: true, x: 0.5, y: 0.1, width: 0.5, height: 1, aperture: 'ellipse', edge: 'soft' })
    expect(changedSecond.viewport).toEqual({ enabled: true, x: 0.5, y: 0.2, width: 0.5, height: 0.75, aperture: 'ellipse', edge: 'soft', invert: true })
    expect(outcome.changes[0].details).toMatchObject({
      changedPlacements: [
        { sceneId: 'scene-1', placementId: 'clip-b', properties: { aperture: { before: 'ring', after: 'ellipse' }, ringWidth: { before: 0.4, after: null } } },
        { sceneId: 'scene-2', placementId: 'clip-b--span-scene-2', properties: { aperture: { before: 'ring', after: 'ellipse' }, ringWidth: { before: 0.7, after: null } } },
      ],
    })
    expect(show).toEqual(before)
  })

  const numericDomains = [
    { command: 'set_clip_opacity', field: 'opacity', min: 0, max: 1 },
    { command: 'set_clip_transform', field: 'position_x', min: -4, max: 4 },
    { command: 'set_clip_transform', field: 'position_y', min: -4, max: 4 },
    { command: 'set_clip_transform', field: 'rotation', min: -8, max: 8 },
    { command: 'set_clip_transform', field: 'scale_x', min: 0.01, max: 8 },
    { command: 'set_clip_transform', field: 'scale_y', min: 0.01, max: 8 },
    { command: 'set_clip_aperture', field: 'x', min: -4, max: 4 },
    { command: 'set_clip_aperture', field: 'y', min: -4, max: 4 },
    { command: 'set_clip_aperture', field: 'width', min: 0.01, max: 8 },
    { command: 'set_clip_aperture', field: 'height', min: 0.01, max: 8 },
    { command: 'set_clip_aperture', field: 'feather', min: 0.001, max: 1 },
    { command: 'set_clip_aperture', field: 'rotation', min: -1, max: 1 },
    { command: 'set_clip_aperture', field: 'ring_width', min: 0.05, max: 1, shape: 'ring' },
    { command: 'set_clip_aperture', field: 'corner_radius', min: 0.05, max: 1, shape: 'rounded-box' },
    { command: 'set_clip_aperture', field: 'cross_width', min: 0.1, max: 0.9, shape: 'cross' },
    { command: 'set_clip_aperture', field: 'star_points', min: 3, max: 12, shape: 'star' },
    { command: 'set_clip_aperture', field: 'star_inner', min: 0.2, max: 0.8, shape: 'star' },
    { command: 'set_clip_aperture', field: 'crescent_offset', min: 0.15, max: 0.8, shape: 'crescent' },
    { command: 'set_clip_aperture', field: 'polygon_sides', min: 3, max: 8, shape: 'polygon' },
  ] as const

  it.each(numericDomains)('$command accepts $field boundaries and refuses values outside them', (domain) => {
    const { command, field, min, max } = domain
    const shape = 'shape' in domain ? domain.shape : undefined
    const base = shape ? { aperture: shape } : {}
    for (const value of [min, max]) expectAccepted(command, { ...base, [field]: value })
    const outsideStep = field === 'star_points' || field === 'polygon_sides' ? 1 : 0.001
    for (const value of [min - outsideStep, max + outsideStep]) {
      const refused = expectRefused(command, { ...base, [field]: value })
      expect(refused).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument', message: expect.stringContaining(`${min}–${max}`) }] })
    }
  })

  it.each([
    ['set_clip_opacity', { opacity: null }],
    ['set_clip_opacity', { opacity: '0.5' }],
    ['set_clip_opacity', { opacity: Number.NaN }],
    ['set_clip_transform', { position_x: null }],
    ['set_clip_transform', { scale_y: Number.POSITIVE_INFINITY }],
    ['set_clip_aperture', { x: null }],
    ['set_clip_aperture', { aperture: 'circle' }],
    ['set_clip_aperture', { star_points: 4.5, aperture: 'star' }],
    ['set_clip_aperture', { polygon_sides: Number.NEGATIVE_INFINITY, aperture: 'polygon' }],
  ] as const)('%s refuses malformed canonical input %#', (command, input) => {
    expectRefused(command, input as Record<string, unknown>)
  })

  it('refuses empty patches and unknown fields', () => {
    expectRefused('set_clip_transform', {})
    expectRefused('set_clip_aperture', {})
    expectRefused('set_clip_transform', { position_x: 0.5, extra: true })
    expectRefused('set_clip_aperture', { enabled: true, extra: true })
    expectRefused('set_clip_opacity', { opacity: 0.5, extra: true })
  })

  it.each(SHOW_CLIP_APERTURE_SHAPES)('authors the supported %s Aperture silhouette', (aperture) => {
    const outcome = expectAccepted('set_clip_aperture', { enabled: true, aperture })
    if (!outcome.ok) return
    const viewport = outcome.record.composition!.scenes[0].zones[0].main[0].viewport
    expect(viewport).toMatchObject({ enabled: true, x: 0, y: 0, width: 1, height: 1 })
    expect(viewport?.aperture).toBe(aperture === 'rectangle' ? undefined : aperture)
  })

  it.each([
    { shape: 'ring', field: 'ring_width', stored: 'ringWidth', value: 0.4 },
    { shape: 'rounded-box', field: 'corner_radius', stored: 'cornerRadius', value: 0.4 },
    { shape: 'cross', field: 'cross_width', stored: 'crossWidth', value: 0.4 },
    { shape: 'star', field: 'star_points', stored: 'starPoints', value: 7 },
    { shape: 'star', field: 'star_inner', stored: 'starInner', value: 0.4 },
    { shape: 'crescent', field: 'crescent_offset', stored: 'crescentOffset', value: 0.4 },
    { shape: 'polygon', field: 'polygon_sides', stored: 'polygonSides', value: 7 },
  ] as const)('sets and clears $shape $field without widening its shape domain', ({ shape, field, stored, value }) => {
    const set = expectAccepted('set_clip_aperture', { aperture: shape, [field]: value })
    if (!set.ok) return
    const placement = set.record.composition!.scenes[0].zones[0].main[0]
    expect(placement.viewport?.[stored]).toBe(value)
    const cleared = applyShowCommand(set.record, 'set_clip_aperture', { clip_id: 'clip-a', [field]: null })
    expect(cleared.ok, JSON.stringify(cleared)).toBe(true)
    if (!cleared.ok) return
    expect(cleared.record.composition!.scenes[0].zones[0].main[0].viewport?.[stored]).toBeUndefined()
    const wrongShape = shape === 'ring' ? 'ellipse' : 'ring'
    expectRefused('set_clip_aperture', { aperture: wrongShape, [field]: null })
  })

  it('drops a Ring override across ring→ellipse→ring instead of reviving stale shape state', () => {
    const ring = expectAccepted('set_clip_aperture', { aperture: 'ring', ring_width: 0.7 })
    if (!ring.ok) return
    const ellipse = applyShowCommand(ring.record, 'set_clip_aperture', { clip_id: 'clip-a', aperture: 'ellipse' })
    expect(ellipse.ok).toBe(true)
    if (!ellipse.ok) return
    expect(ellipse.record.composition!.scenes[0].zones[0].main[0].viewport?.ringWidth).toBeUndefined()
    const ringAgain = applyShowCommand(ellipse.record, 'set_clip_aperture', { clip_id: 'clip-a', aperture: 'ring' })
    expect(ringAgain.ok).toBe(true)
    if (!ringAgain.ok) return
    expect(ringAgain.record.composition!.scenes[0].zones[0].main[0].viewport).toMatchObject({ aperture: 'ring' })
    expect(ringAgain.record.composition!.scenes[0].zones[0].main[0].viewport?.ringWidth).toBeUndefined()
  })

  it('keeps rotation 1 and 0 as distinct authored poses even though they render one full turn apart', () => {
    const fullTurn = expectAccepted('set_clip_transform', { rotation: 1 })
    if (!fullTurn.ok) return
    expect(fullTurn.record.composition!.scenes[0].zones[0].main[0].transform?.rotation).toBe(1)
    const zero = applyShowCommand(fullTurn.record, 'set_clip_transform', { clip_id: 'clip-a', rotation: 0 })
    expect(zero.ok).toBe(true)
    if (!zero.ok) return
    expect(zero.record.composition!.scenes[0].zones[0].main[0].transform).toBeUndefined()
    expect(zero.record.updatedAt).toBeGreaterThan(fullTurn.record.updatedAt)
  })

  it('retains disabled styling and supports explicit authored-default clearing', () => {
    const show = showOverlayLayerFixture()
    const styled = applyShowCommand(show, 'set_clip_aperture', {
      clip_id: 'clip-a', enabled: true, aperture: 'star', edge: 'soft', feather: 0.2,
      rotation: 0.25, invert: true, star_points: 7, star_inner: 0.4,
    })
    expect(styled.ok).toBe(true)
    if (!styled.ok) return
    const disabled = applyShowCommand(styled.record, 'set_clip_aperture', { clip_id: 'clip-a', enabled: false })
    expect(disabled.ok).toBe(true)
    if (!disabled.ok) return
    expect(disabled.record.composition!.scenes[0].zones[0].main[0].viewport).toMatchObject({
      enabled: false, aperture: 'star', edge: 'soft', feather: 0.2,
      rotation: 0.25, invert: true, starPoints: 7, starInner: 0.4,
    })
    const enabled = applyShowCommand(disabled.record, 'set_clip_aperture', { clip_id: 'clip-a', enabled: true })
    expect(enabled.ok).toBe(true)
    if (!enabled.ok) return
    const cleared = applyShowCommand(enabled.record, 'set_clip_aperture', {
      clip_id: 'clip-a', edge: null, feather: null, rotation: 0, invert: false,
    })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.record.composition!.scenes[0].zones[0].main[0].viewport).toEqual({
      enabled: true, x: 0, y: 0, width: 1, height: 1, aperture: 'star', starPoints: 7, starInner: 0.4,
    })
    expect(cleared.changes[0].details?.changedPlacements).toMatchObject([{
      properties: { edge: { before: 'soft', after: null }, feather: { before: 0.2, after: null } },
    }])
  })

  it('validates incompatible shape parameters atomically before applying another field', () => {
    const show = showOverlayLayerFixture()
    const before = structuredClone(show)
    const outcome = applyShowCommand(show, 'set_clip_aperture', {
      clip_id: 'clip-a', x: 0.5, aperture: 'ellipse', ring_width: 0.4,
    })
    expect(outcome).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument', message: expect.stringContaining('ring') }] })
    expect(show).toEqual(before)
  })

  it('accepts compact no-ops only after validating target ownership', () => {
    const show = showOverlayLayerFixture()
    const noops = [
      ['set_clip_opacity', { opacity: 1 }],
      ['set_clip_transform', { position_x: 0, position_y: 0, rotation: 0, scale_x: 1, scale_y: 1 }],
      ['set_clip_aperture', { enabled: false, x: 0, y: 0, width: 1, height: 1, aperture: 'rectangle', edge: null, feather: null, rotation: 0, invert: false }],
    ] as const
    for (const [command, input] of noops) {
      expect(applyShowCommand(show, command, { clip_id: 'clip-a', ...input })).toEqual({ ok: true, record: show, changes: [] })
      expect(applyShowCommand(show, command, { clip_id: 'missing', ...input }).ok).toBe(false)
      expect(applyShowCommand(show, command, { clip_id: 'group-use:group-main', ...input }).ok).toBe(false)
    }
  })

  it('refuses invalid logical ownership and unrelated presentation drift', () => {
    const ownership = showSplitClipFixture()
    ownership.composition!.scenes[1].zones[0].main.find(placement => placement.logicalClipId === 'clip-b')!.instanceId = 'instance-ov'
    expect(applyShowCommand(ownership, 'set_clip_opacity', { clip_id: 'clip-b', opacity: 0.4 }).ok).toBe(false)

    const viewDrift = showSplitClipFixture()
    viewDrift.composition!.scenes[1].zones[0].main.find(placement => placement.logicalClipId === 'clip-b')!.view.brightness = 0.5
    expect(applyShowCommand(viewDrift, 'set_clip_transform', { clip_id: 'clip-b', position_x: 0.25 }).ok).toBe(false)

    const effectDrift = showSplitClipFixture()
    effectDrift.composition!.scenes[1].zones[0].main.find(placement => placement.logicalClipId === 'clip-b')!.effects = [{ id: 'brightness', kind: 'brightness', brightness: 0.5 }]
    expect(applyShowCommand(effectDrift, 'set_clip_aperture', { clip_id: 'clip-b', enabled: true }).ok).toBe(false)
  })

  it('compacts neutral Transform values without erasing existing animation', () => {
    const show = showOverlayLayerFixture()
    const placement = show.composition!.scenes[0].zones[0].main[0]
    placement.transform = { positionX: 0.25, positionY: -0.5, rotation: 1, scaleX: 0.5, scaleY: 2 }
    show.composition!.scenes[0].propertyTracks!.push({
      id: 'rotation-track', target: { kind: 'placement-transform', placementId: 'clip-a', property: 'rotation' },
      keyframes: [
        { id: 'rotation-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
        { id: 'rotation-b', timeMs: 10_000, value: 1, easing: { curve: 'linear' } },
      ],
    })
    const tracks = structuredClone(show.composition!.scenes[0].propertyTracks)
    const outcome = applyShowCommand(show, 'set_clip_transform', {
      clip_id: 'clip-a', position_x: 0, position_y: 0, rotation: 0, scale_x: 1, scale_y: 1,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.composition!.scenes[0].zones[0].main[0].transform).toBeUndefined()
    expect(outcome.record.composition!.scenes[0].propertyTracks).toEqual(tracks)
    expect(outcome.changes[0].details?.animatedProperties).toContainEqual({
      sceneId: 'scene-1', placementId: 'clip-a', trackId: 'rotation-track', property: 'rotation',
    })
  })

  it('runs mixed setters atomically with changed and no-op steps', () => {
    const show = showOverlayLayerFixture()
    const accepted = runShowCommandTransaction(show, [
      { name: 'set_clip_opacity', input: { clip_id: 'clip-a', opacity: 0.4 } },
      { name: 'set_clip_transform', input: { clip_id: 'clip-a', position_x: 0.25, scale_x: 0.5 } },
      { name: 'set_clip_opacity', input: { clip_id: 'clip-a', opacity: 0.4 } },
      { name: 'set_clip_aperture', input: { clip_id: 'clip-a', enabled: true, x: 0.5, width: 0.5, aperture: 'ellipse' } },
    ])
    expect(accepted.ok, JSON.stringify(accepted)).toBe(true)
    if (!accepted.ok) return
    expect(accepted.changes.map(change => change.command)).toEqual(['set_clip_opacity', 'set_clip_transform', 'set_clip_aperture'])

    const refused = runShowCommandTransaction(show, [
      { name: 'set_clip_opacity', input: { clip_id: 'clip-a', opacity: 0.4 } },
      { name: 'set_clip_aperture', input: { clip_id: 'clip-a', x: 0.5, aperture: 'ellipse', ring_width: 0.4 } },
    ])
    expect(refused).toMatchObject({ ok: false, step: 1 })
    expect(show.composition!.scenes[0].zones[0].main[0].opacity).toBeUndefined()

    expect(runShowCommandTransaction(show, [
      { name: 'set_clip_opacity', input: { clip_id: 'clip-a', opacity: 1 } },
      { name: 'set_clip_transform', input: { clip_id: 'clip-a', position_x: 0 } },
    ])).toEqual({ ok: true, record: show, changes: [] })
  })
})
