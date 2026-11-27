import { assertValidControllerProfile } from '@/cloudflare/controllerProfiles'
import { defaultControllerProfile } from '@/store/controllerProfileStore'
import { prepareControllerArtifactDelivery } from './controllerArtifactDelivery'
import { createRemoteControllerMetadataStorage } from './controllerMetadataStorage'
import { savedControllerWrapperOutcome, withPushRecord } from './controllerPushRecord'
import { describeProfileFreshness } from './controllerSavedPrograms'
import {
  bindGlobalInputUse,
  controllerProfileRecordIssues,
  globalInputUsesOverriddenBy,
  patternBindingOverridesHardwareBrightness,
  validateControllerProfile,
  wrapperInputsFor,
  type ControllerInput,
  type ControllerProfile,
  type GlobalTransform,
} from './controllerProfile'
import {
  controllerProfileArtifactSignature,
  controllerProfilePassRecipe,
  controllerProfileReconciliationSignature,
  readStoredArtifactSignature,
} from './controllerProfilePassRecipe'

// #1278 1278a: a profile-wide input can drive Slow-mo or Dreamy. Oracles are
// the stored profile (validation), the saved bytes and outcome (delivery), and
// the artifact signature that decides which saved programs are rewritten.

const source = `var t = 0
export function beforeRender(d) { t = time(0.03) }
export function render(i) { hsv(t, 1, 1) }`
const PIXELS = 8

function input(id: string, overrides: Partial<ControllerInput> = {}): ControllerInput {
  return { id, name: `Knob ${id}`, pin: 36, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false, ...overrides }
}

/** A, B and C are analog inputs; D is digital. Slow-mo and Dreamy are on and
 * unbound; Brightness is off. */
function baseProfile(): ControllerProfile {
  const profile = defaultControllerProfile({ id: 'bench', now: 1 })
  profile.lastKnownPixelCount = PIXELS
  profile.inputs = [
    input('a'), input('b', { pin: 39 }), input('c', { pin: 34 }), input('d', { pin: 4, signal: 'digital' }),
  ]
  profile.globalTransforms = [
    ...profile.globalTransforms.filter((transform) => transform.type !== 'power-cap'),
    { id: 'slow-mo', type: 'slow-mo', enabled: true },
    { id: 'dreamy', type: 'dreamy', enabled: true },
  ]
  return profile
}

function withTransforms(profile: ControllerProfile, edit: (transform: GlobalTransform) => GlobalTransform): ControllerProfile {
  return { ...profile, globalTransforms: profile.globalTransforms.map(edit) }
}

function bound(profile: ControllerProfile, use: Parameters<typeof bindGlobalInputUse>[1], inputId: string | null) {
  return { ...profile, globalTransforms: bindGlobalInputUse(profile.globalTransforms, use, inputId) }
}

function deliver(profile: ControllerProfile, artifactId = 'pat-1') {
  return prepareControllerArtifactDelivery({ source, profile, artifactId, pixelCount: PIXELS, mapDim: 1 })
}

const recordIssues = (profile: ControllerProfile) => controllerProfileRecordIssues(validateControllerProfile(profile))

