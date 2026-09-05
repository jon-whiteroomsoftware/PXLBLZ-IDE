// Provenance: pxlblz-v3 src/grammar/operations/structure.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Structural operation family: the output contract and Zone Layout
// occurrences (hard routing intervals on the timeline). Layout intervals wrap
// the vendored showLayoutIntervals functions, which refuse by identity when
// an interval boundary would cut a Transition window or a multi-part clip.
import { z } from 'zod'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '@/engine/showOutputContract'
import { setShowOutputTrails } from '@/engine/showOutputEffectAuthoring'
import {
  appendShowLayoutInterval,
  duplicateShowLayoutInterval,
  insertShowLayoutInterval,
  makeShowLayoutIntervalUnique,
  projectShowLayoutIntervals,
} from '@/engine/showLayoutIntervals'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import { refuse, replacedShow, type GrammarRefusal } from '../support.js'

function unknownLayout(document: ShowGrammarDocument, layoutId: string): GrammarIssue {
  return {
    code: 'unknown-layout',
    message:
      `No Zone Layout has id "${layoutId}". Known layouts: ${
        document.show.routingLayouts.map((layout) => `${layout.id} (${layout.name})`).join('; ')}.`,
    candidates: document.show.routingLayouts.map((layout) => layout.id),
  }
}

function resolveInterval(
  document: ShowGrammarDocument,
  intervalId: string,
): { ok: true; interval: ReturnType<typeof projectShowLayoutIntervals>[number] } | GrammarRefusal {
  const intervals = projectShowLayoutIntervals(document.show)
  const interval = intervals.find((candidate) => candidate.id === intervalId)
  if (!interval) {
    return refuse({
      code: 'unknown-interval',
      message:
        `No Zone Layout occurrence has id "${intervalId}". Occurrences: ${
          intervals
            .map((candidate) =>
              `${candidate.id} (${candidate.layoutName}, ${candidate.startMs}–${candidate.endMs} ms)`)
            .join('; ')}.`,
      candidates: intervals.map((candidate) => candidate.id),
    })
  }
  return { ok: true, interval }
}

