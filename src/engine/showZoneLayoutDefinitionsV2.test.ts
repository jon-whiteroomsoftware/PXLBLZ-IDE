import { describe, expect, it } from 'vitest'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'
import { createInstallationShowOutputContract } from './showOutputContract'
import { prepareShowStageV2 } from './showPreparedStageV2'
import { editShowZoneLayoutDefinitionV2 } from './showZoneLayoutDefinitionsV2'

/**
 * The v2 Zone Layout definition owner (#1039): add, duplicate, rename, remove,
 * the routing mode with its operator and member Zones, and an Installation
 * Zone's physical LED ranges.
 */
const dependencies = {
  patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }],
  maps: [],
  libraries: [],
  profiles: [],
  stageMap: null,
}

function record(): ShowRecordV2 {
  const value = commandFixtureV2()
  for (const instance of value.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  expect(validateShowRecordV2(value)).toEqual([])
  return value
}

function installationRecord(): ShowRecordV2 {
  const value = record()
  value.outputContract = createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 16 })
  value.zoneLayouts = [
    { id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'right', ranges: [{ start: 8, end: 15 }] }] },
    { id: 'left-only', name: 'Left only', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 15 }] }, { zoneId: 'right', ranges: [] }] },
  ]
  expect(validateShowRecordV2(value)).toEqual([])
  return value
}

function reopen(value: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(value))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

describe('adding and duplicating a definition', () => {
  it('seeds a Portable definition from the first definition operator and nominal ranges', () => {
    const source = record()
    const before = structuredClone(source)
    const result = editShowZoneLayoutDefinitionV2(source, { kind: 'add', layoutId: 'split-y', name: 'Vertical' })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(source).toEqual(before)

    const added = reopen(result.record).zoneLayouts[2]
    expect(added).toEqual({
      id: 'split-y',
      name: 'Vertical',
      // v1's `addShowRoutingLayout` clones the first definition's operator for a
      // Portable contract, and seeds nominal contiguous ranges from the Zones.
      logical: { kind: 'split', axis: 'x', zoneIds: ['left', 'right'] },
      zones: [
        { zoneId: 'left', ranges: [{ start: 0, end: 7 }] },
        { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
      ],
    })
    expect(result.affectedLayoutDefinitionIds).toEqual(['split-y'])
    expect(result.removedIds).toEqual([])
    expect(prepareShowStageV2(result.record, dependencies).status).toBe('ready')
  })

  it('seeds an Installation definition with physical ranges and no operator', () => {
    const result = editShowZoneLayoutDefinitionV2(installationRecord(), { kind: 'add', layoutId: 'phys', name: 'Ranges' })
    if (result.status !== 'changed') throw new Error(result.status)
    expect(result.record.zoneLayouts[2]).toEqual({
      id: 'phys',
      name: 'Ranges',
      zones: [
        { zoneId: 'left', ranges: [{ start: 0, end: 7 }] },
        { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
      ],
    })
  })

  it('duplicates an existing definition exactly under fresh identity', () => {
    const source = record()
    const result = editShowZoneLayoutDefinitionV2(source, { kind: 'duplicate', layoutId: 'copy', name: 'Left only 2', sourceLayoutId: 'left-only' })
    if (result.status !== 'changed') throw new Error(result.status)
    expect(result.record.zoneLayouts[2]).toEqual({ id: 'copy', name: 'Left only 2', zones: [], logical: { kind: 'single', zoneIds: ['left'] } })
    expect(result.record.zoneLayouts[2].logical).not.toBe(source.zoneLayouts[1].logical)
  })

  it('refuses a blank, duplicate or unknown-source definition', () => {
    const source = record()
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'add', layoutId: ' ', name: 'Name' })).toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'add', layoutId: 'new', name: ' ' })).toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'add', layoutId: 'both', name: 'Name' })).toMatchObject({ status: 'refused', code: 'identity-conflict' })
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'add', layoutId: 'new', name: 'both' })).toMatchObject({ status: 'refused', code: 'duplicate-name' })
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'duplicate', layoutId: 'new', name: 'Name', sourceLayoutId: 'nope' }))
      .toMatchObject({ status: 'refused', code: 'missing-target' })
  })
})

