import { expect, it } from 'vitest'
import { compileShowForArtifact } from '@/engine/showPreviewArtifact'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { createSessionStore } from '../grammar/session'
import { openShowDocument } from '../grammar/openShow'
import { validateShowDocument } from '../shows/evaluate'
import { openGrammarFixture } from './support/grammarFixture'

it('edits and reopens a delivery-incomplete Show while delivery still refuses it', async () => {
  const show = openGrammarFixture().document.show
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, [], { stageDimension: 3 })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(store.begin(opened.sessionId).ok).toBe(true)
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Still authoring' }).ok).toBe(true)
  expect(store.validatePending(opened.sessionId).ok).toBe(true)
  expect(store.commit(opened.sessionId).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (!exported.ok) return
  expect(openShowDocument(JSON.stringify(exported.show), [], { stageDimension: 3 }, { authoringValidation: true }).ok).toBe(true)
  const { bundle, filename } = buildShowFileBundle(exported.show, { patterns: [], maps: [] }, { appVersion: 'D1-test', exportedAt: '2026-09-08T00:00:00.000Z' })
  expect(filename).toMatch(/\.pxlshow$/)
  const reopenedFile = await parseShowFileBundle(await serializeShowFileBundle(bundle))
  expect(reopenedFile.show).toEqual({
    ...exported.show,
    cells: exported.show.cells.map(cell => ({ ...cell, restartOnEntry: false })),
    transitions: [{ id: 'transition-s1', afterSceneId: 's1', durationMs: 0, kind: 'cut', easing: { curve: 'linear' } }],
  })
  expect(openShowDocument(reopenedFile.show, [], { stageDimension: 3 }, { authoringValidation: true }).ok).toBe(true)
  expect(validateShowDocument(exported.show, [], { stageDimension: 3 }).valid).toBe(false)
  expect(store.undo(opened.sessionId).ok).toBe(true)
  expect(store.export(opened.sessionId)).toEqual({ ok: true, show })
  expect(store.redo(opened.sessionId).ok).toBe(true)
  expect(store.export(opened.sessionId)).toEqual(exported)
})

it('refuses unknown personal control metadata without changing document or history', () => {
  const show = openGrammarFixture().document.show
  const instance = show.composition!.patternInstances[0]
  instance.pattern = { kind: 'user', id: 'missing-personal' }
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, [], { allowUnresolvedUserPatterns: true })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  const before = store.export(opened.sessionId)
  const history = store.describeChanges(opened.sessionId)
  const listing = opened.listing.clips.find(clip => clip.instanceId === instance.id)!
  const result = store.apply(opened.sessionId, 'set_clip_control_target', { clip_id: listing.clipId, export_name: 'sliderInvented', value: 0.5 })
  expect(result.ok).toBe(false)
  expect(store.export(opened.sessionId)).toEqual(before)
  expect(store.describeChanges(opened.sessionId)).toEqual(history)
})

it('preserves an existing missing Library by owner and source identity, but rejects a new owner', () => {
  const show = openGrammarFixture().document.show
  const first = show.composition!.patternInstances[0]
  first.pattern = { kind: 'user', id: 'personal' }
  const patterns = [{ id: 'personal', source: 'export function render(index) { Missing.paint(index) }' }]
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, patterns, { allowUnresolvedUserPatterns: true })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Unrelated edit' }).ok).toBe(true)
  const before = store.export(opened.sessionId)
  const history = store.describeChanges(opened.sessionId)
  const result = store.apply(opened.sessionId, 'set_field', { pointer: '/composition/patternInstances/1/pattern', value: first.pattern })
  expect(result.ok).toBe(false)
  expect(store.export(opened.sessionId)).toEqual(before)
  expect(store.describeChanges(opened.sessionId)).toEqual(history)
})

