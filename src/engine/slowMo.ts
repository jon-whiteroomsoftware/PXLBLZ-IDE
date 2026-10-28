import * as acorn from 'acorn'
import {
  collectIdentifiers,
  collectTopLevelBindings,
  isNameBound,
  reservedStem,
  walkWithScope,
} from './passEngine'
import { PIXELBLAZE_ARRAY_HEADER_WORDS, PIXELBLAZE_VM_ARRAY_WORDS } from './showVmResourceLedger'

export interface SlowMoSettings {
  rate: number
  stepMs: number
  inBetween: 'clock' | 'hold' | 'blend' | 'eased'
  stagger: { shape: 'sweep' | 'radial' | 'scatter'; width: number }
  persistence: { attackMs: number; decayMs: number } | null
}

export type SlowMoDeclineReason =
  | 'palette-output' | 'no-renderer' | 'shadowed-builtin'
  | 'reserved-prefix' | 'array-budget'
export type SlowMoStructure = 'clock' | 'blend' | 'blend-persistence' | 'persistence-only'

export interface SlowMoPlan {
  structure: SlowMoStructure
  arrayWords: number
  renderFns: Array<'render' | 'render2D' | 'render3D'>
  declined?: { reason: SlowMoDeclineReason; message: string }
}

export interface SlowMoWrapResult {
  code: string
  plan: SlowMoPlan
  tunables: Record<string, number>
}

export function slowMoArrayWords(pixelCount: number, structure: SlowMoStructure): number {
  if (!Number.isInteger(pixelCount) || pixelCount < 0) {
    throw new RangeError('Slow-mo pixel count must be a nonnegative integer.')
  }
  const arrays = structure === 'clock' ? 0
    : structure === 'blend' ? 6
      : structure === 'blend-persistence' ? 9 : 3
  return arrays * (pixelCount + PIXELBLAZE_ARRAY_HEADER_WORDS)
}

export function planSlowMo(code: string, settings: SlowMoSettings, pixelCount: number): SlowMoPlan {
  const ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' })
  const structure: SlowMoStructure = settings.inBetween === 'clock'
    ? settings.persistence === null ? 'clock' : 'persistence-only'
    : settings.persistence === null ? 'blend' : 'blend-persistence'
  const arrayWords = slowMoArrayWords(pixelCount, structure)
  const bindings = collectTopLevelBindings(code)
  const renderFns = (['render', 'render2D', 'render3D'] as const)
    .filter((name) => bindings.functions.has(name))
  const plan: SlowMoPlan = { structure, arrayWords, renderFns }
  const decline = (reason: SlowMoDeclineReason, message: string): SlowMoPlan => ({
    ...plan, declined: { reason, message },
  })

  let paletteOutput = false
  walkWithScope(ast, null, (node, scope) => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      const name = node.callee.name
      if ((name === 'paint' || name === 'setPalette') && !isNameBound(scope, name)) {
        paletteOutput = true
      }
    }
  })
  if (paletteOutput) {
    return decline('palette-output', 'Slow-mo does not capture palette output (paint/setPalette).')
  }
  if (renderFns.length === 0) {
    return decline('no-renderer', 'Slow-mo requires render, render2D, or render3D.')
  }
  for (const name of ['time', 'rgb', 'hsv', 'hsv24']) {
    if (bindings.functions.has(name) || bindings.variables.has(name)) {
      return decline('shadowed-builtin', `Slow-mo cannot wrap a top-level binding named ${name}.`)
    }
  }
  const prefix = `${reservedStem('slowmo')}_`
  for (const name of collectIdentifiers(code)) {
    if (name.startsWith(prefix)) {
      return decline('reserved-prefix', 'Slow-mo source uses the reserved __pxlblz_slowmo_ prefix.')
    }
  }
  if (arrayWords > PIXELBLAZE_VM_ARRAY_WORDS) {
    return decline('array-budget', `Slow-mo needs ${arrayWords} array words; the VM budget is ${PIXELBLAZE_VM_ARRAY_WORDS}.`)
  }
  return plan
}

export function emitSlowMoWrapper(code: string, settings: SlowMoSettings, pixelCount: number): SlowMoWrapResult {
  void code
  void settings
  void pixelCount
  throw new Error('This increment has not implemented slow-mo emission.')
}

export function slowMoTunables(settings: SlowMoSettings): Record<string, number> {
  void settings
  throw new Error('This increment has not implemented slow-mo tunables.')
}
