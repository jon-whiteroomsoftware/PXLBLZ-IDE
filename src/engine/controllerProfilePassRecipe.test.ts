import { defaultControllerProfile } from '@/store/controllerProfileStore'
import {
  controllerProfileArtifactSignature,
  controllerProfileReconciliationSignature,
  controllerProfilePassRecipe,
  findProfileForLiveController,
  normalizeStoredArtifactSignature,
} from './controllerProfilePassRecipe'
import type { ControllerProfile } from './controllerProfile'
import {
  LEGACY_ARTIFACT_SIGNATURE_WITH_ROLE,
  LEGACY_SIGNATURE_MAP_DIM,
  LEGACY_SIGNATURE_PATTERN_ID,
  legacySignatureProfile,
} from './controllerLegacySignatureTestFixture'

describe('controller profile pass recipe', () => {
  it('matches a live controller by stable device id before last-seen IP', () => {
    const byIp = defaultControllerProfile({ id: 'ip', ip: '10.0.0.5' })
    const byDevice = defaultControllerProfile({
      id: 'device',
      deviceId: 'pixelblaze_pb32_known',
      ip: '10.0.0.9',
    })

    expect(findProfileForLiveController([byIp, byDevice], {
      ip: '10.0.0.5',
      deviceId: 'pixelblaze_pb32_known',
    })?.id).toBe('device')
  })

  it('returns no passes without enabled global transforms', () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1' })

    expect(controllerProfilePassRecipe(profile, 'export function render(i){}')).toEqual([])
  })

  it('signs generated-code configuration but ignores descriptive profile edits', () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const renamed = { ...profile, name: 'Renamed', updatedAt: 2 }
    const enabled = {
      ...renamed,
      globalTransforms: renamed.globalTransforms.map((transform) =>
        transform.type === 'power-cap' ? { ...transform, enabled: true } : transform,
      ),
    }

    expect(controllerProfileArtifactSignature(renamed, 'pat-1')).toBe(
      controllerProfileArtifactSignature(profile, 'pat-1'),
    )
    expect(controllerProfileArtifactSignature(enabled, 'pat-1')).not.toBe(
      controllerProfileArtifactSignature(profile, 'pat-1'),
    )
  })

  it('signs every profile field that can require managed Patterns to be regenerated', () => {
    const profile = patternBindingProfile()
    const renamed = { ...profile, name: 'Renamed', updatedAt: profile.updatedAt + 1 }
    const rebound = {
      ...renamed,
      patternBindings: renamed.patternBindings.map((binding) => ({
        ...binding,
        target: { kind: 'call-function' as const, name: 'setDifferentSpeed' },
      })),
    }

    expect(controllerProfileReconciliationSignature(renamed)).toBe(
      controllerProfileReconciliationSignature(profile),
    )
    expect(controllerProfileReconciliationSignature(rebound)).not.toBe(
      controllerProfileReconciliationSignature(profile),
    )
  })

  it('includes the live Controller map dimension in the generated-artifact signature', () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', now: 1 })

    expect(controllerProfileArtifactSignature(profile, 'pat-1', { mapDim: 2 })).not.toBe(
      controllerProfileArtifactSignature(profile, 'pat-1', { mapDim: 3 }),
    )
    expect(controllerProfileArtifactSignature(null, 'pat-1', { mapDim: 2 })).not.toBe('')
  })

  it('builds a power-cap recipe for an enabled cap transform', () => {
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-1', now: 1 }),
      lastKnownPixelCount: 100,
      globalTransforms: [
        {
          id: 'power-cap',
          type: 'power-cap' as const,
          enabled: true,
          mixinId: 'builtin:power-cap',
          mode: 'derived' as const,
          maxDuty: 0.42,
          provenance: {
            targetAmps: 2.5,
            brightness: 1,
            milliampsPerPixel: 60,
          },
        },
      ],
    }

    const recipe = controllerProfilePassRecipe(profile, 'export function render(i) { hsv(i, 1, 1) }')

    expect(recipe).toEqual([
      expect.objectContaining({
        id: 'power-cap',
        kind: 'intercept',
        target: ['hsv', 'rgb'],
        wrapperName: {
          hsv: '__px_cappedHsv',
          rgb: '__px_cappedRgb',
        },
        params: {
          MAX_DUTY: 0.42,
          RECENT_WINDOW_MS: 2000,
          CAP_RESPONSE_MS: 250,
          SINCE_START_MAX_FRAMES: 16384,
        },
      }),
    ])
  })

  it('resolves a derived cap from the current installation electrical profile', () => {
    const profile: ControllerProfile = {
      ...defaultControllerProfile({ id: 'ctrl-electrical', now: 1 }),
      lastKnownPixelCount: 100,
      electricalProfile: {
        ledPresetId: 'ws2812-5v-individual',
        supplyBudget: { value: 15, unit: 'watts' },
      },
      globalTransforms: [{
        id: 'power-cap',
        type: 'power-cap',
        enabled: true,
        mixinId: 'builtin:power-cap',
        mode: 'derived',
        maxDuty: 0.42,
      }],
    }

    const recipe = controllerProfilePassRecipe(
      profile,
      'export function render(i) { hsv(i, 1, 1) }',
    )
    expect(recipe[0]).toHaveProperty('params.MAX_DUTY', 0.5)

    const changedCount = { ...profile, lastKnownPixelCount: 200 }
    expect(controllerProfileArtifactSignature(changedCount)).not.toBe(
      controllerProfileArtifactSignature(profile),
    )
    expect(controllerProfileReconciliationSignature(changedCount)).not.toBe(
      controllerProfileReconciliationSignature(profile),
    )
  })

  it('builds the same power-cap recipe for rgb output patterns', () => {
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-rgb', now: 1 }),
      globalTransforms: [{
        id: 'power-cap',
        type: 'power-cap' as const,
        enabled: true,
        mixinId: 'builtin:power-cap',
        mode: 'direct' as const,
        maxDuty: 0.4,
        milliampsPerPixel: 60,
      }],
    }

    const recipe = controllerProfilePassRecipe(
      profile,
      'export function render(i) { rgb(0.2, 0.4, 0.6) }',
    )

    expect(recipe).toEqual([
      expect.objectContaining({
        id: 'power-cap',
        kind: 'intercept',
        target: ['hsv', 'rgb'],
        wrapperName: {
          hsv: '__px_cappedHsv',
          rgb: '__px_cappedRgb',
        },
      }),
    ])
  })

  it('builds a frame-sampled hardware brightness recipe for an enabled analog input', () => {
    const profile = hardwareBrightnessProfile()

    const recipe = controllerProfilePassRecipe(profile, 'export function render(i) { hsv(i, 1, 1) }')

    expect(recipe).toHaveLength(2)
    expect(recipe[0]).toMatchObject({
      id: 'hardware-brightness-sample',
      kind: 'inject',
      params: { PIN: 33, SMOOTHING: 0.2, FALLBACK: 0.4, INVERT: false },
    })
    expect(recipe[0]).toHaveProperty('source', expect.stringContaining('analogRead(PIN)'))
    expect(recipe[1]).toMatchObject({
      id: 'hardware-brightness',
      kind: 'intercept',
      target: 'hsv',
      wrapperName: '__px_hardwareBrightness',
      params: { BRIGHTNESS: 'hardwareBrightnessValue' },
    })
  })

  it('avoids colliding with pattern identifiers when naming the sampled brightness global', () => {
    const profile = hardwareBrightnessProfile()

    const recipe = controllerProfilePassRecipe(
      profile,
      'var hardwareBrightnessValue = 1\nexport function render(i) { hsv(i, 1, 1) }',
    )

    expect(recipe[1]).toMatchObject({
      params: { BRIGHTNESS: 'hardwareBrightnessValue2' },
    })
  })

  it('builds frame-sampled pattern binding passes only for the active pattern', () => {
    const profile = patternBindingProfile()

    const recipe = controllerProfilePassRecipe(
      profile,
      'export function sliderSpeed(v) { speed = v }\nexport function render(i) {}',
      'pat-1',
    )

    expect(recipe).toHaveLength(2)
    expect(recipe[0]).toMatchObject({
      id: 'speed-binding-sample',
      kind: 'inject',
      params: { PIN: 33, SMOOTHING: 0.25, FALLBACK: 0.5, INVERT: true },
    })
    expect(recipe[0]).toHaveProperty('source', expect.stringContaining('analogRead(PIN)'))
    expect(recipe[0]).toHaveProperty('source', expect.stringContaining('if (INVERT) raw = 1 - raw'))
    expect(recipe[1]).toMatchObject({
      id: 'speed-binding-drive',
      kind: 'bind',
      target: 'sliderSpeed',
      value: 'speedPotValue',
      mode: 'function-call',
    })
  })

  it('lets a Pattern binding override hardware brightness when both use the same input', () => {
    const profile: ControllerProfile = {
      ...hardwareBrightnessProfile(),
      patternBindings: [{
        id: 'speed-binding',
        patternId: 'pat-1',
        inputId: 'brightness-pot',
        target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
      }],
    }

    const recipe = controllerProfilePassRecipe(
      profile,
      'export function sliderSpeed(v) { speed = v }\nexport function render(i) {}',
      'pat-1',
    )

    expect(recipe.map((pass) => pass.id)).toEqual([
      'speed-binding-sample',
      'speed-binding-drive',
    ])
  })

  it('keeps hardware brightness when a Pattern binding uses a different input', () => {
    const profile: ControllerProfile = {
      ...hardwareBrightnessProfile(),
      inputs: [
        ...hardwareBrightnessProfile().inputs,
        patternBindingProfile().inputs[0],
      ],
      patternBindings: patternBindingProfile().patternBindings,
    }

    const recipe = controllerProfilePassRecipe(
      profile,
      'export function sliderSpeed(v) { speed = v }\nexport function render(i) { hsv(i, 1, 1) }',
      'pat-1',
    )

    expect(recipe.map((pass) => pass.id)).toEqual([
      'hardware-brightness-sample',
      'hardware-brightness',
      'speed-binding-sample',
      'speed-binding-drive',
    ])
  })

  it('maps explicit function targets to function-call bind passes', () => {
    const profile = {
      ...patternBindingProfile(),
      patternBindings: [
        {
          id: 'pulse-binding',
          patternId: 'pat-1',
          inputId: 'speed-pot',
          target: { kind: 'call-function' as const, name: 'setPulse' },
        },
      ],
    }

    const recipe = controllerProfilePassRecipe(profile, 'export function render(i) {}', 'pat-1')

    expect(recipe[1]).toMatchObject({
      id: 'pulse-binding-drive',
      kind: 'bind',
      target: 'setPulse',
      value: 'speedPotValue',
      mode: 'function-call',
    })
  })

  it('maps variable bindings to scaled assignment bind passes', () => {
    const profile = {
      ...patternBindingProfile(),
      patternBindings: [
        {
          id: 'brightness-binding',
          patternId: 'pat-1',
          inputId: 'speed-pot',
          target: {
            kind: 'assign-variable' as const,
            name: 'brightness',
            min: 0.2,
            max: 0.8,
            quantize: 0.1,
          },
        },
      ],
    }

    const recipe = controllerProfilePassRecipe(profile, 'export var brightness = 1', 'pat-1')

    expect(recipe[1]).toMatchObject({
      id: 'brightness-binding-drive',
      kind: 'bind',
      target: 'brightness',
      value: 'speedPotValue',
      min: 0.2,
      max: 0.8,
      quantize: 0.1,
      mode: 'variable-assignment',
    })
  })

  it('does not emit pattern binding passes without an active pattern match', () => {
    const profile = patternBindingProfile()

    expect(controllerProfilePassRecipe(profile, 'export function render(i) {}')).toEqual([])
    expect(controllerProfilePassRecipe(profile, 'export function render(i) {}', 'pat-2')).toEqual([])
  })
})

