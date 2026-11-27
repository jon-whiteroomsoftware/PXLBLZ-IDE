import { sameControllerDeviceId } from './controllerIdentity'
import * as acorn from 'acorn'
import {
  CONTROLLER_WRAPPER_TYPES,
  enabledControllerWrappers,
  patternBindingOverridesHardwareBrightness,
  type ControllerInput,
  type ControllerProfile,
  type ControllerWrapperType,
  type GlobalTransform,
  type PatternBinding,
} from './controllerProfile'
import type { PassRecipe } from './passEngine'
import { stockMixinSpec } from './mixins'
import {
  POWER_CAP_RESPONSE_MS,
  POWER_RECENT_WINDOW_MS,
  POWER_SINCE_START_MAX_FRAMES,
} from './powerTelemetry'
import type { MapDimension } from './renderCompatibility'
import { resolveControllerElectricalProfile } from './controllerElectricalProfile'

export interface LiveControllerIdentity {
  ip: string
  deviceId?: string | null
}

type ArtifactTransformSignature =
  | { type: 'power-cap'; mixinId: string; maxDuty: number }
  | { type: 'hardware-brightness'; mixinId: string; inputId: string; mode: string }
type ArtifactInputSignature = Omit<ControllerInput, 'name'>
type ArtifactRendererSignature = { mapDim: MapDimension | null }

/** Stable signature of the profile fields that can change generated pattern code.
 * Descriptive/controller-only metadata is deliberately excluded so renaming a
 * profile does not make Send dirty. */
export function controllerProfileArtifactSignature(
  profile: ControllerProfile | null | undefined,
  patternId?: string | null,
  renderer?: ArtifactRendererSignature,
  appliedWrappers?: readonly ControllerWrapperType[],
): string {
  if (!profile && !renderer) return ''
  const transforms: ArtifactTransformSignature[] = []
  for (const transform of profile?.globalTransforms ?? []) {
    if (!transform.enabled) continue
    if (transform.type === 'power-cap') {
      transforms.push({
        type: transform.type,
        mixinId: transform.mixinId,
        maxDuty: effectivePowerCapMaxDuty(profile, transform),
      })
      continue
    }
    if (transform.type === 'hardware-brightness') {
      transforms.push({
        type: transform.type,
        mixinId: transform.mixinId,
        inputId: transform.inputId,
        mode: transform.mode,
      })
    }
  }
  const bindings = patternId
    ? (profile?.patternBindings ?? []).filter((binding) => binding.patternId === patternId)
    : []
  const signature = serializeArtifactSignature(transforms, profile?.inputs ?? [], bindings, renderer, appliedWrappers)
  // Run/Save dirtiness is checked before preparation. Its requested inputs
  // compare independently from the applied set that goes in a flash receipt.
  const requested = appliedWrappers === undefined ? enabledControllerWrappers(profile, patternId) : []
  return requested.length
    ? JSON.stringify({ signature, requested, pixelCount: profile?.lastKnownPixelCount ?? null })
    : signature
}

function serializeArtifactSignature(
  transforms: ArtifactTransformSignature[],
  inputs: ArtifactInputSignature[],
  bindings: PatternBinding[],
  renderer?: ArtifactRendererSignature,
  appliedWrappers?: readonly ControllerWrapperType[],
): string {
  const relevantTransforms = transforms.filter((transform) =>
    transform.type === 'power-cap' || inputs.some((input) =>
      input.id === transform.inputId && samplesHardwareBrightness(transform.mode, input.signal),
    ),
  )
  const inputIds = new Set<string>()
  for (const transform of relevantTransforms) {
    if ('inputId' in transform) inputIds.add(transform.inputId)
  }
  for (const binding of bindings) inputIds.add(binding.inputId)
  return JSON.stringify({
    version: 1,
    transforms: relevantTransforms,
    inputs: inputs.filter((input) => inputIds.has(input.id)).map((input) => ({
      id: input.id,
      ...samplingSettings(input),
    })),
    bindings: bindings.map((binding) => ({
      id: binding.id,
      patternId: binding.patternId,
      inputId: binding.inputId,
      target: binding.target.kind === 'assign-variable'
        ? binding.target
        : { kind: 'call-function', name: binding.target.name },
    })),
    ...(renderer ? { renderer } : {}),
    ...(appliedWrappers?.length ? { wrappers: CONTROLLER_WRAPPER_TYPES.filter((type) => appliedWrappers.includes(type)) } : {}),
  })
}

