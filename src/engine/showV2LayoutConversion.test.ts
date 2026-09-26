import { expect, it } from 'vitest'
import { continuingV1Show, convertibleV1Show } from '../test/showV2TracerFixture'
import { showRemoveClipFixture } from '../test/showRemoveClipFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { validateShowRecordV2 } from './showCompositionV2'
import { compileShow } from './showCompiler'
import { frozenV1Output } from '../test/v1AuthoringOracles'
import { LIBRARIES } from '../pixelblaze/libs'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'

function layoutSource() {
  const source = continuingV1Show()
  source.routingLayouts.push({ ...structuredClone(source.routingLayouts[0]), id: 'second', name: 'Second' })
  source.transitions = [{ id: 'transfer', afterSceneId: 'scene-a', kind: 'routing', layoutId: 'second', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' }, routingDirection: 'reverse' }]
  return source
}

it('preserves Layout transfer easing and shared identity through conversion and compilation', () => {
  const source = layoutSource()
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  expect(source).toEqual(before)
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  expect(converted.record.composition.patternInstances).toHaveLength(1)
  expect(converted.record.composition.layoutOccurrences[1]).toMatchObject({ startMs: 500, incomingTransfer: { id: 'transfer', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' }, direction: 'reverse' } })
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y) { rgb(x,y,0) }' }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.recipe.routingSwitches).toEqual([{ atMs: 500, layoutId: 'second', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' }, direction: 'reverse' }])
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})


it('lowers Layout occurrences by authored time rather than array order', () => {
  const converted = convertShowRecordV1ToV2(layoutSource())
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y) { rgb(x,y,0) }' }, stageDimension: 2 as const }
  const ordered = prepareShowV2ForCompile(converted.record, lookup)
  converted.record.composition.layoutOccurrences.reverse()
  expect(prepareShowV2ForCompile(converted.record, lookup)).toEqual(ordered)
})

it('rejects a transfer that references its own occurrence', () => {
  const converted = convertShowRecordV1ToV2(layoutSource())
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  const target = converted.record.composition.layoutOccurrences[1]
  target.incomingTransfer!.fromOccurrenceId = target.id
  expect(validateShowRecordV2(converted.record)).not.toEqual([])
})

it('preserves a two-Zone spatial transfer in Fast and Precise through the second loop', async () => {
  const { runtimeParity } = await import('../../scripts/show-v2-parity')
  const source = layoutSource()
  source.zones = [{ id: 'left', name: 'Left', nominalPixelCount: 8 }, { id: 'right', name: 'Right', nominalPixelCount: 8 }]
  source.routingLayouts = [
    { id: 'layout', name: 'Vertical', zones: [], logical: { kind: 'split', zoneIds: ['left', 'right'], axis: 'x' } },
    { id: 'second', name: 'Horizontal', zones: [], logical: { kind: 'split', zoneIds: ['left', 'right'], axis: 'y' } },
  ]
  source.composition!.patternInstances.push({ ...structuredClone(source.composition!.patternInstances[0]), id: 'right-instance' })
  source.composition!.scenes.forEach((scene, index) => {
    const left = scene.zones[0]
    left.zoneId = 'left'
    const right = structuredClone(left)
    right.zoneId = 'right'
    right.main[0].id = index === 0 ? 'right-clip' : 'right-clip--span-scene-b'
    if (index > 0) right.main[0].logicalClipId = 'right-clip'
    right.main[0].instanceId = 'right-instance'
    scene.zones.push(right)
  })
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const lookup = { byCellId: {}, byPatternInstanceId: {
    instance: 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(1,0,0) }',
    'right-instance': 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(0,0,1) }',
  }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const before = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const after = compileShow(prepared.recipe, LIBRARIES)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(before, after, source, converted.record, fidelity, []).matched).toBe(true)
})

