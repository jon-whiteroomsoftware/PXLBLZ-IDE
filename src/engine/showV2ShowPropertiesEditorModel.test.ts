import { describe, expect, it } from 'vitest'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import { applyShowCommandV2 } from './showCommandsV2/registry'
import type { ShowRecordV2 } from './showCompositionV2'
import { DEFAULT_SHOW_TRAILS_RETENTION } from './showPreviousRgbFeedback'
import {
  buildShowV2ShowPropertiesModel,
  showV2OutputContractCommand,
  showV2StageMapCommand,
  showV2TrailsCommand,
  showV2ZoneCommand,
  type ShowV2MapChoice,
} from './showV2ShowPropertiesEditorModel'

const MAPS: ShowV2MapChoice[] = [
  { id: 'plane', name: 'Plane', dim: 2 },
  { id: 'wide', name: 'Wide 2:1', dim: 2 },
  { id: 'strip', name: 'Strip', dim: 1 },
  { id: 'cube', name: 'Cube', dim: 3 },
]

function installation(record: ShowRecordV2, mapId: string | null, pixelCount: number): ShowRecordV2 {
  return {
    ...record,
    outputContract: { version: 1, kind: 'installation', outputMapId: mapId, pixelCount, resolution: 'fixed' },
    ...(mapId === null ? {} : { stageMapId: mapId }),
  }
}

describe('the v2 Show properties projection', () => {
  it('reports a Portable contract the way the v1 output summary names it', () => {
    const model = buildShowV2ShowPropertiesModel(
      { ...commandFixtureV2(), stageMapId: 'plane' },
      MAPS,
    )
    expect(model.contract).toMatchObject({
      kind: 'portable-2d',
      kindLabel: 'Portable',
      pixelCount: 16,
      mapId: 'plane',
      mapName: 'Plane',
      mapMissing: false,
    })
    expect(model.contract.summary).toBe('Portable · 16 px reference · Plane')
    expect(model.stageMapId).toBe('plane')
    expect(model.stageMapName).toBe('Plane')
    expect(model.stageMapMissing).toBe(false)
  })

  it('reports an Installation contract as a fixed pixel count', () => {
    const model = buildShowV2ShowPropertiesModel(installation(commandFixtureV2(), 'cube', 300), MAPS)
    expect(model.contract.kindLabel).toBe('Installation')
    expect(model.contract.summary).toBe('Installation · 300 px fixed · Cube')
  })

  it('names a map the workspace cannot see as missing rather than substituting one', () => {
    const model = buildShowV2ShowPropertiesModel(
      { ...installation(commandFixtureV2(), 'gone', 300), stageMapId: 'gone' },
      MAPS,
    )
    expect(model.contract).toMatchObject({ mapId: 'gone', mapName: null, mapMissing: true })
    expect(model.contract.summary).toBe('Installation · 300 px fixed · Missing map')
    expect(model.stageMapMissing).toBe(true)
    expect(model.stageMapName).toBe(null)
  })

  it('says a Show with no map names none', () => {
    const record = commandFixtureV2()
    const model = buildShowV2ShowPropertiesModel({
      ...record,
      outputContract: { ...record.outputContract, kind: 'portable-2d', referenceMapId: null } as ShowRecordV2['outputContract'],
    }, MAPS)
    expect(model.contract).toMatchObject({ mapId: null, mapName: null, mapMissing: false })
    expect(model.contract.summary).toBe('Portable · 16 px reference · No map')
  })

  it('offers a Portable contract only 2D maps and an Installation contract every map', () => {
    const portable = buildShowV2ShowPropertiesModel(commandFixtureV2(), MAPS)
    expect(portable.contractMapOptions.map(map => map.id)).toEqual(['plane', 'wide'])
    const fixed = buildShowV2ShowPropertiesModel(installation(commandFixtureV2(), 'cube', 300), MAPS)
    expect(fixed.contractMapOptions.map(map => map.id)).toEqual(['plane', 'wide', 'strip', 'cube'])
  })

  it('reports Trails off, then on at its authored retention', () => {
    expect(buildShowV2ShowPropertiesModel(commandFixtureV2(), MAPS).trails)
      .toEqual({ enabled: false, retention: DEFAULT_SHOW_TRAILS_RETENTION })
    const record = { ...commandFixtureV2(), outputEffects: [{ id: 'trails', kind: 'trails' as const, retention: 0.5 }] }
    expect(buildShowV2ShowPropertiesModel(record, MAPS).trails).toEqual({ enabled: true, retention: 0.5 })
  })

  it('lists the Zones in record order with their nominal pixel counts', () => {
    expect(buildShowV2ShowPropertiesModel(commandFixtureV2(), MAPS).zones).toEqual([
      { id: 'left', name: 'Left', nominalPixelCount: 8 },
      { id: 'right', name: 'Right', nominalPixelCount: 8 },
    ])
  })
})

describe('the command inputs the Show properties surface submits', () => {
  it('builds one set_output_contract input the registry accepts', () => {
    const record = commandFixtureV2()
    const intent = showV2OutputContractCommand({ kind: 'installation', pixelCount: 300, mapId: 'cube' })
    expect(intent).toEqual({
      command: 'set_output_contract',
      input: { kind: 'installation', pixel_count: 300, map_id: 'cube' },
    })
    const outcome = applyShowCommandV2(record, intent.command, intent.input)
    expect(outcome.status).toBe('changed')
    expect(outcome.record.outputContract).toMatchObject({ kind: 'installation', pixelCount: 300, outputMapId: 'cube' })
    expect(outcome.record.stageMapId).toBe('cube')
  })

  it('clears the contract map with an explicit null rather than omitting it', () => {
    expect(showV2OutputContractCommand({ kind: 'portable-2d', pixelCount: 1024, mapId: null })).toEqual({
      command: 'set_output_contract',
      input: { kind: 'portable-2d', pixel_count: 1024, map_id: null },
    })
  })

  it('builds one set_stage_map input, including the explicit clear', () => {
    expect(showV2StageMapCommand('wide')).toEqual({ command: 'set_stage_map', input: { stage_map_id: 'wide' } })
    expect(showV2StageMapCommand(null)).toEqual({ command: 'set_stage_map', input: { stage_map_id: null } })
  })

  it('builds one update_zone input carrying only the requested field', () => {
    expect(showV2ZoneCommand('left', { name: 'Stage left' })).toEqual({
      command: 'update_zone',
      input: { zone_id: 'left', name: 'Stage left' },
    })
    expect(showV2ZoneCommand('left', { nominalPixelCount: 24 })).toEqual({
      command: 'update_zone',
      input: { zone_id: 'left', nominal_pixel_count: 24 },
    })
  })

  it('builds set_output_trails for enabling, retuning and turning off', () => {
    expect(showV2TrailsCommand({ enabled: true })).toEqual({ command: 'set_output_trails', input: { enabled: true } })
    expect(showV2TrailsCommand({ enabled: false })).toEqual({ command: 'set_output_trails', input: { enabled: false } })
    expect(showV2TrailsCommand({ enabled: true, retention: 0.25 })).toEqual({
      command: 'set_output_trails',
      input: { enabled: true, retention: 0.25 },
    })
  })

  it('round-trips a Zone rename through the same owner an agent calls', () => {
    const intent = showV2ZoneCommand('left', { name: 'Stage left' })
    const outcome = applyShowCommandV2(commandFixtureV2(), intent.command, intent.input)
    expect(outcome.status).toBe('changed')
    expect(outcome.record.zones[0]).toMatchObject({ name: 'Stage left' })
  })
})
