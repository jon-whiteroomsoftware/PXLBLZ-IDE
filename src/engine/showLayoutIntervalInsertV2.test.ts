import { describe, expect, it } from 'vitest'
import { addShowRoutingLayout, createDefaultShow, showRecordToCompileRecipe } from './showModel'
import { insertShowLayoutInterval } from './showLayoutIntervals'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import type { ShowRecord } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import { insertShowLayoutIntervalV2 } from './showLayoutIntervalInsertV2'

function researchBase(): ShowRecord {
  const show = createDefaultShow('research', 'Research', 1)
  show.scenes = [
    { ...show.scenes[0], durationMs: 10000 },
    { ...show.scenes[1], durationMs: 10000 },
  ]
  show.composition = {
    version: 1,
    patternInstances: [{
      id: 'instance-1',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'clip-a',
            instanceId: 'instance-1',
            startMs: 0,
            durationMs: 10000,
            view: { brightness: 1, phase: 0, mirror: false },
          }],
          overlays: [],
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'clip-b',
            instanceId: 'instance-1',
            startMs: 0,
            durationMs: 10000,
            view: { brightness: 1, phase: 0, mirror: false },
          }],
          overlays: [],
        }],
      },
    ],
    markers: [
      { id: 'm-early', timeMs: 1000, name: 'Early' },
      { id: 'm-late', timeMs: 15000, name: 'Late', color: '#f59e0b' },
    ],
  }
  return show
}

function convertedBefore(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(researchBase())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  return converted.record
}

// The default single-Zone Layout carries a split position structurally: the
// converter copies scene routingTargets into occurrence parameters without
// regard to Layout kind, as continuingCutShow in showRecordV1ToV2.test.ts
// proves for a single-layout show. So scene-1 can carry splitPosition 0.3
// on layout-1 with no split Layout fixture.
function researchBaseWithSplit(): ShowRecord {
  const show = researchBase()
  show.scenes[0].routingTargets = { splitPosition: 0.3 }
  return show
}

function withSpanningGroup(record: ShowRecordV2): ShowRecordV2 {
  const next = structuredClone(record)
  // The Group child needs its own Zone layer: materialized onto Main it would
  // overlap clip-a, and validate-first now refuses that invalid record before
  // the Group-span check the fixture targets.
  next.composition.layers = [
    ...next.composition.layers,
    { id: 'layer:zone-1:overlay', zoneId: 'zone-1', name: 'Overlay', rank: 1 },
  ]
  next.composition.groupDefinitions = [{
    id: 'g-def',
    name: 'G',
    patternInstances: [{
      id: 'g-inst',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    layers: [{ id: 'g-layer', name: 'Local', rank: 0 }],
    clips: [{
      id: 'g-child',
      instanceId: 'g-inst',
      layerId: 'g-layer',
      startMs: 0,
      durationMs: 5000,
      entryPolicy: 'restart',
      zoneSampleMode: 'span',
      appearance: { keys: [{
        id: 'g-key',
        timeMs: 0,
        value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
      }] },
    }],
    transitions: [],
    propertyTracks: [],
  }]
  next.composition.groupOccurrences = [{
    id: 'g-occ',
    definitionId: 'g-def',
    layoutOccurrenceId: next.composition.layoutOccurrences[0].id,
    zoneId: 'zone-1',
    startMs: 1000,
    translationX: 0,
    translationY: 0,
    layerBindings: [{ definitionLayerId: 'g-layer', layerId: 'layer:zone-1:overlay' }],
    holds: [],
  }]
  return next
}


function dropLogicalUndefined(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) dropLogicalUndefined(entry)
    return
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (key === 'logical' && record[key] === undefined) delete record[key]
      else dropLogicalUndefined(record[key])
    }
  }
}

function structuralInsertOracle(record: ShowRecordV2): unknown {
  const next = structuredClone(record)
  for (const occurrence of next.composition.layoutOccurrences) {
    delete (occurrence as unknown as Record<string, unknown>).incomingSwitch
  }
  next.composition.markers = next.composition.markers.filter(marker => marker.origin !== 'converted-scene-label')
  const transitions = next.composition.transitions.map(transition => {
    if (transition.wholeOutput) {
      const start = transition.wholeOutput.startMs
      return {
        kind: transition.kind,
        durationMs: transition.durationMs,
        easing: structuredClone(transition.easing),
        window: [start, start + transition.durationMs],
        from: [...transition.wholeOutput.fromClipIds].sort(),
        to: [...transition.wholeOutput.toClipIds].sort(),
      }
    }
    const from = transition.participants.map(participant => participant.fromClipId).sort()
    const to = transition.participants.map(participant => participant.toClipId).sort()
    const starts = transition.participants.map(participant => {
      const clip = next.composition.clips.find(candidate => candidate.id === participant.fromClipId)
      if (!clip) throw new Error(`missing from-clip ${participant.fromClipId}`)
      return clip.startMs + clip.durationMs
    })
    const start = Math.min(...starts)
    return {
      kind: transition.kind,
      durationMs: transition.durationMs,
      easing: structuredClone(transition.easing),
      window: [start, start + transition.durationMs],
      from,
      to,
    }
  })
  const normalized = { ...next, composition: { ...next.composition, transitions } }
  dropLogicalUndefined(normalized)
  return normalized
}

