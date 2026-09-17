import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
import * as stage from '../engine/showPreparedStageV2'
import { validateShowRecordV2, type ShowRecordV2 } from '../engine/showCompositionV2'
import { editShowClipTemporalV2 } from '../engine/showClipTemporalV2'
import { editShowClipV2 } from '../engine/showClipsV2'
import { editShowTransitionV2 } from '../engine/showTransitionsV2'
import { projectShowTimelineV2 } from '../engine/showTimelineViewModelV2'
import {
  planShowTimelineGestureV2,
  type ShowTimelineGestureV2,
} from '../engine/showTimelineGesturesV2'
import type { CreateShowClipIntentV2 } from '../engine/showClipCreationV2'
import {
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotClipDelete,
  admitShowV2PilotClipSharingEdit,
  admitShowV2PilotClipTemporal,
  admitShowV2PilotCreateClip,
} from './showV2PreparedEditAdmission'

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
})
afterEach(() => resetPersonalContentProvider())

let index = 0

/** "out" 0-400, a 200 ms Crossfade, "in" 600-1000, inside a four-second Show. */
function seededRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.id = `gesture-${++index}`
  record.composition.showEndMs = 4_000
  record.composition.layoutOccurrences[0].durationMs = 4_000
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function setup(seed: ShowRecordV2 = seededRecord()) {
  const dependencies: stage.ShowPreparedStageDependenciesV2 = {
    patterns: [], maps: [], libraries: [], profiles: [], stageMap: null,
  }
  let saved = structuredClone(seed)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: 'gesture-test',
    replaceShowV2: write,
    listShowDocumentsV2: async () => [structuredClone(saved)],
  })
  useShowStore.setState({
    showV2Pilots: { [seed.id]: seed },
    showV2Histories: { [seed.id]: { past: [], future: [] } },
  })
  return { record: seed, dependencies, write, readSaved: () => saved }
}

/** Rebuild the capture and revision the closed admission checks, as the route does. */
function context(showId: string, dependencies: stage.ShowPreparedStageDependenciesV2) {
  const record = useShowStore.getState().showV2Pilots[showId]
  return {
    showId,
    baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
    capture: stage.captureShowStageEditV2(record, dependencies),
    isCurrent: () => true,
    onAdopted: vi.fn(),
  }
}

let fresh = 0
const allocate = () => `fresh-${++fresh}`

/** Adoption stamps its own `updatedAt`; the edit itself owns everything else. */
function content(record: ShowRecordV2): Omit<ShowRecordV2, 'updatedAt'> {
  const { updatedAt: _stamp, ...rest } = record
  return rest
}

/** The route's whole gesture path: plan one gesture, then admit its submission. */
async function gesture(
  showId: string,
  dependencies: stage.ShowPreparedStageDependenciesV2,
  request: ShowTimelineGestureV2,
) {
  const active = context(showId, dependencies)
  const planned = planShowTimelineGestureV2(active.capture, request, allocate)
  if (planned.status !== 'ready') return { planned, outcome: null }
  const { submission } = planned
  const outcome = submission.owner === 'clip-temporal'
    ? await admitShowV2PilotClipTemporal({ ...active, intent: submission.intent })
    : submission.owner === 'clip-sharing'
      ? await admitShowV2PilotClipSharingEdit({ ...active, intent: submission.intent })
      : await admitShowV2PilotClipDelete({ ...active, intent: submission.intent })
  return { planned, outcome }
}