it('keeps a split gapped Clip byte-identical through compile and replay in Fast and Precise (#1080)', async () => {
  const { runtimeParity } = await import('../../scripts/show-v2-parity')
  const source = continuingV1Show()
  source.composition!.durationMs = 1200
  source.transitions = [{
    id: 'fade', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200,
    easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' ? converted.issues : [])).toBe('converted')
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  const lookup = { byCellId: {}, byPatternInstanceId: {
    instance: 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(1,0,0) }',
  }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('preparation refused')
  const before = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const after = compileShow(prepared.recipe, LIBRARIES)
  expect(after.code).toBe(before.code)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(before, after, source, converted.record, fidelity, []).matched).toBe(true)
})

it('promotes a Clip Viewport on 1D members with a 2D Stage map and downgrades it without one (#1080)', () => {
  const censusCases: Array<{ stageMapId: string | null; stageDimension: 2 | undefined; promoted: boolean }> = [
    { stageMapId: 'plane', stageDimension: 2, promoted: true },
    { stageMapId: null, stageDimension: undefined, promoted: false },
  ]
  for (const { stageMapId, stageDimension, promoted } of censusCases) {
    const show = createDefaultShow('census-1080', 'Census', 1)
    show.transitions = show.transitions.map((transition) => (
      transition.kind === 'crossfade' ? { ...transition, crossfadePolicy: 'live-live' as const } : transition
    ))
    show.cells[0] = {
      ...show.cells[0],
      viewport: { enabled: true, x: 0, y: 0, width: 1, height: 1, aperture: 'ellipse' },
    }
    show.stageMapId = stageMapId
    const lookup = {
      byCellId: { 'cell-1': DEMOS.TestPattern1D, 'cell-2': DEMOS.CometLoom },
      ...(stageDimension === undefined ? {} : { stageDimension }),
    }
    const v1 = compileShow(showRecordToCompileRecipe(show, lookup), LIBRARIES)
    const converted = convertShowRecordV1ToV2(show, lookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const v2Lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(
        (instance) => [instance.id, DEMOS[instance.pattern.id]],
      )),
      ...(stageDimension === undefined ? {} : { stageDimension }),
    }
    const prepared = prepareShowV2ForCompile(converted.record, v2Lookup)
    expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
    if (prepared.status !== 'ready') return
    const v2 = compileShow(prepared.recipe, LIBRARIES)
    if (promoted) {
      expect(v1.code).toContain('export function render2D(index, x, y)')
      expect(v2.code).toContain('export function render2D(index, x, y)')
    } else {
      expect(v1.code).toContain('export function render(index)')
      expect(v1.code).not.toContain('export function render2D')
      expect(v2.code).toContain('export function render(index)')
      expect(v2.code).not.toContain('export function render2D')
    }
    expect(v2.code).toBe(v1.code)
  }
})

const CLASS3_SOURCE = 'export var calls=0; export function beforeRender(delta) { calls = calls + 1 } export function render2D(index,x,y) { rgb(1,x,y) }'

function class3V1Lookup(show: ShowRecord) {
  const byPatternInstanceId: Record<string, string> = Object.fromEntries(
    show.composition!.patternInstances.map(instance => [instance.id, CLASS3_SOURCE]),
  )
  for (const occurrence of show.composition!.groupOccurrences ?? []) {
    const definition = show.composition!.groupDefinitions?.find(candidate => candidate.id === occurrence.definitionId)
    if (!definition) throw new Error(`Missing group definition "${occurrence.definitionId}"`)
    for (const instance of definition.patternInstances) byPatternInstanceId[`${occurrence.id}:${instance.id}`] = CLASS3_SOURCE
  }
  return {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, CLASS3_SOURCE])),
    byPatternInstanceId,
    stageDimension: 2 as const,
  }
}

function class3V2Lookup(record: Parameters<typeof prepareShowV2ForCompile>[0]) {
  return {
    byCellId: {},
    byPatternInstanceId: Object.fromEntries([
      ...record.composition.patternInstances.map(instance => [instance.id, CLASS3_SOURCE]),
      ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances.map(instance => [instance.id, CLASS3_SOURCE])),
    ]),
    stageDimension: 2 as const,
  }
}

it('keeps the mixed e2e 2839 fixture byte-identical through compile and replay in Fast and Precise (#1080 class 3)', async () => {
  const { runtimeParity } = await import('../../scripts/show-v2-parity')
  const source = showRemoveClipFixture()
  // The fixture carries an unrelated orphan instance plus an orphan track that
  // throw in standalone v1 compileShow; the oracle strips both, as the class 3
  // research probe did, since they are unrelated to transition lowering.
  expect(() => compileShow(showRecordToCompileRecipe(source, class3V1Lookup(source)), LIBRARIES)).toThrow('orphan-track')
  const stripped = structuredClone(source)
  stripped.composition!.patternInstances = stripped.composition!.patternInstances.filter(instance => instance.id !== 'unrelated-orphan')
  for (const scene of stripped.composition!.scenes) {
    scene.propertyTracks = scene.propertyTracks?.filter(track => track.id !== 'orphan-track')
  }
  const converted = convertShowRecordV1ToV2(stripped)
  expect(converted.status, JSON.stringify(converted.status === 'refused' ? converted.issues : [])).toBe('converted')
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  expect(validateShowRecordV2(converted.record)).toEqual([])
  const prepared = prepareShowV2ForCompile(converted.record, class3V2Lookup(converted.record))
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('preparation refused')
  const before = compileShow(showRecordToCompileRecipe(stripped, class3V1Lookup(stripped)), LIBRARIES)
  const after = compileShow(prepared.recipe, LIBRARIES)
  expect(after.code).toBe(before.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    expect(runtimeParity(before, after, stripped, converted.record, fidelity, []).matched).toBe(true)
  }
})