/** Stored artifact signatures must be read in today's terms before comparison.
 *
 * Older signatures recorded whole inputs, the two spellings of a function
 * call, and hardware brightness wired to digital inputs. Those differences
 * leave the generated code unchanged and are normalized before comparison.
 *
 * Only the compared value is adjusted — the stored record is left as written,
 * and the next real push replaces it in the current shape.
 *
 * A signature this cannot parse, or whose shape it does not recognize, remains
 * explicitly unrecognized. The compatibility wrapper below can still return
 * its original bytes for the reconciliation planner's conservative re-push
 * behavior. Neither path can mistake malformed or future data for current. */
export type StoredArtifactSignatureRead =
  | { kind: 'recognized'; normalized: string; appliedWrappers?: readonly ControllerWrapperType[] }
  | { kind: 'unrecognized' }

/** Classifies a stored signature before it is allowed to support a freshness
 * claim. Compatibility migrations are recognized; malformed and unknown
 * future envelopes are not. */
export function readStoredArtifactSignature(signature: string): StoredArtifactSignatureRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(signature)
  } catch {
    return { kind: 'unrecognized' }
  }
  if (!isRecord(parsed)) return { kind: 'unrecognized' }
  const record = parsed as Record<string, unknown>
  if (record.version !== undefined && record.version !== 1) return { kind: 'unrecognized' }
  if (Object.keys(record).some((key) => !ARTIFACT_SIGNATURE_KEYS.has(key))) {
    return { kind: 'unrecognized' }
  }
  if (!isTransformSignatureList(record.transforms)) return { kind: 'unrecognized' }
  if (!isInputSignatureList(record.inputs)) return { kind: 'unrecognized' }
  if (!isBindingSignatureList(record.bindings)) return { kind: 'unrecognized' }
  if (record.renderer !== undefined && !isRendererSignature(record.renderer)) {
    return { kind: 'unrecognized' }
  }
  if (record.wrappers !== undefined && !isAppliedWrapperList(record.wrappers)) {
    return { kind: 'unrecognized' }
  }

  return {
    kind: 'recognized',
    normalized: serializeArtifactSignature(record.transforms, record.inputs, record.bindings, record.renderer, record.wrappers),
    ...(record.wrappers?.length ? { appliedWrappers: record.wrappers } : {}),
  }
}

export function normalizeStoredArtifactSignature(signature: string): string {
  const read = readStoredArtifactSignature(signature)
  return read.kind === 'recognized' ? read.normalized : signature
}

const ARTIFACT_SIGNATURE_KEYS = new Set(['version', 'transforms', 'inputs', 'bindings', 'renderer', 'wrappers'])