describe('Wrapper input validation (V1, B5)', () => {
  it('accepts unbound Wrappers and each single binding', () => {
    expect(recordIssues(baseProfile())).toEqual([])
    expect(recordIssues(bound(baseProfile(), 'slow-mo', 'a'))).toEqual([])
    expect(recordIssues(bound(bound(baseProfile(), 'slow-mo', 'a'), 'dreamy', 'b'))).toEqual([])
  })

  const invalid: Array<[string, (profile: ControllerProfile) => ControllerProfile, RegExp]> = [
    ['a dangling inputId', (profile) => withTransforms(profile, (transform) =>
      transform.type === 'slow-mo' ? { ...transform, inputId: 'ghost' } : transform), /missing input "ghost"/],
    ['one input on two Wrappers', (profile) => withTransforms(profile, (transform) =>
      transform.type === 'slow-mo' || transform.type === 'dreamy' ? { ...transform, inputId: 'a' } : transform),
    /Input "a" drives Slow-mo and Dreamy/],
    ['one input on Brightness and a Wrapper', (profile) => withTransforms(profile, (transform) =>
      transform.type === 'hardware-brightness' ? { ...transform, enabled: true, inputId: 'a' }
        : transform.type === 'dreamy' ? { ...transform, inputId: 'a' } : transform),
    /Input "a" drives Brightness and Dreamy/],
    ['an inputId on a disabled Wrapper', (profile) => withTransforms(profile, (transform) =>
      transform.type === 'dreamy' ? { ...transform, enabled: false, inputId: 'a' } : transform), /Dreamy is off/],
    ['two Slow-mo members on different inputs', (profile) => ({
      ...profile,
      globalTransforms: [...bound(profile, 'slow-mo', 'a').globalTransforms, { id: 'slow-mo2', type: 'slow-mo', enabled: true, inputId: 'b' }],
    }), /single slow-mo setting/],
  ]

  it.each(invalid)('refuses %s as a record issue, whole, on the server (V2)', (_name, make, message) => {
    const profile = make(baseProfile())
    expect(recordIssues(profile).map((issue) => issue.message).join('\n')).toMatch(message)
    expect(() => assertValidControllerProfile(profile)).toThrow(message)
  })

  it.each(invalid)('emits no input sample for a stored record with %s', (_name, make) => {
    const profile = make(bound(baseProfile(), 'dreamy', 'b'))
    expect(wrapperInputsFor(profile, 'pat-1')).toEqual({})
    const sliders = withTransforms(profile, (transform) => {
      if (transform.type !== 'slow-mo' && transform.type !== 'dreamy') return transform
      const { inputId: _inputId, ...unbound } = transform
      return unbound
    })
    expect(deliver(profile).source).toBe(deliver(sliders).source)
  })

  it('D3: a digital input on a Wrapper is a storable configuration issue, and the Wrapper keeps its slider', () => {
    const profile = bound(baseProfile(), 'slow-mo', 'd')
    expect(recordIssues(profile)).toEqual([])
    expect(validateControllerProfile(profile).errors).toEqual([
      expect.objectContaining({ path: 'inputs.d.signal', kind: 'configuration', message: expect.stringContaining('Slow-mo') }),
    ])
    expect(wrapperInputsFor(profile, 'pat-1')).toEqual({})
    const unbound = deliver(baseProfile())
    const delivered = deliver(profile)
    expect(delivered.source).toBe(unbound.source)
    expect(delivered.profileSignature).toBe(unbound.profileSignature)
    expect(delivered.wrapperOutcome).toEqual(unbound.wrapperOutcome)
  })
})

describe('Binding one to one (B5, B6)', () => {
  const types = (profile: ControllerProfile) => profile.globalTransforms.map((transform) => ({ ...transform }))

  it('binds, moves and releases without breaking one to one', () => {
    let profile = bound(baseProfile(), 'slow-mo', 'a')
    expect(types(profile)).toContainEqual({ id: 'slow-mo', type: 'slow-mo', enabled: true, inputId: 'a' })
    profile = bound(profile, 'dreamy', 'a')
    expect(types(profile)).toContainEqual({ id: 'slow-mo', type: 'slow-mo', enabled: true })
    expect(types(profile)).toContainEqual({ id: 'dreamy', type: 'dreamy', enabled: true, inputId: 'a' })
    profile = bound(profile, 'hardware-brightness', 'a')
    expect(types(profile)).toContainEqual({ id: 'dreamy', type: 'dreamy', enabled: true })
    expect(types(profile)).toContainEqual(expect.objectContaining({ type: 'hardware-brightness', enabled: true, inputId: 'a' }))
    profile = bound(profile, 'slow-mo', 'a')
    expect(types(profile)).toContainEqual(expect.objectContaining({ type: 'hardware-brightness', enabled: false, inputId: '' }))
    profile = bound(profile, 'slow-mo', null)
    expect(types(profile)).toContainEqual({ id: 'slow-mo', type: 'slow-mo', enabled: true })
    expect(recordIssues(profile)).toEqual([])
  })

  it('adds and turns on a Wrapper the profile has no record for', () => {
    const start = { ...baseProfile(), globalTransforms: baseProfile().globalTransforms.filter((transform) => transform.type !== 'dreamy') }
    expect(bound(start, 'dreamy', 'b').globalTransforms.slice(-1)).toEqual([
      { id: 'dreamy', type: 'dreamy', enabled: true, inputId: 'b' },
    ])
    const off = withTransforms(baseProfile(), (transform) => transform.type === 'dreamy' ? { ...transform, enabled: false } : transform)
    expect(bound(off, 'dreamy', 'b').globalTransforms).toContainEqual({ id: 'dreamy', type: 'dreamy', enabled: true, inputId: 'b' })
  })

  it('generalises the Brightness opt-out and keeps its results', () => {
    const binding = { id: 'own', patternId: 'pat-1', inputId: 'a', target: { kind: 'call-exported-slider' as const, name: 'sliderSpeed' } }
    const brightness = bound(baseProfile(), 'hardware-brightness', 'a')
    expect(globalInputUsesOverriddenBy(brightness, binding)).toEqual(['hardware-brightness'])
    expect(patternBindingOverridesHardwareBrightness(brightness, binding)).toBe(true)
    const slowMo = bound(baseProfile(), 'slow-mo', 'a')
    expect(globalInputUsesOverriddenBy(slowMo, binding)).toEqual(['slow-mo'])
    expect(patternBindingOverridesHardwareBrightness(slowMo, binding)).toBe(false)
    expect(globalInputUsesOverriddenBy(baseProfile(), binding)).toEqual([])
  })

  it('preserves the legacy Brightness behavior when its transform is absent', () => {
    const profile = bound(baseProfile(), 'slow-mo', 'a')
    const withoutBrightness = profile.globalTransforms.filter((transform) => transform.type !== 'hardware-brightness')
    expect(bindGlobalInputUse(withoutBrightness, 'hardware-brightness', 'a')).toEqual(withoutBrightness)
  })
})

