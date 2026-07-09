import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS } from './builtins'

export const LIBRARY_SKELETON = `// Helpers in this file are called as Lib1.name()
function identity(v) {
  return v
}
`

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface LibraryNameScope {
  stockNames: readonly string[]
  userNames: readonly string[]
  builtinNames: readonly string[]
  currentName?: string
}

export interface CompileLibraryRecord {
  name: string
  src: string
}

export function builtinNamespaceNames(): string[] {
  return [
    ...BUILTIN_FUNCTIONS.map((fn) => fn.name),
    ...BUILTIN_CONSTANTS.map((constant) => constant.name),
  ]
}

export function validateLibraryName(name: string, scope: LibraryNameScope): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Library namespace is required'
  if (!IDENTIFIER_RE.test(trimmed)) return 'Library namespace must be a Pixelblaze identifier'
  if (trimmed === scope.currentName) return null
  if (scope.stockNames.includes(trimmed) || scope.userNames.includes(trimmed)) {
    return `A library namespace named "${trimmed}" already exists`
  }
  if (scope.builtinNames.includes(trimmed)) {
    return `"${trimmed}" is a Pixelblaze built-in name`
  }
  return null
}

export function nextLibraryName(scope: LibraryNameScope): string {
  const taken = new Set([...scope.stockNames, ...scope.userNames, ...scope.builtinNames])
  let index = 1
  while (taken.has(`Lib${index}`)) index++
  return `Lib${index}`
}

export function nextLibraryCloneName(baseName: string, scope: LibraryNameScope): string {
  const taken = new Set([...scope.stockNames, ...scope.userNames, ...scope.builtinNames])
  let index = 2
  while (taken.has(`${baseName}${index}`)) index++
  return `${baseName}${index}`
}

export function compileLibraries(
  stockLibraries: Record<string, string>,
  userLibraries: readonly CompileLibraryRecord[],
): Record<string, string> {
  const merged = { ...stockLibraries }
  for (const library of userLibraries) {
    if (Object.prototype.hasOwnProperty.call(merged, library.name)) continue
    merged[library.name] = library.src
  }
  return merged
}
