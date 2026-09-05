// Provenance: pxlblz-v3 src/grammar/read.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// The read side of the grammar surface (#21): editor context, referent
// resolution, the compact Show projection, and property evaluation at a
// time. Pure logic over the vendored engine's projections — descriptions
// carry the same names and times the user sees in the editor.
import { evaluateShowPropertyTrack } from '@/engine/showPropertyAnimation'
import { projectShowLayoutIntervals } from '@/engine/showLayoutIntervals'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineClipProjection,
  type ShowUnifiedTimelineJunctionProjection,
} from '@/engine/showUnifiedTimelineProjection'
import type { GrammarIssue, ShowGrammarDocument } from './types.js'
import {
  compositionOf,
  describeTarget,
  findTrack,
  sceneRanges,
  toSceneLocal,
  trackState,
  type DescribedKeyframe,
} from './support.js'

/** What the editor (or the harness standing in for it) is looking at. */
export interface EditorContext {
  selectedClipIds?: string[]
  hoveredClipId?: string
  playheadMs?: number
  visibleRange?: { startMs: number; endMs: number }
  activeZoneId?: string
  inspectorTab?: string
}

export interface ReferenceQuery {
  /** What kind of element to resolve (default clip). */
  kind?: 'clip' | 'junction'
  /** "That clip" / "the one under my cursor": the hovered clip. */
  hovered?: boolean
  /** "This clip" / "the selected one": the selection. */
  selected?: boolean
  /** "At 0:42": a global time in milliseconds. */
  at_ms?: number
  /** "Under the playhead": the element at the editor context's playhead. */
  at_playhead?: boolean
  /** "The sparkle clip": case-insensitive pattern-name match. */
  pattern_name?: string
  /** "The second clip on the arch": 1-based ordinal by start time within a Zone. */
  ordinal?: number
  /** Constrain to one Zone (by id or name, case-insensitive). */
  zone?: string
}

export interface ReferenceCandidate {
  id: string
  kind: 'clip' | 'junction'
  description: string
}

export interface ReferenceResolution {
  resolution: 'unique' | 'ambiguous' | 'none'
  candidates: ReferenceCandidate[]
  /** What the agent should do next, in one line. */
  message: string
}

interface ClipSite {
  clip: ShowUnifiedTimelineClipProjection
  zoneId: string
  zoneName: string
}

/** "test pattern" must match TestPattern1D: compare alphanumerics only. */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface JunctionSite {
  junction: ShowUnifiedTimelineJunctionProjection
  zoneName: string
}

function clipSites(document: ShowGrammarDocument): ClipSite[] {
  const timeline = projectShowUnifiedTimeline(document.show, compositionOf(document))
  const sites: ClipSite[] = []
  for (const zone of timeline.zones) {
    for (const layer of zone.layers) {
      for (const clip of layer.clips) sites.push({ clip, zoneId: zone.id, zoneName: zone.name })
    }
  }
  return sites.sort((left, right) => left.clip.startMs - right.clip.startMs)
}

function junctionSites(document: ShowGrammarDocument): JunctionSite[] {
  const timeline = projectShowUnifiedTimeline(document.show, compositionOf(document))
  const sites: JunctionSite[] = []
  for (const zone of timeline.zones) {
    for (const layer of zone.layers) {
      for (const junction of layer.junctions) sites.push({ junction, zoneName: zone.name })
    }
  }
  return sites.sort((left, right) => left.junction.startMs - right.junction.startMs)
}

function clipCandidate(site: ClipSite): ReferenceCandidate {
  const { clip } = site
  const layer = clip.kind === 'main' ? 'main layer' : `overlay layer ${clip.layerIndex}`
  return {
    id: clip.id,
    kind: 'clip',
    description:
      `${clip.patternName} on ${site.zoneName} (${layer}), ${clip.startMs}–${clip.endMs} ms`,
  }
}

function junctionCandidate(site: JunctionSite): ReferenceCandidate {
  const { junction } = site
  return {
    id: junction.id,
    kind: 'junction',
    description:
      `${junction.kind} junction after clip ${junction.leftClipId} at ${junction.startMs} ms on ${site.zoneName}`,
  }
}

function conclude(candidates: ReferenceCandidate[], nearest: ReferenceCandidate[]): ReferenceResolution {
  if (candidates.length === 1) {
    return { resolution: 'unique', candidates, message: `Resolved to ${candidates[0].id}.` }
  }
  if (candidates.length > 1) {
    return {
      resolution: 'ambiguous',
      candidates,
      message:
        `${candidates.length} elements match — ask the user which one they mean before acting: ${
          candidates.map((candidate) => `${candidate.id} (${candidate.description})`).join('; ')}.`,
    }
  }
  return {
    resolution: 'none',
    candidates: [],
    message:
      nearest.length > 0
        ? `Nothing matches — tell the user, do not guess. Nearest elements: ${
            nearest.map((candidate) => `${candidate.id} (${candidate.description})`).join('; ')}.`
        : 'Nothing matches and the Show has no elements of that kind.',
  }
}

