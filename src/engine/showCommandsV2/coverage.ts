// The v1 to v2 command and refusal-code maps. These are the data behind the
// regenerated coverage report, the harness grammar replay and the census gate:
// every v1 command maps to exactly one v2 command or an explicit retirement,
// and no runtime alias exists for a retired name.

export interface ShowCommandV2NameMapEntry {
  /** The v1 command name, or null for a v2 capability with no v1 predecessor. */
  v1: string | null
  /** The v2 command name, or null when the v1 command is retired outright. */
  v2: string | null
  /** Why the name or shape changed; required for every retirement. */
  reason: string
}

export const SHOW_COMMAND_V2_NAME_MAP: ShowCommandV2NameMapEntry[] = [
  // Show and output
  { v1: 'rename_show', v2: 'rename_show', reason: 'Port; unchanged shape.' },
  { v1: 'set_stage_map', v2: 'set_stage_map', reason: 'Port; unchanged shape.' },
  { v1: 'update_zone', v2: 'update_zone', reason: 'Port; nominal_pixel_count is now a bounded integer.' },
  { v1: 'set_target_controller_profile', v2: 'set_target_controller_profile', reason: 'Port; unchanged shape.' },
  { v1: 'set_output_contract', v2: 'set_output_contract', reason: 'Port; pixel_count is now a bounded integer.' },
  { v1: 'set_output_trails', v2: 'set_output_trails', reason: 'Port; retention carries schema bounds.' },
  { v1: 'set_show_end', v2: 'set_show_end', reason: 'Port to the exact rule: invalid shortening refuses naming the protecting entity, with no clamp, and empty trailing intervals are removed.' },
  { v1: 'insert_time', v2: 'insert_time', reason: 'Port to global time mapping with Group-local holds, curve hold keys and Layout coverage.' },

  // Layers
  { v1: 'create_layers', v2: 'create_layers', reason: 'Port; Layers are Zone-owned with names and ranks, and absorb add_overlay_layer.' },
  { v1: 'add_overlay_layer', v2: 'create_layers', reason: 'Subsumed by the bulk form; overlay index addressing retires.' },
  { v1: null, v2: 'rename_layer', reason: 'New: v2 Layers carry a stable name for the whole Show.' },
  { v1: 'reorder_overlay_layer', v2: 'reorder_layer', reason: 'Renamed; stacking is authored by rank or an explicit neighbour Layer identity.' },
  { v1: 'remove_overlay_layer', v2: 'remove_layer', reason: 'Renamed; removal takes an explicit complete reassignment destination.' },

  // Clips
  { v1: 'create_clips', v2: 'create_clips', reason: 'Port with the v2 ClipSpec and the D3 instance policy.' },
  { v1: 'add_clip', v2: 'create_clips', reason: 'Subsumed; the free-time clamp and implicit Show End extension do not survive, exact timing does.' },
  { v1: 'update_clips', v2: 'update_clips', reason: 'Port with the v2 ClipPatch, appearance apply selector and instance_properties.' },
  { v1: 'move_clip', v2: 'update_clips', reason: 'Subsumed by ClipPatch placement, which applies the connected move policy.' },
  { v1: 'set_clip_opacity', v2: 'update_clips', reason: 'Subsumed by the appearance patch (decision D1).' },
  { v1: 'set_clip_view', v2: 'update_clips', reason: 'Subsumed by the appearance patch (decision D1).' },
  { v1: 'set_clip_transform', v2: 'update_clips', reason: 'Subsumed by the appearance patch (decision D1).' },
  { v1: 'set_clip_aperture', v2: 'update_clips', reason: 'Subsumed by the appearance patch (decision D1).' },
  { v1: 'set_clip_control_target', v2: 'update_clips', reason: 'Subsumed by instance_properties.controls (decision D1).' },
  { v1: 'set_clip_time', v2: 'update_clips', reason: 'Subsumed by instance_properties.time_scale and time_offset_ms (decision D1).' },
  { v1: 'set_clip_evaluation', v2: 'update_clips', reason: 'Subsumed by instance_properties.evaluation (decision D1).' },
  { v1: 'remove_clip', v2: 'remove_clips', reason: 'Renamed bulk; removing the final content leaves a valid empty Show (decision D6).' },
  { v1: 'resize_clip', v2: 'resize_clip', reason: 'Port to the trailing and leading resize policy.' },
  { v1: 'split_clip', v2: 'split_clip', reason: 'Port; the right piece shares the instance and enters with continue.' },
  { v1: 'duplicate_clip', v2: 'duplicate_clip', reason: 'Port with the D4 flip: the copy shares the runtime by default and independent true splits it.' },
  { v1: null, v2: 'replace_clip_pattern', reason: 'New: Clip-scoped Replace, performing independence first when the runtime is shared.' },
  { v1: 'make_clip_pattern_independent', v2: 'make_clip_pattern_independent', reason: 'Port; unchanged meaning.' },
  { v1: 'rejoin_clip_pattern_instance', v2: 'rejoin_clip_pattern_instance', reason: 'Port; the target is an explicit instance_id, not another Clip.' },

  // Transitions
  { v1: 'insert_layer_transition', v2: 'insert_transition', reason: 'Merged; the junction is addressed by its outgoing and incoming Clip identities.' },
  { v1: 'set_boundary_transition', v2: 'insert_transition', reason: 'Merged; the create case becomes insert_transition and the kind cut becomes remove_transition.' },
  { v1: 'set_boundary_transition_timing', v2: 'resize_transition', reason: 'Merged; easing moves to update_transition and duration to resize_transition.' },
  { v1: 'update_boundary_transition_parameter', v2: 'update_transition', reason: 'Merged and widened from one parameter to a parameter record.' },
  { v1: 'resize_layer_transition', v2: 'resize_transition', reason: 'Merged; the delta applies once to the incoming and downstream set.' },
  { v1: 'reset_layer_transition_to_cut', v2: 'remove_transition', reason: 'Renamed; a Cut is the absence of a Transition at exact adjacency.' },
  { v1: 'set_boundary_layout', v2: 'select_layout', reason: 'Renamed; no Boundary lookup remains.' },

  // Zone Layout intervals
  { v1: 'add_layout_interval', v2: 'add_layout_interval', reason: 'Port; exactly one of at_ms or duration_ms.' },
  { v1: 'duplicate_layout_interval', v2: 'duplicate_layout_interval', reason: 'Port over the owner duplicate intent added under decision D7.' },
  { v1: 'make_layout_interval_unique', v2: 'make_layout_interval_unique', reason: 'Port; only the Layout definition is cloned, never Zones or runtimes.' },
  { v1: null, v2: 'move_layout_switch', reason: 'New: the manual switch move becomes a command.' },
  { v1: null, v2: 'update_layout_interval', reason: 'New: routing parameters only.' },
  { v1: null, v2: 'set_layout_transfer', reason: 'New: the incoming timed routing transfer owned by its destination interval.' },
  { v1: null, v2: 'remove_layout_interval', reason: 'New: predecessor extension or promotion to zero, refusing on meaningful data.' },

  // Markers
  { v1: 'add_marker', v2: 'add_marker', reason: 'Port plus the chapter role argument.' },
  { v1: 'update_marker', v2: 'update_marker', reason: 'Merged with move_marker.' },
  { v1: 'move_marker', v2: 'update_marker', reason: 'Merged; at_ms is one field of the update.' },
  { v1: 'remove_marker', v2: 'remove_marker', reason: 'Port; unchanged shape.' },

  // Appearance and Effects
  { v1: 'add_clip_effect', v2: 'add_clip_effect', reason: 'Port with the apply selector and the compact parameter record.' },
  { v1: 'update_clip_effect', v2: 'update_clip_effect', reason: 'Widened from one parameter to a parameter record.' },
  { v1: 'move_clip_effect', v2: 'move_clip_effect', reason: 'Port with the apply selector.' },
  { v1: 'duplicate_clip_effect', v2: 'duplicate_clip_effect', reason: 'Port with the apply selector.' },
  { v1: 'remove_clip_effect', v2: 'remove_clip_effect', reason: 'Port; the Clip-owned track cascade is the owner rule.' },

  // Animation
  { v1: 'add_property_track', v2: 'add_property_tracks', reason: 'Renamed bulk with a typed target union and authored activation.' },
  { v1: null, v2: 'update_property_track', reason: 'New: activation is authored in v2.' },
  { v1: 'edit_property_keyframes', v2: 'edit_property_keyframes', reason: 'Port; the delete edit list is now named remove.' },
  { v1: 'add_keyframe', v2: 'edit_property_keyframes', reason: 'Subsumed by the edits.add list (decision D1).' },
  { v1: 'update_keyframe', v2: 'edit_property_keyframes', reason: 'Subsumed by the edits.update list (decision D1).' },
  { v1: 'delete_keyframe', v2: 'edit_property_keyframes', reason: 'Subsumed by the edits.remove list (decision D1).' },
  { v1: 'delete_property_track', v2: 'remove_property_tracks', reason: 'Renamed bulk; delete_ retires from the verb vocabulary.' },

  // Groups (decision D2: occurrence level only)
  { v1: null, v2: 'move_group_occurrence', reason: 'New: occurrence placement with explicit Layer bindings.' },
  { v1: null, v2: 'duplicate_group_occurrence', reason: 'New: a linked occurrence sharing the definition, runtimes and hold list.' },
  { v1: null, v2: 'make_group_unique', reason: 'New: definition clone preserving effective runtime identities.' },
  { v1: null, v2: 'ungroup', reason: 'New: materialize the occurrence into ordinary v2 content without cloning a runtime.' },
]

