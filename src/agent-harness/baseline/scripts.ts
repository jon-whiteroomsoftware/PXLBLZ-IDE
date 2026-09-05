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

export const BASELINE_UTTERANCES: BaselineUtterance[] = [
  {
    utterance: 'make the first Clip twelve seconds',
    intent: 'The Clip starting at 0 ms becomes 12 000 ms long.',
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000, finish_turn_reply: 'The first Clip is twelve seconds.' } },
    ],
  },
  {
    utterance: 'make the first Clip twelve seconds and dim it to half',
    intent: 'One turn, two operations: the first Clip is 12 000 ms long at brightness 0.5, committed as one change set.',
    script: [
      { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000 } },
      { tool: 'set_clip_view', args: { clip_id: '$clipAt:0', brightness: 0.5, finish_turn_reply: 'The first Clip is twelve seconds at half brightness.' } },
    ],
  },
  {
    utterance: 'add a marker at ten seconds called Drop',
    intent: 'A Marker named Drop appears at 10 000 ms; nothing else changes.',
    script: [
      { tool: 'add_marker', args: { at_ms: 10_000, name: 'Drop', finish_turn_reply: 'Added the Drop marker at ten seconds.' } },
    ],
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
