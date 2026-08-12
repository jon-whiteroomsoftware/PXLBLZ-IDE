import * as acorn from 'acorn'
import { type PatternMetadata, type RenderFns } from './loadPattern'
import { emitFixedPoint } from './fxEmit'
import type { ParseError } from './validate'

export interface BundleMetadata extends PatternMetadata {
  renderFns: RenderFns
}

// ── AST utilities ────────────────────────────────────────────────────────────

function walkAst(node: unknown, visitor: (n: unknown) => void): void {
  if (!node || typeof node !== 'object') return
  visitor(node)
  for (const val of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, visitor)
    } else {
      walkAst(val, visitor)
    }
  }
}

function walkAstWithParent(
  node: unknown,
  parent: Record<string, unknown> | undefined,
  visitor: (n: Record<string, unknown>, parent: Record<string, unknown> | undefined) => void,
): void {
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  visitor(record, parent)
  for (const val of Object.values(record)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAstWithParent(item, record, visitor)
    } else {
      walkAstWithParent(val, record, visitor)
    }
  }
}

function collectIdentifierReferences(ast: unknown): Set<string> {
  const references = new Set<string>()
  walkAstWithParent(ast, undefined, (node, parent) => {
    if (node['type'] !== 'Identifier') return
    if (parent?.['type'] === 'VariableDeclarator' && parent['id'] === node) return
    if (
      (parent?.['type'] === 'FunctionDeclaration' ||
        parent?.['type'] === 'FunctionExpression' ||
        parent?.['type'] === 'ArrowFunctionExpression') &&
      (parent['id'] === node || ((parent['params'] as unknown[]) ?? []).includes(node))
    ) return
    if (parent?.['type'] === 'MemberExpression' && !parent['computed'] && parent['property'] === node) return
    if (parent?.['type'] === 'Property' && !parent['computed'] && parent['key'] === node) return
    if (
      (parent?.['type'] === 'LabeledStatement' || parent?.['type'] === 'BreakStatement' ||
        parent?.['type'] === 'ContinueStatement') && parent['label'] === node
    ) return
    references.add(node['name'] as string)
  })
  return references
}

function parseScript(src: string): unknown {
  return acorn.parse(src, { ecmaVersion: 2020, sourceType: 'script', locations: true })
}

function parseModule(src: string): unknown {
  return acorn.parse(src, { ecmaVersion: 2020, sourceType: 'module', locations: true })
}

const LIBRARY_TOP_LEVEL_RULE =
  'Library top level may contain only function declarations, var declarations, and comments'

export function validateLibraryContent(source: string): ParseError[] {
  let ast: acorn.Program
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script', locations: true })
  } catch (e) {
    const err = e as { message: string; loc?: { line: number; column: number } }
    return [{
      message: err.message.replace(/\s*\(\d+:\d+\)$/, ''),
      line: err.loc?.line ?? 1,
      column: err.loc?.column ?? 0,
    }]
  }

  const errors: ParseError[] = []
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration') continue
    if (node.type === 'VariableDeclaration' && node.kind === 'var') continue
    const start = node.loc?.start
    errors.push({
      message: LIBRARY_TOP_LEVEL_RULE,
      line: start?.line ?? 1,
      column: start?.column ?? 0,
    })
  }
  return errors
}

// ── metadata extraction ──────────────────────────────────────────────────────

const RENDER_FN_NAMES = new Set(['beforeRender', 'render2D', 'render', 'render3D'])
const CONTROL_PREFIXES = ['hsvPicker', 'rgbPicker', 'slider', 'toggle'] as const

function labelFromSuffix(suffix: string): string {
  return suffix.replace(/([A-Z])/g, ' $1').trim()
}

const SKIP_VAR_NAMES = new Set([...['beforeRender', 'render2D', 'render', 'render3D']])

