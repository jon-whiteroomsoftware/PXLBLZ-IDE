import { summarizeWords, diffSources, US_PER_WORD, type WordCompiler } from './bytecodeOracle'

describe('bytecode oracle word decoding (#906)', () => {
  it('splits instruction and literal words by the LSB tag and buckets opcodes', () => {
    // 0x00008000 = literal 0.5; 0x00010117 = STORE global#1; 0x00000129 = POP.
    const summary = summarizeWords([0x00008000, 0x00010117, 0x00000129])
    expect(summary.totalWords).toBe(3)
    expect(summary.codeBytes).toBe(12)
    expect(summary.literalWords).toBe(1)
    expect(summary.instructionWords).toBe(2)
    expect(summary.opcodeHistogram).toEqual({ '0x17': 1, '0x29': 1 })
  })

  it('diffs two sources through a compiler and scales the word delta to microseconds', () => {
    const fake: WordCompiler = (source) => ({
      words: Array.from({ length: source.length }, (_, index) => (index << 1) | 1),
      exports: [],
      status: 'OK',
    })
    const diff = diffSources(fake, 'aaaa', 'aaaaaaa')
    expect(diff.wordDelta).toBe(3)
    expect(diff.estimatedUsDelta).toBeCloseTo(3 * US_PER_WORD, 6)
  })

})