it.each(['missing-zone', 'malformed-routing', 'missing-instance', 'duplicate-instance', 'same-layer-overlap'] as const)(
  'refuses %s even with delivery capability warnings and preserves complete redo history', (fault) => {
    const show = openGrammarFixture({ overlay: true }).document.show
    const store = createSessionStore({ authoringValidation: true })
    const opened = store.open(show, [], { stageDimension: 3 })
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(store.apply(opened.sessionId, 'rename_show', { name: 'Later' }).ok).toBe(true)
    const later = store.export(opened.sessionId)
    expect(store.undo(opened.sessionId).ok).toBe(true)
    const before = store.export(opened.sessionId)
    const history = store.describeChanges(opened.sessionId)
    const composition = structuredClone(show.composition!)
    let pointer = '/composition'
    let value: unknown = composition
    if (fault === 'missing-zone') {
      pointer = '/routingLayouts/0/logical/zoneIds'
      value = ['gone']
    } else if (fault === 'malformed-routing') {
      pointer = '/routingLayouts/0/logical'
      value = { kind: 'grid', zoneIds: ['z1'], columns: 2, rows: 1 }
    } else if (fault === 'missing-instance') composition.scenes[0].zones[0].main[0].instanceId = 'gone'
    else if (fault === 'duplicate-instance') composition.patternInstances.push(structuredClone(composition.patternInstances[0]))
    else {
      const main = composition.scenes[0].zones[0].main
      main.push({ ...main[0], id: 'new-placement', startMs: 100, durationMs: 100 })
    }
    expect(store.apply(opened.sessionId, 'set_field', { pointer, value }).ok).toBe(false)
    expect(store.export(opened.sessionId)).toEqual(before)
    expect(store.describeChanges(opened.sessionId)).toEqual(history)
    expect(store.redo(opened.sessionId).ok).toBe(true)
    expect(store.export(opened.sessionId)).toEqual(later)
  },
)

it('keeps cross-Layer overlap and incomplete installation coverage through commit and reopen', () => {
  const show = openGrammarFixture({ overlay: true }).document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 256, resolution: 'fixed' }
  show.routingLayouts = [{ id: 'l1', name: 'Incomplete', zones: [{ zoneId: 'z1', ranges: [{ start: 0, end: 31 }] }] }]
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show)
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Coverage later' }).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (!exported.ok) return
  const reopened = openShowDocument(JSON.stringify(exported.show), [], {}, { authoringValidation: true })
  expect(reopened.ok).toBe(true)
  if (reopened.ok) {
    expect(reopened.document.show.composition).toEqual(show.composition)
    expect(reopened.warnings.some(issue => issue.code === 'delivery')).toBe(true)
  }
  expect(validateShowDocument(exported.show).errors.some(issue => issue.code === 'coverage')).toBe(true)
})

it('preserves one missing Pattern but refuses replacement and transplantation, then repairs it', () => {
  const show = openGrammarFixture().document.show
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: 'missing' }
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, [], { allowUnresolvedUserPatterns: true })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Unrelated' }).ok).toBe(true)
  const before = store.export(opened.sessionId)
  for (const [index, id] of [[0, 'other-missing'], [1, 'missing']] as const) {
    expect(store.apply(opened.sessionId, 'set_field', {
      pointer: `/composition/patternInstances/${index}/pattern`, value: { kind: 'user', id },
    }).ok).toBe(false)
    expect(store.export(opened.sessionId)).toEqual(before)
  }
  expect(store.apply(opened.sessionId, 'set_field', {
    pointer: '/composition/patternInstances/0/pattern', value: { kind: 'stock', id: 'CometLoom' },
  }).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (exported.ok) expect(openShowDocument(JSON.stringify(exported.show), [], {}, { authoringValidation: true }).ok).toBe(true)
})

it('refuses generic control writes requiring absent metadata', () => {
  const show = openGrammarFixture().document.show
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: 'missing' }
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, [], { allowUnresolvedUserPatterns: true })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  const before = store.export(opened.sessionId)
  expect(store.apply(opened.sessionId, 'set_field', {
    pointer: '/composition/patternInstances/0/controlTargets', value: { sliderInvented: 0.5 },
  }).ok).toBe(false)
  expect(store.export(opened.sessionId)).toEqual(before)
})

it('keeps broader authoring acceptance internal and reports its diagnostics explicitly', () => {
  const show = openGrammarFixture().document.show
  expect(createSessionStore().open(show, [], { stageDimension: 3 }).ok).toBe(false)
  expect(openShowDocument(show, [], { stageDimension: 3 }).ok).toBe(false)
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, [], { stageDimension: 3 })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(opened.warnings?.some(issue => issue.code === 'delivery')).toBe(true)
  store.begin(opened.sessionId)
  store.apply(opened.sessionId, 'rename_show', { name: 'Internal only' })
  const validation = store.validatePending(opened.sessionId)
  expect(validation.ok).toBe(true)
  if (validation.ok) expect(validation.warnings?.some(issue => issue.code === 'delivery')).toBe(true)
  const commit = store.commit(opened.sessionId)
  expect(commit.ok).toBe(true)
  if (commit.ok) expect(commit.warnings?.some(issue => issue.code === 'delivery')).toBe(true)
})

