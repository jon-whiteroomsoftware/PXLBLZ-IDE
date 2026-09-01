// #928: the device compiler must accept every hoisted artifact. Runs offline
// against the cached Controller compiler (populate once with
// `ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue906.oracle.test.ts`);
// skipped when no cache exists.
import { describe, expect, it } from 'vitest'
import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { loadCachedWordCompiler } from './bytecodeOracle'
import { issue928Fixtures } from './issue928'

const compiler = loadCachedWordCompiler()

describe('device compiler acceptance for #928 artifacts', () => {
  it.skipIf(!compiler)('compiles every paired fixture and every stock Show with the Controller compiler', () => {
    for (const fixture of issue928Fixtures()) {
      expect(() => compiler!(fixture.on.code), fixture.id).not.toThrow()
    }
    for (const item of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
      expect(() => compiler!(compiled.artifact!.code), item.id).not.toThrow()
    }
  }, 120_000)
})