const setOutputContract: ShowGrammarOperation = {
  name: 'set_output_contract',
  description:
    'Replace the Show’s output contract: portable-2d (a reference map id and reference pixel count; the ' +
    'Show adapts to any continuous 2D surface) or installation (a fixed output map id and pixel count). ' +
    'Switching to installation requires the routing layouts to cover the pixel count, or the result is ' +
    'refused by tier-0 validation.',
  mutates: ['/outputContract'],
  inputShape: {
    kind: z.enum(['portable-2d', 'installation']),
    map_id: z.string().nullable().optional()
      .describe('Reference map id (portable) or output map id (installation); null for none'),
    pixel_count: z.number().int().positive()
      .describe('Reference pixel count (portable) or fixed pixel count (installation)'),
  },
  apply(document, args) {
    const kind = args.kind as 'portable-2d' | 'installation'
    const mapId = (args.map_id as string | null | undefined) ?? null
    const pixelCount = args.pixel_count as number
    const contract = kind === 'portable-2d'
      ? createPortableShowOutputContract({ referenceMapId: mapId, referencePixelCount: pixelCount })
      : createInstallationShowOutputContract({ outputMapId: mapId, pixelCount })
    if (JSON.stringify(contract) === JSON.stringify(document.show.outputContract)) {
      return refuse({
        code: 'no-change',
        message: `The Show already has exactly this ${kind} output contract.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, { ...document.show, outputContract: contract }),
      changes: [{
        op: 'set_output_contract',
        targetId: 'output-contract',
        description:
          kind === 'portable-2d'
            ? `Output contract is now portable-2d (reference map ${contract.kind === 'portable-2d' ? contract.referenceMapId : mapId}, ${
                contract.kind === 'portable-2d' ? contract.referencePixelCount : pixelCount} px).`
            : `Output contract is now installation (${
                contract.kind === 'installation' ? contract.pixelCount : pixelCount} px, map ${mapId}).`,
        before: document.show.outputContract,
        after: contract,
      }],
    }
  },
}

const addLayoutInterval: ShowGrammarOperation = {
  name: 'add_layout_interval',
  description:
    'Add an empty Zone Layout occurrence of the given duration: at the end of the Show (omit at_ms) or ' +
    'inserted at a global time. Inserting inside held content splits it at that point; refused where the ' +
    'boundary would cut a Transition window or a multi-part clip.',
  mutates: ['/scenes', '/transitions', '/composition', '/updatedAt'],
  inputShape: {
    layout_id: z.string().describe('Zone Layout id the occurrence routes through'),
    duration_ms: z.number().positive().describe('Occurrence duration in milliseconds'),
    at_ms: z.number().optional().describe('Global insertion point; omit to append at the end of the Show'),
  },
  apply(document, args) {
    const layoutId = args.layout_id as string
    if (!document.show.routingLayouts.some((layout) => layout.id === layoutId)) {
      return refuse(unknownLayout(document, layoutId))
    }
    const durationMs = Math.round(args.duration_ms as number)
    const atMs = args.at_ms as number | undefined
    const result = atMs === undefined
      ? appendShowLayoutInterval(document.show, { layoutId, durationMs })
      : insertShowLayoutInterval(document.show, { layoutId, durationMs, atMs })
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message:
          `The engine declined to add a ${durationMs} ms occurrence of layout ${layoutId}` +
          `${atMs !== undefined ? ` at ${atMs} ms` : ''}. The insertion point may fall inside a ` +
          'Transition window or a multi-part clip.',
        remedy: 'Choose a point on a clip boundary, or append at the end by omitting at_ms.',
      })
    }
    const intervals = projectShowLayoutIntervals(result)
    const added = atMs === undefined
      ? intervals[intervals.length - 1]
      : intervals.find((candidate) => candidate.startMs === Math.round(atMs))
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'add_layout_interval',
        targetId: added?.id ?? layoutId,
        description:
          `Layout ${layoutId} occurrence added${atMs !== undefined ? ` at ${Math.round(atMs)} ms` : ' at the end of the Show'} ` +
          `for ${durationMs} ms.`,
        details: { intervalId: added?.id },
      }],
    }
  },
}

const duplicateLayoutInterval: ShowGrammarOperation = {
  name: 'duplicate_layout_interval',
  description:
    'Duplicate a Zone Layout occurrence immediately after itself: empty (default) or with its content ' +
    '(with_content true). Refused when a multi-part clip crosses the occurrence boundary.',
  mutates: ['/scenes', '/transitions', '/composition', '/updatedAt'],
  inputShape: {
    interval_id: z.string().describe('Layout occurrence id (from the engine’s interval projection)'),
    with_content: z.boolean().optional().describe('Copy the occurrence’s clips as well (default false)'),
  },
  apply(document, args) {
    const resolved = resolveInterval(document, args.interval_id as string)
    if (!resolved.ok) return resolved
    const result = duplicateShowLayoutInterval(document.show, resolved.interval.id, {
      withContent: Boolean(args.with_content),
    })
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message:
          `The engine declined to duplicate occurrence ${resolved.interval.id}; a multi-part clip may ` +
          'cross its boundary.',
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'duplicate_layout_interval',
        targetId: resolved.interval.id,
        description:
          `Layout occurrence ${resolved.interval.id} (${resolved.interval.layoutName}) duplicated after ` +
          `itself${args.with_content ? ' with its content' : ' empty'}.`,
      }],
    }
  },
}

const makeLayoutIntervalUnique: ShowGrammarOperation = {
  name: 'make_layout_interval_unique',
  description:
    'Give one Zone Layout occurrence its own copy of the layout and its Zones, so editing them no longer ' +
    'affects the other occurrences that shared the layout.',
  mutates: ['/routingLayouts', '/transitions', '/updatedAt'],
  inputShape: {
    interval_id: z.string().describe('Layout occurrence id (from the engine’s interval projection)'),
  },
  apply(document, args) {
    const resolved = resolveInterval(document, args.interval_id as string)
    if (!resolved.ok) return resolved
    const result = makeShowLayoutIntervalUnique(document.show, resolved.interval.id)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message:
          `The engine declined to make occurrence ${resolved.interval.id} unique; a multi-part clip may ` +
          'cross its boundary.',
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'make_layout_interval_unique',
        targetId: resolved.interval.id,
        description:
          `Layout occurrence ${resolved.interval.id} now uses its own copy of layout ` +
          `${resolved.interval.layoutName}.`,
      }],
    }
  },
}

const setOutputTrails: ShowGrammarOperation = {
  name: 'set_output_trails',
  description:
    'Enable, disable, or retune the Show\'s Trails output Effect: brighter linear-RGB pixels from the ' +
    'previous frame are retained at the given retention (0–1, clamped). Enabling without a retention ' +
    'keeps the current one, or the default when Trails was off. Refused when nothing would change.',
  mutates: ['/outputEffects', '/updatedAt'],
  inputShape: {
    enabled: z.boolean().describe('Whether Trails runs on the Show output'),
    retention: z.number().optional().describe('Retention in [0, 1]; values outside clamp'),
  },
  apply(document, args) {
    const result = setShowOutputTrails(document.show, {
      enabled: args.enabled as boolean,
      ...(args.retention !== undefined ? { retention: args.retention as number } : {}),
    })
    if (result === document.show) {
      return refuse({
        code: 'no-change',
        message: args.enabled
          ? 'Trails is already enabled at exactly this retention.'
          : 'Trails is already off.',
      })
    }
    const trails = result.outputEffects?.find((effect) => effect.kind === 'trails')
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'set_output_trails',
        targetId: 'trails',
        description: trails
          ? `Trails is on at retention ${trails.retention}.`
          : 'Trails is off.',
      }],
    }
  },
}

export const STRUCTURE_OPERATIONS: ShowGrammarOperation[] = [
  setOutputContract,
  setOutputTrails,
  addLayoutInterval,
  duplicateLayoutInterval,
  makeLayoutIntervalUnique,
]
