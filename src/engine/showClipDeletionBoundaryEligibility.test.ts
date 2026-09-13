import { describe, expect, it } from 'vitest'
import type { ShowRecord } from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import {
  deleteShowClipWithLayerTransitions,
} from './showLayerTransitionAuthoring'
import { applyShowCommand } from './showCommands/registry'
import type { ShowTimelineClipOwner } from './showTimelineClipAuthoring'
import { createDefaultShow, projectShowTimeline } from './showModel'
import { deleteShowClipInShow } from './showClipDeletion'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import {
  projectShowClipDeletionBoundaryEligibility,
  type ShowClipDeletionBoundaryEligibilityResult,
} from './showClipDeletionBoundaryEligibility'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { LIBRARIES } from '../pixelblaze/libs'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import {
  boundaryClipDeletionFixture,
  boundaryDeletionPlacement as placement,
  boundaryStarterAOwner as starterA,
  boundaryStarterBOwner as starterB,
} from '../test/showBoundaryClipDeletionFixture'

const commandContext = {
  source: (ref: { kind: 'stock' | 'user'; id: string }) => ref.kind === 'stock'
    ? DEMOS[resolveStockPatternId(ref.id)]
    : undefined,
  libraries: LIBRARIES,
}

function starterFixture(): ShowRecord {
  return boundaryClipDeletionFixture('eligibility')
}

function multiSceneCallerFixture(): ShowRecord {
  const show = createDefaultShow('logical-caller', 'Logical caller', 1)
  show.composition = {
    version: 1,
    patternInstances: [
      {
        id: 'instance-logical', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Logical',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      {
        id: 'instance-survivor', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Survivor',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
    ],
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [placement('logical-root', 29_000, 1_000, 'instance-logical')],
          overlays: [{
            id: 'survivor-layer-scene-1', name: 'Survivor',
            placements: [{ ...placement('survivor', 0, 1_000, 'instance-survivor'), opacity: 1 }],
          }],
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            ...placement('logical-root--span-scene-2', 0, 1_000, 'instance-logical'),
            logicalClipId: 'logical-root',
          }],
          overlays: [{ id: 'survivor-layer-scene-2', name: 'Survivor', placements: [] }],
        }],
      },
    ],
  }
  return show
}

function plannedDeletion(show: ShowRecord, owner: ShowTimelineClipOwner) {
  const original = show.composition!
  const planned = deleteShowClipWithLayerTransitions(show, original, owner)
  expect(planned).not.toBe(original)
  const eligibility = projectShowClipDeletionBoundaryEligibility(
    show,
    original,
    owner.placementId,
    planned,
  )
  expect(eligibility.status).toBe('ready')
  if (eligibility.status !== 'ready') throw new Error(eligibility.reason)
  return { original, planned, eligibility }
}

function decisionSummary(result: Extract<ShowClipDeletionBoundaryEligibilityResult, { status: 'ready' }>) {
  return result.boundaries.map((boundary) => ({
    transitionId: boundary.transitionId,
    touchedEdges: boundary.touchedEdges,
    decision: boundary.decision,
    dependencies: boundary.dependencies,
  }))
}

function addPairedOtherLayer(show: ShowRecord) {
  show.composition!.patternInstances.push({
    id: 'instance-overlay-incoming',
    pattern: { kind: 'stock', id: 'Rings' },
    patternName: 'Overlay incoming',
    time: { timeScale: 1, timeOffsetMs: 0 },
  })
  show.composition!.scenes[1].zones[0].overlays[0].placements.push({
    ...placement('overlay-incoming', 0, 30_000, 'instance-overlay-incoming'),
    opacity: 1,
  })
}

function addOneSidedIncomingOtherZone(show: ShowRecord) {
  show.zones.push({ id: 'zone-2', name: 'Other', nominalPixelCount: 30 })
  show.composition!.patternInstances.push({
    id: 'instance-other-incoming',
    pattern: { kind: 'stock', id: 'Rings' },
    patternName: 'Other incoming',
    time: { timeScale: 1, timeOffsetMs: 0 },
  })
  show.composition!.scenes[0].zones.push({ zoneId: 'zone-2', main: [], overlays: [] })
  show.composition!.scenes[1].zones.push({
    zoneId: 'zone-2',
    main: [placement('other-incoming', 0, 30_000, 'instance-other-incoming')],
    overlays: [],
  })
}

