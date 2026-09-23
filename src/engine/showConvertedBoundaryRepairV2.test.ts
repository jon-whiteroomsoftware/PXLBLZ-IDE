import { describe, expect, it } from 'vitest'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { compileShow } from './showCompiler'
import { buildShowEpeExport } from './showEpeExport'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { deleteShowClipInShow } from './showClipDeletion'
import { layoutOccurrencesBlockedV2 } from './showBoundaryScopeV2'
import { createDefaultShow, projectShowTimeline, removeShowBoundaryTransition, showLoopDurationMs, showRecordToCompileRecipe, updateShowBoundaryTransition } from './showModel'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import { resizeShowConnectedClipInShowAtGlobalTime } from './showLayerTransitionAuthoring'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { duplicateShowLayoutInterval, projectShowLayoutIntervals } from './showLayoutIntervals'
import { planShowV2LayoutEdit } from './showV2LayoutEditorModel'
import { createShowGroupFromSelectionV2 } from './showGroupCreationV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { editShowClipTemporalV2 } from './showClipTemporalV2'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { convertedBoundaryRepairSpecV2, editShowTransitionV2 } from './showTransitionsV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'

const LEFT = 'placement-cell-1-scene-1'
const RIGHT = 'placement-cell-2-scene-2'
const BOUNDARY = 'transition-scene-1'

function convertedDefaultShow(): ShowRecordV2 {
  const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
  const byCellId = Object.fromEntries(
    source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]),
  )
  const converted = convertShowRecordV1ToV2(source, { byCellId })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(converted.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
    [LEFT, 0, 30000],
    [RIGHT, 32000, 30000],
  ])
  expect(converted.record.composition.showEndMs).toBe(62000)
  return converted.record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

function v1ProjectedDefaultShow() {
  const show = createDefaultShow('show-boundary-resize', 'Boundary resize', 1000)
  const composition = {
    ...projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, 'export function render(index) { rgb(1, 0, 0) }'])),
      stageDimension: 1,
    }),
    executionModel: 'deterministic-loop' as const,
  }
  return { show, composition }
}

const probeSource = 'export var calls = 0; export var elapsed = 0; export var randomValue = 0; export function beforeRender(delta) { calls++; elapsed += delta; randomValue = random(1) } export function render2D(index, x, y) { rgb(elapsed / 2000, randomValue, 0) }'

function playback(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepareShowV2ForCompile(
    reopen(record),
    {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(
        record.composition.patternInstances.map(instance => [instance.id, probeSource]),
      ),
      stageDimension: 2,
    },
    { libraries: LIBRARIES },
  )
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const reopened = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'boundary-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
  expect(reopened.stamp?.kind).toBe('show')
  if (reopened.stamp?.kind !== 'show') throw new Error('EPE reopen refused')
  return {
    artifact,
    runtime: createFastReplayRuntime(
      { ...artifact, code: reopened.src, dimension: 2 },
      { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] },
    ),
  }
}

describe('converted Scene-boundary repair on Clip-edge resize (gap 1)', () => {
  it('trims a converted-boundary Clip edge into a cut with reclaimed Show End in one edit', () => {
    const source = convertedDefaultShow()
    const before = structuredClone(source)
    const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(source).toEqual(before)
    const next = reopen(result.record)
    expect(next.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 34000, 26000],
    ])
    expect(next.composition.transitions).toEqual([])
    expect(next.composition.showEndMs).toBe(60000)
    expect(next.composition.layoutOccurrences).toEqual([
      expect.objectContaining({ startMs: 0, durationMs: 60000 }),
    ])
    expect(next.composition.clips.find(clip => clip.id === RIGHT)?.appearance.keys.map(key => key.timeMs)).toEqual([34000])
    expect(result.affectedClipIds).toEqual([RIGHT])
    expect(result.affectedTransitionIds).toEqual([BOUNDARY])
    expect(result.removedIds).toEqual([BOUNDARY])
    expect(result.affectedLayoutOccurrenceIds).toEqual(next.composition.layoutOccurrences.map(occurrence => occurrence.id))
    expect(validateShowRecordV2(next)).toEqual([])
  })

  it('matches v1 exact resize result: requested scene-local offset, cut, shortened loop', () => {
    const { show, composition } = v1ProjectedDefaultShow()
    const resized = resizeShowConnectedClipInShowAtGlobalTime(show, composition, {
      owner: { kind: 'main', sceneId: show.scenes[1].id, zoneId: show.zones[0].id, placementId: RIGHT },
      globalStartMs: 36000,
      durationMs: 26000,
    })
    expect(resized).not.toBe(show)
    expect(resized.transitions).toEqual([expect.objectContaining({ id: BOUNDARY, kind: 'cut', durationMs: 0 })])
    expect(showLoopDurationMs(resized)).toBe(60000)
    const unified = projectShowUnifiedTimeline(resized, resized.composition!)
    expect(unified.zones[0].layers.find(layer => layer.kind === 'main')?.clips.map(clip => [clip.id, clip.startMs, clip.endMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 34000, 60000],
    ])

    const repaired = editShowClipTemporalV2(convertedDefaultShow(), { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(repaired.status).toBe('changed')
    if (repaired.status !== 'changed') return
    expect(repaired.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.startMs + clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 34000, 60000],
    ])
    expect(repaired.record.composition.transitions).toEqual([])
    expect(repaired.record.composition.showEndMs).toBe(showLoopDurationMs(resized))
  })

  it('repairs a trailing converted-boundary edge the same way', () => {
    const source = convertedDefaultShow()
    const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: LEFT, startMs: 0, endMs: 25000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 25000],
      [RIGHT, 30000, 30000],
    ])
    expect(next.composition.transitions).toEqual([])
    expect(next.composition.showEndMs).toBe(60000)
    expect(validateShowRecordV2(next)).toEqual([])
  })

  it('refuses to extend into a converted boundary instead of growing it', () => {
    const leading = convertedDefaultShow()
    const extendLeading = editShowClipTemporalV2(leading, { kind: 'extend', clipId: RIGHT, startMs: 31000, endMs: 62000 })
    expect(extendLeading.status).toBe('refused')
    if (extendLeading.status !== 'refused') return
    expect(extendLeading.code).toBe('invalid-topology')
    expect(extendLeading.record).toBe(leading)

    const trailing = convertedDefaultShow()
    const extendTrailing = editShowClipTemporalV2(trailing, { kind: 'extend', clipId: LEFT, startMs: 0, endMs: 31000 })
    expect(extendTrailing.status).toBe('refused')
    if (extendTrailing.status !== 'refused') return
    expect(extendTrailing.code).toBe('invalid-topology')
    expect(extendTrailing.record).toBe(trailing)
  })

  it('keeps converted-layer and native junctions growing instead of repairing', () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const layer = converted.record
    const layerResult = editShowClipTemporalV2(layer, { kind: 'trim', clipId: 'in', startMs: 650, endMs: 1000 })
    expect(layerResult.status).toBe('changed')
    if (layerResult.status !== 'changed') return
    expect(layerResult.record.composition.clips.find(clip => clip.id === 'in')).toMatchObject({ startMs: 650, durationMs: 350 })
    expect(layerResult.record.composition.transitions).toEqual([
      expect.objectContaining({ id: 'transition-crossfade', durationMs: 250, origin: 'converted-layer-transition' }),
    ])
    expect(layerResult.record.composition.showEndMs).toBe(1000)

    const native = structuredClone(layer)
    for (const transition of native.composition.transitions) delete transition.origin
    const nativeResult = editShowClipTemporalV2(native, { kind: 'trim', clipId: 'in', startMs: 650, endMs: 1000 })
    expect(nativeResult.status).toBe('changed')
    if (nativeResult.status !== 'changed') return
    expect(nativeResult.record.composition.transitions).toEqual([
      expect.objectContaining({ id: 'transition-crossfade', durationMs: 250 }),
    ])
    expect(nativeResult.record.composition.transitions[0].origin).toBeUndefined()
    expect(nativeResult.record.composition.showEndMs).toBe(1000)
  })

  it('does not repair where the converted junction survives', () => {
    const trailing = convertedDefaultShow()
    const farTrailing = editShowClipTemporalV2(trailing, { kind: 'trim', clipId: RIGHT, startMs: 32000, endMs: 60000 })
    expect(farTrailing.status).toBe('changed')
    if (farTrailing.status !== 'changed') return
    expect(farTrailing.record.composition.clips.find(clip => clip.id === RIGHT)).toMatchObject({ startMs: 32000, durationMs: 28000 })
    expect(farTrailing.record.composition.transitions).toEqual([
      expect.objectContaining({ id: BOUNDARY, durationMs: 2000 }),
    ])
    expect(farTrailing.record.composition.showEndMs).toBe(62000)

    const leading = convertedDefaultShow()
    const farLeading = editShowClipTemporalV2(leading, { kind: 'trim', clipId: LEFT, startMs: 5000, endMs: 30000 })
    expect(farLeading.status).toBe('changed')
    if (farLeading.status !== 'changed') return
    expect(farLeading.record.composition.transitions).toEqual([
      expect.objectContaining({ id: BOUNDARY, durationMs: 2000 }),
    ])
    expect(farLeading.record.composition.showEndMs).toBe(62000)
  })

  it('repairs a converted boundary carrying a Clip value ramp', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    const incoming = source.composition.clips.find(clip => clip.id === RIGHT)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)
    const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual([])
    expect(source).toEqual(before)
  })

  it('proportionally retimes a retained converted boundary Clip value ramp', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2, durationMs: 400,
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    const result = editShowTransitionV2(source, { kind: 'resize-transition', transitionId: BOUNDARY, durationMs: 1000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions[0].propertyRamps[0].durationMs).toBe(200)
    expect(validateShowRecordV2(result.record)).toEqual([])
  })
})