function extractMetadata(ast: unknown): BundleMetadata {
  const exportedVars: string[] = []
  const patternVars: string[] = []
  const patternFunctions: string[] = []
  const controls: PatternMetadata['controls'] = []
  const renderFns: RenderFns = {
    hasBeforeRender: false,
    hasRender2D: false,
    hasRender: false,
    hasRender3D: false,
  }
  const seen = new Set<string>()

  function addVar(name: string): void {
    if (!seen.has(name) && !SKIP_VAR_NAMES.has(name)) {
      seen.add(name)
      patternVars.push(name)
    }
  }

  function addFunction(name: string): void {
    if (!patternFunctions.includes(name)) patternFunctions.push(name)
  }

  const topLevel = (ast as { body: Record<string, unknown>[] }).body ?? []

  for (const node of topLevel) {
    const n = node as Record<string, unknown>

    if (n['type'] === 'ExportNamedDeclaration') {
      const decl = n['declaration'] as Record<string, unknown> | null
      if (!decl) continue

      if (decl['type'] === 'VariableDeclaration') {
        for (const d of (decl['declarations'] as Record<string, unknown>[]) ?? []) {
          const id = d['id'] as Record<string, unknown>
          if (id?.['type'] === 'Identifier') {
            const name = id['name'] as string
            exportedVars.push(name)
            addVar(name)
          }
        }
      }

      if (decl['type'] === 'FunctionDeclaration') {
        const name = (decl['id'] as Record<string, unknown>)?.['name'] as string
        if (!name) continue
        addFunction(name)
        markRenderFn(name, renderFns)
        for (const prefix of CONTROL_PREFIXES) {
          if (name.startsWith(prefix) && name.length > prefix.length) {
            const label = labelFromSuffix(name.slice(prefix.length))
            const control: PatternMetadata['controls'][number] = { exportName: name, kind: prefix, label }
            if (prefix === 'hsvPicker' || prefix === 'rgbPicker') {
              control.pickerVars = extractPickerVars(decl)
            }
            controls.push(control)
            break
          }
        }
      }
    }

    // Non-exported top-level var declarations
    if (n['type'] === 'VariableDeclaration') {
      for (const d of (n['declarations'] as Record<string, unknown>[]) ?? []) {
        const id = d['id'] as Record<string, unknown>
        if (id?.['type'] === 'Identifier') addVar(id['name'] as string)
      }
    }

    // Non-exported function declarations (render fns don't need to be exported)
    if (n['type'] === 'FunctionDeclaration') {
      const name = (n['id'] as Record<string, unknown>)?.['name'] as string
      if (name) addFunction(name)
      if (name && RENDER_FN_NAMES.has(name)) markRenderFn(name, renderFns)
    }
  }

  return { exportedVars, patternVars, patternFunctions, controls, renderFns }
}

/** Metadata-only inspection; does not resolve libraries or execute Pattern source. */
export function inspectPatternMetadata(patternSrc: string): BundleMetadata {
  return extractMetadata(parseModule(patternSrc))
}

// A picker function maps its parameters to top-level vars via simple
// `someVar = param` assignments, e.g. `rgbPickerA(r,g,b){ ar=r; ag=g; ab=b }`.
// Recover the backing var for each parameter (in param order) so the UI can
// seed the swatch from those vars' initial values. Parameters with no matching
// assignment yield an empty slot (filtered out by the caller via length check).
function extractPickerVars(decl: Record<string, unknown>): string[] {
  const params = (decl['params'] as Record<string, unknown>[]) ?? []
  const paramNames = params.map((p) => (p?.['type'] === 'Identifier' ? (p['name'] as string) : ''))

  // param name → assigned var name
  const assigned = new Map<string, string>()
  walkAst(decl['body'], (n) => {
    const node = n as Record<string, unknown>
    if (node?.['type'] !== 'AssignmentExpression' || node['operator'] !== '=') return
    const left = node['left'] as Record<string, unknown>
    const right = node['right'] as Record<string, unknown>
    if (left?.['type'] === 'Identifier' && right?.['type'] === 'Identifier') {
      const rightName = right['name'] as string
      if (!assigned.has(rightName)) assigned.set(rightName, left['name'] as string)
    }
  })

  return paramNames.map((p) => assigned.get(p) ?? '')
}