function applyTestOnlyCompoundDeletion(
  show: ShowRecord,
  owner: ShowTimelineClipOwner,
) {
  const { eligibility } = plannedDeletion(show, owner)
  const outcome = deleteShowClipInShow(show, show.composition!, owner)
  return outcome.status === 'applied'
    ? { ...outcome, eligibility }
    : outcome
}

describe('Show Clip deletion boundary eligibility truth table (#1023)', () => {
  it('accepts the exact canonical logical ID and manual physical-segment ID contracts', () => {
    const show = multiSceneCallerFixture()
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    const canonicalClip = projectShowUnifiedTimeline(show, show.composition!).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((clip) => clip.id === 'logical-root')!
    expect(canonicalClip).toMatchObject({
      id: 'logical-root',
      segmentIds: ['logical-root', 'logical-root--span-scene-2'],
    })
    const manualOwner: ShowTimelineClipOwner = {
      kind: 'main',
      sceneId: 'scene-2',
      zoneId: 'zone-1',
      placementId: 'logical-root--span-scene-2',
    }
    const canonicalPlanned = deleteShowClipWithLayerTransitions(show, show.composition!, {
      kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: canonicalClip.id,
    })
    const manualPlanned = deleteShowClipWithLayerTransitions(show, show.composition!, manualOwner)
    expect(canonicalPlanned).toEqual(manualPlanned)

    const canonicalEligibility = projectShowClipDeletionBoundaryEligibility(
      show,
      show.composition!,
      canonicalClip.id,
      canonicalPlanned,
    )
    const manualEligibility = projectShowClipDeletionBoundaryEligibility(
      show,
      show.composition!,
      manualOwner.placementId,
      manualPlanned,
    )
    expect(canonicalEligibility).toEqual(manualEligibility)
    expect(canonicalEligibility).toMatchObject({
      status: 'ready',
      boundaries: [{
        transitionId: 'transition-scene-1',
        touchedEdges: ['outgoing', 'incoming'],
        decision: 'repair',
        dependencies: [],
      }],
    })

    const canonical = applyShowCommand(show, 'remove_clip', { clip_id: canonicalClip.id })
    const manual = deleteShowClipInShow(show, show.composition!, manualOwner)
    expect(canonical.ok).toBe(true)
    expect(manual.status).toBe('applied')
    if (!canonical.ok || manual.status !== 'applied') throw new Error('Deletion unexpectedly refused')
    expect({ ...canonical.record, updatedAt: show.updatedAt })
      .toEqual({ ...manual.record, updatedAt: show.updatedAt })

    const detachedLogicalId = multiSceneCallerFixture()
    const root = detachedLogicalId.composition!.scenes[0].zones[0].main[0]
    root.id = 'physical-root'
    root.logicalClipId = 'logical-without-physical-root'
    const continuation = detachedLogicalId.composition!.scenes[1].zones[0].main[0]
    continuation.id = 'physical-continuation'
    continuation.logicalClipId = 'logical-without-physical-root'
    expect(validateShowComposition(detachedLogicalId, detachedLogicalId.composition!))
      .toEqual([expect.objectContaining({ code: 'invalid-logical-clip' })])
  })

  it('retains an outgoing-touched boundary when the other starter remains as incoming content', () => {
    const show = starterFixture()
    const { eligibility } = plannedDeletion(show, starterA)

    expect(decisionSummary(eligibility)).toEqual([{
      transitionId: 'transition-scene-1',
      touchedEdges: ['outgoing'],
      decision: 'retain',
      dependencies: ['incoming-content'],
    }])
  })

  it('repairs an incoming-touched boundary when only outgoing content survives', () => {
    const show = starterFixture()
    const { eligibility } = plannedDeletion(show, starterB)

    expect(decisionSummary(eligibility)).toEqual([{
      transitionId: 'transition-scene-1',
      touchedEdges: ['incoming'],
      decision: 'repair',
      dependencies: [],
    }])
  })

  it('retains a boundary with a surviving junction on another Layer', () => {
    const show = starterFixture()
    addPairedOtherLayer(show)
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    const { eligibility } = plannedDeletion(show, starterB)

    expect(decisionSummary(eligibility)).toEqual([{
      transitionId: 'transition-scene-1',
      touchedEdges: ['incoming'],
      decision: 'retain',
      dependencies: ['surviving-junction', 'incoming-content'],
    }])
    const outcome = deleteShowClipInShow(show, show.composition!, starterB)
    expect(outcome.status).toBe('applied')
    if (outcome.status === 'applied') {
      expect(outcome.record.transitions[0]).toEqual(show.transitions[0])
      expect(outcome.retainedBoundaries).toEqual(eligibility.boundaries)
    }
  })

  it('retains a boundary with one-sided incoming content in another Zone', () => {
    const show = starterFixture()
    addOneSidedIncomingOtherZone(show)
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    const { eligibility } = plannedDeletion(show, starterB)

    expect(decisionSummary(eligibility)).toEqual([{
      transitionId: 'transition-scene-1',
      touchedEdges: ['incoming'],
      decision: 'retain',
      dependencies: ['incoming-content'],
    }])
    const outcome = deleteShowClipInShow(show, show.composition!, starterB)
    expect(outcome.status).toBe('applied')
    if (outcome.status === 'applied') expect(outcome.record.transitions[0]).toEqual(show.transitions[0])
  })

  it('retains an explicit boundary property carrier after its endpoint Clip is deleted', () => {
    const show = starterFixture()
    show.transitions[0].propertyTransitions = {
      timeScale: { fromByCellId: { 'starter-a': 0.5 } },
    }
    const { eligibility } = plannedDeletion(show, starterB)

    expect(decisionSummary(eligibility)).toEqual([{
      transitionId: 'transition-scene-1',
      touchedEdges: ['incoming'],
      decision: 'retain',
      dependencies: ['property-transitions'],
    }])
    const outcome = deleteShowClipInShow(show, show.composition!, starterB)
    expect(outcome.status).toBe('applied')
    if (outcome.status === 'applied') expect(outcome.record.transitions[0]).toEqual(show.transitions[0])
  })

  it('does not normalize an untouched boundary when deleting a Clip away from its edges', () => {
    const show = starterFixture()
    show.composition!.patternInstances.push({
      id: 'instance-middle', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Middle',
      time: { timeScale: 1, timeOffsetMs: 0 },
    })
    show.composition!.scenes[0].zones[0].overlays.push({
      id: 'middle-layer-scene-1', name: 'Middle',
      placements: [{ ...placement('middle', 1_000, 1_000, 'instance-middle'), opacity: 1 }],
    })
    show.composition!.scenes[1].zones[0].overlays.push({
      id: 'middle-layer-scene-2', name: 'Middle', placements: [],
    })
    const owner: ShowTimelineClipOwner = {
      kind: 'overlay', sceneId: 'scene-1', zoneId: 'zone-1',
      layerId: 'middle-layer-scene-1', placementId: 'middle',
    }

    const { eligibility } = plannedDeletion(show, owner)

    expect(eligibility.boundaries).toEqual([])
  })

  it('finds every visual boundary touched by original multi-Scene logical segments', () => {
    const show = starterFixture()
    show.scenes.push({ id: 'scene-3', name: 'Scene 3', durationMs: 30_000 })
    show.transitions.push({
      id: 'transition-scene-2', afterSceneId: 'scene-2', kind: 'wipe', durationMs: 1_111,
      easing: { curve: 'linear' }, direction: 0, feather: 0,
    })
    show.composition!.durationMs = 93_111
    show.composition!.scenes.push({
      sceneId: 'scene-3',
      zones: [{
        zoneId: 'zone-1', main: [],
        overlays: ['a', 'b', 'c', 'd', 'logical'].map((suffix) => ({
          id: `layer-${suffix}-scene-3`, name: suffix, placements: [],
        })),
      }],
    })
    show.composition!.patternInstances.push({
      id: 'instance-logical', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Logical',
      time: { timeScale: 1, timeOffsetMs: 0 },
    })
    show.composition!.scenes[0].zones[0].overlays.push({
      id: 'layer-logical-scene-1', name: 'Logical',
      placements: [{ ...placement('logical', 29_000, 1_000, 'instance-logical'), opacity: 1 }],
    })
    show.composition!.scenes[1].zones[0].overlays.push({
      id: 'layer-logical-scene-2', name: 'Logical',
      placements: [{
        ...placement('logical--span-scene-2', 0, 30_000, 'instance-logical'),
        logicalClipId: 'logical',
        opacity: 1,
      }],
    })
    show.composition!.scenes[2].zones[0].overlays[4].placements.push({
      ...placement('logical--span-scene-3', 0, 1_000, 'instance-logical'),
      logicalClipId: 'logical',
      opacity: 1,
    })
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    const owner: ShowTimelineClipOwner = {
      kind: 'overlay', sceneId: 'scene-1', zoneId: 'zone-1',
      layerId: 'layer-logical-scene-1', placementId: 'logical',
    }

    const { eligibility } = plannedDeletion(show, owner)

    expect(decisionSummary(eligibility)).toEqual([
      {
        transitionId: 'transition-scene-1', touchedEdges: ['outgoing', 'incoming'],
        decision: 'retain', dependencies: ['surviving-junction', 'incoming-content'],
      },
      {
        transitionId: 'transition-scene-2', touchedEdges: ['outgoing', 'incoming'],
        decision: 'repair', dependencies: [],
      },
    ])
  })

  it('lets both starter deletion orders reach the same repaired common case', () => {
    const outgoingFirstStep = applyTestOnlyCompoundDeletion(starterFixture(), starterA)
    expect(outgoingFirstStep.status).toBe('applied')
    if (outgoingFirstStep.status !== 'applied') throw new Error(outgoingFirstStep.reason)
    expect(decisionSummary(outgoingFirstStep.eligibility)).toEqual([expect.objectContaining({
      touchedEdges: ['outgoing'], decision: 'retain', dependencies: ['incoming-content'],
    })])
    const outgoingFirstDone = applyTestOnlyCompoundDeletion(outgoingFirstStep.record, starterB)
    expect(outgoingFirstDone.status).toBe('applied')
    if (outgoingFirstDone.status !== 'applied') throw new Error(outgoingFirstDone.reason)
    expect(decisionSummary(outgoingFirstDone.eligibility)).toEqual([expect.objectContaining({
      touchedEdges: ['incoming'], decision: 'repair', dependencies: [],
    })])

    const incomingFirstStep = applyTestOnlyCompoundDeletion(starterFixture(), starterB)
    expect(incomingFirstStep.status).toBe('applied')
    if (incomingFirstStep.status !== 'applied') throw new Error(incomingFirstStep.reason)
    expect(decisionSummary(incomingFirstStep.eligibility)).toEqual([expect.objectContaining({
      touchedEdges: ['incoming'], decision: 'repair', dependencies: [],
    })])
    const incomingFirstDone = applyTestOnlyCompoundDeletion(incomingFirstStep.record, starterA)
    expect(incomingFirstDone.status).toBe('applied')
    if (incomingFirstDone.status !== 'applied') throw new Error(incomingFirstDone.reason)
    expect(incomingFirstDone.eligibility.boundaries).toEqual([])

    const outgoingFirst = outgoingFirstDone.record
    const incomingFirst = incomingFirstDone.record

    expect(outgoingFirst).toEqual(incomingFirst)
    expect(outgoingFirst.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 32_000])
    expect(outgoingFirst.transitions[0]).toMatchObject({
      id: 'transition-scene-1', kind: 'cut', durationMs: 0,
    })
    expect(projectShowTimeline(outgoingFirst).durationMs).toBe(62_000)
    expect(validateShowComposition(outgoingFirst, outgoingFirst.composition!)).toEqual([])
  })

  it.each([
    ['outgoing then incoming', ['starter-a', 'starter-b']],
    ['incoming then outgoing', ['starter-b', 'starter-a']],
  ] as const)('makes the canonical %s sequence authorable at the exact former transition span', (_label, order) => {
    const original = starterFixture()
    let record = original
    const deletionReceipts: Array<Record<string, unknown> | undefined> = []
    for (const clipId of order) {
      const outcome = applyShowCommand(record, 'remove_clip', { clip_id: clipId })
      expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues))
      deletionReceipts.push(outcome.changes[0].details)
      record = outcome.record
    }

    expect(record.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 32_000])
    expect(record.transitions[0]).toMatchObject({ kind: 'cut', durationMs: 0 })
    expect(record.composition?.durationMs).toBe(62_000)
    expect(record.composition?.markers).toEqual(original.composition?.markers)
    expect(projectShowTimeline(record).durationMs).toBe(62_000)
    expect(deletionReceipts.some((receipt) => (
      (receipt?.repairedTransitionIds as string[] | undefined)?.includes('transition-scene-1')
    ))).toBe(true)
    expect(validateShowComposition(record, record.composition!)).toEqual([])

    const created = applyShowCommand(record, 'create_clips', {
      schema_version: 1,
      clips: [0, 1, 2, 3].map((layer) => ({
        zone_id: 'zone-1',
        layer,
        start_ms: 30_000,
        duration_ms: 30_000,
        pattern: { kind: 'stock', id: 'CometLoom' },
      })),
    }, commandContext)
    expect(created.ok, JSON.stringify(created)).toBe(true)
    if (!created.ok) throw new Error(JSON.stringify(created.issues))
    const createdIds = (created.changes[0].details?.results as Array<{ clipId: string }>).map((item) => item.clipId)
    const createdClips = projectShowUnifiedTimeline(created.record, created.record.composition!).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .filter((clip) => createdIds.includes(clip.id))
    expect(createdClips).toHaveLength(4)
    expect(createdClips.map((clip) => [clip.layerIndex, clip.startMs, clip.endMs]))
      .toEqual([[0, 30_000, 60_000], [1, 30_000, 60_000], [2, 30_000, 60_000], [3, 30_000, 60_000]])

    const beforeCollision = structuredClone(created.record)
    const collision = applyShowCommand(created.record, 'create_clips', {
      schema_version: 1,
      clips: [
        { zone_id: 'zone-1', layer: 'main', start_ms: 30_000, duration_ms: 30_000, pattern: { kind: 'stock', id: 'CometLoom' } },
        { zone_id: 'zone-1', layer: 0, start_ms: 30_000, duration_ms: 30_000, pattern: { kind: 'stock', id: 'CometLoom' } },
      ],
    }, commandContext)
    expect(collision).toMatchObject({ ok: false, issues: [{ code: 'occupied' }] })
    expect(created.record).toEqual(beforeCollision)

    const removed = applyShowCommand(created.record, 'remove_clip', { clip_id: createdIds[0] })
    expect(removed.ok).toBe(true)
    if (!removed.ok) throw new Error(JSON.stringify(removed.issues))
    const reinserted = applyShowCommand(removed.record, 'create_clips', {
      schema_version: 1,
      clips: [{
        zone_id: 'zone-1', layer: 0, start_ms: 30_000, duration_ms: 30_000,
        pattern: { kind: 'stock', id: 'CometLoom' },
      }],
    }, commandContext)
    expect(reinserted.ok, JSON.stringify(reinserted)).toBe(true)
    if (reinserted.ok) {
      expect(reinserted.record.transitions[0]).toMatchObject({ kind: 'cut', durationMs: 0 })
      expect(reinserted.record.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 32_000])
    }
  })

  it('survives saved JSON and exported .pxlshow reopen through the real importer', async () => {
    const original = starterFixture()
    const first = applyShowCommand(original, 'remove_clip', { clip_id: 'starter-b' })
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(JSON.stringify(first.issues))
    const second = applyShowCommand(first.record, 'remove_clip', { clip_id: 'starter-a' })
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error(JSON.stringify(second.issues))
    const expected = second.record

    const saved = JSON.parse(JSON.stringify(expected)) as ShowRecord
    expect(saved).toEqual(expected)
    expect(validateShowComposition(saved, saved.composition!)).toEqual([])

    const exported = buildShowFileBundle(expected, { patterns: [], maps: [] }, {
      appVersion: '1.0.0',
      exportedAt: '2026-09-13T12:00:00.000Z',
    })
    expect(exported.filename).toMatch(/\.pxlshow$/)
    const reopened = await parseShowFileBundle(
      await serializeShowFileBundle(exported.bundle),
      { preserveAuthoringPhysicalRanges: true },
    )
    expect(reopened.show).toEqual(expected)
    expect(reopened.show.transitions[0]).toMatchObject({ kind: 'cut', durationMs: 0 })
    expect(reopened.show.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 32_000])
    expect(reopened.show.composition?.markers).toEqual(original.composition?.markers)
    expect(validateShowComposition(reopened.show, reopened.show.composition!)).toEqual([])
  })

  it('keeps an intact visual transition occupied and enables duplicate-after only after repair', () => {
    const outgoingDeleted = applyShowCommand(starterFixture(), 'remove_clip', { clip_id: 'starter-a' })
    expect(outgoingDeleted.ok).toBe(true)
    if (!outgoingDeleted.ok) throw new Error(JSON.stringify(outgoingDeleted.issues))
    expect(outgoingDeleted.record.transitions[0]).toMatchObject({ kind: 'crossfade', durationMs: 2_000 })
    expect(applyShowCommand(outgoingDeleted.record, 'create_clips', {
      schema_version: 1,
      clips: [{
        zone_id: 'zone-1', layer: 0, start_ms: 30_000, duration_ms: 30_000,
        pattern: { kind: 'stock', id: 'CometLoom' },
      }],
    }, commandContext)).toMatchObject({ ok: false, issues: [{ code: 'occupied' }] })

    const repaired = applyShowCommand(outgoingDeleted.record, 'remove_clip', { clip_id: 'starter-b' })
    expect(repaired.ok).toBe(true)
    if (!repaired.ok) throw new Error(JSON.stringify(repaired.issues))
    const duplicate = applyShowCommand(repaired.record, 'duplicate_clip', { clip_id: 'overlay-a' })
    expect(duplicate.ok, JSON.stringify(duplicate)).toBe(true)
    if (!duplicate.ok) throw new Error(JSON.stringify(duplicate.issues))
    const copy = projectShowUnifiedTimeline(duplicate.record, duplicate.record.composition!).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((clip) => clip.id === duplicate.changes[0].targetId)
    expect(copy).toMatchObject({ startMs: 30_000, endMs: 60_000, layerIndex: 0 })
  })

  it.each([
    ['cross-boundary-shared-instance', (show: ShowRecord) => {
      show.composition!.patternInstances.push({
        id: 'instance-shared', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Shared',
        time: { timeScale: 1, timeOffsetMs: 0 },
      })
      show.composition!.scenes[0].zones[0].main[0].instanceId = 'instance-shared'
      show.composition!.scenes[1].zones[0].overlays[0].placements.push({
        ...placement('shared-later', 1_000, 1_000, 'instance-shared'), opacity: 1,
      })
    }],
    ['output-feedback-state', (show: ShowRecord) => {
      show.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.8 }]
    }],
  ] as const)('leaves the complete original Show untouched when repair later refuses %s', (reason, arrange) => {
    const show = starterFixture()
    arrange(show)
    const before = structuredClone(show)

    const outcome = applyTestOnlyCompoundDeletion(show, starterB)

    expect(outcome).toMatchObject({ status: 'refused', reason })
    expect(outcome.record).toBe(show)
    expect(show).toEqual(before)
  })
})