/** Retired v1 addressing forms, with the v2 replacement. */
export const RETIRED_V1_ADDRESSING: Array<{ form: string; replacement: string }> = [
  { form: 'scene_id', replacement: 'Scenes are retired; address Clips, Layout intervals and Markers by identity.' },
  { form: 'layer: "main" | index', replacement: 'layer_id, a stable Zone-owned Layer identity.' },
  { form: 'overlay_layer_index', replacement: 'layer_id, with stacking authored by rank or above_layer_id / below_layer_id.' },
  { form: 'at_ms / after_clip_id Boundary lookup', replacement: 'transition_id, or the (from_clip_id, to_clip_id) pair of a derived Cut junction.' },
  { form: 'target_clip_id on rejoin', replacement: 'instance_id, an explicit existing Pattern instance.' },
  { form: 'json-typed target and keyframes', replacement: 'The typed target object and the typed keyframe objects.' },
]

export interface ShowCommandV2RefusalCode {
  code: string
  /** The v1 code this reuses, when its meaning is unchanged. */
  v1: string | null
  meaning: string
}

/**
 * The v2 refusal-code map. A v1 code is reused only where its meaning is
 * unchanged; descriptor shape issues and domain refusals stay distinct.
 */
export const SHOW_COMMAND_V2_REFUSAL_CODES: ShowCommandV2RefusalCode[] = [
  // Descriptor shape
  { code: 'invalid-argument', v1: 'invalid-argument', meaning: 'A field is missing, of the wrong type, or outside its documented range.' },
  { code: 'unknown-field', v1: 'unknown-field', meaning: 'The input carries a field the command does not declare.' },
  { code: 'empty-patch', v1: 'empty-patch', meaning: 'A patch object sets none of its documented fields.' },
  { code: 'empty-collection', v1: 'empty-collection', meaning: 'A bulk array carries no items.' },
  { code: 'batch-too-large', v1: 'batch-too-large', meaning: 'A bulk array carries more than 128 items.' },
  { code: 'unknown-command', v1: 'unknown-command', meaning: 'No command has that name.' },

  // Identity and dependency
  { code: 'unknown-id', v1: null, meaning: 'One identity did not resolve. Replaces the v1 per-entity codes unknown-clip, unknown-layer, unknown-zone, unknown-layout, unknown-interval, unknown-track, unknown-keyframe, unknown-transition, unknown-effect and unknown-scene; the message names the entity kind and the result carries candidate identities.' },
  { code: 'unknown-control', v1: 'unknown-control', meaning: 'The Pattern does not export a slider with that name.' },
  { code: 'ambiguous-instance', v1: null, meaning: 'Several Pattern runtimes exist for one source and none was named, or a first-runtime request found an existing one. Replaces the v1 ambiguous-junction and duplicate-target instance cases.' },
  { code: 'missing-dependency', v1: 'unknown-pattern', meaning: 'Trusted resolved Pattern metadata is unavailable for this source in this session.' },
  { code: 'not-a-junction', v1: 'unknown-junction', meaning: 'The named Clip pair is not exactly adjacent on one Zone and Layer, so it is not a Cut junction.' },
  { code: 'duplicate-name', v1: 'duplicate-name', meaning: 'Another entity already uses that name.' },
  { code: 'unsupported', v1: null, meaning: 'The catalogue accepts the argument but no landed owner capability implements it yet; the message names the missing capability.' },

  // Owner domain refusals, passed through with the owner's own code
  { code: 'invalid-record', v1: null, meaning: 'The preimage Show is not a valid v2 record.' },
  { code: 'invalid-intent', v1: null, meaning: 'The owner rejected the requested operation shape.' },
  { code: 'invalid-result', v1: null, meaning: 'The complete candidate would be an invalid Show.' },
  { code: 'missing-clip', v1: 'unknown-clip', meaning: 'The owner could not find the addressed Clip.' },
  { code: 'missing-transition', v1: 'unknown-transition', meaning: 'The owner could not find the addressed Transition.' },
  { code: 'missing-occurrence', v1: 'unknown-interval', meaning: 'The owner could not find the addressed Layout or Group occurrence.' },
  { code: 'missing-layout', v1: 'unknown-layout', meaning: 'The owner could not find the addressed Zone Layout definition.' },
  { code: 'missing-track', v1: 'unknown-track', meaning: 'The owner could not find the addressed Property track.' },
  { code: 'missing-key', v1: 'unknown-keyframe', meaning: 'The owner could not find the addressed keyframe.' },
  { code: 'missing-marker', v1: null, meaning: 'The owner could not find the addressed Marker.' },
  { code: 'missing-target', v1: 'missing-target', meaning: 'The owner could not find the addressed Layer or Zone.' },
  { code: 'duplicate-marker', v1: 'duplicate-target', meaning: 'A Marker with that identity already exists.' },
  { code: 'duplicate-track', v1: 'duplicate-target', meaning: 'A Property track with that identity already exists in this owner.' },
  { code: 'duplicate-key', v1: 'duplicate-keyframe-reference', meaning: 'A keyframe with that identity already exists in this track.' },
  { code: 'invalid-topology', v1: 'unsupported-topology', meaning: 'The requested Transition arrangement is not a valid connected topology.' },
  { code: 'unsupported-topology', v1: 'unsupported-topology', meaning: 'The requested Clip arrangement is not supported by the v2 domain.' },
  { code: 'unsupported-property-carrier', v1: null, meaning: 'A Transition Property ramp must be projected into tracks before its carrier is removed.' },
  { code: 'unsupported-content-copy', v1: null, meaning: 'Duplicating a Layout interval with content cannot copy a Transition that carries Property ramps.' },
  { code: 'boundary-crossing-content', v1: 'multi-segment-clip', meaning: 'Authored content crosses the duplicated Layout interval boundary.' },
  { code: 'protected-content', v1: 'out-of-bounds', meaning: 'Shortening Show End would cut a protected Clip contribution, Property activation or timed transfer.' },
  { code: 'meaningful-occurrence-data', v1: null, meaning: 'A Layout interval owns a split-position track or a timed transfer that must be resolved before removal.' },
  { code: 'owned-track-out-of-bounds', v1: 'outside-scene', meaning: 'An interval-owned split-position track would leave its owning interval.' },
  { code: 'zone-unavailable', v1: 'missing-zone', meaning: 'Content would use a Zone the active Layout does not provide for its whole contribution.' },
  { code: 'compiler-ineligible', v1: 'transition-refused', meaning: 'A bounded compiler scheduling restriction rejects the candidate.' },
  { code: 'time-overflow', v1: null, meaning: 'A mapped time would leave safe integer milliseconds.' },
  { code: 'identity-conflict', v1: 'duplicate-target', meaning: 'A Layer identity or rank is already taken in that Zone.' },
  { code: 'incomplete-reassignment', v1: 'layer-not-empty', meaning: 'Removing a referenced Layer needs an explicit destination for every reference.' },
  { code: 'incompatible-reassignment', v1: null, meaning: 'A Layer reassignment does not name another Layer in the same Zone.' },
  { code: 'invalid-transfer', v1: 'invalid-duration', meaning: 'A timed routing transfer does not attach to adjacent intervals or does not fit them.' },
  { code: 'invalid-owner', v1: 'missing-owner', meaning: 'The Property owner is not the Show or an existing Group definition.' },
  { code: 'invalid-identity-plan', v1: null, meaning: 'A Group uniqueness identity plan is incomplete or collides.' },
  { code: 'invalid-occurrence-id', v1: 'duplicate-target', meaning: 'A Group occurrence identity is blank or already used.' },
  { code: 'invalid-placement', v1: 'occupied', meaning: 'A Group occurrence placement collides or leaves its routing domain.' },
  { code: 'engine-refused', v1: 'engine-refused', meaning: 'An owner declined without a more specific code.' },
]

