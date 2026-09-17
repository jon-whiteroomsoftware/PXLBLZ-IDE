import { describe, expect, it } from 'vitest'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import type { ShowRecordV2 } from './showCompositionV2'
import { createInstallationShowOutputContract } from './showOutputContract'
import { editShowZoneLayoutDefinitionV2 } from './showZoneLayoutDefinitionsV2'
import { editShowZoneV2 } from './showZonesV2'
import {
  buildShowV2ZoneLayoutModel,
  showV2AddZoneIntent,
  showV2RoutingForMode,
  showV2RoutingParameters,
  showV2RoutingWithMembers,
  showV2RoutingWithParameter,
  nextShowV2ZoneLayoutName,
} from './showV2ZoneLayoutEditorModel'

function record(): ShowRecordV2 {
  const value = commandFixtureV2()
  for (const instance of value.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  return value
}

describe('the Zone Layouts projection', () => {
  it('describes every definition, its uses, members and mode', () => {
    const model = buildShowV2ZoneLayoutModel(record())
    expect(model.definitions).toMatchObject([
      { id: 'both', name: 'Both', mode: 'split-x', modeLabel: 'Moving split X', occurrenceIds: ['interval-1', 'interval-2'], memberZoneIds: ['left', 'right'], memberArity: { min: 2, max: 2 }, ranges: [], routingIssue: null, coverage: null },
      { id: 'left-only', name: 'Left only', mode: 'single', modeLabel: 'Full surface', occurrenceIds: [], memberZoneIds: ['left'], memberArity: { min: 1, max: 1 } },
    ])
    expect(model.canRemoveDefinition).toBe(true)
    expect(model.canRemoveZone).toBe(true)
    expect(model.zones).toEqual([{ id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }])
  })

  it('offers v1 routing modes, disabling the ones this Show cannot satisfy', () => {
    const model = buildShowV2ZoneLayoutModel(record())
    expect(model.modes.map(mode => [mode.mode, mode.label, mode.disabled])).toEqual([
      ['physical', 'Physical ranges', true],
      ['single', 'Full surface', false],
      ['stripes-x', 'Left / right stripes', false],
      ['stripes-y', 'Top / bottom stripes', false],
      ['grid-2x2', 'Grid', true],
      ['checker', 'Checker', false],
      ['rings', 'Rings', false],
      ['pinwheel', 'Pinwheel', false],
      ['wave', 'Wave', false],
      ['soft-split', 'Soft split', false],
      ['split-x', 'Moving split X', false],
      ['split-y', 'Moving split Y', false],
    ])
  })

  it('offers physical ranges and Installation coverage only for a physical definition', () => {
    const source = record()
    source.outputContract = createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 16 })
    source.zoneLayouts[0] = { id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 3 }] }] }
    const [physical, logicalDefinition] = buildShowV2ZoneLayoutModel(source).definitions
    expect(physical.mode).toBe('physical')
    expect(physical.ranges).toEqual([
      { zoneId: 'left', zoneName: 'Left', text: '0-3' },
      { zoneId: 'right', zoneName: 'Right', text: '' },
    ])
    expect(physical.coverage).toMatchObject({ kind: 'physical', valid: false, assignedPixelCount: 4, missingPixelCount: 12 })
    expect(logicalDefinition.ranges).toEqual([])
    expect(logicalDefinition.coverage).toMatchObject({ kind: 'logical', valid: true })
  })

  it('reports the routing issue a definition already carries', () => {
    const source = record()
    source.zoneLayouts[0].logical = { kind: 'checker', zoneIds: ['left', 'right'], columns: 0, rows: 4 }
    expect(buildShowV2ZoneLayoutModel(source).definitions[0].routingIssue)
      .toBe('Checker columns and rows must be positive whole numbers.')
  })
})

