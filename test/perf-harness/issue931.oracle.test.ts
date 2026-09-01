// #931: the device compiler must accept every unrolled artifact. The
// Controller compiler is stricter than acorn (no comma expressions, for one),
// so the emulator checksums alone cannot prove an artifact will load. Runs
// offline against the cached device compiler (populate once with
// `ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue906.oracle.test.ts`).
import { describe, expect, it } from 'vitest'
import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { loadCachedWordCompiler } from './bytecodeOracle'
import { issue931Fixtures } from './issue931'

const compiler = loadCachedWordCompiler()

describe('device compiler acceptance for #931 artifacts', () => {
  it.skipIf(!compiler)('compiles every paired fixture and every stock Show with the Controller compiler', () => {
    for (const fixture of issue931Fixtures()) {
      expect(() => compiler!(fixture.on.code), fixture.id).not.toThrow()
      expect(() => compiler!(fixture.off.code), fixture.id).not.toThrow()
    }
    for (const item of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
      expect(() => compiler!(compiled.artifact!.code), item.id).not.toThrow()
    }
  }, 120_000)
})
