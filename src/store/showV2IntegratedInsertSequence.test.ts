import { afterEach, beforeEach, expect, it } from 'vitest'
import { exportedScalar, nativeShowV2Artifacts, openIntegratedShowV2Pilot } from '../test/showV2IntegratedSequenceHarness'
import { resetPersonalContentProvider } from '../engine/personalContentProvider'
import { evaluateShowPropertyTrackV2 } from '../engine/showPropertyAnimationV2'
import { insertShowTimeV2 } from '../engine/showTimelineV2'
import { prepareShowStageV2 } from '../engine/showPreparedStageV2'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotInsertTime } from './showV2PreparedEditAdmission'
import type { ShowPreparedStageDependenciesV2 } from '../engine/showPreparedStageV2'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

const VOICE = 'export var elapsed=0; export var gain=.4; export function sliderGain(v){gain=v} export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(gain,elapsed/8000,x)}'

/**
 * One fixture carrying every §12 INSERT partition: a static Clip, an animated
 * Clip with an exact discontinuity and a last active key, a shared instance
 * track, an explicit zero time-scale runtime, a gap, a Layout boundary with a
 * timed transfer, and a positive visual Transition.
 */
function insertFixture(): { record: ShowRecordV2; dependencies: ShowPreparedStageDependenciesV2 } {
  const clip = (id: string, layerId: string, startMs: number, durationMs: number, instanceId = 'instance') => ({
    id, instanceId, zoneId: 'zone', layerId, startMs, durationMs, entryPolicy: 'continue' as const, zoneSampleMode: 'span' as const,
    appearance: { keys: [{ id: `${id}-key`, timeMs: startMs, value: { opacity: 1, effects: [], view: { mirror: false, phase: 0, brightness: 1 } } }] },
  })
  const record: ShowRecordV2 = {
    version: 2, id: 'insert-sequence', name: 'Insert sequence',
    zones: [{ id: 'zone', name: 'Zone', nominalPixelCount: 8 }],
    zoneLayouts: [{ id: 'layout', name: 'Layout', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    outputContract: { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 8, compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } },
    composition: {
      version: 2, executionModel: 'continuous', showEndMs: 8000, sampleRemap: { repeatScale: 1 },
      patternInstances: [
        { id: 'instance', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.4 } },
        { id: 'frozen', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 0, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.4 } },
      ],
      layers: [
        { id: 'main', zoneId: 'zone', name: 'Main', rank: 0 },
        { id: 'over', zoneId: 'zone', name: 'Over', rank: 1 },
        { id: 'held', zoneId: 'zone', name: 'Held', rank: 2 },
      ],
      clips: [
        clip('static', 'main', 0, 600),
        clip('animated', 'main', 1000, 2000),
        clip('out', 'over', 5000, 200),
        clip('in', 'over', 5400, 500),
        clip('frozen-clip', 'held', 0, 8000, 'frozen'),
      ],
      transitions: [{
        id: 'boundary', kind: 'crossfade', crossfadePolicy: 'live-live', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' },
        participants: [{ id: 'boundary-pair', zoneId: 'zone', layerId: 'over', fromClipId: 'out', toClipId: 'in' }], propertyRamps: [],
      }],
      layoutOccurrences: [
        { id: 'first-layout', layoutId: 'layout', startMs: 0, durationMs: 4000, parameters: {} },
        { id: 'second-layout', layoutId: 'layout', startMs: 4000, durationMs: 4000, parameters: {}, incomingTransfer: { id: 'transfer', fromOccurrenceId: 'first-layout', durationMs: 200, direction: 'forward' } },
      ],
      propertyTracks: [
        {
          // A participant-scope positive Transition currently requires full-Show
          // activation for every Clip/instance track (`unsupported-transition-
          // property-track`), so the animated Clip keeps Show-wide activation
          // with its authored keys inside; key 'curve-last' is the last key of a
          // still-active track.
          id: 'clip-curve', target: { kind: 'clip-view', clipId: 'animated', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 8000,
          keyframes: [
            { id: 'curve-start', timeMs: 1000, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } },
            // Stepping from the segment start makes 1800 an exact discontinuity:
            // the authored value is 0.9 while the right-boundary value is 0.6.
            { id: 'curve-jump', timeMs: 1800, value: 0.9, easing: { curve: 'steps', steps: 2, position: 'start' } },
            { id: 'curve-last', timeMs: 2600, value: 0.3, easing: { curve: 'linear' } },
          ],
        },
        {
          id: 'shared-gain', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 8000,
          keyframes: [
            { id: 'gain-start', timeMs: 0, value: 0.4, easing: { curve: 'linear' } },
            { id: 'gain-end', timeMs: 8000, value: 0.8, easing: { curve: 'linear' } },
          ],
        },
      ],
      markers: [{ id: 'chapter', timeMs: 1000 }, { id: 'dormant', timeMs: 12000 }],
      groupDefinitions: [], groupOccurrences: [],
    },
    updatedAt: 1,
  }
  const dependencies: ShowPreparedStageDependenciesV2 = {
    patterns: [{ id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  return { record, dependencies }
}

function clipOf(record: ShowRecordV2, id: string) {
  return record.composition.clips.find(clip => clip.id === id)!
}
function trackOf(record: ShowRecordV2, id: string) {
  return record.composition.propertyTracks.find(track => track.id === id)!
}

it('runs the whole Insert Time sequence with typed interior refusals through admission', { timeout: 60_000 }, async () => {
  const { record, dependencies } = insertFixture()
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  expect(pilot.context().capture.prepared.status).toBe('ready')

  // 1. Strictly inside the positive visual Transition window: typed refusal.
  const insideVisual = await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 5300, durationMs: 200 } })
  expect(insideVisual).toMatchObject({ status: 'refused', source: 'owner', code: 'visual-transition-window' })
  // 2. Strictly inside the timed Layout transfer window: typed refusal.
  const insideTransfer = await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 4100, durationMs: 200 } })
  expect(insideTransfer).toMatchObject({ status: 'refused', source: 'owner', code: 'layout-transfer-window' })
  expect(pilot.writes()).toBe(0)
  expect(pilot.history().past).toEqual([])
  expect(pilot.current()).toEqual(record)

  // 3. Insertion in the gap leaves the earlier static Clip and moves later owners.
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 800, durationMs: 200 } })).status).toBe('applied')
  expect(clipOf(pilot.current(), 'static')).toMatchObject({ startMs: 0, durationMs: 600 })
  expect(clipOf(pilot.current(), 'animated')).toMatchObject({ startMs: 1200, durationMs: 2000 })
  expect(pilot.current().composition.showEndMs).toBe(8200)
  expect(pilot.current().composition.markers.map(marker => marker.timeMs)).toEqual([1200, 12200])
  // The shared instance track is transformed exactly once even though four Clips
  // use the runtime: one hold key at p, one resume key at p + d, no duplicates.
  const shared = trackOf(pilot.current(), 'shared-gain')
  expect(shared.keyframes.map(key => key.timeMs)).toEqual([0, 800, 1000, 8200])
  expect(shared.activeDurationMs).toBe(8200)
  for (const time of [800, 900, 999, 1000]) expect(evaluateShowPropertyTrackV2(shared, time)).toBeCloseTo(0.44, 12)
  // The resume key keeps the original outgoing source curve, not a rescaled one.
  expect(evaluateShowPropertyTrackV2(shared, 4100)).toBeCloseTo(0.4 + 0.4 * (3900 / 8000), 12)
  // Activation stays half-open: the exclusive end has no value.
  expect(evaluateShowPropertyTrackV2(shared, 8199)).toBeCloseTo(0.4 + 0.4 * (7999 / 8000), 12)
  expect(evaluateShowPropertyTrackV2(shared, 8200)).toBeUndefined()

  // 4. Insertion at the exact discontinuity key seeds a constant hold and keeps
  //    the authored key, its value and its right-boundary discontinuity.
  const authoredCurve = trackOf(pilot.current(), 'clip-curve')
  const jumpAt = authoredCurve.keyframes.find(key => key.id === 'curve-jump')!.timeMs
  expect(jumpAt).toBe(2000)
  // The authored key value differs from the evaluator's right-boundary value.
  const boundaryValue = evaluateShowPropertyTrackV2(authoredCurve, jumpAt)
  expect(boundaryValue).toBeCloseTo(0.6, 12)
  expect(authoredCurve.keyframes.find(key => key.id === 'curve-jump')!.value).toBe(0.9)
  const beforeJump = evaluateShowPropertyTrackV2(authoredCurve, jumpAt - 1)
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: jumpAt, durationMs: 300 } })).status).toBe('applied')
  const held = trackOf(pilot.current(), 'clip-curve')
  const movedJump = held.keyframes.find(key => key.id === 'curve-jump')!
  expect(movedJump.timeMs).toBe(jumpAt + 300)
  // The authored key keeps its identity, value and easing on the right.
  expect(movedJump.value).toBe(0.9)
  expect(movedJump.easing).toEqual({ curve: 'steps', steps: 2, position: 'start' })
  const seeded = held.keyframes.find(key => key.timeMs === jumpAt && key.id !== 'curve-jump')!
  expect(seeded).toBeDefined()
  // The hold owns the right-boundary value as a constant segment, and the
  // preceding easing is not stretched across the inserted window.
  for (const time of [jumpAt, jumpAt + 150, jumpAt + 299]) {
    expect(evaluateShowPropertyTrackV2(held, time), `hold@${time}`).toBeCloseTo(boundaryValue!, 12)
  }
  expect(evaluateShowPropertyTrackV2(held, jumpAt - 1)).toBeCloseTo(beforeJump!, 12)
  expect(evaluateShowPropertyTrackV2(held, jumpAt + 300)).toBeCloseTo(boundaryValue!, 12)

  // 5. Insertion at the last key of a still-active track holds its right-boundary
  //    value without stretching the preceding easing.
  const lastAt = trackOf(pilot.current(), 'clip-curve').keyframes.find(key => key.id === 'curve-last')!.timeMs
  expect(lastAt).toBe(3100)
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: lastAt, durationMs: 100 } })).status).toBe('applied')
  const extended = trackOf(pilot.current(), 'clip-curve')
  expect(extended.keyframes.find(key => key.id === 'curve-last')!.timeMs).toBe(lastAt + 100)
  expect(evaluateShowPropertyTrackV2(extended, lastAt)).toBe(0.3)
  expect(evaluateShowPropertyTrackV2(extended, lastAt + 99)).toBe(0.3)
  // The preceding two-step kernel keeps both steps rather than being stretched.
  expect(evaluateShowPropertyTrackV2(extended, 2400)).toBeCloseTo(0.6, 12)
  expect(evaluateShowPropertyTrackV2(extended, 2900)).toBeCloseTo(0.3, 12)

  // 6. Insertion at a Layout switch extends its predecessor and shifts the
  //    switch, preserving the timed transfer attachment.
  const switchAt = pilot.current().composition.layoutOccurrences[1].startMs
  const beforeSwitch = pilot.current().composition.layoutOccurrences[0].durationMs
  expect((await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: switchAt, durationMs: 100 } })).status).toBe('applied')
  expect(pilot.current().composition.layoutOccurrences[0].durationMs).toBe(beforeSwitch + 100)
  expect(pilot.current().composition.layoutOccurrences[1].startMs).toBe(switchAt + 100)
  expect(pilot.current().composition.layoutOccurrences[1].incomingTransfer).toEqual(record.composition.layoutOccurrences[1].incomingTransfer)

  // 7. Insertion at zero is representable and mapped correctly by the timeline
  //    owner, but the current lowering guard then refuses the complete record:
  //    shifting a full-Show-activated track off zero breaks the positive-
  //    Transition activation requirement. Recorded as an unresolved obligation
  //    of `showCompositionLoweringV2.ts`, not an accepted product limit.
  const beforeZero = pilot.current()
  const firstDuration = beforeZero.composition.layoutOccurrences[0].durationMs
  const zeroOwner = insertShowTimeV2(beforeZero, { atMs: 0, durationMs: 100 })
  expect(zeroOwner.status).toBe('changed')
  if (zeroOwner.status !== 'changed') throw Error('insert at zero')
  expect(zeroOwner.record.composition.layoutOccurrences[0]).toMatchObject({ startMs: 0, durationMs: firstDuration + 100 })
  expect(clipOf(zeroOwner.record, 'static').startMs).toBe(100)
  expect(zeroOwner.record.composition.showEndMs).toBe(8800)
  const zeroPrepared = prepareShowStageV2(zeroOwner.record, dependencies)
  expect(zeroPrepared).toMatchObject({ status: 'refused', message: expect.stringContaining('positive-Transition property-track activation') })
  // The smallest counterexample: the same mapped candidate prepares as soon as
  // the participant-scope positive Transition is absent.
  const withoutTransition = structuredClone(zeroOwner.record)
  withoutTransition.composition.transitions = []
  withoutTransition.composition.clips = withoutTransition.composition.clips.filter(clip => clip.id !== 'out' && clip.id !== 'in')
  expect(prepareShowStageV2(withoutTransition, dependencies).status).toBe('ready')
  const atZero = await admitShowV2PilotInsertTime({ ...pilot.context(), intent: { atMs: 0, durationMs: 100 } })
  expect(atZero).toMatchObject({ status: 'refused', source: 'admission', code: 'unsupported-pilot-record' })
  expect(pilot.current()).toBe(beforeZero)

  expect(pilot.writes()).toBe(4)
  expect(pilot.history().past).toHaveLength(4)
  expect(pilot.saved()).toEqual(pilot.current())

  // Runtime evolution is untouched: the shared runtime advances normally through
  // added playback and the explicit zero time-scale runtime never advances.
  const native = await nativeShowV2Artifacts(pilot.saved(), dependencies)
  expect(native.importedShow.composition).toEqual(pilot.saved().composition)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = native.replay(fidelity)
    const shared = native.prefixFor('instance')
    const frozen = native.prefixFor('frozen')
    const elapsed = (time: number) => exportedScalar(replay.advanceTo(time, { stepMs: 100, forceFullIntermediateRender: true }).exports, `${shared}_elapsed`, fidelity)
    const frozenElapsed = (time: number) => exportedScalar(replay.advanceTo(time, { stepMs: 100, forceFullIntermediateRender: true }).exports, `${frozen}_elapsed`, fidelity)
    // The shared runtime advances while it contributes, holds across the widened
    // gap, and resumes in the extended animated Clip. No reset was introduced.
    const atGapStart = elapsed(600)
    expect(atGapStart, `gap start ${fidelity}`).toBeGreaterThan(0)
    // 1100 is the last frame of the widened gap; the animated Clip now starts at 1200.
    expect(elapsed(1100), `gap hold ${fidelity}`).toBe(atGapStart)
    expect(elapsed(1200) - atGapStart, `gap resume ${fidelity}`).toBe(100)
    expect(elapsed(1300) - atGapStart, `advance after resume ${fidelity}`).toBe(200)
    // Explicit zero time scale keeps its existing behavior through added playback.
    expect(frozenElapsed(3600), `frozen ${fidelity}`).toBe(0)
  }
})
