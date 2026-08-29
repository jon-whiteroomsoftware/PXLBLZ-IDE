// Oracle anchor tests against the real device compiler (#906).
//
// These run whenever a cached compiler environment exists (populate it once
// with `ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip>` and a reachable device); no
// hardware is touched afterwards. The anchors pin the encoding facts every
// wave-4 static price rests on. `ISSUE906_FACTS=1` additionally regenerates
// test/perf-harness/codegen-facts.md.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cachedCompilerEnvironmentPath,
  ensureCachedCompilerEnvironment,
  loadCachedWordCompiler,
  summarizeWords,
  type WordCompiler,
} from './bytecodeOracle'

const refresh = process.env.ISSUE906_REFRESH === '1'
const writeFacts = process.env.ISSUE906_FACTS === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

// The device compiler rejects reads of undefined symbols (assignment is the
// only thing that creates a global), so every probe variable is declared in
// the scaffold. Export addresses are global slots, not code offsets, so all
// counts below are whole-program word counts; rows compare against each
// other, never against zero.
function pattern(beforeRenderBody: string): string {
  return [
    'var a = 0',
    'var b = 0.25',
    'var c = 0.5',
    'var d = 0.75',
    'var k = 1',
    'var n = 4',
    'var i = 0',
    `export function beforeRender(delta) {\n${beforeRenderBody}\n}`,
    'export function render(index) { hsv(0, 0, 0) }',
  ].join('\n')
}

function bodyWords(compile: WordCompiler, beforeRenderBody: string): number {
  return compile(pattern(beforeRenderBody)).words.length
}

describe('bytecode oracle anchors against the device compiler (#906)', () => {
  let compile: WordCompiler | null = null

  beforeAll(async () => {
    if (refresh) await ensureCachedCompilerEnvironment(ip)
    compile = loadCachedWordCompiler()
  }, 60_000)

  it('has a cached compiler environment or documents how to get one', () => {
    if (!cachedCompilerEnvironmentPath()) {
      console.warn('No cached device compiler; run ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> once. Anchor tests skipped.')
    }
    expect(true).toBe(true)
  })

  it('pins the statement shape: one assignment is three words plus the shared prologue', () => {
    if (!compile) return
    const one = bodyWords(compile, '  a = b')
    const two = bodyWords(compile, '  a = b\n  c = d')
    // LOAD + STORE + POP per expression statement.
    expect(two - one).toBe(3)
  })

  it('pins literals as single inline words, same cost class as a variable load', () => {
    if (!compile) return
    const literal = bodyWords(compile, '  a = 0.5')
    const variable = bodyWords(compile, '  a = b')
    expect(literal).toBe(variable)
    const compound = bodyWords(compile, '  a = 3.14159 / 2')
    // An unfolded constant expression costs two literal words plus the divide.
    expect(compound - literal).toBe(2)
  })

  it('confirms the compiler does not constant-fold or elide identity arithmetic', () => {
    if (!compile) return
    const direct = bodyWords(compile, '  a = b')
    const identity = bodyWords(compile, '  a = b * (1) + a * (1 - (1))')
    // b, 1, mul, a, 1, 1, sub, mul, add over the direct form's single load.
    expect(identity - direct).toBe(8)
  })

  it('pins the array-literal density near the measured 4.25 bytecode bytes per value', () => {
    if (!compile) return
    const values = Array.from({ length: 256 }, (_, index) => (index % 32) / 32)
    const program = compile(`var t = [${values.join(',')}]\n${pattern('  a = b')}`)
    const baseline = compile(`var t = array(256)\n${pattern('  a = b')}`)
    const bytesPerValue = ((program.words.length - baseline.words.length) * 4) / values.length
    expect(bytesPerValue).toBeGreaterThan(3.9)
    expect(bytesPerValue).toBeLessThan(4.7)
  })

  it('records the codegen facts the emission sweep needs', () => {
    if (!compile) return
    const rows: Array<[string, number]> = [
      ['empty body', bodyWords(compile, '  ')],
      ['a = b', bodyWords(compile, '  a = b')],
      ['a = b && c', bodyWords(compile, '  a = b && c')],
      ['a = b & c', bodyWords(compile, '  a = b & c')],
      ['a = b || c', bodyWords(compile, '  a = b || c')],
      ['a = k ? b : c', bodyWords(compile, '  a = k ? b : c')],
      ['if/else assign', bodyWords(compile, '  if (k) { a = b } else { a = c }')],
      ['arithmetic select', bodyWords(compile, '  a = k * b + (1 - k) * c')],
      ['for loop, one-statement body', bodyWords(compile, '  for (i = 0; i < n; i = i + 1) { a = a + 1 }')],
      ['unrolled x4 equivalent', bodyWords(compile, '  a = a + 1\n  a = a + 1\n  a = a + 1\n  a = a + 1')],
      ['local read (var l = b; a = l)', bodyWords(compile, '  var l = b\n  a = l')],
      ['global read twice (a = b; c = b)', bodyWords(compile, '  a = b\n  c = b')],
    ]
    const histograms = {
      and: summarizeWords(compile(pattern('  a = b && c')).words).opcodeHistogram,
      bitAnd: summarizeWords(compile(pattern('  a = b & c')).words).opcodeHistogram,
    }
    const facts = [
      '# Device-compiler codegen facts (#906)',
      '',
      'Static word counts from the Controller\'s own compiler run headless',
      '(cache under test/perf-harness/.compiler-cache/; regenerate with',
      '`ISSUE906_FACTS=1 ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue906.oracle.test.ts`).',
      'Word counts are for the whole `beforeRender` body including prologue and',
      'return; compare rows, not absolutes. ~0.35 us/word on the pb32.',
      '',
      '| beforeRender body | words |',
      '|---|---:|',
      ...rows.map(([name, words]) => `| \`${name}\` | ${words} |`),
      '',
      `Opcode histogram for \`&&\`: ${JSON.stringify(histograms.and)}`,
      `Opcode histogram for \`&\`: ${JSON.stringify(histograms.bitAnd)}`,
      '',
      'The dynamic short-circuit verdict (side-effect probe on hardware) is',
      'recorded in issue906-shortcircuit.json and on #906.',
      '',
    ].join('\n')
    if (writeFacts) {
      const outputPath = join(process.cwd(), 'test/perf-harness/codegen-facts.md')
      writeFileSync(outputPath, facts)
      console.log(facts)
    }
    expect(rows.every(([, words]) => words > 0)).toBe(true)
  })
})
