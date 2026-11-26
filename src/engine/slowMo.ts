import * as acorn from 'acorn'
import { emitPaletteLookup } from './paletteEmit'
import {
  collectIdentifiers,
  collectTopLevelBindings,
  isNameBound,
  reservedStem,
  walkWithScope,
} from './passEngine'
import { PIXELBLAZE_ARRAY_HEADER_WORDS, PIXELBLAZE_VM_ARRAY_WORDS } from './showVmResourceLedger'
import { boundPatternArrayWords } from './slowMoArrayBudget'

export const DEFAULT_SLOW_MO_STEP_MS = 16
export const SLOW_MO_SPEED_SLIDER = 'slider__pxlblz_slowmo_speed'

function clampPosition(position: number): number {
  if (!Number.isFinite(position)) throw new RangeError('Slow-mo position must be finite.')
  return Math.max(0, Math.min(1, position))
}

export function slowMoRateFromPosition(position: number): number {
  return 2 ** (-4 * (1 - clampPosition(position)))
}

export function slowMoPositionFromRate(rate: number): number {
  return clampPosition(1 + Math.log2(rate) / 4)
}

export function clampSlowMoUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function slowMoPositionFromAmount(amount: number): number {
  return 1 - clampSlowMoUnit(amount)
}

export function slowMoSettingsFromAmounts(slowMo: number, dreamy: number): SlowMoSettings {
  return { position: slowMoPositionFromAmount(slowMo), dreamy: clampSlowMoUnit(dreamy) }
}

export function isSlowMoActive(slowMo: number, dreamy: number): boolean {
  return clampSlowMoUnit(slowMo) > 0 || clampSlowMoUnit(dreamy) > 0
}

export function formatSlowMoAmount(amount: number): string {
  const clamped = clampSlowMoUnit(amount)
  if (clamped <= 0) return 'off'
  const divisor = 2 ** (4 * clamped)
  const display = divisor >= 10 ? Math.round(divisor) : Number(divisor.toFixed(1))
  return `1/${display}×`
}

export interface SlowMoSettings {
  position: number
  dreamy: number
}

export type SlowMoDeclineReason =
  | 'no-renderer' | 'shadowed-builtin'
  | 'reserved-prefix' | 'array-budget'

export interface SlowMoPlan {
  arrayWords: number
  renderFns: Array<'render' | 'render2D' | 'render3D'>
  declined?: { reason: SlowMoDeclineReason; message: string }
}

export interface SlowMoWrapResult {
  code: string
  plan: SlowMoPlan
  tunables: Record<string, number>
}

const wrapperOrder = ['slow-mo', 'dreamy'] as const
export type PatternWrapper = typeof wrapperOrder[number]

export const PATTERN_WRAPPER_CONTROLS = {
  'slow-mo': { exportName: 'sliderSlowMo', kind: 'slider', label: 'Slow Mo' },
  dreamy: { exportName: 'sliderDreamy', kind: 'slider', label: 'Dreamy' },
} as const

const bufferCounts = { 'slow-mo': 6, dreamy: 3 }
type WrapperSkip = {
  reason: SlowMoDeclineReason | 'control-name-taken'
  message: string
  neededWords?: number
  freeWords?: number
}

export interface PatternWrapperDecision {
  applied: PatternWrapper[]
  skipped: Partial<Record<PatternWrapper, WrapperSkip>>
  /** Words added by the applied Wrappers, including array headers. */
  arrayWords: number
}

export interface PatternWrapperResult extends PatternWrapperDecision {
  code: string
  tunables: Record<string, number>
}

export function slowMoArrayWords(pixelCount: number): number {
  return wrapperArrayWords(pixelCount, bufferCounts['slow-mo'] + bufferCounts.dreamy)
}

function wrapperArrayWords(pixelCount: number, buffers: number): number {
  if (!Number.isInteger(pixelCount) || pixelCount < 0) {
    throw new RangeError('Slow-mo pixel count must be a nonnegative integer.')
  }
  return buffers * (pixelCount + PIXELBLAZE_ARRAY_HEADER_WORDS)
}

