import { describe, expect, it } from 'vitest'
import {
  addShowRoutingLayout,
  addShowZone,
  updateShowZone,
  ZONE_COLORS,
} from './showModel'
import { compactSpatialIndexes, updateShowPhysicalZoneSelection } from './showSpatialSelection'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import { editShowZoneV2 } from './showZonesV2'
import { editShowZoneLayoutDefinitionV2 } from './showZoneLayoutDefinitionsV2'
import { applyShowCommandV2 } from './showCommandsV2/registry'
import {
  planShowV2LayoutDuplicate,
  planShowV2LayoutUpdate,
  planShowV2PhysicalZoneSelection,
  planShowV2ZoneAdd,
  planShowV2ZoneRemove,
  planShowV2ZoneUpdate,
} from './showV2ZonePlanning'

function valid(record: ShowRecordV2): ShowRecordV2 {
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function twoZoneRecord(): ShowRecordV2 {
  const base = structuredClone(commandFixtureV2())
  const idMap: Record<string, string> = { left: 'zone-1', right: 'zone-2' }
  base.zones = base.zones.map((zone) => ({ ...zone, id: idMap[zone.id] ?? zone.id }))
  base.composition.layers = base.composition.layers.map((layer) => ({ ...layer, zoneId: idMap[layer.zoneId] ?? layer.zoneId }))
  base.composition.clips = base.composition.clips.map((clip) => ({ ...clip, zoneId: idMap[clip.zoneId] ?? clip.zoneId }))
  for (const layout of base.zoneLayouts) {
    if (layout.logical) layout.logical = { ...layout.logical, zoneIds: layout.logical.zoneIds.map((id) => idMap[id] ?? id) } as typeof layout.logical
  }
  return valid(base)
}

function twoZoneNamedRecord(): ShowRecordV2 {
  const record = twoZoneRecord()
  record.zones[0].name = 'zone-3'
  record.zones[1].name = 'other'
  return valid(record)
}

function layoutDuplicateRecord(): ShowRecordV2 {
  const record = twoZoneRecord()
  record.zoneLayouts = [
    { id: 'layout-1', name: 'Layout one', zones: [], logical: { kind: 'stripes', axis: 'x', zoneIds: ['zone-1', 'zone-2'] } },
    { id: 'layout-2', name: 'Layout two', zones: [], logical: { kind: 'single', zoneIds: ['zone-1'] } },
  ]
  record.composition.layoutOccurrences = [
    { id: 'interval-1', layoutId: 'layout-1', startMs: 0, durationMs: 5_000, parameters: {} },
    { id: 'interval-2', layoutId: 'layout-1', startMs: 5_000, durationMs: 5_000, parameters: {} },
  ]
  return valid(record)
}

function layoutDuplicateTakenRecord(): ShowRecordV2 {
  const record = layoutDuplicateRecord()
  record.zoneLayouts[1].name = 'Left / right stripes'
  return valid(record)
}

function installationPhysicalRecord(): ShowRecordV2 {
  const record = twoZoneRecord()
  record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
  record.zoneLayouts = [
    { id: 'layout-1', name: 'Physical', zones: [{ zoneId: 'zone-1', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'zone-2', ranges: [{ start: 8, end: 15 }] }] },
  ]
  record.composition.layoutOccurrences = [
    { id: 'interval-1', layoutId: 'layout-1', startMs: 0, durationMs: 5_000, parameters: {} },
    { id: 'interval-2', layoutId: 'layout-1', startMs: 5_000, durationMs: 5_000, parameters: {} },
  ]
  // Keep clips in zone-1 only so zone-2 removal stays available; layouts provide both zones.
  return valid(record)
}

function installationLogicalRecord(): ShowRecordV2 {
  const record = twoZoneRecord()
  record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
  record.zoneLayouts = [
    { id: 'layout-1', name: 'Stripes', zones: [], logical: { kind: 'stripes', axis: 'x', zoneIds: ['zone-1', 'zone-2'] } },
    { id: 'layout-2', name: 'Physical', zones: [{ zoneId: 'zone-1', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'zone-2', ranges: [{ start: 8, end: 15 }] }] },
  ]
  record.composition.layoutOccurrences = [
    { id: 'interval-1', layoutId: 'layout-1', startMs: 0, durationMs: 5_000, parameters: {} },
    { id: 'interval-2', layoutId: 'layout-1', startMs: 5_000, durationMs: 5_000, parameters: {} },
  ]
  return valid(record)
}

describe('v2 Zone and Zone Layout definition planning (#1066 slice 7)', () => {
  it('adds a Zone with the next identity, name, count and colour', () => {
    const record = twoZoneRecord()
    const plan = planShowV2ZoneAdd(record)
    expect(plan).toEqual({
      kind: 'zone',
      intent: {
        kind: 'add',
        zone: { id: 'zone-3', name: 'zone-3', nominalPixelCount: 60, color: ZONE_COLORS[2] },
      },
    })
    const taken = twoZoneNamedRecord()
    expect(planShowV2ZoneAdd(taken)).toEqual({
      kind: 'zone',
      intent: {
        kind: 'add',
        zone: { id: 'zone-3', name: 'zone-3 2', nominalPixelCount: 60, color: ZONE_COLORS[2] },
      },
    })
  })

  it('updates a Zone through update_zone metadata with v1 clamping', () => {
    const record = twoZoneRecord()
    expect(planShowV2ZoneUpdate(record, 'zone-1', { name: 'A' })).toEqual({
      kind: 'metadata',
      plan: { kind: 'intent', intent: { command: 'update_zone', input: { zone_id: 'zone-1', name: 'A' } } },
    })
    expect(planShowV2ZoneUpdate(record, 'zone-1', { nominalPixelCount: 12.6 })).toEqual({
      kind: 'metadata',
      plan: { kind: 'intent', intent: { command: 'update_zone', input: { zone_id: 'zone-1', nominal_pixel_count: 13 } } },
    })
    expect(planShowV2ZoneUpdate(record, 'zone-1', { nominalPixelCount: 0 })).toEqual({
      kind: 'metadata',
      plan: { kind: 'intent', intent: { command: 'update_zone', input: { zone_id: 'zone-1', nominal_pixel_count: 1 } } },
    })
    expect(planShowV2ZoneUpdate(record, 'zone-1', {})).toEqual({ kind: 'no-op' })
    expect(planShowV2ZoneUpdate(record, 'zone-1', { icon: 'map' })).toEqual({
      kind: 'refuse',
      code: 'unsupported-field',
      message: expect.any(String),
    })
    expect(planShowV2ZoneUpdate(record, 'missing', { name: 'A' })).toEqual({
      kind: 'refuse',
      code: 'missing-zone',
      message: expect.any(String),
    })
  })

  it('removes a Zone only when more than one remains, without clip removals', () => {
    // convertible converts to a single-zone record; removal is a no-op
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    expect(planShowV2ZoneRemove(converted.record, converted.record.zones[0].id)).toEqual({ kind: 'no-op' })
    expect(converted.record.zones.length).toBe(1)
    const two = twoZoneRecord()
    expect(planShowV2ZoneRemove(two, 'zone-2')).toEqual({ kind: 'zone', intent: { kind: 'remove', zoneId: 'zone-2' } })
    expect(planShowV2ZoneRemove(two, 'missing')).toEqual({ kind: 'no-op' })
  })

  it('duplicates a stripes/x Layout with the kind label and unique name', () => {
    const record = layoutDuplicateRecord()
    expect(planShowV2LayoutDuplicate(record, 'layout-1')).toEqual({
      kind: 'layout',
      intent: { kind: 'duplicate', layoutId: 'layout-3', name: 'Left / right stripes', sourceLayoutId: 'layout-1' },
    })
    const taken = layoutDuplicateTakenRecord()
    expect(planShowV2LayoutDuplicate(taken, 'layout-1')).toEqual({
      kind: 'layout',
      intent: { kind: 'duplicate', layoutId: 'layout-3', name: 'Left / right stripes 2', sourceLayoutId: 'layout-1' },
    })
    expect(planShowV2LayoutDuplicate(record, 'missing')).toEqual({
      kind: 'refuse',
      code: 'missing-layout',
      message: expect.any(String),
    })
  })

  it('updates a Layout through rename, routing and single-zone ranges', () => {
    const installation = installationLogicalRecord()
    expect(planShowV2LayoutUpdate(installation, 'layout-1', { logical: undefined })).toEqual({
      kind: 'layout',
      intent: { kind: 'set-routing', layoutId: 'layout-1', logical: null },
    })
    const physical = installationPhysicalRecord()
    const changed = planShowV2LayoutUpdate(physical, 'layout-1', {
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 7 }] },
        { zoneId: 'zone-2', ranges: [{ start: 0, end: 199 }] },
      ],
    })
    expect(changed).toEqual({
      kind: 'layout',
      intent: { kind: 'set-physical-ranges', layoutId: 'layout-1', zoneId: 'zone-2', ranges: [{ start: 0, end: 199 }] },
    })
    expect(planShowV2LayoutUpdate(physical, 'layout-1', {
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 7 }] },
        { zoneId: 'zone-2', ranges: [{ start: 8, end: 15 }] },
      ],
    })).toEqual({ kind: 'no-op' })
    expect(planShowV2LayoutUpdate(physical, 'layout-1', {
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 6 }] },
        { zoneId: 'zone-2', ranges: [{ start: 0, end: 199 }] },
      ],
    })).toEqual({ kind: 'refuse', code: 'multiple-zones', message: expect.any(String) })
    expect(planShowV2LayoutUpdate(physical, 'layout-1', { name: '  ' })).toEqual({
      kind: 'layout',
      intent: { kind: 'rename', layoutId: 'layout-1', name: 'Untitled layout' },
    })
  })

  it('selects physical Installation ranges through compacted indexes', () => {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    expect(planShowV2PhysicalZoneSelection(converted.record, 'layout', 'zone', [0, 1, 2, 5])).toEqual({ kind: 'no-op' })
    const physical = installationPhysicalRecord()
    // Make zone-2 empty to see the change clearly; current is 8-15, new is 0-2,5-5
    expect(planShowV2PhysicalZoneSelection(physical, 'layout-1', 'zone-2', [0, 1, 2, 5])).toEqual({
      kind: 'layout',
      intent: { kind: 'set-physical-ranges', layoutId: 'layout-1', zoneId: 'zone-2', ranges: [{ start: 0, end: 2 }, { start: 5, end: 5 }] },
    })
    expect(compactSpatialIndexes([0, 1, 2, 5])).toEqual([{ start: 0, end: 2 }, { start: 5, end: 5 }])
  })

  it('applies every accepted plan through its owner as changed', () => {
    const two = twoZoneRecord()
    const add = planShowV2ZoneAdd(two)
    if (add.kind !== 'zone') throw new Error('expected zone add')
    expect(editShowZoneV2(structuredClone(two), add.intent).status).toBe('changed')

    const updateName = planShowV2ZoneUpdate(two, 'zone-1', { name: 'A' })
    if (updateName.kind !== 'metadata' || updateName.plan.kind !== 'intent') throw new Error('expected metadata')
    expect(applyShowCommandV2(structuredClone(two), updateName.plan.intent.command, updateName.plan.intent.input).status).toBe('changed')
    const updateCount = planShowV2ZoneUpdate(two, 'zone-1', { nominalPixelCount: 12.6 })
    if (updateCount.kind !== 'metadata' || updateCount.plan.kind !== 'intent') throw new Error('expected metadata')
    expect(applyShowCommandV2(structuredClone(two), updateCount.plan.intent.command, updateCount.plan.intent.input).status).toBe('changed')

    const remove = planShowV2ZoneRemove(installationPhysicalRecord(), 'zone-2')
    if (remove.kind !== 'zone') throw new Error('expected zone remove')
    expect(editShowZoneV2(structuredClone(installationPhysicalRecord()), remove.intent).status).toBe('changed')

    const duplicate = planShowV2LayoutDuplicate(layoutDuplicateRecord(), 'layout-1')
    if (duplicate.kind !== 'layout') throw new Error('expected layout duplicate')
    expect(editShowZoneLayoutDefinitionV2(structuredClone(layoutDuplicateRecord()), duplicate.intent).status).toBe('changed')

    const routing = planShowV2LayoutUpdate(installationLogicalRecord(), 'layout-1', { logical: undefined })
    if (routing.kind !== 'layout') throw new Error('expected layout routing')
    expect(editShowZoneLayoutDefinitionV2(structuredClone(installationLogicalRecord()), routing.intent).status).toBe('changed')

    const ranges = planShowV2LayoutUpdate(installationPhysicalRecord(), 'layout-1', {
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 7 }] },
        { zoneId: 'zone-2', ranges: [{ start: 0, end: 199 }] },
      ],
    })
    if (ranges.kind !== 'layout') throw new Error('expected layout ranges')
    expect(editShowZoneLayoutDefinitionV2(structuredClone(installationPhysicalRecord()), ranges.intent).status).toBe('changed')

    const rename = planShowV2LayoutUpdate(installationPhysicalRecord(), 'layout-1', { name: '  ' })
    if (rename.kind !== 'layout') throw new Error('expected layout rename')
    // 'Untitled layout' is free in this fixture, so the rename lands.
    expect(editShowZoneLayoutDefinitionV2(structuredClone(installationPhysicalRecord()), rename.intent).status).toBe('changed')

    const selection = planShowV2PhysicalZoneSelection(installationPhysicalRecord(), 'layout-1', 'zone-2', [0, 1, 2, 5])
    if (selection.kind !== 'layout') throw new Error('expected layout selection')
    expect(editShowZoneLayoutDefinitionV2(structuredClone(installationPhysicalRecord()), selection.intent).status).toBe('changed')
  })

  it('matches v1 for add, rename, pixel count, duplicate and physical selection after conversion', () => {
    // Add Zone
    {
      const v1 = convertibleV1Show()
      const v1Next = addShowZone(v1)
      const convertedNext = convertShowRecordV1ToV2(v1Next)
      if (convertedNext.status !== 'converted') throw new Error(JSON.stringify(convertedNext.issues))
      const convertedBase = convertShowRecordV1ToV2(v1)
      if (convertedBase.status !== 'converted') throw new Error(JSON.stringify(convertedBase.issues))
      const plan = planShowV2ZoneAdd(convertedBase.record)
      if (plan.kind !== 'zone') throw new Error('expected zone add plan')
      const applied = editShowZoneV2(structuredClone(convertedBase.record), plan.intent)
      if (applied.status !== 'changed') throw new Error(`add owner ${applied.status} ${applied.status === 'refused' ? applied.message : ''}`)
      expect(applied.record.zones).toEqual(convertedNext.record.zones)
    }
    // Zone rename
    {
      const v1 = convertibleV1Show()
      const v1Next = updateShowZone(v1, 'zone', { name: 'Renamed' })
      const convertedNext = convertShowRecordV1ToV2(v1Next)
      if (convertedNext.status !== 'converted') throw new Error(JSON.stringify(convertedNext.issues))
      const convertedBase = convertShowRecordV1ToV2(v1)
      if (convertedBase.status !== 'converted') throw new Error(JSON.stringify(convertedBase.issues))
      const plan = planShowV2ZoneUpdate(convertedBase.record, 'zone', { name: 'Renamed' })
      if (plan.kind !== 'metadata' || plan.plan.kind !== 'intent') throw new Error('expected metadata')
      const applied = applyShowCommandV2(structuredClone(convertedBase.record), plan.plan.intent.command, plan.plan.intent.input)
      if (applied.status !== 'changed') throw new Error('rename owner not changed')
      expect(applied.record.zones).toEqual(convertedNext.record.zones)
    }
    // Zone pixel count
    {
      const v1 = convertibleV1Show()
      const v1Next = updateShowZone(v1, 'zone', { nominalPixelCount: 12.6 })
      const convertedNext = convertShowRecordV1ToV2(v1Next)
      if (convertedNext.status !== 'converted') throw new Error(JSON.stringify(convertedNext.issues))
      const convertedBase = convertShowRecordV1ToV2(v1)
      if (convertedBase.status !== 'converted') throw new Error(JSON.stringify(convertedBase.issues))
      const plan = planShowV2ZoneUpdate(convertedBase.record, 'zone', { nominalPixelCount: 12.6 })
      if (plan.kind !== 'metadata' || plan.plan.kind !== 'intent') throw new Error('expected metadata')
      const applied = applyShowCommandV2(structuredClone(convertedBase.record), plan.plan.intent.command, plan.plan.intent.input)
      if (applied.status !== 'changed') throw new Error('pixel count owner not changed')
      expect(applied.record.zones).toEqual(convertedNext.record.zones)
    }
    // Duplicate Layout
    {
      const v1 = convertibleV1Show()
      v1.routingLayouts = [
        { id: 'layout-1', name: 'Layout one', zones: [], logical: { kind: 'stripes', axis: 'x', zoneIds: ['zone'] } },
        { id: 'layout-2', name: 'Layout two', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } },
      ]
      const v1Next = addShowRoutingLayout(v1, undefined, 'layout-1')
      const convertedNext = convertShowRecordV1ToV2(v1Next)
      if (convertedNext.status !== 'converted') throw new Error(JSON.stringify(convertedNext.issues))
      const convertedBase = convertShowRecordV1ToV2(v1)
      if (convertedBase.status !== 'converted') throw new Error(JSON.stringify(convertedBase.issues))
      const plan = planShowV2LayoutDuplicate(convertedBase.record, 'layout-1')
      if (plan.kind !== 'layout') throw new Error('expected layout duplicate')
      const applied = editShowZoneLayoutDefinitionV2(structuredClone(convertedBase.record), plan.intent)
      if (applied.status !== 'changed') throw new Error(`duplicate owner ${applied.status}`)
      expect(applied.record.zoneLayouts).toEqual(convertedNext.record.zoneLayouts)
    }
    // Physical selection (installation)
    {
      const v1 = convertibleV1Show()
      v1.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' } as typeof v1.outputContract
      v1.zones = [{ id: 'zone', name: 'Main', nominalPixelCount: 16 }]
      v1.routingLayouts = [{ id: 'layout', name: 'Physical', zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: 15 }] }] }]
      const v1Next = updateShowPhysicalZoneSelection(v1, 'layout', 'zone', [0, 1, 2, 5])
      const convertedNext = convertShowRecordV1ToV2(v1Next)
      if (convertedNext.status !== 'converted') throw new Error(JSON.stringify(convertedNext.issues))
      const convertedBase = convertShowRecordV1ToV2(v1)
      if (convertedBase.status !== 'converted') throw new Error(JSON.stringify(convertedBase.issues))
      const plan = planShowV2PhysicalZoneSelection(convertedBase.record, 'layout', 'zone', [0, 1, 2, 5])
      if (plan.kind !== 'layout') throw new Error('expected layout selection')
      const applied = editShowZoneLayoutDefinitionV2(structuredClone(convertedBase.record), plan.intent)
      if (applied.status !== 'changed') throw new Error('selection owner not changed')
      expect(applied.record.zoneLayouts).toEqual(convertedNext.record.zoneLayouts)
    }
  })
})
