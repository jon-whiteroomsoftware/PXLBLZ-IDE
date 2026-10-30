import * as acorn from 'acorn'
import {
  collectIdentifiers,
  collectTopLevelBindings,
  isNameBound,
  reservedStem,
  walkWithScope,
} from './passEngine'
import { PIXELBLAZE_ARRAY_HEADER_WORDS, PIXELBLAZE_VM_ARRAY_WORDS } from './showVmResourceLedger'

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

export interface SlowMoSettings {
  position: number
  dreamy: number
}

export type SlowMoDeclineReason =
  | 'palette-output' | 'no-renderer' | 'shadowed-builtin'
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

export function slowMoArrayWords(pixelCount: number): number {
  if (!Number.isInteger(pixelCount) || pixelCount < 0) {
    throw new RangeError('Slow-mo pixel count must be a nonnegative integer.')
  }
  return 9 * (pixelCount + PIXELBLAZE_ARRAY_HEADER_WORDS)
}

export function planSlowMo(code: string, settings: SlowMoSettings, pixelCount: number): SlowMoPlan {
  const ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' })
  slowMoTunables(settings)
  const arrayWords = slowMoArrayWords(pixelCount)
  const bindings = collectTopLevelBindings(code)
  const renderFns = (['render', 'render2D', 'render3D'] as const)
    .filter((name) => bindings.functions.has(name))
  const plan: SlowMoPlan = { arrayWords, renderFns }
  const decline = (reason: SlowMoDeclineReason, message: string): SlowMoPlan => ({
    ...plan, declined: { reason, message },
  })

  let paletteOutput = false
  let programBindings = new Set<string>()
  walkWithScope(ast, null, (node, scope) => {
    if (node.type === 'Program') programBindings = scope.names
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
  if (arrayWords > PIXELBLAZE_VM_ARRAY_WORDS) {
    return decline('array-budget', `Slow-mo needs ${arrayWords} array words; the VM budget is ${PIXELBLAZE_VM_ARRAY_WORDS}.`)
  }
  return plan
}

export function emitSlowMoWrapper(code: string, settings: SlowMoSettings, pixelCount: number): SlowMoWrapResult {
  const plan = planSlowMo(code, settings, pixelCount)
  if (plan.declined) return { code, plan, tunables: {} }
  const tunables = slowMoTunables(settings)
  const p = `${reservedStem('slowmo')}_`
  const rewritten = rewriteSlowMoSource(code, p)
  const initializers = Object.entries(tunables).map(([name, value]) => `var ${name} = ${value}`).join('\n')
  const prelude = `${initializers}
var ${p}T = 0, ${p}acc = 0, ${p}f = 0, ${p}phase = 0, ${p}cap = 0
var ${p}rate = 1
var ${p}bypass = 0, ${p}wasBypass = 0, ${p}refresh = 0
export function ${SLOW_MO_SPEED_SLIDER}(v) { ${p}position = clamp(v,0,1) }
var ${p}r = 0, ${p}g = 0, ${p}b = 0
var ${p}ar = array(pixelCount), ${p}ag = array(pixelCount), ${p}ab = array(pixelCount)
var ${p}br = array(pixelCount), ${p}bg = array(pixelCount), ${p}bb = array(pixelCount)
var ${p}pr = array(pixelCount), ${p}pg = array(pixelCount), ${p}pb = array(pixelCount)
var ${p}kDn = 1, ${p}displayDelta = 0
function ${p}persist(current,target) {
  current += (target-current) * (target>current ? 1 : ${p}kDn)
  if (abs(target-current) < 0.015625) current = target
  return current
}
function ${p}time(interval) { return (${p}T % interval) / interval }
${emitColorCapture(p)}`
  const beforeRender = `export function beforeRender(delta) {
  ${p}cap = 0
  ${p}refresh = 0
  ${p}rate = pow(2,-4*(1-${p}position))
  if (${p}position >= 0.97) ${p}bypass = 1
  else if (${p}position < 0.94) ${p}bypass = 0
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
  ${p}f = ${p}acc / 16
  ${p}displayDelta = delta
  ${p}kDn = ${p}decay > 0 ? 1-exp(-delta/${p}decay) : 1
}`
  const update = ['r', 'g', 'b'].map(c => `
    if (${p}phase == 0 || ${p}refresh) { ${p}a${c}[index] = ${p}${c}; ${p}b${c}[index] = ${p}${c} }
    else { ${p}a${c}[index] = ${p}b${c}[index]; ${p}b${c}[index] = ${p}${c} }`).join('')
  const output = `if (${p}displayDelta > 0 || ${p}phase == 0) {
${['r', 'g', 'b'].map(c => `    ${p}p${c}[index] = ${p}persist(${p}p${c}[index], (${p}a${c}[index] + (${p}b${c}[index] - ${p}a${c}[index]) * ${p}c) * 255)`).join('\n')}
  }
  rgb(${p}pr[index]/255, ${p}pg[index]/255, ${p}pb[index]/255)`
  const out = `function ${p}out(index) {
  if (${p}cap) {${update}
  }
  var ${p}c = ${p}f
  ${output}
  if (index == pixelCount-1) ${p}phase = 1
}`
  const wrappers = plan.renderFns.map(name => {
    const args = name === 'render' ? 'index' : name === 'render2D' ? 'index,x,y' : 'index,x,y,z'
    return `export function ${name}(${args}) {
  if (${p}bypass) {
    ${p}r = 0; ${p}g = 0; ${p}b = 0
    ${p}in_${name}(${args})
    if (${p}displayDelta > 0 || ${p}phase == 0) {
${['r', 'g', 'b'].map(c => `      ${p}p${c}[index] = ${p}persist(${p}p${c}[index], ${p}${c} * 255)`).join('\n')}
    }
    if (${p}decay > 0) rgb(${p}pr[index]/255, ${p}pg[index]/255, ${p}pb[index]/255)
    if (index == pixelCount-1) ${p}phase = 1
    return
  }
  if (${p}cap) { ${p}r = 0; ${p}g = 0; ${p}b = 0; ${p}in_${name}(${args}) }
  ${p}out(index)
}`
  }).join('\n')
  return { code: `${prelude}\n${rewritten}\n${beforeRender}\n${out}\n${wrappers}`, plan, tunables }
}

function emitColorCapture(p: string): string {
  return `function ${p}hsv24(h,s,v) { if (${p}bypass && ${p}decay == 0) hsv24(h,s,v); ${p}captureHsv(h,s,v) }
function ${p}rgb(r,g,b) { if (${p}bypass && ${p}decay == 0) rgb(r,g,b); ${p}captureRgb(r,g,b) }
function ${p}captureRgb(r,g,b) { ${p}r = clamp(r,0,1); ${p}g = clamp(g,0,1); ${p}b = clamp(b,0,1) }
function ${p}hsv(h,s,v) { if (${p}bypass && ${p}decay == 0) hsv(h,s,v); ${p}captureHsv(h,s,v) }
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

function rewriteSlowMoSource(code: string, prefix: string): string {
  const ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
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
      if (['time', 'rgb', 'hsv', 'hsv24'].includes(name)) {
        edit(node.callee, `${prefix}${name}`)
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