function inspectWrapperSource(code: string, preview: boolean) {
  const ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' })
  const bindings = collectTopLevelBindings(code)
  const renderFns = (['render', 'render2D', 'render3D'] as const)
    .filter((name) => bindings.functions.has(name))
  let programBindings = new Set<string>()
  const decline = (reason: SlowMoDeclineReason, message: string) => ({
    ast, renderFns, programBindings, declined: { reason, message },
  })

  walkWithScope(ast, null, (node, scope) => {
    if (node.type === 'Program') programBindings = scope.names
  })
  if (renderFns.length === 0) {
    return decline('no-renderer', 'Slow-mo requires render, render2D, or render3D.')
  }
  const builtins = ['time', 'rgb', 'hsv', 'hsv24']
  if (!preview) builtins.push('clamp', 'floor', 'abs', 'pow', 'exp')
  for (const name of builtins) {
    if (programBindings.has(name)) {
      return decline('shadowed-builtin', `Slow-mo cannot wrap a top-level binding named ${name}.`)
    }
  }
  const prefix = `${reservedStem('slowmo')}_`
  for (const name of collectIdentifiers(code)) {
    if (name.startsWith(prefix)) {
      return decline('reserved-prefix', 'Slow-mo source uses the reserved __pxlblz_slowmo_ prefix.')
    }
    if (name === SLOW_MO_SPEED_SLIDER) {
      return decline('reserved-prefix', `Slow-mo source uses the reserved ${SLOW_MO_SPEED_SLIDER} name.`)
    }
  }
  return { ast, renderFns, programBindings, declined: undefined }
}

export function planSlowMo(code: string, settings: SlowMoSettings, pixelCount: number): SlowMoPlan {
  const { renderFns, declined } = inspectWrapperSource(code, true)
  slowMoTunables(settings)
  const arrayWords = slowMoArrayWords(pixelCount)
  const plan = { arrayWords, renderFns }
  if (declined) return { ...plan, declined }
  if (arrayWords > PIXELBLAZE_VM_ARRAY_WORDS) {
    return {
      ...plan,
      declined: { reason: 'array-budget', message: `Slow-mo needs ${arrayWords} array words; the VM budget is ${PIXELBLAZE_VM_ARRAY_WORDS}.` },
    }
  }
  return plan
}

export function emitSlowMoWrapper(code: string, settings: SlowMoSettings, pixelCount: number): SlowMoWrapResult {
  const plan = planSlowMo(code, settings, pixelCount)
  if (plan.declined) return { code, plan, tunables: {} }
  const tunables = slowMoTunables(settings)
  return {
    code: emitWrapperSource(code, plan.renderFns, tunables, wrapperOrder, true),
    plan, tunables,
  }
}

/** Apply the selected native Wrappers to already bundled Pattern source. */
export function emitPatternWrappers(
  code: string,
  pixelCount: number,
  enabled: readonly PatternWrapper[],
): PatternWrapperResult {
  const result: PatternWrapperResult = { code, applied: [], skipped: {}, arrayWords: 0, tunables: {} }
  const requested = wrapperOrder.filter(wrapper => enabled.includes(wrapper))
  if (requested.length === 0) return result

  const { ast, renderFns, programBindings, declined } = inspectWrapperSource(code, false)
  const patternWords = declined ? null : boundPatternArrayWords(ast, pixelCount, programBindings)
  const p = `${reservedStem('slowmo')}_`
  for (const wrapper of requested) {
    const { exportName, label } = PATTERN_WRAPPER_CONTROLS[wrapper]
    if (declined) {
      result.skipped[wrapper] = declined
      continue
    }
    if (programBindings.has(exportName)) {
      result.skipped[wrapper] = { reason: 'control-name-taken', message: `The Pattern already uses the Control name ${exportName}.` }
      continue
    }
    const neededWords = wrapperArrayWords(pixelCount, bufferCounts[wrapper])
    if (patternWords === null) {
      result.skipped[wrapper] = {
        reason: 'array-budget', neededWords,
        message: `${label} needs ${neededWords} array words. The Pattern's array use could not be bounded.`,
      }
      continue
    }
    const freeWords = Math.max(0, PIXELBLAZE_VM_ARRAY_WORDS - patternWords - result.arrayWords)
    if (neededWords > freeWords) {
      result.skipped[wrapper] = {
        reason: 'array-budget', neededWords, freeWords,
        message: `${label} needs ${neededWords} array words and ${freeWords} are free.`,
      }
      continue
    }
    result.arrayWords += neededWords
    result.applied.push(wrapper)
    if (wrapper === 'slow-mo') result.tunables[`${p}position`] = 1
    else result.tunables[`${p}decay`] = 0
  }
  if (result.applied.length > 0) {
    result.code = emitWrapperSource(code, renderFns, result.tunables, result.applied, false)
  }
  return result
}