describe('the operator projection', () => {
  it('round-trips each mode default through its parameter views', () => {
    const zoneIds = ['a', 'b', 'c', 'd']
    for (const [mode, parameters] of [
      ['single', []],
      ['stripes-x', []],
      ['grid-2x2', ['columns', 'rows']],
      ['checker', ['columns', 'rows']],
      ['rings', ['rings']],
      ['pinwheel', ['arms', 'twistTurns', 'rotationDegrees']],
      ['wave', ['axis', 'bands', 'amplitude', 'frequency', 'phase']],
      ['soft-split', ['axis', 'feather']],
      ['split-y', []],
    ] as const) {
      const logical = showV2RoutingForMode(mode, zoneIds)!
      expect(showV2RoutingParameters(logical).map(parameter => parameter.id), mode).toEqual(parameters)
    }
    expect(showV2RoutingForMode('physical', zoneIds)).toBeNull()
  })

  it('applies v1 conversions for whole counts, twist turns and rotation degrees', () => {
    const pinwheel = showV2RoutingForMode('pinwheel', ['a', 'b'])!
    expect(showV2RoutingWithParameter(pinwheel, 'arms', 3.4)).toMatchObject({ arms: 3 })
    expect(showV2RoutingWithParameter(pinwheel, 'twistTurns', 2)).toMatchObject({ twist: Math.PI * 4 })
    expect(showV2RoutingWithParameter(pinwheel, 'rotationDegrees', 90)).toMatchObject({ rotation: Math.PI / 2 })
    const wave = showV2RoutingForMode('wave', ['a'])!
    expect(showV2RoutingWithParameter(wave, 'axis', 'y')).toMatchObject({ axis: 'y' })
    expect(showV2RoutingWithParameter(wave, 'frequency', -3)).toMatchObject({ frequency: 0 })
    // An unknown parameter or an unusable value leaves the operator alone.
    expect(showV2RoutingWithParameter(wave, 'feather', 0.5)).toEqual(wave)
    expect(showV2RoutingWithParameter(wave, 'bands', Number.NaN)).toEqual(wave)
    expect(showV2RoutingWithMembers(wave, ['b', 'c'])).toMatchObject({ kind: 'wave', zoneIds: ['b', 'c'] })
  })

  it('reads back the parameters it wrote', () => {
    const source = record()
    const routed = editShowZoneLayoutDefinitionV2(source, {
      kind: 'set-routing',
      layoutId: 'both',
      logical: showV2RoutingWithParameter(showV2RoutingForMode('rings', ['left', 'right'])!, 'rings', 8),
    })
    if (routed.status !== 'changed') throw new Error(routed.status)
    const view = buildShowV2ZoneLayoutModel(routed.record).definitions[0]
    expect(view.mode).toBe('rings')
    expect(view.parameters).toEqual([{ id: 'rings', kind: 'number', label: 'Ring count', ariaLabel: 'Ring count', value: 8, min: 1, step: 1 }])
    expect(view.memberArity).toEqual({ min: 1, max: null })
  })
})

describe('the caller-supplied intents', () => {
  it('seeds v1 Add Zone defaults and accepts them through the owner', () => {
    const source = record()
    const intent = showV2AddZoneIntent(source, 'fresh-id')
    expect(intent).toEqual({
      kind: 'add',
      zone: { id: 'fresh-id', name: 'zone-3', nominalPixelCount: 60, color: '#a78bfa' },
    })
    const result = editShowZoneV2(source, intent)
    expect(result.status).toBe('changed')
    // The seeded name steps aside from a Zone that already holds it.
    const taken = record()
    taken.zones[0].name = 'zone-3'
    expect(showV2AddZoneIntent(taken, 'fresh-id').zone.name).toBe('zone-3 2')
  })

  it('steps a definition name aside from the names already taken', () => {
    const source = record()
    expect(nextShowV2ZoneLayoutName(source, 'Rings')).toBe('Rings')
    expect(nextShowV2ZoneLayoutName(source, 'Both')).toBe('Both 2')
    source.zoneLayouts[1].name = 'Both 2'
    expect(nextShowV2ZoneLayoutName(source, 'Both')).toBe('Both 3')
  })
})