it('snapshots caller source and Library metadata and validates a supplied personal slider', () => {
  const show = openGrammarFixture().document.show
  const instance = show.composition!.patternInstances[0]
  instance.pattern = { kind: 'user', id: 'personal' }
  const patterns = [{ id: 'personal', source: 'export function sliderSpeed(v) {} export function render(index) { Missing.paint(index) }' }]
  const options = { allowUnresolvedUserPatterns: true, authoringLibraries: {} as Record<string, string> }
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, patterns, options)
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  patterns[0].source = 'export function render(index) { Different.paint(index) }'
  options.authoringLibraries.Missing = 'this is not source'
  instance.pattern.id = 'caller-mutation'
  const clip = opened.listing.clips.find(clip => clip.instanceId === instance.id)!
  expect(store.apply(opened.sessionId, 'set_clip_control_target', { clip_id: clip.clipId, export_name: 'sliderSpeed', value: 0.5 }).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (exported.ok) expect(exported.show.composition!.patternInstances[0].pattern.id).toBe('personal')
})

it('requires actual metadata for flat projection and preserves the source input on refusal', () => {
  const show = openGrammarFixture().document.show
  delete show.composition
  show.cells[0].pattern = { kind: 'user', id: 'missing' }
  const before = structuredClone(show)
  expect(createSessionStore({ authoringValidation: true }).open(show, [], { allowUnresolvedUserPatterns: true }).ok).toBe(false)
  expect(show).toEqual(before)
})

it('refuses an invalid final private candidate without changing committed state or redo', () => {
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(openGrammarFixture({ emptySecondScene: true }).document.show, [], { allowUnresolvedUserPatterns: true })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  store.apply(opened.sessionId, 'rename_show', { name: 'Redo target' })
  const later = store.export(opened.sessionId)
  store.undo(opened.sessionId)
  const before = store.export(opened.sessionId)
  const history = store.describeChanges(opened.sessionId)
  store.begin(opened.sessionId)
  expect(store.apply(opened.sessionId, 'add_clip', {
    zone_id: 'z1', start_ms: 35000, duration_ms: 10000, pattern_kind: 'stock', pattern_id: 'missing-pattern',
  }).ok).toBe(true)
  expect(store.validatePending(opened.sessionId).ok).toBe(false)
  expect(store.commit(opened.sessionId).ok).toBe(false)
  expect(store.export(opened.sessionId)).toEqual(before)
  expect(store.describeChanges(opened.sessionId)).toEqual(history)
  store.rollback(opened.sessionId)
  expect(store.redo(opened.sessionId).ok).toBe(true)
  expect(store.export(opened.sessionId)).toEqual(later)
})

it.each([
  ['overlap', [{ start: 0, end: 5 }, { start: 4, end: 7 }]],
  ['outside', [{ start: -3, end: 11 }]],
  ['missing', [{ start: 0, end: 3 }]],
] as const)('preserves physical %s assignments with diagnostics and delivery refusal', (name, ranges) => {
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 8, resolution: 'fixed' }
  show.routingLayouts = [{ id: 'l1', name, zones: [{ zoneId: 'z1', ranges: ranges.map(range => ({ ...range })) }] }]
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show)
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(opened.warnings?.some(issue => issue.code === 'delivery')).toBe(true)
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Authoring' }).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (!exported.ok) return
  expect(exported.show.routingLayouts).toEqual(show.routingLayouts)
  expect(validateShowDocument(exported.show).valid).toBe(false)
})

it.each([0.5, NaN, Infinity, -Infinity])('refuses malformed physical endpoint %s without throwing', endpoint => {
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 8, resolution: 'fixed' }
  show.routingLayouts = [{ id: 'l1', name: 'Physical', zones: [{ zoneId: 'z1', ranges: [{ start: endpoint, end: 7 }] }] }]
  expect(createSessionStore({ authoringValidation: true }).open(show).ok).toBe(false)
})

it('rejects an unknown physical Zone even when coverage is complete', () => {
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 8, resolution: 'fixed' }
  show.routingLayouts = [{ id: 'l1', name: 'Physical', zones: [{ zoneId: 'gone', ranges: [{ start: 0, end: 7 }] }] }]
  expect(createSessionStore({ authoringValidation: true }).open(show).ok).toBe(false)
})

