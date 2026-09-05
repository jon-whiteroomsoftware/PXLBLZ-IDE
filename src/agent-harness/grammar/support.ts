// Provenance: pxlblz-v3 src/grammar/support.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Shared helpers for the grammar operation families: clip resolution over the
// unified timeline projection, Scene-local time conversion, deterministic id
// allocation, refusal construction, and the engine-refusal diagnosis. Pure
// logic shared by src/grammar/operations/*.
import { z } from 'zod'
import { evaluateShowPropertyTrack } from '@/engine/showPropertyAnimation'
import { getStockPattern } from '../shows/stockCatalogue.js'
import type {
  ShowCompositionV1,
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowTransitionEasing,
} from '@/engine/personalContentRecords'
import { normalizeShowEasing } from '@/engine/showEasing'
import { validateShowPropertyTracks } from '@/engine/showPropertyAnimation'
import type { ShowTimelineClipOwner } from '@/engine/showTimelineClipAuthoring'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineClipProjection,
} from '@/engine/showUnifiedTimelineProjection'
import type { GrammarIssue, ShowGrammarDocument } from './types.js'

export interface GrammarRefusal {
  ok: false
  issues: GrammarIssue[]
}

export function refuse(...issues: GrammarIssue[]): GrammarRefusal {
  return { ok: false, issues }
}

export function compositionOf(document: ShowGrammarDocument): ShowCompositionV1 {
  return document.show.composition as ShowCompositionV1
}

export function composedShow(
  document: ShowGrammarDocument,
  composition: ShowCompositionV1,
): ShowGrammarDocument {
  return { ...document, show: { ...document.show, composition } }
}

export function replacedShow(document: ShowGrammarDocument, show: ShowRecord): ShowGrammarDocument {
  return { ...document, show }
}

/** Deterministic fresh ids: prefix-n, skipping anything already in the document. */
export function idFactory(document: ShowGrammarDocument): (prefix: string) => string {
  const serialized = JSON.stringify(document.show)
  const issued = new Set<string>()
  const counters = new Map<string, number>()
  return (prefix) => {
    let counter = counters.get(prefix) ?? 0
    let id: string
    do {
      counter += 1
      id = `${prefix}-${counter}`
    } while (serialized.includes(`"${id}"`) || issued.has(id))
    counters.set(prefix, counter)
    issued.add(id)
    return id
  }
}

export interface ClipContext {
  clip: ShowUnifiedTimelineClipProjection
  zoneName: string
  timelineDurationMs: number
  siblings: Array<{ clip: ShowUnifiedTimelineClipProjection; zoneId: string; zoneName: string }>
}

export function describeClip(clip: ShowUnifiedTimelineClipProjection, zoneName: string): string {
  return `${clip.id} (${clip.patternName} on ${zoneName}, ${clip.startMs}–${clip.endMs} ms)`
}

export function resolveClip(
  document: ShowGrammarDocument,
  clipId: string,
): { ok: true; context: ClipContext } | GrammarRefusal {
  const timeline = projectShowUnifiedTimeline(document.show, compositionOf(document))
  const clips: ClipContext['siblings'] = []
  for (const zone of timeline.zones) {
    for (const layer of zone.layers) {
      for (const clip of layer.clips) clips.push({ clip, zoneId: zone.id, zoneName: zone.name })
    }
  }
  const found = clips.find((candidate) => candidate.clip.id === clipId)
  if (!found) {
    return refuse({
      code: 'unknown-clip',
      message:
        `No clip has id "${clipId}". Known clips: ${
          clips.map((candidate) => describeClip(candidate.clip, candidate.zoneName)).join('; ')}.`,
      candidates: clips.map((candidate) => candidate.clip.id),
    })
  }
  return {
    ok: true,
    context: {
      clip: found.clip,
      zoneName: found.zoneName,
      timelineDurationMs: timeline.durationMs,
      siblings: clips,
    },
  }
}

export function ownerFor(clip: ShowUnifiedTimelineClipProjection): ShowTimelineClipOwner {
  return clip.kind === 'main'
    ? { kind: 'main', sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id }
    : {
        kind: 'overlay',
        sceneId: clip.sceneId,
        zoneId: clip.zoneId,
        layerId: clip.layerId ?? '',
        placementId: clip.id,
      }
}

