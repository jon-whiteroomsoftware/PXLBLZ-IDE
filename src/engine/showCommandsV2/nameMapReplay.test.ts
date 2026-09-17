import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SHOW_COMMANDS } from '../showCommands/registry'
import { SHOW_COMMANDS_V2 } from './registry'
import { SHOW_COMMAND_V2_NAME_MAP } from './coverage'

// The v1 to v2 name map, and the harness artifacts it governed.
//
// Before the #1039 cutover the harness grammar, corpus and baseline scripts were
// replayed through the map to prove it was complete for every name they used.
// The cutover has happened: those artifacts are authored on the v2 catalogue's
// own names, so the replay cases below now assert the other half of the same
// property — that no retired v1 name survives in them, and that every name they
// do use is one the v2 catalogue registers or a named harness bridge tool. The
// map itself is still proved complete against the v1 registry above.

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

  it.each([
    ['the baseline fixture scripts', 'src/agent-harness/baseline/scripts.ts'],
    ['the dictation corpus cases', 'src/agent-harness/experiment/cases.ts'],
  ])('leaves no retired version-1 name in %s', (_label, path) => {
    const referenced = namesIn(path)
    // A retired name is one the map renames; it must not appear at all.
    const retired = referenced.filter(name => v1ByName.get(name)?.v2 !== undefined && v1ByName.get(name)!.v2 !== name)
    expect(retired.sort(), 'the cutover retired these names; they must not reappear').toEqual([])
    const commands = referenced.filter(name => v2Names.has(name))
    expect(commands.length, 'the artifact must exercise version-2 Show commands').toBeGreaterThan(0)
    const unexplained = referenced.filter(name => !v2Names.has(name) && !HARNESS_BRIDGE_TOOLS.has(name))
    expect(unexplained.sort(), 'every name is a v2 Show command or a named harness bridge tool').toEqual([])
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
