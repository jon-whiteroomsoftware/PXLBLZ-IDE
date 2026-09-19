import { describe, expect, it } from 'vitest'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { compileShow } from './showCompiler'
import { buildShowEpeExport } from './showEpeExport'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { deleteShowClipInShow } from './showClipDeletion'
import { createDefaultShow, showLoopDurationMs, showRecordToCompileRecipe } from './showModel'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import { resizeShowConnectedClipInShowAtGlobalTime } from './showLayerTransitionAuthoring'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { editShowClipTemporalV2 } from './showClipTemporalV2'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'
import { editShowTransitionV2 } from './showTransitionsV2'
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

  it('refuses boundary repair while the carrier still holds Property ramps', () => {
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
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('unsupported-property-carrier')
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })
})

describe('converted Scene-boundary repair through the Transition owner', () => {
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

  it('resets a converted-boundary carrier with a fitting projection plan and reclaims Show End', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    const result = editShowTransitionV2(source, {
      kind: 'reset-to-cut',
      transitionId: BOUNDARY,
      propertyRampProjections: [{
        rampIndex: 0, trackId: 'brightness-track', startKeyId: 'brightness-start', endKeyId: 'brightness-end',
        activeEndMs: 60000, toValue: 1,
      }],
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 30000, 30000],
    ])
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.showEndMs).toBe(60000)
    expect(result.record.composition.propertyTracks).toEqual([
      expect.objectContaining({ id: 'brightness-track', target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' } }),
    ])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })

  it('refuses a projected reset whose activation strands beyond the reclaimed Show End', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const result = editShowTransitionV2(source, {
      kind: 'reset-to-cut',
      transitionId: BOUNDARY,
      propertyRampProjections: [{
        rampIndex: 0, trackId: 'brightness-track', startKeyId: 'brightness-start', endKeyId: 'brightness-end',
        activeEndMs: 62000, toValue: 1,
      }],
    })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('invalid-result')
    expect(result.record).toBe(source)
  })

  it('drops a projection plan anchored to the deleted Clip, preserving survivor time', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const result = editShowTransitionV2(source, {
      kind: 'delete-clip',
      clipId: RIGHT,
      propertyRampProjections: [{
        transitionId: BOUNDARY,
        projections: [{
          rampIndex: 0, trackId: 'brightness-track', startKeyId: 'brightness-start', endKeyId: 'brightness-end',
          activeEndMs: 62000, toValue: 1,
        }],
      }],
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([[LEFT, 0, 30000]])
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.showEndMs).toBe(62000)
    expect(result.record.composition.propertyTracks).toEqual([])
    expect(result.removedIds).toEqual(expect.arrayContaining(['brightness-track', RIGHT, BOUNDARY]))
    expect(result.affectedTrackIds).toEqual(expect.arrayContaining(['brightness-track']))
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })
  it('keeps a projection plan anchored to the survivor on converted-boundary delete', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: LEFT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const result = editShowTransitionV2(source, {
      kind: 'delete-clip',
      clipId: RIGHT,
      propertyRampProjections: [{
        transitionId: BOUNDARY,
        projections: [{
          rampIndex: 0, trackId: 'brightness-track', startKeyId: 'brightness-start', endKeyId: 'brightness-end',
          activeEndMs: 62000, toValue: 1,
        }],
      }],
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([[LEFT, 0, 30000]])
    expect(result.record.composition.transitions).toEqual([])
    expect(result.record.composition.showEndMs).toBe(62000)
    expect(result.record.composition.propertyTracks).toEqual([
      expect.objectContaining({ id: 'brightness-track', target: { kind: 'clip-view', clipId: LEFT, property: 'brightness' } }),
    ])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })
  it('keeps carrier projection refusals on delete where v1 retains or repairs', () => {
    const source = convertedDefaultShow()
    const carrier = source.composition.transitions.find(transition => transition.id === BOUNDARY)!
    carrier.propertyRamps = [{
      participantId: carrier.participants[0].id,
      target: { kind: 'clip-view', clipId: RIGHT, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const result = editShowTransitionV2(source, { kind: 'delete-clip', clipId: RIGHT })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('unsupported-property-carrier')
    expect(result.record).toBe(source)
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
