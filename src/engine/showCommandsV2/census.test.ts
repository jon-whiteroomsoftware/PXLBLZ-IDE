import { describe, expect, it } from 'vitest'
import {
  SHOW_COMMANDS_V2,
  SHOW_COMMAND_V2_AFFECTED_COLLECTIONS,
  type ShowCommandV2Descriptor,
  type ShowCommandV2Field,
} from './registry'
import { SHOW_COMMAND_V2_NAME_MAP, SHOW_COMMAND_V2_REFUSAL_CODES, RETIRED_V1_ADDRESSING } from './coverage'

// The descriptor census for issue #1041's catalogue rules 1–10. It is the gate
// that stops a later family from reintroducing index addressing, an untyped
// field, a per-command no-op exception or a redundant singular setter.

function walk(field: ShowCommandV2Field, path: string, visit: (field: ShowCommandV2Field, path: string) => void): void {
  visit(field, path)
  if (field.kind === 'object') {
    for (const [name, property] of Object.entries(field.properties)) walk(property, `${path}.${name}`, visit)
  } else if (field.kind === 'array') walk(field.items, `${path}[]`, visit)
  else if (field.kind === 'record') walk(field.values, `${path}{}`, visit)
  else if (field.kind === 'union') field.variants.forEach((variant, index) => walk(variant, `${path}|${index}`, visit))
}

function everyField(descriptor: ShowCommandV2Descriptor): Array<{ field: ShowCommandV2Field; path: string }> {
  const found: Array<{ field: ShowCommandV2Field; path: string }> = []
  for (const [name, field] of Object.entries(descriptor.fields)) {
    walk(field, `${descriptor.name}.${name}`, (item, path) => found.push({ field: item, path }))
  }
  return found
}

const VERBS = [
  'create_', 'add_', 'update_', 'remove_', 'move_', 'resize_', 'split_', 'duplicate_',
  'insert_', 'rename_', 'reorder_', 'select_', 'set_', 'replace_', 'rejoin_', 'make_', 'edit_', 'ungroup',
]

