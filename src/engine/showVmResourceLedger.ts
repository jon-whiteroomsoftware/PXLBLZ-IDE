import * as acorn from 'acorn'

export const SHOW_MAX_OUTPUT_PIXELS = 2_000
export const PIXELBLAZE_VM_ARRAY_WORDS = 10_240
export const PIXELBLAZE_ARRAY_HEADER_WORDS = 4
export const PIXELBLAZE_MAX_PERSISTENT_GLOBALS = 256
export const SHOW_ARTIFACT_BUDGET_BYTES = 68_384
export const SHOW_RENDER_TARGET_PLANES = 3

// Device-compiler pricing measured on the pb32, fw 3.67
// (docs/plans/issue-715-packed-data-pricing-results.md). A per-element table
// assignment compiles to five 32-bit VM instruction words; a numeric array
// literal compiles to one data word per element plus ~6% framing. The packed
// constant is a reference price for #717 emitters, not used by the estimator.
export const MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES = 20
export const MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES = 4.25
export const MEASURED_PACKED15_BYTECODE_BYTES_PER_VALUE = 2.25

// Below this count a literal's framing share is unmeasured and the 1:1
// source price is close enough; corrections only apply to table-sized data.
const LITERAL_CORRECTION_MIN_ELEMENTS = 16

export type ShowVmAllocationCategory =
  | 'render-target'
  | 'member-pattern'
  | 'routing'
  | 'plan'
  | 'auxiliary-cache'

export interface ShowVmAllocation {
  owner: string
  category: ShowVmAllocationCategory
  elementCount: number
  words: number
}

export interface ShowVmResourceBlocker {
  kind:
    | 'output-pixel-limit'
    | 'unbounded-allocation'
    | 'vm-word-budget'
    | 'persistent-global-limit'
    | 'artifact-byte-budget'
    | 'bytecode-byte-budget'
    | 'source-parse'
  owner: string
  message: string
}

export interface ShowVmResourceLedger {
  pixelCount: number
  pixelLimit: number
  vmWordBudget: number
  renderTargetWords: number
  memberPatternWords: number
  routingWords: number
  planWords: number
  auxiliaryCacheWords: number
  totalWords: number
  remainingWords: number
  persistentGlobals: number
  persistentGlobalLimit: number
  remainingGlobals: number
  artifactBytes: number
  artifactByteBudget: number
  remainingArtifactBytes: number
  estimatedArtifactBytecodeBytes: number
  allocations: ShowVmAllocation[]
  blockers: ShowVmResourceBlocker[]
}

export interface ShowVmGeneratedAllocation {
  owner: string
  category: 'routing' | 'plan' | 'auxiliary-cache'
  elementCount: number
}