describe('converted Scene-boundary repair through the Transition owner', () => {
  it('admits a converted carrier for retiming while clip-edge repair still classifies it as a ramp carrier', () => {
    const source = convertedDefaultShow()
    const transition = source.composition.transitions[0]
    transition.propertyRamps = [{
      participantId: transition.participants[0].id,
      target: { kind: 'clip-opacity', clipId: RIGHT }, from: 0.4, durationMs: 800,
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    expect(convertedBoundaryRepairSpecV2(source, BOUNDARY)).toEqual({ status: 'ramp-carrier', transitionId: BOUNDARY })
    expect(convertedBoundaryRepairSpecV2(source, BOUNDARY, { retimeRampCarrier: true })).toEqual({
      status: 'ready',
      repair: {
        transitionId: BOUNDARY,
        fromClipIds: [LEFT], toClipIds: [RIGHT],
        windowStartMs: 30000, windowEndMs: 32000, durationMs: 2000,
      },
    })
  })

  it('routes resize-leading through the same cut and reclaim', () => {
    const result = editShowTransitionV2(convertedDefaultShow(), { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 34000, 26000],
    ])
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.showEndMs).toBe(60000)
    expect(result.removedIds).toEqual([BOUNDARY])
  })

  it('routes resize-trailing through the same cut and reclaim', () => {
    const result = editShowTransitionV2(convertedDefaultShow(), { kind: 'resize-trailing', clipId: LEFT, endMs: 25000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 25000],
      [RIGHT, 30000, 30000],
    ])
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.showEndMs).toBe(60000)
  })

  it('refuses connected extension into a converted boundary on both owners', () => {
    const leading = editShowTransitionV2(convertedDefaultShow(), { kind: 'resize-leading', clipId: RIGHT, startMs: 31000 })
    expect(leading.status).toBe('refused')
    const trailing = editShowTransitionV2(convertedDefaultShow(), { kind: 'resize-trailing', clipId: LEFT, endMs: 31000 })
    expect(trailing.status).toBe('refused')
  })

  it('reclaims a converted boundary with Clip value ramps on either connected resize', () => {
    const rampCarrier = (): ShowRecordV2 => {
      const source = convertedDefaultShow()
      const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
      const incoming = source.composition.clips.find(clip => clip.id === RIGHT)!
      carrier.propertyRamps = [{
        participantId: carrier.participants[0].id,
        target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
        from: 0.2,
        easing: { curve: 'quadratic', direction: 'in' },
      }]
      expect(validateShowRecordV2(source)).toEqual([])
      return source
    }
    const leadingSource = rampCarrier()
    const leadingBefore = structuredClone(leadingSource)
    const leading = editShowTransitionV2(leadingSource, { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 })
    expect(leading.status).toBe('changed')
    if (leading.status !== 'changed') return
    expect(leading.record.composition.transitions).toEqual([])
    expect(leadingSource).toEqual(leadingBefore)

    const trailingSource = rampCarrier()
    const trailingBefore = structuredClone(trailingSource)
    const trailing = editShowTransitionV2(trailingSource, { kind: 'resize-trailing', clipId: LEFT, endMs: 25000 })
    expect(trailing.status).toBe('changed')
    if (trailing.status !== 'changed') return
    expect(trailing.record.composition.transitions).toEqual([])
    expect(trailingSource).toEqual(trailingBefore)
  })

  it('reclaims Show End on reset-to-cut for a converted boundary and keeps it for native ones', () => {
    const repaired = editShowTransitionV2(convertedDefaultShow(), { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(repaired.status).toBe('changed')
    if (repaired.status !== 'changed') return
    expect(repaired.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 30000, 30000],
    ])
    expect(repaired.record.composition.transitions).toEqual([])
    expect(repaired.record.composition.showEndMs).toBe(60000)
    expect(repaired.record.composition.layoutOccurrences).toEqual([
      expect.objectContaining({ startMs: 0, durationMs: 60000 }),
    ])

    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const kept = editShowTransitionV2(converted.record, { kind: 'reset-to-cut', transitionId: 'transition-crossfade' })
    expect(kept.status).toBe('changed')
    if (kept.status !== 'changed') return
    expect(kept.record.composition.transitions).toEqual([])
    expect(kept.record.composition.showEndMs).toBe(converted.record.composition.showEndMs)
  })
})

describe('converted Scene-boundary repair on Clip delete (gap 7)', () => {
  it('deletes either boundary Clip preserving survivor time and Show End', () => {
    const left = convertedDefaultShow()
    const deleteLeft = editShowTransitionV2(left, { kind: 'delete-clip', clipId: LEFT })
    expect(deleteLeft.status).toBe('changed')
    if (deleteLeft.status !== 'changed') return
    expect(deleteLeft.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([[RIGHT, 32000, 30000]])
    expect(deleteLeft.record.composition.transitions).toEqual([])
    expect(deleteLeft.record.composition.showEndMs).toBe(62000)
    expect(deleteLeft.removedIds).toEqual(expect.arrayContaining([LEFT, BOUNDARY]))

    const right = convertedDefaultShow()
    const deleteRight = editShowTransitionV2(right, { kind: 'delete-clip', clipId: RIGHT })
    expect(deleteRight.status).toBe('changed')
    if (deleteRight.status !== 'changed') return
    expect(deleteRight.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([[LEFT, 0, 30000]])
    expect(deleteRight.record.composition.transitions).toEqual([])
    expect(deleteRight.record.composition.showEndMs).toBe(62000)
    expect(validateShowRecordV2(reopen(deleteRight.record))).toEqual([])
  })

  it('resets a converted Clip value carrier without projection and reclaims Show End', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    const result = editShowTransitionV2(source, { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 30000, 30000],
    ])
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.showEndMs).toBe(60000)
    expect(result.record.composition.propertyTracks).toEqual([])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })

  it('drops a Clip value ramp on reset without projecting its activation', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const result = editShowTransitionV2(source, { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.propertyTracks).toEqual([])
  })

  it('drops a Clip value ramp on incoming Clip delete, preserving survivor time', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const result = editShowTransitionV2(source, { kind: 'delete-clip', clipId: RIGHT })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([[LEFT, 0, 30000]])
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.showEndMs).toBe(62000)
    expect(result.record.composition.propertyTracks).toEqual([])
    expect(result.removedIds).toEqual(expect.arrayContaining([RIGHT, BOUNDARY]))
    expect(result.affectedTrackIds).toEqual([])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })

  it('deletes an incoming Clip and its Clip value ramp without a projection plan', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const result = editShowTransitionV2(source, { kind: 'delete-clip', clipId: RIGHT })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual([])
  })
})

