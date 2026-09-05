// V2-authored for #945 (integration review correction 2): stock Pattern
// references resolve through V2's retired-id table. Boundary: the tier-0
// validator, the compiler, the editing session, the catalogue lookup, the
// control-export check and the critique - every harness site that looks a
// stock id up. Invariant: a Show carrying a retired id behaves exactly as the
// same Show carrying the superseding id; an id V2 does not know is refused.
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { RETIRED_STOCK_PATTERN_IDS } from '@/pixelblaze/stock/patterns'
import { openShowDocument } from '../grammar/openShow.js'
import { createSessionStore } from '../grammar/session.js'
import { compositionOf, controlExportIssue } from '../grammar/support.js'
import { critiqueShow } from '../shows/critique.js'
import { compileShowDocument, validateShowDocument } from '../shows/evaluate.js'
import { getStockPattern } from '../shows/stockCatalogue.js'
import { runTelemetry } from '../telemetry/harness.js'
import { grammarFixtureShow } from './support/grammarFixture.js'

const RETIRED_ID = 'DoomFire'
const CURRENT_ID = RETIRED_STOCK_PATTERN_IDS[RETIRED_ID]

function fireShow(id: string): ShowRecord {
  const show = grammarFixtureShow()
  show.cells[0].pattern = { kind: 'stock', id }
  show.cells[0].patternName = 'Doom Fire'
  return show
}

describe('retired stock ids resolve as V2 resolves them (#945)', () => {
  it('names a real retired id', () => {
    expect(CURRENT_ID).toBeDefined()
    expect(CURRENT_ID).not.toBe(RETIRED_ID)
  })

  it('validates and opens a durable Show that still carries the retired id', () => {
    const validation = validateShowDocument(fireShow(RETIRED_ID))
    expect(validation.errors).toEqual([])
    expect(validation.valid).toBe(true)

    const opened = createSessionStore().open(fireShow(RETIRED_ID))
    expect(opened.ok, JSON.stringify(opened)).toBe(true)
  })

  it('compiles and renders identically to the superseding id', () => {
    const legacy = compileShowDocument(fireShow(RETIRED_ID))
    const current = compileShowDocument(fireShow(CURRENT_ID))
    expect(legacy.ok, JSON.stringify(legacy)).toBe(true)
    expect(current.ok).toBe(true)
    if (!legacy.ok || !current.ok) return
    expect(legacy.summary).toEqual(current.summary)
    const window = { durationMs: 2_000, fps: 30 }
    expect(JSON.stringify(runTelemetry(legacy.code, legacy.metadata, window)))
      .toBe(JSON.stringify(runTelemetry(current.code, current.metadata, window)))
  })

  it('looks the retired id up in the catalogue as its successor', () => {
    expect(getStockPattern(RETIRED_ID).id).toBe(CURRENT_ID)
    expect(getStockPattern(CURRENT_ID).id).toBe(CURRENT_ID)
  })

  it('checks control exports and critiques through the alias', () => {
    const legacy = openShowDocument(fireShow(RETIRED_ID))
    const current = openShowDocument(fireShow(CURRENT_ID))
    if (!legacy.ok || !current.ok) throw new Error('fixture failed to open')
    const instanceOf = (document: typeof legacy.document) =>
      compositionOf(document).patternInstances.find((instance) => instance.patternName === 'Doom Fire')!.id
    // The successor declares controls, so a wrong export name is refused
    // with its candidates; the retired id must reach the same check.
    const currentIssue = controlExportIssue(current.document, instanceOf(current.document), 'noSuchExport')
    expect(currentIssue?.code).toBe('unknown-control')
    expect(controlExportIssue(legacy.document, instanceOf(legacy.document), 'noSuchExport')).toEqual(currentIssue)

    expect(critiqueShow(fireShow(RETIRED_ID))).toEqual(critiqueShow(fireShow(CURRENT_ID)))
  })

  it('still refuses ids V2 does not know, including prototype names', () => {
    for (const id of ['NoSuchPatternAnywhere', 'constructor', '__proto__', 'hasOwnProperty']) {
      const result = validateShowDocument(fireShow(id))
      expect(result.valid, id).toBe(false)
      expect(result.errors.map((error) => error.code), id).toEqual(['unknown-stock-pattern'])
      expect(result.errors[0].message).toContain(id)
      expect(compileShowDocument(fireShow(id)).ok, id).toBe(false)
    }
    expect(() => getStockPattern('constructor')).toThrowError(/Unknown stock pattern/)
  })
})
