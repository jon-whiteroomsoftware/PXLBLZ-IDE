import { defaultControllerProfile } from '@/store/controllerProfileStore'
import { prepareControllerArtifactDelivery } from './controllerArtifactDelivery'
import { loadPattern } from './loadPattern'
import { createPlaneMap } from './maps'
import { createShim } from './shim'
import { compileShow } from './showCompiler'

function hardwareBrightnessProfile() {
  const profile = defaultControllerProfile({ id: 'bench', now: 1 })
  profile.inputs = [{
    id: 'brightness-pot',
    name: 'Brightness pot',
    pin: 36,
    signal: 'analog',
    smoothing: 1,
    fallback: 0.5,
    invert: false,
  }]
  profile.globalTransforms = profile.globalTransforms.map((transform) => (
    transform.type === 'hardware-brightness'
      ? { ...transform, enabled: true, inputId: 'brightness-pot' }
      : transform
  ))
  return profile
}

function loadBrightnessDelivery(
  source: string,
  artifactId: string,
  dimensions: 1 | 2 | 3 = 1,
  pixelCount = 1,
) {
  const delivery = prepareControllerArtifactDelivery({
    source,
    profile: hardwareBrightnessProfile(),
    artifactId,
  })
  const shim = createShim({
    mapPoints: createPlaneMap({ rows: 1, cols: pixelCount }).resolve(pixelCount),
    pixelCount,
    dimensions,
    getVirtualTime: () => 0,
  })
  const pattern = loadPattern(delivery.source, delivery.bundled!.metadata, {
    ...shim.builtins,
    analogRead: () => 0.5,
  })
  pattern.beforeRender(16)
  return { delivery, pattern, shim }
}

