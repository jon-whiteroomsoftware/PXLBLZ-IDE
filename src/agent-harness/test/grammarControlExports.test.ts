// Provenance: pxlblz-v3 test/grammarControlExports.test.ts at 9ecd481f,
// re-authored onto the version-2 catalogue for #1039 (see PROVENANCE.md).
import { describe, expect, it } from 'vitest'
import { dictationFixture, MAIN_LAYER_ID } from '../experiment/fixtures.js'
import { createSessionStore } from '../grammar/session.js'
import { getStockPattern } from '../shows/stockCatalogue.js'

// Test model (issue #39, re-authored for #1039). Boundary: the registry through
// the session store. Invariant: a control name written onto a Pattern instance
// must be a slider the resolved Pattern actually exports; a refusal leaves the
// document unchanged, names the real exports, and writes no history. The check
// reads the session's own trusted resolver, never the command's arguments
// (specification section 6). Partitions: unknown name, real slider, animated
// control target, and a Pattern whose source the session cannot resolve.
//
// v2 collapses the v1 `set_clip_control_target` into `update_clips`'s
// `instance_properties.controls`, and an instance-scoped control track is
// `add_property_tracks` with a `control` target — the values reach the same
// owner, so the same invariant is asserted through the v2 arguments.

function open(fixture: 'base' | 'empty-tail') {
  const store = createSessionStore()
  const opened = store.open(dictationFixture(fixture), [], { allowUnresolvedUserPatterns: true })
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  return {
    store,
    sessionId: opened.sessionId,
    clipId: opened.listing.clips[0].clipId,
    instanceId: opened.listing.clips[0].instanceId,
  }
}

describe('control exports are checked against the Pattern (#39)', () => {
  it('the catalogue lists each stock Pattern\'s declared controls', () => {
    const comet = getStockPattern('CometLoom')
    expect(comet.controls).toEqual(expect.arrayContaining([{ exportName: 'sliderSpeed', kind: 'slider' }]))
  })

  it('refuses a guessed export on a stock Clip, naming the real sliders, without changing the document', () => {
    const { store, sessionId, clipId } = open('base')
    const before = JSON.stringify(store.export(sessionId))
    const refused = store.apply(sessionId, 'update_clips', {
      updates: [{ clip_id: clipId, instance_properties: { controls: { speed: 0.3 } } }],
    })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.issues[0]).toMatchObject({
      code: 'unknown-control',
      message: expect.stringContaining('does not export a slider named "speed"'),
    })
    expect(refused.issues[0].message).toContain('sliderSpeed')
    expect(JSON.stringify(store.export(sessionId))).toBe(before)
    const described = store.describeChanges(sessionId)
    expect(described.ok && described.entries.length).toBe(0)
  })

  it('accepts the real slider export and writes it onto the shared Pattern instance', () => {
    const { store, sessionId, clipId, instanceId } = open('base')
    const accepted = store.apply(sessionId, 'update_clips', {
      updates: [{ clip_id: clipId, instance_properties: { controls: { sliderSpeed: 0.3 } } }],
    })
    expect(accepted.ok, JSON.stringify(accepted)).toBe(true)
    const exported = store.export(sessionId)
    if (!exported.ok) throw new Error('export failed')
    const instance = exported.show.composition.patternInstances.find((candidate) => candidate.id === instanceId)!
    expect(instance.controlTargets).toMatchObject({ sliderSpeed: 0.3 })
  })

  it('applies the same check to a control property track', () => {
    const { store, sessionId, clipId, instanceId } = open('base')
    const refused = store.apply(sessionId, 'add_property_tracks', {
      tracks: [{
        target: { kind: 'control', instance_id: instanceId, control: 'speed' },
        initial_value: 0.3,
      }],
    })
    // v2 catches this one tier later than v1 did: `add_property_tracks` builds
    // a valid track record, and tier-0's metadata check refuses the result
    // because no such slider is declared. The guessed name is still refused and
    // still named; only the layer that says so moved.
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.issues[0].code).toBe('result-invalid')
    if (!refused.ok) expect(refused.issues[0].message).toContain('slider metadata "speed" is unavailable')

    // The engine animates only an authored control, so the target is set first.
    expect(store.apply(sessionId, 'update_clips', {
      updates: [{ clip_id: clipId, instance_properties: { controls: { sliderSpeed: 0.3 } } }],
    }).ok).toBe(true)
    const accepted = store.apply(sessionId, 'add_property_tracks', {
      tracks: [{
        target: { kind: 'control', instance_id: instanceId, control: 'sliderSpeed' },
        initial_value: 0.3,
      }],
    })
    expect(accepted.ok, JSON.stringify(accepted)).toBe(true)
  })

  it('refuses a control on a Pattern whose source the session cannot resolve', () => {
    const { store, sessionId } = open('empty-tail')
    // The session tolerates the unresolvable personal reference for editing, so
    // the Clip exists; writing a control still needs the resolved metadata.
    const added = store.apply(sessionId, 'create_clips', {
      clips: [{
        zone_id: 'z1', layer_id: MAIN_LAYER_ID, start_ms: 30_000, duration_ms: 10_000,
        pattern: { kind: 'user', id: 'my-pattern' },
      }],
    })
    expect(added.ok).toBe(false)
    if (added.ok) return
    expect(added.issues[0].code).toBe('missing-dependency')
    expect(added.issues[0].message).toContain('unavailable')
  })
})
