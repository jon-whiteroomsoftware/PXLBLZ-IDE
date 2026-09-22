import { describe, expect, it } from 'vitest'
import { compactSpatialIndexes } from './showSpatialSelection'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import { SHOW_COMMANDS_V2 } from './showCommandsV2/registry'
import { createInstallationShowOutputContract } from './showOutputContract'
import { prepareShowStageV2 } from './showPreparedStageV2'
import { editShowZoneLayoutDefinitionV2 } from './showZoneLayoutDefinitionsV2'
import { editShowZoneV2 } from './showZonesV2'

/**
 * The Show-level surfaces #1039 records as checked facts rather than prose, so
 * the residual table in `docs/reference/contracts/show-editor-v2.md` cannot
 * quietly go stale.
 *
 * Two of the three rows this file used to hold are gone: `showZonesV2` and
 * `showZoneLayoutDefinitionsV2` own adding and removing a Zone and a Layout
 * definition's routing, and the editor submits them through the closed
 * prepared-edit admission. What remains is the deliberate absence - no MCP
 * command for Show structure, by Jon's #943 scope principle - and the pinned
 * seam that keeps the ported Stage LED selector a projection onto the Zone
 * Layout owner (#1066 slice 7).
 */
const dependencies = {
  patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }],
  maps: [], libraries: [], profiles: [], stageMap: null,
}

function preparedFixture() {
  const record = commandFixtureV2()
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  return record
}

describe('Show structure is an editor surface, not an MCP command (#943)', () => {
  it('has no command that creates or removes a Zone', () => {
    const zoneCommands = SHOW_COMMANDS_V2.filter(command => /zone/.test(command.name))
    expect(zoneCommands.map(command => command.name)).toEqual(['update_zone'])
    // `update_zone` is Zone metadata only: it names one existing Zone and writes
    // fields on it. Nothing in the catalogue writes the `zones` collection,
    // because the MCP command set edits content in Shows, not Show structure.
    expect(zoneCommands[0].touches).toEqual(['/zones/*/name', '/zones/*/nominalPixelCount', '/zones/*/color'])
  })

  it('has no command that writes a Layout definition\'s routing', () => {
    // One command touches the definition collection, and it only appends a
    // clone of an existing definition: nothing reaches into a definition's own
    // fields. `editShowZoneLayoutDefinitionV2` is the editor's writer for them.
    const writers = SHOW_COMMANDS_V2.filter(command => command.touches.some(path => path.startsWith('/zoneLayouts')))
    expect(writers.map(command => command.name)).toEqual(['make_layout_interval_unique'])
    expect(writers.flatMap(command => command.touches.filter(path => path.startsWith('/zoneLayouts/')))).toEqual([])
    expect(Object.keys(writers[0].fields)).toEqual(['interval_id', 'name'])
  })
})

describe('the owners #1039 landed for those surfaces', () => {
  it('routes a new Zone in every Layout definition, so the Show still prepares', () => {
    const record = preparedFixture()
    expect(prepareShowStageV2(record, dependencies).status).toBe('ready')
    // The smallest counterexample for the missing Zone-add owner: appending a
    // valid Zone by hand is not enough, because every Layout definition must
    // route it or the whole Show stops preparing.
    const byHand = structuredClone(record)
    byHand.zones = [...byHand.zones, { id: 'spare', name: 'Spare', nominalPixelCount: 8 }]
    const refused = prepareShowStageV2(byHand, dependencies)
    expect(refused.status).toBe('refused')
    expect(refused.status === 'refused' && refused.message).toContain('missing zone "Spare"')

    // Through the owner, the same addition prepares.
    const added = editShowZoneV2(record, { kind: 'add', zone: { id: 'spare', name: 'Spare', nominalPixelCount: 8 } })
    if (added.status !== 'changed') throw new Error(`${added.status}: ${JSON.stringify(added)}`)
    expect(prepareShowStageV2(added.record, dependencies).status).toBe('ready')
  })

  it('writes a Layout definition routing mode and its member Zones', () => {
    const routed = editShowZoneLayoutDefinitionV2(preparedFixture(), {
      kind: 'set-routing',
      layoutId: 'both',
      logical: { kind: 'stripes', axis: 'y', zoneIds: ['left', 'right'] },
    })
    if (routed.status !== 'changed') throw new Error(`${routed.status}: ${JSON.stringify(routed)}`)
    expect(routed.record.zoneLayouts[0].logical).toEqual({ kind: 'stripes', axis: 'y', zoneIds: ['left', 'right'] })
    expect(prepareShowStageV2(routed.record, dependencies).status).toBe('ready')
  })
})

describe('the Stage LED selector stays a projection onto the Zone Layout owner', () => {
  /**
   * `ShowZoneSpatialSelector` - dragging across the Stage map to select an
   * Installation Zone's LEDs - reads only the fields both backings share, and
   * on the v2 route its commit goes through `planShowV2PhysicalZoneSelection`
   * to this owner (#1066 slice 7). This test pins that seam so the selector
   * stays a projection rather than becoming a second writer.
   */
  it('accepts the exact ranges the Stage selector would commit', () => {
    const record = preparedFixture()
    record.outputContract = createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 16 })
    record.zoneLayouts = [
      { id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 15 }] }, { zoneId: 'right', ranges: [] }] },
      { id: 'left-only', name: 'Left only', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 15 }] }, { zoneId: 'right', ranges: [] }] },
    ]
    const selected = [12, 13, 14, 15, 4, 5]
    const result = editShowZoneLayoutDefinitionV2(record, {
      kind: 'set-physical-ranges',
      layoutId: 'both',
      zoneId: 'right',
      ranges: compactSpatialIndexes(selected),
    })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(result.record.zoneLayouts[0].zones[1]).toEqual({
      zoneId: 'right',
      ranges: [{ start: 4, end: 5 }, { start: 12, end: 15 }],
    })
  })
})