/** Resolve a described element to ids with human descriptions. */
export function resolveReference(
  document: ShowGrammarDocument,
  context: EditorContext,
  query: ReferenceQuery,
): ReferenceResolution | { issue: GrammarIssue } {
  const kind = query.kind ?? 'clip'
  const zoneFilter = query.zone?.toLowerCase()

  if (kind === 'junction') {
    const sites = junctionSites(document)
    const nearestBy = (atMs: number) =>
      [...sites]
        .sort((a, b) => Math.abs(a.junction.startMs - atMs) - Math.abs(b.junction.startMs - atMs))
        .slice(0, 5).map(junctionCandidate)
    const atMs = query.at_playhead ? context.playheadMs : query.at_ms
    if (atMs === undefined) {
      return {
        issue: {
          code: 'invalid-argument',
          message: query.at_playhead
            ? 'The editor context has no playhead position; set one with set_editor_context or give at_ms.'
            : 'Junction references need at_ms or at_playhead.',
        },
      }
    }
    const matches = sites.filter(({ junction }) => atMs >= junction.startMs && atMs <= junction.endMs)
    return conclude(matches.map(junctionCandidate), nearestBy(atMs))
  }

  let sites = clipSites(document)
  if (zoneFilter) {
    const zoneMatched = sites.filter((site) =>
      normalizeName(site.zoneId) === normalizeName(zoneFilter) ||
      normalizeName(site.zoneName) === normalizeName(zoneFilter))
    if (zoneMatched.length === 0 && sites.length > 0) {
      return conclude([], sites.slice(0, 5).map(clipCandidate))
    }
    sites = zoneMatched
  }
  const all = sites

  if (query.hovered) {
    const hovered = context.hoveredClipId
    if (!hovered) {
      return {
        issue: {
          code: 'invalid-argument',
          message: 'Nothing is hovered; the editor context has no hoveredClipId. Ask the user to point, or address the clip another way.',
        },
      }
    }
    sites = sites.filter((site) => site.clip.id === hovered)
  }
  if (query.selected) {
    const selected = new Set(context.selectedClipIds ?? [])
    if (selected.size === 0) {
      return {
        issue: {
          code: 'invalid-argument',
          message: 'Nothing is selected; the editor context has no selectedClipIds. Ask the user to select, or address the clip another way.',
        },
      }
    }
    sites = sites.filter((site) => selected.has(site.clip.id))
  }
  if (query.pattern_name !== undefined) {
    const needle = normalizeName(query.pattern_name)
    sites = sites.filter((site) => normalizeName(site.clip.patternName).includes(needle))
  }
  const atMs = query.at_playhead ? context.playheadMs : query.at_ms
  if (query.at_playhead && atMs === undefined) {
    return {
      issue: {
        code: 'invalid-argument',
        message: 'The editor context has no playhead position; set one with set_editor_context or give at_ms.',
      },
    }
  }
  if (atMs !== undefined) {
    sites = sites.filter((site) => atMs >= site.clip.startMs && atMs < site.clip.endMs)
  }
  if (query.ordinal !== undefined) {
    sites = query.ordinal >= 1 ? sites.slice(query.ordinal - 1, query.ordinal) : []
  }

  const nearest = (atMs !== undefined
    ? [...all].sort((a, b) => Math.abs(a.clip.startMs - atMs) - Math.abs(b.clip.startMs - atMs))
    : all
  ).slice(0, 5).map(clipCandidate)
  return conclude(sites.map(clipCandidate), nearest)
}

