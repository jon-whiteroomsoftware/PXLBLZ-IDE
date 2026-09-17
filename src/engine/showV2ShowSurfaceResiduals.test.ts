import { describe, expect, it } from 'vitest'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import { SHOW_COMMANDS_V2 } from './showCommandsV2/registry'
import { prepareShowStageV2 } from './showPreparedStageV2'

/**
 * The two Show-level surfaces #1039 did not deliver, recorded as checked facts
 * rather than prose, so the residual in
 * `docs/reference/contracts/show-editor-v2.md` cannot quietly go stale.
 *
 * Both are missing owners, not missing editor surfaces: adding or removing a
 * Zone and editing a Layout definition's routing have no v2 owner and no
 * command, so an agent cannot do them either. Landing either owner fails a test
 * here, which is the prompt to move its row out of that table.
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

describe('Show-level surfaces the v2 route still has no owner for', () => {
  it('has no command that creates or removes a Zone', () => {
    const zoneCommands = SHOW_COMMANDS_V2.filter(command => /zone/.test(command.name))
    expect(zoneCommands.map(command => command.name)).toEqual(['update_zone'])
    // `update_zone` is Zone metadata only: it names one existing Zone and writes
    // fields on it. Nothing in the catalogue writes the `zones` collection.
    expect(zoneCommands[0].touches).toEqual(['/zones/*/name', '/zones/*/nominalPixelCount', '/zones/*/color'])
  })

  it('refuses a Show whose new Zone no Layout definition routes', () => {
    const record = preparedFixture()
    expect(prepareShowStageV2(record, dependencies).status).toBe('ready')
    // The smallest counterexample for the missing Zone-add owner: appending a
    // valid Zone is not enough, because every Layout definition must route it.
    record.zones = [...record.zones, { id: 'spare', name: 'Spare', nominalPixelCount: 8 }]
    const refused = prepareShowStageV2(record, dependencies)
    expect(refused.status).toBe('refused')
    expect(refused.status === 'refused' && refused.message).toContain('missing zone "Spare"')
  })

  it('has no command that writes a Layout definition\'s routing', () => {
    // One command touches the definition collection, and it only appends a
    // clone of an existing definition: nothing reaches into a definition's own
    // fields, so `logical` - the routing mode and its operator - has no writer.
    const writers = SHOW_COMMANDS_V2.filter(command => command.touches.some(path => path.startsWith('/zoneLayouts')))
    expect(writers.map(command => command.name)).toEqual(['make_layout_interval_unique'])
    expect(writers.flatMap(command => command.touches.filter(path => path.startsWith('/zoneLayouts/')))).toEqual([])
    expect(Object.keys(writers[0].fields)).toEqual(['interval_id', 'name'])
  })
})
