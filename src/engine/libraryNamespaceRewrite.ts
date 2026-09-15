import * as acorn from 'acorn'

interface AstNode {
  type?: string
  start?: number
  end?: number
  name?: string
  callee?: AstNode
  object?: AstNode
  [key: string]: unknown
}

/** Rewrite only namespace identifiers that are roots of supported member calls. */
export function rewriteLibraryNamespaces(source: string, names: ReadonlyMap<string, string>): string {
  if (names.size === 0) return source
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as AstNode
  const replacements: Array<{ start: number; end: number; value: string }> = []
  walk(ast, node => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression') return
    let root = node.callee
    while (root.type === 'MemberExpression') root = root.object!
    if (root.type !== 'Identifier' || root.start === undefined || root.end === undefined || !root.name) return
    const replacement = names.get(root.name)
    if (replacement) replacements.push({ start: root.start, end: root.end, value: replacement })
  })
  let rewritten = source
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    rewritten = rewritten.slice(0, replacement.start) + replacement.value + rewritten.slice(replacement.end)
  }
  return rewritten
}

function walk(value: unknown, visit: (node: AstNode) => void): void {
  if (!value || typeof value !== 'object') return
  const node = value as AstNode
  if (typeof node.type === 'string') visit(node)
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach(item => walk(item, visit))
    else if (child && typeof child === 'object') walk(child, visit)
  }
}