const channels = ['r', 'g', 'b']

function emitWrapperSource(
  code: string,
  renderFns: SlowMoPlan['renderFns'],
  tunables: Record<string, number>,
  applied: readonly PatternWrapper[],
  preview: boolean,
): string {
  const slowMo = applied.includes('slow-mo')
  const dreamy = applied.includes('dreamy')
  const p = `${reservedStem('slowmo')}_`
  const rewritten = rewriteSlowMoSource(code, p, slowMo)
  const initializers = Object.entries(tunables).map(([name, value]) => `var ${name} = ${value}`).join('\n')
  const speedControl = preview
    ? `export function ${SLOW_MO_SPEED_SLIDER}(v) { ${p}position = clamp(v,0,1) }`
    : `export function ${PATTERN_WRAPPER_CONTROLS['slow-mo'].exportName}(a) { ${p}position = 1-clamp(a,0,1) }`
  const dreamControl = preview ? '' : `export function ${PATTERN_WRAPPER_CONTROLS.dreamy.exportName}(v) { v = clamp(v,0,1); ${p}decay = 10000*v*v }`
  const nativeClockFlag = preview ? '' : `var ${p}nativeTime = 1\n`
  const nativeClockRead = preview ? '' : `if (${p}nativeTime) return time(interval); `
  const slowMoPrelude = slowMo ? `var ${p}T = 0, ${p}acc = 0, ${p}f = 0, ${p}cap = 0
var ${p}rate = 1
var ${p}bypass = 0, ${p}wasBypass = 0, ${p}refresh = 0
${speedControl}
var ${p}ar = array(pixelCount), ${p}ag = array(pixelCount), ${p}ab = array(pixelCount)
var ${p}br = array(pixelCount), ${p}bg = array(pixelCount), ${p}bb = array(pixelCount)
${nativeClockFlag}function ${p}time(interval) { ${nativeClockRead}return (${p}T % interval) / interval }` : ''
  const dreamyPrelude = dreamy ? `var ${p}pr = array(pixelCount), ${p}pg = array(pixelCount), ${p}pb = array(pixelCount)
${dreamControl}
var ${p}kDn = 1, ${p}displayDelta = 0
function ${p}persist(current,target) {
  current += (target-current) * (target>current ? 1 : ${p}kDn)
  if (abs(target-current) < 0.015625) current = target
  return current
}` : ''
  const nativeOutput = [slowMo && `${p}bypass`, dreamy && `${p}decay == 0`].filter(Boolean).join(' && ')
  const prelude = `${initializers}
${slowMoPrelude}
${dreamyPrelude}
var ${p}phase = 0, ${p}r = 0, ${p}g = 0, ${p}b = 0
${emitColorCapture(p, nativeOutput)}`
  // The untouched path uses the native clock in both numeric modes. Once an
  // effect engages, keep the existing combined wrapper's clock and continuity.
  const clockEngaged = dreamy ? `${p}position < 1 || ${p}decay > 0` : `!${p}bypass`
  const enterSlowClock = preview ? '' : `\n  if (${clockEngaged}) ${p}nativeTime = 0`
  const advanceSlowMo = slowMo ? `
  ${p}cap = 0
  ${p}refresh = 0
  ${p}rate = pow(2,-4*(1-${p}position))
  if (${p}position >= 0.97) ${p}bypass = 1
  else if (${p}position < 0.94) ${p}bypass = 0${enterSlowClock}
  if (${p}bypass) ${p}rate = 1
  if (${p}bypass) {
    ${p}T += delta * 0.0000152587890625
    if (${p}T >= 16384) ${p}T -= 16384
    ${p}in_beforeRender(delta)
  }
  else if (${p}phase == 0) { ${p}in_beforeRender(0); ${p}cap = 1 }
  else {
    ${p}acc += delta * ${p}rate
    var ${p}n = 0
    while (${p}acc >= 16 && ${p}n < 4) {
      ${p}acc -= 16
      ${p}T += 16 * 0.0000152587890625
      if (${p}T >= 16384) ${p}T -= 16384
      ${p}in_beforeRender(16); ${p}n += 1
    }
    if (${p}acc >= 16) ${p}acc = ${p}acc % 16
    ${p}cap = ${p}n > 0
  }
  if (${p}wasBypass && !${p}bypass) { ${p}cap = 1; ${p}refresh = 1 }
  ${p}wasBypass = ${p}bypass
  ${p}f = ${p}acc / 16` : `\n  ${p}in_beforeRender(delta)`
  const advanceDreamy = dreamy ? `
  ${p}displayDelta = delta
  ${p}kDn = ${p}decay > 0 ? 1-exp(-delta/${p}decay) : 1` : ''
  const beforeRender = `export function beforeRender(delta) {${advanceSlowMo}${advanceDreamy}
}`
  const update = channels.map(c => `
    if (${p}phase == 0 || ${p}refresh) { ${p}a${c}[index] = ${p}${c}; ${p}b${c}[index] = ${p}${c} }
    else { ${p}a${c}[index] = ${p}b${c}[index]; ${p}b${c}[index] = ${p}${c} }`).join('')
  const mix = (c: string) => `${p}a${c}[index] + (${p}b${c}[index] - ${p}a${c}[index]) * ${p}c`
  const persistenceOutput = `rgb(${channels.map(c => `${p}p${c}[index]/255`).join(', ')})`
  const persist = (target: (channel: string) => string) => `if (${p}displayDelta > 0 || ${p}phase == 0) {
${channels.map(c => `    ${p}p${c}[index] = ${p}persist(${p}p${c}[index], (${target(c)}) * 255)`).join('\n')}
  }`
  const output = dreamy ? `${persist(mix)}\n  ${persistenceOutput}` : `rgb(${channels.map(mix).join(', ')})`
  const endFrame = `if (index == pixelCount-1) ${p}phase = 1`
  const out = slowMo ? `function ${p}out(index) {
  if (${p}cap) {${update}
  }
  var ${p}c = ${p}f
  ${output}
  ${endFrame}
}` : ''
  const liveDreamy = dreamy ? `
    ${persist(c => `${p}${c}`)}
    if (${p}decay > 0) ${persistenceOutput}` : ''
  const wrappers = renderFns.map(name => {
    const args = name === 'render' ? 'index' : name === 'render2D' ? 'index,x,y' : 'index,x,y,z'
    const draw = `${p}r = 0; ${p}g = 0; ${p}b = 0; ${p}in_${name}(${args})`
    if (!slowMo) return `export function ${name}(${args}) {
  ${draw}${liveDreamy}
  ${endFrame}
}`
    return `export function ${name}(${args}) {
  if (${p}bypass) {
    ${draw}${liveDreamy}
    ${endFrame}
    return
  }
  if (${p}cap) { ${draw} }
  ${p}out(index)
}`
  }).join('\n')
  return `${prelude}\n${rewritten}\n${beforeRender}\n${out}\n${wrappers}`
}