export interface ShowDescription {
  name: string
  durationMs: number
  scenes: Array<{ sceneId: string; name: string; startMs: number; endMs: number }>
  zones: Array<{
    zoneId: string
    zoneName: string
    layers: Array<{
      kind: 'main' | 'overlay'
      index: number
      clips: Array<{
        clipId: string
        patternName: string
        startMs: number
        endMs: number
        durationMs: number
        instanceId: string
        tracks: Array<{ trackId: string; target: string; keyframes: DescribedKeyframe[] }>
        effects: Array<{ effectId: string; kind: string }>
      }>
      junctions: Array<{
        junctionId: string
        kind: string
        afterClipId: string
        beforeClipId: string
        startMs: number
        endMs: number
        durationMs: number
        boundaryTransition: boolean
        layerTransitionId: string | null
      }>
    }>
  }>
  markers: Array<{ markerId: string; timeMs: number; name?: string; color?: string }>
  /** Zone Layout definitions and their occurrences on the timeline. */
  layouts: Array<{ layoutId: string; name: string }>
  layoutIntervals: Array<{
    intervalId: string
    layoutId: string
    layoutName: string
    startMs: number
    endMs: number
  }>
  /** Scene-owned tracks not attributable to a listed clip. */
  otherTracks: Array<{ trackId: string; target: string; keyframes: DescribedKeyframe[] }>
  /** What the user is pointing at, pre-resolved from the editor context (#35). */
  editorFocus: {
    hovered: ReferenceCandidate | null
    selected: ReferenceCandidate[]
    playhead: { ms: number; clips: ReferenceCandidate[] } | null
  }
}

/** The compact view of the Show as the user sees it, with stable ids. */
export function describeShow(document: ShowGrammarDocument, context: EditorContext = {}): ShowDescription {
  const composition = compositionOf(document)
  const sites = clipSites(document)
  const candidateFor = (clipId: string | undefined) => {
    const site = clipId === undefined ? undefined : sites.find((candidate) => candidate.clip.id === clipId)
    return site ? clipCandidate(site) : null
  }
  const editorFocus: ShowDescription['editorFocus'] = {
    hovered: candidateFor(context.hoveredClipId),
    selected: (context.selectedClipIds ?? []).flatMap((clipId) => {
      const candidate = candidateFor(clipId)
      return candidate ? [candidate] : []
    }),
    playhead: context.playheadMs === undefined
      ? null
      : {
          ms: context.playheadMs,
          clips: sites
            .filter((site) => context.playheadMs! >= site.clip.startMs && context.playheadMs! < site.clip.endMs)
            .map(clipCandidate),
        },
  }
  const timeline = projectShowUnifiedTimeline(document.show, composition)
  const allTracks = composition.scenes.flatMap((scene) =>
    (scene.propertyTracks ?? []).map((track) => ({ sceneId: scene.sceneId, track })),
  )
  const attributed = new Set<string>()

  const zones = timeline.zones.map((zone) => ({
    zoneId: zone.id,
    zoneName: zone.name,
    layers: zone.layers.map((layer) => ({
      kind: layer.kind,
      index: layer.layerIndex,
      clips: layer.clips.map((clip) => {
        const tracks = allTracks
          .filter(({ track }) =>
            ('placementId' in track.target && track.target.placementId === clip.startPlacementId) ||
            ('instanceId' in track.target && track.target.instanceId === clip.instanceId))
          .map(({ track }) => {
            attributed.add(track.id)
            return {
              trackId: track.id,
              target: describeTarget(track.target),
              keyframes: trackState(document, track.id)?.keyframes ?? [],
            }
          })
        const placementScene = composition.scenes.find((scene) => scene.sceneId === clip.sceneId)
        const placementZone = placementScene?.zones.find((candidate) => candidate.zoneId === zone.id)
        const placement = clip.kind === 'main'
          ? placementZone?.main.find((candidate) => candidate.id === clip.startPlacementId)
          : placementZone?.overlays.find((candidate) => candidate.id === clip.layerId)?.placements
              .find((candidate) => candidate.id === clip.startPlacementId)
        return {
          clipId: clip.id,
          patternName: clip.patternName,
          startMs: clip.startMs,
          endMs: clip.endMs,
          durationMs: clip.durationMs,
          instanceId: clip.instanceId,
          tracks,
          effects: (placement?.effects ?? []).map((effect) => ({ effectId: effect.id, kind: effect.kind })),
        }
      }),
      junctions: layer.junctions.map((junction) => ({
        junctionId: junction.id,
        kind: junction.kind,
        afterClipId: junction.leftClipId,
        beforeClipId: junction.rightClipId,
        startMs: junction.startMs,
        endMs: junction.endMs,
        durationMs: junction.durationMs,
        boundaryTransition: Boolean(junction.boundaryTransition),
        layerTransitionId: junction.transition?.id ?? null,
      })),
    })),
  }))

  return {
    name: document.show.name,
    durationMs: timeline.durationMs,
    scenes: sceneRanges(document).map((range) => ({
      sceneId: range.sceneId,
      name: range.name,
      startMs: range.startMs,
      endMs: range.endMs,
    })),
    zones,
    markers: (composition.markers ?? []).map((marker) => ({
      markerId: marker.id,
      timeMs: marker.timeMs,
      ...(marker.name !== undefined ? { name: marker.name } : {}),
      ...(marker.color !== undefined ? { color: marker.color } : {}),
    })),
    layouts: document.show.routingLayouts.map((layout) => ({
      layoutId: layout.id,
      name: layout.name,
    })),
    layoutIntervals: projectShowLayoutIntervals(document.show).map((interval) => ({
      intervalId: interval.id,
      layoutId: interval.layoutId,
      layoutName: interval.layoutName,
      startMs: interval.startMs,
      endMs: interval.endMs,
    })),
    otherTracks: allTracks
      .filter(({ track }) => !attributed.has(track.id))
      .map(({ track }) => ({
        trackId: track.id,
        target: describeTarget(track.target),
        keyframes: trackState(document, track.id)?.keyframes ?? [],
      })),
    editorFocus,
  }
}