describe('v2 timeline gestures through the closed admission', () => {
  // The second column is what the gesture's own parameters require of the saved
  // record, stated independently of the intent the adapter chose: `[id, start,
  // end]` per Clip, with `fresh` standing for an identity the gesture created.
  it.each([
    [
      'drag move',
      { kind: 'move', clipId: 'out', startMs: 1_000, zoneId: 'zone', layerId: 'layer:zone:main' },
      [['out', 1_000, 1_400], ['in', 1_600, 2_000]],
      200,
    ],
    [
      'trailing resize',
      { kind: 'resize-trailing', clipId: 'in', endMs: 1_400 },
      [['out', 0, 400], ['in', 600, 1_400]],
      200,
    ],
    [
      'leading resize',
      { kind: 'resize-leading', clipId: 'in', startMs: 500 },
      [['out', 0, 400], ['in', 500, 1_000]],
      100,
    ],
    [
      'split',
      { kind: 'split', clipId: 'out', atMs: 200 },
      [['out', 0, 200], ['fresh', 200, 400], ['in', 600, 1_000]],
      200,
    ],
  ] as [string, ShowTimelineGestureV2, [string, number, number][], number][])(
    'commits %s as one candidate equal to the pilot typed intent, with one history entry and one save',
    async (_name, request, expectedClips, expectedTransitionMs) => {
      const { record, dependencies, write, readSaved } = setup()
      const preimage = structuredClone(record)

      const { planned, outcome } = await gesture(record.id, dependencies, request)

      expect(planned.status).toBe('ready')
      expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' })
      if (planned.status !== 'ready' || planned.submission.owner !== 'clip-temporal') return
      // The pilot's typed intent for the same parameters is the oracle.
      const typed = editShowClipTemporalV2(preimage, planned.submission.intent)
      expect(typed.status).toBe('changed')
      if (typed.status !== 'changed') return
      expect(content(readSaved())).toEqual(content(typed.record))
      expect(write).toHaveBeenCalledTimes(1)
      expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([preimage])
      expect(record).toEqual(preimage)

      const saved = readSaved()
      expect(saved.composition.clips
        .map(clip => [clip.id === planned.selectAfterId ? 'fresh' : clip.id, clip.startMs, clip.startMs + clip.durationMs])
        .sort((left, right) => Number(left[1]) - Number(right[1])))
        .toEqual(expectedClips)
      expect(saved.composition.transitions.map(transition => transition.durationMs)).toEqual([expectedTransitionMs])
    },
  )

  it('duplicates a Clip linked, equal to the typed sharing intent and minting no runtime', async () => {
    const { record, dependencies, write, readSaved } = setup()
    const preimage = structuredClone(record)

    const { planned, outcome } = await gesture(record.id, dependencies, {
      kind: 'duplicate', clipId: 'out', startMs: 2_000, zoneId: 'zone', layerId: 'layer:zone:main',
    })

    expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' })
    if (planned.status !== 'ready' || planned.submission.owner !== 'clip-sharing') return
    const typed = editShowClipV2(preimage, planned.submission.intent)
    expect(typed.status).toBe('changed')
    if (typed.status !== 'changed') return
    expect(content(readSaved())).toEqual(content(typed.record))
    expect(write).toHaveBeenCalledTimes(1)
    expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
    expect(readSaved().composition.patternInstances).toEqual(preimage.composition.patternInstances)
    expect(readSaved().composition.clips.find(clip => clip.id === planned.selectAfterId))
      .toMatchObject({ instanceId: 'out-instance', startMs: 2_000, durationMs: 400 })
  })

  it('deletes a Clip with its Transition, equal to the typed delete intent', async () => {
    const { record, dependencies, write, readSaved } = setup()
    const preimage = structuredClone(record)

    const { planned, outcome } = await gesture(record.id, dependencies, { kind: 'delete', clipId: 'in' })

    expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' })
    if (planned.status !== 'ready' || planned.submission.owner !== 'clip-delete') return
    const typed = editShowTransitionV2(preimage, planned.submission.intent)
    expect(typed.status).toBe('changed')
    if (typed.status !== 'changed') return
    expect(content(readSaved())).toEqual(content(typed.record))
    expect(write).toHaveBeenCalledTimes(1)
    expect(readSaved().composition.transitions).toEqual([])
    expect(readSaved().composition.clips.map(clip => clip.id)).toEqual(['out'])
  })

  it('translates the whole Crossfade chain rigidly when one member is dragged', async () => {
    const { record, dependencies, readSaved } = setup()

    const { outcome } = await gesture(record.id, dependencies, {
      kind: 'move', clipId: 'in', startMs: 1_600, zoneId: 'zone', layerId: 'layer:zone:main',
    })

    expect(outcome).toMatchObject({ status: 'applied' })
    // Both members move by the same delta and the Transition keeps its duration.
    expect(readSaved().composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs]))
      .toEqual([['out', 1_000, 400], ['in', 1_600, 400]])
    expect(readSaved().composition.transitions[0]).toMatchObject({ id: 'transition-crossfade', durationMs: 200 })
    expect(readSaved().composition.clips.find(clip => clip.id === 'out')!.appearance.keys[0].timeMs).toBe(1_000)
  })

  it('surfaces an owner refusal with zero writes and an unchanged record', async () => {
    const { record, dependencies, write } = setup()
    const preimage = structuredClone(record)

    const { outcome } = await gesture(record.id, dependencies, { kind: 'resize-trailing', clipId: 'in', endMs: 9_000 })

    expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-intent' })
    expect(write).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
    expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
    expect(record).toEqual(preimage)
    for (const [name, value] of Object.entries(outcome ?? {})) {
      if (name.startsWith('affected') || name.startsWith('removed')) expect(value).toEqual([])
    }
  })

  it('refuses an impossible gesture in the adapter, before the admission is ever called', async () => {
    const { record, dependencies, write } = setup()

    const { planned, outcome } = await gesture(record.id, dependencies, { kind: 'split', clipId: 'out', atMs: 400 })

    expect(planned).toMatchObject({ status: 'refused' })
    expect(outcome).toBeNull()
    expect(write).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
  })

  it('restores the exact records through Undo and Redo after a gesture', async () => {
    const { record, dependencies } = setup()
    const preimage = structuredClone(record)

    await gesture(record.id, dependencies, {
      kind: 'move', clipId: 'out', startMs: 200, zoneId: 'zone', layerId: 'layer:zone:main',
    })
    const edited = structuredClone(useShowStore.getState().showV2Pilots[record.id])

    expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
    expect(content(useShowStore.getState().showV2Pilots[record.id])).toEqual(content(preimage))
    expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
    expect(content(useShowStore.getState().showV2Pilots[record.id])).toEqual(content(edited))
  })

  it('DELETE-READD: a replacement Clip draws a Cut only at exact adjacency', async () => {
    const { record, dependencies, readSaved } = setup()

    expect((await gesture(record.id, dependencies, { kind: 'delete', clipId: 'in' })).outcome)
      .toMatchObject({ status: 'applied' })
    const outgoing = readSaved().composition.clips.find(clip => clip.id === 'out')!
    expect([outgoing.startMs, outgoing.durationMs, readSaved().composition.showEndMs]).toEqual([0, 400, 4_000])

    const readd = async (startMs: number, clipId: string): Promise<ShowRecordV2> => {
      const active = context(record.id, dependencies)
      const intent: CreateShowClipIntentV2 = {
        kind: 'create-clip',
        patternReference: { kind: 'stock', id: 'CometLoom' },
        clip: {
          id: clipId, zoneId: 'zone', layerId: 'layer:zone:main', startMs, durationMs: 400,
          entryPolicy: 'continue', zoneSampleMode: 'span',
          appearance: {
            keys: [{
              id: `${clipId}:key`, timeMs: startMs,
              value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
            }],
          },
        },
        runtime: { kind: 'existing', instanceId: 'in-instance' },
      }
      expect(await admitShowV2PilotCreateClip({ ...active, intent })).toMatchObject({ status: 'applied' })
      return readSaved()
    }

    // A replacement one millisecond past the boundary is blank time, not a Cut.
    const gapped = projectShowTimelineV2(await readd(401, 'gapped'))
    const gappedLayer = gapped.rows[0].layers.find(layer => layer.id === 'layer:zone:main')!
    expect(gappedLayer.junctions).toEqual([])
    expect(gapped.transitions).toEqual([])

    expect((await gesture(record.id, dependencies, { kind: 'delete', clipId: 'gapped' })).outcome)
      .toMatchObject({ status: 'applied' })

    const exact = projectShowTimelineV2(await readd(400, 'exact'))
    const exactLayer = exact.rows[0].layers.find(layer => layer.id === 'layer:zone:main')!
    expect(exactLayer.junctions.map(junction => [junction.scope, junction.startMs, junction.transitionId]))
      .toEqual([['derived-cut', 400, null]])
    // No removed Crossfade resurrects with the replacement Clip.
    expect(exact.transitions).toEqual([])
    expect(readSaved().composition.transitions).toEqual([])
  })
})
