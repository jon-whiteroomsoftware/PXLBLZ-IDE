import { describe, expect, it } from 'vitest'
import { continuingV1Show, convertibleV1Show, flatV1Show } from '../test/showV2TracerFixture'
import { showRemoveClipFixture } from '../test/showRemoveClipFixture'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '../pixelblaze/libs'
import { stockShowById } from '../pixelblaze/stock/shows'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { auditShowV1ToV2Accounting, convertShowRecordV1ToV2 } from './showRecordV1ToV2'

describe('convertShowRecordV1ToV2', () => {
  it('converts global Clip and stable Layer identity without mutating or leaving source paths unaccounted', () => {
    const source = convertibleV1Show()
    const before = JSON.stringify(source)

    const result = convertShowRecordV1ToV2(source)

    if (result.status === 'refused') expect(result.issues).toEqual([])
    expect(result).toMatchObject({ status: 'converted' })
    if (result.status !== 'converted') return
    expect(result.record.composition.layers).toEqual([
      { id: 'layer:zone:main', zoneId: 'zone', name: 'Main', rank: 0 },
      { id: 'layer:zone:overlay:1', zoneId: 'zone', name: 'Atmosphere', rank: 1 },
    ])
    expect(result.record.composition.clips).toEqual([expect.objectContaining({
      id: 'clip', layerId: 'layer:zone:main', zoneId: 'zone', startMs: 0, durationMs: 1_000,
    })])
    expect(result.report.unaccountedSourcePaths).toEqual([])
    expect(result.report.accounting.length).toBeGreaterThan(0)
    expect(JSON.stringify(source)).toBe(before)
  })

  it.each([
    ['opacity', (placement: ReturnType<typeof secondLogicalSegment>) => { placement.opacity = 0.25 }],
    ['Transform', (placement: ReturnType<typeof secondLogicalSegment>) => {
      placement.transform = { positionX: 0.25, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
    }],
    ['Aperture', (placement: ReturnType<typeof secondLogicalSegment>) => {
      placement.viewport = { enabled: true, x: 0.1, y: 0, width: 0.8, height: 1 }
    }],
  ] as const)('preserves divergent logical-segment %s as held appearance keys', (_field, change) => {
    const source = convertibleV1Show()
    source.scenes = [
      { id: 'scene-a', name: 'Opening', durationMs: 500 },
      { id: 'scene-b', name: 'Closing', durationMs: 500 },
    ]
    source.composition!.scenes = [
      {
        sceneId: 'scene-a',
        zones: [{ zoneId: 'zone', main: [{
          id: 'clip', instanceId: 'instance', startMs: 0, durationMs: 500,
          view: { mirror: false, phase: 0, brightness: 1 },
        }], overlays: [] }],
      },
      {
        sceneId: 'scene-b',
        zones: [{ zoneId: 'zone', main: [{
          id: 'clip--span-scene-b', logicalClipId: 'clip', instanceId: 'instance', startMs: 0, durationMs: 500,
          view: { mirror: false, phase: 0, brightness: 1 },
        }], overlays: [] }],
      },
    ]
    change(secondLogicalSegment(source))
    const before = JSON.stringify(source)

    const result = convertShowRecordV1ToV2(source)

    expect(result).toMatchObject({ status: 'converted' })
    if (result.status !== 'converted') return
    expect(result.record.composition.clips).toEqual([expect.objectContaining({
      id: 'clip',
      appearance: { keys: [
        expect.objectContaining({ timeMs: 0 }),
        expect.objectContaining({ timeMs: 500 }),
      ] },
    })])
    expect(result.report.unaccountedSourcePaths).toEqual([])
    expect(JSON.stringify(source)).toBe(before)
  })

  it('refuses ambiguous Scene-local Layer names instead of selecting the first', () => {
    const source = convertibleV1Show()
    source.scenes = [
      { id: 'scene-a', name: 'Opening', durationMs: 500 },
      { id: 'scene-b', name: 'Closing', durationMs: 500 },
    ]
    source.composition!.scenes[0].zones[0].main[0].durationMs = 500
    source.composition!.scenes.push({
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [], overlays: [{ id: 'other-overlay', name: 'Different', placements: [] }] }],
    })

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({ code: 'ambiguous-layer', path: expect.stringContaining('overlays[0].name') })]),
    })
  })

  it('preserves an unstamped composition as continuous instead of inventing loop reset', () => {
    const source = convertibleV1Show()
    delete source.composition!.executionModel
    const before = JSON.stringify(source)

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'converted',
      record: { composition: { executionModel: 'continuous' } },
      report: { unaccountedSourcePaths: [] },
    })
    expect(JSON.stringify(source)).toBe(before)
  })

  it('projects a flat record through exact source identities and accounts for its original cells', () => {
    const source = flatV1Show()
    const before = JSON.stringify(source)
    const result = convertShowRecordV1ToV2(source, {
      byCellId: { 'cell-a': 'source' },
    })

    expect(result).toMatchObject({
      status: 'converted',
      record: { composition: { executionModel: 'continuous' } },
      report: {
        flatProjectionMappings: [{
          cellId: 'cell-a',
          placementIds: ['placement-cell-a-scene-a', 'placement-cell-a-scene-b'],
          patternInstanceIds: [expect.any(String)],
        }],
        unaccountedSourcePaths: [],
      },
    })
    expect(JSON.stringify(source)).toBe(before)
  })

  it.each([
    ['Freeze presentation', { presentation: { mode: 'freeze' as const } }],
    ['Blink visibility', { blink: { rateHz: 2, duty: 0.25, phase: 0.125 } }],
  ])('preserves flat %s on every projected Clip appearance', (_label, appearance) => {
    const source = flatV1Show()
    Object.assign(source.cells[0], appearance)

    const result = convertShowRecordV1ToV2(source, { byCellId: { 'cell-a': 'source' } })

    expect(result).toMatchObject({ status: 'converted' })
    if (result.status !== 'converted') return
    expect(result.record.composition.clips).toHaveLength(2)
    expect(result.record.composition.clips.every(clip => (
      clip.appearance.keys.every(key => expect(key.value).toEqual(expect.objectContaining(appearance)))
    ))).toBe(true)
    expect(result.report.accounting).toEqual(expect.arrayContaining(
      Object.keys(appearance).flatMap(field => (
        result.report.accounting
          .filter(entry => entry.sourcePath.startsWith(`cells.0.${field}.`))
          .map(entry => expect.objectContaining({ sourcePath: entry.sourcePath, outcome: 'mapped' }))
      )),
    ))
    expect(result.report.unaccountedSourcePaths).toEqual([])
  })

  it('finds a known mapped leaf when its candidate output correspondence is removed', () => {
    const source = flatV1Show()
    source.cells[0].blink = { rateHz: 2, duty: 0.25, phase: 0.125 }
    const conversion = convertShowRecordV1ToV2(source, { byCellId: { 'cell-a': 'source' } })
    expect(conversion).toMatchObject({ status: 'converted' })
    if (conversion.status !== 'converted') return
    const candidate = structuredClone(conversion.record)
    delete candidate.composition.clips[0].appearance.keys[0].value.blink

    const audit = auditShowV1ToV2Accounting(source, candidate, conversion.report)

    expect(audit.unaccountedSourcePaths).toEqual([
      'cells.0.blink.rateHz',
      'cells.0.blink.duty',
      'cells.0.blink.phase',
    ])
  })

  it('refuses an unknown output-affecting flat Cell field before accounting can bless it', () => {
    const source = flatV1Show()
    const cell = source.cells[0] as typeof source.cells[number] & { shaderSeed?: number }
    cell.shaderSeed = 17

    expect(convertShowRecordV1ToV2(source, { byCellId: { 'cell-a': 'source' } })).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({
        code: 'unknown-source-field',
        path: '/cells/0',
      })]),
      report: { unaccountedSourcePaths: [] },
    })
  })

  it('records explicit provenance when composition authority retires legacy flat Cell shadows', () => {
    const source = convertibleV1Show()
    source.cells = flatV1Show().cells

    const result = convertShowRecordV1ToV2(source)

    expect(result).toMatchObject({
      status: 'converted',
      report: {
        retiredFlatCellShadows: [{
          sourceCellId: 'cell-a',
          sourcePath: 'cells.0',
          outcome: 'retired-composition-shadow',
        }],
        unaccountedSourcePaths: [],
      },
    })
    if (result.status !== 'converted') return
    expect(result.report.accounting.filter(entry => entry.sourcePath.startsWith('cells.0.')))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ outcome: 'retired-source-structure', targetPath: 'composition' }),
      ]))
  })

  it('refuses flat conversion when an exact source dependency is absent', () => {
    const source = flatV1Show()
    expect(convertShowRecordV1ToV2(source, { byCellId: {} })).toMatchObject({
      status: 'refused',
      issues: [{ code: 'missing-source-dependency', path: 'cells[0].pattern' }],
      report: { unaccountedSourcePaths: [] },
    })
  })

  it('refuses an unknown v1 extension instead of accounting for payload it drops as preserved', () => {
    const source = convertibleV1Show() as ReturnType<typeof convertibleV1Show> & { experimental?: unknown }
    source.experimental = { authored: true }

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({
        code: 'unknown-source-field',
        path: '/',
      })]),
      report: { unaccountedSourcePaths: [] },
    })
  })

  it('retires a carrier-free boundary Cut after accounting for its boundary time', () => {
    const source = continuingCutShow()
    const before = JSON.stringify(source)

    const result = convertShowRecordV1ToV2(source)

    expect(result).toMatchObject({
      status: 'converted',
      record: { composition: { transitions: [] } },
      report: {
        retiredStructuralCuts: [{
          sourceTransitionId: 'cut-a',
          afterSceneId: 'scene-a',
          atMs: 500,
          outcome: 'retired-structural-cut',
        }],
        unaccountedSourcePaths: [],
      },
    })
    if (result.status !== 'converted') return
    expect(result.report.accounting.filter(entry => entry.sourcePath.startsWith('transitions.0.')))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ outcome: 'retired-source-structure', targetPath: 'composition.clips/markers' }),
      ]))
    expect(JSON.stringify(source)).toBe(before)
  })

  it.each([
    ['explicit values', 0.25, 0.75],
    ['initial default', undefined, 0.75],
    ['later default', 0.25, undefined],
  ] as const)('preserves changed split positions as explicit Layout occurrences across a carrier-free Cut: %s', (_name, first, second) => {
    const source = continuingCutShow()
    if (first !== undefined) source.scenes[0].routingTargets = { splitPosition: first }
    if (second !== undefined) source.scenes[1].routingTargets = { splitPosition: second }
    const before = JSON.stringify(source)

    const converted = convertShowRecordV1ToV2(source)
    expect(converted).toMatchObject({ status: 'converted', report: { unaccountedSourcePaths: [] } })
    if (converted.status === 'converted') {
      expect(converted.record.composition.layoutOccurrences.map(occurrence => occurrence.parameters.splitPosition ?? 0.5)).toEqual([first ?? 0.5, second ?? 0.5])
    }
    expect(JSON.stringify(source)).toBe(before)
  })

  it('accepts explicit and omitted split positions when both mean the v1 default', () => {
    const source = continuingCutShow()
    source.scenes[1].routingTargets = { splitPosition: 0.5 }

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'converted',
      record: { composition: { layoutOccurrences: [{ parameters: { splitPosition: 0.5 } }] } },
      report: { unaccountedSourcePaths: [] },
    })
  })

  it('refuses a Cut carrying transition-only payload instead of retiring it', () => {
    const source = continuingCutShow()
    source.transitions[0].color = '#fff'

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'refused',
      issues: [expect.objectContaining({ code: 'unsupported-cut-identity', path: 'transitions[0].color' })],
    })
  })

  it('preserves a real stock Group record with complete source accounting', () => {
    const source = stockShowById('stock-show-205-groups-linked-reuse')?.show
    expect(source).toBeTruthy()
    if (!source) return

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'converted',
      report: { unaccountedSourcePaths: [] },
    })
  })
})