function isAppliedWrapperList(value: unknown): value is ControllerWrapperType[] {
  return Array.isArray(value) && value.length === new Set(value).size
    && value.every((type) => CONTROLLER_WRAPPER_TYPES.includes(type))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTransformSignatureList(value: unknown): value is ArtifactTransformSignature[] {
  return Array.isArray(value) && value.every((transform) => {
    if (!isRecord(transform) || typeof transform.type !== 'string' || typeof transform.mixinId !== 'string') {
      return false
    }
    const fields = Object.keys(transform).filter((key) => key !== 'type' && key !== 'mixinId')
    if (transform.type === 'power-cap') {
      return fields.length === 1 && typeof transform.maxDuty === 'number'
    }
    return transform.type === 'hardware-brightness'
      && fields.length === 2
      && typeof transform.inputId === 'string'
      && transform.mode === 'multiply-output'
  })
}

const INPUT_SIGNATURE_KEYS = new Set(['id', 'name', 'role', 'pin', 'signal', 'smoothing', 'fallback', 'invert'])

function isInputSignatureList(value: unknown): value is ArtifactInputSignature[] {
  return Array.isArray(value) && value.every((input) => (
    isRecord(input)
      && typeof input.id === 'string'
      && (input.name === undefined || typeof input.name === 'string')
      && Object.keys(input).every((key) => INPUT_SIGNATURE_KEYS.has(key))
      && typeof input.pin === 'number'
      && (input.signal === 'analog' || input.signal === 'digital')
      && typeof input.smoothing === 'number'
      && typeof input.fallback === 'number'
      && typeof input.invert === 'boolean'
  ))
}

const BINDING_SIGNATURE_KEYS = new Set(['id', 'patternId', 'inputId', 'target'])

function isBindingSignatureList(value: unknown): value is PatternBinding[] {
  return Array.isArray(value) && value.every((binding) => (
    isRecord(binding)
      && typeof binding.id === 'string'
      && typeof binding.patternId === 'string'
      && typeof binding.inputId === 'string'
      && Object.keys(binding).every((key) => BINDING_SIGNATURE_KEYS.has(key))
      && isBindingTargetSignature(binding.target)
  ))
}

function isBindingTargetSignature(value: unknown): boolean {
  if (!isRecord(value) || typeof value.name !== 'string') return false
  if (value.kind === 'call-exported-slider' || value.kind === 'call-function') {
    return Object.keys(value).every((key) => key === 'kind' || key === 'name')
  }
  return value.kind === 'assign-variable'
    && typeof value.min === 'number'
    && typeof value.max === 'number'
    && (value.quantize === undefined || typeof value.quantize === 'number')
    && Object.keys(value).every((key) => ['kind', 'name', 'min', 'max', 'quantize'].includes(key))
}

function isRendererSignature(value: unknown): value is ArtifactRendererSignature {
  return isRecord(value)
    && Object.keys(value).every((key) => key === 'mapDim')
    && (value.mapDim === null || value.mapDim === 1 || value.mapDim === 2 || value.mapDim === 3)
}

/** Stable signature of every profile field that can change at least one
 * generated Pattern. It is used only to decide whether reconciliation needs
 * to be scheduled; each Pattern still gets its narrower artifact signature. */
export function controllerProfileReconciliationSignature(profile: ControllerProfile): string {
  const powerCap = activePowerCap(profile)
  const wrappers = enabledControllerWrappers(profile)
  const brightnessInput = hardwareBrightnessInput(profile)
  const patternBindings = new Map<string, unknown[]>()
  for (const binding of profile.patternBindings) {
    const input = profile.inputs.find((candidate) => candidate.id === binding.inputId)
    if (!input) continue
    const bindings = patternBindings.get(binding.patternId) ?? []
    const { id: _id, ...drive } = patternBindingDrivePass(binding, '')
    bindings.push({
      id: binding.id,
      sample: samplingSettings(input),
      valueName: identifierStem(input.id),
      drive,
      overridesBrightness: Boolean(brightnessInput && patternBindingOverridesHardwareBrightness(profile, binding)),
    })
    patternBindings.set(binding.patternId, bindings)
  }
  return JSON.stringify({
    maxDuty: powerCap && effectivePowerCapMaxDuty(profile, powerCap),
    brightness: brightnessInput && samplingSettings(brightnessInput),
    patternBindings: [...patternBindings.keys()].sort().map((id) => [id, patternBindings.get(id)]),
    ...(wrappers.length ? { wrappers, pixelCount: profile.lastKnownPixelCount ?? null } : {}),
  })
}

function samplingSettings({ pin, signal, smoothing, fallback, invert }: Omit<ArtifactInputSignature, 'id'>) {
  return { pin, signal, smoothing, fallback, invert }
}

type PowerCapTransform = Extract<GlobalTransform, { type: 'power-cap' }>

function activePowerCap(profile: ControllerProfile): PowerCapTransform | undefined {
  return profile.globalTransforms.find(
    (transform): transform is PowerCapTransform =>
      transform.type === 'power-cap' && transform.enabled && transform.maxDuty >= 0,
  )
}

function hardwareBrightnessInput(profile: ControllerProfile): ControllerInput | undefined {
  const transform = profile.globalTransforms.find(
    (candidate) => candidate.type === 'hardware-brightness' && candidate.enabled,
  )
  if (transform?.type !== 'hardware-brightness') return undefined
  const input = profile.inputs.find((candidate) => candidate.id === transform.inputId)
  return samplesHardwareBrightness(transform.mode, input?.signal) ? input : undefined
}

function samplesHardwareBrightness(mode: string, signal: ControllerInput['signal'] | undefined): boolean {
  return mode === 'multiply-output' && signal === 'analog'
}

export function findProfileForLiveController(
  profiles: ControllerProfile[],
  live: LiveControllerIdentity,
): ControllerProfile | null {
  if (live.deviceId) {
    const byDeviceId = profiles.find((profile) => sameControllerDeviceId(profile.deviceId, live.deviceId))
    if (byDeviceId) return byDeviceId
  }
  return profiles.find((profile) => profile.lastSeenIp === live.ip) ?? null
}

export function controllerProfilePassRecipe(
  profile: ControllerProfile | null | undefined,
  patternSource: string,
  patternId?: string | null,
  wrapperPixelCount?: number,
): PassRecipe {
  if (!profile) return []
  const recipe: PassRecipe = []
  const usedNames = collectIdentifiers(patternSource)
  const activePatternBindings = patternId
    ? profile.patternBindings.filter((binding) => binding.patternId === patternId)
    : []
  const brightnessInput = hardwareBrightnessInput(profile)
  const powerCap = activePowerCap(profile)

  const patternOverridesHardwareBrightness = activePatternBindings.some((binding) =>
    patternBindingOverridesHardwareBrightness(profile, binding),
  )

  if (brightnessInput && !patternOverridesHardwareBrightness) {
    const brightnessName = reserveIdentifier(usedNames, 'hardwareBrightnessValue')
    const hwBrightnessMixin = stockMixinSpec('hw-brightness')
    if (hwBrightnessMixin) {
      recipe.push(
        {
          id: 'hardware-brightness-sample',
          kind: 'inject',
          source: [
            `var ${brightnessName} = FALLBACK`,
            ``,
            `export function beforeRender(delta) {`,
            `  var raw = analogRead(PIN)`,
            `  if (INVERT) raw = 1 - raw`,
            `  ${brightnessName} = ${brightnessName} + (raw - ${brightnessName}) * SMOOTHING`,
            `}`,
          ].join('\n'),
          params: {
            PIN: brightnessInput.pin,
            SMOOTHING: brightnessInput.smoothing,
            FALLBACK: brightnessInput.fallback,
            INVERT: brightnessInput.invert,
          },
        },
        {
          id: 'hardware-brightness',
          kind: 'intercept',
          target: ['hsv', 'rgb'],
          source: hwBrightnessMixin.src,
          wrapperName: {
            hsv: '__px_hardwareBrightness',
            rgb: '__px_hardwareBrightnessRgb',
          },
          params: {
            BRIGHTNESS: brightnessName,
          },
        },
      )
    }
  }

  if (powerCap) {
    const powerCapMixin = stockMixinSpec('power-cap')
    if (powerCapMixin) {
      recipe.push({
        id: 'power-cap',
        kind: 'intercept',
        target: ['hsv', 'rgb'],
        source: powerCapMixin.src,
        wrapperName: {
          hsv: '__px_cappedHsv',
          rgb: '__px_cappedRgb',
        },
        params: {
          MAX_DUTY: effectivePowerCapMaxDuty(profile, powerCap),
          RECENT_WINDOW_MS: POWER_RECENT_WINDOW_MS,
          CAP_RESPONSE_MS: POWER_CAP_RESPONSE_MS,
          SINCE_START_MAX_FRAMES: POWER_SINCE_START_MAX_FRAMES,
        },
      })
    }
  }

  const globalPassCount = recipe.length
  if (patternId) {
    for (const binding of activePatternBindings) {
      const input = profile.inputs.find((candidate) => candidate.id === binding.inputId)
      if (!input) continue
      const valueName = reserveIdentifier(usedNames, `${identifierStem(input.id)}Value`)
      recipe.push(
        patternBindingSamplePass(binding, input, valueName),
        patternBindingDrivePass(binding, valueName),
      )
    }
  }

  if (wrapperPixelCount === undefined) return recipe
  const enabled = enabledControllerWrappers(profile, patternId)
  if (!enabled.length) return recipe
  return [
    ...recipe.slice(globalPassCount),
    { id: 'wrappers', kind: 'wrappers', enabled, pixelCount: wrapperPixelCount },
    ...recipe.slice(0, globalPassCount),
  ]
}

function effectivePowerCapMaxDuty(
  profile: ControllerProfile | null | undefined,
  transform: PowerCapTransform,
): number {
  if (transform.mode !== 'derived' || !profile?.electricalProfile) return transform.maxDuty
  return resolveControllerElectricalProfile(profile.electricalProfile, {
    pixelCount: profile.lastKnownPixelCount,
  }).maxDuty ?? transform.maxDuty
}

function patternBindingSamplePass(
  binding: PatternBinding,
  input: ControllerInput,
  valueName: string,
): PassRecipe[number] {
  return {
    id: `${binding.id}-sample`,
    kind: 'inject',
    source: [
      `var ${valueName} = FALLBACK`,
      ``,
      `export function beforeRender(delta) {`,
      input.signal === 'analog'
        ? `  var raw = analogRead(PIN)`
        : `  var raw = digitalRead(PIN)`,
      `  if (INVERT) raw = 1 - raw`,
      `  ${valueName} = ${valueName} + (raw - ${valueName}) * SMOOTHING`,
      `}`,
    ].join('\n'),
    params: {
      PIN: input.pin,
      SMOOTHING: input.smoothing,
      FALLBACK: input.fallback,
      INVERT: input.invert,
    },
  }
}

function patternBindingDrivePass(binding: PatternBinding, valueName: string): PassRecipe[number] {
  const target = binding.target
  if (target.kind === 'assign-variable') {
    return {
      id: `${binding.id}-drive`,
      kind: 'bind',
      target: target.name,
      value: valueName,
      min: target.min,
      max: target.max,
      quantize: target.quantize,
      mode: 'variable-assignment',
    }
  }
  return {
    id: `${binding.id}-drive`,
    kind: 'bind',
    target: target.name,
    value: valueName,
    mode: 'function-call',
  }
}

function reserveIdentifier(used: Set<string>, preferred: string): string {
  if (!used.has(preferred)) {
    used.add(preferred)
    return preferred
  }
  let index = 2
  while (used.has(`${preferred}${index}`)) index += 1
  const name = `${preferred}${index}`
  used.add(name)
  return name
}

function identifierStem(id: string): string {
  const words = id
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'input'
  const [first, ...rest] = words
  return [
    first.charAt(0).toLowerCase() + first.slice(1),
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
  ].join('')
}

function collectIdentifiers(source: string): Set<string> {
  const names = new Set<string>()
  try {
    const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown
    walkAst(ast, (node) => {
      if (node.type === 'Identifier') names.add(node.name)
    })
  } catch {
    return names
  }
  return names
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkAst(node: unknown, visitor: (n: Record<string, any>) => void): void {
  if (!node || typeof node !== 'object') return
  visitor(node as Record<string, never>)
  for (const val of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, visitor)
    } else {
      walkAst(val, visitor)
    }
  }
}
