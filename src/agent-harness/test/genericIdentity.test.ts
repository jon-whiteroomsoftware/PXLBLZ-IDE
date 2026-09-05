// V2-authored for #945 (integration review correction 4): the generic
// operations preserve engine-minted element identity. Boundary: set_field
// and apply_patch through the registry (and once through a session
// transaction), judged on the complete before and after records. Domain: the
// `id` of every array-member object in the ShowRecord (Scenes, Zones,
// Layouts, Transitions, instances, placements, layers, Effects, tracks,
// keyframes, markers, output Effects) - what the coverage allowlist excludes
// as "*/id". Invariants: a refused write leaves the record unchanged and
// names the identity; an accepted write yields exactly the expected record,
// every identity present before still present. Partitions: direct id
// writes; element and ancestor subtree replacement; array reorder, append
// and removal; copy that would duplicate an identity; reference fields that
// merely name a Pattern, which stay editable.
import { describe, expect, it } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clips, fixture, withLayerTransition } from './support/grammarHarness.js'

/** The overlay fixture plus two markers, a main-clip Effect, and an opacity track. */
function richDocument(): ShowGrammarDocument {
  let document = fixture({ overlay: true })
  document = applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
  document = applyOk(document, 'add_marker', { at_ms: 20_000, name: 'Lift' }).document
  const mainClip = clips(document).find((clip) => clip.layer.kind === 'main' && clip.startMs === 0)!
  document = applyOk(document, 'add_clip_effect', { clip_id: mainClip.clipId, kind: 'brightness' }).document
  document = applyOk(document, 'add_property_track', {
    clip_id: 'ov-clip-1',
    target: 'opacity',
    keyframes: [{ time_ms: 3_000, value: 0.8 }, { time_ms: 8_000, value: 0.4 }],
  }).document
  return document
}

const composition = (document: ShowGrammarDocument) => document.show.composition as ShowCompositionV1

/** Every element id anywhere in the record, with the collection it sits in. */
function identities(value: unknown, pointer = '', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        out.push(`${pointer}:${(item as { id: string }).id}`)
      }
      identities(item, `${pointer}/${index}`, out)
    })
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) identities(child, `${pointer}/${key}`, out)
  }
  return out
}

function refusedIdentity(document: ShowGrammarDocument, operation: string, args: Record<string, unknown>, id: string) {
  const issues = applyRefused(document, operation, args, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
  return issues
}

describe('direct identity writes are refused (#945)', () => {
  it('for every kind of element the record carries', () => {
    const document = richDocument()
    const comp = composition(document)
    const placement = comp.scenes[0].zones[0].main[0]
    const overlay = comp.scenes[0].zones[0].overlays[0]
    const track = comp.scenes[0].propertyTracks![0]
    const targets: Array<[string, string]> = [
      ['/scenes/0/id', document.show.scenes[0].id],
      ['/zones/0/id', document.show.zones[0].id],
      ['/routingLayouts/0/id', document.show.routingLayouts[0].id],
      ['/composition/patternInstances/0/id', comp.patternInstances[0].id],
      ['/composition/scenes/0/zones/0/main/0/id', placement.id],
      ['/composition/scenes/0/zones/0/main/0/effects/0/id', placement.effects![0].id],
      ['/composition/scenes/0/zones/0/overlays/0/id', overlay.id],
      ['/composition/scenes/0/zones/0/overlays/0/placements/0/id', overlay.placements[0].id],
      ['/composition/scenes/0/propertyTracks/0/id', track.id],
      ['/composition/scenes/0/propertyTracks/0/keyframes/0/id', track.keyframes[0].id],
      ['/composition/markers/0/id', comp.markers![0].id],
    ]
    for (const [pointer, id] of targets) {
      refusedIdentity(document, 'set_field', { pointer, value: 'renamed' }, id)
      refusedIdentity(document, 'apply_patch', { patch: [{ op: 'replace', path: pointer, value: 'renamed' }] }, id)
    }
    // Deleting the identity is refused ahead of the schema.
    refusedIdentity(document, 'set_field', { pointer: '/composition/markers/0/id', delete: true }, comp.markers![0].id)
    // Root identity and bookkeeping stay protected as before.
    applyRefused(document, 'set_field', { pointer: '/id', value: 'other' }, 'invalid-argument')
    applyRefused(document, 'set_field', { pointer: '/updatedAt', value: 1 }, 'invalid-argument')
  })

  it('covers the layer Transition family too', () => {
    const { document, transitionId } = withLayerTransition()
    refusedIdentity(document, 'set_field', { pointer: '/composition/transitions/0/id', value: 'renamed' }, transitionId)
  })
})

describe('subtree replacement cannot smuggle an identity change (#945)', () => {
  it('refuses a replaced element, ancestor, or whole composition carrying a renamed id', () => {
    const document = richDocument()
    const comp = composition(document)
    const marker = comp.markers![0]
    refusedIdentity(document, 'apply_patch', {
      patch: [{ op: 'replace', path: '/composition/markers/0', value: { ...marker, id: 'renamed' } }],
    }, marker.id)
    refusedIdentity(document, 'set_field', {
      pointer: '/composition/markers',
      value: [{ ...marker, id: 'renamed' }, comp.markers![1]],
    }, marker.id)

    const placement = comp.scenes[0].zones[0].main[0]
    const effectId = placement.effects![0].id
    refusedIdentity(document, 'apply_patch', {
      patch: [{
        op: 'replace',
        path: '/composition/scenes/0/zones/0/main/0',
        value: { ...placement, effects: [{ ...placement.effects![0], id: 'renamed' }] },
      }],
    }, effectId)

    const renamedDeep = structuredClone(comp)
    renamedDeep.scenes[0].zones[0].overlays[0].placements[0].id = 'renamed'
    refusedIdentity(document, 'set_field', { pointer: '/composition', value: renamedDeep }, 'ov-clip-1')
  })

  it('refuses a copy that would duplicate an identity', () => {
    const document = richDocument()
    refusedIdentity(document, 'apply_patch', {
      patch: [{ op: 'copy', from: '/composition/markers/0', path: '/composition/markers/-' }],
    }, composition(document).markers![0].id)
  })

  it('refuses inside a transaction without touching the working copy', () => {
    const store = createSessionStore()
    const opened = store.open(richDocument().show)
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId
    expect(store.begin(sessionId, 'identity txn').ok).toBe(true)
    const refused = store.apply(sessionId, 'set_field', { pointer: '/composition/markers/0/id', value: 'renamed' })
    expect(refused.ok).toBe(false)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: { label: 'identity txn', changes: 0 } })
    expect(store.rollback(sessionId).ok).toBe(true)
  })
})

