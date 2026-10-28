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
export const SLOW_MO_STEP_STOPS = [16, 32] as const

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
  if (settings.persistence !== null) {
    throw new RangeError('Slow-mo persistence is not implemented until slice C.')
  }
  if (plan.structure === 'clock') return { code, plan, tunables: {} }
  const p = `${reservedStem('slowmo')}_`
  const rewritten = rewriteSlowMoSource(code, p)
  const initializers = Object.entries(tunables).map(([name, value]) => `var ${name} = ${value}`).join('\n')
  const prelude = `${initializers}
var ${p}T = 0, ${p}acc = 0, ${p}f = 0, ${p}phase = 0, ${p}cap = 0
var ${p}r = 0, ${p}g = 0, ${p}b = 0
var ${p}ar = array(pixelCount), ${p}ag = array(pixelCount), ${p}ab = array(pixelCount)
var ${p}br = array(pixelCount), ${p}bg = array(pixelCount), ${p}bb = array(pixelCount)
function ${p}time(interval) { return (${p}T % interval) / interval }
function ${p}rgb(r,g,b) { ${p}r = clamp(r,0,1); ${p}g = clamp(g,0,1); ${p}b = clamp(b,0,1) }
function ${p}hsv(h,s,v) {
  if (s == 0) { ${p}rgb(v,v,v); return }
  var ${p}h6 = ((h % 1) + 1) % 1 * 6
  var ${p}i = floor(${p}h6), ${p}hf = ${p}h6 - ${p}i
  var ${p}hp = v * (1-s), ${p}hq = v * (1-s*${p}hf), ${p}ht = v * (1-s*(1-${p}hf))
  if (${p}i % 6 == 0) ${p}rgb(v,${p}ht,${p}hp)
  else if (${p}i % 6 == 1) ${p}rgb(${p}hq,v,${p}hp)
  else if (${p}i % 6 == 2) ${p}rgb(${p}hp,v,${p}ht)
  else if (${p}i % 6 == 3) ${p}rgb(${p}hp,${p}hq,v)
  else if (${p}i % 6 == 4) ${p}rgb(${p}ht,${p}hp,v)
  else ${p}rgb(v,${p}hp,${p}hq)
}`
  const beforeRender = `export function beforeRender(delta) {
  ${p}cap = 0
  if (${p}phase == 0) { ${p}in_beforeRender(0); ${p}cap = 1 }
  else {
    ${p}acc += delta * ${p}rate
    var ${p}n = 0
    while (${p}acc >= ${p}step && ${p}n < 4) {
      ${p}acc -= ${p}step
      ${p}T += ${p}step * 0.0000152587890625
      if (${p}T >= 16384) ${p}T -= 16384
      ${p}in_beforeRender(${p}step); ${p}n += 1
    }
    if (${p}acc >= ${p}step) ${p}acc = ${p}acc % ${p}step
    ${p}cap = ${p}n > 0
  }
  ${p}f = ${p}acc / ${p}step
}`
  const update = ['r', 'g', 'b'].map(c => `
    if (${p}phase == 0) { ${p}a${c}[index] = ${p}${c}; ${p}b${c}[index] = ${p}${c} }
    else { ${p}a${c}[index] = ${p}b${c}[index]; ${p}b${c}[index] = ${p}${c} }`).join('')
  const channels = ['r', 'g', 'b'].map(c => `${p}a${c}[index] + (${p}b${c}[index] - ${p}a${c}[index]) * ${p}c`).join(', ')
  const out = `function ${p}out(index,o) {
  if (${p}cap) {${update}
  }
  var ${p}u = clamp((${p}f-o)/(1-${p}width),0,1)
  var ${p}c = ${p}curve == 0 ? (${p}u >= 1) : ${p}curve == 1 ? ${p}u : ${p}u*${p}u*(3-2*${p}u)
  rgb(${channels})
  if (index == pixelCount-1) ${p}phase = 1
}`
  const offsets = plan.renderFns.map(name => {
    const dimension = name === 'render' ? '1D' : name === 'render2D' ? '2D' : '3D'
    const args = name === 'render' ? 'index' : name === 'render2D' ? 'index,x,y' : 'index,x,y,z'
    const sweep = name === 'render' ? 'index/pixelCount' : 'clamp(x,0,1)'
    const radial = name === 'render' ? 'abs(2*index/pixelCount-1)'
      : name === 'render2D' ? 'clamp(sqrt(dx*dx+dy*dy)/0.7071067811865476,0,1)'
        : 'clamp(sqrt(dx*dx+dy*dy+dz*dz)/0.8660254037844386,0,1)'
    const deltas = name === 'render' ? '' : `var dx=x-0.5, dy=y-0.5${name === 'render3D' ? ', dz=z-0.5' : ''}`
    return `function ${p}offset${dimension}(${args}) {
  if (${p}shape == 2) return (index * 0.6180267333984375) % 1
  if (${p}shape == 0) return ${sweep}
  ${deltas}
  return ${radial}
}`
  }).join('\n')
  const wrappers = plan.renderFns.map(name => {
    const args = name === 'render' ? 'index' : name === 'render2D' ? 'index,x,y' : 'index,x,y,z'
    const dimension = name === 'render' ? '1D' : name === 'render2D' ? '2D' : '3D'
    return `export function ${name}(${args}) {
  if (${p}cap) { ${p}r = 0; ${p}g = 0; ${p}b = 0; ${p}in_${name}(${args}) }
  ${p}out(index,${p}width == 0 ? 0 : ${p}width * ${p}offset${dimension}(${args}))
}`
  }).join('\n')
  return { code: `${prelude}\n${offsets}\n${rewritten}\n${beforeRender}\n${out}\n${wrappers}`, plan, tunables }
}

export function slowMoTunables(settings: SlowMoSettings): Record<string, number> {
  if (!Number.isFinite(settings.rate) || settings.rate <= 0 || settings.rate > 1) {
    throw new RangeError('Slow-mo rate must be finite and greater than 0 and at most 1.')
  }
  if (!Number.isFinite(settings.stepMs) || settings.stepMs <= 0 || settings.stepMs > 32767) {
    throw new RangeError('Slow-mo step must be finite and greater than 0 and at most 32767 ms.')
  }
  if (!Number.isFinite(settings.stagger.width) || settings.stagger.width < 0 || settings.stagger.width > 0.9) {
    throw new RangeError('Slow-mo stagger width must be finite and between 0 and 0.9.')
  }
  if (!['sweep', 'radial', 'scatter'].includes(settings.stagger.shape)) {
    throw new RangeError('Slow-mo stagger shape must be sweep, radial, or scatter.')
  }
  if (settings.inBetween === 'clock') return {}
  const p = `${reservedStem('slowmo')}_`
  return {
    [`${p}rate`]: settings.rate,
    [`${p}step`]: settings.stepMs,
    [`${p}curve`]: settings.inBetween === 'hold' ? 0 : settings.inBetween === 'blend' ? 1 : 2,
    [`${p}shape`]: ['sweep', 'radial', 'scatter'].indexOf(settings.stagger.shape),
    [`${p}width`]: settings.stagger.width,
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
        edit(node.callee, `${prefix}${name === 'hsv24' ? 'hsv' : name}`)
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
