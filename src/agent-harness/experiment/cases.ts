// Provenance: pxlblz-v3 src/experiment/cases.ts at 9ecd481f, re-authored onto the
// version-2 catalogue for #1039 (see src/agent-harness/PROVENANCE.md).
// The dictation intent corpus: utterances spanning every command family,
// referents by hover, selection, ordinal, time and Pattern name, genuinely
// ambiguous requests where asking is correct, and impossible requests where a
// typed refusal is correct. Each case carries the intended solution as a script;
// the scripted fake agent executes it verbatim, and a live agent is scored
// against the same expectations.
//
// Every script calls a v2 catalogue command with that command's own arguments.
// Where a v1 command collapsed into a v2 one the case is re-authored, not
// shimmed: the `set_clip_*` family and `move_clip` are `update_clips` patches,
// `add_clip` and `add_keyframe` are bulk arrays, and the Boundary/Layer
// Transition pair is the single Transition family addressed by Clip identity.
// `SHOW_COMMAND_V2_NAME_MAP` records each of those moves.
//
// One accepted behavior change is visible here. Decision D6 retires the
// last-Clip refusal: removing the final content leaves a valid, editable, empty
// Show, so the case that asserted the refusal now asserts the empty Show.
//
// Script argument placeholders (resolved against the live session state):
//   $clipAt:<startMs>            Clip id at a global start time
//   $instanceAt:<startMs>        Pattern instance id of the Clip at a start time
//   $patternClip:<name>          first Clip whose Pattern name contains <name>
//   $layerId:<layerName>         Layer identity by authored name
//   $layerClip:<layerName>       first Clip on the named Layer
//   $markerAt:<timeMs>           Marker id at a time
//   $trackOf:<startMs>:<text>    track id on the Clip at <startMs> whose target contains <text>
//   $keyframeOf:<startMs>:<text>:<index>  keyframe id by track and index
//   $effectOf:<startMs>:<kind>   Effect id on the Clip at <startMs> by kind
//   $transition:<index>          nth Transition id
//   $layoutOccurrence:<index>    nth Layout occurrence id
//   $prevTarget                  previous successful step's change target id
import type { DictationCase } from './corpus.js'

