import { afterEach, beforeEach, expect, it } from 'vitest'
import { showV2LayoutEditorFixture } from '../test/showV2LayoutEditorFixture'
import { exportedScalar, nativeShowV2Artifacts, openIntegratedShowV2Pilot } from '../test/showV2IntegratedSequenceHarness'
import { resetPersonalContentProvider } from '../engine/personalContentProvider'
import { materializeShowGroupsV2 } from '../engine/showGroupsV2'
import { planShowV2LayoutEdit } from '../engine/showV2LayoutEditorModel'
import { createShowV2LayerAtTopIntent, reorderShowV2LayerIntent } from '../engine/showV2LayerEditorModel'
import { planShowV2GroupOccurrenceEdit } from '../engine/showV2GroupOccurrenceEditorModel'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotGroupOccurrenceEdit, admitShowV2PilotLayerEdit,
  admitShowV2PilotLayoutOccurrenceEdit, admitShowV2PilotSetShowEnd,
} from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

/** Repeated Layout definition, a held Group spanning the switch and a dormant Marker. */
function structureFixture() {
  const { record, dependencies } = showV2LayoutEditorFixture()
  record.composition.markers.push({ id: 'dormant-guide', name: 'Beyond the end', timeMs: 90000 })
  return { record, dependencies }
}

function occurrences(record: ShowRecordV2) {
  return record.composition.layoutOccurrences.map(item => [item.id, item.startMs, item.durationMs] as const)
}