describe('v2 command catalogue census', () => {
  it('rule 1: addresses entities by stable identity only', () => {
    const banned = ['scene_id', 'overlay_layer_index', 'after_clip_id', 'target_clip_id', 'layer_index', 'boundary_id', 'cell_id']
    for (const descriptor of SHOW_COMMANDS_V2) {
      for (const { path } of everyField(descriptor)) {
        const name = path.split('.').pop()!.replace(/\[\]|\{\}|\|\d+/g, '')
        expect(banned, `${path} uses retired addressing`).not.toContain(name)
      }
      // A `layer` field that accepts "main" or an index is the retired v1 union.
      expect(Object.keys(descriptor.fields), `${descriptor.name} keeps a bare layer field`).not.toContain('layer')
    }
    // Every retired v1 addressing form is recorded, so the map explains each one.
    expect(RETIRED_V1_ADDRESSING.length).toBeGreaterThan(0)
  })

  it('rule 2: every time and duration field is bounded safe-integer milliseconds', () => {
    for (const descriptor of SHOW_COMMANDS_V2) {
      for (const { field, path } of everyField(descriptor)) {
        const name = path.split('.').pop()!
        if (!/_ms(\[\])?$/.test(name)) continue
        expect(field.kind, `${path} must be an integer field`).toBe('integer')
        if (field.kind !== 'integer') continue
        expect(field.minimum, `${path} needs a schema minimum`).toBeTypeOf('number')
        expect(field.maximum, `${path} needs a schema maximum`).toBeTypeOf('number')
        expect(field.maximum!).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
      }
    }
  })

  it('rule 3: every name uses the closed verb vocabulary and retires delete_ and reset_', () => {
    for (const descriptor of SHOW_COMMANDS_V2) {
      expect(descriptor.name, `${descriptor.name} is not snake_case`).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(VERBS.some(verb => descriptor.name.startsWith(verb)), `${descriptor.name} uses an unknown verb`).toBe(true)
      expect(descriptor.name.startsWith('delete_'), `${descriptor.name} uses the retired delete_ verb`).toBe(false)
      expect(descriptor.name.startsWith('reset_'), `${descriptor.name} uses the retired reset_ verb`).toBe(false)
    }
  })

  it('rule 5: every field is typed, closed sets are enums and ranges carry schema bounds', () => {
    const allowedKinds = ['string', 'number', 'integer', 'boolean', 'easing', 'object', 'array', 'record', 'union']
    for (const descriptor of SHOW_COMMANDS_V2) {
      for (const { field, path } of everyField(descriptor)) {
        expect(allowedKinds, `${path} uses an unsupported field kind`).toContain(field.kind)
        expect(field.kind, `${path} is an untyped json field`).not.toBe('json')
        expect(field.description.length, `${path} has no description`).toBeGreaterThan(0)
        if (field.kind === 'array') {
          expect(field.minItems, `${path} needs minItems`).toBeGreaterThanOrEqual(1)
          expect(field.maxItems, `${path} caps bulk arrays at 128`).toBeLessThanOrEqual(128)
        }
        // A description naming a numeric range must encode that range.
        if ((field.kind === 'number' || field.kind === 'integer') && /\d[–-]\d/.test(field.description)) {
          expect(field.minimum, `${path} describes a range without a schema minimum`).toBeTypeOf('number')
          expect(field.maximum, `${path} describes a range without a schema maximum`).toBeTypeOf('number')
        }
        // null is admitted only where the description documents clearing.
        if (field.nullable) {
          expect(field.description.toLowerCase(), `${path} is nullable without documenting clearing`)
            .toMatch(/null|clear|none|automatic/)
        }
      }
    }
  })

  it('rule 6: the affected vocabulary is the fourteen shared collections', () => {
    expect([...SHOW_COMMAND_V2_AFFECTED_COLLECTIONS]).toEqual([
      'clips', 'instances', 'transitions', 'tracks',
      'layoutDefinitions', 'layoutIntervals', 'groupDefinitions', 'groupOccurrences',
      'layers', 'markers', 'appearanceKeys', 'propertyKeys',
      'removed', 'discardedControlTargets',
    ])
  })

  it('rule 7: every v1 command maps to exactly one v2 command or an explicit retirement', () => {
    const names = new Set(SHOW_COMMANDS_V2.map(descriptor => descriptor.name))
    for (const entry of SHOW_COMMAND_V2_NAME_MAP) {
      if (entry.v2 === null) {
        expect(entry.reason.length, `${entry.v1} retires without a reason`).toBeGreaterThan(0)
      } else {
        expect(names, `${entry.v1} maps to an unknown v2 command`).toContain(entry.v2)
      }
    }
    // Every v2 command is reachable from the map, so nothing appears unexplained.
    const mapped = new Set(SHOW_COMMAND_V2_NAME_MAP.flatMap(entry => entry.v2 ? [entry.v2] : []))
    expect([...names].filter(name => !mapped.has(name)).sort(), 'every v2 command appears in the name map').toEqual([])
    // Every v1 command appears exactly once as a source.
    const v1Sources = SHOW_COMMAND_V2_NAME_MAP.flatMap(entry => entry.v1 ? [entry.v1] : [])
    expect(new Set(v1Sources).size, 'a v1 command maps once').toBe(v1Sources.length)
    for (const code of SHOW_COMMAND_V2_REFUSAL_CODES) {
      expect(code.meaning.length, `${code.code} has no documented meaning`).toBeGreaterThan(0)
    }
  })

  it('rule 10: a singular command is the bulk schema fragment of one', () => {
    const bulkByFamily: Record<string, string> = {
      create_clips: 'clips',
      update_clips: 'updates',
      add_property_tracks: 'tracks',
      create_layers: 'layers',
    }
    for (const [name, arrayField] of Object.entries(bulkByFamily)) {
      const descriptor = SHOW_COMMANDS_V2.find(candidate => candidate.name === name)!
      const field = descriptor.fields[arrayField]
      expect(field.kind).toBe('array')
      if (field.kind !== 'array') continue
      expect(field.minItems).toBe(1)
      expect(field.maxItems).toBe(128)
    }
    // The retired singular setters must not come back alongside their bulk form.
    const retiredSingular = [
      'add_clip', 'move_clip', 'remove_clip', 'set_clip_opacity', 'set_clip_view', 'set_clip_transform',
      'set_clip_aperture', 'set_clip_control_target', 'set_clip_time', 'set_clip_evaluation',
      'add_keyframe', 'update_keyframe', 'delete_keyframe', 'add_property_track', 'delete_property_track',
      'add_overlay_layer', 'reorder_overlay_layer', 'remove_overlay_layer', 'set_boundary_transition',
      'set_boundary_transition_timing', 'update_boundary_transition_parameter', 'set_boundary_layout',
      'insert_layer_transition', 'resize_layer_transition', 'reset_layer_transition_to_cut', 'move_marker',
    ]
    const names = SHOW_COMMANDS_V2.map(descriptor => descriptor.name)
    for (const retired of retiredSingular) {
      expect(names, `${retired} is retired and must not be registered`).not.toContain(retired)
    }
  })

  it('declares the complete catalogue with unique names, families and touch paths', () => {
    const names = SHOW_COMMANDS_V2.map(descriptor => descriptor.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual([
      'rename_show', 'set_stage_map', 'update_zone', 'set_target_controller_profile',
      'set_output_contract', 'set_output_trails', 'set_show_end', 'insert_time',
      'create_layers', 'rename_layer', 'reorder_layer', 'remove_layer',
      'create_clips', 'update_clips', 'remove_clips', 'resize_clip', 'split_clip',
      'duplicate_clip', 'replace_clip_pattern', 'make_clip_pattern_independent', 'rejoin_clip_pattern_instance',
      'insert_transition', 'update_transition', 'resize_transition', 'remove_transition',
      'add_layout_interval', 'duplicate_layout_interval', 'make_layout_interval_unique', 'move_layout_switch',
      'select_layout', 'update_layout_interval', 'set_layout_transfer', 'remove_layout_interval',
      'add_marker', 'update_marker', 'remove_marker',
      'add_clip_effect', 'update_clip_effect', 'move_clip_effect', 'duplicate_clip_effect', 'remove_clip_effect',
      'add_property_tracks', 'update_property_track', 'edit_property_keyframes', 'remove_property_tracks',
      'move_group_occurrence', 'duplicate_group_occurrence', 'make_group_unique', 'ungroup',
    ])
    for (const descriptor of SHOW_COMMANDS_V2) {
      expect(descriptor.family.length, `${descriptor.name} has no family`).toBeGreaterThan(0)
      expect(descriptor.touches.length, `${descriptor.name} declares no touch paths`).toBeGreaterThan(0)
      for (const touch of descriptor.touches) {
        expect(touch, `${descriptor.name} touch "${touch}" is not a JSON pointer pattern`).toMatch(/^\/[A-Za-z0-9*/]*$/)
        expect(touch, `${descriptor.name} touch "${touch}" names a retired v1 subtree`).not.toMatch(/\/(scenes|cells|routingLayouts)(\/|$)/)
      }
      expect(descriptor.description.length, `${descriptor.name} has no description`).toBeGreaterThan(40)
      // Stage A owns transport boilerplate in the server instructions.
      expect(descriptor.description, `${descriptor.name} repeats transport boilerplate`)
        .not.toMatch(/binding_id|operation_id|idempotency_key|begin_edit|commit_edit/)
    }
  })
})