/** v1 refusal codes that do not survive, with the reason. */
export const RETIRED_V1_REFUSAL_CODES: Array<{ code: string; reason: string }> = [
  { code: 'last-clip', reason: 'Decision D6: removing the final Clip leaves a valid empty Show.' },
  { code: 'no-change', reason: 'Catalogue rule 4: an already-satisfied request returns unchanged, never a refusal.' },
  { code: 'delete-refused', reason: 'Replaced by the owner code that explains the refusal.' },
  { code: 'unknown-scene', reason: 'Scenes are retired from the authored contract.' },
  { code: 'outside-scene', reason: 'Scene-local time is retired; owned-track-out-of-bounds covers the interval case.' },
  { code: 'multi-segment-clip', reason: 'One Clip is one authored record across Layout switches; boundary-crossing-content covers duplication.' },
  { code: 'missing-composition', reason: 'A v2 record always carries a composition.' },
  { code: 'unsupported-schema-version', reason: 'read_show returns the v2 record only.' },
  { code: 'group', reason: 'Group children are addressed through the Group occurrence commands.' },
  { code: 'ambiguous-junction', reason: 'A junction is addressed by its exact Clip pair.' },
  { code: 'unknown-junction', reason: 'Replaced by not-a-junction, which distinguishes a gap from a missing Clip.' },
  { code: 'animated-placement', reason: 'Clip-owned animation follows the Clip through the owner cascade.' },
  { code: 'animated-instance', reason: 'Shared instance tracks are reported in the affected set instead of refusing.' },
  { code: 'animated-effect-removed', reason: 'The appearance owner prunes a Clip-owned Effect track through its documented cascade.' },
  { code: 'shared-instance-conflict', reason: 'Replaced by the owner conflict refusal naming both track identities.' },
]

