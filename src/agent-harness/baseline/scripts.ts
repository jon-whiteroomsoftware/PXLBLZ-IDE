// Utterances the scripted bridge understands without a per-request script
// (#945 browser baseline). The chat overlay sends only what the author
// typed, exactly as it does to a live model; in scripted mode the bridge
// resolves that utterance here, then in the dictation corpus, and runs the
// matching script through the same MCP tool path. Placeholders resolve
// against the Show the editor sent, so each script names its target by
// timeline position rather than by id.
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
  {
    utterance: 'swap the two plain Clips through a private overlap',
    intent: '#949: one retained pair overlaps privately, then resolves before one complete candidate.',
    script: [
      { tool: 'move_clip', args: { clip_id: 'resize-a', start_ms: 8000 } },
      { tool: 'move_clip', args: { clip_id: 'resize-b', start_ms: 0, finish_turn_reply: { intent: 'apply', reply: 'Swapped the two Clips.' } } },
    ],
  },
  {
    utterance: 'leave the private overlap incomplete',
    intent: '#949: no private intermediate is published.',
    script: [
      { tool: 'move_clip', args: { clip_id: 'resize-a', start_ms: 8000 } },
      { say: 'The private edit is incomplete.', intent: 'incomplete' },
    ],
  },
  {
    utterance: 'move the second Clip to sixteen seconds then make the first Clip twelve seconds',
    intent: '#950: move B then resize A, with both intermediate records valid.',
    script: [
      { tool: 'move_clip', args: { clip_id: '$clipAt:8000', start_ms: 16000 } },
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12000, finish_turn_reply: { intent: 'apply', reply: 'Moved the second Clip to sixteen seconds and resized the first to twelve seconds.' } } },
    ],
  },
  {
    utterance: 'move the second Clip to sixteen seconds then try seventeen seconds for the first',
    intent: '#950: refused resize must not publish the earlier private move.',
    script: [
      { tool: 'move_clip', args: { clip_id: '$clipAt:8000', start_ms: 16000 } },
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 17000 } },
      { say: 'The first Clip cannot reach seventeen seconds. Neither edit was applied.', intent: 'refuse' },
    ],
  },
  {
    utterance: 'move the second Clip to sixteen seconds but leave the batch incomplete',
    intent: '#950: incomplete typed completion must not publish a private move.',
    script: [
      { tool: 'move_clip', args: { clip_id: '$clipAt:8000', start_ms: 16000 } },
      { say: 'The batch is incomplete. No edit was applied.', intent: 'incomplete' },
    ],
  },
  {
    utterance: 'try twelve seconds with the next Clip at eight',
    intent: '#950 fixture R: report the exact capacity refusal without authoring a candidate.',
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12000 } },
      { say: 'The requested twelve seconds do not fit. Available range: 0–8000 ms.', intent: 'refuse' },
    ],
  },
  {
    utterance: 'make the first Clip exactly eight seconds',
    intent: '#950 fixture R: the exact neighbor boundary is accepted; repetition is a valid no-op.',
    script: [{ tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 8000, finish_turn_reply: { intent: 'apply', reply: 'The first Clip is exactly eight seconds.' } } }],
  },
  BASELINE_FIXTURE_RESIZE,
  {
    utterance: 'make the first Clip twelve seconds and dim it to half',
    intent: 'One turn, two operations: the first Clip is 12 000 ms long at brightness 0.5, committed as one change set.',
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000 } },
      { tool: 'set_clip_view', args: { clip_id: '$clipAt:0', brightness: 0.5, finish_turn_reply: { intent: 'apply', reply: 'The first Clip is twelve seconds at half brightness.' } } },
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
    utterance: 'move the connected second Clip five seconds later then two seconds earlier',
    intent: '#951: exact canonical chain move in both directions.',
    script: [
      { tool: 'move_clip', args: { clip_id: 'resize-b', start_ms: 8000 } },
      { tool: 'move_clip', args: { clip_id: 'resize-b', start_ms: 6000, finish_turn_reply: { intent: 'apply', reply: 'Moved the connected Clips three seconds later.' } } },
    ],
  },
  {
    utterance: 'keep the connected second Clip at six seconds',
    intent: '#951: validated no-op produces no candidate.',
    script: [{ tool: 'move_clip', args: { clip_id: 'resize-b', start_ms: 6000, finish_turn_reply: { intent: 'apply', reply: 'The Clip is already at six seconds.' } } }],
  },
  {
    utterance: 'move the connected second Clip to overlay zero',
    intent: '#951: incompatible connected destination refuses without detachment.',
    script: [
      { tool: 'move_clip', args: { clip_id: 'resize-b', start_ms: 6000, layer: 0 } },
      { say: 'The connected Clip cannot change Layer without an explicit disconnect.', intent: 'refuse' },
    ],
  },
  {
    utterance: 'add a topmost overlay Layer',
    intent: '#951: one fresh Layer in every Scene, adopted once.',
    script: [{ tool: 'add_overlay_layer', args: { zone_id: 'zone-1', finish_turn_reply: { intent: 'apply', reply: 'Added a topmost Layer.' } } }],
  },
  {
    utterance: 'add move and update the marker',
    intent: '#951: marker batch adopts once.',
    script: [
      { tool: 'add_marker', args: { at_ms: 1000, name: 'New', color: '#f59e0b' } },
      { tool: 'move_marker', args: { marker_id: 'marker-2', at_ms: 70000 } },
      { tool: 'update_marker', args: { marker_id: 'marker-2', at_ms: 9000, name: 'Final', color: '#38bdf8', finish_turn_reply: { intent: 'apply', reply: 'Added, moved and updated the marker.' } } },
    ],
  },
  {
    utterance: 'keep the final marker unchanged',
    intent: '#951: wholly no-op marker batch does not adopt.',
    script: [
      { tool: 'move_marker', args: { marker_id: 'marker-2', at_ms: 9000 } },
      { tool: 'update_marker', args: { marker_id: 'marker-2', name: 'Final', color: '#38bdf8', finish_turn_reply: { intent: 'apply', reply: 'The marker is already correct.' } } },
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
    script: [{ tool: 'remove_marker', args: { marker_id: 'marker-2', finish_turn_reply: { intent: 'apply', reply: 'Removed the marker.' } } }],
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