function emitColorCapture(p: string, nativeOutput: string): string {
  return `var ${p}palette = 0
function ${p}setPalette(pal) { ${p}palette = pal; setPalette(pal) }
function ${p}paint(pos,v) {
  if (${nativeOutput}) paint(pos,v)
  if (!${p}palette) return
${emitPaletteLookup(`${p}palette`, `${p}captureRgb`)}
}
function ${p}hsv24(h,s,v) { if (${nativeOutput}) hsv24(h,s,v); ${p}captureHsv(h,s,v) }
function ${p}rgb(r,g,b) { if (${nativeOutput}) rgb(r,g,b); ${p}captureRgb(r,g,b) }
function ${p}captureRgb(r,g,b) { ${p}r = clamp(r,0,1); ${p}g = clamp(g,0,1); ${p}b = clamp(b,0,1) }
function ${p}hsv(h,s,v) { if (${nativeOutput}) hsv(h,s,v); ${p}captureHsv(h,s,v) }
function ${p}captureHsv(h,s,v) {
  if (s == 0) { ${p}captureRgb(v,v,v); return }
  var ${p}h6 = ((h % 1) + 1) % 1 * 6
  var ${p}i = floor(${p}h6), ${p}hf = ${p}h6 - ${p}i
  var ${p}hp = v * (1-s), ${p}hq = v * (1-s*${p}hf), ${p}ht = v * (1-s*(1-${p}hf))
  if (${p}i % 6 == 0) ${p}captureRgb(v,${p}ht,${p}hp)
  else if (${p}i % 6 == 1) ${p}captureRgb(${p}hq,v,${p}hp)
  else if (${p}i % 6 == 2) ${p}captureRgb(${p}hp,v,${p}ht)
  else if (${p}i % 6 == 3) ${p}captureRgb(${p}hp,${p}hq,v)
  else if (${p}i % 6 == 4) ${p}captureRgb(${p}ht,${p}hp,v)
  else ${p}captureRgb(v,${p}hp,${p}hq)
}`
}

