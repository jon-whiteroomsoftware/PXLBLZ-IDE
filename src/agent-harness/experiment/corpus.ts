// Provenance: pxlblz-v3 src/experiment/corpus.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Corpus format for the dictation experiment (#23): each case is a starting
// Show (a named fixture plus setup operations), an editor context, an
// utterance, the expected outcome, and executable assertions over the
// resulting document. The zod schema below is the format's contract; the
// loader refuses a corpus whose cases do not validate or whose starting
// Shows fail to open.
import { z } from 'zod'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { evaluateShowPropertyTrack } from '@/engine/showPropertyAnimation'
import { showLoopDurationMs } from '@/engine/showModel'
import { openShowDocument, projectClipListing } from '../grammar/openShow.js'
import { describeShow } from '../grammar/read.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'

export const REFERENT_SOURCES = [
  'direct', 'hover', 'selection', 'ordinal', 'time', 'pattern-name', 'none',
] as const

export const OPERATION_FAMILIES = [
  'clips', 'timeline', 'animation', 'junctions', 'layer-transitions',
  'effects', 'structure', 'generic',
] as const

const clipLocatorSchema = z.object({
  start_ms: z.number().optional(),
  pattern_name: z.string().optional(),
  layer_kind: z.enum(['main', 'overlay']).optional(),
})

const assertionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clip-count'), count: z.number().int() }),
  z.object({ kind: z.literal('clip-duration'), clip: clipLocatorSchema, duration_ms: z.number() }),
  z.object({ kind: z.literal('clip-start'), clip: clipLocatorSchema, start_ms: z.number() }),
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
    at_local_ms: z.number(),
    value: z.number(),
    tolerance: z.number().optional(),
  }),
  z.object({ kind: z.literal('junction-kind'), after_scene_id: z.string(), junction_kind: z.string() }),
  z.object({
    kind: z.literal('layer-transition'),
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
    .describe('Resolved to the clip id at this start time when the case loads'),
  selected_clip_at_ms: z.array(z.number()).optional(),
  playhead_ms: z.number().optional(),
  active_zone_id: z.string().optional(),
})

const scriptStepSchema = z.union([
  z.object({ tool: z.string(), args: z.record(z.unknown()) }),
  z.object({ say: z.string() }),
])

export type ScriptStep = z.infer<typeof scriptStepSchema>

export const caseSchema = z.object({
  id: z.string(),
  family: z.enum(OPERATION_FAMILIES),
  referent: z.enum(REFERENT_SOURCES),
  fixture: z.enum(['base', 'empty-second-scene', 'overlay', 'boundary-crossfade', 'four-clips']),
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
   * Later turns of the same conversation (seeded from live bridge
   * sessions): each runs as a fresh agent turn carrying the dialogue
   * history, exactly as the bridge does. `expect` covers the whole
   * conversation - the outcome classifies the final turn, assertions run
   * on the final document, and committing an edit before the final turn
   * fails as premature.
   */
  followups: z.array(z.object({
    utterance: z.string(),
    script: z.array(scriptStepSchema),
  })).optional(),
})

export type DictationCase = z.infer<typeof caseSchema>

/** Assertions accept a flat record too; it normalizes like open_show. */
function normalizedDocument(show: ShowRecord): ShowGrammarDocument {
  if (show.composition) return { show, inlinePatterns: [], options: {} }
  const opened = openShowDocument(show)
  if (!opened.ok) throw new Error(`assertion target does not open: ${opened.issues[0]?.message}`)
  return opened.document
}

function locateClip(show: ShowRecord, locator: z.infer<typeof clipLocatorSchema>) {
  const document = normalizedDocument(show)
  const clips = projectClipListing(document).clips.filter((clip) =>
    (locator.start_ms === undefined || clip.startMs === locator.start_ms) &&
    (locator.pattern_name === undefined ||
      clip.patternName.toLowerCase().includes(locator.pattern_name.toLowerCase())) &&
    (locator.layer_kind === undefined || clip.layer.kind === locator.layer_kind))
  return clips[0]
}

