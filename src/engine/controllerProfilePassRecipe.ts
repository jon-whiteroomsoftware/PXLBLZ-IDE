import * as acorn from 'acorn'
import type { ControllerInput, ControllerProfile, GlobalTransform, PatternBinding } from './controllerProfile'
import type { PassRecipe } from './passEngine'
import { stockMixinSpec } from './mixins'

export interface LiveControllerIdentity {
  ip: string
  deviceId?: string | null
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
  const hardwareBrightness = profile.globalTransforms.find(
    (transform): transform is HardwareBrightnessTransform =>
      transform.type === 'hardware-brightness' && transform.enabled,
  )
  const powerCap = profile.globalTransforms.find(
    (transform): transform is PowerCapTransform =>
      transform.type === 'power-cap' && transform.enabled && transform.maxMilliamps > 0,
  )

  if (hardwareBrightness && hardwareBrightness.mode === 'multiply-output') {
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
        target: 'hsv',
        source: powerCapMixin.src,
        wrapperName: '__px_cappedHsv',
        params: {
          MAX_MILLIAMPS: powerCap.maxMilliamps,
          FULL_WHITE_MILLIAMPS: fullWhiteMilliamps(profile),
        },
      })
    }
  }

  if (patternId) {
    for (const binding of profile.patternBindings) {
      if (binding.patternId !== patternId) continue
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

function fullWhiteMilliamps(profile: ControllerProfile): number {
  return Math.max(1, Math.round((profile.lastKnownPixelCount ?? 256) * 60))
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