describe('converted-boundary reclaim across Layout occurrences (#1068)', () => {
  function splitLayout(record: ShowRecordV2, atMs: number, occurrenceId: string): ShowRecordV2 {
    const owner = record.composition.layoutOccurrences.find(occurrence => (
      occurrence.startMs <= atMs && atMs < occurrence.startMs + occurrence.durationMs
    ))
    if (!owner) throw new Error('No owning Layout occurrence.')
    const split = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId, atMs, layoutId: owner.layoutId,
    })
    expect(split.status).toBe('changed')
    if (split.status !== 'changed') throw new Error(JSON.stringify(split))
    return reopen(split.record)
  }

  it('shortens the occurrence that owns the reclaimed window and shifts later ones earlier', () => {
    const source = convertedDefaultShow()
    const ownerId = source.composition.layoutOccurrences[0].id
    const record = splitLayout(source, 40000, 'occ-second')
    expect(record.composition.layoutOccurrences.map(occurrence => [occurrence.id, occurrence.startMs, occurrence.durationMs])).toEqual([
      [ownerId, 0, 40000],
      ['occ-second', 40000, 22000],
    ])
    const result = editShowTransitionV2(record, { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 34000, 26000],
    ])
    expect(next.composition.showEndMs).toBe(60000)
    expect(next.composition.layoutOccurrences.map(occurrence => [occurrence.id, occurrence.startMs, occurrence.durationMs])).toEqual([
      [ownerId, 0, 38000],
      ['occ-second', 38000, 22000],
    ])
    expect(validateShowRecordV2(next)).toEqual([])
  })

  it('refuses when the owning occurrence cannot absorb the reclaim', () => {
    const source = convertedDefaultShow()
    const ownerId = source.composition.layoutOccurrences[0].id
    const once = splitLayout(source, 30000, 'occ-window')
    const record = splitLayout(once, 32000, 'occ-tail')
    expect(record.composition.layoutOccurrences.map(occurrence => [occurrence.id, occurrence.startMs, occurrence.durationMs])).toEqual([
      [ownerId, 0, 30000],
      ['occ-window', 30000, 2000],
      ['occ-tail', 32000, 30000],
    ])
    const result = editShowTransitionV2(record, { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.record).toBe(record)
  })
})

