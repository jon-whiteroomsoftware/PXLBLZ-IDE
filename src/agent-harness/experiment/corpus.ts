// Provenance: pxlblz-v3 src/experiment/corpus.ts at 9ecd481f, re-authored onto the
// version-2 vocabulary for #1039 (see src/agent-harness/PROVENANCE.md).
// Corpus format for the dictation experiment: each case is a starting Show (a
// named fixture plus setup operations), an editor context, an utterance, the
// expected outcome, and executable assertions over the resulting document. The
// zod schema below is the format's contract; the loader refuses a corpus whose
// cases do not validate or whose starting Shows fail to open.
//
// Every assertion addresses v2 entities: Clips, Layers, Transitions between two
// named Clips, global Property tracks and held appearance keys. Nothing here
// names a Scene, an overlay index or a Scene-local time.
import { z } from 'zod'
import type { ShowClipV2, ShowRecordV2 } from '@/engine/showCompositionV2'
import { evaluateShowPropertyTrackV2 } from '@/engine/showPropertyAnimationV2'
import { openShowDocument, projectClipListing } from '../grammar/openShow.js'
import { describeShow } from '../grammar/read.js'
import { describeTarget, trackSites } from '../grammar/support.js'
import type { ShowGrammarDocument } from '../grammar/types.js'

export const REFERENT_SOURCES = [
  'direct', 'hover', 'selection', 'ordinal', 'time', 'pattern-name', 'none',
] as const

export const OPERATION_FAMILIES = [
  'clips', 'layers', 'show', 'animation', 'transitions', 'layouts', 'markers',
  'effects', 'groups', 'generic',
] as const

const clipLocatorSchema = z.object({
  start_ms: z.number().optional(),
  pattern_name: z.string().optional(),
  /** The Zone-owned Layer's authored name; v2 has no overlay index. */
  layer_name: z.string().optional(),
})

type ClipLocator = z.infer<typeof clipLocatorSchema>

const assertionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clip-count'), count: z.number().int() }),
  z.object({ kind: z.literal('clip-duration'), clip: clipLocatorSchema, duration_ms: z.number() }),
  z.object({ kind: z.literal('clip-start'), clip: clipLocatorSchema, start_ms: z.number() }),
  z.object({ kind: z.literal('clip-layer'), clip: clipLocatorSchema, layer_name: z.string() }),
  z.object({ kind: z.literal('clip-entry-policy'), clip: clipLocatorSchema, policy: z.enum(['continue', 'restart']) }),
  z.object({
    kind: z.literal('track-keyframes'),
    clip: clipLocatorSchema,
    target_contains: z.string(),
    times_ms: z.array(z.number()).optional(),
    values: z.array(z.number()).optional(),
  }),
  z.object({
    kind: z.literal('track-value-at'),
    clip: clipLocatorSchema,
    target_contains: z.string(),
    /** Global milliseconds; a track has effect only inside its activation. */
    at_ms: z.number(),
    value: z.number(),
    tolerance: z.number().optional(),
  }),
  z.object({
    kind: z.literal('junction'),
    /** The junction whose outgoing Clip this locates. */
    clip: clipLocatorSchema,
    scope: z.enum(['layer', 'whole-output', 'derived-cut']),
    junction_kind: z.string().optional(),
    duration_ms: z.number().optional(),
  }),
  z.object({
    kind: z.literal('transition-count'),
    count: z.number().int(),
    duration_ms: z.number().optional(),
  }),
  z.object({
    kind: z.literal('effect'),
    clip: clipLocatorSchema,
    effect_kind: z.string(),
    parameter: z.string().optional(),
    value: z.number().optional(),
  }),
  z.object({ kind: z.literal('marker'), time_ms: z.number(), name: z.string().optional() }),
  z.object({ kind: z.literal('show-end'), duration_ms: z.number() }),
  z.object({ kind: z.literal('pointer-equals'), pointer: z.string(), value: z.unknown() }),
  z.object({ kind: z.literal('instance-time-scale'), clip: clipLocatorSchema, value: z.number() }),
  z.object({
    kind: z.literal('instance-control'),
    clip: clipLocatorSchema,
    export_name: z.string(),
    value: z.number(),
  }),
  z.object({ kind: z.literal('no-track'), clip: clipLocatorSchema, target_contains: z.string() }),
  z.object({ kind: z.literal('no-effect'), clip: clipLocatorSchema, effect_kind: z.string() }),
])

