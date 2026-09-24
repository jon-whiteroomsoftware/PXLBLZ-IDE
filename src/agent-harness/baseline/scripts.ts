// Utterances the scripted bridge understands without a per-request script
// (#945 browser baseline, re-authored on the version-2 catalogue for #1039).
// The chat overlay sends only what the author typed, exactly as it does to a
// live model; in scripted mode the bridge resolves that utterance here, then in
// the dictation corpus, and runs the matching script through the same MCP tool
// path. Placeholders resolve against the Show the editor sent, so each script
// names its target by timeline position rather than by id.
//
// The browser-sequence catalogue that used to live here named v1 commands
// (`move_clip`, `set_clip_view`, `set_boundary_transition`, …) against Shows the
// #945 browser spec seeded as v1 records. Those scripts were retired rather than
// mechanically renamed: their arguments change shape under the v2 catalogue.
// They return one sequence at a time as the browser baseline is re-authored on
// the v2 route (#1067), each exercised by its browser sequence.
import { DICTATION_CASES } from '../experiment/cases.js'
import type { ScriptStep } from '../experiment/corpus.js'

export interface BaselineUtterance {
  utterance: string
  script: ScriptStep[]
  /** What the browser sequence expects to see after application. */
  intent: string
}

// Stable fixture-runner scenario; browser additions must not change its identity.
export const BASELINE_FIXTURE_RESIZE: BaselineUtterance = {
  utterance: 'make the first Clip twelve seconds',
  intent: 'The Clip starting at 0 ms becomes 12 000 ms long.',
  script: [
    { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000, finish_turn_reply: { intent: 'apply', reply: 'The first Clip is twelve seconds.' } } },
  ],
}