export interface ShowVmResourceLedgerInput {
  pixelCount: number
  members: Array<{ owner: string; source: string }>
  generatedAllocations?: ShowVmGeneratedAllocation[]
  persistentGlobals?: number
  artifactBytes?: number
  /** Complete delivered source; enables the bytecode-axis estimate. Absent,
   * the estimate falls back to artifactBytes and adds no blocker. */
  artifactSource?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

interface MemberAllocationAnalysis {
  allocations: ShowVmAllocation[]
  blockers: ShowVmResourceBlocker[]
}

export function buildShowVmResourceLedger(input: ShowVmResourceLedgerInput): ShowVmResourceLedger {
  const pixelCount = normalizeCount(input.pixelCount)
  const allocations: ShowVmAllocation[] = Array.from({ length: SHOW_RENDER_TARGET_PLANES }, (_, index) => (
    allocation(`Show render target plane ${index + 1}`, 'render-target', pixelCount)
  ))
  const blockers: ShowVmResourceBlocker[] = []

  if (pixelCount > SHOW_MAX_OUTPUT_PIXELS) {
    blockers.push({
      kind: 'output-pixel-limit',
      owner: 'Show output contract',
      message: `Show output contract requests ${pixelCount.toLocaleString('en-US')} pixels; compiled Shows support at most ${SHOW_MAX_OUTPUT_PIXELS.toLocaleString('en-US')}. Reduce the Installation output or target Controller pixel count.`,
    })
  }

  for (const member of input.members) {
    const analysis = analyzeMemberAllocations(member.owner, member.source, pixelCount)
    allocations.push(...analysis.allocations)
    blockers.push(...analysis.blockers)
  }

  for (const generated of input.generatedAllocations ?? []) {
    allocations.push(allocation(generated.owner, generated.category, generated.elementCount))
  }

  const wordsByCategory = (category: ShowVmAllocationCategory) => allocations
    .filter((entry) => entry.category === category)
    .reduce((sum, entry) => sum + entry.words, 0)
  const renderTargetWords = wordsByCategory('render-target')
  const memberPatternWords = wordsByCategory('member-pattern')
  const routingWords = wordsByCategory('routing')
  const planWords = wordsByCategory('plan')
  const auxiliaryCacheWords = wordsByCategory('auxiliary-cache')
  const totalWords = renderTargetWords + memberPatternWords + routingWords + planWords + auxiliaryCacheWords
  const remainingWords = PIXELBLAZE_VM_ARRAY_WORDS - totalWords
  const persistentGlobals = normalizeCount(input.persistentGlobals ?? 0)
  const remainingGlobals = PIXELBLAZE_MAX_PERSISTENT_GLOBALS - persistentGlobals
  const artifactBytes = normalizeCount(input.artifactBytes ?? 0)
  const remainingArtifactBytes = SHOW_ARTIFACT_BUDGET_BYTES - artifactBytes
  const estimatedArtifactBytecodeBytes = input.artifactSource != null
    ? estimateShowBytecodeBytes(input.artifactSource)
    : artifactBytes

  if (remainingWords < 0) {
    blockers.push({
      kind: 'vm-word-budget',
      owner: 'Whole Show',
      message: `Whole Show arrays require ${totalWords.toLocaleString('en-US')} VM words, ${(-remainingWords).toLocaleString('en-US')} over the ${PIXELBLAZE_VM_ARRAY_WORDS.toLocaleString('en-US')}-word budget. Reduce output pixels, replace an array-heavy Pattern, simplify routing, or remove an auxiliary cache.`,
    })
  }
  if (remainingGlobals < 0) {
    blockers.push({
      kind: 'persistent-global-limit',
      owner: 'Whole Show',
      message: `Whole Show code declares ${persistentGlobals.toLocaleString('en-US')} persistent globals, ${(-remainingGlobals).toLocaleString('en-US')} over the ${PIXELBLAZE_MAX_PERSISTENT_GLOBALS.toLocaleString('en-US')}-global limit. Reduce Pattern instances or consolidate persistent state.`,
    })
  }
  if (remainingArtifactBytes < 0) {
    const overage = -remainingArtifactBytes
    blockers.push({
      kind: 'artifact-byte-budget',
      owner: 'Whole Show',
      message: `Generated UTF-8 source alone, before the delivery header, is ${overage.toLocaleString('en-US')} ${overage === 1 ? 'byte' : 'bytes'} over the source-size proxy derived from the observed ${SHOW_ARTIFACT_BUDGET_BYTES.toLocaleString('en-US')}-byte compiled-bytecode activation ceiling. Reduce Pattern instances, Effects, routing, or generated specialization.`,
    })
  }
  if (remainingArtifactBytes >= 0 && estimatedArtifactBytecodeBytes > SHOW_ARTIFACT_BUDGET_BYTES) {
    const overage = estimatedArtifactBytecodeBytes - SHOW_ARTIFACT_BUDGET_BYTES
    blockers.push({
      kind: 'bytecode-byte-budget',
      owner: 'Whole Show',
      message: `Dense per-element table initialization compiles to an estimated ${estimatedArtifactBytecodeBytes.toLocaleString('en-US')} bytecode bytes, ${overage.toLocaleString('en-US')} over the measured ${SHOW_ARTIFACT_BUDGET_BYTES.toLocaleString('en-US')}-byte activation ceiling, even though the source itself fits (each table assignment compiles to ${MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES} bytes, #715). Replace per-element assignments with array literals or reduce baked data.`,
    })
  }

  return {
    pixelCount,
    pixelLimit: SHOW_MAX_OUTPUT_PIXELS,
    vmWordBudget: PIXELBLAZE_VM_ARRAY_WORDS,
    renderTargetWords,
    memberPatternWords,
    routingWords,
    planWords,
    auxiliaryCacheWords,
    totalWords,
    remainingWords,
    persistentGlobals,
    persistentGlobalLimit: PIXELBLAZE_MAX_PERSISTENT_GLOBALS,
    remainingGlobals,
    artifactBytes,
    artifactByteBudget: SHOW_ARTIFACT_BUDGET_BYTES,
    remainingArtifactBytes,
    estimatedArtifactBytecodeBytes,
    allocations,
    blockers,
  }
}

/**
 * Bytecode-axis estimate of the delivered source. The 68,384-byte budget is a
 * bytecode measurement that the artifact gate applies to source bytes as a
 * proxy; #715 measured the proxy diverging per construct, and dangerously so
 * only for dense per-element table assignments (20 bytecode bytes each,
 * regardless of source spelling). The estimate reprices exactly the two
 * measured data constructs and keeps every other byte at source parity:
 *
 * - `name[<int>] = <number>` statements: 20 bytes (five VM words).
 * - all-numeric array literals of table size: 4.25 bytes per element.
 *
 * Loops, member code, and generated logic stay 1:1, which #715 measured as
 * parity-to-conservative for every current emission. Unparsable source falls
 * back to its byte length.
 */
export function estimateShowBytecodeBytes(source: string): number {
  const sourceBytes = byteLength(source)
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch {
    return sourceBytes
  }
  let correction = 0
  const isNumeric = (node: Node | undefined): boolean => Boolean(node && (
    (node.type === 'Literal' && typeof node.value === 'number')
    || (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+') && isNumeric(node.argument))
  ))
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as Node
    // Matched at the AssignmentExpression itself, not its statement wrapper:
    // comma-separated tables (`q[0] = 1, q[1] = 2, ...`) parse as one
    // SequenceExpression whose assignments would otherwise stay unpriced.
    if (node.type === 'AssignmentExpression'
      && node.operator === '='
      && node.left?.type === 'MemberExpression'
      && node.left.computed
      && node.left.object?.type === 'Identifier'
      && isNumeric(node.left.property)
      && isNumeric(node.right)) {
      correction += MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES - (node.end - node.start)
      return
    }
    if (node.type === 'ArrayExpression'
      && node.elements.length >= LITERAL_CORRECTION_MIN_ELEMENTS
      && (node.elements as Node[]).every((element) => isNumeric(element))) {
      correction += MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES * node.elements.length - (node.end - node.start)
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue
      visit(child)
    }
  }
  visit(ast.body)
  return Math.ceil(sourceBytes + correction)
}

export function countShowPersistentGlobals(source: string): number {
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  let count = 0
  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const item of declaration.declarations as Node[]) count += bindingCount(item.id)
  }
  return count
}

