import { describe, expect, it } from 'vitest'
import { convertibleV1Show, flatV1Show } from '../test/showV2TracerFixture'
import { stockShowById } from '../pixelblaze/stock/shows'
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
  ] as const)('refuses divergent per-Scene split positions across a carrier-free Cut: %s', (_name, first, second) => {
    const source = continuingCutShow()
    if (first !== undefined) source.scenes[0].routingTargets = { splitPosition: first }
    if (second !== undefined) source.scenes[1].routingTargets = { splitPosition: second }
    const before = JSON.stringify(source)

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({
        code: 'unsupported-routing-change',
        path: 'scenes.*.routingTargets.splitPosition',
      })]),
      report: { unaccountedSourcePaths: [] },
    })
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

  it('classifies Group materialization as unsupported with a real stock authored record', () => {
    const source = stockShowById('stock-show-205-groups-linked-reuse')?.show
    expect(source).toBeTruthy()
    if (!source) return

    expect(convertShowRecordV1ToV2(source)).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-group' })]),
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
