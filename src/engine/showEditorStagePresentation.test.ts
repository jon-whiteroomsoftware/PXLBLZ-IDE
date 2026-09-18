import { describe, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { projectShowEditorStagePresentationV2 } from './showEditorStagePresentation'
import { createCustomMap } from './maps'

function readyCapture() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion refused')
  return captureShowStageEditV2(converted.record, {
    patterns: [],
    libraries: [],
    maps: [],
    profiles: [],
    stageMap: null,
  })
}

describe('Show editor Stage presentation v2', () => {
  it('carries one ready capture into the existing Stage surface without another artifact or layout', () => {
    const capture = readyCapture()
    expect(capture.prepared.status, JSON.stringify(capture.prepared)).toBe('ready')
    if (capture.prepared.status !== 'ready') throw new Error('Preparation refused')
    const recordBefore = structuredClone(capture.record)

    const presentation = projectShowEditorStagePresentationV2(capture)

    expect(presentation).toMatchObject({
      showId: capture.record.id,
      status: 'ready',
      durationMs: capture.record.composition.showEndMs,
      error: null,
      stageIdentityRole: 'Reference map',
    })
    expect(presentation.artifact).toBe(capture.prepared.bundle.artifact)
    expect(presentation.layout).toBe(capture.prepared.bundle.presentation.layout)
    expect(presentation.diagnosticFrameAt(null, 0).rects.map(rect => rect.zoneId))
      .toEqual(presentation.layout.projection.zones.filter(zone => !zone.offStage).map(zone => zone.id))
    expect(capture.record).toEqual(recordBefore)
  })

  it('draws the selected ordinary Clip from its authored identity only during its half-open interval', () => {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    if (converted.status !== 'converted') throw new Error('Conversion refused')
    const record = converted.record
    record.stageMapId = 'stage'
    if (record.outputContract.kind !== 'portable-2d') throw new Error('Expected Portable Show')
    record.outputContract.referenceMapId = 'stage'
    record.outputContract.referencePixelCount = 4
    record.composition.clips[0].appearance.keys[0].value.transform = {
      positionX: 0.1,
      positionY: -0.1,
      rotation: 0,
      scaleX: 0.5,
      scaleY: 0.25,
    }
    const capture = captureShowStageEditV2(record, {
      patterns: [], libraries: [], maps: [], profiles: [],
      stageMap: createCustomMap([[0, 0], [1, 0], [0, 1], [1, 1]], { id: 'stage', name: 'Square' }),
    })
    const presentation = projectShowEditorStagePresentationV2(capture)
    const focus = {
      recordVersion: 2 as const,
      showId: record.id,
      zoneId: record.composition.clips[0].zoneId,
      clipId: record.composition.clips[0].id,
      occurrenceId: null,
    }

    expect(presentation.diagnosticFrameAt(focus, 500).clipPoints).toEqual([
      [0.35, 0.275], [0.85, 0.275], [0.85, 0.525], [0.35, 0.525],
    ])
    expect(presentation.diagnosticFrameAt(focus, 999).clipPoints).not.toBeNull()
    expect(presentation.diagnosticFrameAt(focus, 1_000).clipPoints).toBeNull()
    expect(presentation.diagnosticFrameAt({ ...focus, showId: 'another-show' }, 500).clipPoints).toBeNull()
  })

  it('disambiguates repeated Group members by authored occurrence and local Clip identities', () => {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    if (converted.status !== 'converted') throw new Error('Conversion refused')
    const record = converted.record
    record.stageMapId = 'stage'
    if (record.outputContract.kind !== 'portable-2d') throw new Error('Expected Portable Show')
    record.outputContract.referenceMapId = 'stage'
    record.outputContract.referencePixelCount = 4
    const ordinary = record.composition.clips[0]
    const { zoneId: _zoneId, ...child } = structuredClone(ordinary)
    child.id = 'member'
    child.instanceId = 'slot'
    child.layerId = 'local-layer'
    child.startMs = 0
    child.durationMs = 200
    child.appearance.keys[0].id = 'member-key'
    child.appearance.keys[0].timeMs = 0
    child.appearance.keys[0].value.transform = {
      positionX: 0,
      positionY: 0,
      rotation: 0,
      scaleX: 0.5,
      scaleY: 0.5,
    }
    record.composition.clips = []
    record.composition.groupDefinitions = [{
      id: 'definition',
      name: 'Repeated',
      patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
      layers: [{ id: 'local-layer', name: 'Local', rank: 0 }],
      clips: [child],
      transitions: [],
      propertyTracks: [],
    }]
    record.composition.groupOccurrences = [
      { id: 'left-use', startMs: 100, translationX: -0.1 },
      { id: 'right-use', startMs: 600, translationX: 0.1 },
    ].map(({ id, startMs, translationX }) => ({
      id,
      definitionId: 'definition',
      layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
      zoneId: ordinary.zoneId,
      startMs,
      translationX,
      translationY: 0,
      layerBindings: [{ definitionLayerId: 'local-layer', layerId: ordinary.layerId }],
      instanceBindings: { [child.instanceId]: ordinary.instanceId },
      holds: [],
    }))
    const capture = captureShowStageEditV2(record, {
      patterns: [], libraries: [], maps: [], profiles: [],
      stageMap: createCustomMap([[0, 0], [1, 0], [0, 1], [1, 1]], { id: 'stage', name: 'Square' }),
    })
    expect(capture.prepared.status, JSON.stringify(capture.prepared)).toBe('ready')
    const presentation = projectShowEditorStagePresentationV2(capture)
    const focus = {
      recordVersion: 2 as const,
      showId: record.id,
      zoneId: ordinary.zoneId,
      clipId: child.id,
      occurrenceId: 'right-use',
    }

    expect(presentation.diagnosticFrameAt(focus, 650).clipPoints).toEqual([
      [0.35, 0.25], [0.85, 0.25], [0.85, 0.75], [0.35, 0.75],
    ])
    expect(presentation.diagnosticFrameAt({ ...focus, occurrenceId: 'left-use' }, 650).clipPoints).toBeNull()
    const leftPoints = presentation.diagnosticFrameAt({ ...focus, occurrenceId: 'left-use' }, 150).clipPoints
    expect(leftPoints).not.toBeNull()
    expect(leftPoints?.[0]?.[0]).toBeCloseTo(0.15)
    expect(leftPoints?.[0]?.[1]).toBe(0.25)
    expect(leftPoints?.[1]).toEqual([0.65, 0.25])
    expect(leftPoints?.[2]).toEqual([0.65, 0.75])
    expect(leftPoints?.[3]?.[0]).toBeCloseTo(0.15)
    expect(leftPoints?.[3]?.[1]).toBe(0.75)
  })

  it('keeps the same mapped Stage shell when authored content is empty', () => {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    if (converted.status !== 'converted') throw new Error('Conversion refused')
    const record = converted.record
    record.stageMapId = 'stage'
    if (record.outputContract.kind !== 'portable-2d') throw new Error('Expected Portable Show')
    record.outputContract.referenceMapId = 'stage'
    record.outputContract.referencePixelCount = 4
    record.composition.clips = []
    const capture = captureShowStageEditV2(record, {
      patterns: [], libraries: [], maps: [], profiles: [],
      stageMap: createCustomMap([[0, 0], [1, 0], [0, 1], [1, 1]], { id: 'stage', name: 'Square' }),
    })
    expect(capture.prepared.status).toBe('empty')

    const presentation = projectShowEditorStagePresentationV2(capture)

    expect(presentation).toMatchObject({ status: 'empty', artifact: null, error: null })
    expect(presentation.layout).toMatchObject({ kind: 'map', label: 'Square' })
    expect(presentation.layout.mapPoints).toHaveLength(4)
    expect(presentation.selectedStageMap).toEqual({ id: 'stage', name: 'Square', dim: 2 })
    expect(presentation.layout.projection.zones.map((zone: { id: string }) => zone.id)).toEqual(['zone'])
  })

  it('keeps Stage reads and selected Clip diagnostics when source preparation refuses', () => {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    if (converted.status !== 'converted') throw new Error('Conversion refused')
    const record = converted.record
    record.stageMapId = 'stage'
    if (record.outputContract.kind !== 'portable-2d') throw new Error('Expected Portable Show')
    record.outputContract.referenceMapId = 'stage'
    record.outputContract.referencePixelCount = 4
    record.composition.patternInstances[0].pattern = { kind: 'user', id: 'missing-source' }
    const capture = captureShowStageEditV2(record, {
      patterns: [], libraries: [], maps: [], profiles: [],
      stageMap: createCustomMap([[0, 0], [1, 0], [0, 1], [1, 1]], { id: 'stage', name: 'Square' }),
    })
    expect(capture.prepared.status).toBe('refused')

    const presentation = projectShowEditorStagePresentationV2(capture)
    const clip = record.composition.clips[0]

    expect(presentation.status).toBe('refused')
    expect(presentation.artifact).toBeNull()
    expect(presentation.error).toContain('exact Pattern source')
    expect(presentation.layout).toMatchObject({ kind: 'map', label: 'Square' })
    expect(presentation.diagnosticFrameAt({
      recordVersion: 2,
      showId: record.id,
      zoneId: clip.zoneId,
      clipId: clip.id,
      occurrenceId: null,
    }, 500).clipPoints).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]])
  })
})