function markRenderFn(name: string, fns: RenderFns): void {
  if (name === 'beforeRender') fns.hasBeforeRender = true
  else if (name === 'render2D') fns.hasRender2D = true
  else if (name === 'render') fns.hasRender = true
  else if (name === 'render3D') fns.hasRender3D = true
}

// ── library parsing ──────────────────────────────────────────────────────────

interface LibFnEntry {
  src: string // full function declaration text
  inlineEligible: boolean
}
type LibFnMap = Map<string, LibFnEntry>

interface LibVarEntry {
  name: string
  src: string
  initializerRefs: Set<string>
}

interface LibVarDeclaration {
  entries: LibVarEntry[]
}

function parseLibraryVarDeclarations(libSrc: string): LibVarDeclaration[] {
  const ast = parseScript(libSrc) as { body: Record<string, unknown>[] }
  const declarations: LibVarDeclaration[] = []
  for (const node of ast.body) {
    if (node['type'] === 'VariableDeclaration') {
      const entries = ((node['declarations'] as Record<string, unknown>[]) ?? [])
        .filter((declaration) => (declaration['id'] as Record<string, unknown>)?.['type'] === 'Identifier')
        .map((declaration) => {
          const id = declaration['id'] as Record<string, unknown>
          return {
            name: id['name'] as string,
            src: libSrc.slice(declaration['start'] as number, declaration['end'] as number),
            initializerRefs: declaration['init']
              ? collectIdentifierReferences(declaration['init'])
              : new Set<string>(),
          }
        })
      if (entries.length > 0) declarations.push({ entries })
    }
  }
  return declarations
}

function parseLibraryFns(libSrc: string): LibFnMap {
  const ast = parseScript(libSrc) as { body: Record<string, unknown>[] }
  const fns: LibFnMap = new Map()
  let previousEnd = 0
  for (const node of ast.body) {
    if (node['type'] === 'FunctionDeclaration' && node['id']) {
      const id = node['id'] as Record<string, unknown>
      const name = id['name'] as string
      const leadingLines = libSrc.slice(previousEnd, node['start'] as number).trimEnd().split('\n')
      const nearestLeadingLine = leadingLines[leadingLines.length - 1]
      fns.set(name, {
        src: libSrc.slice(node['start'] as number, node['end'] as number),
        inlineEligible: nearestLeadingLine?.trim() === '// @inline',
      })
    }
    previousEnd = node['end'] as number
  }
  return fns
}

// ── library reference collection ─────────────────────────────────────────────

interface LibRef {
  namespace: string
  fnName: string
  start: number // character offset of `lib.fn` in the source being analysed
  end: number
}

interface InlineLibRef extends LibRef {
  callStart: number
  callEnd: number
  args: Array<{ start: number; end: number; sideEffectFree: boolean }>
}

const SAFE_MEMBER_CALL_GLOBALS = new Set(['Array', 'JSON', 'Math', 'Number', 'Object', 'String'])

function addPatternIdentifier(names: Set<string>, node: Record<string, unknown> | undefined): void {
  if (node?.['type'] === 'Identifier') names.add(node['name'] as string)
}

function collectDeclaredIdentifiers(ast: unknown): Set<string> {
  const names = new Set<string>()
  walkAst(ast, (node) => {
    const n = node as Record<string, unknown>
    if (n['type'] === 'VariableDeclarator') {
      addPatternIdentifier(names, n['id'] as Record<string, unknown>)
    }
    if (n['type'] === 'FunctionDeclaration') {
      addPatternIdentifier(names, n['id'] as Record<string, unknown>)
    }
    if (
      n['type'] === 'FunctionDeclaration' ||
      n['type'] === 'FunctionExpression' ||
      n['type'] === 'ArrowFunctionExpression'
    ) {
      for (const param of (n['params'] as Record<string, unknown>[]) ?? []) {
        addPatternIdentifier(names, param)
      }
    }
  })
  return names
}