describe('Wrapper input delivery (B1, B4, R2, G2)', () => {
  function withBindings(profile: ControllerProfile): ControllerProfile {
    return {
      ...profile,
      patternBindings: [
        { id: 'own-a', patternId: 'pat-own', inputId: 'a', target: { kind: 'assign-variable', name: 't', min: 0, max: 1 } },
        { id: 'own-c', patternId: 'pat-other', inputId: 'c', target: { kind: 'assign-variable', name: 't', min: 0, max: 1 } },
      ],
    }
  }

  it.each(['slow-mo', 'dreamy'] as const)('replaces the %s slider on every applied Pattern except the one that binds its input', (type) => {
    const control = type === 'slow-mo' ? 'sliderSlowMo' : 'sliderDreamy'
    const other = type === 'slow-mo' ? 'sliderDreamy' : 'sliderSlowMo'
    const unboundProfile = withBindings(baseProfile())
    const profile = bound(unboundProfile, type, 'a')
    for (const patternId of ['pat-1', 'pat-other']) {
      const delivery = deliver(profile, patternId)
      expect(delivery.bundled!.metadata.controls.map((entry) => entry.exportName)).not.toContain(control)
      expect(delivery.bundled!.metadata.controls.map((entry) => entry.exportName)).toContain(other)
      expect(delivery.source).toContain('analogRead(36)')
      expect(delivery.wrapperOutcome).toEqual({ applied: ['slow-mo', 'dreamy'], skipped: {}, inputs: { [type]: { inputId: 'a', name: 'Knob a' } } })
    }
    // B4: the opted-out Pattern saves exactly its unbound bytes.
    const optedOut = deliver(profile, 'pat-own')
    const unbound = deliver(unboundProfile, 'pat-own')
    expect(optedOut.source).toBe(unbound.source)
    expect(optedOut.profileSignature).toBe(unbound.profileSignature)
    expect(optedOut.wrapperOutcome).toEqual({ applied: ['slow-mo', 'dreamy'], skipped: {} })
  })

  it('keeps Brightness and Power limit after the Wrappers with no Wrapper inject pass (R1)', () => {
    const profile = bound(bound(baseProfile(), 'slow-mo', 'a'), 'hardware-brightness', 'b')
    const withPower = { ...profile, globalTransforms: [...profile.globalTransforms, ...defaultControllerProfile({ id: 'x', now: 1 }).globalTransforms.filter((transform) => transform.type === 'power-cap').map((transform) => ({ ...transform, enabled: true }))] }
    const recipe = controllerProfilePassRecipe(withPower, source, 'pat-1', PIXELS)
    expect(recipe.map((pass) => pass.id)).toEqual(['wrappers', 'hardware-brightness-sample', 'hardware-brightness', 'power-cap'])
    expect(recipe[0]).toMatchObject({ inputs: { 'slow-mo': { pin: 36, smoothing: 0.2, fallback: 0.5, invert: false } } })
  })

  it('keeps a skipped bound Wrapper skipped with no outcome input', () => {
    const named = `export function sliderSlowMo(v) {}\n${source}`
    const delivery = prepareControllerArtifactDelivery({
      source: named, profile: bound(baseProfile(), 'slow-mo', 'a'), artifactId: 'pat-1', pixelCount: PIXELS, mapDim: 1,
    })
    expect(delivery.wrapperOutcome).toEqual({ applied: ['dreamy'], skipped: { 'slow-mo': expect.objectContaining({ reason: 'control-name-taken' }) } })
    expect(delivery.source).not.toContain('analogRead')
  })

  it('keeps Shows unchanged by a binding (B9)', () => {
    const show = 'export function render(i) { rgb(1, 0, 0) }'
    const args = { source: show, artifactId: 'show:1', pixelCount: PIXELS, mapDim: 1 as const }
    expect(prepareControllerArtifactDelivery({ ...args, profile: bound(baseProfile(), 'slow-mo', 'a') }))
      .toEqual(prepareControllerArtifactDelivery({ ...args, profile: baseProfile() }))
  })

  it('reads bound input evidence from the saved record for its confirmed program (G2)', async () => {
    const profile = bound(bound(baseProfile(), 'slow-mo', 'a'), 'dreamy', 'b')
    const delivery = deliver(profile)
    const record = {
      transforms: [], profileSignature: delivery.profileSignature, artifactHash: 'saved-artifact',
      stampedAt: '2026-11-26T01:00:00.000Z', name: 'Pattern', wrapperProgramId: 'PROGRAM',
      wrapperOutcome: delivery.wrapperOutcome,
    }
    let savedJson = '{}'
    const storage = createRemoteControllerMetadataStorage({
      fetcher: async (_url, init) => {
        if (init?.method === 'PUT') {
          savedJson = String(init.body)
          return Response.json({ ok: true })
        }
        return new Response(savedJson)
      },
    })
    await storage.setPushRecords(withPushRecord({}, 'ctrl', 'pat-1', record))
    const reopened = (await storage.getPushRecords()).ctrl['pat-1']
    expect(reopened).toEqual(record)
    expect(savedControllerWrapperOutcome(reopened, 'PROGRAM')?.inputs).toEqual({
      'slow-mo': { inputId: 'a', name: 'Knob a' },
      dreamy: { inputId: 'b', name: 'Knob b' },
    })
    expect(savedControllerWrapperOutcome(reopened, 'OTHER')).toBeUndefined()
    expect(describeProfileFreshness(reopened, delivery.profileSignature)).toBe('current')
  })
})

