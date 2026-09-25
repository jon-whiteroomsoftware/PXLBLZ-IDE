import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { expect, it } from 'vitest'

const root = process.cwd()
const entry = resolve(root, 'src/worker/index.ts')

function workerImportGraph(): { files: Set<string>; forbidden: string[] } {
  const files = new Set<string>()
  const forbidden: string[] = []

  function visit(file: string): void {
    if (files.has(file)) return
    files.add(file)
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)

    function inspect(node: ts.Node): void {
      let specifier: ts.Expression | undefined
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        specifier = node.moduleSpecifier
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        specifier = node.arguments[0]
      }
      if (specifier && ts.isStringLiteral(specifier)) {
        const name = specifier.text
        if (/\?(?:raw|url|inline)$/.test(name)) {
          const line = source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1
          forbidden.push(`${relative(root, file)}:${line}: ${name}`)
        }
        if (name.startsWith('.')) {
          const path = resolve(dirname(file), name.split('?')[0])
          const next = [`${path}.ts`, `${path}.tsx`, resolve(path, 'index.ts')]
            .find(candidate => existsSync(candidate))
          if (next) visit(next)
        }
      }
      ts.forEachChild(node, inspect)
    }

    inspect(source)
  }

  visit(entry)
  return { files, forbidden }
}

it('uses no Vite import suffixes in the Worker module graph', () => {
  const { forbidden } = workerImportGraph()
  expect(forbidden, forbidden.join('\n')).toEqual([])
})

it('reaches Show v2 admission from the Worker entry', () => {
  expect(workerImportGraph().files.has(resolve(root, 'src/cloudflare/showV2Codec.ts'))).toBe(true)
})