it('preserves an existing missing stock Pattern on the internal composition path only', () => {
  const show = openGrammarFixture().document.show
  show.composition!.patternInstances[0].pattern = { kind: 'stock', id: 'removed-stock' }
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, [], { allowUnresolvedUserPatterns: true })
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Unrelated' }).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (exported.ok) expect(exported.show.composition!.patternInstances[0].pattern.id).toBe('removed-stock')
  expect(createSessionStore().open(show, [], { allowUnresolvedUserPatterns: true }).ok).toBe(false)
})

it('keeps over-capacity authoring editable while the artifact retains its resource blocker', async () => {
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 2001, resolution: 'fixed' }
  show.routingLayouts = [{ id: 'l1', name: 'Complete', zones: [{ zoneId: 'z1', ranges: [{ start: 0, end: 2000 }] }] }]
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show)
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(opened.warnings?.some(issue => issue.code === 'delivery' && issue.message.includes('2,000'))).toBe(true)
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Over capacity' }).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (!exported.ok) return
  const { bundle } = buildShowFileBundle(exported.show, { patterns: [], maps: [] }, { appVersion: 'D1' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle))
  expect(reopened.show.outputContract).toEqual(show.outputContract)
  expect(compileShowForArtifact(exported.show, [], undefined, {}).artifactBlocker).toContain('2,001 pixels')
})

it('does not promote a member resource-fit failure into an authoring refusal', () => {
  const show = openGrammarFixture().document.show
  const pattern = { id: 'large', name: 'Large', src: 'var field = array(20000); export function render(index) { rgb(field[index], 0, 0) }', controls: {}, updatedAt: 1 }
  show.cells[0].pattern = { kind: 'user', id: pattern.id }
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: pattern.id }
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(show, [{ id: pattern.id, source: pattern.src }])
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(store.apply(opened.sessionId, 'rename_show', { name: 'Needs more memory' }).ok).toBe(true)
  const exported = store.export(opened.sessionId)
  expect(exported.ok).toBe(true)
  if (!exported.ok) return
  const artifact = compileShowForArtifact(exported.show, [pattern], undefined, {}, { stageDimension: 2 })
  expect(artifact.error).toBeNull()
  expect(artifact.artifact?.summary.resources.blockers.some(blocker => blocker.kind === 'vm-word-budget')).toBe(true)
  expect(artifact.artifactBlocker).toBeTruthy()
})

it.each([{ start: -3, end: 11 }, { start: 11, end: -3 }])('preserves qualified authored physical ranges through the internal file importer: %j', async range => {
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 8, resolution: 'fixed' }
  show.routingLayouts = [{ id: 'l1', name: 'Physical', zones: [{ zoneId: 'z1', ranges: [range] }] }]
  const { bundle } = buildShowFileBundle(show, { patterns: [], maps: [] }, { appVersion: 'D1' })
  const bytes = await serializeShowFileBundle(bundle)
  const reopened = await parseShowFileBundle(bytes, { preserveAuthoringPhysicalRanges: true })
  expect(reopened.show).toEqual({
    ...show,
    cells: show.cells.map(cell => ({ ...cell, restartOnEntry: false })),
    transitions: [{ id: 'transition-s1', afterSceneId: 's1', durationMs: 0, kind: 'cut', easing: { curve: 'linear' } }],
  })
  expect(openShowDocument(reopened.show, [], {}, { authoringValidation: true }).ok).toBe(true)
  const ordinary = await parseShowFileBundle(bytes)
  expect(ordinary.show.routingLayouts[0].zones[0].ranges).toEqual([{ start: 0, end: 11 }])
})

it.each([0.5, Infinity, NaN])('refuses malformed physical endpoints in the internal file importer: %s', async endpoint => {
  const show = openGrammarFixture().document.show
  show.routingLayouts = [{ id: 'l1', name: 'Physical', zones: [{ zoneId: 'z1', ranges: [{ start: endpoint, end: 7 }] }] }]
  const { bundle } = buildShowFileBundle(show, { patterns: [], maps: [] }, { appVersion: 'D1' })
  const bytes = await serializeShowFileBundle(bundle)
  await expect(parseShowFileBundle(bytes, { preserveAuthoringPhysicalRanges: true })).rejects.toThrow('physical')
})
