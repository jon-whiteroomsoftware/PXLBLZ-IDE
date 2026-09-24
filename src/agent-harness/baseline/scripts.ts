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