export type CorpusAssertion = z.infer<typeof assertionSchema>

const contextSchema = z.object({
  hovered_clip_at_ms: z.number().optional()
    .describe('Resolved to the Clip id at this start time when the case loads'),
  selected_clip_at_ms: z.array(z.number()).optional(),
  playhead_ms: z.number().optional(),
  active_zone_id: z.string().optional(),
})

const scriptStepSchema = z.union([
  z.object({ tool: z.string(), args: z.record(z.unknown()) }),
  z.object({ say: z.string(), intent: z.enum(['apply', 'ask', 'refuse', 'incomplete']) }),
])

export type ScriptStep = z.infer<typeof scriptStepSchema>

export const FIXTURE_NAMES = ['base', 'empty-tail', 'overlay', 'boundary-crossfade', 'four-clips'] as const
export type FixtureName = (typeof FIXTURE_NAMES)[number]

export const caseSchema = z.object({
  id: z.string(),
  family: z.enum(OPERATION_FAMILIES),
  referent: z.enum(REFERENT_SOURCES),
  fixture: z.enum(FIXTURE_NAMES),
  setup: z.array(z.object({ operation: z.string(), args: z.record(z.unknown()) })).optional(),
  context: contextSchema.optional(),
  utterance: z.string(),
  expect: z.object({
    /** no-edit accepts ask or refuse; the document must be unchanged. */
    outcome: z.enum(['edit', 'ask', 'refuse', 'no-edit']),
    max_transactions: z.number().int().min(1).optional(),
    assertions: z.array(assertionSchema).optional(),
  }),
  /** The intended solution, executed verbatim by the scripted fake agent. */
  script: z.array(scriptStepSchema),
  /**
   * Later turns of the same conversation (seeded from live bridge sessions):
   * each runs as a fresh agent turn carrying the dialogue history, exactly as
   * the bridge does. `expect` covers the whole conversation — the outcome
   * classifies the final turn, assertions run on the final document, and
   * committing an edit before the final turn fails as premature.
   */
  followups: z.array(z.object({
    utterance: z.string(),
    script: z.array(scriptStepSchema),
  })).optional(),
})

export type DictationCase = z.infer<typeof caseSchema>

function documentOf(show: ShowRecordV2): ShowGrammarDocument {
  return { show, inlinePatterns: [], options: {} }
}

function locateClip(show: ShowRecordV2, locator: ClipLocator) {
  return projectClipListing(documentOf(show)).clips.find((clip) =>
    (locator.start_ms === undefined || clip.startMs === locator.start_ms) &&
    (locator.pattern_name === undefined ||
      clip.patternName.toLowerCase().includes(locator.pattern_name.toLowerCase())) &&
    (locator.layer_name === undefined ||
      clip.layerName.toLowerCase() === locator.layer_name.toLowerCase()))
}

/** The Clip record behind a listing entry, for held-appearance assertions. */
function clipRecord(show: ShowRecordV2, clipId: string): ShowClipV2 | undefined {
  return show.composition.clips.find((clip) => clip.id === clipId)
}

export interface AssertionResult {
  assertion: CorpusAssertion
  passed: boolean
  detail: string
}

