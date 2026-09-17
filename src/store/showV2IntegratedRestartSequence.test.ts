import { afterEach, beforeEach, expect, it } from 'vitest'
import { showV2GroupEditorFixture } from '../test/showV2GroupEditorFixture'
import { exportedScalar, nativeShowV2Artifacts, openIntegratedShowV2Pilot } from '../test/showV2IntegratedSequenceHarness'
import { deriveShowRestartEventsV2 } from '../engine/showPropertyAnimationV2'
import { buildShowV2TransitionEditorModel, planShowV2TransitionEdit } from '../engine/showV2TransitionEditorModel'
import { createShowV2LinkedDuplicateIntent } from '../engine/showV2ClipSharingEditorModel'
import { allocateShowClipTimingIdsV2 } from '../engine/showV2TimelineEditorModel'
import { resetPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotClipDelete, admitShowV2PilotClipSharingEdit, admitShowV2PilotClipTemporal,
  admitShowV2PilotTransitionEdit, admitShowV2PilotTransitionResize,
} from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

/** Authored Restart entry times for one runtime, in order. */
function resetTimes(record: ShowRecordV2, instanceId: string): number[] {
  const derived = deriveShowRestartEventsV2(record)
  if (derived.status !== 'derived') throw Error(`Restart derivation ${derived.status}`)
  return derived.events.filter(event => event.instanceId === instanceId).map(event => event.atMs).sort((left, right) => left - right)
}

/**
 * #1038 integrated RESTART sequence: shared visible users, entry reset, incoming
 * Transition attach and resize, trailing resize, split, duplicate, delete and
 * loop crossing, judged through the generated `.epe` replay.
 */
