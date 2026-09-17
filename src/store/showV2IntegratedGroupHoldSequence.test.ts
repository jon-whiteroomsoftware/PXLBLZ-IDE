import { afterEach, beforeEach, expect, it } from 'vitest'
import { exportedScalar, nativeShowV2Artifacts, openIntegratedShowV2Pilot } from '../test/showV2IntegratedSequenceHarness'
import { resetPersonalContentProvider } from '../engine/personalContentProvider'
import { groupOccurrenceDuration, materializeShowGroupsV2 } from '../engine/showGroupsV2'
import { planShowV2GroupOccurrenceEdit } from '../engine/showV2GroupOccurrenceEditorModel'
import { prepareShowStageV2, type ShowPreparedStageDependenciesV2 } from '../engine/showPreparedStageV2'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotGroupOccurrenceEdit, admitShowV2PilotInsertTime } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

const VOICE = 'export var elapsed=0; export var gain=.4; export function sliderGain(v){gain=v} export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(gain,elapsed/10000,x)}'

/**
 * The §7 worked example: linked occurrences `[0,10000)` and `[20000,30000)` of a
 * 10,000 ms definition that shares the ordinary runtime, with an internal
 * Transition window at local `[4000,4500)` and a Restart child after it.
 */
function groupHoldFixture(): { record: ShowRecordV2; dependencies: ShowPreparedStageDependenciesV2 } {
  const appearance = (timeMs: number) => ({ keys: [{ id: `key-${timeMs}`, timeMs, value: { opacity: 1, effects: [], view: { mirror: false, phase: 0, brightness: 1 } } }] })
  const record: ShowRecordV2 = {
    version: 2, id: 'group-hold-sequence', name: 'Group hold sequence',
    zones: [{ id: 'zone', name: 'Zone', nominalPixelCount: 8 }],
    zoneLayouts: [{ id: 'layout', name: 'Layout', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    outputContract: { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 8, compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } },
    composition: {
      version: 2, executionModel: 'continuous', showEndMs: 60000, sampleRemap: { repeatScale: 1 },
      patternInstances: [{ id: 'instance', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.4 } }],
      layers: [
        { id: 'main', zoneId: 'zone', name: 'Main', rank: 0 },
        { id: 'group-layer', zoneId: 'zone', name: 'Group', rank: 1 },
      ],
      clips: [{ id: 'ordinary', instanceId: 'instance', zoneId: 'zone', layerId: 'main', startMs: 0, durationMs: 60000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance(0) }],
      transitions: [],
      layoutOccurrences: [{ id: 'first-layout', layoutId: 'layout', startMs: 0, durationMs: 60000, parameters: {} }],
      propertyTracks: [{
        id: 'shared-gain', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 60000,
        keyframes: [
          { id: 'gain-start', timeMs: 0, value: 0.4, easing: { curve: 'linear' } },
          { id: 'gain-end', timeMs: 60000, value: 0.8, easing: { curve: 'linear' } },
        ],
      }],
      markers: [{ id: 'dormant', timeMs: 70000 }],
      groupDefinitions: [{
        id: 'verse', name: 'Verse',
        patternInstances: [{ id: 'slot', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.4 } }],
        layers: [{ id: 'local', name: 'Local', rank: 0 }],
        clips: [
          { id: 'child-a', instanceId: 'slot', layerId: 'local', startMs: 0, durationMs: 4000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance(0) },
          { id: 'child-b', instanceId: 'slot', layerId: 'local', startMs: 4500, durationMs: 5500, entryPolicy: 'restart', zoneSampleMode: 'span', appearance: appearance(4500) },
        ],
        // Group-local Transitions keep the existing placement-pair shape.
        transitions: [{
          id: 'inner', kind: 'crossfade', crossfadePolicy: 'live-live', durationMs: 500, easing: { curve: 'sine', direction: 'in-out' },
          fromPlacementId: 'child-a', toPlacementId: 'child-b',
        }],
        propertyTracks: [],
      }],
      groupOccurrences: [0, 20000].map((startMs, index) => ({
        id: `occurrence-${index}`, definitionId: 'verse', layoutOccurrenceId: 'first-layout', zoneId: 'zone', startMs,
        translationX: 0, translationY: 0, layerBindings: [{ definitionLayerId: 'local', layerId: 'group-layer' }], holds: [],
        instanceBindings: { slot: 'instance' },
      })),
    },
    updatedAt: 1,
  }
  const dependencies: ShowPreparedStageDependenciesV2 = {
    patterns: [{ id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  return { record, dependencies }
}

function occurrence(record: ShowRecordV2, id: string) {
  return record.composition.groupOccurrences.find(item => item.id === id)!
}
function definitionOf(record: ShowRecordV2, id: string) {
  return record.composition.groupDefinitions.find(item => item.id === id)!
}

it('runs the §7 hold example, repeat insertion, move, duplicate, Make Unique and Ungroup as one admitted sequence', { timeout: 60_000 }, async () => {
  const { record, dependencies } = groupHoldFixture()
  const definitionBefore = structuredClone(definitionOf(record, 'verse'))
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  expect(pilot.context().capture.prepared.status).toBe('ready')
  let allocated = 0
  const allocate = () => `hold-${++allocated}`

  // 1. Insertion strictly inside the materialized Group-local Transition window
  //    refuses atomically, with no write and no history.
  const insideInner = await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 4200, durationMs: 500 } })
  expect(insideInner).toMatchObject({ status: 'refused', source: 'owner' })
  expect(pilot.writes()).toBe(0)
  expect(pilot.current()).toBe(record)

  // 2. The §7 worked example: insert 2000 at 5000.
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 5000, durationMs: 2000 } })).status).toBe('applied')
  const first = occurrence(pilot.current(), 'occurrence-0')
  const second = occurrence(pilot.current(), 'occurrence-1')
  expect(first.startMs).toBe(0)
  expect(first.holds).toEqual([{ id: expect.any(String), localTimeMs: 5000, durationMs: 2000 }])
  expect(groupOccurrenceDuration(definitionOf(pilot.current(), 'verse'), first)).toBe(12000)
  expect(second.startMs).toBe(22000)
  expect(second.holds).toEqual([])
  // The definition and every runtime identity are unchanged.
  expect(definitionOf(pilot.current(), 'verse')).toEqual(definitionBefore)
  expect(pilot.current().composition.patternInstances.map(item => item.id)).toEqual(['instance'])
  expect(pilot.current().composition.showEndMs).toBe(62000)

  // 3. Repeat insertion inside that hold extends the same hold identity.
  const holdId = first.holds[0].id
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 6000, durationMs: 1000 } })).status).toBe('applied')
  expect(occurrence(pilot.current(), 'occurrence-0').holds).toEqual([{ id: holdId, localTimeMs: 5000, durationMs: 3000 }])
  expect(definitionOf(pilot.current(), 'verse')).toEqual(definitionBefore)
  expect(occurrence(pilot.current(), 'occurrence-1').startMs).toBe(23000)

  // 4. Move preserves the local hold list and the shared runtime bindings.
  const held = occurrence(pilot.current(), 'occurrence-0')
  const moved = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'move-occurrence', occurrenceId: 'occurrence-1',
    placement: { startMs: 20000, zoneId: 'zone', layerBindings: held.layerBindings, translationX: 0, translationY: 0 },
  }, allocate)
  if (moved.status !== 'ready') throw Error(moved.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: moved.intent })).status).toBe('applied')
  expect(occurrence(pilot.current(), 'occurrence-1')).toMatchObject({ startMs: 20000, holds: [], instanceBindings: { slot: 'instance' } })

  // 5. Linked duplicate of the held occurrence keeps its hold list and runtime.
  const copy = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'duplicate-occurrence', occurrenceId: 'occurrence-0',
    placement: { startMs: 35000, zoneId: 'zone', layerBindings: held.layerBindings, translationX: 0, translationY: 0 },
  }, allocate)
  if (copy.status !== 'ready') throw Error(copy.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: copy.intent })).status).toBe('applied')
  const copyId = copy.intent.kind === 'duplicate-occurrence' ? copy.intent.newOccurrenceId : ''
  expect(occurrence(pilot.current(), copyId)).toMatchObject({ startMs: 35000, definitionId: 'verse', holds: [{ id: expect.any(String), localTimeMs: 5000, durationMs: 3000 }], instanceBindings: { slot: 'instance' } })
  expect(pilot.current().composition.patternInstances.map(item => item.id)).toEqual(['instance'])

  // 6. Make Unique preserves the hold list and the effective runtime binding.
  const unique = planShowV2GroupOccurrenceEdit(pilot.current(), { kind: 'make-unique', occurrenceId: copyId }, allocate)
  if (unique.status !== 'ready') throw Error(unique.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: unique.intent })).status).toBe('applied')
  const uniqueOccurrence = occurrence(pilot.current(), copyId)
  expect(uniqueOccurrence.definitionId).not.toBe('verse')
  expect(uniqueOccurrence.holds).toEqual([{ id: expect.any(String), localTimeMs: 5000, durationMs: 3000 }])
  expect(Object.values(uniqueOccurrence.instanceBindings ?? {})).toEqual(['instance'])
  expect(definitionOf(pilot.current(), 'verse')).toEqual(definitionBefore)
  expect(pilot.current().composition.patternInstances.map(item => item.id)).toEqual(['instance'])

  // 7. Ungroup materializes the mapped choreography without cloning a runtime.
  const mappedBefore = materializeShowGroupsV2(pilot.current()).composition.clips
    .filter(clip => clip.layerId === 'group-layer').map(clip => [clip.startMs, clip.durationMs, clip.entryPolicy])
  const ungroup = planShowV2GroupOccurrenceEdit(pilot.current(), { kind: 'ungroup-occurrence', occurrenceId: copyId }, allocate)
  if (ungroup.status !== 'ready') throw Error(ungroup.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: ungroup.intent })).status).toBe('applied')
  expect(pilot.current().composition.groupOccurrences.map(item => item.id).sort()).toEqual(['occurrence-0', 'occurrence-1'])
  const mappedAfter = materializeShowGroupsV2(pilot.current()).composition.clips
    .filter(clip => clip.layerId === 'group-layer').map(clip => [clip.startMs, clip.durationMs, clip.entryPolicy])
  expect(mappedAfter.slice().sort()).toEqual(mappedBefore.slice().sort())
  expect(pilot.current().composition.patternInstances.map(item => item.id)).toEqual(['instance'])

  expect(pilot.writes()).toBe(6)
  expect(pilot.history().past).toHaveLength(6)
  expect(pilot.saved()).toEqual(pilot.current())

  // 8. The delivered artifact honors held local time: the Restart child fires
  //    once at its actual first contribution and never retriggers during a hold.
  const native = await nativeShowV2Artifacts(pilot.saved(), dependencies)
  expect(native.importedShow.composition).toEqual(pilot.saved().composition)
  expect(native.members.filter(member => !member.id.startsWith('__pxlblz_')).map(member => member.id)).toEqual(['instance'])
  const prefix = native.prefixFor('instance')
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = native.replay(fidelity)
    const elapsed = (time: number) => exportedScalar(replay.advanceTo(time, { stepMs: 250, forceFullIntermediateRender: true }).exports, `${prefix}_elapsed`, fidelity)
    // Occurrence 0 holds local 5000 over global [5000, 8000); its Restart child
    // contributes from the internal Transition window start at local 4000.
    const beforeHold = elapsed(4750)
    expect(elapsed(5000), `hold entry ${fidelity}`).toBe(beforeHold + 250)
    expect(elapsed(7750), `hold interior ${fidelity}`).toBe(beforeHold + 250 + 2750)
    // A single reset happened at local 4000, and none during the hold.
    expect(beforeHold, `reset before hold ${fidelity}`).toBe(750)
  }
})

