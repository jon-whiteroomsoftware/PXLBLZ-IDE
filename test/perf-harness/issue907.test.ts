// Static verdicts for the #907 idiom families, priced by the #906 oracle.
// Runs whenever the cached compiler environment exists; ISSUE907_VERDICTS=1
// writes test/perf-harness/issue907-static-verdicts.md.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cachedCompilerEnvironmentPath, loadCachedWordCompiler, type WordCompiler } from './bytecodeOracle'
import { IDIOM_FAMILIES, verdictTable, type IdiomVerdict } from './issue907'

const writeVerdicts = process.env.ISSUE907_VERDICTS === '1'

function pattern(body: string): string {
  return [
    'var a = 0',
    'var b = 0.25',
    'var c = 0.5',
    'var d = 0.75',
    'var i = 0',
    'var k = 1',
    'var n = 0.25',
    `export function beforeRender(delta) {\n${body}\n}`,
    'export function render(index) { hsv(0, 0, 0) }',
  ].join('\n')
}

describe('emission idiom static verdicts (#907)', () => {
  let compile: WordCompiler | null = null
  beforeAll(() => {
    compile = loadCachedWordCompiler()
  })

  it('declares an exactness status for every family', () => {
    for (const family of IDIOM_FAMILIES) {
      expect(['exact', 'exact-given-nonnegative-input', 'exact-per-frame-flag']).toContain(family.exactness)
    }
    // The frac family must never be recorded as unconditionally exact:
    // frac truncates toward zero on fw 3.67 while `v - floor(v)` floors.
    expect(IDIOM_FAMILIES.find((family) => family.id === 'frac-hue-wrap')?.exactness)
      .toBe('exact-given-nonnegative-input')
  })

  it('prices every family through the device compiler', () => {
    if (!compile) {
      if (!cachedCompilerEnvironmentPath()) console.warn('No cached device compiler; verdicts skipped.')
      return
    }
    const verdicts: IdiomVerdict[] = IDIOM_FAMILIES.map((family) => {
      const beforeWords = compile!(pattern(family.before)).words.length
      const afterWords = compile!(pattern(family.after)).words.length
      const wordDelta = afterWords - beforeWords
      return {
        id: family.id,
        description: family.description,
        exactness: family.exactness,
        beforeWords,
        afterWords,
        wordDelta,
        estimatedUsDelta: wordDelta * 0.35,
        staticWinner: wordDelta < 0 ? 'after' : wordDelta > 0 ? 'before' : 'tie',
      }
    })
    const table = verdictTable(verdicts)
    if (writeVerdicts) {
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue907-static-verdicts.md'), table)
      console.log(table)
    }
    expect(verdicts).toHaveLength(IDIOM_FAMILIES.length)
    for (const verdict of verdicts) {
      expect(verdict.beforeWords).toBeGreaterThan(0)
      expect(verdict.afterWords).toBeGreaterThan(0)
    }
  })
})