/** Evaluate one assertion against the final exported document. */
export function evaluateAssertion(show: ShowRecordV2, assertion: CorpusAssertion): AssertionResult {
  const document = documentOf(show)
  const fail = (detail: string) => ({ assertion, passed: false, detail })
  const pass = (detail: string) => ({ assertion, passed: true, detail })

  switch (assertion.kind) {
    case 'clip-count': {
      const count = projectClipListing(document).clips.length
      return count === assertion.count
        ? pass(`${count} Clips`)
        : fail(`expected ${assertion.count} Clips, found ${count}`)
    }
    case 'clip-duration': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      return clip.durationMs === assertion.duration_ms
        ? pass(`Clip ${clip.clipId} is ${clip.durationMs} ms`)
        : fail(`Clip ${clip.clipId} is ${clip.durationMs} ms, expected ${assertion.duration_ms}`)
    }
    case 'clip-start': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      return clip.startMs === assertion.start_ms
        ? pass(`Clip ${clip.clipId} starts at ${clip.startMs} ms`)
        : fail(`Clip ${clip.clipId} starts at ${clip.startMs} ms, expected ${assertion.start_ms}`)
    }
    case 'clip-layer': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      return clip.layerName === assertion.layer_name
        ? pass(`Clip ${clip.clipId} is on Layer ${clip.layerName}`)
        : fail(`Clip ${clip.clipId} is on Layer ${clip.layerName}, expected ${assertion.layer_name}`)
    }
    case 'clip-entry-policy': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      return clip.entryPolicy === assertion.policy
        ? pass(`Clip ${clip.clipId} enters with ${clip.entryPolicy}`)
        : fail(`Clip ${clip.clipId} enters with ${clip.entryPolicy}, expected ${assertion.policy}`)
    }
    case 'track-keyframes':
    case 'track-value-at': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      const needle = assertion.target_contains.toLowerCase()
      const site = trackSites(document).find((candidate) => {
        const target = candidate.track.target
        const owns = ('clipId' in target && target.clipId === clip.clipId)
          || ('instanceId' in target && target.instanceId === clip.instanceId)
        return owns && describeTarget(candidate.track.target).toLowerCase().includes(needle)
      })
      if (!site) return fail(`Clip ${clip.clipId} has no track targeting "${assertion.target_contains}"`)
      const { track } = site
      if (assertion.kind === 'track-value-at') {
        const value = evaluateShowPropertyTrackV2(track, assertion.at_ms)
        if (value === undefined) {
          return fail(`track ${track.id} is inactive at ${assertion.at_ms} ms ` +
            `(active ${track.activeStartMs}–${track.activeStartMs + track.activeDurationMs} ms)`)
        }
        const tolerance = assertion.tolerance ?? 0.001
        return Math.abs(value - assertion.value) <= tolerance
          ? pass(`value ${value} at ${assertion.at_ms} ms`)
          : fail(`value ${value} at ${assertion.at_ms} ms, expected ${assertion.value}`)
      }
      const times = track.keyframes.map((keyframe) => keyframe.timeMs)
      const values = track.keyframes.map((keyframe) => keyframe.value)
      if (assertion.times_ms && JSON.stringify(times) !== JSON.stringify(assertion.times_ms)) {
        return fail(`keyframe times ${times.join(',')} expected ${assertion.times_ms.join(',')}`)
      }
      if (assertion.values && JSON.stringify(values) !== JSON.stringify(assertion.values)) {
        return fail(`keyframe values ${values.join(',')} expected ${assertion.values.join(',')}`)
      }
      return pass(`track ${track.id}: times ${times.join(',')}`)
    }
    case 'junction': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      const junction = describeShow(document).zones
        .flatMap((zone) => zone.layers)
        .flatMap((layer) => layer.junctions)
        .find((candidate) => candidate.fromClipId === clip.clipId)
      if (!junction) return fail(`no junction follows Clip ${clip.clipId}`)
      if (junction.scope !== assertion.scope) {
        return fail(`junction after ${clip.clipId} is ${junction.scope}, expected ${assertion.scope}`)
      }
      if (assertion.junction_kind !== undefined && junction.kind !== assertion.junction_kind) {
        return fail(`junction after ${clip.clipId} is ${junction.kind}, expected ${assertion.junction_kind}`)
      }
      if (assertion.duration_ms !== undefined && junction.durationMs !== assertion.duration_ms) {
        return fail(`junction after ${clip.clipId} is ${junction.durationMs} ms, expected ${assertion.duration_ms}`)
      }
      return pass(`junction after ${clip.clipId} is ${junction.scope} ${junction.kind}`)
    }
    case 'transition-count': {
      const transitions = show.composition.transitions
      if (transitions.length !== assertion.count) {
        return fail(`${transitions.length} Transitions, expected ${assertion.count}`)
      }
      if (assertion.duration_ms !== undefined &&
          !transitions.some((candidate) => candidate.durationMs === assertion.duration_ms)) {
        return fail(`no Transition of ${assertion.duration_ms} ms`)
      }
      return pass(`${transitions.length} Transitions`)
    }
    case 'effect':
    case 'no-effect': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      const record = clipRecord(show, clip.clipId)
      const effects = record?.appearance.keys.flatMap((key) => key.value.effects ?? []) ?? []
      const effect = effects.find((candidate) => candidate.kind === assertion.effect_kind)
      if (assertion.kind === 'no-effect') {
        return effect
          ? fail(`Clip ${clip.clipId} still has a ${assertion.effect_kind} Effect`)
          : pass(`Clip ${clip.clipId} has no ${assertion.effect_kind} Effect`)
      }
      if (!effect) return fail(`Clip ${clip.clipId} has no ${assertion.effect_kind} Effect`)
      if (assertion.parameter !== undefined) {
        const value = (effect as unknown as Record<string, unknown>)[assertion.parameter]
        if (value !== assertion.value) {
          return fail(`${assertion.effect_kind}.${assertion.parameter} is ${String(value)}, expected ${String(assertion.value)}`)
        }
      }
      return pass(`Clip ${clip.clipId} carries ${assertion.effect_kind}`)
    }
    case 'marker': {
      const marker = show.composition.markers.find((candidate) => candidate.timeMs === assertion.time_ms)
      if (!marker) return fail(`no Marker at ${assertion.time_ms} ms`)
      if (assertion.name !== undefined && marker.name !== assertion.name) {
        return fail(`Marker at ${assertion.time_ms} ms is named "${marker.name}", expected "${assertion.name}"`)
      }
      return pass(`Marker at ${assertion.time_ms} ms`)
    }
    case 'show-end': {
      const showEndMs = show.composition.showEndMs
      return showEndMs === assertion.duration_ms
        ? pass(`Show End at ${showEndMs} ms`)
        : fail(`Show End at ${showEndMs} ms, expected ${assertion.duration_ms}`)
    }
    case 'instance-time-scale':
    case 'instance-control': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      const instance = show.composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)
      if (!instance) return fail(`instance ${clip.instanceId} not found`)
      if (assertion.kind === 'instance-time-scale') {
        return instance.time.timeScale === assertion.value
          ? pass(`time scale ${instance.time.timeScale}`)
          : fail(`time scale ${instance.time.timeScale}, expected ${assertion.value}`)
      }
      const control = instance.controlTargets?.[assertion.export_name]
      return control === assertion.value
        ? pass(`control ${assertion.export_name} = ${control}`)
        : fail(`control ${assertion.export_name} is ${String(control)}, expected ${assertion.value}`)
    }
    case 'no-track': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no Clip matches ${JSON.stringify(assertion.clip)}`)
      const needle = assertion.target_contains.toLowerCase()
      const site = trackSites(document).find((candidate) => {
        const target = candidate.track.target
        const owns = ('clipId' in target && target.clipId === clip.clipId)
          || ('instanceId' in target && target.instanceId === clip.instanceId)
        return owns && describeTarget(candidate.track.target).toLowerCase().includes(needle)
      })
      return site
        ? fail(`Clip ${clip.clipId} still has track ${site.track.id}`)
        : pass(`Clip ${clip.clipId} has no "${assertion.target_contains}" track`)
    }
    case 'pointer-equals': {
      let node: unknown = show
      for (const segment of assertion.pointer.split('/').slice(1)) {
        if (node === null || typeof node !== 'object') return fail(`pointer ${assertion.pointer} does not resolve`)
        node = (node as Record<string, unknown>)[segment]
      }
      return JSON.stringify(node) === JSON.stringify(assertion.value)
        ? pass(`${assertion.pointer} equals the expected value`)
        : fail(`${assertion.pointer} is ${JSON.stringify(node)}, expected ${JSON.stringify(assertion.value)}`)
    }
  }
}

/** Load-time validation: schema, unique ids, and an openable starting Show. */
export function validateCorpus(
  cases: DictationCase[],
  fixtureOf: (name: FixtureName) => ShowRecordV2,
): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const candidate of cases) {
    const parsed = caseSchema.safeParse(candidate)
    if (!parsed.success) {
      problems.push(`${candidate.id ?? '<unnamed>'}: ${parsed.error.issues[0]?.message}`)
      continue
    }
    if (ids.has(candidate.id)) problems.push(`${candidate.id}: duplicate case id`)
    ids.add(candidate.id)
    const opened = openShowDocument(fixtureOf(candidate.fixture))
    if (!opened.ok) problems.push(`${candidate.id}: fixture does not open (${opened.issues[0]?.message})`)
  }
  return problems
}