function collectMemberCallRefs(ast: unknown): LibRef[] {
  const refs: LibRef[] = []
  walkAst(ast, (node) => {
    const n = node as Record<string, unknown>
    if (n['type'] !== 'CallExpression') return
    const callee = n['callee'] as Record<string, unknown>
    if (callee?.['type'] !== 'MemberExpression') return
    if (callee['computed']) return
    const obj = callee['object'] as Record<string, unknown>
    const prop = callee['property'] as Record<string, unknown>
    if (obj?.['type'] !== 'Identifier' || prop?.['type'] !== 'Identifier') return
    refs.push({
      namespace: obj['name'] as string,
      fnName: prop['name'] as string,
      start: callee['start'] as number,
      end: callee['end'] as number,
    })
  })
  return refs
}

function collectLibraryRefs(ast: unknown, knownLibs: Set<string>): LibRef[] {
  return collectMemberCallRefs(ast).filter((ref) => knownLibs.has(ref.namespace))
}

function isSideEffectFreeInlineArgument(node: Record<string, unknown>): boolean {
  switch (node['type']) {
    case 'Identifier':
    case 'Literal':
      return true
    case 'UnaryExpression':
      return isSideEffectFreeInlineArgument(node['argument'] as Record<string, unknown>)
    case 'BinaryExpression':
    case 'LogicalExpression':
      return (
        isSideEffectFreeInlineArgument(node['left'] as Record<string, unknown>) &&
        isSideEffectFreeInlineArgument(node['right'] as Record<string, unknown>)
      )
    case 'ConditionalExpression':
      return (
        isSideEffectFreeInlineArgument(node['test'] as Record<string, unknown>) &&
        isSideEffectFreeInlineArgument(node['consequent'] as Record<string, unknown>) &&
        isSideEffectFreeInlineArgument(node['alternate'] as Record<string, unknown>)
      )
    case 'MemberExpression':
      return (
        isSideEffectFreeInlineArgument(node['object'] as Record<string, unknown>) &&
        (!node['computed'] || isSideEffectFreeInlineArgument(node['property'] as Record<string, unknown>))
      )
    case 'ArrayExpression':
      return ((node['elements'] as Array<Record<string, unknown> | null>) ?? [])
        .every((element) => element === null || isSideEffectFreeInlineArgument(element))
    case 'CallExpression': { // Nested Namespace.inline.fn(...) calls are compile-time expressions.
      const callee = node['callee'] as Record<string, unknown>
      const qualifier = callee?.['type'] === 'MemberExpression'
        ? callee['object'] as Record<string, unknown>
        : undefined
      const inline = qualifier?.['type'] === 'MemberExpression'
        ? qualifier['property'] as Record<string, unknown>
        : undefined
      if (
        callee?.['type'] !== 'MemberExpression' || callee['computed'] ||
        qualifier?.['type'] !== 'MemberExpression' || qualifier['computed'] ||
        inline?.['type'] !== 'Identifier' || inline['name'] !== 'inline'
      ) return false
      return ((node['arguments'] as Record<string, unknown>[]) ?? [])
        .every((argument) => isSideEffectFreeInlineArgument(argument))
    }
    default:
      return false
  }
}