/**
 * The prepared v2 catalogue section of the regenerated coverage report. It is
 * appended to the v1 report, which stays truthful about production until the
 * coordinated cutover in #1039.
 */
export function renderShowCommandV2CoverageSection(
  catalogue: ReadonlyArray<{ name: string; family: string; touches: readonly string[] }>,
): string {
  const byFamily = new Map<string, Array<{ name: string; touches: readonly string[] }>>()
  for (const command of catalogue) {
    byFamily.set(command.family, [...(byFamily.get(command.family) ?? []), command])
  }
  const lines: string[] = [
    '# Prepared v2 command catalogue',
    '',
    'Issue #1041 prepares the complete v2 catalogue over the v2 engine owners.',
    'Production MCP keeps the v1 catalogue above until the coordinated cutover in',
    '#1039; `agentMcpRouting` exposes this one only through its explicit',
    "`catalogue: 'v2'` option. MCP publishes no runtime alias for a retired name.",
    '',
    '## v2 catalogue',
    '',
    '| Family | Command | ShowRecordV2 touch paths |',
    '| --- | --- | --- |',
    ...[...byFamily.entries()].flatMap(([family, commands]) => commands.map(command => (
      `| ${family} | \`${command.name}\` | ${command.touches.map(touch => `\`${touch}\``).join(', ')} |`
    ))),
    '',
    '## v1 to v2 name map',
    '',
    'Every v1 command maps to exactly one v2 command or an explicit retirement.',
    'The harness grammar, corpus and baseline fixtures replay through this map.',
    '',
    '| v1 command | v2 command | Change |',
    '| --- | --- | --- |',
    ...SHOW_COMMAND_V2_NAME_MAP.map(entry => (
      `| ${entry.v1 ? `\`${entry.v1}\`` : '(new)'} | ${entry.v2 ? `\`${entry.v2}\`` : '(retired)'} | ${entry.reason} |`
    )),
    '',
    '## Retired v1 addressing',
    '',
    '| Retired form | v2 replacement |',
    '| --- | --- |',
    ...RETIRED_V1_ADDRESSING.map(entry => `| \`${entry.form}\` | ${entry.replacement} |`),
    '',
    '## Refusal-code map',
    '',
    'A v1 code is reused only where its meaning is unchanged. Descriptor shape',
    'issues and domain refusals stay distinct categories.',
    '',
    '| v2 code | Reused v1 code | Meaning |',
    '| --- | --- | --- |',
    ...SHOW_COMMAND_V2_REFUSAL_CODES.map(entry => (
      `| \`${entry.code}\` | ${entry.v1 ? `\`${entry.v1}\`` : '(new)'} | ${entry.meaning} |`
    )),
    '',
    '## Retired v1 refusal codes',
    '',
    '| Retired code | Reason |',
    '| --- | --- |',
    ...RETIRED_V1_REFUSAL_CODES.map(entry => `| \`${entry.code}\` | ${entry.reason} |`),
    '',
  ]
  return lines.join('\n')
}
