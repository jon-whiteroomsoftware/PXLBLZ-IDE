// The editing session's authoring-validation boundary, re-authored on
// version-2 faults for #1039.
//
// The invariant is unchanged from the v1 suite: an authoring session accepts
// more than delivery does, and every refusal on that wider surface leaves the
// document, the history and the redo stack exactly as they were. What changed
// is the fault vocabulary — there are no Scenes, cells or flat projection to
// break — so each case below is written on a v2 fault at the document level the
// bridge actually hands over.
//
// Cases of the v1 suite that are not re-authored here, and why:
//
// - "keeps broader authoring acceptance internal and reports its diagnostics
//   explicitly" was written on the caller-supplied `stageDimension` option,
//   which v2 retires (a record names its own Stage map). The surviving content
//   — the editing session tolerating an unresolvable personal reference while
//   strict validation refuses it — is asserted by `showEvaluate.test.ts`
//   ("tolerates an unresolved user reference in editing-session mode") and by
//   the product's own `src/engine/showAuthoringValidationV2.test.ts`.
// - "requires actual metadata for flat projection and preserves the source
//   input on refusal": flat projection is retired, so the premise is gone.
// - "preserves an existing missing stock Pattern on the internal composition
//   path only": v2 makes an unknown *stock* id a hard error in every mode
//   (`shows/evaluate.ts`), a deliberate narrowing. The replacement behaviour is
//   asserted by `showEvaluate.test.ts` ("rejects unknown stock pattern ids
//   instead of silently substituting") and `bridgeAuthoringValidation.test.ts`
//   ("refuses unresolvable-pattern at service open").
// - the three internal-file-importer cases were written on
//   `preserveAuthoringPhysicalRanges` and on the v1 importer rewriting a
//   record on the way in. A v2 record round-trips whole, which
//   `bridgeTypedOutcome.test.ts` asserts against the reopened `.pxlshow`.
import { expect, it } from 'vitest'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { createSessionStore } from '../grammar/session'
import { openShowDocument } from '../grammar/openShow'
import { compileShowDocument, validateShowDocument } from '../shows/evaluate'
import { grammarFixtureShow, openGrammarFixture } from './support/grammarFixture'

/** An authoring session over one record, opened in editing-session mode. */
function session(show: ShowRecordV2, patterns: Array<{ id: string; name?: string; source: string }> = [], options = {}) {
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, patterns, { allowUnresolvedUserPatterns: true, ...options })
  if (!opened.ok) throw new Error(`session failed to open: ${JSON.stringify(opened.issues)}`)
  return { store, sessionId: opened.sessionId, listing: opened.listing }
}

it('edits, exports and reopens an empty Show while delivery still refuses it', async () => {
  // Specification section 9: an empty Show is a valid, editable, saveable
  // record whose preview and export are unavailable. That is v2's own
  // authoring-accepts/delivery-refuses partition.
  const show = grammarFixtureShow()
  show.composition.clips = []
  show.composition.transitions = []
  const { store, sessionId } = session(show)

  expect(store.begin(sessionId).ok).toBe(true)
  expect(store.apply(sessionId, 'rename_show', { name: 'Still authoring' }).ok).toBe(true)
  expect(store.validatePending(sessionId).ok).toBe(true)
  expect(store.commit(sessionId).ok).toBe(true)
  const exported = store.export(sessionId)
  expect(exported.ok).toBe(true)
  if (!exported.ok) return

  // It reopens for editing, both as an object and as a JSON string.
  expect(openShowDocument(JSON.stringify(exported.show), [], {}, { authoringValidation: true }).ok).toBe(true)
  const { bundle, filename } = buildShowFileBundle(exported.show, { patterns: [], maps: [], libraries: [] }, { appVersion: 'D1-test', exportedAt: '2026-09-08T00:00:00.000Z' })
  expect(filename).toMatch(/\.pxlshow$/)
  const reopenedFile = await parseShowFileBundle(await serializeShowFileBundle(bundle), { acceptV2: true })
  expect(reopenedFile.version).toBe(2)
  if (reopenedFile.version !== 2) return
  // A v2 record round-trips whole; the importer normalizes nothing away.
  expect(reopenedFile.show).toEqual(exported.show)
  expect(openShowDocument(reopenedFile.show, [], {}, { authoringValidation: true }).ok).toBe(true)

  // Delivery still refuses, by name.
  const compiled = compileShowDocument(exported.show)
  expect(compiled.ok).toBe(false)
  if (!compiled.ok) expect(compiled.errors[0].message).toContain('no Clips')

  expect(store.undo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual({ ok: true, show })
  expect(store.redo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual(exported)
})

it('refuses a control write needing absent personal metadata without changing document or history', () => {
  const show = openGrammarFixture().document.show
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'missing-personal' }
  const { store, sessionId, listing } = session(show)
  const before = store.export(sessionId)
  const history = store.describeChanges(sessionId)
  const clip = listing.clips.find((candidate) => candidate.instanceId === 'inst-1')!

  const result = store.apply(sessionId, 'update_clips', {
    updates: [{ clip_id: clip.clipId, instance_properties: { controls: { sliderInvented: 0.5 } } }],
  })
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.issues[0].code).toBe('missing-dependency')
  expect(store.export(sessionId)).toEqual(before)
  expect(store.describeChanges(sessionId)).toEqual(history)
})