function collectInlineLibraryRefs(ast: unknown): InlineLibRef[] {
  const refs: InlineLibRef[] = []
  walkAst(ast, (node) => {
    const call = node as Record<string, unknown>
    if (call['type'] !== 'CallExpression') return
    const callee = call['callee'] as Record<string, unknown>
    if (callee?.['type'] !== 'MemberExpression' || callee['computed']) return
    const qualifier = callee['object'] as Record<string, unknown>
    const fn = callee['property'] as Record<string, unknown>
    if (qualifier?.['type'] !== 'MemberExpression' || qualifier['computed']) return
    const namespace = qualifier['object'] as Record<string, unknown>
    const inline = qualifier['property'] as Record<string, unknown>
    if (
      namespace?.['type'] !== 'Identifier' ||
      inline?.['type'] !== 'Identifier' || inline['name'] !== 'inline' ||
      fn?.['type'] !== 'Identifier'
    ) return
    refs.push({
      namespace: namespace['name'] as string,
      fnName: fn['name'] as string,
      start: callee['start'] as number,
      end: callee['end'] as number,
      callStart: call['start'] as number,
      callEnd: call['end'] as number,
      args: ((call['arguments'] as Record<string, unknown>[]) ?? []).map((arg) => ({
        start: arg['start'] as number,
        end: arg['end'] as number,
        sideEffectFree: isSideEffectFreeInlineArgument(arg),
      })),
    })
  })
  return refs
}

function collectUnknownLibraryRefs(ast: unknown, knownLibs: Set<string>): LibRef[] {
  const declared = collectDeclaredIdentifiers(ast)
  return collectMemberCallRefs(ast).filter((ref) => (
    !knownLibs.has(ref.namespace) &&
    !declared.has(ref.namespace) &&
    !SAFE_MEMBER_CALL_GLOBALS.has(ref.namespace)
  ))
}

// ── dependency resolution (BFS) ───────────────────────────────────────────────

interface ResolvedFn {
  namespace: string
  fnName: string
}

function resolveAllDeps(
  initialRefs: LibRef[],
  libFnMaps: Record<string, LibFnMap>,
  allNamespaces: Set<string>,
): ResolvedFn[] {
  const seen = new Set<string>()
  const queue: ResolvedFn[] = []
  const result: ResolvedFn[] = []

  function enqueue(namespace: string, fnName: string): void {
    const key = `${namespace}.${fnName}`
    if (!seen.has(key)) {
      seen.add(key)
      queue.push({ namespace, fnName })
    }
  }

  for (const ref of initialRefs) enqueue(ref.namespace, ref.fnName)

  while (queue.length > 0) {
    const item = queue.shift()!
    result.push(item)

    const libFns = libFnMaps[item.namespace]
    const entry = libFns?.get(item.fnName)
    if (!entry) continue

    // Transitive internal deps (bare calls to other fns in the same library)
    const fnAst = parseScript(entry.src)
    const libFnNames = new Set(libFns!.keys())
    walkAst(fnAst, (node) => {
      const n = node as Record<string, unknown>
      if (n['type'] === 'CallExpression') {
        const callee = n['callee'] as Record<string, unknown>
        if (callee?.['type'] === 'Identifier') {
          const name = callee['name'] as string
          if (libFnNames.has(name)) enqueue(item.namespace, name)
        }
      }
    })

    // Cross-library refs inside this function
    for (const ref of collectLibraryRefs(fnAst, allNamespaces)) {
      enqueue(ref.namespace, ref.fnName)
    }
  }

  return result
}

// ── source rewriting ─────────────────────────────────────────────────────────

interface Rewrite {
  start: number
  end: number
  text: string
}

function rewriteSource(src: string, rewrites: Rewrite[]): string {
  const sorted = [...rewrites].sort((a, b) => b.start - a.start)
  for (const r of sorted) {
    src = src.slice(0, r.start) + r.text + src.slice(r.end)
  }
  return src
}

function mangle(namespace: string, fnName: string): string {
  return `_${namespace}_${fnName}`
}

