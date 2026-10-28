import { defaultControllerProfile } from '@/store/controllerProfileStore'
import { artifactTransformIds, prepareControllerArtifactDelivery } from './controllerArtifactDelivery'
import type { ControllerBindingTarget, ControllerProfile, GlobalTransform } from './controllerProfile'
import { controllerProfilePassRecipe } from './controllerProfilePassRecipe'
import { bundleWithPasses } from './passEngine'
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

  it.each([
    [['binding-sample'], ['binding']],
    [['binding-drive'], ['binding']],
    [['binding-sample', 'binding-drive', 'other', 'binding-sample'], ['binding', 'other']],
  ])('normalizes helper provenance %j in first-seen order', (ids, expected) => {
    expect(artifactTransformIds(ids.map((id) => ({ id, kind: 'bind' })))).toEqual(expected)
  })

  type RecipeCase = { source: string; logicalId: string; profile: () => ControllerProfile }
  const bindingCase = (target: ControllerBindingTarget, signal: 'analog' | 'digital'): RecipeCase => ({
    source: 'export var level = 1; export function sliderLevel(v) { level = v }\n'
      + 'export function setLevel(v) { level = v }\nexport function render(i) { rgb(level, 0, 0) }',
    logicalId: 'level-binding',
    profile: () => ({ ...defaultControllerProfile({ id: 'bench', now: 1 }),
      inputs: [{ id: 'input', name: 'Input', pin: 36, signal, smoothing: 1, fallback: 0.5, invert: false }],
      patternBindings: [{ id: 'level-binding', patternId: 'pat-1', inputId: 'input', target }],
    }),
  })
  const globalCases: Record<GlobalTransform['type'], RecipeCase[]> = {
    'hardware-brightness': ['rgb(0.8, 0.4, 0.2)', 'hsv(0.1, 1, 0.8)'].map((output) => ({
      source: `export function render(i) { ${output} }`, logicalId: 'hardware-brightness', profile: hardwareBrightnessProfile,
    })),
    'power-cap': [{ source, logicalId: 'power-cap', profile: () => {
      const profile = defaultControllerProfile({ id: 'bench', now: 1 })
      profile.globalTransforms = profile.globalTransforms.map((t) => t.type === 'power-cap'
        ? { ...t, enabled: true, maxDuty: 0.25 } : t)
      return profile
    } }],
  }
  const bindingCases: Record<ControllerBindingTarget['kind'], RecipeCase> = {
    'call-exported-slider': bindingCase({ kind: 'call-exported-slider', name: 'sliderLevel' }, 'analog'),
    'call-function': bindingCase({ kind: 'call-function', name: 'setLevel' }, 'digital'),
    'assign-variable': bindingCase({ kind: 'assign-variable', name: 'level', min: 0.2, max: 0.8, quantize: 0.1 }, 'analog'),
  }

  it.each([
    ...Object.entries(globalCases).flatMap(([family, cases]) => cases.map((test, index) => ({ family: `${family}-${index}`, ...test }))),
    ...Object.entries(bindingCases).map(([family, test]) => ({ family, ...test })),
  ])('records every code-changing $family recipe pass, including injected beforeRender', ({ source: input, profile, logicalId }) => {
    const recipe = controllerProfilePassRecipe(profile(), input, 'pat-1')
    const baseline = bundleWithPasses(input, {}, []).code
    let previous = baseline
    for (let index = 0; index < recipe.length; index++) {
      const bundled = bundleWithPasses(input, {}, recipe.slice(0, index + 1))
      if (bundled.code !== previous) {
        const entry = bundled.summary.passes.filter((pass) => pass.id === recipe[index].id)
        expect(entry).toHaveLength(1)
        expect(artifactTransformIds(entry)).toEqual([logicalId])
      }
      previous = bundled.code
    }
    expect(previous).not.toBe(baseline)
    expect(artifactTransformIds(bundleWithPasses(input, {}, recipe).summary.passes)).toEqual([logicalId])
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