describe('converted boundary repair playback inertness', () => {
  it.each(['fast', 'fidelity'] as const)('compiles a repaired resize exactly like independently authored choreography in %s', fidelity => {
    const repaired = editShowClipTemporalV2(convertedDefaultShow(), { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(repaired.status).toBe('changed')
    if (repaired.status !== 'changed') return
    const expected = structuredClone(convertedDefaultShow())
    const right = expected.composition.clips.find(clip => clip.id === RIGHT)!
    right.startMs = 34000
    right.durationMs = 26000
    right.appearance.keys.forEach(key => { key.timeMs += 2000 })
    expected.composition.transitions = []
    expected.composition.showEndMs = 60000
    expected.composition.layoutOccurrences = [
      { id: 'layout-occurrence:1', layoutId: 'layout-1', startMs: 0, durationMs: 60000, parameters: {} },
    ]
    const actual = playback(repaired.record, fidelity)
    const oracle = playback(expected, fidelity)
    expect(actual.artifact.code).toBe(oracle.artifact.code)
    for (const timeMs of [0, 29999, 30000, 33999, 34000, 40000, 59999]) {
      const a = actual.runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = oracle.runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(Array.from(a.frame), `frame@${timeMs}`).toEqual(Array.from(b.frame))
      expect(a.exports, `state@${timeMs}`).toEqual(b.exports)
    }
  })

  it('renders a repaired resize with the same frames as the v1 repair', () => {
    const { show, composition } = v1ProjectedDefaultShow()
    const v1 = resizeShowConnectedClipInShowAtGlobalTime(show, composition, {
      owner: { kind: 'main', sceneId: show.scenes[1].id, zoneId: show.zones[0].id, placementId: RIGHT },
      globalStartMs: 36000,
      durationMs: 26000,
    }) as unknown as ReturnType<typeof createDefaultShow>
    const byCellId = Object.fromEntries(v1.cells.map(cell => [cell.id, probeSource]))
    const byPatternInstanceId: Record<string, string> = {}
    for (const instance of v1.composition?.patternInstances ?? []) byPatternInstanceId[instance.id] = probeSource
    const v1artifact = compileShow(showRecordToCompileRecipe(v1, { byCellId, byPatternInstanceId }), LIBRARIES)
    const repaired = editShowClipTemporalV2(convertedDefaultShow(), { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(repaired.status).toBe('changed')
    if (repaired.status !== 'changed') return
    const v2 = playback(repaired.record, 'fast')
    const reopened = parseEpe(buildShowEpeExport(createDefaultShow('v1-stamp', 'V1 stamp', 1), v1artifact.code, { id: 'v1-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
    expect(reopened.stamp?.kind).toBe('show')
    if (reopened.stamp?.kind !== 'show') return
    const v1runtime = createFastReplayRuntime(
      { ...v1artifact, code: reopened.src, dimension: 2 },
      { fidelity: 'fast', randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] },
    )
    for (const timeMs of [0, 29999, 30000, 33999, 34000, 40000, 59999]) {
      const a = v1runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = v2.runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(Array.from(a.frame), `frame@${timeMs}`).toEqual(Array.from(b.frame))
    }
  })

  it('renders a repaired delete with the same frames as the v1 repair', () => {
    const { show, composition } = v1ProjectedDefaultShow()
    const deleted = deleteShowClipInShowV1(show, composition, RIGHT)
    const byCellId = Object.fromEntries(deleted.cells.map(cell => [cell.id, probeSource]))
    const byPatternInstanceId: Record<string, string> = {}
    for (const instance of deleted.composition?.patternInstances ?? []) byPatternInstanceId[instance.id] = probeSource
    const v1artifact = compileShow(showRecordToCompileRecipe(deleted, { byCellId, byPatternInstanceId }), LIBRARIES)
    const removed = editShowTransitionV2(convertedDefaultShow(), { kind: 'delete-clip', clipId: RIGHT })
    expect(removed.status).toBe('changed')
    if (removed.status !== 'changed') return
    const v2 = playback(removed.record, 'fast')
    const reopened = parseEpe(buildShowEpeExport(createDefaultShow('v1-stamp', 'V1 stamp', 1), v1artifact.code, { id: 'v1-delete-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
    expect(reopened.stamp?.kind).toBe('show')
    if (reopened.stamp?.kind !== 'show') return
    const v1runtime = createFastReplayRuntime(
      { ...v1artifact, code: reopened.src, dimension: 2 },
      { fidelity: 'fast', randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] },
    )
    for (const timeMs of [0, 29999, 30000, 32000, 40000, 61999]) {
      const a = v1runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = v2.runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(Array.from(a.frame), `frame@${timeMs}`).toEqual(Array.from(b.frame))
    }
  })
})

function deleteShowClipInShowV1(
  show: ReturnType<typeof createDefaultShow>,
  composition: ReturnType<typeof v1ProjectedDefaultShow>['composition'],
  placementId: string,
) {
  const zoneId = show.zones[0].id
  const sceneId = placementId.includes('scene-1') ? show.scenes[0].id : show.scenes[1].id
  const outcome = deleteShowClipInShow(show, composition, { kind: 'main', sceneId, zoneId, placementId })
  if (outcome.status !== 'applied') throw new Error(`v1 delete refused: ${outcome.status}`)
  return outcome.record
}
describe('converted Scene-boundary repair moves every Show-time anchor (#1068 P1s)', () => {
  const OVERLAY = 'overlay-probe'
  const LAYOUT_B = 'layout-occurrence:probe-b'
  const GROUP_AFTER = 'group-after'

  function probeClip(donor: ShowRecordV2['composition']['clips'][number], id: string, startMs: number, durationMs: number) {
    return {
      ...structuredClone(donor),
      id,
      layerId: OVERLAY,
      startMs,
      durationMs,
      appearance: {
        keys: [{ ...structuredClone(donor.appearance.keys[0]), id: `${id}-key`, timeMs: startMs }],
      },
    }
  }

  function groupIntent(record: ShowRecordV2, clipId: string, definitionId: string, occurrenceId: string) {
    const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
    const local = (id: string): string => `local-${occurrenceId}-${id}`
    const map = (ids: string[]): Record<string, string> => Object.fromEntries(ids.map(id => [id, local(id)]))
    return {
      kind: 'create-group' as const,
      selectedClipIds: [clipId],
      transitionIds: [] as string[],
      definitionId,
      occurrenceId,
      name: occurrenceId,
      originMs: clip.startMs,
      identities: {
        patternInstanceIds: map([clip.instanceId]),
        layerIds: map([clip.layerId]),
        clipIds: map([clipId]),
        transitionIds: {},
        propertyTrackIds: {},
        appearanceKeyIdsByClipId: { [clipId]: map(clip.appearance.keys.map(key => key.id)) },
        propertyKeyIdsByTrackId: {},
      },
    }
  }

  function groupOne(record: ShowRecordV2, clipId: string, definitionId: string, occurrenceId: string): ShowRecordV2 {
    const result = createShowGroupFromSelectionV2(record, groupIntent(record, clipId, definitionId, occurrenceId))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') throw new Error('Group setup refused')
    return result.record
  }

  /**
   * Converted default plus an authored guide, Layouts split exactly at the
   * reclaim boundary, and one real Group after the window carrying a
   * converter-shaped track activation. A Group starting exactly at the window
   * end is unrepresentable while the boundary lives: RL09 forbids unrelated
   * content starting at or inside a Layer Transition window, so only the
   * converted scene label and the later Layout occurrence cover the
   * boundary-exact case.
   */
  function convertedAnchoredShow(): ShowRecordV2 {
    let record = convertedDefaultShow()
    record.composition.markers.push({ id: 'guide-after', timeMs: 40000, name: 'After' })
    const split = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId: LAYOUT_B, atMs: 32000, layoutId: record.zoneLayouts[0].id,
    })
    expect(split.status, JSON.stringify(split)).toBe('changed')
    if (split.status !== 'changed') throw new Error('Layout setup refused')
    record = split.record
    record.composition.propertyTracks.push({
      id: 'layout-track-b',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: LAYOUT_B },
      activeStartMs: 42000,
      activeDurationMs: 4000,
      keyframes: [
        { id: 'layout-track-b-start', timeMs: 42000, value: 0.2, easing: { curve: 'linear' } },
        { id: 'layout-track-b-end', timeMs: 46000, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
    const zoneId = record.zones[0].id
    record.composition.layers.push({ id: OVERLAY, zoneId, name: 'Probe', rank: 1 })
    const donor = record.composition.clips.find(clip => clip.id === RIGHT)!
    record.composition.clips.push(probeClip(donor, 'probe-after', 40000, 6000))
    expect(validateShowRecordV2(record), 'probe clip validates').toEqual([])
    record = groupOne(record, 'probe-after', 'def-after', GROUP_AFTER)
    const after = record.composition.groupOccurrences.find(occurrence => occurrence.id === GROUP_AFTER)!
    after.trackActivation = { startMs: after.startMs, durationMs: 6000 }
    expect(validateShowRecordV2(record), 'grouped fixture validates').toEqual([])
    return record
  }

  /** One real Group whose materialized content spans the reclaimed window end. */
  function convertedSpanningGroupShow(): ShowRecordV2 {
    let record = convertedDefaultShow()
    const zoneId = record.zones[0].id
    record.composition.layers.push({ id: OVERLAY, zoneId, name: 'Probe', rank: 1 })
    const donor = record.composition.clips.find(clip => clip.id === RIGHT)!
    record.composition.clips.push(probeClip(donor, 'probe-span', 28000, 8000))
    expect(validateShowRecordV2(record), 'probe clip validates').toEqual([])
    record = groupOne(record, 'probe-span', 'def-span', 'group-span')
    expect(validateShowRecordV2(record), 'spanning fixture validates').toEqual([])
    return record
  }

  function sceneLabel(record: ShowRecordV2, timeMs: number) {
    const marker = record.composition.markers.find(candidate => candidate.origin === 'converted-scene-label' && candidate.timeMs === timeMs)!
    expect(marker, `converted scene label at ${timeMs}`).toBeDefined()
    return marker
  }

  it('shifts converted scene labels and a later Group on the temporal route and reports every touched occurrence', () => {
    const source = convertedAnchoredShow()
    const before = structuredClone(source)
    const labelId = sceneLabel(source, 32000).id
    const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(source).toEqual(before)
    const next = reopen(result.record)
    expect(next.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 34000, 26000],
    ])
    expect(next.composition.showEndMs).toBe(60000)
    expect(next.composition.markers.map(marker => [marker.id, marker.timeMs])).toContainEqual([labelId, 30000])
    expect(next.composition.markers.find(marker => marker.id === 'guide-after')?.timeMs).toBe(40000)
    expect(next.composition.markers.find(marker => marker.origin === 'converted-scene-label' && marker.timeMs === 0)).toBeDefined()
    const after = next.composition.groupOccurrences.find(occurrence => occurrence.id === GROUP_AFTER)!
    expect(after.startMs).toBe(38000)
    expect(after.trackActivation).toMatchObject({ startMs: 38000, durationMs: 6000 })
    expect(after.layoutOccurrenceId).toBe(LAYOUT_B)
    expect(next.composition.layoutOccurrences.map(occurrence => [occurrence.id, occurrence.startMs, occurrence.durationMs])).toEqual([
      ['layout-occurrence:1', 0, 30000],
      [LAYOUT_B, 30000, 30000],
    ])
    const effective = materializeShowGroupsV2(next).composition.clips
    expect(effective.find(clip => clip.id === `${GROUP_AFTER}:local-${GROUP_AFTER}-probe-after`)?.startMs).toBe(38000)
    const layoutTrack = next.composition.propertyTracks.find(track => track.id === 'layout-track-b')!
    expect(layoutTrack.activeStartMs).toBe(40000)
    expect(layoutTrack.keyframes.map(key => key.timeMs)).toEqual([40000, 44000])
    expect(result.affectedTrackIds).toContain('layout-track-b')
    expect(result.affectedLayoutOccurrenceIds).toEqual(['layout-occurrence:1', LAYOUT_B])
    expect(result.affectedMarkerIds).toEqual([labelId])
    expect(result.affectedGroupOccurrenceIds).toEqual([GROUP_AFTER])
    expect(validateShowRecordV2(next)).toEqual([])
  })

  it('matches v1 scene starts with converted labels after the same repair', () => {
    const { show, composition } = v1ProjectedDefaultShow()
    const resized = resizeShowConnectedClipInShowAtGlobalTime(show, composition, {
      owner: { kind: 'main', sceneId: show.scenes[1].id, zoneId: show.zones[0].id, placementId: RIGHT },
      globalStartMs: 36000,
      durationMs: 26000,
    })
    const sceneStarts = projectShowTimeline(resized).scenes.map(scene => [scene.sceneId, scene.startMs])
    expect(sceneStarts[1][1]).toBe(30000)
    const repaired = editShowClipTemporalV2(convertedAnchoredShow(), { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(repaired.status).toBe('changed')
    if (repaired.status !== 'changed') return
    const labels = repaired.record.composition.markers
      .filter(marker => marker.origin === 'converted-scene-label')
      .sort((left, right) => left.timeMs - right.timeMs)
    expect(labels.map(marker => marker.timeMs)).toEqual(sceneStarts.map(([, startMs]) => startMs))
  })

  it('moves the minted Scene label with a reclaim and leaves a coinciding authored Marker at its authored time', () => {
    const source = convertedDefaultShow()
    const labelId = sceneLabel(source, 32000).id
    source.composition.markers.push({ id: 'authored-scene-2', timeMs: 32000, name: 'Scene 2', color: '#f97316' })
    expect(validateShowRecordV2(source)).toEqual([])
    const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.markers.map(marker => [marker.id, marker.timeMs])).toContainEqual([labelId, 30000])
    expect(next.composition.markers.find(marker => marker.id === 'authored-scene-2')).toEqual(
      { id: 'authored-scene-2', timeMs: 32000, name: 'Scene 2', color: '#f97316' },
    )
    expect(result.affectedMarkerIds).toEqual([labelId])
    expect(validateShowRecordV2(next)).toEqual([])
  })

  it('shifts the same anchors through the connected route and reports them there', () => {
    const source = convertedAnchoredShow()
    const labelId = sceneLabel(source, 32000).id
    const result = editShowTransitionV2(source, { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 34000, 26000],
    ])
    expect(result.record.composition.markers.map(marker => [marker.id, marker.timeMs])).toContainEqual([labelId, 30000])
    expect(result.record.composition.markers.find(marker => marker.id === 'guide-after')?.timeMs).toBe(40000)
    expect(result.record.composition.groupOccurrences.map(occurrence => [occurrence.id, occurrence.startMs])).toContainEqual([GROUP_AFTER, 38000])
    expect(result.record.composition.groupOccurrences.find(occurrence => occurrence.id === GROUP_AFTER)?.trackActivation).toMatchObject({ startMs: 38000, durationMs: 6000 })
    expect(result.affectedLayoutOccurrenceIds).toEqual(['layout-occurrence:1', LAYOUT_B])
    expect(result.affectedMarkerIds).toEqual([labelId])
    expect(result.affectedGroupOccurrenceIds).toEqual([GROUP_AFTER])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })

  it('reclaims the same anchors on reset-to-cut through the connected route', () => {
    const source = convertedAnchoredShow()
    const labelId = sceneLabel(source, 32000).id
    const result = editShowTransitionV2(source, { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 30000, 30000],
    ])
    expect(result.record.composition.showEndMs).toBe(60000)
    expect(result.record.composition.markers.map(marker => [marker.id, marker.timeMs])).toContainEqual([labelId, 30000])
    expect(result.record.composition.groupOccurrences.map(occurrence => [occurrence.id, occurrence.startMs])).toContainEqual([GROUP_AFTER, 38000])
    expect(result.affectedLayoutOccurrenceIds).toEqual(['layout-occurrence:1', LAYOUT_B])
    expect(result.affectedMarkerIds).toEqual([labelId])
    expect(result.affectedGroupOccurrenceIds).toEqual([GROUP_AFTER])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })

  it('refuses the repair on every route when a Group occurrence spans the reclaimed window end', () => {
    const runs: Array<(source: ShowRecordV2) => ReturnType<typeof editShowClipTemporalV2> | ReturnType<typeof editShowTransitionV2>> = [
      (source) => editShowClipTemporalV2(source, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 }),
      (source) => editShowTransitionV2(source, { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 }),
      (source) => editShowTransitionV2(source, { kind: 'reset-to-cut', transitionId: BOUNDARY }),
    ]
    for (const run of runs) {
      const source = convertedSpanningGroupShow()
      const attempt = run(source)
      expect(attempt.status).toBe('refused')
      if (attempt.status !== 'refused') continue
      expect(attempt.message).toMatch(/Group occurrence "group-span" spans the reclaimed boundary window/)
      expect(attempt.record).toBe(source)
    }
    const source = convertedSpanningGroupShow()
    const before = structuredClone(source)
    const refused = editShowClipTemporalV2(source, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })
    expect(refused.status).toBe('refused')
    expect(source).toEqual(before)
  })
})

describe('converted Scene-boundary repair after whole-output promotion (#1068)', () => {
  function promotedDefaultShow(): ShowRecordV2 {
    const promoted = editShowPropertyV2(convertedDefaultShow(), { kind: 'show' }, {
      kind: 'add-track',
      track: {
        id: 'promotion-track',
        target: { kind: 'clip-view', clipId: LEFT, property: 'brightness' },
        activeStartMs: 0,
        activeDurationMs: 32000,
        keyframes: [
          { id: 'promotion-k0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'promotion-k1', timeMs: 30000, value: 0.4, easing: { curve: 'linear' } },
        ],
      },
    })
    expect(promoted.status).toBe('changed')
    if (promoted.status !== 'changed') throw new Error('promotion-track add did not change the record')
    expect(promoted.record.composition.transitions.map(t => [t.id, t.participants, t.wholeOutput])).toEqual([
      [BOUNDARY, [], { startMs: 30000, fromClipIds: [LEFT], toClipIds: [RIGHT] }],
    ])
    return promoted.record
  }

  function shape(record: ShowRecordV2) {
    return {
      clips: record.composition.clips.map(c => [c.id, c.startMs, c.durationMs]),
      showEndMs: record.composition.showEndMs,
      transitionIds: record.composition.transitions.map(t => t.id),
      occurrences: record.composition.layoutOccurrences.map(o => [o.startMs, o.durationMs]),
    }
  }

  function prepareStatus(record: ShowRecordV2) {
    return prepareShowV2ForCompile(reopen(record), {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(
        record.composition.patternInstances.map(instance => [instance.id, probeSource]),
      ),
      stageDimension: 2,
    }, { libraries: LIBRARIES }).status
  }

  it('classifies the promoted boundary as ready for repair', () => {
    expect(convertedBoundaryRepairSpecV2(promotedDefaultShow(), BOUNDARY)).toEqual({
      status: 'ready',
      repair: {
        transitionId: BOUNDARY,
        fromClipIds: [LEFT],
        toClipIds: [RIGHT],
        windowStartMs: 30000,
        windowEndMs: 32000,
        durationMs: 2000,
      },
    })
  })

  it('keeps grow/shift for a whole-output boundary still carrying ramps', () => {
    const record = promotedDefaultShow()
    record.composition.transitions[0].propertyRamps = [{
      target: { kind: 'show-repeat-scale' },
      from: 2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    expect(convertedBoundaryRepairSpecV2(record, BOUNDARY)).toEqual({ status: 'ignore' })
  })

  type BoundaryEditResult = ReturnType<typeof editShowTransitionV2> | ReturnType<typeof editShowClipTemporalV2>
  const CUT_LEADING = {
    clips: [[LEFT, 0, 30000], [RIGHT, 34000, 26000]],
    showEndMs: 60000,
    transitionIds: [],
    occurrences: [[0, 60000]],
  }
  const CUT_TRAILING = {
    clips: [[LEFT, 0, 26000], [RIGHT, 30000, 30000]],
    showEndMs: 60000,
    transitionIds: [],
    occurrences: [[0, 60000]],
  }
  const rows: Array<[string, (record: ShowRecordV2) => BoundaryEditResult, unknown, unknown]> = [
    ['a leading edge resize', r => editShowTransitionV2(r, { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 }), CUT_LEADING, [[0, 30000, [0, 30000]]]],
    ['a trailing edge resize', r => editShowTransitionV2(r, { kind: 'resize-trailing', clipId: LEFT, endMs: 26000 }), CUT_TRAILING, [[0, 26000, [0, 26000]]]],
    ['Reset to Cut', r => editShowTransitionV2(r, { kind: 'reset-to-cut', transitionId: BOUNDARY }), { clips: [[LEFT, 0, 30000], [RIGHT, 30000, 30000]], showEndMs: 60000, transitionIds: [], occurrences: [[0, 60000]] }, [[0, 30000, [0, 30000]]]],
    ['a boundary Clip delete', r => editShowTransitionV2(r, { kind: 'delete-clip', clipId: RIGHT }), { clips: [[LEFT, 0, 30000]], showEndMs: 62000, transitionIds: [], occurrences: [[0, 62000]] }, [[0, 32000, [0, 30000]]]],
    ['a leading Trim', r => editShowClipTemporalV2(r, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 }), CUT_LEADING, [[0, 30000, [0, 30000]]]],
    ['a trailing Trim', r => editShowClipTemporalV2(r, { kind: 'trim', clipId: LEFT, startMs: 0, endMs: 26000 }), CUT_TRAILING, [[0, 26000, [0, 26000]]]],
  ]
  it.each(rows)('repairs %s on the promoted Show exactly as on the participant-scope Show', (_name, edit, expected, expectedTracks) => {
    const plain = edit(convertedDefaultShow())
    const promoted = edit(promotedDefaultShow())
    expect(plain.status).toBe('changed')
    expect(promoted.status).toBe('changed')
    if (plain.status !== 'changed') throw new Error('participant-scope edit did not change the record')
    if (promoted.status !== 'changed') throw new Error('promoted edit did not change the record')
    expect(shape(promoted.record)).toEqual(expected)
    expect(shape(plain.record)).toEqual(expected)
    expect(promoted.record.composition.propertyTracks.map(t => [t.activeStartMs, t.activeDurationMs, t.keyframes.map(k => k.timeMs)])).toEqual(expectedTracks)
    expect(prepareStatus(promoted.record)).toBe('ready')
  })
})

describe('the repair retimes a Show-scoped repeat-scale track (#1068)', () => {
  function repeatScaleSource() {
    const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
    source.scenes[0].sampleTargets = { repeatScale: 1 }
    source.scenes[1].sampleTargets = { repeatScale: 2 }
    return source
  }

  function convertStock(source: ReturnType<typeof repeatScaleSource>): ShowRecordV2 {
    const converted = convertShowRecordV1ToV2(source, { byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    return converted.record
  }

  function repeatTrack(record: ShowRecordV2) {
    const track = record.composition.propertyTracks.find(t => t.target.kind === 'show-repeat-scale')!
    return [track.activeStartMs, track.activeDurationMs, track.keyframes.map(k => [k.timeMs, k.value])]
  }

  function stockPrepare(record: ShowRecordV2) {
    return prepareShowV2ForCompile(reopen(record), { byCellId: {}, byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])), stageDimension: 2 }, { libraries: LIBRARIES }).status
  }

  it('Reset to Cut matches v1 Remove then convert', () => {
    const record = convertStock(repeatScaleSource())
    expect(repeatTrack(record)).toEqual([0, 62000, [[0, 1], [32000, 2]]])
    expect(record.composition.transitions[0].wholeOutput).toEqual({ startMs: 30000, fromClipIds: [LEFT], toClipIds: [RIGHT] })
    const reset = editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(reset.status).toBe('changed')
    if (reset.status !== 'changed') throw new Error(JSON.stringify(reset))
    const source = repeatScaleSource()
    const v1 = convertStock(removeShowBoundaryTransition(source, BOUNDARY))
    expect(repeatTrack(reset.record)).toEqual([0, 60000, [[0, 1], [30000, 2]]])
    expect(repeatTrack(reset.record)).toEqual(repeatTrack(v1))
    expect(reset.record.composition.clips.map(c => [c.id, c.startMs, c.durationMs])).toEqual(v1.composition.clips.map(c => [c.id, c.startMs, c.durationMs]))
    expect(reset.record.composition.showEndMs).toBe(v1.composition.showEndMs)
    expect(stockPrepare(reset.record)).toBe('ready')
  })

  type BoundaryEditResult = ReturnType<typeof editShowTransitionV2> | ReturnType<typeof editShowClipTemporalV2>
  const rows: Array<[string, (record: ShowRecordV2) => BoundaryEditResult]> = [
    ['a leading edge resize', r => editShowTransitionV2(r, { kind: 'resize-leading', clipId: RIGHT, startMs: 36000 })],
    ['a trailing edge resize', r => editShowTransitionV2(r, { kind: 'resize-trailing', clipId: LEFT, endMs: 26000 })],
    ['a leading Trim', r => editShowClipTemporalV2(r, { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 })],
  ]
  it.each(rows)('accepts %s and retimes the repeat-scale track', (_name, edit) => {
    const result = edit(convertStock(repeatScaleSource()))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') throw new Error(JSON.stringify(result))
    expect(result.record.composition.showEndMs).toBe(60000)
    expect(repeatTrack(result.record)).toEqual([0, 60000, [[0, 1], [30000, 2]]])
    expect(stockPrepare(result.record)).toBe('ready')
  })

  it('refuses when a repeat-scale key sits inside the reclaimed window', () => {
    const record = convertStock(repeatScaleSource())
    record.composition.propertyTracks.find(t => t.target.kind === 'show-repeat-scale')!.keyframes[1].timeMs = 31000
    expect(validateShowRecordV2(record)).toEqual([])
    const result = editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.message).toContain('holds a key inside the reclaimed boundary window')
  })

  it.each([
    [31000, [40000, 50000], [30000, 18000, [38000, 48000]]],
    [31000, [32000, 40000], [30000, 8000, [30000, 38000]]],
  ] as Array<[number, number[], [number, number, number[]]]>)(
    'clamps an activation starting inside the window to the window start (start %i, keys %j)',
    (start, keys, expected) => {
      const record = convertStock(repeatScaleSource())
      const track = record.composition.propertyTracks.find(t => t.target.kind === 'show-repeat-scale')!
      track.activeStartMs = start
      track.activeDurationMs = keys[1] - start
      track.keyframes = keys.map((timeMs, index) => ({
        id: `clamp-k${index}`,
        timeMs,
        value: 1 + index,
        easing: { curve: 'linear' as const },
      }))
      expect(validateShowRecordV2(record)).toEqual([])
      const result = editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: BOUNDARY })
      expect(result.status).toBe('changed')
      if (result.status !== 'changed') throw new Error(JSON.stringify(result))
      const retimed = result.record.composition.propertyTracks.find(t => t.target.kind === 'show-repeat-scale')!
      expect([retimed.activeStartMs, retimed.activeDurationMs, retimed.keyframes.map(k => k.timeMs)]).toEqual(expected)
    },
  )

  it('does not report an untouched repeat-scale track as shifted', () => {
    const record = convertStock(repeatScaleSource())
    const track = record.composition.propertyTracks.find(t => t.target.kind === 'show-repeat-scale')!
    track.activeStartMs = 0
    track.activeDurationMs = 20000
    track.keyframes = [
      { id: 'untouched-k0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
      { id: 'untouched-k1', timeMs: 20000, value: 2, easing: { curve: 'linear' } },
    ]
    expect(validateShowRecordV2(record)).toEqual([])
    const result = editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') throw new Error(JSON.stringify(result))
    expect(result.affectedTrackIds).toEqual([])
  })
})

describe('a Scene Property track retimes through the repair as v1 Remove does (#1068)', () => {
  function sceneTrackSource(keys: number[]) {
    const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
    source.composition = projectFlatShowToCompositionV1(source, {
      byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
      stageDimension: 1,
    })
    const scene = source.composition.scenes[1]
    scene.propertyTracks = [{
      id: 'scene-2-brightness',
      target: { kind: 'placement-view', placementId: scene.zones[0].main[0].id, property: 'brightness' },
      keyframes: keys.map((timeMs, index) => ({ id: `scene-2-k${index}`, timeMs, value: 1 - index * 0.25, easing: { curve: 'linear' } })),
    }]
    return source
  }

  function convertStock(source: ReturnType<typeof sceneTrackSource>): ShowRecordV2 {
    const converted = convertShowRecordV1ToV2(source, { byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    return converted.record
  }

  function stockPrepare(record: ShowRecordV2) {
    return prepareShowV2ForCompile(reopen(record), { byCellId: {}, byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])), stageDimension: 2 }, { libraries: LIBRARIES }).status
  }

  function trackSummary(record: ShowRecordV2) {
    return record.composition.propertyTracks.map(t => [t.activeStartMs, t.activeDurationMs, t.keyframes.map(k => k.timeMs)])
  }

  const rows: Array<[number[], Array<[number, number, number[]]>]> = [
    [[0, 20000], [[30000, 30000, [30000, 50000]]]],
    [[5000, 30000], [[30000, 30000, [35000, 60000]]]],
  ]
  it.each(rows)('Reset to Cut matches v1 Remove then convert for Scene keys %j', (keys, expected) => {
    const record = convertStock(sceneTrackSource(keys))
    const reset = editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: BOUNDARY })
    expect(reset.status).toBe('changed')
    if (reset.status !== 'changed') throw new Error(JSON.stringify(reset))
    const v1 = convertStock(removeShowBoundaryTransition(sceneTrackSource(keys), BOUNDARY))
    expect(trackSummary(reset.record)).toEqual(trackSummary(v1))
    expect(stockPrepare(reset.record)).toBe('ready')
    expect(trackSummary(reset.record)).toEqual(expected)
  })
})

