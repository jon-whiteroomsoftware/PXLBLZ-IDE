import * as acorn from 'acorn'
import type { ControllerProfile, GlobalTransform } from './controllerProfile'
import type { PassRecipe } from './passEngine'
import { stockMixinSpec } from './mixins'

export interface LiveControllerIdentity {
  ip: string
  deviceId?: string | null
}

type HardwareBrightnessTransform = Extract<GlobalTransform, { type: 'hardware-brightness' }>

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
): PassRecipe {
  if (!profile) return []
  const hardwareBrightness = profile.globalTransforms.find(
    (transform): transform is HardwareBrightnessTransform =>
      transform.type === 'hardware-brightness' && transform.enabled,
  )
  if (!hardwareBrightness || hardwareBrightness.mode !== 'multiply-output') return []

  const input = profile.inputs.find((candidate) => candidate.id === hardwareBrightness.inputId)
  if (!input || input.signal !== 'analog') return []

  const brightnessName = uniqueIdentifier(patternSource, 'hardwareBrightnessValue')
  const hwBrightnessMixin = stockMixinSpec('hw-brightness')
  if (!hwBrightnessMixin) return []

  return [
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
      wrapperName: 'hardwareBrightness',
      params: {
        BRIGHTNESS: brightnessName,
      },
    },
  ]
}

function uniqueIdentifier(source: string, preferred: string): string {
  const used = collectIdentifiers(source)
  if (!used.has(preferred)) return preferred
  let index = 2
  while (used.has(`${preferred}${index}`)) index += 1
  return `${preferred}${index}`
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