function secondLogicalSegment(source: ReturnType<typeof convertibleV1Show>) {
  return source.composition!.scenes[1].zones[0].main[0]
}

function continuingCutShow() {
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  source.transitions = [{
    id: 'cut-a', afterSceneId: 'scene-a', kind: 'cut', durationMs: 0, easing: { curve: 'linear' },
  }]
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
      }], overlays: [] }],
    },
    {
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip--span-scene-b', logicalClipId: 'clip', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
      }], overlays: [] }],
    },
  ]
  return source
}

function bothPopulatedDivergentLayers() {
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [], overlays: [{
        id: 'overlay-a', name: 'Atmosphere', placements: [{
          id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 500, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }] }],
    },
    {
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [], overlays: [{
        id: 'overlay-b', name: 'Different', placements: [{
          id: 'clip-b', instanceId: 'instance', startMs: 0, durationMs: 500, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }] }],
    },
  ]
  return source
}

it('resolves two surviving overlay names to the first Scene\'s name', () => {
  const source = showRemoveClipFixture()
  const before = JSON.stringify(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(JSON.stringify(source)).toBe(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(result.record.composition.layers).toContainEqual(
    expect.objectContaining({ id: 'layer:zone-1:overlay:2', zoneId: 'zone-1', name: 'Overlay 1', rank: 2 }),
  )
  expect(result.report.layerMappings).toEqual(expect.arrayContaining([
    expect.objectContaining({ sceneId: 'scene-1', zoneId: 'zone-1', sourceLayerId: 'overlay-1', layerId: 'layer:zone-1:overlay:2' }),
    expect.objectContaining({ sceneId: 'scene-2', zoneId: 'zone-1', sourceLayerId: 'bottom-scene-2', layerId: 'layer:zone-1:overlay:2' }),
  ]))
  const clipId = result.report.clipMappings.find(mapping => mapping.sourcePlacementIds.includes('clip-ov'))?.clipId
  expect(result.record.composition.clips.find(clip => clip.id === clipId)?.layerId).toBe('layer:zone-1:overlay:2')
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
  expect(auditShowV1ToV2Accounting(source, result.record, result.report).unaccountedSourcePaths).toEqual([])
})

function groupOnlyDivergentLayers() {
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
      }], overlays: [{ id: 'overlay-a', name: 'Atmosphere', placements: [] }] }],
    },
    {
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [], overlays: [{ id: 'overlay-b', name: 'Different', placements: [] }] }],
    },
  ]
  source.composition!.groupDefinitions = [{
    id: 'group-definition',
    name: 'Overlay Group',
    patternInstances: [{
      id: 'group-pattern', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    placements: [{
      id: 'group-overlay', instanceId: 'group-pattern', startMs: 0, durationMs: 500, layerOffset: 1, opacity: 1,
      view: { mirror: false, phase: 0, brightness: 1 },
    }],
  }]
  source.composition!.groupOccurrences = [{
    id: 'group-use', definitionId: 'group-definition', sceneId: 'scene-b', zoneId: 'zone',
    startMs: 0, baseLayer: 0, translationX: 0, translationY: 0,
  }]
  return source
}

function collidingGroupResolvedLayers() {
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [], overlays: [
        { id: 'overlay-a-0', name: 'Alpha', placements: [] },
        { id: 'overlay-a-1', name: 'Gamma', placements: [] },
      ] }],
    },
    {
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [], overlays: [
        { id: 'overlay-b-0', name: 'Beta', placements: [] },
        { id: 'overlay-b-1', name: 'Beta', placements: [] },
      ] }],
    },
  ]
  source.composition!.groupDefinitions = [{
    id: 'group-definition',
    name: 'Overlay Group',
    patternInstances: [{
      id: 'group-pattern', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    placements: [
      {
        id: 'group-lower', instanceId: 'group-pattern', startMs: 0, durationMs: 500, layerOffset: 1, opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
      {
        id: 'group-upper', instanceId: 'group-pattern', startMs: 0, durationMs: 500, layerOffset: 2, opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
    ],
  }]
  source.composition!.groupOccurrences = [{
    id: 'group-use', definitionId: 'group-definition', sceneId: 'scene-b', zoneId: 'zone',
    startMs: 0, baseLayer: 0, translationX: 0, translationY: 0,
  }]
  return source
}

it('converts a divergent overlay name whose only surviving content arrives through a Group occurrence', () => {
  const source = groupOnlyDivergentLayers()
  const before = JSON.stringify(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(JSON.stringify(source)).toBe(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(result.record.composition.layers).toContainEqual(
    expect.objectContaining({ id: 'layer:zone:overlay:1', zoneId: 'zone', name: 'Different', rank: 1 }),
  )
  expect(result.record.composition.groupOccurrences).toEqual([
    expect.objectContaining({
      id: 'group-use',
      layerBindings: [expect.objectContaining({ layerId: 'layer:zone:overlay:1' })],
    }),
  ])
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
  const again = convertShowRecordV1ToV2(JSON.parse(before))
  expect(again.status).toBe('converted')
  if (again.status !== 'converted') return
  expect(again.record).toEqual(result.record)
})

it('converts a resolved overlay name that another Layer in the Zone already displays', () => {
  const source = collidingGroupResolvedLayers()
  const before = JSON.stringify(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(JSON.stringify(source)).toBe(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(result.record.composition.layers).toContainEqual(
    expect.objectContaining({ id: 'layer:zone:overlay:2', zoneId: 'zone', name: 'Beta', rank: 2 }),
  )
  expect(result.record.composition.layers).toContainEqual(
    expect.objectContaining({ id: 'layer:zone:overlay:1', zoneId: 'zone', name: 'Beta', rank: 1 }),
  )
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
  expect(auditShowV1ToV2Accounting(source, result.record, result.report).unaccountedSourcePaths).toEqual([])
})

it('leaves a renamed overlay name unaccounted instead of retiring it', () => {
  const source = convertibleV1Show()
  const conversion = convertShowRecordV1ToV2(source)
  expect(conversion.status).toBe('converted')
  if (conversion.status !== 'converted') return
  const tampered = structuredClone(conversion.record)
  tampered.composition.layers.find(layer => layer.rank === 1)!.name = 'Renamed'
  const audit = auditShowV1ToV2Accounting(source, tampered, conversion.report)
  expect(audit.unaccountedSourcePaths).toContain('composition.scenes.0.zones.0.overlays.0.name')
})

it('compiles the admitted divergent-layer shape to the same program v1 compiles', () => {
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  source.composition!.durationMs = 1000
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [], overlays: [{
        id: 'overlay-a', name: 'Atmosphere', placements: [{
          id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 500, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }] }],
    },
    {
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [], overlays: [{ id: 'overlay-b', name: 'Different', placements: [] }] }],
    },
  ]
  const before = JSON.stringify(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(JSON.stringify(source)).toBe(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(result.record.composition.layers).toContainEqual(expect.objectContaining({ name: 'Atmosphere' }))
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
  const tinySource = 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(1,x,y) }'
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: tinySource }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(result.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') return
  const oldArtifact = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const newArtifact = compileShow(prepared.recipe, LIBRARIES)
  expect(newArtifact.code).toBe(oldArtifact.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const runtime = (artifact: typeof newArtifact) => createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns) }, { fidelity, randomSeed: 1034, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] })
    const left = runtime(oldArtifact)
    const right = runtime(newArtifact)
    for (const atMs of [0, 1, 249, 250, 499, 500, 501, 750, 999, 1000, 1001]) {
      const a = atMs ? left.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : left.renderCurrentFrame()
      const expected = { frame: Array.from(a.frame), exports: { ...a.exports } }
      const b = atMs ? right.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : right.renderCurrentFrame()
      expect({ frame: Array.from(b.frame), exports: { ...b.exports } }).toEqual(expected)
    }
  }
})


