import * as acorn from 'acorn'
import {
  patternBindingOverridesHardwareBrightness,
  type ControllerInput,
  type ControllerProfile,
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

/** Stable signature of the profile fields that can change generated pattern code.
 * Descriptive/controller-only metadata is deliberately excluded so renaming a
 * profile does not make Send dirty. */
export function controllerProfileArtifactSignature(
  profile: ControllerProfile | null | undefined,
  patternId?: string | null,
  renderer?: { mapDim: MapDimension | null },
): string {
  if (!profile && !renderer) return ''
  const transforms: Array<
    | { type: 'power-cap'; mixinId: string; maxDuty: number }
    | { type: 'hardware-brightness'; mixinId: string; inputId: string; mode: string }
  > = []
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
    transforms.push({
      type: transform.type,
      mixinId: transform.mixinId,
      inputId: transform.inputId,
      mode: transform.mode,
    })
  }
  const bindings = patternId
    ? (profile?.patternBindings ?? []).filter((binding) => binding.patternId === patternId)
    : []
  const inputIds = new Set<string>()
  for (const transform of transforms) {
    if ('inputId' in transform) inputIds.add(transform.inputId)
  }
  for (const binding of bindings) inputIds.add(binding.inputId)
  const inputs = (profile?.inputs ?? []).filter((input) => inputIds.has(input.id))
  return JSON.stringify({ version: 1, transforms, inputs, bindings, ...(renderer ? { renderer } : {}) })
}

/** Stored artifact signatures must be read in today's terms before comparison.
 *
 * The signature serializes whole `ControllerInput` objects, and inputs written
 * before #772 carried a `role` that never reached a byte of generated code.
 * Retiring `role` therefore changed every stored signature for an input-driven
 * Pattern while the emitted Pattern stayed identical. Left alone, that reads as
 * staleness: a profile with `keepPatternsUpToDate` would rewrite artifacts on
 * the physical Controller on every reconnect, for nothing.
 *
 * The rule this establishes: a field that cannot change generated code must
 * never change the signature, and when one is retired its removal is normalized
 * here rather than paid for in device writes.
 *
 * Only the compared value is adjusted — the stored record is left as written,
 * and the next real push replaces it in the current shape.
 *
 * A signature this cannot parse, or whose shape it does not recognize, remains
 * explicitly unrecognized. The compatibility wrapper below can still return
 * its original bytes for the reconciliation planner's conservative re-push
 * behavior. Neither path can mistake malformed or future data for current. */
export type StoredArtifactSignatureRead =
  | { kind: 'recognized'; normalized: string }
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

  let strayRole = false
  const inputs = record.inputs.map((input) => {
    if (!('role' in input)) return input
    strayRole = true
    const { role: _retiredRole, ...rest } = input
    return rest
  })
  // A current signature with nothing to migrate stays byte-exact. An
  // unversioned signature is a recognised pre-version envelope and is promoted
  // without changing its generated-code meaning.
  if (!strayRole && record.version === 1) {
    return { kind: 'recognized', normalized: signature }
  }
  try {
    return { kind: 'recognized', normalized: JSON.stringify({
      version: 1,
      transforms: record.transforms,
      inputs,
      bindings: record.bindings,
      ...(record.renderer !== undefined ? { renderer: record.renderer } : {}),
    }) }
  } catch {
    return { kind: 'unrecognized' }
  }
}

export function normalizeStoredArtifactSignature(signature: string): string {
  const read = readStoredArtifactSignature(signature)
  return read.kind === 'recognized' ? read.normalized : signature
}

const ARTIFACT_SIGNATURE_KEYS = new Set(['version', 'transforms', 'inputs', 'bindings', 'renderer'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTransformSignatureList(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((transform) => {
    if (!isRecord(transform) || typeof transform.type !== 'string' || typeof transform.mixinId !== 'string') {
      return false
    }
    return transform.type === 'power-cap'
      ? typeof transform.maxDuty === 'number'
      : transform.type === 'hardware-brightness'
        && typeof transform.inputId === 'string'
        && typeof transform.mode === 'string'
  })
}

function isInputSignatureList(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((input) => (
    isRecord(input)
      && typeof input.id === 'string'
      && typeof input.name === 'string'
      && typeof input.pin === 'number'
      && (input.signal === 'analog' || input.signal === 'digital')
      && typeof input.smoothing === 'number'
      && typeof input.fallback === 'number'
      && typeof input.invert === 'boolean'
  ))
}

function isBindingSignatureList(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((binding) => (
    isRecord(binding)
      && typeof binding.id === 'string'
      && typeof binding.patternId === 'string'
      && typeof binding.inputId === 'string'
      && isRecord(binding.target)
      && typeof binding.target.kind === 'string'
      && typeof binding.target.name === 'string'
  ))
}

function isRendererSignature(value: unknown): boolean {
  return isRecord(value)
    && Object.keys(value).every((key) => key === 'mapDim')
    && (value.mapDim === null || value.mapDim === 1 || value.mapDim === 2 || value.mapDim === 3)
}

/** Stable signature of every profile field that can change at least one
 * generated Pattern. It is used only to decide whether reconciliation needs
 * to be scheduled; each Pattern still gets its narrower artifact signature. */
export function controllerProfileReconciliationSignature(profile: ControllerProfile): string {
  return JSON.stringify({
    globalTransforms: profile.globalTransforms.map((transform) =>
      transform.type === 'power-cap'
        ? { ...transform, maxDuty: effectivePowerCapMaxDuty(profile, transform) }
        : transform),
    inputs: profile.inputs,
    patternBindings: profile.patternBindings,
  })
}

type HardwareBrightnessTransform = Extract<GlobalTransform, { type: 'hardware-brightness' }>
type PowerCapTransform = Extract<GlobalTransform, { type: 'power-cap' }>

export function findProfileForLiveController(
  profiles: ControllerProfile[],
  live: LiveControllerIdentity,
): ControllerProfile | null {
  if (live.deviceId) {
    const byDeviceId = profiles.find((profile) => profile.deviceId === live.deviceId)
    if (byDeviceId) return byDeviceId
  }
  return profiles.find((profile) => profile.lastSeenIp === live.ip) ?? null
}

export function controllerProfilePassRecipe(
  profile: ControllerProfile | null | undefined,
  patternSource: string,
  patternId?: string | null,
): PassRecipe {
  if (!profile) return []
  const recipe: PassRecipe = []
  const usedNames = collectIdentifiers(patternSource)
  const activePatternBindings = patternId
    ? profile.patternBindings.filter((binding) => binding.patternId === patternId)
    : []
  const hardwareBrightness = profile.globalTransforms.find(
    (transform): transform is HardwareBrightnessTransform =>
      transform.type === 'hardware-brightness' && transform.enabled,
  )
  const powerCap = profile.globalTransforms.find(
    (transform): transform is PowerCapTransform =>
      transform.type === 'power-cap' && transform.enabled && transform.maxDuty >= 0,
  )

  const patternOverridesHardwareBrightness = activePatternBindings.some((binding) =>
    patternBindingOverridesHardwareBrightness(profile, binding),
  )

  if (
    hardwareBrightness &&
    hardwareBrightness.mode === 'multiply-output' &&
    !patternOverridesHardwareBrightness
  ) {
    const input = profile.inputs.find((candidate) => candidate.id === hardwareBrightness.inputId)
    if (input?.signal === 'analog') {
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
              PIN: input.pin,
              SMOOTHING: input.smoothing,
              FALLBACK: input.fallback,
              INVERT: input.invert,
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

  return recipe
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