export function slowMoTunables(settings: SlowMoSettings): Record<string, number> {
  const position = clampPosition(settings.position)
  if (!Number.isFinite(settings.dreamy) || settings.dreamy < 0 || settings.dreamy > 1) {
    throw new RangeError('Slow-mo dreamy must be finite and between 0 and 1.')
  }
  const p = `${reservedStem('slowmo')}_`
  return {
    [`${p}position`]: position,
    [`${p}decay`]: 10000 * settings.dreamy ** 2,
  }
}

// Acorn's position-rich ESTree nodes match the pass engine's scope walker.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

function rewriteSlowMoSource(code: string, prefix: string, slowMo: boolean): string {
  const tokens: acorn.Token[] = []
  const ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module', onToken: tokens }) as unknown as Node
  const previousTokens = new Map(tokens.slice(1).map((token, index) => [token.start, tokens[index].type.label]))
  const parents = new Map<Node, Node>()
  function visitParents(node: Node): void {
    for (const value of Object.values(node)) {
      const children = Array.isArray(value) ? value : [value]
      for (const child of children) {
        if (child && typeof child === 'object' && typeof child.type === 'string') {
          parents.set(child, node)
          visitParents(child)
        }
      }
    }
  }
  visitParents(ast)
  const entries = new Set<string>()
  const edits = new Map<string, { start: number; end: number; text: string }>()
  function edit(node: Node, text: string): void {
    edits.set(`${node.start}:${node.end}`, { start: node.start, end: node.end, text })
  }
  for (const statement of ast.body as Node[]) {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (node?.type === 'FunctionDeclaration' && ['beforeRender', 'render', 'render2D', 'render3D'].includes(node.id.name)) {
      entries.add(node.id.name)
      edit(node.id, `${prefix}in_${node.id.name}`)
      if (node !== statement) edit({ start: statement.start, end: statement.start + 'export'.length }, '')
    }
  }
  let root: Parameters<Parameters<typeof walkWithScope>[2]>[1]
  walkWithScope(ast, null, (node, scope) => {
    if (node.type === 'Program') root = scope
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && !isNameBound(scope, node.callee.name)) {
      const name = node.callee.name
      if ((slowMo && name === 'time') || ['rgb', 'hsv', 'hsv24', 'paint', 'setPalette'].includes(name)) {
        edit(node.callee, `${prefix}${name}`)
      }
      // A generated Pixelblaze function needs the builtin's default supplied
      // explicitly. Insert outside argument parentheses and retain trailing commas.
      if (name === 'paint' && node.arguments.length === 1) {
        const close = node.end - 1
        edit({ start: close, end: close }, `${previousTokens.get(close) === ',' ? '' : ','} 1`)
      }
    }
    if (node.type !== 'Identifier' || !entries.has(node.name)) return
    const parent = parents.get(node)
    if ((parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)
      || (parent?.type === 'Property' && parent.key === node && !parent.computed)
      || (['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent?.type) && parent?.label === node)) return
    // The nearest binding must be the Program entry, not a parameter or local.
    let binding = scope
    while (!binding.names.has(node.name) && binding.parent) binding = binding.parent
    if (binding !== root) return
    const text = `${prefix}in_${node.name}`
    // A shorthand value is also its authored property key; retain that key.
    edit(node, parent?.type === 'Property' && parent.shorthand ? `${node.name}: ${text}` : text)
  })
  for (const { start, end, text } of [...edits.values()].sort((a,b) => b.start-a.start)) {
    code = code.slice(0,start) + text + code.slice(end)
  }
  if (!entries.has('beforeRender')) code += `\nfunction ${prefix}in_beforeRender(delta) {}`
  return code
}
