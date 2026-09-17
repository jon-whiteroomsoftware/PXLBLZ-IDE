import { describe, expect, it } from 'vitest'
import { parseEpe } from './epeImport'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import {
  buildShowV2RouteArtifacts,
  buildShowV2RouteSummary,
  describeShowArtifactPatternsV2,
} from './showV2RouteDelivery'
import { showV2GroupEditorFixture } from '@/test/showV2GroupEditorFixture'
import { propertyEditGroupRecord } from '@/test/showV2PropertyEditsFixture'

function prepared() {
  const { record, dependencies } = showV2GroupEditorFixture()
  const capture = captureShowStageEditV2(record, dependencies)
  if (capture.prepared.status !== 'ready') throw new Error(JSON.stringify(capture.prepared))
  return { record, bundle: capture.prepared.bundle }
}

describe('the v2 route delivery model', () => {
  it('exports one .epe that reopens with the compiled Show and measures it', () => {
    const { bundle } = prepared()
    const result = buildShowV2RouteArtifacts(bundle, { exportedAt: '2026-09-17T00:00:00.000Z' })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    const { artifacts } = result

    expect(artifacts.epe.filename).toMatch(/\.epe$/)
    expect(parseEpe(artifacts.epe.text).src).toContain(bundle.artifact.code)
    // The gauge measures the bytes the export actually carries, against the
    // artifact's own measured device budget.
    expect(artifacts.deliveredBytes).toBe(new TextEncoder().encode(artifacts.epe.source).length)
    expect(artifacts.budgetBytes).toBe(bundle.artifact.summary.measuredDeviceBudgetBytes)
    expect(artifacts.vmWords.used).toBe(bundle.artifact.summary.resources.totalWords)
    expect(artifacts.structure.transitionCount).toBe(bundle.artifact.summary.transitionCount)
    expect(artifacts.model.rows.length).toBeGreaterThan(0)
    expect(artifacts.inventory.totalBytes).toBeGreaterThan(0)
  })

  it('refuses an empty Show rather than describing bytes nothing can deliver', () => {
    const { record, bundle } = prepared()
    const emptied = { ...record, composition: { ...record.composition, clips: [], transitions: [] } }
    const result = buildShowV2RouteArtifacts({ ...bundle, record: emptied })
    expect(result).toEqual({ status: 'refused', message: 'Add content to the Show before exporting.' })
  })

  it('refuses to deliver a Portable Show whose Pattern only defines render3D', () => {
    // v1 refuses the same Show at `compileShowForArtifact`; preparation and
    // preview accept it in both versions, and authoring stays available.
    const { record, dependencies } = showV2GroupEditorFixture()
    dependencies.patterns[0].src = 'export var gain = .4\nexport function sliderGain(v) { gain = v }\nexport function render3D(index, x, y, z) { rgb(gain, y, z) }'
    const capture = captureShowStageEditV2(record, dependencies)
    if (capture.prepared.status !== 'ready') throw new Error(JSON.stringify(capture.prepared))
    expect(buildShowV2RouteArtifacts(capture.prepared.bundle)).toEqual({
      status: 'refused',
      message: 'Portable 2D compatibility failed: Voice defines only render3D. Choose a Pattern with render2D or render, or author that renderer before export or send.',
    })
  })

  it('delivers the same 3D-only Pattern in an Installation Show', () => {
    const { record, dependencies } = showV2GroupEditorFixture()
    dependencies.patterns[0].src = 'export var gain = .4\nexport function sliderGain(v) { gain = v }\nexport function render3D(index, x, y, z) { rgb(gain, y, z) }'
    record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
    const capture = captureShowStageEditV2(record, dependencies)
    if (capture.prepared.status !== 'ready') throw new Error(JSON.stringify(capture.prepared))
    expect(buildShowV2RouteArtifacts(capture.prepared.bundle).status).toBe('ready')
  })

  it('refuses a Portable Show whose only 3D-only use is a materialized Group runtime', () => {
    const record = propertyEditGroupRecord()
    // Leave the ordinary Clip on a 2D Pattern and give the Group's runtime a
    // separate 3D-only one, so only the effective scope can see the mismatch.
    record.composition.patternInstances[0].pattern = { kind: 'user', id: 'surface' }
    record.composition.patternInstances.push({
      id: 'volume-instance', pattern: { kind: 'user', id: 'volume' }, patternName: 'Volume',
      time: { timeScale: 1, timeOffsetMs: 0 },
    })
    for (const occurrence of record.composition.groupOccurrences) occurrence.instanceBindings = { slot: 'volume-instance' }
    const capture = captureShowStageEditV2(record, {
      patterns: [
        { id: 'surface', name: 'Surface', updatedAt: 1, controls: {}, src: 'export var gain = .4\nexport function sliderGain(v) { gain = v }\nexport function render2D(i, x, y) { rgb(gain, x, y) }' },
        { id: 'volume', name: 'Volume', updatedAt: 1, controls: {}, src: 'export var gain = .4\nexport function sliderGain(v) { gain = v }\nexport function render3D(i, x, y, z) { rgb(gain, y, z) }' },
      ],
      maps: [], libraries: [], profiles: [], stageMap: null,
    })
    if (capture.prepared.status !== 'ready') throw new Error(JSON.stringify(capture.prepared))
    expect(buildShowV2RouteArtifacts(capture.prepared.bundle)).toMatchObject({
      status: 'refused',
      message: expect.stringContaining('Volume defines only render3D.'),
    })
  })

  it('counts every effective Clip use of an instance, Group uses included', () => {
    const { record, bundle } = prepared()
    const result = buildShowV2RouteArtifacts(bundle)
    if (result.status !== 'ready') throw new Error(result.message)
    const patterns = describeShowArtifactPatternsV2(record, result.artifacts.inventory)
    const voice = patterns.find((pattern) => pattern.name === 'Voice')
    expect(voice).toBeDefined()
    // The fixture places three Clips over one shared runtime.
    expect(voice!.logicalInstanceCount).toBe(1)
    expect(voice!.authoredReferenceCount).toBe(3)

    // A record whose Group occurrences materialize two more uses of that same
    // runtime counts five, not the three ordinary Clips (section 4).
    const withGroups = propertyEditGroupRecord()
    for (const instance of withGroups.composition.patternInstances) {
      instance.pattern = { kind: 'user', id: 'group-voice' }
    }
    const groupCapture = captureShowStageEditV2(withGroups, {
      patterns: [{
        id: 'group-voice', name: 'Voice', updatedAt: 1, controls: {},
        src: 'export var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',
      }],
      maps: [], libraries: [], profiles: [], stageMap: null,
    })
    if (groupCapture.prepared.status !== 'ready') throw new Error(JSON.stringify(groupCapture.prepared))
    const groupArtifacts = buildShowV2RouteArtifacts(groupCapture.prepared.bundle)
    if (groupArtifacts.status !== 'ready') throw new Error(groupArtifacts.message)
    const materialized = describeShowArtifactPatternsV2(withGroups, groupArtifacts.artifacts.inventory)
      .find((pattern) => pattern.ownerIds.includes('instance'))
    expect(materialized).toBeDefined()
    expect(withGroups.composition.clips).toHaveLength(1)
    expect(materialized!.authoredReferenceCount).toBe(3)
  })

  it('summarizes the record without reading a Scene', () => {
    const { record } = prepared()
    expect(buildShowV2RouteSummary(record)).toEqual({
      name: record.name,
      recordVersion: 2,
      showEndMs: 30_000,
      zoneCount: record.zones.length,
      layerCount: record.composition.layers.length,
      clipCount: 3,
      effectiveClipCount: 3,
      patternInstanceCount: 1,
      transitionCount: 0,
      layoutOccurrenceCount: 1,
      markerCount: record.composition.markers.length,
      groupOccurrenceCount: 0,
    })
  })
})