export function inspectGeneratedShowVmAllocations(source: string): ShowVmGeneratedAllocation[] {
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  const allocations: ShowVmGeneratedAllocation[] = []
  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const item of declaration.declarations as Node[]) {
      const name = identifierName(item.id)
      const patternStateBank = Boolean(name && /^__pxlblz_show_c\d+_slot_(?:initialized|bank_\d+)$/.test(name))
      if (!name || (!patternStateBank && /^__pxlblz_show_c\d+_/.test(name)) || isReservedRenderTargetName(name)) continue
      const elementCount = declaredArraySize(item.init)
      if (elementCount === null) continue
      if (patternStateBank) {
        allocations.push({
          owner: `Compiler Pattern state bank: ${name}`,
          category: 'auxiliary-cache',
          elementCount,
        })
      } else if (name.includes('route_pixels')) {
        allocations.push({
          owner: `Compiler physical routing: ${name}`,
          category: 'routing',
          elementCount,
        })
      } else if (name.includes('plans')) {
        allocations.push({
          owner: `Compiler scene plans: ${name}`,
          category: 'plan',
          elementCount,
        })
      } else {
        allocations.push({
          owner: `Compiler auxiliary cache: ${name}`,
          category: 'auxiliary-cache',
          elementCount,
        })
      }
    }
  }
  return allocations
}