describe('renaming and removing a definition', () => {
  it('renames one definition and reports an identical name as a no-op', () => {
    const source = record()
    const result = editShowZoneLayoutDefinitionV2(source, { kind: 'rename', layoutId: 'left-only', name: 'Left alone' })
    if (result.status !== 'changed') throw new Error(result.status)
    expect(result.record.zoneLayouts.map(layout => layout.name)).toEqual(['Both', 'Left alone'])
    const same = editShowZoneLayoutDefinitionV2(source, { kind: 'rename', layoutId: 'left-only', name: 'Left only' })
    expect(same.status).toBe('unchanged')
    expect(same.record).toBe(source)
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'rename', layoutId: 'left-only', name: 'Both' }))
      .toMatchObject({ status: 'refused', code: 'duplicate-name' })
  })

  it('removes an unused definition', () => {
    const source = record()
    const result = editShowZoneLayoutDefinitionV2(source, { kind: 'remove', layoutId: 'left-only' })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(reopen(result.record).zoneLayouts.map(layout => layout.id)).toEqual(['both'])
    expect(result.affectedLayoutDefinitionIds).toEqual(['left-only'])
    expect(result.removedIds).toEqual(['left-only'])
  })

  /**
   * v1 dropped the routing switches that named a removed definition, and the
   * interval at time zero silently re-pointed at whatever definition was first
   * in the list. A v2 occurrence names its definition explicitly and the first
   * occurrence can never be removed, so that rewrite has no exact v2 form. The
   * owner refuses while any occurrence still names the definition, and the
   * author resolves it through the occurrence owner, which is v1's semantics
   * without the hidden re-point.
   */
  it('refuses a definition an occurrence still names, and accepts it once the occurrence moves', () => {
    const source = record()
    const used = editShowZoneLayoutDefinitionV2(source, { kind: 'remove', layoutId: 'both' })
    expect(used).toMatchObject({ status: 'refused', code: 'definition-in-use' })
    expect(used.status === 'refused' && used.message)
      .toBe('Layout occurrences "interval-1", "interval-2" still use Zone Layout "both". Select another Zone Layout there first.')
    expect(used.record).toBe(source)

    let working = source
    for (const occurrenceId of ['interval-1', 'interval-2']) {
      const moved = editShowLayoutIntervalsV2(working, { kind: 'select-layout', occurrenceId, layoutId: 'left-only' })
      if (moved.status !== 'changed') throw new Error(`${occurrenceId}: ${JSON.stringify(moved)}`)
      working = moved.record
    }
    const removed = editShowZoneLayoutDefinitionV2(working, { kind: 'remove', layoutId: 'both' })
    if (removed.status !== 'changed') throw new Error(`${removed.status}: ${JSON.stringify(removed)}`)
    expect(removed.record.zoneLayouts.map(layout => layout.id)).toEqual(['left-only'])
  })

  it('refuses the last definition', () => {
    const source = record()
    const one = editShowZoneLayoutDefinitionV2(source, { kind: 'remove', layoutId: 'left-only' })
    if (one.status !== 'changed') throw new Error(one.status)
    const last = editShowZoneLayoutDefinitionV2(one.record, { kind: 'remove', layoutId: 'both' })
    expect(last).toMatchObject({ status: 'refused', code: 'last-definition' })
    expect(last.record).toBe(one.record)
  })
})

describe('routing mode, operator and member Zones', () => {
  it('writes a complete operator with its member Zones', () => {
    const source = record()
    const result = editShowZoneLayoutDefinitionV2(source, {
      kind: 'set-routing',
      layoutId: 'both',
      logical: { kind: 'checker', zoneIds: ['right', 'left'], columns: 3, rows: 5 },
    })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(reopen(result.record).zoneLayouts[0].logical).toEqual({ kind: 'checker', zoneIds: ['right', 'left'], columns: 3, rows: 5 })
    expect(result.affectedLayoutDefinitionIds).toEqual(['both'])
    expect(prepareShowStageV2(result.record, dependencies).status).toBe('ready')
    const same = editShowZoneLayoutDefinitionV2(result.record, {
      kind: 'set-routing',
      layoutId: 'both',
      logical: { kind: 'checker', zoneIds: ['right', 'left'], columns: 3, rows: 5 },
    })
    expect(same.status).toBe('unchanged')
  })

  it('refuses an operator the compiler cannot route, an unknown Zone and physical routing under a Portable contract', () => {
    const source = record()
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'set-routing', layoutId: 'both', logical: { kind: 'checker', zoneIds: ['left'], columns: 2, rows: 2 } as never }))
      .toMatchObject({ status: 'refused', code: 'invalid-routing' })
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'set-routing', layoutId: 'both', logical: { kind: 'grid', zoneIds: ['left', 'right'], columns: 2, rows: 2 } }))
      .toMatchObject({ status: 'refused', code: 'invalid-routing' })
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'set-routing', layoutId: 'both', logical: { kind: 'single', zoneIds: ['nope'] } }))
      .toMatchObject({ status: 'refused', code: 'missing-zone' })
    // v1's routing-mode select offers physical ranges only when the contract is
    // not Portable, because a Portable Show routes by normalized position.
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'set-routing', layoutId: 'both', logical: null }))
      .toMatchObject({ status: 'refused', code: 'unsupported-contract' })
  })

  it('refuses an operator that would leave a Clip on an unrouted Zone', () => {
    const source = record()
    const refused = editShowZoneLayoutDefinitionV2(source, { kind: 'set-routing', layoutId: 'both', logical: { kind: 'single', zoneIds: ['right'] } })
    expect(refused).toMatchObject({ status: 'refused', code: 'zone-unavailable' })
    expect(refused.status === 'refused' && refused.message).toContain('left')
    expect(refused.record).toBe(source)
  })

  it('turns an Installation definition back to physical ranges', () => {
    const source = installationRecord()
    source.zoneLayouts[0].logical = { kind: 'stripes', axis: 'x', zoneIds: ['left', 'right'] }
    const result = editShowZoneLayoutDefinitionV2(source, { kind: 'set-routing', layoutId: 'both', logical: null })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(result.record.zoneLayouts[0]).toEqual({
      id: 'both',
      name: 'Both',
      zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'right', ranges: [{ start: 8, end: 15 }] }],
    })
  })
})

