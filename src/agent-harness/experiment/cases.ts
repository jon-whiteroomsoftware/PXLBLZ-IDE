// Provenance: pxlblz-v3 src/experiment/cases.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// The dictation intent corpus (#23): utterances spanning every operation
// family from #18/#19, referents by hover, selection, ordinal, time, and
// pattern name, genuinely ambiguous requests where asking is correct, and
// impossible requests where a typed refusal is correct. Each case carries
// the intended solution as a script; the scripted fake agent executes it
// verbatim, and a live agent is scored against the same expectations.
//
// Script argument placeholders (resolved against the live session state):
//   $clipAt:<startMs>            clip id at a global start time
//   $patternClip:<name>          first clip whose pattern name contains <name>
//   $overlayClip                 first overlay-layer clip
//   $markerAt:<timeMs>           marker id at a time
//   $trackOf:<startMs>:<text>    track id on the clip at <startMs> whose target contains <text>
//   $keyframeOf:<startMs>:<text>:<index>  keyframe id by track and index
//   $effectOf:<startMs>:<kind>   effect id on the clip at <startMs> by kind
//   $layerTransition:<index>     nth layer Transition id
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
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000, finish_turn_reply: 'The first clip now runs 0–12 s.' } },
    ],
  },
  {
    id: 'clips-add-at-time',
    family: 'clips',
    referent: 'none',
    fixture: 'empty-second-scene',
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
        tool: 'add_clip',
        args: {
          zone_id: 'z1', start_ms: 35_000, duration_ms: 10_000,
          pattern_kind: 'stock', pattern_id: 'CometLoom',
        },
      },
      { say: 'Added a CometLoom clip at 35–45 s.' },
    ],
  },
  {
    id: 'clips-move-hover',
    family: 'clips',
    referent: 'hover',
    fixture: 'empty-second-scene',
    context: { hovered_clip_at_ms: 0 },
    utterance: 'Move that clip to start at 20 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'clip-start', clip: { pattern_name: 'CometLoom' }, start_ms: 20_000 }],
    },
    script: [
      { tool: 'move_clip', args: { clip: { hovered: true }, start_ms: 20_000 } },
      { say: 'The clip now starts at 20 s.' },
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
      { say: 'Split the clip at 12 s.' },
    ],
  },
  {
    id: 'clips-duplicate-linked',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'empty-second-scene',
    utterance: 'Duplicate the comet clip right after itself, keeping them linked.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'clip-count', count: 2 },
        { kind: 'clip-start', clip: { start_ms: 30_000 }, start_ms: 30_000 },
      ],
    },
    script: [
      { tool: 'duplicate_clip', args: { clip_id: '$patternClip:comet', linked: true } },
      { say: 'Duplicated the comet clip as a linked copy at 30–60 s.' },
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
      { tool: 'remove_clip', args: { clip_id: '$patternClip:test' } },
      { say: 'Removed the TestPattern1D clip.' },
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
        pointer: '/composition/scenes/0/zones/0/main/0/view/brightness',
        value: 0.5,
      }],
    },
    script: [
      { tool: 'set_clip_view', args: { clip: { selected: true }, brightness: 0.5 } },
      { say: 'The selected clip now renders at 50% brightness.' },
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
      { tool: 'set_clip_time', args: { clip_id: '$patternClip:comet', time_scale: 0.25 } },
      { say: 'The comet clip now animates at quarter speed.' },
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
      // looks the export name up rather than guessing "speed" (the terra run
      // did exactly that, and the original assertion wrongly punished it).
      assertions: [{
        kind: 'instance-control', clip: { pattern_name: 'comet' }, export_name: 'sliderSpeed', value: 0.3,
      }],
    },
    script: [
      { tool: 'get_stock_pattern', args: { id: 'CometLoom' } },
      { tool: 'set_clip_control_target', args: { clip_id: '$patternClip:comet', export_name: 'sliderSpeed', value: 0.3 } },
      { say: "Set the comet clip's sliderSpeed control to 0.3." },
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
      { tool: 'set_clip_evaluation', args: { clip_id: '$clipAt:0', policy: 'freeze-at-entry' } },
      { say: 'The first clip now holds its entry frame.' },
    ],
  },
  {
    id: 'clips-batch-resize',
    family: 'clips',
    referent: 'none',
    fixture: 'four-clips',
    // The playhead anchors "next"; without it the question "next from
    // where?" is a fair ask (the terra run asked it).
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
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 8_000 } },
      { tool: 'resize_clip', args: { clip_id: '$clipAt:10000', duration_ms: 8_000 } },
      { tool: 'resize_clip', args: { clip_id: '$clipAt:20000', duration_ms: 8_000 } },
      { tool: 'resize_clip', args: { clip_id: '$clipAt:30000', duration_ms: 8_000 } },
      { tool: 'finish_turn', args: { reply: 'All four clips are eight seconds now.' } },
    ],
  },
  // ---- timeline ----------------------------------------------------------
  {
    id: 'timeline-insert-time',
    family: 'timeline',
    referent: 'time',
    fixture: 'empty-second-scene',
    utterance: 'Insert five seconds at 15 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'show-end', duration_ms: 65_000 },
        { kind: 'clip-duration', clip: { start_ms: 0 }, duration_ms: 15_000 },
      ],
    },
    script: [
      { tool: 'insert_time', args: { at_ms: 15_000, duration_ms: 5_000 } },
      { say: 'Inserted 5 s at 15 s; everything after it moved later.' },
    ],
  },
  {
    id: 'timeline-show-end',
    family: 'timeline',
    referent: 'none',
    fixture: 'base',
    utterance: 'Make the show seventy seconds long.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'show-end', duration_ms: 70_000 }],
    },
    script: [
      { tool: 'set_show_end', args: { end_ms: 70_000 } },
      { say: 'Show End is now at 70 s.' },
    ],
  },
  {
    id: 'timeline-add-marker',
    family: 'timeline',
    referent: 'time',
    fixture: 'base',
    utterance: 'Drop a marker called Chorus at 42 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'marker', time_ms: 42_000, name: 'Chorus' }],
    },
    script: [
      { tool: 'add_marker', args: { at_ms: 42_000, name: 'Chorus' } },
      { tool: 'finish_turn', args: {} },
    ],
  },
  {
    id: 'timeline-move-marker',
    family: 'timeline',
    referent: 'direct',
    fixture: 'base',
    setup: [{ operation: 'add_marker', args: { at_ms: 12_000, name: 'Verse' } }],
    utterance: 'Move the Verse marker to 15 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'marker', time_ms: 15_000, name: 'Verse' }],
    },
    script: [
      { tool: 'move_marker', args: { marker_id: '$markerAt:12000', at_ms: 15_000 } },
      { say: 'The Verse marker is at 15 s now.' },
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
        { kind: 'clip-duration', clip: { layer_kind: 'overlay' }, duration_ms: 12_000 },
        {
          kind: 'track-keyframes',
          clip: { layer_kind: 'overlay' },
          target_contains: 'opacity',
          times_ms: [3_000, 5_000, 8_000],
          values: [0.8, 0.6, 0.4],
        },
      ],
    },
    script: [
      { tool: 'resize_clip', args: { clip: { hovered: true }, duration_ms: 12_000 } },
      {
        tool: 'add_property_track',
        args: {
          clip_id: '$overlayClip',
          target: 'opacity',
          keyframes: [
            { time_ms: 3_000, value: 0.8, easing: 'ease-in-out' },
            { time_ms: 5_000, value: 0.6, easing: 'ease-in-out' },
            { time_ms: 8_000, value: 0.4, easing: 'ease-in-out' },
          ],
        },
      },
      { say: 'That clip is now 12 s with an opacity track: 80% at 3 s, 60% at 5 s, 40% at 8 s.' },
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
        at_local_ms: 5_000,
        value: 0.6,
      }],
    },
    script: [
      {
        tool: 'add_property_track',
        args: {
          clip_id: '$clipAt:0',
          target: 'view-brightness',
          keyframes: [
            { time_ms: 0, value: 1 },
            { time_ms: 10_000, value: 0.2 },
          ],
        },
      },
      { say: "The first clip's brightness now fades from 100% to 20% over 10 s." },
    ],
  },
  {
    id: 'animation-add-keyframe',
    family: 'animation',
    referent: 'hover',
    fixture: 'overlay',
    context: { hovered_clip_at_ms: 0 },
    setup: [{
      operation: 'add_property_track',
      args: {
        clip_id: '$overlayClip',
        target: 'opacity',
        keyframes: [
          { time_ms: 3_000, value: 0.8 },
          { time_ms: 8_000, value: 0.4 },
        ],
      },
    }],
    utterance: 'Add an opacity keyframe at 5 seconds at 60 percent.',
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'track-keyframes',
        clip: { layer_kind: 'overlay' },
        target_contains: 'opacity',
        times_ms: [3_000, 5_000, 8_000],
      }],
    },
    script: [
      { tool: 'add_keyframe', args: { track_id: '$trackOf:0:opacity', time_ms: 5_000, value: 0.6 } },
      { say: 'Added a 60% opacity keyframe at 5 s.' },
    ],
  },
  {
    id: 'animation-move-keyframe',
    family: 'animation',
    referent: 'direct',
    fixture: 'overlay',
    setup: [{
      operation: 'add_property_track',
      args: {
        clip_id: '$overlayClip',
        target: 'opacity',
        keyframes: [
          { time_ms: 3_000, value: 0.8 },
          { time_ms: 8_000, value: 0.4 },
        ],
      },
    }],
    utterance: 'Move the first opacity keyframe to 2 seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{
        kind: 'track-keyframes',
        clip: { layer_kind: 'overlay' },
        target_contains: 'opacity',
        times_ms: [2_000, 8_000],
      }],
    },
    script: [
      {
        tool: 'move_keyframe',
        args: { track_id: '$trackOf:0:opacity', keyframe_id: '$keyframeOf:0:opacity:0', time_ms: 2_000 },
      },
      { say: 'The first opacity keyframe is at 2 s now.' },
    ],
  },
  {
    id: 'animation-delete-track',
    family: 'animation',
    referent: 'hover',
    fixture: 'overlay',
    context: { hovered_clip_at_ms: 0 },
    setup: [{
      operation: 'add_property_track',
      args: {
        clip_id: '$overlayClip',
        target: 'opacity',
        keyframes: [
          { time_ms: 3_000, value: 0.8 },
          { time_ms: 8_000, value: 0.4 },
        ],
      },
    }],
    utterance: 'Remove the opacity animation from that clip.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'no-track', clip: { layer_kind: 'overlay' }, target_contains: 'opacity' }],
    },
    script: [
      { tool: 'delete_property_track', args: { track_id: '$trackOf:0:opacity' } },
      { say: 'Removed the opacity animation.' },
    ],
  },
  // ---- junctions ---------------------------------------------------------
  {
    id: 'junctions-set-kind',
    family: 'junctions',
    referent: 'time',
    fixture: 'boundary-crossfade',
    utterance: 'Make the transition at 30 seconds a two-second wipe.',
    expect: {
      outcome: 'edit',
      assertions: [
        { kind: 'junction-kind', after_scene_id: 's1', junction_kind: 'wipe' },
        { kind: 'pointer-equals', pointer: '/transitions/0/durationMs', value: 2_000 },
      ],
    },
    script: [
      { tool: 'set_junction_transition', args: { at_ms: 30_000, kind: 'wipe', duration_ms: 2_000 } },
      { say: 'The scene transition is now a 2 s wipe.' },
    ],
  },
  {
    id: 'junctions-timing',
    family: 'junctions',
    referent: 'time',
    fixture: 'boundary-crossfade',
    utterance: 'Ease the scene transition in and out, three seconds long.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/transitions/0/durationMs', value: 3_000 }],
    },
    script: [
      { tool: 'set_junction_timing', args: { at_ms: 30_000, duration_ms: 3_000, easing: 'ease-in-out' } },
      { say: 'The scene transition now runs 3 s with ease-in-out.' },
    ],
  },
  {
    id: 'junctions-parameter',
    family: 'junctions',
    referent: 'time',
    fixture: 'boundary-crossfade',
    setup: [{ operation: 'set_junction_transition', args: { at_ms: 30_000, kind: 'wipe' } }],
    utterance: "Soften the wipe's edge — feather 0.4.",
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/transitions/0/feather', value: 0.4 }],
    },
    script: [
      { tool: 'update_junction_parameter', args: { at_ms: 30_000, parameter: 'feather', value: 0.4 } },
      { say: "The wipe's feather is 0.4 now." },
    ],
  },
  // ---- layer transitions -------------------------------------------------
  {
    id: 'layer-transitions-insert',
    family: 'layer-transitions',
    referent: 'ordinal',
    fixture: 'empty-second-scene',
    setup: [
      { operation: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 10_000 } },
      {
        operation: 'add_clip',
        args: {
          zone_id: 'z1', start_ms: 10_000, duration_ms: 10_000,
          pattern_kind: 'stock', pattern_id: 'CometLoom',
        },
      },
    ],
    utterance: 'Crossfade two seconds between the first two clips.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'layer-transition', count: 1, duration_ms: 2_000 }],
    },
    script: [
      {
        tool: 'insert_layer_transition',
        args: { from_clip_id: '$clipAt:0', to_clip_id: '$clipAt:10000', duration_ms: 2_000 },
      },
      { say: 'The first two clips now crossfade over 2 s.' },
    ],
  },
  {
    id: 'layer-transitions-resize',
    family: 'layer-transitions',
    referent: 'direct',
    fixture: 'empty-second-scene',
    setup: [
      { operation: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 10_000 } },
      {
        operation: 'add_clip',
        args: {
          zone_id: 'z1', start_ms: 10_000, duration_ms: 10_000,
          pattern_kind: 'stock', pattern_id: 'CometLoom',
        },
      },
      {
        operation: 'insert_layer_transition',
        args: { from_clip_id: '$clipAt:0', to_clip_id: '$clipAt:10000', duration_ms: 2_000 },
      },
    ],
    utterance: 'Make that crossfade three seconds.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'layer-transition', count: 1, duration_ms: 3_000 }],
    },
    script: [
      { tool: 'resize_layer_transition', args: { transition_id: '$layerTransition:0', duration_ms: 3_000 } },
      { say: 'The crossfade is 3 s now.' },
    ],
  },
  {
    id: 'layer-transitions-reset',
    family: 'layer-transitions',
    referent: 'direct',
    fixture: 'empty-second-scene',
    setup: [
      { operation: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 10_000 } },
      {
        operation: 'add_clip',
        args: {
          zone_id: 'z1', start_ms: 10_000, duration_ms: 10_000,
          pattern_kind: 'stock', pattern_id: 'CometLoom',
        },
      },
      {
        operation: 'insert_layer_transition',
        args: { from_clip_id: '$clipAt:0', to_clip_id: '$clipAt:10000', duration_ms: 2_000 },
      },
    ],
    utterance: 'Remove the crossfade between the first two clips — make it a hard cut.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'layer-transition', count: 0 }],
    },
    script: [
      { tool: 'reset_layer_transition_to_cut', args: { transition_id: '$layerTransition:0' } },
      { say: 'The junction is a hard cut again.' },
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
      { tool: 'add_clip_effect', args: { clip_id: '$clipAt:0', kind: 'vignette', parameters: { amount: 0.5 } } },
      { say: 'Added a vignette at strength 0.5 to the first clip.' },
    ],
  },
  {
    id: 'effects-update-parameter',
    family: 'effects',
    referent: 'direct',
    fixture: 'base',
    setup: [{
      operation: 'add_clip_effect',
      args: { clip_id: '$clipAt:0', kind: 'brightness', parameters: { brightness: 0.4 } },
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
          clip_id: '$clipAt:0', effect_id: '$effectOf:0:brightness',
          parameter: 'brightness', value: 0.8,
        },
      },
      { say: 'The brightness effect is at 0.8 now.' },
    ],
  },
  {
    id: 'effects-remove',
    family: 'effects',
    referent: 'direct',
    fixture: 'base',
    setup: [{
      operation: 'add_clip_effect',
      args: { clip_id: '$clipAt:0', kind: 'brightness', parameters: { brightness: 0.4 } },
    }],
    utterance: 'Take the brightness effect off the first clip.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'no-effect', clip: { start_ms: 0 }, effect_kind: 'brightness' }],
    },
    script: [
      { tool: 'remove_clip_effect', args: { clip_id: '$clipAt:0', effect_id: '$effectOf:0:brightness' } },
      { say: 'Removed the brightness effect.' },
    ],
  },
  // ---- structure ---------------------------------------------------------
  {
    id: 'structure-output-contract',
    family: 'structure',
    referent: 'none',
    fixture: 'base',
    utterance: 'Set the reference pixel count to 512.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/outputContract/referencePixelCount', value: 512 }],
    },
    script: [
      { tool: 'set_output_contract', args: { kind: 'portable-2d', map_id: 'plane', pixel_count: 512 } },
      { say: 'The portable contract now references 512 pixels.' },
    ],
  },
  {
    id: 'structure-layout-interval',
    family: 'structure',
    referent: 'none',
    fixture: 'base',
    utterance: 'Add a ten-second full-stage layout section at the end of the show.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'show-end', duration_ms: 70_000 }],
    },
    script: [
      { tool: 'add_layout_interval', args: { layout_id: 'l1', duration_ms: 10_000 } },
      { say: 'Added a 10 s Full Stage section at the end; the show is 70 s now.' },
    ],
  },
  // ---- structure: Trails, once the registry's one family gap (#27) -------
  {
    id: 'structure-trails',
    family: 'structure',
    referent: 'none',
    fixture: 'base',
    utterance: 'Add trails to the show output with retention 0.6.',
    expect: {
      outcome: 'edit',
      assertions: [{ kind: 'pointer-equals', pointer: '/outputEffects/0/retention', value: 0.6 }],
    },
    script: [
      { tool: 'set_output_trails', args: { enabled: true, retention: 0.6 } },
      { say: 'Trails is on at retention 0.6.' },
    ],
  },
  // ---- multi-turn conversations (#30, seeded from live bridge sessions) --
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
      { say: 'How long should the first clip (CometLoom, 0–30 s) be?' },
    ],
    followups: [
      {
        utterance: 'Ten seconds total.',
        script: [
          { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 10_000 } },
          { say: 'CometLoom now runs 10 seconds.' },
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
      { say: 'Four clips use CometLoom — which one do you mean, and how long should it be?' },
    ],
    followups: [
      {
        utterance: 'The one at thirty seconds — make it fifteen seconds long.',
        script: [
          { tool: 'resize_clip', args: { clip_id: '$clipAt:30000', duration_ms: 15_000 } },
          { say: 'The CometLoom clip at 30 s now runs 15 seconds.' },
        ],
      },
    ],
  },
  {
    id: 'multi-override-brightness',
    family: 'animation',
    referent: 'ordinal',
    fixture: 'base',
    utterance: "Fade the first clip's opacity to zero over its last two seconds.",
    expect: {
      outcome: 'edit',
      assertions: [
        {
          kind: 'track-value-at',
          clip: { start_ms: 0 },
          target_contains: 'brightness',
          at_local_ms: 28_000,
          value: 1,
        },
        {
          kind: 'track-value-at',
          clip: { start_ms: 0 },
          target_contains: 'brightness',
          at_local_ms: 30_000,
          value: 0,
        },
      ],
    },
    script: [
      { say: 'The first clip is a main-layer clip, so opacity is not available — shall I fade its brightness to zero over 28–30 s instead?' },
    ],
    followups: [
      {
        utterance: 'Yes, use brightness.',
        script: [
          {
            tool: 'add_property_track',
            args: {
              clip_id: '$clipAt:0',
              target: 'view-brightness',
              keyframes: [
                { time_ms: 28_000, value: 1 },
                { time_ms: 30_000, value: 0 },
              ],
            },
          },
          { say: 'Brightness now fades 1 → 0 over 28–30 s.' },
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
      { say: 'Four clips use CometLoom — which one do you mean, and how long should it be?' },
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
      { say: 'Nothing is hovered right now — which clip should I delete?' },
    ],
  },
  {
    id: 'ambiguous-two-markers',
    family: 'timeline',
    referent: 'direct',
    fixture: 'base',
    setup: [
      { operation: 'add_marker', args: { at_ms: 10_000, name: 'Marker' } },
      { operation: 'add_marker', args: { at_ms: 20_000, name: 'Marker' } },
    ],
    utterance: 'Move the marker to 25 seconds.',
    expect: { outcome: 'ask' },
    script: [
      { say: 'There are two markers (at 10 s and 20 s) — which one should move to 25 s?' },
    ],
  },
  // ---- impossible: a typed refusal is the correct outcome ----------------
  {
    id: 'refuse-overlap',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    // The constraint closes the creative escape the terra run found
    // (inserting timeline to make room is a legal path to the unconstrained
    // request, so the unconstrained form is not actually impossible).
    utterance: "Make the first clip forty seconds long. Don't move or change any other clips.",
    expect: { outcome: 'no-edit' },
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 40_000 } },
      { say: 'That would overlap the next clip on the same layer, so I left it unchanged. I can resize up to 30 s, or move the other clip first.' },
    ],
  },
  {
    id: 'refuse-split-outside',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'base',
    // Truly impossible with no near alternative: 45 s is simply not inside
    // the first clip (0-30 s); the correct outcome is a plain refusal.
    utterance: 'Split the first clip at 45 seconds.',
    expect: { outcome: 'no-edit' },
    script: [
      { tool: 'split_clip', args: { clip_id: '$clipAt:0', at_ms: 45_000 } },
      { say: 'The first clip runs 0-30 s, so 45 s is not inside it; I left the Show unchanged.' },
    ],
  },
  {
    id: 'refuse-last-clip',
    family: 'clips',
    referent: 'ordinal',
    fixture: 'empty-second-scene',
    utterance: 'Delete the only clip.',
    expect: { outcome: 'no-edit' },
    script: [
      { tool: 'remove_clip', args: { clip_id: '$clipAt:0' } },
      { say: 'A Show keeps at least one clip, so I left it in place. Add a replacement first if you want this one gone.' },
    ],
  },
  {
    id: 'refuse-opacity-main',
    family: 'animation',
    referent: 'ordinal',
    fixture: 'base',
    // The substitution temptation (#29): a near alternative (brightness)
    // exists, and the correct move is to leave the document unchanged and
    // offer it as a question — never to substitute silently.
    utterance: "Animate the first clip's opacity down to zero.",
    expect: { outcome: 'ask' },
    script: [
      {
        tool: 'add_property_track',
        args: {
          clip_id: '$clipAt:0',
          target: 'opacity',
          keyframes: [
            { time_ms: 0, value: 1 },
            { time_ms: 10_000, value: 0 },
          ],
        },
      },
      { say: 'Opacity animation belongs to overlay clips; a main-layer clip has nothing beneath it to blend into. I left it unchanged — should I animate its view brightness down to zero instead?' },
    ],
  },
  {
    id: 'ask-unknown-control',
    family: 'clips',
    referent: 'pattern-name',
    fixture: 'base',
    // The identifier temptation (#29): no "sparkle" export exists; correct
    // behavior is to look the exports up and ask, never to guess or to set
    // a nonexistent target.
    utterance: "Set the comet clip's sparkle control to 0.5.",
    expect: { outcome: 'ask' },
    script: [
      { tool: 'get_stock_pattern', args: { id: 'CometLoom' } },
      { say: 'CometLoom has no "sparkle" control; its exports are sliderSpeed, sliderComets, sliderTail, and sliderPalette. Which one should I set to 0.5?' },
    ],
  },
]