function analyzeMemberAllocations(owner: string, source: string, pixelCount: number): MemberAllocationAnalysis {
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parse error'
    return {
      allocations: [],
      blockers: [{
        kind: 'source-parse',
        owner,
        message: `${owner} could not be inspected for VM arrays: ${detail}`,
      }],
    }
  }

  const allocations: ShowVmAllocation[] = []
  const blockers: ShowVmResourceBlocker[] = []
  const scalarConstants = collectTopLevelScalarConstants(ast, pixelCount)

  visit(ast, undefined)
  return { allocations, blockers }

  function visit(node: unknown, bindingName: string | undefined): void {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, bindingName)
      return
    }

    const current = node as Node
    if (current.type === 'VariableDeclarator') {
      const name = identifierName(current.id) ?? 'anonymous array'
      visit(current.init, name)
      return
    }

    if (current.type === 'ArrayExpression') {
      const elementCount = current.elements.length
      allocations.push(allocation(`${owner}: ${bindingName ?? 'array literal'}`, 'member-pattern', elementCount))
      for (const element of current.elements) visit(element, bindingName)
      return
    }

    if (current.type === 'CallExpression' && current.callee?.type === 'Identifier' && current.callee.name === 'array') {
      const argument = current.arguments?.[0]
      const elementCount = evaluateConstantSize(argument, pixelCount, scalarConstants)
      const allocationOwner = `${owner}: ${bindingName ?? 'array allocation'}`
      if (elementCount === null) {
        const expression = argument && Number.isFinite(argument.start) && Number.isFinite(argument.end)
          ? source.slice(argument.start, argument.end)
          : 'dynamic expression'
        blockers.push({
          kind: 'unbounded-allocation',
          owner: allocationOwner,
          message: `${allocationOwner} uses array(${expression}), whose maximum size cannot be proven. Replace it with a literal, constant expression, or array(pixelCount).`,
        })
      } else {
        allocations.push(allocation(allocationOwner, 'member-pattern', elementCount))
      }
      for (const argumentNode of current.arguments ?? []) visit(argumentNode, bindingName)
      return
    }

    for (const [key, child] of Object.entries(current)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue
      visit(child, bindingName)
    }
  }
}

function allocation(
  owner: string,
  category: ShowVmAllocationCategory,
  elementCount: number,
): ShowVmAllocation {
  const normalizedElements = normalizeCount(elementCount)
  return {
    owner,
    category,
    elementCount: normalizedElements,
    words: normalizedElements + PIXELBLAZE_ARRAY_HEADER_WORDS,
  }
}

function identifierName(node: Node | undefined): string | null {
  return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : null
}

function bindingCount(node: Node | undefined): number {
  if (!node) return 0
  if (node.type === 'Identifier') return 1
  if (node.type === 'RestElement') return bindingCount(node.argument)
  if (node.type === 'AssignmentPattern') return bindingCount(node.left)
  if (node.type === 'ArrayPattern') return (node.elements as Node[]).reduce((sum, element) => sum + bindingCount(element), 0)
  if (node.type === 'ObjectPattern') return (node.properties as Node[]).reduce((sum, property) => (
    sum + bindingCount(property.type === 'RestElement' ? property.argument : property.value)
  ), 0)
  return 0
}