export const DICTATION_CASES: DictationCase[] = [
  // ---- clips -------------------------------------------------------------
  {
    id: 'clips-resize-ordinal',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    utterance: 'Make the first clip twelve seconds long.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-duration', clip: { start_ms: 0 }, duration_ms: 12_000 }],
    },
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000, finish_turn_reply: { intent: 'apply', reply: 'The first Clip now runs 0–12 s.' } } },
    ],
  },
  {
    id: 'clips-create-at-time',
    family: 'clips',
    referent: 'none',
    fixture: 'empty-tail',
    utterance: 'Add a CometLoom clip at 35 seconds, ten seconds long.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'clip-count', count: 2 },
        { kind: 'clip-duration', clip: { start_ms: 35_000 }, duration_ms: 10_000 },
      ],
    },
    script: [
      {
        tool: 'create_clips',
        args: {
          clips: [{
            zone_id: 'z1',
            layer_id: '$layerId:Main',
            start_ms: 35_000,
            duration_ms: 10_000,
            pattern: { kind: 'stock', id: 'CometLoom' },
          }],
        },
      },
      { say: 'Added a CometLoom Clip at 35–45 s.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-move-hover',
    family: 'clips',
    referent: 'hover',
    fixture: 'empty-tail',
    context: { hovered_clip_at_ms: 0 },
    utterance: 'Move that clip to start at 20 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-start', clip: { pattern_name: 'CometLoom' }, start_ms: 20_000 }],
    },
    script: [
      { tool: 'update_clips', args: { updates: [{ clip_id: '$clipAt:0', start_ms: 20_000 }] } },
      { say: 'The Clip now starts at 20 s.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-split-playhead',
    family: 'clips',
    referent: 'time',
    fixture: 'base',
    context: { playhead_ms: 12_000 },
    utterance: 'Split this clip at the playhead.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'clip-count', count: 3 },
        { kind: 'clip-duration', clip: { start_ms: 0 }, duration_ms: 12_000 },
      ],
    },
    script: [
      { tool: 'split_clip', args: { clip: { at_playhead: true }, at_ms: 12_000 } },
      { say: 'Split the Clip at 12 s.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-duplicate-shared',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'empty-tail',
    utterance: 'Duplicate the comet clip right after itself, keeping them linked.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'clip-count', count: 2 },
        { kind: 'clip-start', clip: { start_ms: 30_000 }, start_ms: 30_000 },
      ],
    },
    script: [
      { tool: 'duplicate_clip', args: { clip_id: '$patternClip:comet', start_ms: 30_000 } },
      { say: 'Duplicated the comet Clip at 30–60 s; the copy shares its runtime.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-remove-pattern-name',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'base',
    utterance: 'Delete the test pattern clip.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-count', count: 1 }],
    },
    script: [
      { tool: 'remove_clips', args: { clip_ids: ['$patternClip:test'] } },
      { say: 'Removed the TestPattern1D Clip.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-view-brightness-selection',
    family: 'clips',
    referent: 'selection',
    fixture: 'base',
    context: { selected_clip_at_ms: [0] },
    utterance: 'Dim this clip to half brightness.',
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'pointer-equals',
        pointer: '/composition/clips/0/appearance/keys/0/value/view/brightness',
        value: 0.5,
      }],
    },
    script: [
      {
        tool: 'update_clips',
        args: {
          updates: [{
            clip_id: '$clipAt:0',
            appearance: { apply: { scope: 'whole-clip' }, view: { brightness: 0.5 } },
          }],
        },
      },
      { say: 'The selected Clip now renders at 50% brightness.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-time-scale',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'base',
    utterance: "Slow the comet clip's animation to quarter speed.",
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'instance-time-scale', clip: { pattern_name: 'comet' }, value: 0.25 }],
    },
    script: [
      {
        tool: 'update_clips',
        args: { updates: [{ clip_id: '$patternClip:comet', instance_properties: { time_scale: 0.25 } }] },
      },
      { say: 'The comet Clip now animates at quarter speed.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-control-target',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'base',
    utterance: "Set the comet clip's speed control to 0.3.",
    expect: {
      outcome: 'edit',
      // CometLoom's real control export is sliderSpeed; the correct solution
      // looks the export name up rather than guessing "speed".
      assertions: [{
        kind: 'instance-control', clip: { pattern_name: 'comet' }, export_name: 'sliderSpeed', value: 0.3,
      }],
    },
    script: [
      { tool: 'get_stock_pattern', args: { id: 'CometLoom' } },
      {
        tool: 'update_clips',
        args: {
          updates: [{ clip_id: '$patternClip:comet', instance_properties: { controls: { sliderSpeed: 0.3 } } }],
        },
      },
      { say: "Set the comet Clip's sliderSpeed control to 0.3.", intent: 'apply' },
    ],
  },
  {
    id: 'clips-evaluation-policy',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    utterance: 'Freeze the first clip on its entry frame.',
    expect: { outcome: 'edit' },
    script: [
      {
        tool: 'update_clips',
        args: { updates: [{ clip_id: '$clipAt:0', instance_properties: { evaluation: 'freeze-at-entry' } }] },
      },
      { say: 'The first Clip now holds its entry frame.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-entry-restart',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    utterance: 'Restart the second clip’s Pattern when it comes in.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-entry-policy', clip: { start_ms: 30_000 }, policy: 'restart' }],
    },
    script: [
      { tool: 'update_clips', args: { updates: [{ clip_id: '$clipAt:30000', entry_policy: 'restart' }] } },
      { say: 'The second Clip now restarts its Pattern instance at entry.', intent: 'apply' },
    ],
  },
  {
    id: 'clips-batch-resize',
    family: 'clips',
    referent: 'none',
    fixture: 'four-clips',
    // The playhead anchors "next"; without it the question "next from
    // where?" is a fair ask.
    context: { playhead_ms: 0 },
    utterance: 'Make the next four clips each eight seconds.',
    expect: {
      outcome: 'edit',
      max_transactions: 1,
      assertions: [
        { kind: 'clip-duration', clip: { start_ms: 0 }, duration_ms: 8_000 },
        { kind: 'clip-duration', clip: { start_ms: 10_000 }, duration_ms: 8_000 },
        { kind: 'clip-duration', clip: { start_ms: 20_000 }, duration_ms: 8_000 },
        { kind: 'clip-duration', clip: { start_ms: 30_000 }, duration_ms: 8_000 },
      ],
    },
    script: [
      {
        tool: 'update_clips',
        args: {
          updates: [
            { clip_id: '$clipAt:0', duration_ms: 8_000 },
            { clip_id: '$clipAt:10000', duration_ms: 8_000 },
            { clip_id: '$clipAt:20000', duration_ms: 8_000 },
            { clip_id: '$clipAt:30000', duration_ms: 8_000 },
          ],
        },
      },
      { tool: 'finish_turn', args: { intent: 'apply', reply: 'All four Clips are eight seconds now.' } },
    ],
  },
  {
    id: 'clips-remove-final-content',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'empty-tail',
    // Decision D6: removing the final content leaves a valid empty Show, which
    // stays editable and saveable while preview and export are unavailable.
    utterance: 'Delete the only clip.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-count', count: 0 }],
    },
    script: [
      { tool: 'remove_clips', args: { clip_ids: ['$clipAt:0'] } },
      { say: 'Removed the last Clip; the Show is empty and still editable.', intent: 'apply' },
    ],
  },
  // ---- layers ------------------------------------------------------------
  {
    id: 'layers-create-above',
    family: 'layers',
    referent: 'none',
    fixture: 'base',
    utterance: 'Add an overlay layer called Sparkle above the main layer.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/composition/layers/1/name', value: 'Sparkle' }],
    },
    script: [
      {
        tool: 'create_layers',
        args: { layers: [{ zone_id: 'z1', name: 'Sparkle', above_layer_id: '$layerId:Main' }] },
      },
      { say: 'Added the Sparkle Layer above Main.', intent: 'apply' },
    ],
  },
  // ---- show --------------------------------------------------------------
  {
    id: 'show-insert-time',
    family: 'show',
    referent: 'time',
    fixture: 'empty-tail',
    utterance: 'Insert five seconds at 15 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'show-end', duration_ms: 65_000 },
        { kind: 'clip-duration', clip: { start_ms: 0 }, duration_ms: 35_000 },
      ],
    },
    script: [
      { tool: 'insert_time', args: { at_ms: 15_000, duration_ms: 5_000 } },
      { say: 'Inserted 5 s at 15 s; everything after it moved later.', intent: 'apply' },
    ],
  },
  {
    id: 'show-set-end',
    family: 'show',
    referent: 'none',
    fixture: 'base',
    utterance: 'Make the show seventy seconds long.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'show-end', duration_ms: 70_000 }],
    },
    script: [
      { tool: 'set_show_end', args: { end_ms: 70_000 } },
      { say: 'Show End is now at 70 s.', intent: 'apply' },
    ],
  },
  // ---- markers -----------------------------------------------------------
  {
    id: 'markers-add',
    family: 'markers',
    referent: 'time',
    fixture: 'base',
    utterance: 'Drop a marker called Chorus at 42 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'marker', time_ms: 42_000, name: 'Chorus' }],
    },
    script: [
      { tool: 'add_marker', args: { at_ms: 42_000, name: 'Chorus' } },
      { tool: 'finish_turn', args: { intent: 'apply' } },
    ],
  },
  {
    id: 'markers-move',
    family: 'markers',
    referent: 'direct',
    fixture: 'base',
    setup: [{ operation: 'add_marker', args: { at_ms: 12_000, name: 'Verse' } }],
    utterance: 'Move the Verse marker to 15 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'marker', time_ms: 15_000, name: 'Verse' }],
    },
    script: [
      { tool: 'update_marker', args: { marker_id: '$markerAt:12000', at_ms: 15_000 } },
      { say: 'The Verse Marker is at 15 s now.', intent: 'apply' },
    ],
  },
  // ---- animation ---------------------------------------------------------
  {
    id: 'animation-owner-example',
    family: 'animation',
    referent: 'hover',
    fixture: 'overlay',
    context: { hovered_clip_at_ms: 0 },
    utterance:
      'Make that clip twelve seconds long, and ease its opacity to 80, 60, and 40 percent at 3, 5, and 8 seconds.',
    expect: {
      outcome: 'edit',
      max_transactions: 1,
      assertions: [
        { kind: 'clip-duration', clip: { layer_name: 'Over' }, duration_ms: 12_000 },
        {
          kind: 'track-keyframes',
          clip: { layer_name: 'Over' },
          target_contains: 'opacity',
          times_ms: [3_000, 5_000, 8_000],
          values: [0.8, 0.6, 0.4],
        },
      ],
    },
    script: [
      { tool: 'resize_clip', args: { clip_id: '$layerClip:Over', duration_ms: 12_000 } },
      {
        tool: 'add_property_tracks',
        args: {
          tracks: [{
            target: { kind: 'opacity', clip_id: '$layerClip:Over' },
            keyframes: [
              { at_ms: 3_000, value: 0.8, easing: 'ease-in-out' },
              { at_ms: 5_000, value: 0.6, easing: 'ease-in-out' },
              { at_ms: 8_000, value: 0.4, easing: 'ease-in-out' },
            ],
          }],
        },
      },
      { say: 'That Clip is now 12 s with an opacity track: 80% at 3 s, 60% at 5 s, 40% at 8 s.', intent: 'apply' },
    ],
  },
  {
    id: 'animation-brightness-fade',
    family: 'animation',
    referent: 'ordinal',
    fixture: 'base',
    utterance: "Fade the first clip's brightness from full to 20 percent over its first ten seconds.",
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'track-value-at',
        clip: { start_ms: 0 },
        target_contains: 'brightness',
        at_ms: 5_000,
        value: 0.6,
      }],
    },
    script: [
      {
        tool: 'add_property_tracks',
        args: {
          tracks: [{
            target: { kind: 'view-brightness', clip_id: '$clipAt:0' },
            keyframes: [
              { at_ms: 0, value: 1 },
              { at_ms: 10_000, value: 0.2 },
            ],
          }],
        },
      },
      { say: "The first Clip's brightness now fades from 100% to 20% over 10 s.", intent: 'apply' },
    ],
  },
  {
    id: 'animation-add-keyframe',
    family: 'animation',
    referent: 'hover',
    fixture: 'overlay',
    context: { hovered_clip_at_ms: 0 },
    setup: [{
      operation: 'add_property_tracks',
      args: {
        tracks: [{
          target: { kind: 'opacity', clip_id: '$layerClip:Over' },
          keyframes: [
            { at_ms: 3_000, value: 0.8 },
            { at_ms: 8_000, value: 0.4 },
          ],
        }],
      },
    }],
    utterance: 'Add an opacity keyframe at 5 seconds at 60 percent.',
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'track-keyframes',
        clip: { layer_name: 'Over' },
        target_contains: 'opacity',
        times_ms: [3_000, 5_000, 8_000],
      }],
    },
    script: [
      {
        tool: 'edit_property_keyframes',
        args: { track_id: '$trackOf:0:opacity', edits: { add: [{ at_ms: 5_000, value: 0.6 }] } },
      },
      { say: 'Added a 60% opacity keyframe at 5 s.', intent: 'apply' },
    ],
  },
  {
    id: 'animation-move-keyframe',
    family: 'animation',
    referent: 'direct',
    fixture: 'overlay',
    setup: [{
      operation: 'add_property_tracks',
      args: {
        tracks: [{
          target: { kind: 'opacity', clip_id: '$layerClip:Over' },
          keyframes: [
            { at_ms: 3_000, value: 0.8 },
            { at_ms: 8_000, value: 0.4 },
          ],
        }],
      },
    }],
    utterance: 'Move the first opacity keyframe to 2 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'track-keyframes',
        clip: { layer_name: 'Over' },
        target_contains: 'opacity',
        times_ms: [2_000, 8_000],
      }],
    },
    script: [
      {
        tool: 'edit_property_keyframes',
        args: {
          track_id: '$trackOf:0:opacity',
          edits: { update: [{ keyframe_id: '$keyframeOf:0:opacity:0', at_ms: 2_000 }] },
        },
      },
      { say: 'The first opacity keyframe is at 2 s now.', intent: 'apply' },
    ],
  },
  {
    id: 'animation-remove-track',
    family: 'animation',
    referent: 'hover',
    fixture: 'overlay',
    context: { hovered_clip_at_ms: 0 },
    setup: [{
      operation: 'add_property_tracks',
      args: {
        tracks: [{
          target: { kind: 'opacity', clip_id: '$layerClip:Over' },
          keyframes: [
            { at_ms: 3_000, value: 0.8 },
            { at_ms: 8_000, value: 0.4 },
          ],
        }],
      },
    }],
    utterance: 'Remove the opacity animation from that clip.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'no-track', clip: { layer_name: 'Over' }, target_contains: 'opacity' }],
    },
    script: [
      { tool: 'remove_property_tracks', args: { track_ids: ['$trackOf:0:opacity'] } },
      { say: 'Removed the opacity animation.', intent: 'apply' },
    ],
  },
  {
    id: 'animation-widen-activation',
    family: 'animation',
    referent: 'direct',
    fixture: 'overlay',
    setup: [{
      operation: 'add_property_tracks',
      args: {
        tracks: [{
          target: { kind: 'opacity', clip_id: '$layerClip:Over' },
          keyframes: [
            { at_ms: 2_000, value: 1 },
            { at_ms: 6_000, value: 0 },
          ],
        }],
      },
    }],
    // Activation is authored in v2 and its keys live inside it; widening the
    // window holds the first key's value over the added head.
    utterance: 'Start that opacity fade from the top of the clip.',
    expect: {
      outcome: 'edit',
      assertions: [
        {
          kind: 'track-value-at',
          clip: { layer_name: 'Over' },
          target_contains: 'opacity',
          at_ms: 1_000,
          value: 1,
        },
        {
          kind: 'track-value-at',
          clip: { layer_name: 'Over' },
          target_contains: 'opacity',
          at_ms: 4_000,
          value: 0.5,
        },
      ],
    },
    script: [
      {
        tool: 'update_property_track',
        args: { track_id: '$trackOf:0:opacity', active_start_ms: 0, active_duration_ms: 6_000 },
      },
      { say: 'The opacity fade now runs from 0 s and still lands at 0 by 6 s.', intent: 'apply' },
    ],
  },
  // ---- transitions -------------------------------------------------------
  {
    id: 'transitions-change-kind',
    family: 'transitions',
    referent: 'direct',
    fixture: 'boundary-crossfade',
    utterance: 'Make the transition at 29 seconds a wipe.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'junction', clip: { start_ms: 0 }, scope: 'layer', junction_kind: 'wipe' },
      ],
    },
    script: [
      { tool: 'update_transition', args: { transition_id: '$transition:0', kind: 'wipe' } },
      { say: 'The junction is a wipe now.', intent: 'apply' },
    ],
  },
  {
    id: 'transitions-resize',
    family: 'transitions',
    referent: 'direct',
    fixture: 'boundary-crossfade',
    utterance: 'Make that crossfade half a second.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'transition-count', count: 1, duration_ms: 500 }],
    },
    script: [
      { tool: 'resize_transition', args: { transition_id: '$transition:0', duration_ms: 500 } },
      { say: 'The crossfade is 0.5 s now.', intent: 'apply' },
    ],
  },
  {
    id: 'transitions-parameter',
    family: 'transitions',
    referent: 'direct',
    fixture: 'boundary-crossfade',
    setup: [{ operation: 'update_transition', args: { transition_id: '$transition:0', kind: 'wipe' } }],
    utterance: "Soften the wipe's edge — feather 0.4.",
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/composition/transitions/0/feather', value: 0.4 }],
    },
    script: [
      { tool: 'update_transition', args: { transition_id: '$transition:0', parameters: { feather: 0.4 } } },
      { say: "The wipe's feather is 0.4 now.", intent: 'apply' },
    ],
  },
  {
    id: 'transitions-insert',
    family: 'transitions',
    referent: 'ordinal',
    fixture: 'empty-tail',
    // Insert takes an exact Cut junction and ripples the incoming connected
    // content later by the Transition's duration, so the junction needs free
    // time after it: the second Clip moves 30 000 -> 32 000 ms.
    setup: [{
      operation: 'create_clips',
      args: {
        clips: [{
          zone_id: 'z1',
          layer_id: '$layerId:Main',
          start_ms: 30_000,
          duration_ms: 10_000,
          pattern: { kind: 'stock', id: 'TestPattern1D' },
        }],
      },
    }],
    utterance: 'Crossfade two seconds between the two clips.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'transition-count', count: 1, duration_ms: 2_000 },
        { kind: 'clip-start', clip: { pattern_name: 'TestPattern1D' }, start_ms: 32_000 },
      ],
    },
    script: [
      {
        tool: 'insert_transition',
        args: {
          from_clip_id: '$clipAt:0',
          to_clip_id: '$clipAt:30000',
          duration_ms: 2_000,
          kind: 'crossfade',
        },
      },
      { say: 'The two Clips now crossfade over 2 s.', intent: 'apply' },
    ],
  },
  {
    id: 'transitions-remove-to-cut',
    family: 'transitions',
    referent: 'direct',
    fixture: 'boundary-crossfade',
    utterance: 'Remove the crossfade between the first two clips — make it a hard cut.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'transition-count', count: 0 },
        { kind: 'junction', clip: { start_ms: 0 }, scope: 'derived-cut' },
      ],
    },
    script: [
      { tool: 'remove_transition', args: { transition_id: '$transition:0' } },
      { say: 'The junction is a hard Cut again.', intent: 'apply' },
    ],
  },
  // ---- effects -----------------------------------------------------------
  {
    id: 'effects-add-vignette',
    family: 'effects',
    referent: 'ordinal',
    fixture: 'base',
    utterance: 'Put a vignette on the first clip at strength 0.5.',
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'effect', clip: { start_ms: 0 }, effect_kind: 'vignette', parameter: 'amount', value: 0.5,
      }],
    },
    script: [
      {
        tool: 'add_clip_effect',
        args: {
          clip_id: '$clipAt:0',
          kind: 'vignette',
          parameters: { amount: 0.5 },
          apply: { scope: 'whole-clip' },
        },
      },
      { say: 'Added a vignette at strength 0.5 to the first Clip.', intent: 'apply' },
    ],
  },
  {
    id: 'effects-update-parameter',
    family: 'effects',
    referent: 'direct',
    fixture: 'base',
    setup: [{
      operation: 'add_clip_effect',
      args: {
        clip_id: '$clipAt:0',
        kind: 'brightness',
        parameters: { brightness: 0.4 },
        apply: { scope: 'whole-clip' },
      },
    }],
    utterance: 'Turn the brightness effect up to 0.8.',
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'effect', clip: { start_ms: 0 }, effect_kind: 'brightness', parameter: 'brightness', value: 0.8,
      }],
    },
    script: [
      {
        tool: 'update_clip_effect',
        args: {
          clip_id: '$clipAt:0',
          effect_id: '$effectOf:0:brightness',
          parameters: { brightness: 0.8 },
          apply: { scope: 'whole-clip' },
        },
      },
      { say: 'The brightness Effect is at 0.8 now.', intent: 'apply' },
    ],
  },
  {
    id: 'effects-remove',
    family: 'effects',
    referent: 'direct',
    fixture: 'base',
    setup: [{
      operation: 'add_clip_effect',
      args: {
        clip_id: '$clipAt:0',
        kind: 'brightness',
        parameters: { brightness: 0.4 },
        apply: { scope: 'whole-clip' },
      },
    }],
    utterance: 'Take the brightness effect off the first clip.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'no-effect', clip: { start_ms: 0 }, effect_kind: 'brightness' }],
    },
    script: [
      {
        tool: 'remove_clip_effect',
        args: { clip_id: '$clipAt:0', effect_id: '$effectOf:0:brightness', apply: { scope: 'whole-clip' } },
      },
      { say: 'Removed the brightness Effect.', intent: 'apply' },
    ],
  },
  // ---- show structure ----------------------------------------------------
  {
    id: 'show-output-contract',
    family: 'show',
    referent: 'none',
    fixture: 'base',
    utterance: 'Set the reference pixel count to 512.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/outputContract/referencePixelCount', value: 512 }],
    },
    script: [
      { tool: 'set_output_contract', args: { kind: 'portable-2d', map_id: 'plane', pixel_count: 512 } },
      { say: 'The portable contract now references 512 pixels.', intent: 'apply' },
    ],
  },
  {
    id: 'layouts-add-interval',
    family: 'layouts',
    referent: 'none',
    fixture: 'base',
    utterance: 'Add a ten-second full-stage layout section at the end of the show.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'show-end', duration_ms: 70_000 }],
    },
    script: [
      { tool: 'add_layout_interval', args: { layout_id: 'l1', duration_ms: 10_000 } },
      { say: 'Added a 10 s Full Stage section at the end; the Show is 70 s now.', intent: 'apply' },
    ],
  },
  {
    id: 'show-trails',
    family: 'show',
    referent: 'none',
    fixture: 'base',
    utterance: 'Add trails to the show output with retention 0.6.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/outputEffects/0/retention', value: 0.6 }],
    },
    script: [
      { tool: 'set_output_trails', args: { enabled: true, retention: 0.6 } },
      { say: 'Trails is on at retention 0.6.', intent: 'apply' },
    ],
  },
  // ---- multi-turn conversations (seeded from live bridge sessions) -------
  {
    id: 'multi-answer-completion',
    family: 'clips',
    referent: 'direct',
    fixture: 'base',
    utterance: 'Make the first clip shorter.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-duration', clip: { start_ms: 0 }, duration_ms: 10_000 }],
    },
    script: [
      { say: 'How long should the first Clip (CometLoom, 0–30 s) be?', intent: 'ask' },
    ],
    followups: [
      {
        utterance: 'Ten seconds total.',
        script: [
          { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 10_000 } },
          { say: 'CometLoom now runs 10 seconds.', intent: 'apply' },
        ],
      },
    ],
  },
  {
    id: 'multi-confirm-referent',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'four-clips',
    utterance: 'Make the comet clip longer.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-duration', clip: { start_ms: 30_000 }, duration_ms: 15_000 }],
    },
    script: [
      { tool: 'resolve_reference', args: { pattern_name: 'comet' } },
      { say: 'Four Clips use CometLoom — which one do you mean, and how long should it be?', intent: 'ask' },
    ],
    followups: [
      {
        utterance: 'The one at thirty seconds — make it fifteen seconds long.',
        script: [
          { tool: 'resize_clip', args: { clip_id: '$clipAt:30000', duration_ms: 15_000 } },
          { say: 'The CometLoom Clip at 30 s now runs 15 seconds.', intent: 'apply' },
        ],
      },
    ],
  },
  {
    id: 'multi-brightness-amount',
    family: 'animation',
    referent: 'ordinal',
    fixture: 'base',
    utterance: "Fade the first clip's brightness down over its last two seconds.",
    expect: {
      outcome: 'edit',
      assertions: [
        {
          kind: 'track-value-at',
          clip: { start_ms: 0 },
          target_contains: 'brightness',
          at_ms: 28_000,
          value: 1,
        },
        {
          kind: 'track-value-at',
          clip: { start_ms: 0 },
          target_contains: 'brightness',
          at_ms: 29_000,
          value: 0.5,
        },
      ],
    },
    script: [
      { say: 'Down to what — black, or a dim hold? The Clip runs 0–30 s, so the fade would cover 28–30 s.', intent: 'ask' },
    ],
    followups: [
      {
        utterance: 'All the way to black.',
        script: [
          {
            tool: 'add_property_tracks',
            args: {
              tracks: [{
                target: { kind: 'view-brightness', clip_id: '$clipAt:0' },
                keyframes: [
                  { at_ms: 28_000, value: 1 },
                  { at_ms: 30_000, value: 0 },
                ],
              }],
            },
          },
          { say: 'Brightness now fades 1 → 0 over 28–30 s.', intent: 'apply' },
        ],
      },
    ],
  },
  // ---- ambiguous: asking is the correct outcome --------------------------
  {
    id: 'ambiguous-pattern-name',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'four-clips',
    utterance: 'Make the comet clip longer.',
    expect: { outcome: 'ask' },
    script: [
      { tool: 'resolve_reference', args: { pattern_name: 'comet' } },
      { say: 'Four Clips use CometLoom — which one do you mean, and how long should it be?', intent: 'ask' },
    ],
  },
  {
    id: 'ambiguous-no-hover',
    family: 'clips',
    referent: 'hover',
    fixture: 'base',
    utterance: 'Delete that clip.',
    expect: { outcome: 'ask' },
    script: [
      { tool: 'resolve_reference', args: { hovered: true } },
      { say: 'Nothing is hovered right now — which Clip should I delete?', intent: 'ask' },
    ],
  },
  {
    id: 'ambiguous-two-markers',
    family: 'markers',
    referent: 'direct',
    fixture: 'base',
    setup: [
      { operation: 'add_marker', args: { at_ms: 10_000, name: 'Marker' } },
      { operation: 'add_marker', args: { at_ms: 20_000, name: 'Marker' } },
    ],
    utterance: 'Move the marker to 25 seconds.',
    expect: { outcome: 'ask' },
    script: [
      { say: 'There are two Markers (at 10 s and 20 s) — which one should move to 25 s?', intent: 'ask' },
    ],
  },
  // ---- impossible: a typed refusal is the correct outcome ----------------
  {
    id: 'refuse-overlap',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    // The constraint closes the creative escape of inserting timeline to make
    // room, which is a legal path to the unconstrained request.
    utterance: "Make the first clip forty seconds long. Don't move or change any other clips.",
    expect: { outcome: 'no-edit' },
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 40_000 } },
      { say: 'That would overlap the next Clip on the same Layer, so I left it unchanged. I can resize up to 30 s, or move the other Clip first.', intent: 'refuse' },
    ],
  },
  {
    id: 'refuse-split-outside',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    // Truly impossible with no near alternative: 45 s is simply not inside the
    // first Clip (0–30 s); the correct outcome is a plain refusal.
    utterance: 'Split the first clip at 45 seconds.',
    expect: { outcome: 'no-edit' },
    script: [
      { tool: 'split_clip', args: { clip_id: '$clipAt:0', at_ms: 45_000 } },
      { say: 'The first Clip runs 0–30 s, so 45 s is not inside it; I left the Show unchanged.', intent: 'refuse' },
    ],
  },
  {
    id: 'refuse-show-end-protected',
    family: 'show',
    referent: 'none',
    fixture: 'base',
    // Set Show End is exact: an invalid shortening refuses naming the
    // protecting entity, with no silent content cut or clamp.
    utterance: 'Cut the show down to twenty seconds, leaving the clips alone.',
    expect: { outcome: 'no-edit' },
    script: [
      { tool: 'set_show_end', args: { end_ms: 20_000 } },
      { say: 'Shortening to 20 s would cut Clip contributions that run past it, so I left Show End alone. Shorten or remove the trailing Clips first.', intent: 'refuse' },
    ],
  },
  {
    id: 'ask-appearance-at-clip-end',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    // The substitution temptation: a selected-time appearance edit requires a
    // time inside the Clip's half-open interval, and the exact exclusive end
    // refuses. A near alternative exists, so the correct move is to leave the
    // document unchanged and offer it as a question.
    utterance: "Dim the first clip to a quarter at exactly thirty seconds.",
    expect: { outcome: 'ask' },
    script: [
      {
        tool: 'update_clips',
        args: {
          updates: [{
            clip_id: '$clipAt:0',
            appearance: { apply: { scope: 'at-time', at_ms: 30_000 }, view: { brightness: 0.25 } },
          }],
        },
      },
      { say: 'The first Clip runs 0–30 s, so 30 s is its exclusive end and lands outside it. Shall I write the key just inside, or dim the whole Clip?', intent: 'ask' },
    ],
  },
  {
    id: 'ask-unknown-control',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'base',
    // The identifier temptation: no "sparkle" export exists; correct behavior
    // is to look the exports up and ask, never to guess or to set a nonexistent
    // target.
    utterance: "Set the comet clip's sparkle control to 0.5.",
    expect: { outcome: 'ask' },
    script: [
      { tool: 'get_stock_pattern', args: { id: 'CometLoom' } },
      { say: 'CometLoom has no "sparkle" control; its exports are sliderSpeed, sliderComets, sliderTail, and sliderPalette. Which one should I set to 0.5?', intent: 'ask' },
    ],
  },
]