it('preserves an existing missing Library by owner and source identity, but rejects a new owner', () => {
  const show = openGrammarFixture().document.show
  const first = show.composition.patternInstances[0]
  first.pattern = { kind: 'user', id: 'personal' }
  const patterns = [{ id: 'personal', source: 'export function render(index) { Missing.paint(index) }' }]
  const { store, sessionId } = session(show, patterns)

  // The existing unresolvable owner is carried, so unrelated editing continues.
  expect(store.apply(sessionId, 'rename_show', { name: 'Unrelated edit' }).ok).toBe(true)
  const before = store.export(sessionId)
  const history = store.describeChanges(sessionId)

  // A second instance adopting the same unresolvable source is a *new* owner.
  const result = store.apply(sessionId, 'set_field', {
    pointer: '/composition/patternInstances/1/pattern',
    value: first.pattern,
  })
  expect(result.ok).toBe(false)
  expect(store.export(sessionId)).toEqual(before)
  expect(store.describeChanges(sessionId)).toEqual(history)
})

it.each(['missing-zone', 'malformed-routing', 'missing-instance', 'duplicate-instance', 'same-layer-overlap'] as const)(
  'refuses %s mid-session and preserves complete redo history',
  (fault) => {
    const show = openGrammarFixture({ overlay: true }).document.show
    const { store, sessionId } = session(show)
    expect(store.apply(sessionId, 'rename_show', { name: 'Later' }).ok).toBe(true)
    const later = store.export(sessionId)
    expect(store.undo(sessionId).ok).toBe(true)
    const before = store.export(sessionId)
    const history = store.describeChanges(sessionId)

    let pointer: string
    let value: unknown
    if (fault === 'missing-zone') {
      pointer = '/zoneLayouts/0/logical/zoneIds'
      value = ['gone']
    } else if (fault === 'malformed-routing') {
      pointer = '/zoneLayouts/0/logical'
      value = { kind: 'grid', zoneIds: ['z1'], columns: 2, rows: 1 }
    } else if (fault === 'missing-instance') {
      pointer = '/composition/clips/0/instanceId'
      value = 'gone'
    } else if (fault === 'duplicate-instance') {
      pointer = '/composition/patternInstances/-'
      value = structuredClone(show.composition.patternInstances[0])
    } else {
      pointer = '/composition/clips/-'
      value = { ...structuredClone(show.composition.clips[0]), id: 'overlapping-clip', startMs: 100, durationMs: 100 }
    }

    expect(store.apply(sessionId, 'set_field', { pointer, value }).ok, fault).toBe(false)
    expect(store.export(sessionId)).toEqual(before)
    expect(store.describeChanges(sessionId)).toEqual(history)
    expect(store.redo(sessionId).ok).toBe(true)
    expect(store.export(sessionId)).toEqual(later)
  },
)

it('rejects a Zone Layout that does not provide a Clip\'s Zone', () => {
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 8, resolution: 'fixed' } as never
  show.zoneLayouts = [{ id: 'l1', name: 'Physical', zones: [{ zoneId: 'gone', ranges: [{ start: 0, end: 7 }] }] }] as never
  const refused = createSessionStore({ authoringValidation: true }).open(show)
  expect(refused.ok).toBe(false)
  // The structural Zone Layout check v1 ran first is restored on the v2 path
  // (#1039 validation parity), so the unknown Zone is named before availability.
  if (!refused.ok) expect(refused.issues[0].message).toContain('has an unknown Zone "gone"')
})