async function expectInsertRuntimeParity(v1After: ShowRecord, v2After: ShowRecordV2): Promise<void> {
  const lookup = {
    byCellId: {},
    byPatternInstanceId: { 'instance-1': 'export function render2D(index,x,y) { rgb(x,y,0) }' },
    stageDimension: 2 as const,
  }
  const v1Compiled = compileShow(showRecordToCompileRecipe(v1After, lookup), LIBRARIES)
  const prepared = prepareShowV2ForCompile(v2After, lookup)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  const v2Compiled = compileShow(prepared.recipe, LIBRARIES)
  expect(v2Compiled.code).toBe(v1Compiled.code)
  const { runtimeParity } = await import('../../scripts/show-v2-parity')
  for (const fidelity of ['fast', 'fidelity'] as const) {
    expect(runtimeParity(v1Compiled, v2Compiled, v1After, v2After, fidelity, []).matched).toBe(true)
  }
}

describe('Zone Layout Insert here v2 owner (#1066 slice 8b-2a)', () => {
  it('oracle t=3000 5s matches v1 Insert apart from accepted representation and marker ripple', async () => {
    const base = researchBaseWithSplit()
    const withCopy = addShowRoutingLayout(base, undefined, 'layout-1')
    const copyId = withCopy.routingLayouts[1].id
    const copyName = withCopy.routingLayouts[1].name
    const v1After = insertShowLayoutInterval(withCopy, { layoutId: copyId, durationMs: 5000, atMs: 3000 })
    const convAfter = convertShowRecordV1ToV2(v1After)
    expect(convAfter.status).toBe('converted')
    if (convAfter.status !== 'converted') return
    const convBefore = convertShowRecordV1ToV2(base)
    expect(convBefore.status).toBe('converted')
    if (convBefore.status !== 'converted') return
    const layoutId = convAfter.record.zoneLayouts.find(layout => layout.id !== 'layout-1')!.id
    expect(layoutId).toBe(copyId)
    // Converted occurrence identities collide with convBefore's (both mint
    // layout-occurrence:N), so the v2 intent uses fresh identities. The v1
    // path also renumbers every occurrence, while v2 keeps pre-existing
    // identities, so the structural comparison maps actual identities onto
    // expected ones positionally in one pass.
    const expectedIds = convAfter.record.composition.layoutOccurrences.map(occurrence => occurrence.id)
    const expectedIntervalId = expectedIds[1]
    const expectedResumeId = expectedIds[2]
    const intervalId = 'occ-split-interval'
    const resumeId = 'occ-split-resume'
    const rightId = convAfter.record.composition.clips.find(clip => clip.id !== 'clip-a' && clip.id !== 'clip-b')!.id
    const result = insertShowLayoutIntervalV2(convBefore.record, {
      kind: 'insert-interval',
      atMs: 3000,
      durationMs: 5000,
      layoutId,
      definition: { kind: 'duplicate', layoutId, name: copyName, sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: intervalId, resume: resumeId },
      rightClipIds: { 'clip-a': rightId },
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(convAfter.record.composition.layoutOccurrences.find(occurrence => occurrence.id === expectedIntervalId)?.parameters).toEqual({})
    expect(convAfter.record.composition.layoutOccurrences.find(occurrence => occurrence.id === expectedResumeId)?.parameters).toEqual({ splitPosition: 0.3 })
    expect(result.record.composition.layoutOccurrences.find(occurrence => occurrence.id === intervalId)?.parameters).toEqual({})
    expect(result.record.composition.layoutOccurrences.find(occurrence => occurrence.id === resumeId)?.parameters).toEqual({ splitPosition: 0.3 })
    expect(convAfter.record.composition.markers.find(marker => marker.id === 'm-late')?.timeMs).toBe(15000)
    expect(result.record.composition.markers.find(marker => marker.id === 'm-late')?.timeMs).toBe(20000)
    const expected = structuredClone(convAfter.record)
    const actual = structuredClone(result.record)
    expected.updatedAt = 0
    actual.updatedAt = 0
    actual.composition.markers.find(marker => marker.id === 'm-late')!.timeMs = 15000
    const actualIds = actual.composition.layoutOccurrences.map(occurrence => occurrence.id)
    expect(actualIds).toHaveLength(expectedIds.length)
    const idMap = new Map(actualIds.map((id, index) => [id, expectedIds[index]]))
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const renamedActual = JSON.parse(
      JSON.stringify(actual).replace(
        new RegExp([...idMap.keys()].map(escapeRegExp).join('|'), 'g'),
        match => idMap.get(match)!,
      ),
    )
    expect(structuralInsertOracle(renamedActual)).toEqual(structuralInsertOracle(expected))
    await expectInsertRuntimeParity(v1After, result.record)
  })

  it('oracle t=15000 inside scene-2 matches v1 Insert apart from accepted representation and marker ripple', async () => {
    const base = researchBase()
    const withCopy = addShowRoutingLayout(base, undefined, 'layout-1')
    const copyId = withCopy.routingLayouts[1].id
    const copyName = withCopy.routingLayouts[1].name
    const v1After = insertShowLayoutInterval(withCopy, { layoutId: copyId, durationMs: 5000, atMs: 15000 })
    const convAfter = convertShowRecordV1ToV2(v1After)
    expect(convAfter.status).toBe('converted')
    if (convAfter.status !== 'converted') return
    const convBefore = convertShowRecordV1ToV2(base)
    expect(convBefore.status).toBe('converted')
    if (convBefore.status !== 'converted') return
    const layoutId = convAfter.record.zoneLayouts.find(layout => layout.id !== 'layout-1')!.id
    const intervalId = convAfter.record.composition.layoutOccurrences[1].id
    const resumeId = convAfter.record.composition.layoutOccurrences[2].id
    const spanning = convBefore.record.composition.clips.filter(clip => clip.startMs < 15000 && clip.startMs + clip.durationMs > 15000)
    expect(spanning.map(clip => clip.id)).toEqual(['clip-b'])
    const rightId = convAfter.record.composition.clips.find(clip => clip.id !== 'clip-a' && clip.id !== 'clip-b')!.id
    const result = insertShowLayoutIntervalV2(convBefore.record, {
      kind: 'insert-interval',
      atMs: 15000,
      durationMs: 5000,
      layoutId,
      definition: { kind: 'duplicate', layoutId, name: copyName, sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: intervalId, resume: resumeId },
      rightClipIds: { 'clip-b': rightId },
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(convAfter.record)
    const actual = structuredClone(result.record)
    const expectedLate = expected.composition.markers.find(marker => marker.id === 'm-late')?.timeMs
    const actualLate = actual.composition.markers.find(marker => marker.id === 'm-late')?.timeMs
    expect(expectedLate).toBe(15000)
    expect(actualLate).toBe(20000)
    expected.updatedAt = 0
    actual.updatedAt = 0
    actual.composition.markers.find(marker => marker.id === 'm-late')!.timeMs = 15000
    expect(structuralInsertOracle(actual)).toEqual(structuralInsertOracle(expected))
    await expectInsertRuntimeParity(v1After, result.record)
  })

  it('t=0 prepends the fresh layout and splits nothing', () => {
    const before = convertedBefore()
    const endBefore = before.composition.showEndMs
    const firstLayout = before.composition.layoutOccurrences[0].layoutId
    const clipCount = before.composition.clips.length
    const result = insertShowLayoutIntervalV2(before, {
      kind: 'insert-interval',
      atMs: 0,
      durationMs: 5000,
      layoutId: 'layout-2',
      definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: 'occ-interval', resume: 'occ-resume' },
      rightClipIds: {},
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.showEndMs).toBe(endBefore + 5000)
    expect(result.record.composition.layoutOccurrences).toHaveLength(2)
    expect(result.record.composition.layoutOccurrences[0]).toMatchObject({ startMs: 0, durationMs: 5000, layoutId: 'layout-2' })
    expect(result.record.composition.layoutOccurrences[1]).toMatchObject({ startMs: 5000, layoutId: firstLayout })
    expect(result.record.composition.clips.map(clip => clip.id).sort()).toEqual(before.composition.clips.map(clip => clip.id).sort())
    expect(result.record.composition.clips).toHaveLength(clipCount)
  })

  it('t=0 keeps the original split position on the resumed occurrence', () => {
    const converted = convertShowRecordV1ToV2(researchBaseWithSplit())
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const before = converted.record
    const firstLayout = before.composition.layoutOccurrences[0].layoutId
    const result = insertShowLayoutIntervalV2(before, {
      kind: 'insert-interval',
      atMs: 0,
      durationMs: 5000,
      layoutId: 'layout-2',
      definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: 'occ-zero-i', resume: 'occ-zero-r' },
      rightClipIds: {},
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.layoutOccurrences).toHaveLength(3)
    expect(result.record.composition.layoutOccurrences[0]).toMatchObject({ startMs: 0, durationMs: 5000, layoutId: 'layout-2' })
    expect(result.record.composition.layoutOccurrences[0].parameters).toEqual({})
    expect(result.record.composition.layoutOccurrences[1]).toMatchObject({ startMs: 5000, layoutId: firstLayout })
    expect(result.record.composition.layoutOccurrences[1].parameters).toEqual({ splitPosition: 0.3 })
  })

  it('refuses a malformed record without throwing', () => {
    const source = convertedBefore()
    source.composition.transitions[0].participants[0].fromClipId = 'missing-clip'
    const before = structuredClone(source)
    let result: ReturnType<typeof insertShowLayoutIntervalV2> | undefined
    expect(() => {
      result = insertShowLayoutIntervalV2(source, {
        kind: 'insert-interval',
        atMs: 3000,
        durationMs: 5000,
        layoutId: 'layout-2',
        definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
        occurrenceIds: { interval: 'occ-bad-i', resume: 'occ-bad-r' },
        rightClipIds: { 'clip-a': 'clip-a-bad-right' },
      })
    }).not.toThrow()
    expect(result?.status).toBe('refused')
    if (!result || result.status !== 'refused') return
    expect(result.code).toBe('invalid-record')
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('refuses inside and at the edge of the crossfade window with the record unchanged', () => {
    for (const atMs of [10000, 12000]) {
      const source = convertedBefore()
      const before = structuredClone(source)
      const result = insertShowLayoutIntervalV2(source, {
        kind: 'insert-interval',
        atMs,
        durationMs: 5000,
        layoutId: 'layout-2',
        definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
        occurrenceIds: { interval: `occ-i-${atMs}`, resume: `occ-r-${atMs}` },
        rightClipIds: {},
      })
      expect(result.status).toBe('refused')
      if (result.status !== 'refused') continue
      expect(result.code).toBe('boundary-crossing-content')
      expect(result.record).toBe(source)
      expect(source).toEqual(before)
    }
  })

  it('refuses when a Group occurrence spans the insert time', () => {
    const source = withSpanningGroup(convertedBefore())
    const before = structuredClone(source)
    const result = insertShowLayoutIntervalV2(source, {
      kind: 'insert-interval',
      atMs: 3000,
      durationMs: 5000,
      layoutId: 'layout-2',
      definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: 'occ-interval', resume: 'occ-resume' },
      rightClipIds: { 'clip-a': 'clip-a-right' },
    })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('boundary-crossing-content')
    expect(result.message).toBe('Insert here cannot split a Group occurrence.')
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('refuses when rightClipIds misses a spanning Clip or names an extra one', () => {
    const missingSource = convertedBefore()
    const missingBefore = structuredClone(missingSource)
    const missing = insertShowLayoutIntervalV2(missingSource, {
      kind: 'insert-interval',
      atMs: 3000,
      durationMs: 5000,
      layoutId: 'layout-2',
      definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: 'occ-i-m', resume: 'occ-r-m' },
      rightClipIds: {},
    })
    expect(missing.status).toBe('refused')
    if (missing.status === 'refused') {
      expect(missing.code).toBe('invalid-intent')
      expect(missing.record).toBe(missingSource)
      expect(missingSource).toEqual(missingBefore)
    }
    const extraSource = convertedBefore()
    const extraBefore = structuredClone(extraSource)
    const extra = insertShowLayoutIntervalV2(extraSource, {
      kind: 'insert-interval',
      atMs: 3000,
      durationMs: 5000,
      layoutId: 'layout-2',
      definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: 'occ-i-e', resume: 'occ-r-e' },
      rightClipIds: { 'clip-a': 'clip-a-right', 'clip-b': 'clip-b-right' },
    })
    expect(extra.status).toBe('refused')
    if (extra.status === 'refused') {
      expect(extra.code).toBe('invalid-intent')
      expect(extra.record).toBe(extraSource)
      expect(extraSource).toEqual(extraBefore)
    }
  })

  it('leaves the gap blank and grows Show End by the inserted duration', () => {
    const before = convertedBefore()
    const endBefore = before.composition.showEndMs
    const atMs = 3000
    const durationMs = 5000
    const result = insertShowLayoutIntervalV2(before, {
      kind: 'insert-interval',
      atMs,
      durationMs,
      layoutId: 'layout-2',
      definition: { kind: 'duplicate', layoutId: 'layout-2', name: 'Physical ranges', sourceLayoutId: 'layout-1' },
      occurrenceIds: { interval: 'occ-gap-i', resume: 'occ-gap-r' },
      rightClipIds: { 'clip-a': 'clip-a-gap-right' },
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.showEndMs).toBe(endBefore + durationMs)
    for (const clip of result.record.composition.clips) {
      const overlaps = clip.startMs < atMs + durationMs && clip.startMs + clip.durationMs > atMs
      expect(overlaps).toBe(false)
    }
  })
})