describe('structural edits that keep every identity are accepted (#945)', () => {
  it('edits fields beside an id and replaces an element under its own id', () => {
    const document = richDocument()
    const before = identities(document.show)

    const renamedMarker = applyOk(document, 'set_field', { pointer: '/composition/markers/0/name', value: 'Bass' })
    const expectedName = structuredClone(document.show)
    expectedName.composition!.markers![0].name = 'Bass'
    expect(renamedMarker.document.show).toEqual(expectedName)
    expect(identities(renamedMarker.document.show)).toEqual(before)

    const marker = composition(document).markers![0]
    const moved = applyOk(document, 'apply_patch', {
      patch: [{ op: 'replace', path: '/composition/markers/0', value: { ...marker, timeMs: 13_000 } }],
    })
    const expectedTime = structuredClone(document.show)
    expectedTime.composition!.markers![0].timeMs = 13_000
    expect(moved.document.show).toEqual(expectedTime)
    expect(identities(moved.document.show)).toEqual(before)
  })

  it('reorders, appends with a fresh id, and removes elements', () => {
    const document = richDocument()
    const [first, second] = composition(document).markers!

    const reordered = applyOk(document, 'apply_patch', {
      patch: [{ op: 'move', from: '/composition/markers/0', path: '/composition/markers/1' }],
    })
    const expectedOrder = structuredClone(document.show)
    expectedOrder.composition!.markers = [second, first]
    expect(reordered.document.show).toEqual(expectedOrder)

    const appended = applyOk(document, 'apply_patch', {
      patch: [{ op: 'add', path: '/composition/markers/-', value: { id: 'marker-fresh', timeMs: 25_000, name: 'Tail' } }],
    })
    const expectedAppend = structuredClone(document.show)
    expectedAppend.composition!.markers = [first, second, { id: 'marker-fresh', timeMs: 25_000, name: 'Tail' }]
    expect(appended.document.show).toEqual(expectedAppend)
    expect(identities(appended.document.show).sort()).toEqual([...identities(document.show), '/composition/markers:marker-fresh'].sort())

    const removed = applyOk(document, 'apply_patch', { patch: [{ op: 'remove', path: '/composition/markers/1' }] })
    const expectedRemove = structuredClone(document.show)
    expectedRemove.composition!.markers = [first]
    expect(removed.document.show).toEqual(expectedRemove)

    // The output-Effect backstop the generics were written for (#22) still works.
    const trails = applyOk(document, 'apply_patch', {
      patch: [{ op: 'add', path: '/outputEffects', value: [{ id: 'trails-1', kind: 'trails', retention: 0.5 }] }],
    })
    expect(trails.document.show.outputEffects).toEqual([{ id: 'trails-1', kind: 'trails', retention: 0.5 }])
  })

  it('leaves Pattern reference ids editable: they name a Pattern, not an element', () => {
    const document = richDocument()
    const instanceIndex = composition(document).patternInstances.findIndex((instance) => instance.pattern.id === 'TestPattern1D')
    expect(instanceIndex).toBeGreaterThanOrEqual(0)
    const swapped = applyOk(document, 'apply_patch', {
      patch: [{ op: 'replace', path: `/composition/patternInstances/${instanceIndex}/pattern/id`, value: 'CometLoom' }],
    })
    const expected = structuredClone(document.show)
    expected.composition!.patternInstances[instanceIndex].pattern.id = 'CometLoom'
    expect(swapped.document.show).toEqual(expected)
    expect(identities(swapped.document.show)).toEqual(identities(document.show))
  })
})
