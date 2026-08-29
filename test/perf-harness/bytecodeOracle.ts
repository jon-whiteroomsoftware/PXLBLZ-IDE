// Static bytecode word-count oracle for issue #906 (epic #903).
//
// The Controller ships its own pattern compiler inside index.html.gz, and the
// harness already runs it headless (`fetchControllerCompiler`). This module
// exposes the compiled 32-bit word stream itself, so emission idioms can be
// priced without hardware: word counts are execution cost to first order
// (~0.35 us/word on the pb32), and a diff of two sources is the static price
// of an idiom exchange.
//
// The compiler environment is fetched from the device once and cached under
// an ignored directory, keyed by content hash — the oracle then works
// offline. The compiler itself is never committed (provenance: it is the
// device's own code, extracted at runtime exactly like the existing
// `fetchControllerCompiler` path).
//
// Instruction encoding (verified against this firmware in the unit tests):
// the least-significant bit tags a word as instruction (1) or inline 16.16
// literal (0); an instruction word is [opcode byte | argc/flag byte |
// u16 operand].

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { fetchControllerCompilerEnvironment } from './controllerHardware'

const CACHE_DIR = join(__dirname, '.compiler-cache')

export interface CompiledWordsProgram {
  words: number[]
  exports: { name: string; address: number }[]
  status: string
}

export type WordCompiler = (source: string) => CompiledWordsProgram

export function cachedCompilerEnvironmentPath(): string | null {
  try {
    const entries = readdirSync(CACHE_DIR).filter((name) => name.endsWith('.js')).sort()
    return entries.length > 0 ? join(CACHE_DIR, entries[entries.length - 1]) : null
  } catch {
    return null
  }
}

export async function ensureCachedCompilerEnvironment(ip: string): Promise<string> {
  const environment = await fetchControllerCompilerEnvironment(ip)
  const hash = createHash('sha256').update(environment).digest('hex').slice(0, 12)
  mkdirSync(CACHE_DIR, { recursive: true })
  const path = join(CACHE_DIR, `device-compiler-${hash}.js`)
  writeFileSync(path, environment)
  return path
}

/**
 * Load the word-level compiler from the local cache; returns null when no
 * cache exists yet (run `ISSUE906_REFRESH=1` with a reachable device once).
 */
export function loadCachedWordCompiler(): WordCompiler | null {
  const path = cachedCompilerEnvironmentPath()
  if (!path) return null
  const context = vm.createContext({ window: {} })
  vm.runInContext(readFileSync(path, 'utf8'), context, { filename: 'device-compiler.js' })
  const compilePattern = (context as {
    compilePattern?: (source: string) => { compiled: number[]; exports: { name: string; address: number }[]; status: string }
  }).compilePattern
  if (!compilePattern) throw new Error('cached device compiler did not define compilePattern')
  return (source: string) => {
    const program = compilePattern(source)
    if (program.status !== 'OK') throw new Error(`Controller compiler: ${program.status}`)
    return { words: program.compiled, exports: program.exports, status: program.status }
  }
}

export interface WordSummary {
  totalWords: number
  codeBytes: number
  instructionWords: number
  literalWords: number
  /** opcode byte -> count, for instruction words only. */
  opcodeHistogram: Record<string, number>
}

export function summarizeWords(words: number[]): WordSummary {
  const opcodeHistogram: Record<string, number> = {}
  let instructionWords = 0
  let literalWords = 0
  for (const word of words) {
    if ((word & 1) === 1) {
      instructionWords += 1
      const opcode = `0x${(word & 0xff).toString(16).padStart(2, '0')}`
      opcodeHistogram[opcode] = (opcodeHistogram[opcode] ?? 0) + 1
    } else {
      literalWords += 1
    }
  }
  return {
    totalWords: words.length,
    codeBytes: words.length * 4,
    instructionWords,
    literalWords,
    opcodeHistogram,
  }
}

export interface WordDiff {
  before: WordSummary
  after: WordSummary
  wordDelta: number
  /** first-order runtime estimate at ~0.35 us/word on the pb32. */
  estimatedUsDelta: number
}

export const US_PER_WORD = 0.35

export function diffSources(compile: WordCompiler, before: string, after: string): WordDiff {
  const beforeSummary = summarizeWords(compile(before).words)
  const afterSummary = summarizeWords(compile(after).words)
  const wordDelta = afterSummary.totalWords - beforeSummary.totalWords
  return {
    before: beforeSummary,
    after: afterSummary,
    wordDelta,
    estimatedUsDelta: wordDelta * US_PER_WORD,
  }
}

// Export addresses are global-table slots, not code addresses (functions are
// ordinary globals on this VM; verified against the live compiler: the
// beforeRender export carries slot 1, not a code offset). Per-function word
// counts therefore come from whole-program deltas, not export slicing.