describe('physical LED ranges', () => {
  it('writes one Zone ranges, ordered, and leaves the other Zones alone', () => {
    const source = installationRecord()
    const before = structuredClone(source)
    const result = editShowZoneLayoutDefinitionV2(source, {
      kind: 'set-physical-ranges',
      layoutId: 'both',
      zoneId: 'left',
      ranges: [{ start: 12, end: 15 }, { start: 3, end: 0 }],
    })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(source).toEqual(before)
    expect(reopen(result.record).zoneLayouts[0].zones).toEqual([
      // v1 normalizes each range low-to-high and sorts them by start.
      { zoneId: 'left', ranges: [{ start: 0, end: 3 }, { start: 12, end: 15 }] },
      { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
    ])
    expect(result.affectedLayoutDefinitionIds).toEqual(['both'])
    expect(result.affectedZoneIds).toEqual(['left'])
  })

  it('accepts an empty selection and reports an identical one as a no-op', () => {
    const source = installationRecord()
    const cleared = editShowZoneLayoutDefinitionV2(source, { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [] })
    if (cleared.status !== 'changed') throw new Error(cleared.status)
    expect(cleared.record.zoneLayouts[0].zones[1]).toEqual({ zoneId: 'right', ranges: [] })
    const same = editShowZoneLayoutDefinitionV2(source, { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [{ start: 8, end: 15 }] })
    expect(same.status).toBe('unchanged')
    expect(same.record).toBe(source)
  })

  it('adds an entry for a Zone the definition does not list yet', () => {
    const source = installationRecord()
    source.zoneLayouts[0].zones = [{ zoneId: 'left', ranges: [{ start: 0, end: 15 }] }]
    const result = editShowZoneLayoutDefinitionV2(source, { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [{ start: 8, end: 15 }] })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(result.record.zoneLayouts[0].zones).toEqual([
      { zoneId: 'left', ranges: [{ start: 0, end: 15 }] },
      { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
    ])
  })

  it('refuses malformed ranges, an unknown Zone and a definition that routes by operator', () => {
    const source = installationRecord()
    for (const ranges of [
      [{ start: -1, end: 4 }],
      [{ start: 0.5, end: 4 }],
      [{ start: 0, end: Number.NaN }],
      [{ start: 0, end: 4, zoneId: 'left' } as never],
    ]) {
      expect(editShowZoneLayoutDefinitionV2(source, { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'left', ranges }))
        .toMatchObject({ status: 'refused', code: 'invalid-request' })
    }
    expect(editShowZoneLayoutDefinitionV2(source, { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'nope', ranges: [] }))
      .toMatchObject({ status: 'refused', code: 'missing-zone' })
    expect(editShowZoneLayoutDefinitionV2(record(), { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'left', ranges: [] }))
      .toMatchObject({ status: 'refused', code: 'invalid-request' })
  })

  /**
   * v1 accepts ranges that miss, overlap or exceed the output contract's pixel
   * count and reports the gap through installation coverage instead. Refusing
   * them here would narrow shipped behavior, so the owner accepts them and the
   * editor shows the same coverage readout the v1 panel does.
   */
  it('accepts incomplete coverage the way v1 does', () => {
    const source = installationRecord()
    const result = editShowZoneLayoutDefinitionV2(source, {
      kind: 'set-physical-ranges',
      layoutId: 'both',
      zoneId: 'left',
      ranges: [{ start: 0, end: 99 }],
    })
    if (result.status !== 'changed') throw new Error(result.status)
    expect(result.record.zoneLayouts[0].zones[0].ranges).toEqual([{ start: 0, end: 99 }])
  })
})