export const BASELINE_UTTERANCES: BaselineUtterance[] = [
  BASELINE_FIXTURE_RESIZE,
  {
    utterance: 'make the first Clip exactly eight seconds',
    intent: 'The exact neighbour boundary is accepted; repetition is a valid no-op.',
    script: [{ tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 8_000, finish_turn_reply: { intent: 'apply', reply: 'The first Clip is exactly eight seconds.' } } }],
  },
  {
    utterance: 'make the first Clip twelve seconds and dim it to half',
    intent: 'One turn, two operations: the first Clip is 12 000 ms long at brightness 0.5, committed as one change set.',
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000 } },
      {
        tool: 'update_clips',
        args: {
          updates: [{
            clip_id: '$clipAt:0',
            appearance: { apply: { scope: 'whole-clip' }, view: { brightness: 0.5 } },
          }],
          finish_turn_reply: { intent: 'apply', reply: 'The first Clip is twelve seconds at half brightness.' },
        },
      },
    ],
  },
  {
    utterance: 'add a marker at ten seconds called Drop',
    intent: 'A Marker named Drop appears at 10 000 ms; nothing else changes.',
    script: [
      { tool: 'add_marker', args: { at_ms: 10_000, name: 'Drop', finish_turn_reply: { intent: 'apply', reply: 'Added the Drop marker at ten seconds.' } } },
    ],
  },
  {
    utterance: 'set Show End to seventy seconds',
    intent: 'Show End admits once.',
    script: [{ tool: 'set_show_end', args: { end_ms: 70_000, finish_turn_reply: { intent: 'apply', reply: 'Set Show End to seventy seconds.' } } }],
  },
  // Browser sequences R and MR (#1067), restored from the pre-#1039
  // catalogue on the version-2 commands: moves are `update_clips` placement
  // patches and resizes are `resize_clip`.
  {
    utterance: 'move the second Clip to sixteen seconds then make the first Clip twelve seconds',
    intent: '#950: move B then resize A, with both intermediate records valid.',
    script: [
      { tool: 'update_clips', args: { updates: [{ clip_id: '$clipAt:8000', start_ms: 16_000 }] } },
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000, finish_turn_reply: { intent: 'apply', reply: 'Moved the second Clip to sixteen seconds and resized the first to twelve seconds.' } } },
    ],
  },
  {
    utterance: 'move the second Clip to sixteen seconds then try seventeen seconds for the first',
    intent: '#950: refused resize must not publish the earlier private move.',
    script: [
      { tool: 'update_clips', args: { updates: [{ clip_id: '$clipAt:8000', start_ms: 16_000 }] } },
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 17_000 } },
      { say: 'The first Clip cannot reach seventeen seconds. Neither edit was applied.', intent: 'refuse' },
    ],
  },
  {
    utterance: 'move the second Clip to sixteen seconds but leave the batch incomplete',
    intent: '#950: incomplete typed completion must not publish a private move.',
    script: [
      { tool: 'update_clips', args: { updates: [{ clip_id: '$clipAt:8000', start_ms: 16_000 }] } },
      { say: 'The batch is incomplete. No edit was applied.', intent: 'incomplete' },
    ],
  },
  {
    utterance: 'try twelve seconds with the next Clip at eight',
    intent: '#950 fixture R: an unconnected neighbour refuses the overlapping resize (v2 ripples only a Transition-connected component) without authoring a candidate.',
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000 } },
      { say: 'The requested twelve seconds do not fit. Available range: 0–8000 ms.', intent: 'refuse' },
    ],
  },
  // Admission matrix rows RN–UI954 and MK951 (#1067 G3a), restored from the
  // pre-#1039 catalogue on the version-2 commands. Layout intervals are
  // addressed by the converted record's `layout-occurrence:<n>` ids; the v1
  // `move_marker` step is an `update_marker` time patch, and the added Marker's
  // id is the owner's `marker-<at_ms>` (src/engine/showCommandsV2/markers.ts:40).
  { utterance: 'rename this Show Night Show', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'rename_show', args: { name: 'Night Show', finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'stage this Show on the plane map', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'set_stage_map', args: { stage_map_id: 'plane', finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'target the test controller profile without sending', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'set_target_controller_profile', args: { profile_id: 'profile-test', finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'name the Zone Front with 124 pixels and color abcdef', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'update_zone', args: { zone_id: 'zone-1', name: 'Front', nominal_pixel_count: 124, color: '#abcdef', finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'make the output portable with the plane map and 512 reference pixels', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'set_output_contract', args: { kind: 'portable-2d', map_id: 'plane', pixel_count: 512, finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'enable output Trails at half retention', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'set_output_trails', args: { enabled: true, retention: 0.5, finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'append a one second Layout interval', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'add_layout_interval', args: { layout_id: 'layout-1', duration_ms: 1000, finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'duplicate the first Layout interval empty', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'duplicate_layout_interval', args: { interval_id: 'layout-occurrence:1', finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  { utterance: 'make the first Layout interval unique', intent: '#954: Show and Layout authoring adopts once without device delivery.', script: [{ tool: 'make_layout_interval_unique', args: { interval_id: 'layout-occurrence:1', finish_turn_reply: { intent: 'apply', reply: 'Updated the Show.' } } }] },
  {
    utterance: 'add move and update the marker',
    intent: '#951: marker batch adopts once.',
    script: [
      { tool: 'add_marker', args: { at_ms: 1000, name: 'New', color: '#f59e0b' } },
      { tool: 'update_marker', args: { marker_id: 'marker-1000', at_ms: 70000 } },
      { tool: 'update_marker', args: { marker_id: 'marker-1000', at_ms: 9000, name: 'Final', color: '#38bdf8', finish_turn_reply: { intent: 'apply', reply: 'Added, moved and updated the marker.' } } },
    ],
  },
  {
    utterance: 'keep the final marker unchanged',
    intent: '#951: wholly no-op marker batch does not adopt.',
    script: [
      { tool: 'update_marker', args: { marker_id: 'marker-1000', at_ms: 9000 } },
      { tool: 'update_marker', args: { marker_id: 'marker-1000', name: 'Final', color: '#38bdf8', finish_turn_reply: { intent: 'apply', reply: 'The marker is already correct.' } } },
    ],
  },
  {
    utterance: 'remove the missing marker',
    intent: '#951: missing removal refuses.',
    script: [
      { tool: 'remove_marker', args: { marker_id: 'absent' } },
      { say: 'That marker does not exist.', intent: 'refuse' },
    ],
  },
  {
    utterance: 'remove the final marker',
    intent: '#951: removal preserves all other content.',
    script: [{ tool: 'remove_marker', args: { marker_id: 'marker-1000', finish_turn_reply: { intent: 'apply', reply: 'Removed the marker.' } } }],
  },
  // Admission matrix Clip, Layer and connected-resize rows (#1067 G3b),
  // restored from the pre-#1039 catalogue on the version-2 commands. Clips and
  // Layers are addressed by the converted record's identities; `add_clip`
  // names the overlay runtime because every fixture runtime plays CometLoom
  // (src/engine/showCommandsV2/clipSpec.ts:144, 151), and `duplicate_clip`
  // takes the explicit start v1 derived. Show End's entry above is already v2.
  {
    utterance: 'make the connected overlay Clip nine seconds',
    intent: '#952: connected resize uses the canonical Clip command.',
    script: [{ tool: 'resize_clip', args: { clip_id: 'clip-b', duration_ms: 9000, finish_turn_reply: { intent: 'apply', reply: 'Resized the connected Clip.' } } }],
  },
  {
    utterance: 'move the connected second Clip five seconds later then two seconds earlier',
    intent: '#951: exact canonical chain move in both directions.',
    script: [
      { tool: 'update_clips', args: { updates: [{ clip_id: 'resize-b', start_ms: 8000 }] } },
      { tool: 'update_clips', args: { updates: [{ clip_id: 'resize-b', start_ms: 6000 }], finish_turn_reply: { intent: 'apply', reply: 'Moved the connected Clips three seconds later.' } } },
    ],
  },
  {
    utterance: 'keep the connected second Clip at six seconds',
    intent: '#951: validated no-op produces no candidate.',
    script: [{ tool: 'update_clips', args: { updates: [{ clip_id: 'resize-b', start_ms: 6000 }], finish_turn_reply: { intent: 'apply', reply: 'The Clip is already at six seconds.' } } }],
  },
  {
    utterance: 'move the connected second Clip to overlay zero',
    intent: '#951: incompatible connected destination refuses without detachment.',
    script: [
      { tool: 'update_clips', args: { updates: [{ clip_id: 'resize-b', start_ms: 6000, layer_id: 'layer:z1:overlay:1' }] } },
      { say: 'The connected Clip cannot change Layer without an explicit disconnect.', intent: 'refuse' },
    ],
  },
  {
    utterance: 'duplicate the overlay Clip independently',
    intent: '#951: independent duplicate preserves the complete Show and adopts once.',
    script: [{ tool: 'duplicate_clip', args: { clip_id: 'clip-ov', start_ms: 8000, independent: true, finish_turn_reply: { intent: 'apply', reply: 'Duplicated the overlay Clip independently.' } } }],
  },
  {
    utterance: 'split the connected target Clip at sixteen seconds',
    intent: '#951: connected split preserves shared state and adopts once.',
    script: [{ tool: 'split_clip', args: { clip_id: 'clip-b', at_ms: 16000, finish_turn_reply: { intent: 'apply', reply: 'Split the target Clip at sixteen seconds.' } } }],
  },
  {
    utterance: 'remove the connected target Clip',
    intent: '#951: complete removal adopts once.',
    script: [{ tool: 'remove_clips', args: { clip_ids: ['clip-b'], finish_turn_reply: { intent: 'apply', reply: 'Removed the target Clip and attached Transition.' } } }],
  },
  {
    utterance: 'add a topmost overlay Layer',
    intent: '#951: one fresh Zone-owned Layer, adopted once.',
    script: [{ tool: 'create_layers', args: { layers: [{ zone_id: 'zone-1' }], finish_turn_reply: { intent: 'apply', reply: 'Added a topmost Layer.' } } }],
  },
  {
    utterance: 'add CometLoom to the overlay at twenty nine seconds',
    intent: '#951: add Clip admits one complete candidate.',
    script: [{ tool: 'create_clips', args: { clips: [{ zone_id: 'zone-1', layer_id: 'layer:zone-1:overlay:2', start_ms: 29000, duration_ms: 1000, pattern: { kind: 'stock', id: 'CometLoom' }, instance: 'instance-ov' }], finish_turn_reply: { intent: 'apply', reply: 'Added CometLoom.' } } }],
  },
  {
    utterance: 'make the third Clip Pattern independent',
    intent: '#951: independent Pattern state admits once.',
    script: [{ tool: 'make_clip_pattern_independent', args: { clip_id: 'clip-c', finish_turn_reply: { intent: 'apply', reply: 'Made the third Clip independent.' } } }],
  },
  {
    utterance: 'rejoin the second Clip to the first Pattern instance',
    intent: '#951: rejoin and source cleanup admit once.',
    script: [{ tool: 'rejoin_clip_pattern_instance', args: { clip_id: 'clip-b', instance_id: 'instance-a', finish_turn_reply: { intent: 'apply', reply: 'Rejoined the second Clip.' } } }],
  },
  {
    utterance: 'insert one second at twenty nine seconds',
    intent: '#951: timeline insertion admits once.',
    script: [{ tool: 'insert_time', args: { at_ms: 29000, duration_ms: 1000, finish_turn_reply: { intent: 'apply', reply: 'Inserted one second.' } } }],
  },
  // Admission matrix Effect, appearance, instance-property and animation rows
  // (#1067 G3c), restored from the pre-#1039 catalogue on the version-2
  // commands. Effect edits apply to the whole Clip; view, controls, time and
  // evaluation go through update_clips; keyframe edits through
  // edit_property_keyframes.
  ...[
    { utterance: 'add an opacity Effect to the overlay Clip', tool: 'add_clip_effect', args: { clip_id: 'clip-ov', kind: 'opacity', parameters: { opacity: 0.6 }, apply: { scope: 'whole-clip' } } },
    { utterance: 'set the overlay brightness Effect to seven tenths', tool: 'update_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'brightness', parameters: { brightness: 0.7 }, apply: { scope: 'whole-clip' } } },
    { utterance: 'duplicate the overlay brightness Effect', tool: 'duplicate_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'brightness', apply: { scope: 'whole-clip' } } },
    { utterance: 'move the overlay hue Effect before brightness', tool: 'move_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'hue', target_effect_id: 'brightness', edge: 'before', apply: { scope: 'whole-clip' } } },
    { utterance: 'remove the overlay brightness Effect', tool: 'remove_clip_effect', args: { clip_id: 'clip-ov', effect_id: 'brightness', apply: { scope: 'whole-clip' } } },
  ].map(({ utterance, tool, args }) => ({ utterance, intent: '#953: shared Effect admission.', script: [{ tool, args: { ...args, finish_turn_reply: { intent: 'apply', reply: 'Updated the Effect stack.' } } }] })),
  ...[
    { utterance: 'dim and mirror the overlay Clip', args: { clip_id: 'clip-ov', appearance: { view: { mirror: true, phase: 0.25, brightness: 0.5 }, apply: { scope: 'whole-clip' } } } },
    { utterance: 'set the first Clip speed control to three quarters', args: { clip_id: 'clip-a', instance_properties: { controls: { sliderSpeed: 0.75 } } } },
    { utterance: 'slow the first Clip shared instance to half speed', args: { clip_id: 'clip-a', instance_properties: { time_scale: 0.5, time_offset_ms: 250 } } },
    { utterance: 'freeze the first Clip shared instance at entry', args: { clip_id: 'clip-a', instance_properties: { evaluation: 'freeze-at-entry' } } },
  ].map(({ utterance, args }) => ({ utterance, intent: '#953: shared Clip property admission.', script: [{ tool: 'update_clips', args: { updates: [args], finish_turn_reply: { intent: 'apply', reply: 'Updated the Clip properties.' } } }] })),
  ...[
    { utterance: 'seed a phase animation track at point three', tool: 'add_property_tracks', args: { tracks: [{ target: { kind: 'view-phase', clip_id: 'clip-a' }, initial_value: 0.3 }] } },
    { utterance: 'add a brightness keyframe at fifteen seconds', tool: 'edit_property_keyframes', args: { track_id: 'track-b', edits: { add: [{ at_ms: 15000, value: 0.5 }] } } },
    { utterance: 'move the first brightness keyframe to twenty seconds', tool: 'edit_property_keyframes', args: { track_id: 'track-b', edits: { update: [{ keyframe_id: 'kf-1', at_ms: 20000 }] } } },
    { utterance: 'delete the middle brightness keyframe', tool: 'edit_property_keyframes', args: { track_id: 'track-b', edits: { remove: ['middle'] } } },
    { utterance: 'remove the brightness animation track', tool: 'remove_property_tracks', args: { track_ids: ['track-b'] } },
  ].map(row => ({ utterance: row.utterance, intent: '#953: edit authored animation through the shared command.', script: [{ tool: row.tool, args: { ...row.args, finish_turn_reply: { intent: 'apply', reply: 'Updated the animation.' } } }] })),
]

/** The script for an utterance the scripted bridge knows, or null. */
export function scriptForUtterance(utterance: string): ScriptStep[] | null {
  const needle = utterance.trim().toLowerCase()
  if (!needle) return null
  const own = BASELINE_UTTERANCES.find((entry) => entry.utterance.toLowerCase() === needle)
  if (own) return own.script
  const corpusCase = DICTATION_CASES.find((entry) => entry.utterance.trim().toLowerCase() === needle)
  return corpusCase ? corpusCase.script : null
}