describe('Controller artifact delivery derivatives (#849)', () => {
  const source = 'export function render(index) { hsv(index, 1, 1) }'

  it('records only applied Wrappers and preserves legacy delivery for a complete skip or a Show', () => {
    const legacy = hardwareBrightnessProfile()
    const profile = {
      ...legacy,
      globalTransforms: [
        ...legacy.globalTransforms,
        { id: 'slow-mo', type: 'slow-mo', enabled: true },
        { id: 'dreamy', type: 'dreamy', enabled: true },
      ] satisfies typeof legacy.globalTransforms,
    }
    const prepare = (pattern = source, pixelCount = 64, artifactId = 'pattern') =>
      prepareControllerArtifactDelivery({ source: pattern, profile, pixelCount, artifactId })

    const both = prepare()
    expect(both.wrapperOutcome?.applied).toEqual(['slow-mo', 'dreamy'])
    expect(both.source).toContain('export function sliderSlowMo')
    expect(both.source).toContain('export function sliderDreamy')
    const clash = prepare(`export function sliderSlowMo(v) {}\n${source}`)
    expect(clash.wrapperOutcome).toMatchObject({
      applied: ['dreamy'],
      skipped: { 'slow-mo': { reason: 'control-name-taken' } },
    })
    expect(clash.source.match(/export function sliderSlowMo/g)).toHaveLength(1)
    expect(clash.profileSignature).not.toBe(both.profileSignature)

    expect(prepare(source, 1703).wrapperOutcome).toMatchObject({
      applied: ['dreamy'],
      skipped: { 'slow-mo': { reason: 'array-budget', freeWords: 10240, neededWords: 10242 } },
    })
    const none = prepare(source, 3410)
    const plain = prepareControllerArtifactDelivery({ source, profile: legacy, artifactId: 'pattern' })
    expect(none.wrapperOutcome?.applied).toEqual([])
    expect(none.wrapperOutcome?.skipped).toMatchObject({
      'slow-mo': { reason: 'array-budget' },
      dreamy: { reason: 'array-budget' },
    })
    expect(none.source).toBe(plain.source)
    expect(none.profileSignature).toBe(plain.profileSignature)
    const show = prepare(source, 64, 'show:example')
    expect(show).toEqual(prepareControllerArtifactDelivery({ source, profile: legacy, artifactId: 'show:example' }))
    expect(show.wrapperOutcome).toBeUndefined()
  })

  it('captures an authored binding before Dreamy and applies Brightness immediately to its history', () => {
    const profile = hardwareBrightnessProfile()
    profile.inputs.push({ ...profile.inputs[0], id: 'pattern-pot', pin: 39 })
    profile.patternBindings.push({
      id: 'pattern-pot-binding',
      patternId: 'pattern',
      inputId: 'pattern-pot',
      target: { kind: 'call-exported-slider', name: 'sliderWash' },
    })
    profile.globalTransforms.push({ id: 'dreamy', type: 'dreamy', enabled: true })
    const delivery = prepareControllerArtifactDelivery({
      artifactId: 'pattern', profile, pixelCount: 1,
      source: 'var wash = 0\nexport function sliderWash(v) { wash = v }\nexport function render(i) { rgb(wash, 0, 0) }',
    })
    const shim = createShim({
      mapPoints: createPlaneMap({ rows: 1, cols: 1 }).resolve(1),
      pixelCount: 1, dimensions: 1, getVirtualTime: () => 0,
    })
    let brightness = 1
    let wash = 0.8
    const pattern = loadPattern(delivery.source, delivery.bundled!.metadata, {
      ...shim.builtins,
      analogRead: (pin: number) => pin === 36 ? brightness : wash,
    })
    pattern.controls.sliderDreamy(1)
    const red = () => {
      pattern.beforeRender(16)
      pattern.render(0)
      return shim.capturedPixel()[0]
    }
    expect(red()).toBeCloseTo(0.8)
    wash = 0
    brightness = 0.25
    expect(red()).toBeCloseTo(0.8 * Math.exp(-16 / 10000) * 0.25)
  })

  it.each([undefined, 0, 0.5, 1])('runs the existing power cap on delivered output at amount %s', (amount) => {
    const profile = defaultControllerProfile({ id: 'bench', now: 1 })
    profile.globalTransforms = profile.globalTransforms.map((transform) =>
      transform.type === 'power-cap' ? { ...transform, enabled: true, maxDuty: 0.25 } : transform,
    )
    if (amount !== undefined) {
      profile.globalTransforms.push(
        { id: 'slow-mo', type: 'slow-mo', enabled: true },
        { id: 'dreamy', type: 'dreamy', enabled: true },
      )
    }
    const delivery = prepareControllerArtifactDelivery({
      artifactId: 'pattern', profile, pixelCount: 2,
      source: 'export function render(i) { if (i == 0) rgb(1,1,1); else hsv(0,0,1) }',
    })
    const shim = createShim({
      mapPoints: createPlaneMap({ rows: 1, cols: 2 }).resolve(2),
      pixelCount: 2, dimensions: 1, getVirtualTime: () => 0,
    })
    const pattern = loadPattern(delivery.source, delivery.bundled!.metadata, shim.builtins)
    if (amount !== undefined) {
      pattern.controls.sliderSlowMo(amount)
      pattern.controls.sliderDreamy(amount)
    }
    const frames = Array.from({ length: 5 }, () => {
      pattern.beforeRender(16)
      return [0, 1].map((index) => {
        pattern.render(index)
        return shim.capturedPixel()
      })
    })
    // The existing cap measures the preceding frame before it scales output.
    expect(frames[0]).toEqual([[1, 1, 1], [1, 1, 1]])
    for (const frame of frames.slice(1)) expect(frame).toEqual([[0.25, 0.25, 0.25], [0.25, 0.25, 0.25]])
  })

  it('adds only active Controller profile transforms', () => {
    const profile = defaultControllerProfile({ id: 'bench', now: 1 })
    expect(prepareControllerArtifactDelivery({
      source,
      profile,
      artifactId: 'show:quadrille',
    })).toMatchObject({ source, transformIds: [] })

    profile.globalTransforms = profile.globalTransforms.map((transform) => (
      transform.type === 'power-cap' ? { ...transform, enabled: true, maxDuty: 0.25 } : transform
    ))
    const transformed = prepareControllerArtifactDelivery({
      source,
      profile,
      artifactId: 'show:quadrille',
    })
    expect(transformed.source).toContain('__px_cappedHsv')
    expect(transformed.transformIds).toEqual(['power-cap'])
    expect(new TextEncoder().encode(transformed.source).length).toBeGreaterThan(
      new TextEncoder().encode(source).length,
    )
  })

  it('scales RGB Pattern output with the assigned hardware brightness input (#850)', () => {
    const { delivery, pattern, shim } = loadBrightnessDelivery(
      'export function render(index) { rgb(0.8, 0.4, 0.2) }',
      'rgb-pattern',
    )

    pattern.render(0)

    expect(shim.capturedPixel()).toEqual([0.4, 0.2, 0.1])
    expect(delivery.bundled?.summary.callSitesWrapped).toEqual({ rgb: 1 })
    expect(delivery.bundled?.warnings).toEqual([])
  })

  it('scales both output color systems in a mixed Pattern (#850)', () => {
    const { delivery, pattern, shim } = loadBrightnessDelivery(
      [
        'export function render(index) {',
        '  if (index == 0) rgb(0.8, 0.4, 0.2)',
        '  else hsv(0, 1, 0.8)',
        '}',
      ].join('\n'),
      'mixed-pattern',
      1,
      2,
    )

    pattern.render(0)
    expect(shim.capturedPixel()).toEqual([0.4, 0.2, 0.1])
    pattern.render(1)
    expect(shim.capturedPixel()).toEqual([0.4, 0, 0])
    expect(delivery.bundled?.summary.callSitesWrapped).toEqual({ rgb: 1, hsv: 1 })
    expect(delivery.bundled?.warnings).toEqual([])
  })

  it('scales compiled Show RGB output with the assigned hardware brightness input (#850)', () => {
    const show = compileShow({
      clips: [{
        id: 'rgb-clip',
        source: 'export function render2D(index, x, y) { rgb(0.8, 0.4, 0.2) }',
      }],
      routingLayouts: [{
        id: 'single-zone',
        name: 'Single zone',
        zones: [],
        logical: { kind: 'single', zoneNames: ['main'] },
      }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1_000,
            placements: [{ zoneName: 'main', clipId: 'rgb-clip' }],
          },
          {
            holdMs: 1_000,
            placements: [{ zoneName: 'main', clipId: 'rgb-clip' }],
          },
        ],
      },
      loopDurationMs: 2_000,
    }, {})
    const { delivery, pattern, shim } = loadBrightnessDelivery(
      show.code,
      'show:rgb-show',
      2,
    )

    pattern.render2D(0, 0.5, 0.5)

    expect(shim.capturedPixel()).toEqual([0.4, 0.2, 0.1])
    expect(delivery.bundled?.summary.callSitesWrapped.rgb).toBeGreaterThan(0)
    expect(delivery.bundled?.warnings).not.toContainEqual(expect.objectContaining({
      passId: 'hardware-brightness',
      code: 'no-call-sites',
    }))
  })
})
