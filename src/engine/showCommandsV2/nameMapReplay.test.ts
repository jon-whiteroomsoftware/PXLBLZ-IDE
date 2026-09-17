import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SHOW_COMMANDS } from '../showCommands/registry'
import { SHOW_COMMANDS_V2 } from './registry'
import { SHOW_COMMAND_V2_NAME_MAP } from './coverage'

// The harness grammar, corpus and baseline fixtures replay through the v1 to v2
// name map. This proves the map is complete for every name those artifacts
// actually use, so the cutover in #1039 can rewrite them mechanically instead of
// discovering a missing row at activation time.

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

/** Bridge tools the harness owns; they are not authored Show commands. */
const HARNESS_BRIDGE_TOOLS = new Set([
  'finish_turn', 'get_stock_pattern', 'resolve_reference', 'open_show', 'read_show',
  'apply_patch', 'set_field', 'restart_clip',
])

function namesIn(path: string): string[] {
  const text = readFileSync(join(repoRoot, path), 'utf8')
  return [...new Set([
    ...[...text.matchAll(/"tool":\s*"([a-z_]+)"/g)].map(match => match[1]),
    ...[...text.matchAll(/\b(?:tool|operation|name):\s*'([a-z_]+)'/g)].map(match => match[1]),
  ])]
}

const v1ByName = new Map(SHOW_COMMAND_V2_NAME_MAP.flatMap(entry => entry.v1 ? [[entry.v1, entry] as const] : []))
const v1Names = new Set(SHOW_COMMANDS.map(command => command.name))
const v2Names = new Set(SHOW_COMMANDS_V2.map(command => command.name))

describe('v1 to v2 name map replay', () => {
  it('maps every registered v1 command exactly once', () => {
    const missing = [...v1Names].filter(name => !v1ByName.has(name))
    expect(missing.sort(), 'every registered v1 command needs a map row').toEqual([])
    const unknown = [...v1ByName.keys()].filter(name => !v1Names.has(name))
    expect(unknown.sort(), 'the map must not name a command the v1 registry does not register').toEqual([])
  })

  it('replays the baseline fixture scripts through the map', () => {
    const used = namesIn('src/agent-harness/baseline/scripts.ts').filter(name => v1Names.has(name))
    expect(used.length, 'the baseline scripts must exercise Show commands').toBeGreaterThan(0)
    const replayed = used.map(name => v1ByName.get(name)!.v2)
    expect(replayed.filter(name => name !== null && !v2Names.has(name!)), 'every replayed name exists in v2').toEqual([])
    // Recorded so a later rename shows up here as a diff rather than silently.
    const renamed = used
      .filter(name => v1ByName.get(name)!.v2 !== name)
      .map(name => [name, v1ByName.get(name)!.v2] as const)
      .sort((left, right) => left[0].localeCompare(right[0]))
    expect(Object.fromEntries(renamed)).toEqual({
      add_clip: 'create_clips',
      add_keyframe: 'edit_property_keyframes',
      add_overlay_layer: 'create_layers',
      add_property_track: 'add_property_tracks',
      delete_keyframe: 'edit_property_keyframes',
      delete_property_track: 'remove_property_tracks',
      insert_layer_transition: 'insert_transition',
      move_clip: 'update_clips',
      move_marker: 'update_marker',
      remove_clip: 'remove_clips',
      reset_layer_transition_to_cut: 'remove_transition',
      resize_layer_transition: 'resize_transition',
      set_boundary_layout: 'select_layout',
      set_boundary_transition: 'insert_transition',
      set_boundary_transition_timing: 'resize_transition',
      set_clip_control_target: 'update_clips',
      set_clip_evaluation: 'update_clips',
      set_clip_time: 'update_clips',
      set_clip_view: 'update_clips',
      update_boundary_transition_parameter: 'update_transition',
      update_keyframe: 'edit_property_keyframes',
    })
  })

  it('replays the dictation corpus cases through the map', () => {
    const referenced = namesIn('src/agent-harness/experiment/cases.ts')
    const commands = referenced.filter(name => v1Names.has(name))
    const unexplained = referenced.filter(name => !v1Names.has(name) && !HARNESS_BRIDGE_TOOLS.has(name))
    expect(unexplained.sort(), 'every corpus name is a Show command or a named harness bridge tool').toEqual([])
    expect(commands.length).toBeGreaterThan(20)
    const renamed = commands
      .filter(name => v1ByName.get(name)!.v2 !== name)
      .map(name => [name, v1ByName.get(name)!.v2] as const)
      .sort((left, right) => left[0].localeCompare(right[0]))
    // Exactly the corpus rows a v2 replay must rewrite, and what they become.
    expect(Object.fromEntries(renamed)).toEqual({
      add_clip: 'create_clips',
      add_keyframe: 'edit_property_keyframes',
      add_property_track: 'add_property_tracks',
      delete_property_track: 'remove_property_tracks',
      insert_layer_transition: 'insert_transition',
      move_clip: 'update_clips',
      move_marker: 'update_marker',
      remove_clip: 'remove_clips',
      reset_layer_transition_to_cut: 'remove_transition',
      resize_layer_transition: 'resize_transition',
      set_boundary_transition: 'insert_transition',
      set_boundary_transition_timing: 'resize_transition',
      set_clip_control_target: 'update_clips',
      set_clip_evaluation: 'update_clips',
      set_clip_time: 'update_clips',
      set_clip_view: 'update_clips',
      update_boundary_transition_parameter: 'update_transition',
      update_keyframe: 'edit_property_keyframes',
    })
  })

  it('keeps the harness restart_clip grammar mapped onto the Clip entry policy', () => {
    // The harness names a restart operation; v2 authors it as entry_policy.
    expect(HARNESS_BRIDGE_TOOLS.has('restart_clip')).toBe(true)
    const clipCommands = SHOW_COMMANDS_V2.filter(command => ['create_clips', 'update_clips'].includes(command.name))
    for (const command of clipCommands) {
      const collection = command.name === 'create_clips' ? command.fields.clips : command.fields.updates
      expect(collection.kind).toBe('array')
      if (collection.kind !== 'array' || collection.items.kind !== 'object') continue
      const entryPolicy = collection.items.properties.entry_policy
      expect(entryPolicy, `${command.name} must author entry_policy`).toBeDefined()
      expect(entryPolicy.kind === 'string' ? entryPolicy.enum : undefined).toEqual(['continue', 'restart'])
    }
    // No separate restart command exists in the catalogue.
    expect([...v2Names].filter(name => name.includes('restart'))).toEqual([])
  })

  it('publishes no runtime alias for a retired v1 name', () => {
    const retired = SHOW_COMMAND_V2_NAME_MAP
      .filter(entry => entry.v1 !== null && entry.v2 !== entry.v1)
      .map(entry => entry.v1!)
    for (const name of retired) {
      expect(v2Names.has(name), `${name} is retired and must not be registered in v2`).toBe(false)
    }
  })
})