export interface AssertionResult {
  assertion: CorpusAssertion
  passed: boolean
  detail: string
}

/** Evaluate one assertion against the final exported document. */
export function evaluateAssertion(show: ShowRecord, assertion: CorpusAssertion): AssertionResult {
  const document = normalizedDocument(show)
  const fail = (detail: string) => ({ assertion, passed: false, detail })
  const pass = (detail: string) => ({ assertion, passed: true, detail })
  const composition = document.show.composition as ShowCompositionV1 | undefined

  switch (assertion.kind) {
    case 'clip-count': {
      const count = projectClipListing(document).clips.length
      return count === assertion.count
        ? pass(`${count} clips`)
        : fail(`expected ${assertion.count} clips, found ${count}`)
    }
    case 'clip-duration': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no clip matches ${JSON.stringify(assertion.clip)}`)
      return clip.durationMs === assertion.duration_ms
        ? pass(`clip ${clip.clipId} is ${clip.durationMs} ms`)
        : fail(`clip ${clip.clipId} is ${clip.durationMs} ms, expected ${assertion.duration_ms}`)
    }
    case 'clip-start': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no clip matches ${JSON.stringify(assertion.clip)}`)
      return clip.startMs === assertion.start_ms
        ? pass(`clip ${clip.clipId} starts at ${clip.startMs} ms`)
        : fail(`clip ${clip.clipId} starts at ${clip.startMs} ms, expected ${assertion.start_ms}`)
    }
    case 'track-keyframes':
    case 'track-value-at': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no clip matches ${JSON.stringify(assertion.clip)}`)
      const description = describeShow(document)
      const described = description.zones
        .flatMap((zone) => zone.layers)
        .flatMap((layer) => layer.clips)
        .find((candidate) => candidate.clipId === clip.clipId)
      const trackInfo = described?.tracks.find((track) =>
        track.target.toLowerCase().includes(assertion.target_contains.toLowerCase()))
      if (!trackInfo) {
        return fail(`clip ${clip.clipId} has no track targeting "${assertion.target_contains}"`)
      }
      const track = composition?.scenes
        .flatMap((scene) => scene.propertyTracks ?? [])
        .find((candidate) => candidate.id === trackInfo.trackId)
      if (!track) return fail(`track ${trackInfo.trackId} not found in the composition`)
      if (assertion.kind === 'track-value-at') {
        const value = evaluateShowPropertyTrack(track, assertion.at_local_ms)
        const tolerance = assertion.tolerance ?? 0.001
        return Math.abs(value - assertion.value) <= tolerance
          ? pass(`value ${value} at ${assertion.at_local_ms} ms`)
          : fail(`value ${value} at ${assertion.at_local_ms} ms, expected ${assertion.value}`)
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
    case 'junction-kind': {
      const transition = show.transitions?.find(
        (candidate) => candidate.afterSceneId === assertion.after_scene_id)
      if (!transition) return fail(`no boundary transition after ${assertion.after_scene_id}`)
      return transition.kind === assertion.junction_kind
        ? pass(`junction after ${assertion.after_scene_id} is ${transition.kind}`)
        : fail(`junction after ${assertion.after_scene_id} is ${transition.kind}, expected ${assertion.junction_kind}`)
    }
    case 'layer-transition': {
      const transitions = composition?.transitions ?? []
      if (transitions.length !== assertion.count) {
        return fail(`${transitions.length} layer transitions, expected ${assertion.count}`)
      }
      if (assertion.duration_ms !== undefined &&
          !transitions.some((candidate) => candidate.durationMs === assertion.duration_ms)) {
        return fail(`no layer transition of ${assertion.duration_ms} ms`)
      }
      return pass(`${transitions.length} layer transitions`)
    }
    case 'effect': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no clip matches ${JSON.stringify(assertion.clip)}`)
      const placement = composition?.scenes
        .flatMap((scene) => scene.zones)
        .flatMap((zone) => [...zone.main, ...zone.overlays.flatMap((layer) => layer.placements)])
        .find((candidate) => candidate.id === clip.startPlacementId)
      const effect = placement?.effects?.find((candidate) => candidate.kind === assertion.effect_kind)
      if (!effect) return fail(`clip ${clip.clipId} has no ${assertion.effect_kind} Effect`)
      if (assertion.parameter !== undefined) {
        const value = (effect as unknown as Record<string, unknown>)[assertion.parameter]
        if (value !== assertion.value) {
          return fail(`${assertion.effect_kind}.${assertion.parameter} is ${value}, expected ${assertion.value}`)
        }
      }
      return pass(`clip ${clip.clipId} carries ${assertion.effect_kind}`)
    }
    case 'marker': {
      const marker = (composition?.markers ?? []).find((candidate) => candidate.timeMs === assertion.time_ms)
      if (!marker) return fail(`no marker at ${assertion.time_ms} ms`)
      if (assertion.name !== undefined && marker.name !== assertion.name) {
        return fail(`marker at ${assertion.time_ms} ms is named "${marker.name}", expected "${assertion.name}"`)
      }
      return pass(`marker at ${assertion.time_ms} ms`)
    }
    case 'show-end': {
      const duration = showLoopDurationMs(show)
      return duration === assertion.duration_ms
        ? pass(`Show End at ${duration} ms`)
        : fail(`Show End at ${duration} ms, expected ${assertion.duration_ms}`)
    }
    case 'instance-time-scale':
    case 'instance-control': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no clip matches ${JSON.stringify(assertion.clip)}`)
      const instance = composition?.patternInstances.find((candidate) => candidate.id === clip.instanceId)
      if (!instance) return fail(`instance ${clip.instanceId} not found`)
      if (assertion.kind === 'instance-time-scale') {
        return instance.time.timeScale === assertion.value
          ? pass(`time scale ${instance.time.timeScale}`)
          : fail(`time scale ${instance.time.timeScale}, expected ${assertion.value}`)
      }
      const control = instance.controlTargets?.[assertion.export_name]
      return control === assertion.value
        ? pass(`control ${assertion.export_name} = ${control}`)
        : fail(`control ${assertion.export_name} is ${control}, expected ${assertion.value}`)
    }
    case 'no-track': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no clip matches ${JSON.stringify(assertion.clip)}`)
      const description = describeShow(document)
      const described = description.zones
        .flatMap((zone) => zone.layers)
        .flatMap((layer) => layer.clips)
        .find((candidate) => candidate.clipId === clip.clipId)
      const track = described?.tracks.find((candidate) =>
        candidate.target.toLowerCase().includes(assertion.target_contains.toLowerCase()))
      return track
        ? fail(`clip ${clip.clipId} still has track ${track.trackId}`)
        : pass(`clip ${clip.clipId} has no "${assertion.target_contains}" track`)
    }
    case 'no-effect': {
      const clip = locateClip(show, assertion.clip)
      if (!clip) return fail(`no clip matches ${JSON.stringify(assertion.clip)}`)
      const placement = composition?.scenes
        .flatMap((scene) => scene.zones)
        .flatMap((zone) => [...zone.main, ...zone.overlays.flatMap((layer) => layer.placements)])
        .find((candidate) => candidate.id === clip.startPlacementId)
      const effect = placement?.effects?.find((candidate) => candidate.kind === assertion.effect_kind)
      return effect
        ? fail(`clip ${clip.clipId} still has a ${assertion.effect_kind} Effect`)
        : pass(`clip ${clip.clipId} has no ${assertion.effect_kind} Effect`)
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
  fixtureOf: (name: DictationCase['fixture']) => ShowRecord,
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
