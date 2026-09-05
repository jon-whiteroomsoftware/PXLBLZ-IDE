// V2-authored for #945 after Jon approved the narrowed generic-operation
// contract: every patch member edits declared Show structure. Arbitrary scratch
// fields and temporary containers are refused even when a later member removes
// them and the final record would validate. Move destinations are checked
// against the post-detach working copy immediately before the write.
// Boundary: apply_patch through the public registry and session transaction.
// Oracles: exact unchanged input/export and zero pending session changes on
// refusal; exact full record for an ordinary accepted multi-field patch.
import { describe, expect, it } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clipAt, fixture } from './support/grammarHarness.js'

const TRAILS = { id: 'trails-1', kind: 'trails' as const, retention: 0.5 }

function withTrails(): ShowGrammarDocument {
  return applyOk(fixture(), 'set_field', { pointer: '/outputEffects', value: [TRAILS] }).document
}

const shiftingScratchExploit = [
  { op: 'add', path: '/scratch', value: ['renamed', {}] },
  { op: 'move', from: '/outputEffects/0', path: '/scratch/1/inner' },
  { op: 'move', from: '/scratch/0', path: '/scratch/0/inner/id' },
  { op: 'move', from: '/scratch/0/inner', path: '/outputEffects/0' },
  { op: 'remove', path: '/scratch' },
]

describe('generic edits stay inside declared Show structure (#945 narrowed completion)', () => {
  it('refuses the exact array-shift scratch exploit even though its final shape would validate', () => {
    const document = withTrails()
    const issues = applyRefused(document, 'apply_patch', { patch: shiftingScratchExploit }, 'invalid-argument')
    expect(issues[0].message).toContain('/scratch')
    expect(issues[0].message).toMatch(/declared Show structure/i)
  })

  it('refuses the scratch exploit atomically through a session transaction', () => {
    const document = withTrails()
    const store = createSessionStore()
    const opened = store.open(document.show)
    if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
    expect(store.begin(opened.sessionId, 'declared structure').ok).toBe(true)

    const refused = store.apply(opened.sessionId, 'apply_patch', { patch: shiftingScratchExploit })

    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.issues[0].message).toContain('/scratch')
    expect(store.pending(opened.sessionId)).toEqual({ ok: true, open: { label: 'declared structure', changes: 0 } })
    const exported = store.export(opened.sessionId)
    expect(exported.ok && exported.show).toEqual(document.show)
    expect(store.rollback(opened.sessionId).ok).toBe(true)
  })

  it('checks the actual identity target after a source detach shifts its destination array', () => {
    let document = fixture()
    const secondClip = clipAt(document, 30_000)
    document = applyOk(document, 'add_property_track', {
      clip_id: secondClip.clipId,
      target: 'view-brightness',
      keyframes: [{ time_ms: 30_000, value: 1 }, { time_ms: 40_000, value: 0.5 }],
    }).document
    const composition = document.show.composition as ShowCompositionV1
    const trackId = composition.scenes[1].propertyTracks![0].id

    const issues = applyRefused(document, 'apply_patch', {
      patch: [{
        op: 'move',
        from: '/composition/scenes/0',
        path: '/composition/scenes/0/propertyTracks/0/id',
      }],
    }, 'invalid-argument')
    expect(issues[0].message).toContain(trackId)
    expect(issues[0].message).toMatch(/identity/i)
  })

  it('refuses final-only validity when an earlier patch member leaves declared structure', () => {
    const document = withTrails()
    const issues = applyRefused(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: '/name' },
        { op: 'add', path: '/name', value: 'Restored later' },
      ],
    }, 'invalid-argument')
    expect(issues[0].message).toContain('/name')
    expect(issues[0].message).toMatch(/required property/i)
  })

  it('accepts an ordinary multi-field patch whose every member stays in declared structure', () => {
    const document = fixture()
    const patched = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'test', path: '/name', value: 'Grammar fixture' },
        { op: 'replace', path: '/name', value: 'Patched' },
        { op: 'add', path: '/outputEffects', value: [TRAILS] },
        { op: 'replace', path: '/outputEffects/0/retention', value: 0.75 },
      ],
    })
    const expected = structuredClone(document.show)
    expected.name = 'Patched'
    expected.outputEffects = [{ ...TRAILS, retention: 0.75 }]
    expect(patched.document.show).toEqual(expected)
  })
})