it('runs attach, resize, resize-outgoing, split, duplicate, delete and loop as one admitted Restart sequence', { timeout: 60_000 }, async () => {
  const { record, dependencies } = showV2GroupEditorFixture()
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  let allocated = 0
  const allocate = () => `restart-${++allocated}`
  const verseB = record.composition.clips.find(clip => clip.id === 'verse-b')!
  expect(verseB.entryPolicy).toBe('restart')
  expect(verseB.startMs).toBe(3000)

  // 0. Shared visible users: one runtime, one authored entry reset at 3000.
  expect(resetTimes(pilot.current(), 'instance')).toEqual([3000])

  // 1. Attaching an incoming Transition moves the trigger to the contribution
  //    window start, which is the unchanged outgoing end.
  const model = buildShowV2TransitionEditorModel(pilot.current(), 2)
  const junction = model.junctions.find(option => option.atMs === 3000 && option.scope === 'participant')!
  const crossfade = model.kinds.find(option => option.key.includes('crossfade'))!
  const insert = planShowV2TransitionEdit(pilot.current(), { kind: 'insert', junctionKey: junction.key, kindKey: crossfade.key, durationMs: 500, crossfadePolicy: 'live-live' }, allocate, 2)
  if (insert.status !== 'ready') throw Error(insert.message)
  expect((await admitShowV2PilotTransitionEdit({ ...pilot.context(), intent: insert.intent })).status).toBe('applied')
  const transitionId = insert.intent.kind === 'insert' ? insert.intent.transition.id : ''
  expect(pilot.current().composition.clips.find(clip => clip.id === 'verse-b')!.startMs).toBe(3500)
  expect(resetTimes(pilot.current(), 'instance')).toEqual([3000])

  // 2. Resizing the Transition keeps the outgoing end, so the trigger is stable.
  expect((await admitShowV2PilotTransitionResize({ ...pilot.context(), intent: { kind: 'resize-transition', transitionId, durationMs: 1000 } })).status).toBe('applied')
  expect(pilot.current().composition.clips.find(clip => clip.id === 'verse-b')!.startMs).toBe(4000)
  expect(resetTimes(pilot.current(), 'instance')).toEqual([3000])

  // 3. A trailing resize of the outgoing Clip moves the window and the trigger.
  expect((await admitShowV2PilotClipTemporal({ ...pilot.context(), intent: { kind: 'trim', clipId: 'verse-a', startMs: 2000, endMs: 2500 } })).status).toBe('applied')
  expect(pilot.current().composition.clips.find(clip => clip.id === 'verse-b')!.startMs).toBe(3500)
  expect(resetTimes(pilot.current(), 'instance')).toEqual([2500])

  // 4. Split keeps the instruction on the left and sets the right to Continue.
  const splitIds = allocateShowClipTimingIdsV2(pilot.current(), 'split', false, allocate)
  if (splitIds.status !== 'ready') throw Error(splitIds.message)
  expect((await admitShowV2PilotClipTemporal({ ...pilot.context(), intent: { kind: 'split', clipId: 'verse-b', atMs: 4500, rightClipId: splitIds.clipId } })).status).toBe('applied')
  expect(pilot.current().composition.clips.find(clip => clip.id === splitIds.clipId)!.entryPolicy).toBe('continue')
  expect(pilot.current().composition.clips.find(clip => clip.id === 'verse-b')!.entryPolicy).toBe('restart')
  expect(resetTimes(pilot.current(), 'instance')).toEqual([2500])

  // 5. Duplicate copies the authored instruction to the new placement.
  const rightPiece = pilot.current().composition.clips.find(clip => clip.id === splitIds.clipId)!
  const duplicate = createShowV2LinkedDuplicateIntent(pilot.context().capture, 'verse-b', { zoneId: verseB.zoneId, layerId: verseB.layerId, startMs: String(rightPiece.startMs + rightPiece.durationMs) }, allocate)
  if (duplicate.status !== 'ready') throw Error(duplicate.status === 'refused' ? duplicate.message : 'duplicate plan')
  expect((await admitShowV2PilotClipSharingEdit({ ...pilot.context(), intent: duplicate.intent })).status).toBe('applied')
  const copyId = duplicate.intent.kind === 'duplicate' ? duplicate.intent.identities.clipId : ''
  expect(pilot.current().composition.clips.find(clip => clip.id === copyId)!.entryPolicy).toBe('restart')
  expect(resetTimes(pilot.current(), 'instance')).toEqual([2500, 6500])

  // 6. Deleting that Clip removes its instruction and nothing else.
  expect((await admitShowV2PilotClipDelete({ ...pilot.context(), intent: { kind: 'delete-clip', clipId: copyId } })).status).toBe('applied')
  expect(resetTimes(pilot.current(), 'instance')).toEqual([2500])
  expect(pilot.current().composition.patternInstances.map(instance => instance.id)).toEqual(['instance'])

  expect(pilot.writes()).toBe(6)
  expect(pilot.history().past).toHaveLength(6)

  // 7. The delivered artifact resets one shared runtime at contribution, keeps
  //    the authored control curve, does not retrigger on the right split, and
  //    fires the next loop's entry after Show End.
  const native = await nativeShowV2Artifacts(pilot.saved(), dependencies)
  expect(native.importedShow.composition).toEqual(pilot.saved().composition)
  expect(native.members.filter(member => !member.id.startsWith('__pxlblz_')).map(member => member.id)).toEqual(['instance'])
  const showEndMs = pilot.saved().composition.showEndMs
  expect(showEndMs).toBe(30000)
  const resets = [2500, showEndMs + 2500]
  const probes = [125, 2375, 2500, 2625, 4375, 4500, 4625, 6375, 6500, 29875, 32375, 32500, 32625]
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const prefix = native.prefixFor('instance')
    const replay = native.replay(fidelity)
    for (const time of probes) {
      const frame = replay.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
      const expected = time - Math.max(0, ...resets.filter(reset => reset <= time))
      expect(exportedScalar(frame.exports, `${prefix}_elapsed`, fidelity), `elapsed@${time} ${fidelity}`).toBe(expected)
      if (fidelity === 'fast') {
        const authored = time % showEndMs
        expect(frame.frame[0], `authored gain@${time}`).toBeCloseTo(0.4 + 0.4 * (authored / showEndMs) ** 2, 6)
      }
    }
    // Cold seek replays the same events from the baseline with a coarser step.
    const cold = native.replay(fidelity)
    const seeked = cold.advanceTo(32625, { stepMs: 625, forceFullIntermediateRender: true })
    expect(exportedScalar(seeked.exports, `${prefix}_elapsed`, fidelity), `cold seek ${fidelity}`).toBe(32625 - resets[1])
  }
})
