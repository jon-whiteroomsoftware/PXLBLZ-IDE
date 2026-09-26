import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectProductStrings,
  PRODUCT_STRING_ALLOWLIST,
  PRODUCT_STRING_SURFACES,
  type ProductString,
} from './productStrings'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sceneWord = /\bScenes?\b/

function surfaceFiles(pattern: string): string[] {
  return globSync(pattern, { cwd: root })
    .filter(file => !/\.test\.tsx?$/.test(file)
      && file !== 'src/engine/showRecordV1ToV2.ts'
      && !/^src\/engine\/showCompositionLowering.*\.ts$/.test(file))
    .sort()
}

function surfaceStrings(): ProductString[] {
  const files = new Set(PRODUCT_STRING_SURFACES.flatMap(surfaceFiles))
  return [...files].flatMap(file => collectProductStrings(file, readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')))
}

describe('Show product vocabulary', () => {
  it('no product surface says Scene', () => {
    const leaks = surfaceStrings().filter(entry => sceneWord.test(entry.text))
      .filter(entry => !PRODUCT_STRING_ALLOWLIST.some(allowed => allowed.file === entry.file && allowed.text === entry.text))
    expect(leaks, leaks.map(entry => `${entry.file}:${entry.line}: ${JSON.stringify(entry.text)}`).join('\n')).toEqual([])
  })

  it('recognizes literal, template, and JSX text without comments, identifiers, or lookalikes', () => {
    const tsSource = [
      "const label = 'Add Scene'",
      'const edge = `Clip meets ${x} at the Scene edge`',
      'const plural = "Scenes"',
      '// Scene comment',
      '/* Scene */',
      'const sceneId = "scene-1"',
      "const converted = 'converted-scene-label'",
      "const scenery = 'Scenery'",
      "const obscene = 'obscene'",
      "import Thing from 'Scene'",
      "export { Thing } from 'Scenes'",
      "describe('Scene', () => {})",
      "it('Scenes', () => {})",
      "test('Scene', () => {})",
    ].join('\n')
    const jsxSource = '<p>Next Scene</p>'
    const leaks = [
      ...collectProductStrings('fixture.ts', tsSource),
      ...collectProductStrings('fixture.tsx', jsxSource),
    ].filter(entry => sceneWord.test(entry.text))
    expect(leaks.map(entry => entry.text)).toEqual([
      'Add Scene',
      ' at the Scene edge',
      'Scenes',
      'Next Scene',
    ])
  })

  it('has no stale allowlist entries', () => {
    const collected = surfaceStrings()
    const stale = PRODUCT_STRING_ALLOWLIST.filter(allowed =>
      !collected.some(entry => entry.file === allowed.file && entry.text === allowed.text),
    )
    expect(stale).toEqual([])
  })

  it('resolves every declared surface pattern', () => {
    expect(PRODUCT_STRING_SURFACES.filter(pattern => surfaceFiles(pattern).length === 0)).toEqual([])
  })
})
