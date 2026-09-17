import { describe, expect, it } from 'vitest'
import type { ShowOutputContract } from './personalContentRecords'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { createShowV2WithOutputContract } from './showCreationV2'
import { createShowWithOutputContract, showRecordToCompileRecipe } from './showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } from './showCompositionV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'

const INSTALLATION = createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 })
const sources = { TestPattern1D: DEMOS.TestPattern1D, CometLoom: DEMOS.CometLoom }

function v1Fresh(contract: ShowOutputContract = INSTALLATION) {
  return createShowWithOutputContract('fresh', 'Fresh Show', contract, 1)
}

function v1Recipe(contract: ShowOutputContract = INSTALLATION) {
  return showRecordToCompileRecipe(v1Fresh(contract), {
    byCellId: { 'cell-1': sources.TestPattern1D, 'cell-2': sources.CometLoom },
    byPatternInstanceId: {},
    stageDimension: 2,
  })
}

function preparedV2(contract: ShowOutputContract = INSTALLATION) {
  const record = createShowV2WithOutputContract('fresh', 'Fresh Show', contract, 1)
  const prepared = prepareShowV2ForCompile(record, {
    byCellId: {},
    byPatternInstanceId: { 'instance-1': sources.TestPattern1D, 'instance-2': sources.CometLoom },
    stageDimension: 2,
  })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  return { record, prepared }
}

describe('the native fresh v2 Show', () => {
  it('offers two Clips joined by one two-sided Crossfade on one Layer', () => {
    const { composition } = createShowV2WithOutputContract('fresh', 'Fresh Show', INSTALLATION, 1)
    expect(composition.showEndMs).toBe(62_000)
    expect(composition.layers).toHaveLength(1)
    expect(composition.clips.map((clip) => [clip.startMs, clip.durationMs, clip.entryPolicy]))
      .toEqual([[0, 30_000, 'continue'], [32_000, 30_000, 'continue']])
    // One Pattern instance per Clip: two different Patterns are two runtimes.
    expect(new Set(composition.clips.map((clip) => clip.instanceId)).size).toBe(2)
    expect(composition.patternInstances.map((instance) => instance.patternName))
      .toEqual(['TestPattern1D', 'CometLoom'])
    expect(composition.transitions).toHaveLength(1)
    expect(composition.transitions[0]).toMatchObject({
      kind: 'crossfade',
      durationMs: 2_000,
      crossfadePolicy: 'snapshot-live',
    })
    // Two-sided: the one participant names both Clips on their own Layer.
    expect(composition.transitions[0].participants).toEqual([{
      id: 'transition-1:participant:1',
      zoneId: composition.clips[0].zoneId,
      layerId: composition.layers[0].id,
      fromClipId: composition.clips[0].id,
      toClipId: composition.clips[1].id,
    }])
    expect(composition.transitions[0].wholeOutput).toBeUndefined()
    // Layout coverage is exactly the Show, and a native Show has no Scene
    // labels to project, so it carries no chapter Marker.
    expect(composition.layoutOccurrences).toEqual([{
      id: 'layout-occurrence-1', layoutId: 'layout-1', startMs: 0, durationMs: 62_000, parameters: {},
    }])
    expect(composition.markers).toEqual([])
    expect(composition.groupDefinitions).toEqual([])
  })

  it('compiles to exactly what a fresh v1 Show compiles to, in both output contracts', () => {
    for (const contract of [
      INSTALLATION,
      createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: 120 }),
    ]) {
      const { prepared } = preparedV2(contract)
      expect(compileShow(prepared.recipe, LIBRARIES).code)
        .toBe(compileShow(v1Recipe(contract), LIBRARIES).code)
    }
  })

  it('places the same Stage as the v1 builder and the same content as converting it', () => {
    const native = createShowV2WithOutputContract('fresh', 'Fresh Show', INSTALLATION, 1)
    const legacy = v1Fresh()
    expect(native.zones).toEqual(legacy.zones)
    expect(native.zoneLayouts).toEqual(legacy.routingLayouts)
    expect(native.outputContract).toEqual(legacy.outputContract)
    expect(native.stageMapId).toBe(legacy.stageMapId)

    // The converted fresh v1 Show is the preservation reference: the same
    // timing, Layer, sampling, sharing and Transition settings under the v2
    // record's own identities, plus the Scene labels conversion projects.
    const converted = convertShowRecordV1ToV2(legacy, {
      byCellId: { 'cell-1': sources.TestPattern1D, 'cell-2': sources.CometLoom },
      byPatternInstanceId: {},
      stageDimension: 2,
    })
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const anonymous = (record: typeof native) => ({
      ...record.composition,
      patternInstances: record.composition.patternInstances.map(({ id: _id, ...rest }) => rest),
      clips: record.composition.clips.map(({ id: _id, instanceId: _instance, appearance, ...rest }) => ({
        ...rest,
        appearance: { keys: appearance.keys.map(({ id: _key, ...key }) => key) },
      })),
      transitions: record.composition.transitions.map(({ id: _id, participants, ...rest }) => ({
        ...rest,
        participants: participants.map(({ id: _participant, fromClipId: _from, toClipId: _to, ...participant }) => participant),
      })),
      layoutOccurrences: record.composition.layoutOccurrences.map(({ id: _id, ...rest }) => rest),
      markers: [],
    })
    expect(anonymous(native)).toEqual(anonymous(converted.record))
    // The one intended content difference: no synthetic Scene labels.
    expect(converted.record.composition.markers.map((marker) => marker.role)).toEqual(['chapter', 'chapter'])
  })

  it('round trips through the provisional codec unchanged', () => {
    const record = createShowV2WithOutputContract('fresh', 'Fresh Show', INSTALLATION, 1)
    const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
    expect(reopened.status).toBe('opened')
    if (reopened.status !== 'opened') return
    expect(reopened.record).toEqual(record)
  })
})
