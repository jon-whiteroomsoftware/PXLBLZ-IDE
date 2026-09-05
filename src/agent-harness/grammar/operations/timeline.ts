// Provenance: pxlblz-v3 src/grammar/operations/timeline.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Timeline operation family: insert time, Show End, and markers. Insert time
// is planner-backed; the marker operations pre-check unknown ids. All times
// are global timeline milliseconds.
import { z } from 'zod'
import {
  addShowTimelineMarker,
  insertShowTime,
  moveShowTimelineMarker,
  planShowTimeInsertion,
  removeShowTimelineMarker,
  setShowEndMs,
  showTimelineContentEndMs,
  updateShowTimelineMarker,
} from '@/engine/showTimelineAuthoring'
import { showLoopDurationMs } from '@/engine/showModel'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import { compositionOf, idFactory, planRefusal, refuse, replacedShow } from '../support.js'

function unknownMarker(document: ShowGrammarDocument, markerId: string): GrammarIssue {
  const markers = compositionOf(document).markers ?? []
  return {
    code: 'unknown-marker',
    message:
      markers.length === 0
        ? `No markers exist yet; add one with add_marker.`
        : `No marker has id "${markerId}". Known markers: ${
            markers.map((marker) => `${marker.id} (${marker.name ?? 'unnamed'} at ${marker.timeMs} ms)`).join('; ')}.`,
    candidates: markers.map((marker) => marker.id),
  }
}

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

const addMarker: ShowGrammarOperation = {
  name: 'add_marker',
  description:
    'Add a named marker at a global time on the timeline. Markers are navigation aids; they do not ' +
    'affect playback.',
  mutates: ['/composition/markers'],
  inputShape: {
    at_ms: z.number().describe('Global timeline time in milliseconds'),
    name: z.string().optional().describe('Marker label'),
    color: z.string().optional().describe('Marker color (CSS color string)'),
  },
  apply(document, args) {
    const atMs = args.at_ms as number
    if (!Number.isFinite(atMs) || atMs < 0) {
      return refuse({ code: 'invalid-argument', message: 'at_ms must be a non-negative time in milliseconds.' })
    }
    const marker = {
      id: idFactory(document)('marker'),
      timeMs: atMs,
      ...(args.name !== undefined ? { name: args.name as string } : {}),
      ...(args.color !== undefined ? { color: args.color as string } : {}),
    }
    const result = addShowTimelineMarker(document.show, marker)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to add a marker at ${atMs} ms.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'add_marker',
        targetId: marker.id,
        description: `Marker ${marker.id}${marker.name ? ` ("${marker.name}")` : ''} added at ${Math.round(atMs)} ms.`,
      }],
    }
  },
}

const moveMarker: ShowGrammarOperation = {
  name: 'move_marker',
  description: 'Move one timeline marker to a new global time, given in milliseconds.',
  mutates: ['/composition/markers/*/timeMs'],
  inputShape: {
    marker_id: z.string().describe('Marker id'),
    at_ms: z.number().describe('New global timeline time in milliseconds'),
  },
  apply(document, args) {
    const markerId = args.marker_id as string
    if (!(compositionOf(document).markers ?? []).some((marker) => marker.id === markerId)) {
      return refuse(unknownMarker(document, markerId))
    }
    const result = moveShowTimelineMarker(document.show, markerId, args.at_ms as number)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to move marker ${markerId} to ${args.at_ms} ms.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'move_marker',
        targetId: markerId,
        description: `Marker ${markerId} moved to ${Math.round(args.at_ms as number)} ms.`,
      }],
    }
  },
}

const updateMarker: ShowGrammarOperation = {
  name: 'update_marker',
  description: 'Change one marker’s name, color, or time. Give at least one field.',
  mutates: ['/composition/markers/*'],
  inputShape: {
    marker_id: z.string().describe('Marker id'),
    name: z.string().optional(),
    color: z.string().optional(),
    at_ms: z.number().optional().describe('New global timeline time in milliseconds'),
  },
  apply(document, args) {
    const markerId = args.marker_id as string
    if (!(compositionOf(document).markers ?? []).some((marker) => marker.id === markerId)) {
      return refuse(unknownMarker(document, markerId))
    }
    const patch: Record<string, unknown> = {}
    if (args.name !== undefined) patch.name = args.name
    if (args.color !== undefined) patch.color = args.color
    if (args.at_ms !== undefined) patch.timeMs = args.at_ms
    if (Object.keys(patch).length === 0) {
      return refuse({ code: 'invalid-argument', message: 'Give at least one of name, color, or at_ms.' })
    }
    const result = updateShowTimelineMarker(document.show, markerId, patch)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to update marker ${markerId}.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'update_marker',
        targetId: markerId,
        description: `Marker ${markerId} updated: ${
          Object.entries(patch).map(([key, value]) => `${key} ${JSON.stringify(value)}`).join(', ')}.`,
      }],
    }
  },
}

const removeMarker: ShowGrammarOperation = {
  name: 'remove_marker',
  description: 'Remove one timeline marker by its id; the timeline itself is unaffected.',
  mutates: ['/composition/markers'],
  inputShape: {
    marker_id: z.string().describe('Marker id'),
  },
  apply(document, args) {
    const markerId = args.marker_id as string
    if (!(compositionOf(document).markers ?? []).some((marker) => marker.id === markerId)) {
      return refuse(unknownMarker(document, markerId))
    }
    const result = removeShowTimelineMarker(document.show, markerId)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to remove marker ${markerId}.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'remove_marker',
        targetId: markerId,
        description: `Marker ${markerId} removed.`,
      }],
    }
  },
}

export const TIMELINE_OPERATIONS: ShowGrammarOperation[] = [
  insertTime,
  setShowEnd,
  addMarker,
  moveMarker,
  updateMarker,
  removeMarker,
]
