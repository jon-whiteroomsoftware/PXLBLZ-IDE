// Provenance: pxlblz-v3 src/grammar/support.ts at 9ecd481f, re-authored onto the
// version-2 vocabulary for #1039 (see src/agent-harness/PROVENANCE.md).
// Shared helpers for the grammar surface: Clip and Layer resolution over the
// version-agnostic timeline view model, deterministic id allocation, refusal
// construction and Property-track lookup. Pure logic.
//
// Scene-local time conversion is gone with Scenes: every time here is global
// integer milliseconds, and a Group definition's own tracks are local to that
// definition, which the track site records explicitly.
import type { ShowPropertyTargetV2, ShowPropertyTrackV2, ShowRecordV2 } from '@/engine/showCompositionV2'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import type {
  ShowTimelineItemView,
  ShowTimelineJunctionView,
  ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'
import type { GrammarIssue, ShowGrammarDocument } from './types.js'

export interface GrammarRefusal {
  ok: false
  issues: GrammarIssue[]
}

export function refuse(...issues: GrammarIssue[]): GrammarRefusal {
  return { ok: false, issues }
}

export function replacedShow(document: ShowGrammarDocument, show: ShowRecordV2): ShowGrammarDocument {
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

export function timelineOf(document: ShowGrammarDocument): ShowTimelineViewModel {
  return projectShowTimelineV2(document.show)
}

export interface ClipSite {
  item: ShowTimelineItemView
  zoneId: string
  zoneName: string
  layerId: string
  layerName: string
  layerRank: number
}

export interface JunctionSite {
  junction: ShowTimelineJunctionView
  zoneId: string
  zoneName: string
  layerId: string
}

export function clipSites(timeline: ShowTimelineViewModel): ClipSite[] {
  const sites: ClipSite[] = []
  for (const row of timeline.rows) {
    for (const layer of row.layers) {
      for (const item of layer.items) {
        sites.push({
          item,
          zoneId: row.zoneId,
          zoneName: row.zoneName,
          layerId: layer.id,
          layerName: layer.name,
          layerRank: layer.rank,
        })
      }
    }
  }
  return sites.sort((left, right) => left.item.startMs - right.item.startMs
    || left.item.id.localeCompare(right.item.id))
}

export function junctionSites(timeline: ShowTimelineViewModel): JunctionSite[] {
  const sites: JunctionSite[] = []
  for (const row of timeline.rows) {
    for (const layer of row.layers) {
      for (const junction of layer.junctions) {
        sites.push({ junction, zoneId: row.zoneId, zoneName: row.zoneName, layerId: layer.id })
      }
    }
  }
  return sites.sort((left, right) => left.junction.startMs - right.junction.startMs
    || left.junction.id.localeCompare(right.junction.id))
}

export function describeClip(site: ClipSite): string {
  return `${site.item.id} (${site.item.patternName} on ${site.zoneName} / ${site.layerName}, ` +
    `${site.item.startMs}–${site.item.endMs} ms)`
}

export interface ClipContext {
  site: ClipSite
  showEndMs: number
  siblings: ClipSite[]
}

/**
 * Resolve one Clip identity.
 *
 * A materialized Group Clip use resolves here too, and the site records its
 * occurrence: the catalogue addresses Group content through the Group
 * occurrence commands, so the referent surface must be able to say which
 * occurrence a described Clip belongs to rather than pretending it is ordinary.
 */
export function resolveClip(
  document: ShowGrammarDocument,
  clipId: string,
): { ok: true; context: ClipContext } | GrammarRefusal {
  const timeline = timelineOf(document)
  const siblings = clipSites(timeline)
  const found = siblings.find((candidate) => candidate.item.id === clipId)
  if (!found) {
    return refuse({
      code: 'unknown-id',
      message: `No Clip has id "${clipId}". Known Clips: ${siblings.map(describeClip).join('; ') || 'none'}.`,
      candidates: siblings.map((candidate) => candidate.item.id),
    })
  }
  return { ok: true, context: { site: found, showEndMs: timeline.showEndMs, siblings } }
}

/** Which authored owner's time domain a track lives in. */
export interface TrackSite {
  /** The Show itself, or the Group definition that owns this track's local time. */
  owner: { kind: 'show' } | { kind: 'group-definition'; definitionId: string }
  track: ShowPropertyTrackV2
}

export function trackSites(document: ShowGrammarDocument): TrackSite[] {
  return [
    ...document.show.composition.propertyTracks.map((track): TrackSite => ({ owner: { kind: 'show' }, track })),
    ...document.show.composition.groupDefinitions.flatMap((definition) =>
      definition.propertyTracks.map((track): TrackSite => ({
        owner: { kind: 'group-definition', definitionId: definition.id },
        track,
      }))),
  ]
}

export function describeTarget(target: ShowPropertyTargetV2): string {
  switch (target.kind) {
    case 'instance-time-scale': return `time scale of instance ${target.instanceId}`
    case 'instance-control': return `control "${target.exportName}" of instance ${target.instanceId}`
    case 'clip-opacity': return `opacity of Clip ${target.clipId}`
    case 'clip-view': return `${target.property} of Clip ${target.clipId}`
    case 'clip-transform': return `${target.property} transform of Clip ${target.clipId}`
    case 'clip-aperture': return `Aperture ${target.property} of Clip ${target.clipId}`
    case 'clip-effect': return `${target.effectKind} ${target.parameterId} on Clip ${target.clipId}`
    case 'layout-occurrence-split-position': return `split position of Layout occurrence ${target.layoutOccurrenceId}`
    case 'show-repeat-scale': return 'Show repeat scale'
  }
}

/** The Clip, instance or Layout occurrence a target names, when it names one. */
export function targetEntityId(target: ShowPropertyTargetV2): string | undefined {
  if ('clipId' in target) return target.clipId
  if ('instanceId' in target) return target.instanceId
  if ('layoutOccurrenceId' in target) return target.layoutOccurrenceId
  return undefined
}

export function findTrack(
  document: ShowGrammarDocument,
  trackId: string,
): { ok: true; site: TrackSite } | GrammarRefusal {
  const sites = trackSites(document)
  const site = sites.find((candidate) => candidate.track.id === trackId)
  if (!site) {
    return refuse({
      code: 'unknown-track',
      message: sites.length === 0
        ? 'No Property tracks exist yet; add one with add_property_tracks.'
        : `No Property track has id "${trackId}". Known tracks: ${
            sites.map((candidate) => `${candidate.track.id} (${describeTarget(candidate.track.target)})`).join('; ')}.`,
      candidates: sites.map((candidate) => candidate.track.id),
    })
  }
  return { ok: true, site }
}

export interface DescribedKeyframe {
  id: string
  timeMs: number
  value: number
  easing: string
  /** The outgoing segment is a restriction of a longer authored curve. */
  retainedCurve: boolean
}

export function describeKeyframes(track: ShowPropertyTrackV2): DescribedKeyframe[] {
  return track.keyframes.map((keyframe) => ({
    id: keyframe.id,
    timeMs: keyframe.timeMs,
    value: keyframe.value,
    easing: keyframe.easing.curve,
    retainedCurve: keyframe.curveSegment !== undefined,
  }))
}
