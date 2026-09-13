import { expect, it } from 'vitest'
import { trackedCommandFixture } from '../../test/showCommandFixture'
import { boundaryClipDeletionFixture, boundaryDeletionPlacement } from '../../test/showBoundaryClipDeletionFixture'
import { deleteShowMainPlacement, validateShowComposition } from '../showCompositionModel'
import type { ShowRecord } from '../personalContentRecords'

it('removes newly orphaned instance dependencies while preserving the complete surviving composition', () => {
  const show = trackedCommandFixture()
  const composition = show.composition!
  composition.patternInstances.push({ ...structuredClone(composition.patternInstances[1]), id: 'unrelated-orphan' })
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  expected.scenes[0].zones[0].main.splice(1, 1)
  expected.patternInstances.splice(1, 1)
  expected.scenes[0].propertyTracks = [expected.scenes[0].propertyTracks![1]]
  const result = deleteShowMainPlacement(composition, { sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' })
  expect(result).toEqual(expected)
  expect(composition).toEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
})

it('pairs connected deletion with ordinary deletion without whole-composition normalization', async () => {
  const { deleteShowClipInShow } = await import('../showClipDeletion')
  const show = trackedCommandFixture()
  const composition = show.composition!
  composition.markers = [{ id: 'late', timeMs: 2000 }, { id: 'early', timeMs: 1000 }]
  const owner = { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }
  const expected = deleteShowMainPlacement(composition, owner)
  const result = deleteShowClipInShow(show, composition, owner)
  expect(result.status).toBe('applied')
  if (result.status === 'applied') expect(result.record.composition).toEqual(expected)
})

it.each(['clip-a', 'clip-b', 'clip-ov'])('preserves unrelated Groups, orphan data and surviving shared users when removing %s', async clipId => {
  const { showRemoveClipFixture } = await import('../../test/showRemoveClipFixture')
  const { applyShowCommand } = await import('./registry')
  const show = showRemoveClipFixture()
  const before = structuredClone(show)
  const expected = structuredClone(show.composition!)
  if (clipId === 'clip-ov') {
    expected.scenes[0].zones[0].overlays[0].placements = []
    expected.patternInstances.splice(2, 1)
  } else {
    expected.scenes[0].zones[0].main.splice(clipId === 'clip-a' ? 0 : 1, 1)
    expected.transitions = []
    if (clipId === 'clip-b') {
      expected.patternInstances.splice(1, 1)
      expected.scenes[0].propertyTracks = [expected.scenes[0].propertyTracks![1]]
    }
  }
  const outcome = applyShowCommand(show, 'remove_clip', { clip_id: clipId })
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  if (!outcome.ok) return
  expect(outcome.record.composition).toEqual(expected)
  expect(show).toEqual(before)
  expect(validateShowComposition(outcome.record, outcome.record.composition!)).toEqual([])
})

it('removes every Scene segment and cross-Scene instance tracks without moving neighbors', async () => {
  const { applyShowCommand } = await import('./registry')
  const show = trackedCommandFixture()
  show.transitions = []
  const composition = show.composition!
  const root = composition.scenes[0].zones[0].main[1]
  root.durationMs = 18_000
  composition.scenes[0].zones[0].main.pop()
  composition.scenes[1].zones[0].main = [{ ...structuredClone(root), id: 'clip-b--span-scene-2', logicalClipId: 'clip-b', startMs: 0, durationMs: 2000 }]
  composition.scenes[1].propertyTracks = [{ id: 'second-track', target: { kind: 'instance-time-scale', instanceId: 'instance-b' }, keyframes: [{ id: 'second-key', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'second-end', timeMs: 1000, value: 0.5, easing: { curve: 'linear' } }] }]
  const before = structuredClone(show)
  expect(validateShowComposition(show, composition)).toEqual([])
  const expected = structuredClone(composition)
  expected.scenes[0].zones[0].main.pop()
  expected.scenes[1].zones[0].main = []
  expected.patternInstances.splice(1, 1)
  expected.scenes[0].propertyTracks = [expected.scenes[0].propertyTracks![1]]
  delete expected.scenes[1].propertyTracks
  const result = applyShowCommand(show, 'remove_clip', { clip_id: 'clip-b' })
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.record.composition).toEqual(expected)
    expect(validateShowComposition(result.record, result.record.composition!)).toEqual([])
    expect(applyShowCommand(result.record, 'move_marker', { marker_id: 'marker-1', at_ms: 9000 }).ok).toBe(true)
  }
  expect(show).toEqual(before)
})

