// Provenance: pxlblz-v3 src/grammar/operations/timeline.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Timeline operation family: insert time, Show End, and markers. Insert time
// is planner-backed; marker operations use the canonical exact owner. All times
// are global timeline milliseconds.
import { z } from 'zod'
import {
  insertShowTime,
  planShowTimeInsertion,
  setShowEndMs,
  showTimelineContentEndMs,
} from '@/engine/showTimelineAuthoring'
import { showLoopDurationMs } from '@/engine/showModel'
import type { ShowGrammarOperation } from '../registry.js'
import { idFactory, planRefusal, refuse, replacedShow } from '../support.js'
import { descriptorOperation } from './descriptorAdapter.js'
import { SHOW_MARKER_COMMANDS, markerCommandOutcome } from '@/engine/showCommands/timeline'

const insertTime: ShowGrammarOperation = {
  name: 'insert_time',
  description:
    'Insert empty time at a global point: everything after the point (clips, markers, keyframes) shifts ' +
    'later, clips crossing the point are split, and the Show gets longer. Refused inside a Transition, a ' +
    'Group, or a multi-part clip, or where a non-linear property-animation segment crosses the point.',
  mutates: ['/scenes/*/durationMs', '/composition'],
  inputShape: {
    at_ms: z.number().describe('Global timeline point to insert at, in milliseconds'),
    duration_ms: z.number().describe('How much time to insert, in milliseconds (positive)'),
  },
  apply(document, args) {
    const atMs = args.at_ms as number
    const durationMs = args.duration_ms as number
    const plan = planShowTimeInsertion(document.show, atMs, durationMs)
    if (!plan.enabled) {
      return refuse(planRefusal(plan, `Cannot insert ${durationMs} ms at ${atMs} ms`))
    }
    const newId = idFactory(document)
    const newPlacementIdBySourceId = Object.fromEntries(
      plan.crossingPlacementIds.map((sourceId) => [sourceId, newId('clip')]),
    )
    const result = insertShowTime(document.show, { atMs, durationMs, newPlacementIdBySourceId })
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to insert ${durationMs} ms at ${atMs} ms.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'insert_time',
        targetId: `at-${Math.round(atMs)}`,
        description:
          `Inserted ${Math.round(durationMs)} ms at ${Math.round(atMs)} ms; the Show is now ` +
          `${showLoopDurationMs(result)} ms long` +
          `${plan.crossingPlacementIds.length > 0
            ? `, splitting ${plan.crossingPlacementIds.length} crossing clip(s)`
            : ''}.`,
        details: { splitClipIdsBySourceId: newPlacementIdBySourceId },
      }],
    }
  },
}

const setShowEnd: ShowGrammarOperation = {
  name: 'set_show_end',
  description:
    'Set the Show’s end (its deterministic loop boundary) to an absolute global time. The end never ' +
    'truncates authored content: it clamps to the last clip’s end if the requested time is earlier. ' +
    'Extending the end grows the final Scene with empty time.',
  mutates: ['/scenes/*/durationMs', '/composition/durationMs'],
  inputShape: {
    end_ms: z.number().describe('New absolute Show end on the global timeline, in milliseconds'),
  },
  apply(document, args) {
    const endMs = args.end_ms as number
    const currentMs = showLoopDurationMs(document.show)
    const contentEndMs = showTimelineContentEndMs(document.show)
    const result = setShowEndMs(document.show, endMs)
    if (result === document.show) {
      return refuse({
        code: 'no-change',
        message:
          !Number.isFinite(endMs)
            ? 'end_ms must be a finite time in milliseconds.'
            : `Show End is already ${currentMs} ms` +
              (endMs < contentEndMs
                ? ` (the requested ${Math.round(endMs)} ms clamps to the authored content end at ${contentEndMs} ms)`
                : '') + '.',
      })
    }
    const nextMs = showLoopDurationMs(result)
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'set_show_end',
        targetId: 'show-end',
        description:
          `Show End moved from ${currentMs} ms to ${nextMs} ms` +
          `${nextMs !== Math.max(1, Math.round(endMs))
            ? ` (clamped to the authored content end; ${Math.round(endMs)} ms was requested)`
            : ''}.`,
        before: { durationMs: currentMs },
        after: { durationMs: nextMs },
      }],
    }
  },
}

export const TIMELINE_OPERATIONS: ShowGrammarOperation[] = [
  insertTime,
  setShowEnd,
  ...SHOW_MARKER_COMMANDS.map(descriptor => descriptorOperation(descriptor, (document, args) => markerCommandOutcome(document.show, descriptor.name, args, () => idFactory(document)('marker')))),
]