function mixedBoundaryLayerShow(testName: string): ShowRecord {
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 6000 },
    { id: 'scene-b', name: 'Incoming', durationMs: 6000 },
  ]
  source.composition!.durationMs = 14000
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [
        {
          id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 2000,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
        {
          // Abutting so the Layer insertion finds its cut junction; insertion
          // shifts this Clip later by the Transition duration.
          id: 'clip-b', instanceId: 'instance', startMs: 2000, durationMs: 2000,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
      ], overlays: [] }],
    },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [], overlays: [] }] },
  ]
  source.transitions = [{
    id: 'boundary', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 2000,
    easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  const withLayer = frozenV1Output<ShowCompositionV1>(`showV2LayoutConversion.test.ts::${testName}::1`)
  if (withLayer === source.composition) throw new Error('Synthetic layer transition refused')
  source.composition = withLayer
  return source
}

it('keeps a synthetic mixed boundary with empty contributors plus a Layer Transition byte-identical (#1080 class 3)', async () => {
  const { runtimeParity } = await import('../../scripts/show-v2-parity')
  const source = mixedBoundaryLayerShow('keeps a synthetic mixed boundary with empty contributors plus a Layer Transition byte-identical (#1080 class 3)')
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' ? converted.issues : [])).toBe('converted')
  if (converted.status !== 'converted') throw new Error('synthetic conversion failed')
  const boundary = converted.record.composition.transitions.find(transition => transition.wholeOutput !== undefined)
  expect(boundary?.wholeOutput).toMatchObject({ fromClipIds: [], toClipIds: [] })
  expect(converted.record.composition.transitions.some(transition => transition.wholeOutput === undefined)).toBe(true)
  const prepared = prepareShowV2ForCompile(converted.record, class3V2Lookup(converted.record))
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('preparation refused')
  const before = compileShow(showRecordToCompileRecipe(source, class3V1Lookup(source)), LIBRARIES)
  const after = compileShow(prepared.recipe, LIBRARIES)
  expect(after.code).toBe(before.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    expect(runtimeParity(before, after, source, converted.record, fidelity, []).matched).toBe(true)
  }
})

it('refuses a Layer Transition whose window crosses a section edge in a mixed record (#1080 class 3)', () => {
  const converted = convertShowRecordV1ToV2(mixedBoundaryLayerShow('refuses a Layer Transition whose window crosses a section edge in a mixed record (#1080 class 3)'))
  if (converted.status !== 'converted') throw new Error('synthetic conversion failed')
  const record = structuredClone(converted.record)
  const layer = record.composition.transitions.find(transition => transition.wholeOutput === undefined)!
  const from = record.composition.clips.find(clip => clip.id === layer.participants[0].fromClipId)!
  const incoming = record.composition.clips.find(clip => clip.id === layer.participants[0].toClipId)!
  const windowStart = from.startMs + from.durationMs
  const windowEnd = incoming.startMs
  const middle = (windowStart + windowEnd) / 2
  // A directly constructed v2 overlay Layer and Clip spanning the Layer
  // window, with an appearance key that puts a derived section edge inside
  // the window. The overlay Layer keeps the spanning Clip clear of the
  // same-Layer overlap rule; Layers own no section edges.
  const template = incoming
  const keyValue = structuredClone(template.appearance.keys[0].value)
  record.composition.layers.push({ id: 'overlay-layer', zoneId: template.zoneId, name: 'Overlay', rank: 1 })
  record.composition.clips.push({
    id: 'spanning-clip',
    instanceId: template.instanceId,
    zoneId: template.zoneId,
    layerId: 'overlay-layer',
    startMs: windowStart - 500,
    durationMs: (windowEnd - windowStart) + 1000,
    entryPolicy: template.entryPolicy,
    zoneSampleMode: template.zoneSampleMode,
    appearance: { keys: [
      { id: 'spanning-key-0', timeMs: windowStart - 500, value: structuredClone(keyValue) },
      { id: 'section-edge-key', timeMs: middle, value: keyValue },
    ] },
  })
  expect(validateShowRecordV2(record)).toEqual([])
  expect(prepareShowV2ForCompile(record, class3V2Lookup(record))).toMatchObject({
    status: 'refused',
    issues: expect.arrayContaining([expect.objectContaining({
      code: 'unsupported-transition-participants',
      message: 'These Transitions cannot be compiled in this arrangement yet.',
      detail: 'A Layer Transition must sit inside one section of a Show with whole-output boundaries.',
    })]),
  })
})