describe('Wrapper input signatures (B7, G1)', () => {
  const applied = ['slow-mo', 'dreamy'] as const
  const signature = (profile: ControllerProfile, patternId = 'pat-1') =>
    controllerProfileArtifactSignature(profile, patternId, { mapDim: 1 }, applied)
  const requested = (profile: ControllerProfile, patternId = 'pat-1') =>
    controllerProfileArtifactSignature(profile, patternId, { mapDim: 1 })

  it('changes exactly when the saved bytes change', () => {
    const unbound = baseProfile()
    const boundA = bound(unbound, 'slow-mo', 'a')
    expect(signature(boundA)).not.toBe(signature(unbound))
    expect(requested(boundA)).not.toBe(requested(unbound))
    // Renaming the input reaches neither the bytes nor the signature.
    const renamed = { ...boundA, inputs: boundA.inputs.map((entry) => entry.id === 'a' ? { ...entry, name: 'Renamed' } : entry) }
    expect(signature(renamed)).toBe(signature(boundA))
    expect(deliver(renamed).source).toBe(deliver(boundA).source)
    // Each sampling setting changes the bytes and the signature.
    for (const change of [{ smoothing: 0.5 }, { fallback: 0 }, { invert: true }, { pin: 35 }]) {
      const changed = { ...boundA, inputs: boundA.inputs.map((entry) => entry.id === 'a' ? { ...entry, ...change } : entry) }
      expect(deliver(changed).source).not.toBe(deliver(boundA).source)
      expect(signature(changed)).not.toBe(signature(boundA))
      expect(deliver(changed).profileSignature).toBe(signature(changed))
    }
    // A Wrapper this Pattern skips, or one it opts out of, leaves its signature alone.
    expect(controllerProfileArtifactSignature(boundA, 'pat-1', { mapDim: 1 }, ['dreamy']))
      .toBe(controllerProfileArtifactSignature(unbound, 'pat-1', { mapDim: 1 }, ['dreamy']))
    const ownBinding = { id: 'own', patternId: 'pat-own', inputId: 'a', target: { kind: 'call-exported-slider' as const, name: 'sliderSpeed' } }
    expect(signature({ ...boundA, patternBindings: [ownBinding] }, 'pat-own'))
      .toBe(signature({ ...unbound, patternBindings: [ownBinding] }, 'pat-own'))
  })

  it('keeps unbound signatures byte-identical to #1279 and reads bound ones back as recognized', () => {
    const earlier = '{"version":1,"transforms":[],"inputs":[],"bindings":[],"renderer":{"mapDim":1},"wrappers":["slow-mo","dreamy"]}'
    expect(signature(baseProfile())).toBe(earlier)
    expect(readStoredArtifactSignature(earlier)).toEqual({ kind: 'recognized', normalized: earlier, appliedWrappers: ['slow-mo', 'dreamy'] })
    expect(controllerProfileReconciliationSignature(baseProfile()))
      .toBe('{"patternBindings":[],"wrappers":["slow-mo","dreamy"],"pixelCount":8}')
    const saved = deliver(bound(baseProfile(), 'dreamy', 'b')).profileSignature
    expect(readStoredArtifactSignature(saved)).toEqual({ kind: 'recognized', normalized: saved, appliedWrappers: ['slow-mo', 'dreamy'] })
    const parsed = JSON.parse(saved)
    for (const broken of [
      { ...parsed, wrapperInputs: [] },
      { ...parsed, wrapperInputs: [{ ...parsed.wrapperInputs[0], name: 'x' }] },
      { ...parsed, wrapperInputs: [parsed.wrapperInputs[0], parsed.wrapperInputs[0]] },
      { ...parsed, wrapperInputs: [{ ...parsed.wrapperInputs[0], signal: 'digital' }] },
      { ...parsed, wrappers: ['slow-mo'] },
    ]) expect(readStoredArtifactSignature(JSON.stringify(broken))).toEqual({ kind: 'unrecognized' })
  })

  it('schedules reconciliation on bind, unbind and each sampling change', () => {
    const unbound = baseProfile()
    const boundA = bound(unbound, 'slow-mo', 'a')
    const reconciliation = controllerProfileReconciliationSignature
    expect(reconciliation(boundA)).not.toBe(reconciliation(unbound))
    expect(reconciliation(bound(boundA, 'slow-mo', null))).toBe(reconciliation(unbound))
    for (const change of [{ smoothing: 0.5 }, { fallback: 0 }, { invert: true }, { pin: 35 }]) {
      const updated = { ...boundA, inputs: boundA.inputs.map((entry) => entry.id === 'a' ? { ...entry, ...change } : entry) }
      expect(reconciliation(updated)).not.toBe(reconciliation(boundA))
    }
    const own = { id: 'own', patternId: 'pat-own', inputId: 'a', target: { kind: 'call-exported-slider' as const, name: 'sliderSpeed' } }
    expect(reconciliation({ ...boundA, patternBindings: [own] })).toContain('"overridesWrappers":["slow-mo"]')
  })

  it('schedules a receipt refresh for an equivalent sampler on a different input without changing saved bytes', () => {
    const unbound = baseProfile()
    unbound.inputs.push(input('same-settings'))
    const first = bound(unbound, 'slow-mo', 'a')
    const second = bound(unbound, 'slow-mo', 'same-settings')
    expect(signature(second)).toBe(signature(first))
    expect(deliver(second).source).toBe(deliver(first).source)
    expect(deliver(second).wrapperOutcome?.inputs?.['slow-mo']?.inputId).toBe('same-settings')
    expect(controllerProfileReconciliationSignature(second)).not.toBe(controllerProfileReconciliationSignature(first))
  })
})