it('resolves two Clip-carrying overlay names to the first Scene\'s name', () => {
  const source = bothPopulatedDivergentLayers()
  const before = JSON.stringify(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(JSON.stringify(source)).toBe(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(result.record.composition.layers).toContainEqual(
    expect.objectContaining({ id: 'layer:zone:overlay:1', zoneId: 'zone', name: 'Atmosphere', rank: 1 }),
  )
  for (const placementId of ['clip-a', 'clip-b']) {
    const clipId = result.report.clipMappings.find(mapping => mapping.sourcePlacementIds.includes(placementId))?.clipId
    expect(result.record.composition.clips.find(clip => clip.id === clipId)?.layerId).toBe('layer:zone:overlay:1')
  }
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
  expect(auditShowV1ToV2Accounting(source, result.record, result.report).unaccountedSourcePaths).toEqual([])
})

function unroutedDivergentLayerShow() {
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  source.zones = [
    { id: 'zone', name: 'Main', nominalPixelCount: 16 },
    { id: 'other', name: 'Other', nominalPixelCount: 16 },
  ]
  source.routingLayouts = [
    { id: 'dark', name: 'Dark', zones: [], logical: { kind: 'single', zoneIds: ['other'] } },
    { id: 'full', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } },
  ]
  source.transitions = [
    { id: 'to-full', afterSceneId: 'scene-a', kind: 'routing', layoutId: 'full', durationMs: 0, easing: { curve: 'linear' } },
  ]
  source.composition!.durationMs = 1000
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [
        { zoneId: 'zone', main: [], overlays: [{
          id: 'overlay-a', name: 'Alpha', placements: [{
            id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 500, opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
        }] },
        { zoneId: 'other', main: [], overlays: [] },
      ],
    },
    {
      sceneId: 'scene-b',
      zones: [
        { zoneId: 'zone', main: [], overlays: [{
          id: 'overlay-b', name: 'Beta', placements: [{
            id: 'clip-b', instanceId: 'instance', startMs: 0, durationMs: 500, opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
        }] },
        { zoneId: 'other', main: [], overlays: [] },
      ],
    },
  ]
  return source
}

it('converts a divergent overlay name when the earlier placement never routes', () => {
  const source = unroutedDivergentLayerShow()
  const before = JSON.stringify(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(JSON.stringify(source)).toBe(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(result.report.retiredSilentRuntimeUses.map(entry => entry.sourcePlacementId)).toContain('clip-a')
  expect(result.record.composition.layers).toContainEqual(
    expect.objectContaining({ id: 'layer:zone:overlay:1', zoneId: 'zone', name: 'Beta', rank: 1 }),
  )
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
})

// A one-sided boundary converts to whole-output scope; pairing it with a
// Layer Transition now prepares through the global-sections route, with the
// Layer Transition riding in the global section that owns its window
// (#1080 class 3). Conversion itself stays faithful.
it('prepares a one-sided boundary beside a Layer Transition through global-sections', () => {
  const source = convertibleV1Show()
  source.stageMapId = 'plane'
  source.composition!.durationMs = 11000
  source.scenes = [
    { id: 'scene-a', name: 'Outgoing', durationMs: 5000 },
    { id: 'scene-b', name: 'Incoming', durationMs: 5000 },
  ]
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [
        {
          id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 2000,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
        {
          id: 'clip-b', instanceId: 'instance', startMs: 3000, durationMs: 2000,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
      ], overlays: [] }],
    },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [], overlays: [] }] },
  ]
  source.composition!.transitions = [{
    id: 'layer-t', fromPlacementId: 'clip-a', toPlacementId: 'clip-b',
    kind: 'crossfade', durationMs: 1000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  source.transitions = [{
    id: 't1', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 1000,
    easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  const tinySource = 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(1,x,y) }'
  const lookup = {
    byCellId: {},
    byPatternInstanceId: { instance: tinySource },
    stageDimension: 2 as const,
  }
  const prepared = prepareShowV2ForCompile(result.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
})

describe('authored repeat scale provenance (#1066 slice 9b)', () => {
  function convertedDefaultShowWithRepeatScale(value: number | undefined) {
    const source = createDefaultShow('b', 'B', 1)
    if (value !== undefined) source.scenes[0].sampleTargets = { repeatScale: value }
    const byCellId = Object.fromEntries(
      source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]),
    )
    const result = convertShowRecordV1ToV2(source, { byCellId })
    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') throw new Error('conversion refused')
    return result.record
  }

  it.each([
    ['absent', undefined, undefined],
    ['explicit 1', 1, 'converted-authored-repeat-scale'],
    ['explicit 2', 2, 'converted-authored-repeat-scale'],
  ] as const)('records an %s repeat scale as %s', (_name, value, expected) => {
    const record = convertedDefaultShowWithRepeatScale(value)
    expect(record.composition.sampleRemap.origin).toBe(expected)
    expect(validateShowRecordV2(record)).toEqual([])
  })

  it('refuses an unknown sampleRemap origin at the structural boundary', () => {
    const record = convertedDefaultShowWithRepeatScale(1)
    expect(parseProvisionalShowRecordV2(JSON.stringify({
      ...record,
      composition: {
        ...record.composition,
        sampleRemap: { repeatScale: 1, origin: 'something-else' },
      },
    }))).toEqual(expect.objectContaining({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({ path: '/composition/sampleRemap/origin', code: 'schema' })]),
    }))
  })

  it('compiles byte-identical code with and without an explicit 1', () => {
    const compile = (record: ShowRecordV2) => {
      const prepared = prepareShowV2ForCompile(
        record,
        {
          byCellId: {},
          byPatternInstanceId: Object.fromEntries(
            record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]]),
          ),
          stageDimension: 2 as const,
        },
        { libraries: LIBRARIES },
      )
      expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
      if (prepared.status !== 'ready') throw new Error('preparation refused')
      return compileShow(prepared.recipe, LIBRARIES).code
    }
    expect(compile(convertedDefaultShowWithRepeatScale(1))).toBe(compile(convertedDefaultShowWithRepeatScale(undefined)))
  })
})