export interface SceneRange {
  sceneId: string
  name: string
  startMs: number
  endMs: number
  durationMs: number
}

export function sceneRanges(document: ShowGrammarDocument): SceneRange[] {
  let cursor = 0
  return document.show.scenes.map((scene) => {
    const range = {
      sceneId: scene.id,
      name: scene.name,
      startMs: cursor,
      endMs: cursor + scene.durationMs,
      durationMs: scene.durationMs,
    }
    cursor += scene.durationMs
    return range
  })
}

/** Convert one global time to the Scene-local milliseconds tracks store. */
export function toSceneLocal(
  document: ShowGrammarDocument,
  sceneId: string,
  globalMs: number,
): { ok: true; localMs: number } | { ok: false; issue: GrammarIssue } {
  const range = sceneRanges(document).find((candidate) => candidate.sceneId === sceneId)
  if (!range) {
    return {
      ok: false,
      issue: { code: 'outside-scene', message: `Scene "${sceneId}" does not exist on the timeline.` },
    }
  }
  if (!Number.isFinite(globalMs) || globalMs < range.startMs || globalMs > range.endMs) {
    return {
      ok: false,
      issue: {
        code: 'outside-scene',
        message:
          `Time ${globalMs} ms is outside Scene "${range.name}", which covers ` +
          `${range.startMs}–${range.endMs} ms on the global timeline.`,
        remedy: `Choose a time between ${range.startMs} and ${range.endMs} ms.`,
      },
    }
  }
  return { ok: true, localMs: Math.round(globalMs - range.startMs) }
}

/** Turn a refusing engine plan into a typed issue carrying its legible reason. */
export function planRefusal(
  plan: { code: string; reason: string },
  context: string,
  remedy?: string,
): GrammarIssue {
  return {
    code: plan.code as GrammarIssue['code'],
    message: `${context}: ${plan.reason}`,
    ...(remedy ? { remedy } : {}),
  }
}

export const easingArgument = z
  .union([
    z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']),
    z.record(z.unknown()),
  ])
  .optional()
  .describe(
    'Interpolation leaving the keyframe: a preset name (linear, ease-in, ease-out, ease-in-out) ' +
      'or a structured easing record. Defaults to linear.',
  )

export function toEasing(input: unknown) {
  return normalizeShowEasing((input ?? 'linear') as ShowTransitionEasing)
}

export const keyframeArgument = z.object({
  time_ms: z.number().describe('Global timeline milliseconds'),
  value: z.number(),
  easing: easingArgument,
})

export interface TrackSite {
  sceneId: string
  track: ShowPropertyAnimationTrack
}

export function describeTarget(target: ShowPropertyAnimationTarget): string {
  switch (target.kind) {
    case 'placement-opacity': return `opacity of clip ${target.placementId}`
    case 'instance-control': return `control "${target.exportName}" of instance ${target.instanceId}`
    case 'instance-time-scale': return `time scale of instance ${target.instanceId}`
    case 'placement-view': return `${target.property} of clip ${target.placementId}`
    case 'placement-transform': return `${target.property} transform of clip ${target.placementId}`
    case 'placement-viewport': return `viewport ${target.property} of clip ${target.placementId}`
    case 'placement-effect': return `${target.effectKind} ${target.parameterId} on clip ${target.placementId}`
  }
}

export function targetKey(target: ShowPropertyAnimationTarget): string {
  return JSON.stringify(Object.fromEntries(Object.entries(target).sort(([a], [b]) => a.localeCompare(b))))
}

export function findTrack(
  document: ShowGrammarDocument,
  trackId: string,
): { ok: true; site: TrackSite } | GrammarRefusal {
  const sites: TrackSite[] = compositionOf(document).scenes.flatMap((scene) =>
    (scene.propertyTracks ?? []).map((track) => ({ sceneId: scene.sceneId, track })),
  )
  const site = sites.find((candidate) => candidate.track.id === trackId)
  if (!site) {
    return refuse({
      code: 'unknown-track',
      message:
        sites.length === 0
          ? `No property tracks exist yet; add one with add_property_track.`
          : `No property track has id "${trackId}". Known tracks: ${
              sites.map((candidate) => `${candidate.track.id} (${describeTarget(candidate.track.target)})`).join('; ')}.`,
      candidates: sites.map((candidate) => candidate.track.id),
    })
  }
  return { ok: true, site }
}

