import { describe, expect, it } from 'vitest'
import { loadCachedWordCompiler } from './bytecodeOracle'
import { issue937Candidates } from './issue937'

describe('#937 candidates', () => {
  it('build, stay artifact-clean, and compile on the Controller compiler', () => {
    const compiler = loadCachedWordCompiler()
    for (const candidate of issue937Candidates()) {
      expect(candidate.artifact.summary.resources.blockers, candidate.id).toEqual([])
      if (compiler) expect(() => compiler(candidate.artifact.code), candidate.id).not.toThrow()
    }
  })
})