function inlineFn(
  entry: LibFnEntry,
  namespace: string,
  libFns: LibFnMap,
  allNamespaces: Set<string>,
): string {
  const ast = parseScript(entry.src) as { body: Record<string, unknown>[] }
  const rewrites: Rewrite[] = []
  const libFnNames = new Set(libFns.keys())

  // Rename the function declaration itself
  const funcDecl = ast.body[0]
  if (funcDecl?.['type'] === 'FunctionDeclaration') {
    const id = funcDecl['id'] as Record<string, unknown>
    rewrites.push({
      start: id['start'] as number,
      end: id['end'] as number,
      text: mangle(namespace, id['name'] as string),
    })
  }

  // Rewrite bare calls to other same-library functions
  // and cross-library namespace.fn() calls within this function body
  walkAst(ast, (node) => {
    const n = node as Record<string, unknown>
    if (n['type'] !== 'CallExpression') return
    const callee = n['callee'] as Record<string, unknown>

    if (callee?.['type'] === 'Identifier') {
      const name = callee['name'] as string
      if (libFnNames.has(name)) {
        rewrites.push({
          start: callee['start'] as number,
          end: callee['end'] as number,
          text: mangle(namespace, name),
        })
      }
    }

    if (callee?.['type'] === 'MemberExpression' && !callee['computed']) {
      const obj = callee['object'] as Record<string, unknown>
      const prop = callee['property'] as Record<string, unknown>
      if (obj?.['type'] === 'Identifier' && allNamespaces.has(obj['name'] as string)) {
        rewrites.push({
          start: callee['start'] as number,
          end: callee['end'] as number,
          text: mangle(obj['name'] as string, prop['name'] as string),
        })
      }
    }
  })

  return rewriteSource(entry.src, rewrites)
}

function expandInlineCall(
  ref: InlineLibRef,
  entry: LibFnEntry,
  libFns: LibFnMap,
  allNamespaces: Set<string>,
  argumentSources: string[],
): string {
  if (!entry.inlineEligible) {
    throw new Error(`Library function "${ref.namespace}.${ref.fnName}" is not eligible for call-site inlining`)
  }

  const ast = parseScript(entry.src) as { body: Record<string, unknown>[] }
  const declaration = ast.body[0]
  const params = (declaration?.['params'] as Record<string, unknown>[]) ?? []
  const statements = ((declaration?.['body'] as Record<string, unknown>)?.['body'] as Record<string, unknown>[]) ?? []
  const returned = statements.length === 1 && statements[0]?.['type'] === 'ReturnStatement'
    ? statements[0]['argument'] as Record<string, unknown>
    : undefined
  if (!returned || params.some((param) => param['type'] !== 'Identifier')) {
    throw new Error(`Library function "${ref.namespace}.${ref.fnName}" is not a single-return inline expression`)
  }
  if (params.length !== ref.args.length) {
    throw new Error(
      `Inline call "${ref.namespace}.${ref.fnName}" expects ${params.length} arguments, received ${ref.args.length}`,
    )
  }
  if (ref.args.some((arg) => !arg.sideEffectFree)) {
    throw new Error(`Inline call "${ref.namespace}.${ref.fnName}" requires side-effect-free arguments`)
  }

  const expressionStart = returned['start'] as number
  const expressionEnd = returned['end'] as number
  const expression = entry.src.slice(expressionStart, expressionEnd)
  const argsByParam = new Map(params.map((param, index) => [
    param['name'] as string,
    argumentSources[index],
  ]))
  const rewrites: Rewrite[] = []
  const libFnNames = new Set(libFns.keys())
  walkAstWithParent(returned, undefined, (n, parent) => {
    if (n['type'] === 'Identifier') {
      const argument = argsByParam.get(n['name'] as string)
      const isMemberProperty = parent?.['type'] === 'MemberExpression' && !parent['computed'] && parent['property'] === n
      const isObjectKey = parent?.['type'] === 'Property' && !parent['computed'] && parent['key'] === n
      if (argument !== undefined && !isMemberProperty && !isObjectKey) {
        rewrites.push({
          start: (n['start'] as number) - expressionStart,
          end: (n['end'] as number) - expressionStart,
          text: `(${argument})`,
        })
      }
    }

    if (n['type'] !== 'CallExpression') return
    const callee = n['callee'] as Record<string, unknown>
    if (callee?.['type'] === 'Identifier' && libFnNames.has(callee['name'] as string)) {
      rewrites.push({
        start: (callee['start'] as number) - expressionStart,
        end: (callee['end'] as number) - expressionStart,
        text: mangle(ref.namespace, callee['name'] as string),
      })
    }
    if (callee?.['type'] === 'MemberExpression' && !callee['computed']) {
      const obj = callee['object'] as Record<string, unknown>
      const prop = callee['property'] as Record<string, unknown>
      if (
        obj?.['type'] === 'Identifier' && allNamespaces.has(obj['name'] as string) &&
        prop?.['type'] === 'Identifier'
      ) {
        rewrites.push({
          start: (callee['start'] as number) - expressionStart,
          end: (callee['end'] as number) - expressionStart,
          text: mangle(obj['name'] as string, prop['name'] as string),
        })
      }
    }
  })

  return `(${rewriteSource(expression, rewrites)})`
}

