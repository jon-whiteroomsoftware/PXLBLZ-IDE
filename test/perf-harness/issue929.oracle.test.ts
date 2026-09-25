// #929: the device compiler must accept every hoisted artifact. Runs offline
// against the cached Controller compiler (populate once with
// `ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue906.oracle.test.ts`);
// skipped when no cache exists.
import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS_V2 } from '../../src/pixelblaze/stock/showsV2'
import { loadCachedWordCompiler } from './bytecodeOracle'
import { issue929Fixtures } from './issue929'
import { compileStockShowV2State } from './showV2Fixture'

const compiler = loadCachedWordCompiler()

describe('device compiler acceptance for #929 artifacts', () => {
  it.skipIf(!compiler)('compiles every paired fixture and every stock Show with the Controller compiler', () => {
    for (const fixture of issue929Fixtures()) {
      expect(() => compiler!(fixture.on.code), fixture.id).not.toThrow()
    }
    for (const record of STOCK_SHOWS_V2) {
      const compiled = compileStockShowV2State(record.id, {})
      if (!compiled.artifact) throw new Error(`${record.id}: ${compiled.error}`)
      expect(() => compiler!(compiled.artifact!.code), record.id).not.toThrow()
    }
  }, 120_000)
})