it('runs Make Layout Unique, switch move and removal, Show End edits and Undo as one admitted sequence', { timeout: 60_000 }, async () => {
  const { record, dependencies } = structureFixture()
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  expect(pilot.context().capture.prepared.status).toBe('ready')
  const showEndMs = record.composition.showEndMs
  const firstId = record.composition.layoutOccurrences[0].id
  const sharedLayoutId = record.composition.layoutOccurrences[0].layoutId
  // One definition is shared by both occurrences before Make Unique.
  expect(new Set(record.composition.layoutOccurrences.map(item => item.layoutId)).size).toBe(1)
  expect(occurrences(record)).toEqual([[firstId, 0, 5000], ['later-layout', 5000, showEndMs - 5000]])
  const groupBefore = structuredClone(record.composition.groupOccurrences)
  const zoneLayoutsBefore = structuredClone(record.zoneLayouts)
  let allocated = 0
  const allocate = () => `structure-${++allocated}`

  // 1. Make Layout Unique clones only that definition identity, not the Zones.
  const unique = planShowV2LayoutEdit(pilot.current(), { kind: 'make-unique', occurrenceId: 'later-layout', name: 'Later only' }, allocate)
  if (unique.status !== 'ready') throw Error(unique.message)
  expect((await admitShowV2PilotLayoutOccurrenceEdit({ ...pilot.context(), intent: unique.intent })).status).toBe('applied')
  const clonedId = pilot.current().composition.layoutOccurrences[1].layoutId
  expect(clonedId).not.toBe(sharedLayoutId)
  expect(pilot.current().composition.layoutOccurrences[0].layoutId).toBe(sharedLayoutId)
  expect(pilot.current().zones).toEqual(record.zones)
  expect(pilot.current().zoneLayouts.map(item => item.id)).toEqual([...zoneLayoutsBefore.map(item => item.id), clonedId])

  // 2. Moving the switch changes only the boundary and neighbouring durations.
  const move = planShowV2LayoutEdit(pilot.current(), { kind: 'move', occurrenceId: 'later-layout', startMs: 8000 }, allocate)
  if (move.status !== 'ready') throw Error(move.message)
  expect((await admitShowV2PilotLayoutOccurrenceEdit({ ...pilot.context(), intent: move.intent })).status).toBe('applied')
  expect(occurrences(pilot.current())).toEqual([[firstId, 0, 8000], ['later-layout', 8000, showEndMs - 8000]])
  expect(pilot.current().composition.showEndMs).toBe(showEndMs)
  expect(pilot.current().composition.clips).toEqual(record.composition.clips)
  expect(pilot.current().composition.markers).toEqual(record.composition.markers)
  // The held Group keeps its choreography; only its start association may rebind.
  expect(pilot.current().composition.groupOccurrences.map(({ layoutOccurrenceId: _id, ...rest }) => rest))
    .toEqual(groupBefore.map(({ layoutOccurrenceId: _id, ...rest }) => rest))

  // 3. Removing a plain occurrence extends its predecessor and keeps coverage.
  const remove = planShowV2LayoutEdit(pilot.current(), { kind: 'remove', occurrenceId: 'later-layout' }, allocate)
  if (remove.status !== 'ready') throw Error(remove.message)
  expect((await admitShowV2PilotLayoutOccurrenceEdit({ ...pilot.context(), intent: remove.intent })).status).toBe('applied')
  expect(occurrences(pilot.current())).toEqual([[firstId, 0, showEndMs]])

  // 4. Shortening across authored content refuses atomically.
  const invalid = await admitShowV2PilotSetShowEnd({ ...pilot.context(), intent: { kind: 'set-show-end', showEndMs: 1000 } })
  expect(invalid).toMatchObject({ status: 'refused', source: 'owner' })
  const writesBeforeEnd = pilot.writes()

  // 5. Extending stretches final coverage and leaves authored content unchanged.
  const extendedEnd = showEndMs + 4000
  const beforeExtend = structuredClone(pilot.current())
  expect((await admitShowV2PilotSetShowEnd({ ...pilot.context(), intent: { kind: 'set-show-end', showEndMs: extendedEnd } })).status).toBe('applied')
  expect(occurrences(pilot.current())).toEqual([[firstId, 0, extendedEnd]])
  expect(pilot.current().composition.clips).toEqual(beforeExtend.composition.clips)
  expect(pilot.current().composition.groupOccurrences).toEqual(beforeExtend.composition.groupOccurrences)
  // The dormant guide beyond Show End is untouched in both directions.
  expect(pilot.current().composition.markers.find(marker => marker.id === 'dormant-guide')!.timeMs).toBe(90000)

  // 6. Undo restores the complete prior record, including coverage.
  expect(await pilot.undo()).toBe(true)
  expect(pilot.current().composition).toEqual(beforeExtend.composition)
  expect(pilot.writes()).toBe(writesBeforeEnd + 2)

  // 7. The delivered artifact keeps one continuous shared runtime across the edits.
  const native = await nativeShowV2Artifacts(pilot.saved(), dependencies)
  expect(native.importedShow.composition).toEqual(pilot.saved().composition)
  const authored = native.members.filter(member => !member.id.startsWith('__pxlblz_'))
  expect(authored).toHaveLength(1)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = native.replay(fidelity)
    const elapsed = (time: number) => exportedScalar(replay.advanceTo(time, { stepMs: 250, forceFullIntermediateRender: true }).exports, `${authored[0].prefix}_elapsed`, fidelity)
    const early = elapsed(4000)
    expect(elapsed(4250) - early, `continuity ${fidelity}`).toBe(250)
  }
})