describe('changing a converted boundary duration retimes the loop as v1 does (#1068)', () => {
  function source(kind: 'plain' | 'track' | 'repeat') {
    const show = createDefaultShow('boundary-repair', 'Boundary repair', 1)
    if (kind === 'repeat') {
      show.scenes[0].sampleTargets = { repeatScale: 1 }
      show.scenes[1].sampleTargets = { repeatScale: 2 }
    }
    if (kind === 'track') {
      show.composition = projectFlatShowToCompositionV1(show, {
        byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
        stageDimension: 1,
      })
      const scene = show.composition.scenes[1]
      scene.propertyTracks = [{
        id: 'scene-2-brightness',
        target: { kind: 'placement-view', placementId: scene.zones[0].main[0].id, property: 'brightness' },
        keyframes: [5000, 25000].map((timeMs, index) => ({ id: `scene-2-k${index}`, timeMs, value: 1 - index * 0.25, easing: { curve: 'linear' } })),
      }]
    }
    return show
  }

  function convertStock(show: ReturnType<typeof source>): ShowRecordV2 {
    const converted = convertShowRecordV1ToV2(show, { byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    return converted.record
  }

  function stockPrepare(record: ShowRecordV2) {
    return prepareShowV2ForCompile(reopen(record), { byCellId: {}, byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])), stageDimension: 2 }, { libraries: LIBRARIES }).status
  }

  function summary(record: ShowRecordV2) {
    return {
      clips: record.composition.clips.map(c => [c.id, c.startMs, c.durationMs]),
      showEndMs: record.composition.showEndMs,
      transitions: record.composition.transitions.map(t => [t.id, t.durationMs]),
      occurrences: record.composition.layoutOccurrences.map(o => [o.startMs, o.durationMs]),
      markers: record.composition.markers.map(m => m.timeMs),
      tracks: record.composition.propertyTracks.map(t => [t.target.kind, t.activeStartMs, t.activeDurationMs, t.keyframes.map(k => k.timeMs)]),
    }
  }

  it.each([
    ['plain', 500],
    ['plain', 5000],
    ['track', 500],
    ['track', 5000],
    ['repeat', 500],
    ['repeat', 5000],
  ] as Array<['plain' | 'track' | 'repeat', number]>)('%s boundary resized to %i ms equals v1 then convert', (kind, durationMs) => {
    const edited = editShowTransitionV2(convertStock(source(kind)), { kind: 'resize-transition', transitionId: BOUNDARY, durationMs })
    expect(edited.status, JSON.stringify(edited)).toBe('changed')
    if (edited.status !== 'changed') throw new Error(JSON.stringify(edited))
    const v1 = convertStock(updateShowBoundaryTransition(source(kind), BOUNDARY, { durationMs }))
    expect(summary(edited.record)).toEqual(summary(v1))
    expect(stockPrepare(edited.record)).toBe('ready')
  })

  it('pins the measured plain values', () => {
    const short = editShowTransitionV2(convertStock(source('plain')), { kind: 'resize-transition', transitionId: BOUNDARY, durationMs: 500 })
    expect(short.status, JSON.stringify(short)).toBe('changed')
    if (short.status !== 'changed') throw new Error(JSON.stringify(short))
    expect(summary(short.record).clips).toEqual([['placement-cell-1-scene-1', 0, 30000], ['placement-cell-2-scene-2', 30500, 30000]])
    expect(summary(short.record).showEndMs).toBe(60500)
    const long = editShowTransitionV2(convertStock(source('plain')), { kind: 'resize-transition', transitionId: BOUNDARY, durationMs: 5000 })
    expect(long.status, JSON.stringify(long)).toBe('changed')
    if (long.status !== 'changed') throw new Error(JSON.stringify(long))
    expect(summary(long.record).clips[1][1]).toBe(35000)
    expect(summary(long.record).showEndMs).toBe(65000)
  })
})