// ── public API ────────────────────────────────────────────────────────────────

export function bundle(
  patternSrc: string,
  libraries: Record<string, string>,
): { code: string; fxCode: string; metadata: BundleMetadata } {
  const patternAst = parseModule(patternSrc)
  const metadata = extractMetadata(patternAst)

  const knownLibs = new Set(Object.keys(libraries))
  const inlineRefs = collectInlineLibraryRefs(patternAst)
  const unknownInlineRef = inlineRefs.find((ref) => !knownLibs.has(ref.namespace))
  if (unknownInlineRef) {
    throw new Error(`Unknown library namespace "${unknownInlineRef.namespace}"`)
  }
  const unknownRefs = collectUnknownLibraryRefs(patternAst, knownLibs)
  if (unknownRefs.length > 0) {
    throw new Error(`Unknown library namespace "${unknownRefs[0].namespace}"`)
  }
  const refs = collectLibraryRefs(patternAst, knownLibs)

  if (refs.length === 0 && inlineRefs.length === 0) {
    return { code: patternSrc, fxCode: emitFixedPoint(patternSrc), metadata }
  }

  const libFnMaps: Record<string, LibFnMap> = {}
  const libVarDeclarations: Record<string, LibVarDeclaration[]> = {}
  for (const [ns, src] of Object.entries(libraries)) {
    libFnMaps[ns] = parseLibraryFns(src)
    libVarDeclarations[ns] = parseLibraryVarDeclarations(src)
  }

  const resolved = resolveAllDeps([...refs, ...inlineRefs], libFnMaps, knownLibs)
  for (const { namespace, fnName } of resolved) {
    const entry = libFnMaps[namespace]?.get(fnName)
    if (!entry) throw new Error(`Unknown library function "${namespace}.${fnName}"`)
    const unknownLibraryRefs = collectUnknownLibraryRefs(parseScript(entry.src), knownLibs)
    if (unknownLibraryRefs.length > 0) {
      throw new Error(`Unknown library namespace "${unknownLibraryRefs[0].namespace}"`)
    }
  }

  const referencedNamespaces = [...new Set(resolved.map(({ namespace }) => namespace))]
  const availableGlobalNames = new Set(
    referencedNamespaces.flatMap((namespace) => (
      (libVarDeclarations[namespace] ?? []).flatMap((declaration) => (
        declaration.entries.map((entry) => entry.name)
      ))
    )),
  )
  const requiredGlobalNames = new Set<string>()
  function requireReferencedGlobals(ast: unknown): void {
    for (const name of collectIdentifierReferences(ast)) {
      if (availableGlobalNames.has(name)) requiredGlobalNames.add(name)
    }
  }
  requireReferencedGlobals(patternAst)
  for (const { namespace, fnName } of resolved) {
    const entry = libFnMaps[namespace]?.get(fnName)
    if (entry) requireReferencedGlobals(parseScript(entry.src))
  }
  let addedInitializerDependency = true
  while (addedInitializerDependency) {
    addedInitializerDependency = false
    for (const namespace of referencedNamespaces) {
      for (const declaration of libVarDeclarations[namespace] ?? []) {
        for (const entry of declaration.entries) {
          if (!requiredGlobalNames.has(entry.name)) continue
          for (const dependency of entry.initializerRefs) {
            if (availableGlobalNames.has(dependency) && !requiredGlobalNames.has(dependency)) {
              requiredGlobalNames.add(dependency)
              addedInitializerDependency = true
            }
          }
        }
      }
    }
  }
  const varPreamble = referencedNamespaces
    .flatMap((namespace) => (libVarDeclarations[namespace] ?? []).map((declaration) => {
      const entries = declaration.entries.filter((entry) => requiredGlobalNames.has(entry.name))
      return entries.length > 0 ? `var ${entries.map((entry) => entry.src).join(', ')};` : ''
    }))
    .filter(Boolean)
    .join('\n')
  const runtimeFunctions: ResolvedFn[] = []
  const runtimeFunctionKeys = new Set<string>()
  function addRuntimeFunctions(items: ResolvedFn[]): void {
    for (const item of items) {
      const key = `${item.namespace}.${item.fnName}`
      if (runtimeFunctionKeys.has(key)) continue
      runtimeFunctionKeys.add(key)
      runtimeFunctions.push(item)
    }
  }
  addRuntimeFunctions(resolveAllDeps(refs, libFnMaps, knownLibs))
  for (const inlineRef of inlineRefs) {
    addRuntimeFunctions(resolveAllDeps([inlineRef], libFnMaps, knownLibs).slice(1))
  }

  const fnPreamble = runtimeFunctions
    .map(({ namespace, fnName }) => {
      const entry = libFnMaps[namespace]?.get(fnName)
      if (!entry) return ''
      return inlineFn(entry, namespace, libFnMaps[namespace], knownLibs)
    })
    .filter(Boolean)
    .join('\n')
  const preambleBody = [varPreamble, fnPreamble].filter(Boolean).join('\n')
  const preamble = preambleBody ? `${preambleBody}\n` : ''

  const patternRewrites: Rewrite[] = refs.map((ref) => ({
    start: ref.start,
    end: ref.end,
    text: mangle(ref.namespace, ref.fnName),
  }))
  function expandInlineRange(start: number, end: number): string {
    const contained = inlineRefs.filter((candidate) => (
      candidate.callStart >= start && candidate.callEnd <= end
    ))
    const roots = contained.filter((candidate) => !contained.some((parent) => (
      parent !== candidate &&
      parent.callStart <= candidate.callStart && parent.callEnd >= candidate.callEnd
    )))
    const rewrites: Rewrite[] = roots.map((ref) => {
      const entry = libFnMaps[ref.namespace]?.get(ref.fnName)
      if (!entry) throw new Error(`Unknown library function "${ref.namespace}.${ref.fnName}"`)
      return {
        start: ref.callStart - start,
        end: ref.callEnd - start,
        text: expandInlineCall(
          ref,
          entry,
          libFnMaps[ref.namespace],
          knownLibs,
          ref.args.map((arg) => expandInlineRange(arg.start, arg.end)),
        ),
      }
    })
    return rewriteSource(patternSrc.slice(start, end), rewrites)
  }

  const rootInlineRefs = inlineRefs.filter((candidate) => !inlineRefs.some((parent) => (
    parent !== candidate &&
    parent.callStart <= candidate.callStart && parent.callEnd >= candidate.callEnd
  )))
  for (const ref of rootInlineRefs) {
    const entry = libFnMaps[ref.namespace]?.get(ref.fnName)
    if (!entry) throw new Error(`Unknown library function "${ref.namespace}.${ref.fnName}"`)
    patternRewrites.push({
      start: ref.callStart,
      end: ref.callEnd,
      text: expandInlineCall(
        ref,
        entry,
        libFnMaps[ref.namespace],
        knownLibs,
        ref.args.map((arg) => expandInlineRange(arg.start, arg.end)),
      ),
    })
  }

  const code = preamble + rewriteSource(patternSrc, patternRewrites)
  metadata.patternFunctions = extractMetadata(parseModule(code)).patternFunctions
  return {
    code,
    fxCode: emitFixedPoint(code),
    metadata,
  }
}