it('refuses Group children, missing targets, malformed owners and the last logical Clip immutably', async () => {
  const { applyShowCommand } = await import('./registry')
  const { showRemoveClipFixture } = await import('../../test/showRemoveClipFixture')
  const { singleClipCommandFixture } = await import('../../test/showCommandFixture')
  for (const [show, clipId, code] of [
    [showRemoveClipFixture(), 'group-use:group-main', 'group'],
    [showRemoveClipFixture(), 'absent', 'unknown-clip'],
    [singleClipCommandFixture(), 'clip-a', 'last-clip'],
  ] as const) {
    const before = structuredClone(show)
    expect(applyShowCommand(show, 'remove_clip', { clip_id: clipId })).toMatchObject({ ok: false, issues: [{ code }] })
    expect(show).toEqual(before)
  }
  const malformed = trackedCommandFixture()
  malformed.composition!.scenes[0].zones[0].main[0].instanceId = 'absent'
  const before = structuredClone(malformed)
  expect(applyShowCommand(malformed, 'remove_clip', { clip_id: 'clip-b' })).toMatchObject({ ok: false, issues: [{ code: 'delete-refused' }] })
  expect(malformed).toEqual(before)
})

it.each([
  {
    reason: 'cross-boundary-shared-instance',
    relatedId: 'instance-starter-a',
    message: 'Clip starter-b was not removed because the time-preserving boundary repair cannot move Pattern-instance state shared across that boundary. Boundary Transition transition-scene-1. Related IDs: instance-starter-a.',
    remedy: 'Keep the Clip, or separate the listed Pattern instance across the Scene boundary before retrying.',
    arrange(show: ShowRecord) {
      show.composition!.scenes[1].zones[0].overlays[0].placements.push({
        ...boundaryDeletionPlacement('shared-later', 1_000, 1_000, 'instance-starter-a'),
        opacity: 1,
      })
    },
  },
  {
    reason: 'output-feedback-state',
    relatedId: 'trails',
    message: 'Clip starter-b was not removed because the time-preserving boundary repair cannot preserve output-feedback history across that boundary. Boundary Transition transition-scene-1. Related IDs: trails.',
    remedy: 'Keep the Clip, or remove the listed output-feedback state before retrying.',
    arrange(show: ShowRecord) {
      show.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.8 }]
    },
  },
] as const)('reports precise $reason dependency refusal without adopting any command step', async ({ reason, relatedId, message, remedy, arrange }) => {
  const { applyShowCommand, runShowCommandTransaction } = await import('./registry')
  const show = boundaryClipDeletionFixture(`command-refusal-${reason}`)
  arrange(show)
  const before = structuredClone(show)

  const outcome = applyShowCommand(show, 'remove_clip', { clip_id: 'starter-b' })

  expect(outcome).toEqual({
    ok: false,
    issues: [{
      code: reason,
      path: '$.clip_id',
      message,
      remedy,
    }],
  })
  if (outcome.ok) throw new Error('Dependency deletion unexpectedly succeeded')
  expect(outcome.issues[0].message).toContain(relatedId)
  expect(outcome.issues[0].message).not.toContain('keeps at least one clip')
  expect(show).toEqual(before)

  const transaction = runShowCommandTransaction(show, [
    { name: 'rename_show', input: { name: 'Private candidate only' } },
    { name: 'remove_clip', input: { clip_id: 'starter-b' } },
  ])
  expect(transaction).toEqual({ ok: false, step: 1, issues: outcome.issues })
  expect(show).toEqual(before)
})

it.each(['clip-a', 'clip-b'])('invalidates the cast proof only when %s removes its instance', async clipId => {
  const { applyShowCommand } = await import('./registry')
  const show = trackedCommandFixture()
  show.composition!.executionModel = 'deterministic-loop'
  const outcome = applyShowCommand(show, 'remove_clip', { clip_id: clipId })
  expect(outcome.ok).toBe(true)
  if (!outcome.ok) throw new Error('Removal refused')
  const { deleteShowClipInShow } = await import('../showClipDeletion')
  const manual = deleteShowClipInShow(show, show.composition!, {
    kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: clipId,
  })
  expect(manual.status).toBe('applied')
  if (manual.status !== 'applied') throw new Error(manual.reason)
  expect(manual.record.composition).toEqual(outcome.record.composition)
  expect(manual.record.composition?.executionModel).toBe(clipId === 'clip-a' ? 'deterministic-loop' : undefined)
})