describe('gapped logical Clip split (#1080 class 1)', () => {
  function gappedContinuingShow() {
    const source = continuingV1Show()
    source.composition!.durationMs = 1200
    source.transitions = [{
      id: 'fade', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200,
      easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
    }]
    return source
  }

  it('splits a gapped logical Clip into linked runs sharing one Pattern instance', () => {
    const source = gappedContinuingShow()
    const before = JSON.stringify(source)

    const result = convertShowRecordV1ToV2(source)

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    expect(JSON.stringify(source)).toBe(before)
    const clips = result.record.composition.clips
    expect(clips.map(clip => clip.id)).toEqual(['clip--run-1', 'clip--run-2'])
    const [first, second] = clips
    expect(first.startMs).toBe(0)
    expect(first.startMs + first.durationMs).toBe(500)
    expect(second.startMs).toBe(700)
    expect(second.startMs + second.durationMs).toBe(1200)
    expect(second.instanceId).toBe(first.instanceId)
    expect(second.zoneId).toBe(first.zoneId)
    expect(second.layerId).toBe(first.layerId)
    expect(first.entryPolicy).toBe('continue')
    expect(second.entryPolicy).toBe('continue')
    expect(result.record.composition.patternInstances).toHaveLength(1)
    expect(result.report.splitLogicalClips).toEqual([{
      logicalClipId: 'clip',
      clipIds: ['clip--run-1', 'clip--run-2'],
      gaps: [{ startMs: 500, endMs: 700 }],
      outcome: 'split-discontinuous-logical-clip',
    }])
    expect(result.report.clipMappings).toEqual([
      { sourcePlacementIds: ['clip'], clipId: 'clip--run-1' },
      { sourcePlacementIds: ['clip--span-scene-b'], clipId: 'clip--run-2' },
    ])
    expect(result.report.unaccountedSourcePaths).toEqual([])
    expect(validateShowRecordV2(result.record)).toEqual([])
  })

  it('names the split runs as the boundary Transition contributors', () => {
    const source = gappedContinuingShow()

    const result = convertShowRecordV1ToV2(source)

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    const transition = result.record.composition.transitions.find(candidate => candidate.id === 'fade')
    expect(transition).toBeTruthy()
    if (!transition) return
    if (transition.participants.length > 0) {
      expect(transition.participants).toHaveLength(1)
      expect(transition.participants[0]).toMatchObject({ fromClipId: 'clip--run-1', toClipId: 'clip--run-2' })
    } else {
      expect(transition.wholeOutput?.fromClipIds).toEqual(['clip--run-1'])
      expect(transition.wholeOutput?.toClipIds).toEqual(['clip--run-2'])
    }
  })

  it('distributes Clip-targeted property tracks to their split run', () => {
    const source = gappedContinuingShow()
    source.composition!.scenes[0].propertyTracks = [{
      id: 'head-track',
      target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
      keyframes: [
        { id: 'head-first', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'head-last', timeMs: 500, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    source.composition!.scenes[1].propertyTracks = [{
      id: 'tail-track',
      target: { kind: 'placement-view', placementId: 'clip--span-scene-b', property: 'brightness' },
      keyframes: [
        { id: 'tail-first', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'tail-last', timeMs: 500, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const result = convertShowRecordV1ToV2(source)

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    const byId = new Map(result.record.composition.propertyTracks.map(track => [track.id, track]))
    expect(byId.get('head-track')?.target).toEqual({ kind: 'clip-view', clipId: 'clip--run-1', property: 'brightness' })
    expect(byId.get('tail-track')?.target).toEqual({ kind: 'clip-view', clipId: 'clip--run-2', property: 'brightness' })
    expect(result.report.unaccountedSourcePaths).toEqual([])
  })

  it('still refuses overlapping source segments as a discontinuous logical Clip', () => {
    const source = convertibleV1Show()
    source.scenes = [{ id: 'scene-a', name: 'Opening', durationMs: 500 }]
    source.composition!.durationMs = 500
    source.composition!.scenes = [{
      sceneId: 'scene-a',
      zones: [{
        zoneId: 'zone',
        main: [{
          id: 'clip', instanceId: 'instance', startMs: 0, durationMs: 500,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [{
          id: 'overlay', name: 'Atmosphere', placements: [{
            id: 'clip-overlap', logicalClipId: 'clip', instanceId: 'instance', startMs: 400, durationMs: 100,
            opacity: 1, view: { mirror: false, phase: 0, brightness: 1 },
          }],
        }],
      }],
    }]

    const result = convertShowRecordV1ToV2(source)

    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.issues).toContainEqual({
      path: 'composition.scenes[0].zones[0].overlays[0].placements[0]',
      code: 'discontinuous-logical-clip',
      message: 'Logical Clip "clip" has overlapping source segments.',
    })
  })

  it('keeps an abutting logical Clip on its single Clip id', () => {
    const source = continuingV1Show()

    const result = convertShowRecordV1ToV2(source)

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    expect(result.record.composition.clips.map(clip => clip.id)).toEqual(['clip'])
    expect(result.report.splitLogicalClips).toEqual([])
    expect(result.report.unaccountedSourcePaths).toEqual([])
  })
})

describe('flat unrouted Zone retirement (#1080 class 2B)', () => {
  const tinySource = 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(1,x,y) }'

  function twoZoneFlatShow() {
    const source = convertibleV1Show()
    source.zones = [
      { id: 'zone-1', name: 'One', nominalPixelCount: 16 },
      { id: 'zone-2', name: 'Two', nominalPixelCount: 16 },
    ]
    source.routingLayouts = [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone-1'] } }]
    source.scenes = [{ id: 'scene-a', name: 'Opening', durationMs: 1000 }]
    const cellShape = flatV1Show().cells[0]
    source.cells = [
      { ...structuredClone(cellShape), id: 'cell-1', zoneId: 'zone-1', sceneId: 'scene-a', sceneSpan: 1 },
      { ...structuredClone(cellShape), id: 'cell-2', zoneId: 'zone-2', sceneId: 'scene-a', sceneSpan: 1 },
    ]
    delete (source as { composition?: unknown }).composition
    return source
  }

  function partlyRoutedFlatShow() {
    const source = twoZoneFlatShow()
    source.routingLayouts = [
      { id: 'both', name: 'Both', zones: [], logical: { kind: 'split', zoneIds: ['zone-1', 'zone-2'], axis: 'x' } },
      { id: 'one', name: 'One', zones: [], logical: { kind: 'single', zoneIds: ['zone-1'] } },
    ]
    source.scenes = [
      { id: 'scene-a', name: 'A', durationMs: 500 },
      { id: 'scene-b', name: 'B', durationMs: 500 },
      { id: 'scene-c', name: 'C', durationMs: 500 },
    ]
    for (const cell of source.cells) cell.sceneSpan = 3
    source.transitions = [
      { id: 'to-one', afterSceneId: 'scene-a', kind: 'routing', layoutId: 'one', durationMs: 0, easing: { curve: 'linear' } },
      { id: 'to-both', afterSceneId: 'scene-b', kind: 'routing', layoutId: 'both', durationMs: 0, easing: { curve: 'linear' } },
    ]
    return source
  }

  it('retires a flat cell whose Zone no Layout routes', () => {
    const source = twoZoneFlatShow()
    const result = convertShowRecordV1ToV2(source, { byCellId: { 'cell-1': 'source1', 'cell-2': 'source2' } })

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    expect(result.report.unaccountedSourcePaths).toEqual([])
    expect(result.report.retiredSilentRuntimeUses).toEqual([{
      sourcePlacementId: 'placement-cell-2-scene-a',
      sourcePath: 'cells.1',
      instanceId: 'cell-2',
      zoneId: 'zone-2',
      startMs: 0,
      durationMs: 1000,
      outcome: 'retired-silent-runtime-use',
    }])
    const retiredLeaves = result.report.accounting.filter(entry => entry.sourcePath.startsWith('cells.1.'))
    expect(retiredLeaves.length).toBeGreaterThan(0)
    expect(retiredLeaves.every(entry => entry.outcome === 'retired-silent-runtime-use')).toBe(true)
    expect(result.report.accounting.filter(entry => entry.sourcePath.startsWith('cells.0.'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ outcome: 'mapped' })]),
    )
  })

  it('compiles the retired flat Show with accepted retirement provenance', async () => {
    const source = twoZoneFlatShow()
    const lookup = { byCellId: { 'cell-1': tinySource, 'cell-2': tinySource }, stageDimension: 2 as const }
    const converted = convertShowRecordV1ToV2(source, lookup)
    expect(converted.status, JSON.stringify(converted.status === 'refused' ? converted.issues : [])).toBe('converted')
    if (converted.status !== 'converted') return
    const prepared = prepareShowV2ForCompile(
      converted.record,
      { byCellId: {}, byPatternInstanceId: { 'cell-1': tinySource, 'cell-2': tinySource }, stageDimension: 2 as const },
      { libraries: LIBRARIES },
    )
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
    if (prepared.status !== 'ready') return
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(prepared.recipe, LIBRARIES)
    const { runtimeParity } = await import('../../scripts/show-v2-parity')
    const firstRetiredStartMs = Math.min(...converted.report.retiredSilentRuntimeUses.map(entry => entry.startMs))
    const retiredInstanceIds = new Set(converted.report.retiredSilentRuntimeUses.map(entry => entry.instanceId))
    const surviving = converted.report.flatProjectionMappings.find(mapping => mapping.cellId === 'cell-1')!
    const survivingClipId = converted.report.clipMappings.find(mapping => mapping.sourcePlacementIds.some(id => surviving.placementIds.includes(id)))!.clipId
    const memberIdentityMappings = [{ v1MemberId: surviving.patternInstanceIds[0], v2MemberId: survivingClipId, provenance: 'flat-projection' as const }]
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const parity = runtimeParity(v1, v2, source, converted.record, fidelity, memberIdentityMappings)
      if (parity.matched) continue
      expect(parity.firstMismatchMs).toBeGreaterThanOrEqual(firstRetiredStartMs)
      for (const key of parity.firstMismatchStateDifferences) {
        expect(
          key.startsWith('__pxlblz_empty-routed:') || [...retiredInstanceIds].some(instanceId => key.startsWith(`${instanceId}:`)),
        ).toBe(true)
      }
    }
  })

  it('keeps a partly routed cell visible with no retirement', () => {
    const source = partlyRoutedFlatShow()
    const result = convertShowRecordV1ToV2(source, { byCellId: { 'cell-1': 'source1', 'cell-2': 'source2' } })

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    expect(result.report.unaccountedSourcePaths).toEqual([])
    expect(result.report.retiredSilentRuntimeUses).toEqual([])
    const zone2Clips = result.record.composition.clips.filter(clip => clip.zoneId === 'zone-2')
    expect(zone2Clips.length).toBeGreaterThan(0)
    expect(zone2Clips.some(clip => clip.startMs === 0)).toBe(true)
  })
})

describe('#1080 class 2 (A) slice B: boundary ramp carrier conversion', () => {
  function rampCarrierShow() {
    const show = createDefaultShow('ramp-carrier', 'Ramp carrier', 1)
    show.scenes = [
      { id: 'scene-1', name: 'Scene 1', durationMs: 4000 },
      { id: 'scene-2', name: 'Scene 2', durationMs: 4000 },
      { id: 'scene-3', name: 'Scene 3', durationMs: 4000 },
    ]
    const zoneId = show.zones[0].id
    const patterns = ['TestPattern1D', 'CometLoom', 'CellularAutomata1D']
    show.cells = show.scenes.map((scene, index) => ({
      id: `cell-${index + 1}`,
      zoneId,
      sceneId: scene.id,
      sceneSpan: 1,
      pattern: { kind: 'stock' as const, id: patterns[index] },
      patternName: patterns[index],
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      restartOnEntry: false,
    }))
    show.transitions = [
      { id: 'xfade', afterSceneId: 'scene-1', kind: 'crossfade', durationMs: 2000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' },
      { id: 'cut', afterSceneId: 'scene-2', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } },
    ]
    return show
  }

  function rampLookup(show: ReturnType<typeof rampCarrierShow>) {
    return { byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[cell.pattern.id]])) }
  }

  function participantBoundary(result: Extract<ReturnType<typeof convertShowRecordV1ToV2>, { status: 'converted' }>) {
    const transition = result.record.composition.transitions.find(candidate => candidate.id === 'xfade')!
    expect(transition.wholeOutput).toBeUndefined()
    expect(transition.participants).toHaveLength(1)
    expect(transition.propertyRamps).toEqual([])
    return transition
  }

  it('converts a boundary timeScale ramp to an exact-window instance-time-scale track', () => {
    const source = rampCarrierShow()
    source.transitions[0].propertyTransitions = {
      timeScale: { fromByCellId: { 'cell-2': 0.5 }, easing: { curve: 'sine', direction: 'in-out' } },
    }
    const before = JSON.stringify(source)

    const result = convertShowRecordV1ToV2(source, rampLookup(source))

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    expect(JSON.stringify(source)).toBe(before)
    const transition = participantBoundary(result)
    const toClip = result.record.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!
    const tracks = result.record.composition.propertyTracks.filter(track => track.target.kind === 'instance-time-scale')
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toEqual({
      id: `xfade:ramp:timeScale:${toClip.id}`,
      target: { kind: 'instance-time-scale', instanceId: toClip.instanceId },
      activeStartMs: 4000,
      activeDurationMs: 2000,
      keyframes: [
        { id: `${tracks[0].id}:k0`, timeMs: 4000, value: 0.5, easing: { curve: 'sine', direction: 'in-out' } },
        { id: `${tracks[0].id}:k1`, timeMs: 6000, value: 1, easing: { curve: 'linear' } },
      ],
    })
    expect(result.report.unaccountedSourcePaths).toEqual([])
    expect(validateShowRecordV2(result.record)).toEqual([])
  })

  it('converts a boundary brightness ramp to an exact-window clip-view track', () => {
    const source = rampCarrierShow()
    source.transitions[0].propertyTransitions = {
      brightness: { fromByCellId: { 'cell-2': 0.2 } },
    }

    const result = convertShowRecordV1ToV2(source, rampLookup(source))

    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    const transition = participantBoundary(result)
    const toClip = result.record.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!
    const tracks = result.record.composition.propertyTracks.filter(track => track.target.kind === 'clip-view')
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toEqual({
      id: `xfade:ramp:brightness:${toClip.id}`,
      target: { kind: 'clip-view', clipId: toClip.id, property: 'brightness' },
      activeStartMs: 4000,
      activeDurationMs: 2000,
      keyframes: [
        { id: `${tracks[0].id}:k0`, timeMs: 4000, value: 0.2, easing: { curve: 'linear' } },
        { id: `${tracks[0].id}:k1`, timeMs: 6000, value: 1, easing: { curve: 'linear' } },
      ],
    })
    expect(result.report.unaccountedSourcePaths).toEqual([])
    expect(validateShowRecordV2(result.record)).toEqual([])
  })

  it('still refuses a boundary controls carrier', () => {
    const source = rampCarrierShow()
    for (const cell of source.cells) cell.controlTargets = { speed: 0.5 }
    source.transitions[0].propertyTransitions = {
      controls: { speed: { fromByCellId: { 'cell-2': 0.5 } } },
    }

    expect(convertShowRecordV1ToV2(source, rampLookup(source))).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-boundary-transition' })]),
    })
  })

  it('refuses a carrier mixing a ramp key with a scalar key', () => {
    const source = rampCarrierShow()
    source.transitions[0].propertyTransitions = {
      timeScale: { fromByCellId: { 'cell-2': 0.5 } },
      sample: { repeatScale: { from: 1 } },
    }

    expect(convertShowRecordV1ToV2(source, rampLookup(source))).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-boundary-transition' })]),
    })
  })

  it('refuses a ramp carrier where a v1 Scene property track forces whole-output scope', () => {
    const source = convertibleV1Show()
    source.scenes = [
      { id: 'scene-1', name: 'Scene 1', durationMs: 4000 },
      { id: 'scene-2', name: 'Scene 2', durationMs: 4000 },
      { id: 'scene-3', name: 'Scene 3', durationMs: 4000 },
    ]
    const patterns = ['TestPattern1D', 'CometLoom', 'CellularAutomata1D']
    source.composition!.patternInstances = patterns.map((pattern, index) => ({
      id: `instance-${index + 1}`,
      pattern: { kind: 'stock' as const, id: pattern },
      patternName: pattern,
      time: { timeScale: 1, timeOffsetMs: 0 },
    }))
    source.composition!.durationMs = 14000
    source.composition!.scenes = source.scenes.map((scene, index) => ({
      sceneId: scene.id,
      zones: [{
        zoneId: 'zone',
        main: [{
          id: `placement-${index + 1}`,
          instanceId: `instance-${index + 1}`,
          startMs: 0,
          durationMs: 4000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [],
      }],
    }))
    source.composition!.scenes[0].propertyTracks = [{
      id: 'scene-track',
      target: { kind: 'placement-view', placementId: 'placement-1', property: 'brightness' },
      keyframes: [
        { id: 'scene-track-k0', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'scene-track-k1', timeMs: 4000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    source.transitions = [
      { id: 'xfade', afterSceneId: 'scene-1', kind: 'crossfade', durationMs: 2000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' },
      { id: 'cut', afterSceneId: 'scene-2', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } },
    ]
    source.transitions[0].propertyTransitions = {
      timeScale: { fromByCellId: { 'cell-2': 0.5 } },
    }

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({
        code: 'unsupported-boundary-transition',
        message: 'A boundary Animation speed or Brightness ramp converts only at Layer participant scope.',
      })]),
    })
  })
})