describe('the outgoing Scene track retimes its end through the repair (#1068)', () => {
  function outgoingTrackSource() {
    const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
    source.composition = projectFlatShowToCompositionV1(source, {
      byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
      stageDimension: 1,
    })
    const scenes = source.composition.scenes
    scenes[0].propertyTracks = [{
      id: 'scene-1-brightness',
      target: { kind: 'placement-view', placementId: scenes[0].zones[0].main[0].id, property: 'brightness' },
      keyframes: [
        { id: 'scene-1-k0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
        { id: 'scene-1-k1', timeMs: 30000, value: 0.4, easing: { curve: 'linear' } },
      ],
    }]
    return source
  }

  function convertStock(source: ReturnType<typeof outgoingTrackSource>): ShowRecordV2 {
    const converted = convertShowRecordV1ToV2(source, { byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    return converted.record
  }

  function stockPrepare(record: ShowRecordV2) {
    return prepareShowV2ForCompile(reopen(record), { byCellId: {}, byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])), stageDimension: 2 }, { libraries: LIBRARIES }).status
  }

  function trackSummary(record: ShowRecordV2) {
    return record.composition.propertyTracks.map(t => [t.activeStartMs, t.activeDurationMs, t.keyframes.map(k => k.timeMs)])
  }

  const rows: Array<[string, (record: ShowRecordV2) => ReturnType<typeof editShowTransitionV2>, (source: ReturnType<typeof outgoingTrackSource>) => ReturnType<typeof updateShowBoundaryTransition>, Array<[number, number, number[]]>]> = [
    ['resize to 1000', r => editShowTransitionV2(r, { kind: 'resize-transition', transitionId: BOUNDARY, durationMs: 1000 }), s => updateShowBoundaryTransition(s, BOUNDARY, { durationMs: 1000 }), [[0, 31000, [0, 30000]]]],
    ['resize to 5000', r => editShowTransitionV2(r, { kind: 'resize-transition', transitionId: BOUNDARY, durationMs: 5000 }), s => updateShowBoundaryTransition(s, BOUNDARY, { durationMs: 5000 }), [[0, 35000, [0, 30000]]]],
    ['Reset to Cut', r => editShowTransitionV2(r, { kind: 'reset-to-cut', transitionId: BOUNDARY }), s => removeShowBoundaryTransition(s, BOUNDARY), [[0, 30000, [0, 30000]]]],
  ]
  it.each(rows)('%s retimes the outgoing track as v1 then convert', (_name, edit, v1Edit, expected) => {
    const record = convertStock(outgoingTrackSource())
    expect(trackSummary(record)).toEqual([[0, 32000, [0, 30000]]])
    const edited = edit(record)
    expect(edited.status).toBe('changed')
    if (edited.status !== 'changed') throw new Error(JSON.stringify(edited))
    const v1 = convertStock(v1Edit(outgoingTrackSource()))
    expect(trackSummary(edited.record)).toEqual(trackSummary(v1))
    expect(trackSummary(edited.record)).toEqual(expected)
    expect(stockPrepare(edited.record)).toBe('ready')
  })

  it('prepares after animating the outgoing Clip and resizing the promoted crossfade', () => {
    const record = convertedDefaultShow()
    const promoted = editShowPropertyV2(record, { kind: 'show' }, {
      kind: 'add-track',
      track: {
        id: 'promotion-outgoing',
        target: { kind: 'clip-view', clipId: LEFT, property: 'brightness' },
        activeStartMs: 0,
        activeDurationMs: 32000,
        keyframes: [
          { id: 'po-k0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'po-k1', timeMs: 30000, value: 0.4, easing: { curve: 'linear' } },
        ],
      },
    })
    expect(promoted.status).toBe('changed')
    if (promoted.status !== 'changed') throw new Error(JSON.stringify(promoted))
    const resized = editShowTransitionV2(promoted.record, { kind: 'resize-transition', transitionId: BOUNDARY, durationMs: 1000 })
    expect(resized.status).toBe('changed')
    if (resized.status !== 'changed') throw new Error(JSON.stringify(resized))
    expect(trackSummary(resized.record)).toEqual([[0, 31000, [0, 30000]]])
    expect(stockPrepare(resized.record)).toBe('ready')
  })
})

describe('Layout occurrence edits promote a converted boundary (#1068)', () => {
  function stockLookup(record: ShowRecordV2) {
    return {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])),
      stageDimension: 2 as const,
    }
  }

  function compiledCode(record: ShowRecordV2): string {
    const prepared = prepareShowV2ForCompile(reopen(record), stockLookup(record), { libraries: LIBRARIES })
    expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
    if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
    return compileShow(prepared.recipe, LIBRARIES).code
  }

  it('duplicates an empty Layout span on the converted default Show and still prepares, byte-identical to v1', () => {
    const record = convertedDefaultShow()
    const occurrenceId = record.composition.layoutOccurrences[0].id
    const duplicated = editShowLayoutIntervalsV2(record, { kind: 'duplicate', occurrenceId, newOccurrenceId: 'dup-empty' })
    expect(duplicated.status).toBe('changed')
    if (duplicated.status !== 'changed') throw new Error(JSON.stringify(duplicated))
    expect(duplicated.record.composition.layoutOccurrences.map(o => [o.id, o.startMs, o.durationMs])).toEqual([[occurrenceId, 0, 62000], ['dup-empty', 62000, 62000]])
    expect(duplicated.record.composition.transitions.map(t => [t.id, t.participants, t.wholeOutput])).toEqual([[BOUNDARY, [], { startMs: 30000, fromClipIds: [LEFT], toClipIds: [RIGHT] }]])
    expect(duplicated.affectedTransitionIds).toContain(BOUNDARY)
    const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
    const v1 = duplicateShowLayoutInterval(source, projectShowLayoutIntervals(source)[0].id, { withContent: false })
    const converted = convertShowRecordV1ToV2(v1, { byCellId: Object.fromEntries(v1.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    expect(compiledCode(duplicated.record)).toBe(compiledCode(converted.record))
  })

  it('duplicates a Layout span with its Clips and still prepares', () => {
    const record = convertedDefaultShow()
    const occurrenceId = record.composition.layoutOccurrences[0].id
    const allocate = (() => { let n = 0; return () => `dup-copy-${++n}` })()
    const plan = planShowV2LayoutEdit(record, { kind: 'duplicate', occurrenceId, content: 'copy' }, allocate)
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') throw new Error(JSON.stringify(plan))
    const duplicated = editShowLayoutIntervalsV2(record, plan.intent)
    expect(duplicated.status).toBe('changed')
    if (duplicated.status !== 'changed') throw new Error(JSON.stringify(duplicated))
    expect(duplicated.record.composition.transitions.every(t => t.wholeOutput !== undefined && t.participants.length === 0)).toBe(true)
    expect(duplicated.record.composition.patternInstances).toHaveLength(record.composition.patternInstances.length)
    compiledCode(duplicated.record)
  })

  it('leaves a single-occurrence Layout edit unpromoted', () => {
    const record = convertedDefaultShow()
    const result = editShowLayoutIntervalsV2(record, { kind: 'set-show-end', showEndMs: 64000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') throw new Error(JSON.stringify(result))
    expect(result.record.composition.transitions[0].participants).toHaveLength(1)
    expect(result.record.composition.transitions[0].wholeOutput).toBeUndefined()
  })

  it('leaves a Show the lowering admits on the participant route unpromoted (overlay Layer)', () => {
    const record = convertedDefaultShow()
    record.composition.layers.push({ ...record.composition.layers[0], id: 'overlay-layer', name: 'Overlay', rank: 1 })
    expect(validateShowRecordV2(record)).toEqual([])
    const duplicated = editShowLayoutIntervalsV2(record, { kind: 'duplicate', occurrenceId: record.composition.layoutOccurrences[0].id, newOccurrenceId: 'dup-overlay' })
    expect(duplicated.status).toBe('changed')
    if (duplicated.status !== 'changed') throw new Error(JSON.stringify(duplicated))
    expect(duplicated.record.composition.transitions[0].wholeOutput).toBeUndefined()
    expect(duplicated.record.composition.transitions[0].participants).toHaveLength(1)
    const prepared = prepareShowV2ForCompile(reopen(duplicated.record), stockLookup(duplicated.record), { libraries: LIBRARIES })
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
    expect(prepared.provenance.route).toBe('transition')
  })

  it.each([[false], [true]])('layoutOccurrencesBlockedV2 agrees with the lowering refusal (overlay %s)', (overlay) => {
    const record = convertedDefaultShow()
    if (overlay) record.composition.layers.push({ ...record.composition.layers[0], id: 'overlay-layer', name: 'Overlay', rank: 1 })
    const first = record.composition.layoutOccurrences[0]
    record.composition.layoutOccurrences = [{ ...first, durationMs: 31000 }, { ...first, id: 'agree-second', startMs: 31000, durationMs: 31000 }]
    const prepared = prepareShowV2ForCompile(reopen(record), stockLookup(record), { libraries: LIBRARIES })
    const refusedByRule = prepared.status === 'refused' && prepared.issues.some(issue => issue.code === 'unsupported-layout-occurrences')
    expect(layoutOccurrencesBlockedV2(record)).toBe(refusedByRule)
    expect(refusedByRule).toBe(!overlay)
  })
})