it('refuses an Installation range with a fractional endpoint, as v1 did (#1039)', () => {
  // v1's `invalid-physical-range` structural error returns before coverage is
  // computed; the validation parity ports restored it on the v2 path.
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 8, resolution: 'fixed' } as never
  show.zoneLayouts = [{ id: 'l1', name: 'Physical', zones: [{ zoneId: 'z1', ranges: [{ start: 0.5, end: 7 }] }] }] as never
  expect(validateShowDocument(show).valid).toBe(false)
  expect(createSessionStore({ authoringValidation: true }).open(show).ok).toBe(false)
})

it('preserves one missing Pattern but refuses replacement and transplantation, then repairs it', () => {
  const show = openGrammarFixture().document.show
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'missing' }
  const { store, sessionId } = session(show)
  expect(store.apply(sessionId, 'rename_show', { name: 'Unrelated' }).ok).toBe(true)
  const before = store.export(sessionId)

  // Neither swapping the missing owner for a different missing one, nor giving
  // a second instance the same missing source, is accepted.
  for (const [index, id] of [[0, 'other-missing'], [1, 'missing']] as const) {
    expect(store.apply(sessionId, 'set_field', {
      pointer: `/composition/patternInstances/${index}/pattern`, value: { kind: 'user', id },
    }).ok).toBe(false)
    expect(store.export(sessionId)).toEqual(before)
  }

  // Repairing it with a resolvable stock Pattern is accepted and reopens.
  expect(store.apply(sessionId, 'set_field', {
    pointer: '/composition/patternInstances/0/pattern', value: { kind: 'stock', id: 'CometLoom' },
  }).ok).toBe(true)
  const exported = store.export(sessionId)
  expect(exported.ok).toBe(true)
  if (exported.ok) expect(openShowDocument(JSON.stringify(exported.show), [], {}, { authoringValidation: true }).ok).toBe(true)
})

it('refuses generic control writes requiring absent metadata', () => {
  const show = openGrammarFixture().document.show
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'missing' }
  const { store, sessionId } = session(show)
  const before = store.export(sessionId)
  expect(store.apply(sessionId, 'set_field', {
    pointer: '/composition/patternInstances/0/controlTargets', value: { sliderInvented: 0.5 },
  }).ok).toBe(false)
  expect(store.export(sessionId)).toEqual(before)
})

it('snapshots caller source and Library metadata and validates a supplied personal slider', () => {
  const show = openGrammarFixture().document.show
  const instance = show.composition.patternInstances[0]
  instance.pattern = { kind: 'user', id: 'personal' }
  const patterns = [{ id: 'personal', source: 'export function sliderSpeed(v) {} export function render(index) { House.paint(index) }' }]
  const options = {
    allowUnresolvedUserPatterns: true,
    authoringLibraries: { House: 'function paint(index) { rgb(1, 1, 1) }' } as Record<string, string>,
  }
  const { store, sessionId, listing } = session(show, patterns, options)

  // The session captured its dependency boundary at open; later caller mutation
  // must not reach it (specification section 6).
  patterns[0].source = 'export function render(index) { Different.paint(index) }'
  options.authoringLibraries.House = 'this is not source'
  instance.pattern.id = 'caller-mutation'

  const clip = listing.clips.find((candidate) => candidate.instanceId === 'inst-1')!
  expect(store.apply(sessionId, 'update_clips', {
    updates: [{ clip_id: clip.clipId, instance_properties: { controls: { sliderSpeed: 0.5 } } }],
  }).ok).toBe(true)
  const exported = store.export(sessionId)
  expect(exported.ok).toBe(true)
  if (exported.ok) expect(exported.show.composition.patternInstances[0].pattern.id).toBe('personal')
})