it('runs empty named Layer, reorder, Group rebinding and removal as one admitted sequence', { timeout: 60_000 }, async () => {
  const { record, dependencies } = structureFixture()
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  const zoneId = record.composition.clips[0].zoneId
  const groupOccurrenceId = record.composition.groupOccurrences[0].id
  const definitionLayerId = record.composition.groupOccurrences[0].layerBindings[0].definitionLayerId
  const boundLayerId = record.composition.groupOccurrences[0].layerBindings[0].layerId
  const ordinaryLayerId = record.composition.clips[0].layerId
  const ranksBefore = record.composition.layers.map(layer => [layer.id, layer.rank] as const)
  let allocated = 0
  const allocate = () => `layer-${++allocated}`

  // 1. An empty named Layer is a first-class owner with a stable identity.
  const add = createShowV2LayerAtTopIntent(pilot.current(), zoneId, 'Guides', allocate)
  if (add.status !== 'ready') throw Error(add.message)
  expect((await admitShowV2PilotLayerEdit({ ...pilot.context(), intent: add.intent })).status).toBe('applied')
  const freshLayerId = add.intent.layer.id
  expect(pilot.current().composition.layers.find(layer => layer.id === freshLayerId)).toMatchObject({ name: 'Guides', zoneId })
  expect(materializeShowGroupsV2(pilot.current()).composition.clips.some(clip => clip.layerId === freshLayerId)).toBe(false)

  // 2. Reordering changes stacking only; Clip and Group identities are stable.
  const reorder = reorderShowV2LayerIntent(pilot.current(), freshLayerId, 'down')
  if (!reorder) throw Error('reorder intent')
  expect((await admitShowV2PilotLayerEdit({ ...pilot.context(), intent: reorder })).status).toBe('applied')
  const ranksAfter = pilot.current().composition.layers.map(layer => [layer.id, layer.rank] as const)
  expect(ranksAfter.map(([id]) => id).sort()).toEqual([...ranksBefore.map(([id]) => id), freshLayerId].sort())
  expect(ranksAfter).not.toEqual([...ranksBefore, [freshLayerId, ranksBefore.length] as const])
  expect(pilot.current().composition.clips).toEqual(record.composition.clips)
  expect(pilot.current().composition.groupOccurrences.map(item => item.id)).toEqual(record.composition.groupOccurrences.map(item => item.id))

  // 3. Binding the Group occurrence to a colliding destination Layer refuses:
  //    materialized Group children would overlap the ordinary Clip.
  const held = pilot.current().composition.groupOccurrences[0]
  const colliding = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'move-occurrence', occurrenceId: groupOccurrenceId,
    placement: { startMs: held.startMs, zoneId, layerBindings: [{ definitionLayerId, layerId: ordinaryLayerId }], translationX: 0, translationY: 0 },
  }, allocate)
  if (colliding.status !== 'ready') throw Error(colliding.message)
  const refused = await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: colliding.intent })
  expect(refused).toMatchObject({ status: 'refused', source: 'owner' })
  const writesBeforeBind = pilot.writes()

  // 4. Binding it to the fresh empty Layer is accepted and keeps the runtime.
  const rebind = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'move-occurrence', occurrenceId: groupOccurrenceId,
    placement: { startMs: held.startMs, zoneId, layerBindings: [{ definitionLayerId, layerId: freshLayerId }], translationX: 0, translationY: 0 },
  }, allocate)
  if (rebind.status !== 'ready') throw Error(rebind.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: rebind.intent })).status).toBe('applied')
  expect(pilot.current().composition.groupOccurrences[0].layerBindings).toEqual([{ definitionLayerId, layerId: freshLayerId }])
  expect(pilot.current().composition.patternInstances.map(item => item.id)).toEqual(record.composition.patternInstances.map(item => item.id))

  // 5. The vacated Layer is now empty and unreferenced, so plain removal works.
  const removeVacated = await admitShowV2PilotLayerEdit({ ...pilot.context(), intent: { kind: 'remove', zoneId, layerId: boundLayerId } })
  expect(removeVacated.status).toBe('applied')
  expect(pilot.current().composition.layers.some(layer => layer.id === boundLayerId)).toBe(false)
  expect(pilot.writes()).toBe(writesBeforeBind + 2)

  // 6. Removing a referenced Layer without a complete plan still refuses.
  const refusedRemoval = await admitShowV2PilotLayerEdit({ ...pilot.context(), intent: { kind: 'remove', zoneId, layerId: freshLayerId } })
  expect(refusedRemoval).toMatchObject({ status: 'refused', source: 'owner' })
  expect(pilot.writes()).toBe(writesBeforeBind + 2)

  // 7. The delivered artifact reopens with the new stacking and one runtime.
  const native = await nativeShowV2Artifacts(pilot.saved(), dependencies)
  expect(native.importedShow.composition).toEqual(pilot.saved().composition)
  expect(native.members.filter(member => !member.id.startsWith('__pxlblz_'))).toHaveLength(1)
})