function declaredArraySize(node: Node | undefined): number | null {
  if (!node) return null
  if (node.type === 'ArrayExpression') return node.elements.length
  if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier' || node.callee.name !== 'array') return null
  return evaluateConstantSize(node.arguments?.[0], SHOW_MAX_OUTPUT_PIXELS)
}

function isReservedRenderTargetName(name: string): boolean {
  return name.includes('render_target') || name.includes('_renderTarget') || name.includes('_rt_plane')
}

function collectTopLevelScalarConstants(ast: Node, pixelCount: number): Map<string, number> {
  const constants = new Map<string, number>()
  for (const statement of ast.body as Node[]) {
    if (statement.type === 'ExportNamedDeclaration') continue
    const declaration = statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const item of declaration.declarations as Node[]) {
      const name = identifierName(item.id)
      if (!name) continue
      const value = evaluateConstantNumber(item.init, pixelCount, constants)
      if (value !== null && Number.isFinite(value)) constants.set(name, value)
    }
  }
  return constants
}

function evaluateConstantSize(
  node: Node | undefined,
  pixelCount: number,
  constants: ReadonlyMap<string, number> = new Map(),
): number | null {
  if (!node) return 0
  if (node.type === 'Literal' && typeof node.value === 'number') return normalizeCount(node.value)
  if (node.type === 'Identifier' && node.name === 'pixelCount') return pixelCount
  if (node.type === 'Identifier' && constants.has(node.name)) return normalizeCount(constants.get(node.name)!)
  if (node.type === 'UnaryExpression') {
    const value = evaluateConstantNumber(node.argument, pixelCount, constants)
    if (value === null) return null
    if (node.operator === '+') return normalizeCount(value)
    if (node.operator === '-') return normalizeCount(-value)
    return null
  }
  const value = evaluateConstantNumber(node, pixelCount, constants)
  return value === null ? null : normalizeCount(value)
}

function evaluateConstantNumber(
  node: Node | undefined,
  pixelCount: number,
  constants: ReadonlyMap<string, number> = new Map(),
): number | null {
  if (!node) return null
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node.type === 'Identifier' && node.name === 'pixelCount') return pixelCount
  if (node.type === 'Identifier' && constants.has(node.name)) return constants.get(node.name)!
  if (node.type === 'UnaryExpression') {
    const value = evaluateConstantNumber(node.argument, pixelCount, constants)
    if (value === null) return null
    if (node.operator === '+') return value
    if (node.operator === '-') return -value
    return null
  }
  if (node.type === 'BinaryExpression') {
    const left = evaluateConstantNumber(node.left, pixelCount, constants)
    const right = evaluateConstantNumber(node.right, pixelCount, constants)
    if (left === null || right === null) return null
    if (node.operator === '+') return left + right
    if (node.operator === '-') return left - right
    if (node.operator === '*') return left * right
    if (node.operator === '/') return right === 0 ? null : left / right
    if (node.operator === '%') return right === 0 ? null : left % right
    if (node.operator === '**') return left ** right
    return null
  }
  if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
    const values = (node.arguments ?? []).map((argument: Node) => evaluateConstantNumber(argument, pixelCount, constants))
    if (values.some((value: number | null) => value === null)) return null
    const exact = values as number[]
    if (node.callee.name === 'floor' && exact.length === 1) return Math.floor(exact[0])
    if (node.callee.name === 'ceil' && exact.length === 1) return Math.ceil(exact[0])
    if (node.callee.name === 'round' && exact.length === 1) return Math.round(exact[0])
    if (node.callee.name === 'min' && exact.length > 0) return Math.min(...exact)
    if (node.callee.name === 'max' && exact.length > 0) return Math.max(...exact)
  }
  return null
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