export interface PropertyEvaluation {
  trackId: string
  target: string
  atMs: number
  localMs: number
  value: number
}

/** Evaluate one property track at a global time (held outside its span). */
export function evaluatePropertyAt(
  document: ShowGrammarDocument,
  trackId: string,
  atMs: number,
): { ok: true; evaluation: PropertyEvaluation } | { ok: false; issues: GrammarIssue[] } {
  const found = findTrack(document, trackId)
  if (!found.ok) return found
  const { sceneId, track } = found.site
  const range = sceneRanges(document).find((candidate) => candidate.sceneId === sceneId)
  const localMs = Math.round(atMs - (range?.startMs ?? 0))
  return {
    ok: true,
    evaluation: {
      trackId: track.id,
      target: describeTarget(track.target),
      atMs,
      localMs,
      value: evaluateShowPropertyTrack(track, localMs),
    },
  }
}

// toSceneLocal is imported for future callers that need bounded conversion;
// evaluation deliberately allows out-of-span times (the track holds its edge
// values), so it does not bound-check.
export { toSceneLocal as boundedSceneLocal }

/** The rules of engagement. The server serves the 'server' text as its MCP
 * instructions (clients hold their own transactions); the dictation loop
 * uses the 'dictation' text, where the harness holds the turn's transaction. */
export function operatingRules(mode: 'server' | 'dictation'): string {
  const transaction = mode === 'server'
    ? `4. One transaction per user turn: bracket the turn's operations in begin_edit … commit_edit so the whole
   turn is one undo step. A refused commit stays open — fix it or roll it back before ending the turn.`
    : `4. One transaction per user turn, held by the editor: this turn's operations are already bracketed as
   one undo step; do not open or commit transactions yourself. A question mark in your reply means you
   are asking, and an ask never changes the document — the turn's edits are discarded — so ask only
   when you have not edited. End the turn with the operation that completes the request: set its
   finish_turn_reply argument to your one-line reply (or "" to reply from the results) and the editor
   commits and replies without another round trip. A request needing several operations ends on the
   last one the same way; finish_turn is the fallback when nothing else remains to call.`
  return `PXLBLZ Show grammar editing — operating rules:
1. Resolve before acting: an operation that takes clip_id also takes a clip referent instead — clip:
   { hovered: true } for "that clip", { at_playhead: true }, { at_ms }, { pattern_name }, or { ordinal,
   zone } — and resolves it itself, refusing with the candidates when it is ambiguous. The projection's
   editorFocus already names the hovered and selected clips and the clips under the playhead. Use
   resolve_reference only to inspect candidates before asking.
2. On ambiguity, ask — never guess. When resolve_reference returns more than one candidate, list them
   to the user and ask which one they mean. When it returns none, or the context lacks the pointer
   ("that clip" with nothing hovered), say so and ask what to target. A clarifying turn ends with a
   question, not a statement.
3. Look before asking. Before asking which element the user means, check the Show (describe_show or
   resolve_reference) for how many candidates actually exist: when exactly one matches — one crossfade,
   one brightness Effect, one scene transition — act on it and name it in your report instead of asking.
   The same goes for names: look up a Pattern's real control exports (get_stock_pattern) and an
   Effect's real parameters before using one; never guess an identifier.
${transaction}
5. Report in one line what changed, from the operation results' change descriptions.
6. Refuse rather than force: when an operation refuses with a remedy, follow the remedy or tell the
   user; do not work around a refusal with generic edits. Never substitute a different property or
   element for the one requested: when the request is impossible but a near alternative exists
   (brightness for a main clip's opacity, say), leave the document unchanged and offer the
   alternative as a question.
7. Operation results are authoritative: a result's changes, listing, keyframes, and evaluated values are
   the state after the edit. Do not re-read the Show to confirm an edit; use evaluate_property_at only
   for a time the result did not evaluate.`
}

export const OPERATING_RULES = operatingRules('server')
export const DICTATION_RULES = operatingRules('dictation')
