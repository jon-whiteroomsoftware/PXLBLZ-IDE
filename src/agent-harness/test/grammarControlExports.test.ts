// Provenance: pxlblz-v3 test/grammarControlExports.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { dictationFixture } from '../experiment/fixtures.js'
import { createSessionStore } from '../grammar/session.js'
import { getStockPattern } from '../shows/stockCatalogue.js'

// Test model (issue #39). Boundary: the registry through the session store.
// Invariant: a control export name on a stock-pattern clip must be one the
// Pattern declares as a slider; a refusal leaves the document unchanged and
// names the real exports. Partitions: unknown name, non-slider control,
// real slider, user-library clip (unchecked); each for set_clip_control_target
// and for add_property_track with target control.

function open(fixture: 'base' | 'empty-second-scene') {
  const store = createSessionStore()
  const opened = store.open(dictationFixture(fixture), [], { allowUnresolvedUserPatterns: true })
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  return { store, sessionId: opened.sessionId, clipId: opened.listing.clips[0].clipId }
}

describe('control exports are checked against the Pattern (#39)', () => {
  it('the catalogue lists each stock Pattern\'s declared controls', () => {
    const comet = getStockPattern('CometLoom')
    expect(comet.controls).toEqual(expect.arrayContaining([{ exportName: 'sliderSpeed', kind: 'slider' }]))
  })

  it('refuses a guessed export on a stock clip, naming the real sliders, without changing the document', () => {
    const { store, sessionId, clipId } = open('base')
    const before = JSON.stringify(store.export(sessionId))
    const refused = store.apply(sessionId, 'set_clip_control_target', { clip_id: clipId, export_name: 'speed', value: 0.3 })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.issues[0]).toMatchObject({
      code: 'unknown-control',
      message: expect.stringContaining('no control export "speed"'),
      remedy: expect.stringContaining('exactly'),
      candidates: expect.arrayContaining(['sliderSpeed']),
    })
    expect(JSON.stringify(store.export(sessionId))).toBe(before)
    const described = store.describeChanges(sessionId)
    expect(described.ok && described.entries.length).toBe(0)
  })

  it('accepts the real slider export', () => {
    const { store, sessionId, clipId } = open('base')
    const accepted = store.apply(sessionId, 'set_clip_control_target', { clip_id: clipId, export_name: 'sliderSpeed', value: 0.3 })
    expect(accepted.ok).toBe(true)
  })

  it('applies the same check to a control property track', () => {
    const { store, sessionId, clipId } = open('base')
    const refused = store.apply(sessionId, 'add_property_track', {
      clip_id: clipId, target: 'control', control_export_name: 'speed', initial_value: 0.3,
    })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.issues[0].code).toBe('unknown-control')
    // The engine animates only an authored control, so the target is set first.
    expect(store.apply(sessionId, 'set_clip_control_target', { clip_id: clipId, export_name: 'sliderSpeed', value: 0.3 }).ok).toBe(true)
    const accepted = store.apply(sessionId, 'add_property_track', {
      clip_id: clipId, target: 'control', control_export_name: 'sliderSpeed', initial_value: 0.3,
    })
    expect(accepted.ok).toBe(true)
  })

  it('leaves a user-library clip unchecked', () => {
    const { store, sessionId } = open('empty-second-scene')
    const added = store.apply(sessionId, 'add_clip', {
      zone_id: 'z1', start_ms: 35_000, duration_ms: 10_000, pattern_kind: 'user', pattern_id: 'my-pattern',
    })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const accepted = store.apply(sessionId, 'set_clip_control_target', {
      clip_id: added.changes[0].targetId, export_name: 'anything', value: 0.5,
    })
    expect(accepted.ok).toBe(true)
  })
})
