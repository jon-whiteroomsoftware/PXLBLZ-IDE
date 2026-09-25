// #931: the device compiler must accept every unrolled artifact. The
// Controller compiler is stricter than acorn (no comma expressions, for one),
// so the emulator checksums alone cannot prove an artifact will load. Runs
// offline against the cached device compiler (populate once with
// `ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue906.oracle.test.ts`).
import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS_V2 } from '../../src/pixelblaze/stock/showsV2'
import { loadCachedWordCompiler } from './bytecodeOracle'
import { issue931Fixtures } from './issue931'
import { compileStockShowV2State } from './showV2Fixture'

const compiler = loadCachedWordCompiler()

describe('device compiler acceptance for #931 artifacts', () => {
  it.skipIf(!compiler)('compiles every paired fixture and every stock Show with the Controller compiler', () => {
    for (const fixture of issue931Fixtures()) {
      expect(() => compiler!(fixture.on.code), fixture.id).not.toThrow()
      expect(() => compiler!(fixture.off.code), fixture.id).not.toThrow()
    }
    for (const record of STOCK_SHOWS_V2) {
      const compiled = compileStockShowV2State(record.id, {})
      if (!compiled.artifact) throw new Error(`${record.id}: ${compiled.error}`)
      expect(() => compiler!(compiled.artifact!.code), record.id).not.toThrow()
    }
  }, 120_000)
})
