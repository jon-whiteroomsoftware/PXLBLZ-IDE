import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface ShowRendererOutputGuarantees {
  render: boolean
  render2D: boolean
  render3D: boolean
}

const OUTPUT_GUARANTEE_CACHE_LIMIT = 256
const outputGuaranteeCache = new Map<string, ShowRendererOutputGuarantees>()

/** Conservatively proves direct rgb()/hsv() output on every renderer path. */
export function analyzeShowRendererOutputGuarantees(source: string): ShowRendererOutputGuarantees {
  const cached = outputGuaranteeCache.get(source)
  if (cached) return cached

  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  const result = analyzeShowRendererOutputGuaranteesAst(ast)
  if (outputGuaranteeCache.size >= OUTPUT_GUARANTEE_CACHE_LIMIT) {
    const oldest = outputGuaranteeCache.keys().next().value
    if (oldest !== undefined) outputGuaranteeCache.delete(oldest)
  }
  outputGuaranteeCache.set(source, result)
  return result
}

/** Reuses a caller's module parse when the compiler already owns the AST. */
export function analyzeShowRendererOutputGuaranteesAst(ast: unknown): ShowRendererOutputGuarantees {
  const result: ShowRendererOutputGuarantees = { render: false, render2D: false, render3D: false }
  for (const statement of (ast as Node).body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'FunctionDeclaration') continue
    const name = declaration.id?.name as keyof ShowRendererOutputGuarantees | undefined
    if (!name || !(name in result)) continue
    result[name] = sequenceGuaranteesOutput(declaration.body?.body ?? [])
  }
  return result
}

function sequenceGuaranteesOutput(statements: Node[]): boolean {
  for (const statement of statements) {
    if (statementGuaranteesOutput(statement)) return true
    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') return false
  }
  return false
}

function statementGuaranteesOutput(statement: Node): boolean {
  if (statement.type === 'ExpressionStatement') return expressionWritesOutput(statement.expression)
  if (statement.type === 'BlockStatement') return sequenceGuaranteesOutput(statement.body ?? [])
  if (statement.type === 'IfStatement') {
    return Boolean(statement.alternate)
      && statementGuaranteesOutput(statement.consequent)
      && statementGuaranteesOutput(statement.alternate)
  }
  if (statement.type === 'ReturnStatement') return expressionWritesOutput(statement.argument)
  return false
}

function expressionWritesOutput(expression: Node | null | undefined): boolean {
  if (!expression) return false
  if (expression.type === 'CallExpression' && expression.callee?.type === 'Identifier') {
    return expression.callee.name === 'rgb' || expression.callee.name === 'hsv'
  }
  if (expression.type === 'SequenceExpression') {
    return expression.expressions.some((candidate: Node) => expressionWritesOutput(candidate))
  }
  return false
}
