// Provenance: pxlblz-v3 test/exportShow.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { parseEpe } from '@/engine/epeImport'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { exportShowDocument } from '../shows/exportShow.js'

const STAMP = '2026-08-14T00:00:00.000Z'

describe('exportShowDocument (#15)', () => {
  it('exports a stock Show as an .epe that round-trips through parseEpe', () => {
    const show = structuredClone(STOCK_SHOWS[0].show)
    const result = exportShowDocument(show, [], { stampedAt: STAMP })
    expect(result.ok, JSON.stringify(result).slice(0, 300)).toBe(true)
    if (!result.ok) return

    expect(result.epeFilename.endsWith('.epe')).toBe(true)
    const parsed = parseEpe(result.epeText)
    expect(parsed.src.length).toBeGreaterThan(0)
    expect(parsed.name.length).toBeGreaterThan(0)
    // Show provenance survives the round trip in the PXLBLZ banner stamp.
    expect(parsed.stamp).not.toBeNull()
    expect(parsed.stamp!.kind).toBe('show')

    // The exported source is the documented artifact: PXLBLZ banner with
    // Show provenance ahead of the generated code.
    expect(result.source).toContain('PXLBLZ')
    expect(result.artifactBytes).toBeGreaterThan(0)
    expect(result.artifactBudgetRatio).toBeGreaterThan(0)
  })

  it('fails invalid documents with tier-0 typed errors', () => {
    const result = exportShowDocument('{"broken":')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].code).toBe('malformed-json')
  })

  it('is deterministic when the stamp time is injected', () => {
    const show = structuredClone(STOCK_SHOWS[0].show)
    const first = exportShowDocument(show, [], { stampedAt: STAMP, epeId: 'fixed-id' })
    const second = exportShowDocument(show, [], { stampedAt: STAMP, epeId: 'fixed-id' })
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
