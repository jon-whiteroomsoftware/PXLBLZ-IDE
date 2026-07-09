export interface LibraryFunctionDoc {
  name: string
  params: string[]
  doc: string
}

export interface LibraryApiReference {
  namespace: string
  functions: LibraryFunctionDoc[]
  outVars: string[]
  referencedStockLibraries: string[]
}

export type LibraryDocIndex = Record<string, Record<string, LibraryFunctionDoc>>

const IDENTIFIER = '[A-Za-z_][A-Za-z0-9_]*'
const FUNCTION_RE = new RegExp(`^function\\s+(${IDENTIFIER})\\s*\\(([^)]*)\\)`)
const VAR_RE = new RegExp(`^var\\s+(.+)`)

function splitParams(raw: string): string[] {
  return raw.split(',').map((param) => param.trim()).filter(Boolean)
}

function docsAbove(lines: string[], functionLineIndex: number): string {
  const commentLines: string[] = []
  let index = functionLineIndex - 1
  while (index >= 0) {
    const previous = lines[index].trim()
    if (!previous.startsWith('//')) break
    const text = previous.replace(/^\/\/\s*/, '')
    if (!/^[─—-]+/.test(text)) commentLines.unshift(text)
    index--
  }
  return commentLines.join(' ').trim()
}

function parseVarNames(line: string): string[] {
  const match = VAR_RE.exec(line.trim())
  if (!match) return []
  return match[1]
    .split(',')
    .map((part) => new RegExp(`^\\s*(${IDENTIFIER})`).exec(part)?.[1])
    .filter((name): name is string => Boolean(name))
}

function referencedStockLibraries(source: string, stockNames: readonly string[]): string[] {
  const refs = new Set<string>()
  for (const name of stockNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\.${IDENTIFIER}\\s*\\(`).test(source)) refs.add(name)
  }
  return [...refs].sort((a, b) => a.localeCompare(b))
}

export function parseLibraryApiReference(
  namespace: string,
  source: string,
  stockNames: readonly string[] = [],
): LibraryApiReference {
  const lines = source.split('\n')
  const functions: LibraryFunctionDoc[] = []
  const outVars: string[] = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim()
    outVars.push(...parseVarNames(line))

    const fnMatch = FUNCTION_RE.exec(line)
    if (!fnMatch) continue
    functions.push({
      name: fnMatch[1],
      params: splitParams(fnMatch[2]),
      doc: docsAbove(lines, index),
    })
  }

  return {
    namespace,
    functions,
    outVars: [...new Set(outVars)],
    referencedStockLibraries: referencedStockLibraries(source, stockNames),
  }
}

export function libraryDocsByFunction(reference: LibraryApiReference): Record<string, LibraryFunctionDoc> {
  return Object.fromEntries(reference.functions.map((fn) => [fn.name, fn]))
}

export function buildLibraryDocIndex(libraries: Record<string, string>): LibraryDocIndex {
  return Object.fromEntries(
    Object.entries(libraries).map(([namespace, source]) => [
      namespace,
      libraryDocsByFunction(parseLibraryApiReference(namespace, source)),
    ]),
  )
}
