// Provenance: pxlblz-v3 test/showEvaluate.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { compileShowDocument, validateShowDocument } from '../shows/evaluate.js'
import { createSessionStore } from '../grammar/session.js'
import { toShowRecordV2 } from './support/convertFixture.js'

const stockShow = (): ShowRecordV2 => toShowRecordV2(structuredClone(STOCK_SHOWS[0].show), STOCK_SHOWS[0].name)

// Rewires the first Pattern instance to a user-pattern reference and returns the
// stock source that reference should resolve to when supplied inline.
const withUserPatternRef = () => {
  const show = stockShow()
  const original = show.composition.patternInstances[0].pattern
  expect(original.kind).toBe('stock')
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'inline-under-test' }
  return { show, source: DEMOS[original.id] }
}

describe('validateShowDocument (#7)', () => {
  it('passes a stock Show clean', () => {
    const result = validateShowDocument(stockShow())
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('reports malformed JSON as a typed error', () => {
    const result = validateShowDocument('{"id": "broken"')
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('malformed-json')
    expect(result.errors[0].message).toContain('not valid JSON')
  })

  it('reports structural schema violations with a document path', () => {
    const result = validateShowDocument({ ...stockShow(), name: 42 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.code === 'schema' && error.path === '/name')).toBe(true)
  })

  it('reports a missing required field', () => {
    const { zones: _zones, ...withoutZones } = stockShow()
    const result = validateShowDocument(withoutZones)
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.code === 'schema' && error.message.includes('zones'))).toBe(true)
  })

  it('rejects user-library references with an explanatory error', () => {
    const { show } = withUserPatternRef()
    const result = validateShowDocument(show)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('user-library-pattern')
    expect(result.errors[0].message).toContain('not resolvable without authentication')
    expect(result.errors[0].message).toContain('inline_patterns')
  })

  it('tolerates an unresolved user reference in editing-session mode, as a warning', () => {
    const { show } = withUserPatternRef()
    const result = validateShowDocument(show, [], { allowUnresolvedUserPatterns: true })
    expect(result.valid).toBe(true)
    expect(result.warnings.some((warning) => warning.code === 'user-library-pattern')).toBe(true)
    // The real editing entry point - an editing session over the record -
    // must open too (openShowDocument runs its own prepare pass).
    const store = createSessionStore()
    const opened = store.open(show, [], { allowUnresolvedUserPatterns: true })
    expect(opened.ok).toBe(true)
    const refused = createSessionStore().open(show)
    expect(refused.ok).toBe(false)
    // Compilation never substitutes silently, whatever the options say.
    const compiled = compileShowDocument(show, [], { allowUnresolvedUserPatterns: true })
    expect(compiled.ok).toBe(false)
    if (!compiled.ok) expect(compiled.errors[0].code).toBe('user-library-pattern')
  })

  it('accepts a user reference when its source arrives inline', () => {
    const { show, source } = withUserPatternRef()
    const result = validateShowDocument(show, [{ id: 'inline-under-test', source }])
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects unknown stock pattern ids instead of silently substituting', () => {
    const show = stockShow()
    show.composition.patternInstances[0].pattern = { kind: 'stock', id: 'NoSuchPatternAnywhere' }
    const result = validateShowDocument(show)
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('unknown-stock-pattern')
    expect(result.errors[0].message).toContain('NoSuchPatternAnywhere')
  })
})

describe('compileShowDocument (#7)', () => {
  it('compiles a stock Show to code plus a full summary', () => {
    const result = compileShowDocument(stockShow())
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(result.code.length).toBeGreaterThan(0)
    expect(result.summary.artifactBytes).toBeGreaterThan(0)
    expect(result.summary.measuredDeviceBudgetBytes).toBeGreaterThan(0)
    expect(result.summary.artifactBudgetRatio).toBeGreaterThan(0)
    expect(result.summary.clipCount).toBeGreaterThanOrEqual(1)
  })

  it('compiles an inline user pattern end-to-end', () => {
    const { show, source } = withUserPatternRef()
    const result = compileShowDocument(show, [{ id: 'inline-under-test', source }])
    expect(result.ok, JSON.stringify(result)).toBe(true)
  })

  it('returns validation errors instead of compiling an invalid document', () => {
    const result = compileShowDocument('not even json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].code).toBe('malformed-json')
  })

  // The v1 compile path reported an advisory `artifactBlocker` for a target
  // pixel count above SHOW_MAX_OUTPUT_PIXELS. The v2 preparation owner has no
  // such advisory and takes no caller-supplied target count, so this harness no
  // longer surfaces that deployment blocker (#1039 residual).
})
