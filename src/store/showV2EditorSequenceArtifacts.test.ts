import { afterEach, beforeEach, expect, it } from 'vitest'
import { exportedScalar, nativeShowV2Artifacts, openIntegratedShowV2Pilot } from '../test/showV2IntegratedSequenceHarness'
import { SEQUENCE_DEPENDENCIES, showV2EditorSequenceRecord } from '../test/showV2EditorSequenceFixture'
import { evaluateShowPropertyKeysV2 } from '../engine/showPropertyTrackTimeMappingV2'
import { resetPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotClipEntryPolicy,
  admitShowV2PilotClipTemporal,
  admitShowV2PilotInsertTime,
} from './showV2PreparedEditAdmission'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

/**
 * The delivered-artifact half of the slice-5 route sequences.
 *
 * `ShowEditorV2AnimationSequences.test.tsx` drives the same fixture through the
 * rendered route and asserts the adopted record; the `.pxlshow` and `.epe`
 * oracles need the node environment, so they run here through the same closed
 * admission wrappers the route calls.
 */
it('INSERT: the saved bytes of a mid-Show insertion reopen as the same composition', { timeout: 60_000 }, async () => {
  const pilot = openIntegratedShowV2Pilot(showV2EditorSequenceRecord(), SEQUENCE_DEPENDENCIES)
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 5000, durationMs: 2000 } })).status)
    .toBe('applied')

  const saved = pilot.saved()
  expect(saved.composition.showEndMs).toBe(32000)
  expect(saved.composition.groupOccurrences[0].holds)
    .toEqual([{ id: 'occurrence-0:hold:5000', localTimeMs: 5000, durationMs: 2000 }])
  const native = await nativeShowV2Artifacts(saved, SEQUENCE_DEPENDENCIES)
  expect(native.importedShow.composition).toEqual(saved.composition)
  // The hold maps global time to held local time: the Group Clip contributes
  // across the whole extended occurrence without another runtime appearing.
  expect(native.members.filter(member => !member.id.startsWith('__pxlblz_')).map(member => member.id))
    .toEqual(['instance', 'solo'])
})

it('GROUP-HOLD: a hold inside a Restart child does not retrigger its reset', { timeout: 60_000 }, async () => {
  const record = showV2EditorSequenceRecord()
  // The Group child restarts the shared runtime at its own first contribution.
  record.composition.groupDefinitions[0].clips[0].entryPolicy = 'restart'
  const pilot = openIntegratedShowV2Pilot(record, SEQUENCE_DEPENDENCIES)
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 5000, durationMs: 2000 } })).status)
    .toBe('applied')
  expect(pilot.saved().composition.groupOccurrences[0].holds)
    .toEqual([{ id: 'occurrence-0:hold:5000', localTimeMs: 5000, durationMs: 2000 }])

  const native = await nativeShowV2Artifacts(pilot.saved(), SEQUENCE_DEPENDENCIES)
  const prefix = native.prefixFor('instance')
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = native.replay(fidelity)
    let previous = -1
    // §7: the child spans the hold, so its Restart fires once on entry. A hold
    // that retriggered would reset the clock somewhere inside [5000, 7000).
    for (const timeMs of [4875, 5000, 5125, 5500, 6000, 6500, 6875, 7000, 7125]) {
      const frame = replay.advanceTo(timeMs, { stepMs: 125, forceFullIntermediateRender: true })
      const elapsed = exportedScalar(frame.exports, `${prefix}_elapsed`, fidelity)
      expect(elapsed, `elapsed@${timeMs} ${fidelity}`).toBeGreaterThan(previous)
      previous = elapsed
    }
    expect(previous, `elapsed@7125 ${fidelity}`).toBe(7125)
  }
})

it('RESTART: an entry policy written through the wrapper resets the shared runtime in the generated .epe', { timeout: 60_000 }, async () => {
  const pilot = openIntegratedShowV2Pilot(showV2EditorSequenceRecord(), SEQUENCE_DEPENDENCIES)
  expect((await admitShowV2PilotClipEntryPolicy({
    ...pilot.context(),
    intent: { kind: 'set-entry-policy', clipId: 'reprise', entryPolicy: 'restart' },
  })).status).toBe('applied')
  expect(pilot.saved().composition.clips.find(clip => clip.id === 'reprise')!.entryPolicy).toBe('restart')
  expect(pilot.writes()).toBe(1)

  const native = await nativeShowV2Artifacts(pilot.saved(), SEQUENCE_DEPENDENCIES)
  // One runtime, reset at the reprise Clip's first contribution, never cloned.
  expect(native.members.filter(member => member.id === 'instance')).toHaveLength(1)
  const prefix = native.prefixFor('instance')
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = native.replay(fidelity)
    for (const timeMs of [4000, 11875, 12000, 12125, 16000]) {
      const frame = replay.advanceTo(timeMs, { stepMs: 125, forceFullIntermediateRender: true })
      expect(exportedScalar(frame.exports, `${prefix}_elapsed`, fidelity), `elapsed@${timeMs} ${fidelity}`)
        .toBe(timeMs >= 12000 ? timeMs - 12000 : timeMs)
    }
  }
})

it('CURVE: a restricted instance curve still emits the original authored values', { timeout: 60_000 }, async () => {
  const record = showV2EditorSequenceRecord()
  const authored = structuredClone(record.composition.propertyTracks[0].keyframes)
  const pilot = openIntegratedShowV2Pilot(record, SEQUENCE_DEPENDENCIES)
  // Trim the sole user of `solo` to [1000, 3000): the instance track restricts.
  expect((await admitShowV2PilotClipTemporal({
    ...pilot.context(),
    intent: { kind: 'trim', clipId: 'curve-clip', startMs: 1000, endMs: 3000 },
  })).status).toBe('applied')

  const track = pilot.saved().composition.propertyTracks.find(candidate => candidate.id === 'solo-gain')!
  expect([track.activeStartMs, track.activeDurationMs]).toEqual([1000, 2000])
  expect(track.keyframes[0].curveSegment?.sourceDurationMs).toBe(4000)

  const native = await nativeShowV2Artifacts(pilot.saved(), SEQUENCE_DEPENDENCIES)
  const prefix = native.prefixFor('solo')
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = native.replay(fidelity)
    for (const timeMs of [1125, 1500, 2000, 2500, 2875]) {
      const frame = replay.advanceTo(timeMs, { stepMs: 125, forceFullIntermediateRender: true })
      // The oracle is the original authored curve at the same global time; a
      // two-point re-normalization would emit the chord between the endpoints.
      expect(exportedScalar(frame.exports, `${prefix}_gain`, fidelity), `gain@${timeMs} ${fidelity}`)
        .toBeCloseTo(evaluateShowPropertyKeysV2(authored, timeMs), fidelity === 'fast' ? 6 : 3)
    }
  }
})