describe('normalizeStoredArtifactSignature', () => {
  it('writes an explicit schema version into current artifact signatures (#772)', () => {
    const current = controllerProfileArtifactSignature(
      legacySignatureProfile(),
      LEGACY_SIGNATURE_PATTERN_ID,
      { mapDim: LEGACY_SIGNATURE_MAP_DIM },
    )

    expect(JSON.parse(current)).toMatchObject({ version: 1 })
  })

  it('reads a pre-#772 stored signature as the signature the same profile produces now (#772)', () => {
    // Guard the fixture itself: a legacy signature that no longer carries a
    // `role` would make the assertion below pass for the wrong reason.
    expect(LEGACY_ARTIFACT_SIGNATURE_WITH_ROLE).toContain('"role":"brightness"')

    expect(normalizeStoredArtifactSignature(LEGACY_ARTIFACT_SIGNATURE_WITH_ROLE)).toBe(
      controllerProfileArtifactSignature(
        legacySignatureProfile(),
        LEGACY_SIGNATURE_PATTERN_ID,
        { mapDim: LEGACY_SIGNATURE_MAP_DIM },
      ),
    )
  })

  it('leaves a signature this code wrote exactly as it found it (#772)', () => {
    const current = controllerProfileArtifactSignature(
      legacySignatureProfile(),
      LEGACY_SIGNATURE_PATTERN_ID,
      { mapDim: LEGACY_SIGNATURE_MAP_DIM },
    )

    expect(normalizeStoredArtifactSignature(current)).toBe(current)
  })

  it('promotes a complete pre-version signature without making the artifact stale (#772)', () => {
    const current = controllerProfileArtifactSignature(
      legacySignatureProfile(),
      LEGACY_SIGNATURE_PATTERN_ID,
      { mapDim: LEGACY_SIGNATURE_MAP_DIM },
    )
    const { version: _version, ...unversioned } = JSON.parse(current) as Record<string, unknown>
    const stored = JSON.stringify(unversioned)

    expect(normalizeStoredArtifactSignature(stored)).toBe(current)
  })

  it('strips a stray role wherever it sits among the inputs, and nowhere else (#772)', () => {
    const stored = JSON.stringify({
      transforms: [{ type: 'power-cap', mixinId: 'builtin:power-cap', maxDuty: 0.25 }],
      inputs: [
        { id: 'a', name: 'A', pin: 33, signal: 'analog', role: 'assignable', smoothing: 0.2, fallback: 0.5, invert: false },
        { id: 'b', name: 'B', pin: 34, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: true },
        { id: 'c', name: 'C', pin: 35, signal: 'digital', role: 'next-pattern', smoothing: 0, fallback: 0, invert: false },
      ],
      // A `role` outside `inputs` is not the retired annotation and must survive.
      bindings: [{ id: 'b1', patternId: 'p', inputId: 'a', target: { kind: 'call-function', name: 'role' } }],
      renderer: { mapDim: null },
    })

    expect(normalizeStoredArtifactSignature(stored)).toBe(JSON.stringify({
      version: 1,
      transforms: [{ type: 'power-cap', mixinId: 'builtin:power-cap', maxDuty: 0.25 }],
      inputs: [
        { id: 'a', name: 'A', pin: 33, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
        { id: 'b', name: 'B', pin: 34, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: true },
        { id: 'c', name: 'C', pin: 35, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
      ],
      bindings: [{ id: 'b1', patternId: 'p', inputId: 'a', target: { kind: 'call-function', name: 'role' } }],
      renderer: { mapDim: null },
    }))
  })

  it('hands back anything it cannot recognise rather than throwing (#772)', () => {
    // An unrecognised stored signature is compared verbatim, exactly as it was
    // before this normalization existed: it can differ from a freshly computed
    // signature and cost one re-push, but it can never be mistaken for current.
    for (const stored of [
      '',
      'not json at all',
      '{"inputs":[{"id":"a","role":"brightness"}]',
      '{"inputs":[{"id":"a","role":"brightness"}]}',
      'null',
      '42',
      '"a bare string"',
      '[{"inputs":[]}]',
      '{"transforms":[]}',
      '{"inputs":"not an array"}',
      '{"inputs":[null,"text",7]}',
    ]) {
      expect(normalizeStoredArtifactSignature(stored)).toBe(stored)
    }
  })

  it('leaves unknown versions unchanged and never throws while canonicalizing deep input data (#772)', () => {
    const unknown = JSON.stringify({ version: 2, transforms: [], inputs: [], bindings: [] })
    expect(normalizeStoredArtifactSignature(unknown)).toBe(unknown)

    const depth = 20_000
    const deep = '{"version":1,"transforms":[],"inputs":[{"id":"a","name":"A","pin":33,"signal":"analog","smoothing":0.2,"fallback":0.5,"invert":false,"role":"brightness","extra":'
      + '['.repeat(depth)
      + '0'
      + ']'.repeat(depth)
      + '}],"bindings":[]}'
    expect(() => normalizeStoredArtifactSignature(deep)).not.toThrow()
    expect(normalizeStoredArtifactSignature(deep)).toBe(deep)
  })

  it('never reports a legacy signature as current for a profile that really changed (#772)', () => {
    const changed = legacySignatureProfile()
    changed.inputs[0].smoothing = 0.9

    expect(normalizeStoredArtifactSignature(LEGACY_ARTIFACT_SIGNATURE_WITH_ROLE)).not.toBe(
      controllerProfileArtifactSignature(
        changed,
        LEGACY_SIGNATURE_PATTERN_ID,
        { mapDim: LEGACY_SIGNATURE_MAP_DIM },
      ),
    )
  })
})

function hardwareBrightnessProfile(): ControllerProfile {
  return {
    ...defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_known',
      now: 1,
    }),
    inputs: [
      {
        id: 'brightness-pot',
        name: 'Brightness pot',
        pin: 33,
        signal: 'analog',
        smoothing: 0.2,
        fallback: 0.4,
        invert: false,
      },
    ],
    globalTransforms: [
      {
        id: 'hardware-brightness',
        type: 'hardware-brightness',
        enabled: true,
        mixinId: 'builtin:hardware-brightness',
        inputId: 'brightness-pot',
        mode: 'multiply-output',
      },
    ],
  }
}

function patternBindingProfile(): ControllerProfile {
  return {
    ...defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_known',
      now: 1,
    }),
    inputs: [
      {
        id: 'speed-pot',
        name: 'Speed pot',
        pin: 33,
        signal: 'analog',
        smoothing: 0.25,
        fallback: 0.5,
        invert: true,
      },
    ],
    patternBindings: [
      {
        id: 'speed-binding',
        patternId: 'pat-1',
        inputId: 'speed-pot',
        target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
      },
    ],
  }
}