it('refuses an overlapping effective Group instance track duplicate atomically', { timeout: 60_000 }, async () => {
  // The lowering guard requires full-Show activation for every Clip/instance
  // track whenever a participant-scope positive Transition exists, so this
  // conflict partition uses the same fixture without the internal Transition.
  const { record, dependencies } = groupHoldFixture()
  const definition = definitionOf(record, 'verse')
  definition.transitions = []
  definition.clips[1].startMs = 4000
  definition.clips[1].durationMs = 6000
  definition.clips[1].appearance.keys[0].timeMs = 4000
  definition.propertyTracks = [{
    id: 'local-gain', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 10000,
    keyframes: [
      { id: 'local-start', timeMs: 0, value: 0.4, easing: { curve: 'linear' } },
      { id: 'local-end', timeMs: 10000, value: 0.9, easing: { curve: 'linear' } },
    ],
  }]
  // The shared global track would now overlap the projected local owners.
  record.composition.propertyTracks = []
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  expect(prepareShowStageV2(pilot.current(), dependencies).status).toBe('ready')
  const held = occurrence(pilot.current(), 'occurrence-0')
  const overlapping = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'duplicate-occurrence', occurrenceId: 'occurrence-0',
    placement: { startMs: 5000, zoneId: 'zone', layerBindings: held.layerBindings, translationX: 0, translationY: 0 },
  }, () => 'conflicting-copy')
  if (overlapping.status !== 'ready') throw Error(overlapping.message)
  const outcome = await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: overlapping.intent })
  expect(outcome).toMatchObject({ status: 'refused', source: 'owner' })
  expect(pilot.writes()).toBe(0)
  expect(pilot.history().past).toEqual([])
  expect(pilot.current().composition.groupOccurrences).toHaveLength(2)

  // Exact half-open adjacency remains admissible on the same fixture.
  const adjacent = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'duplicate-occurrence', occurrenceId: 'occurrence-0',
    placement: { startMs: 10000, zoneId: 'zone', layerBindings: held.layerBindings, translationX: 0, translationY: 0 },
  }, () => 'adjacent-copy')
  if (adjacent.status !== 'ready') throw Error(adjacent.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: adjacent.intent })).status).toBe('applied')
  expect(pilot.writes()).toBe(1)
})
