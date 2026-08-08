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
  return JSON.stringify({ transforms, inputs, bindings, ...(renderer ? { renderer } : {}) })
}

/** Read a *stored* artifact signature in today's terms, so it can be compared
 * against one computed now.
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
 * A signature this cannot parse, or whose shape it does not recognise, is
 * returned verbatim. That is the pre-#772 comparison exactly: it may differ
 * from a freshly computed signature and cost one re-push, which is the safe
 * direction, and it can never be mistaken for current. Never throws. */
export function normalizeStoredArtifactSignature(signature: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(signature)
  } catch {
    return signature
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return signature
  const record = parsed as { inputs?: unknown }
  if (!Array.isArray(record.inputs)) return signature

  let strayRole = false
  const inputs = record.inputs.map((input) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return input
    if (!('role' in input)) return input
    strayRole = true
    const { role: _retiredRole, ...rest } = input as Record<string, unknown>
    return rest
  })
  // Nothing to strip: hand back the exact bytes rather than re-serializing, so
  // a signature this code wrote can never be perturbed by passing through here.
  if (!strayRole) return signature
  // Spreading over an existing key keeps its original position, which is what
  // makes the result byte-identical to the fresh computation.
  return JSON.stringify({ ...record, inputs })
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
            target: 'hsv',
            source: hwBrightnessMixin.src,
            wrapperName: '__px_hardwareBrightness',
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
