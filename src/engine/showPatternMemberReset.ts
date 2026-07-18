import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export type ShowPatternMemberResetReason =
  | 'unsupported-top-level-statement'
  | 'unsupported-binding'
  | 'non-deterministic-initializer'

export interface ShowPatternMemberResetAnalysis {
  resettable: boolean
  assignments: string[]
  reason: ShowPatternMemberResetReason | null
}

export function analyzeShowPatternMemberReset(source: string): ShowPatternMemberResetAnalysis {
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  const assignments: string[] = []

  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration') continue
    if (declaration?.type !== 'VariableDeclaration') {
      return rejected('unsupported-top-level-statement')
    }
    for (const item of declaration.declarations as Node[]) {
      if (item.id?.type !== 'Identifier') return rejected('unsupported-binding')
      if (!isDeterministicScalarInitializer(item.init ?? null)) {
        return rejected('non-deterministic-initializer')
      }
      const initializer = item.init ? source.slice(item.init.start, item.init.end) : '0'
      assignments.push(`${item.id.name} = ${initializer}`)
    }
  }

  return { resettable: true, assignments, reason: null }
}

function rejected(reason: ShowPatternMemberResetReason): ShowPatternMemberResetAnalysis {
  return { resettable: false, assignments: [], reason }
}

function isDeterministicScalarInitializer(node: Node | null): boolean {
  if (!node) return true
  if (node.type === 'Literal' || node.type === 'Identifier') return true
  if (node.type === 'UnaryExpression') return isDeterministicScalarInitializer(node.argument)
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return isDeterministicScalarInitializer(node.left) && isDeterministicScalarInitializer(node.right)
  }
  if (node.type === 'ConditionalExpression') {
    return isDeterministicScalarInitializer(node.test)
      && isDeterministicScalarInitializer(node.consequent)
      && isDeterministicScalarInitializer(node.alternate)
  }
  if (node.type === 'SequenceExpression') {
    return node.expressions.every((entry: Node) => isDeterministicScalarInitializer(entry))
  }
  return false
}