export function findKeyframe(
  site: TrackSite,
  keyframeId: string,
): { ok: true; keyframe: ShowPropertyAnimationKeyframe } | GrammarRefusal {
  const keyframe = site.track.keyframes.find((candidate) => candidate.id === keyframeId)
  if (!keyframe) {
    return refuse({
      code: 'unknown-keyframe',
      message:
        `Track ${site.track.id} has no keyframe "${keyframeId}". Known keyframes: ${
          site.track.keyframes.map((candidate) => `${candidate.id} (at ${candidate.timeMs} ms Scene-local)`).join('; ')}.`,
      candidates: site.track.keyframes.map((candidate) => candidate.id),
    })
  }
  return { ok: true, keyframe }
}

/** Turn an engine identity refusal into typed issues via the track validator. */
export function engineRefusal(show: ShowRecord, draft: ShowCompositionV1): GrammarIssue[] {
  const issues = validateShowPropertyTracks(show, draft)
  if (issues.length > 0) {
    return issues.map((issue) => ({
      code: 'engine-refused' as const,
      message: issue.message,
      path: issue.path,
    }))
  }
  return [{
    code: 'engine-refused',
    message: 'The engine declined this edit. Re-read the clip listing and check the arguments.',
  }]
}

/** A keyframe as the projection and operation results describe it: global time. */
export interface DescribedKeyframe {
  keyframeId: string
  timeMs: number
  value: number
  easing: string
}

/** The state of one track after an edit: its keyframes at global times and
 * the engine-evaluated value at each keyframe and at the midpoints between
 * them, so a result confirms itself without a further read (#34). */
export interface TrackState {
  keyframes: DescribedKeyframe[]
  evaluated: Array<{ atMs: number; value: number }>
}

export function trackState(document: ShowGrammarDocument, trackId: string): TrackState | null {
  const found = findTrack(document, trackId)
  if (!found.ok) return null
  const { sceneId, track } = found.site
  const sceneStart = sceneRanges(document).find((range) => range.sceneId === sceneId)?.startMs ?? 0
  const sorted = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs)
  const keyframes = sorted.map((keyframe) => ({
    keyframeId: keyframe.id,
    timeMs: sceneStart + keyframe.timeMs,
    value: keyframe.value,
    easing: keyframe.easing.curve,
  }))
  const sampleLocalTimes: number[] = []
  sorted.forEach((keyframe, index) => {
    if (index > 0) sampleLocalTimes.push((sorted[index - 1].timeMs + keyframe.timeMs) / 2)
    sampleLocalTimes.push(keyframe.timeMs)
  })
  const evaluated = sampleLocalTimes.map((localMs) => ({
    atMs: sceneStart + localMs,
    value: evaluateShowPropertyTrack(track, localMs),
  }))
  return { keyframes, evaluated }
}

/**
 * A control export name must be one the clip's Pattern declares (#39). Stock
 * patterns are checked against the catalogue's declared controls; a
 * user-library Pattern has no source in an editing session and passes
 * through unchecked. Returns the typed issue to refuse with, or null.
 */
export function controlExportIssue(
  document: ShowGrammarDocument,
  instanceId: string,
  exportName: string,
): GrammarIssue | null {
  const instance = compositionOf(document).patternInstances.find((candidate) => candidate.id === instanceId)
  if (!instance || instance.pattern.kind !== 'stock') return null
  let controls: Array<{ exportName: string; kind: string }>
  try {
    controls = getStockPattern(instance.pattern.id).controls
  } catch {
    return null
  }
  const sliders = controls.filter((control) => control.kind === 'slider').map((control) => control.exportName)
  if (sliders.includes(exportName)) return null
  const other = controls.find((control) => control.exportName === exportName)
  const list = sliders.length > 0 ? sliders.join(', ') : 'none'
  return {
    code: 'unknown-control',
    message: other
      ? `"${exportName}" is a ${other.kind} control on ${instance.patternName}, not a slider; control targets drive sliders only. Slider exports: ${list}.`
      : `${instance.patternName} has no control export "${exportName}". Its slider exports: ${list}.`,
    remedy: sliders.length > 0
      ? 'Use one of the listed export names exactly; do not guess an identifier.'
      : 'This Pattern exposes no slider controls; tell the user.',
    candidates: sliders,
  }
}