it('refuses an invalid final private candidate without changing committed state or redo', () => {
  const { store, sessionId, listing } = session(openGrammarFixture({ emptyTail: true }).document.show)
  store.apply(sessionId, 'rename_show', { name: 'Redo target' })
  const later = store.export(sessionId)
  store.undo(sessionId)
  const before = store.export(sessionId)
  const history = store.describeChanges(sessionId)

  // A candidate every command owner accepts and only the final validation
  // refuses: a participant Transition beside a section-scoped activation.
  const first = listing.clips[0]
  store.begin(sessionId)
  const resized = store.apply(sessionId, 'resize_clip', { clip_id: first.clipId, duration_ms: 10_000 })
  expect(resized.ok).toBe(true)
  const created = store.apply(sessionId, 'create_clips', {
    clips: [{
      zone_id: first.zoneId, layer_id: first.layerId, start_ms: 10_000, duration_ms: 10_000,
      pattern: { kind: 'stock', id: 'TestPattern2D' },
    }],
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return
  const secondClipId = (created.changes[0].details as { clips: string[] }).clips.find((id) => id !== first.clipId)!
  expect(store.apply(sessionId, 'add_property_tracks', {
    tracks: [{
      target: { kind: 'view-brightness', clip_id: secondClipId },
      keyframes: [{ at_ms: 10_000, value: 1 }, { at_ms: 20_000, value: 0.2 }],
    }],
  }).ok).toBe(true)
  expect(store.apply(sessionId, 'insert_transition', {
    from_clip_id: first.clipId, to_clip_id: secondClipId, duration_ms: 2_000, kind: 'crossfade',
  }).ok).toBe(true)

  expect(store.validatePending(sessionId).ok).toBe(false)
  expect(store.commit(sessionId).ok).toBe(false)
  expect(store.export(sessionId)).toEqual(before)
  expect(store.describeChanges(sessionId)).toEqual(history)
  // A refused commit leaves the transaction open for correction; the refusal's
  // own remedy says so, so discarding it must be the caller's choice.
  expect(store.pending(sessionId)).toEqual({ ok: true, open: { label: 'edit', changes: 4 } })
  expect(store.rollback(sessionId).ok).toBe(true)
  expect(store.redo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual(later)
})

it('does not promote a member resource-fit failure into an authoring refusal', () => {
  const show = openGrammarFixture().document.show
  const source = 'var field = array(20000)\nexport function render(index) { rgb(field[index], 0, 0) }'
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'large' }
  show.composition.patternInstances[0].patternName = 'Large'
  const { store, sessionId } = session(show, [{ id: 'large', name: 'Large', source }])
  expect(store.apply(sessionId, 'rename_show', { name: 'Needs more memory' }).ok).toBe(true)
  const exported = store.export(sessionId)
  expect(exported.ok).toBe(true)
  if (!exported.ok) return
  // The compile succeeds and reports the blocker in its summary; it is not an
  // authoring refusal, and the harness does not invent one.
  const compiled = compileShowDocument(exported.show, [{ id: 'large', name: 'Large', source }])
  expect(compiled.ok, JSON.stringify(compiled)).toBe(true)
  if (!compiled.ok) return
  expect(compiled.summary.resources.blockers.some((blocker) => blocker.kind === 'vm-word-budget')).toBe(true)
})

it.each([
  ['incomplete coverage', [{ start: 0, end: 3 }], 8],
  ['overlapping ranges', [{ start: 0, end: 5 }, { start: 4, end: 7 }], 8],
  ['out-of-range endpoints', [{ start: -3, end: 11 }], 8],
  ['an over-capacity pixel count', [{ start: 0, end: 2000 }], 2001],
] as const)('keeps Installation %s authorable on the version-2 path, as v1 did (#1039)', (_name, ranges, pixelCount) => {
  // v1 classified each of these as a delivery matter, not an authoring error:
  // the Show stays valid and authorable, and the artifact boundary refuses.
  // The v2 path now does the same (the Installation coverage check and the
  // validation parity ports restored it), so the harness pins the record
  // staying authorable with its ranges carried through untouched.
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount, resolution: 'fixed' } as never
  show.zoneLayouts = [{ id: 'l1', name: 'Physical', zones: [{ zoneId: 'z1', ranges: ranges.map((range) => ({ ...range })) }] }] as never
  const before = structuredClone(show)

  expect(validateShowDocument(show).valid).toBe(true)
  const { store, sessionId } = session(show)
  expect(store.apply(sessionId, 'rename_show', { name: 'Authoring' }).ok).toBe(true)
  const exported = store.export(sessionId)
  expect(exported.ok).toBe(true)
  // The authored ranges are carried through untouched; nothing is repaired.
  if (exported.ok) expect(exported.show.zoneLayouts).toEqual(before.zoneLayouts)
})
