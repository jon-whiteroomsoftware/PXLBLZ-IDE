// Provenance: pxlblz-v3 src/grammar/read.ts at 9ecd481f, re-authored onto the
// version-2 vocabulary for #1039 (see src/agent-harness/PROVENANCE.md).
// The read side of the grammar surface: editor context, referent resolution,
// the compact Show projection and Property evaluation at a time. Pure logic over
// the version-agnostic timeline view model — descriptions carry the same names
// and global times the user sees in the editor.
import { evaluateShowPropertyTrackV2 } from '@/engine/showPropertyAnimationV2'
import { materializeShowGroupsV2 } from '@/engine/showGroupsV2'
import type { GrammarIssue, ShowGrammarDocument } from './types.js'
import {
  clipSites,
  describeKeyframes,
  describeTarget,
  findTrack,
  junctionSites,
  targetEntityId,
  timelineOf,
  type ClipSite,
  type DescribedKeyframe,
  type JunctionSite,
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
  /** "That Clip" / "the one under my cursor": the hovered Clip. */
  hovered?: boolean
  /** "This Clip" / "the selected one": the selection. */
  selected?: boolean
  /** "At 0:42": a global time in milliseconds. */
  at_ms?: number
  /** "Under the playhead": the element at the editor context's playhead. */
  at_playhead?: boolean
  /** "The sparkle Clip": case-insensitive Pattern-name match. */
  pattern_name?: string
  /** "The second Clip on the arch": 1-based ordinal by start time within a Zone. */
  ordinal?: number
  /** Constrain to one Zone (by id or name, case-insensitive). */
  zone?: string
}

export interface ReferenceCandidate {
  id: string
  kind: 'clip' | 'junction'
  description: string
  /**
   * A junction's Clip pair. v2 addresses a junction by the identities of the
   * Clips it joins — a derived Cut mints no persisted identity — so this is
   * what `insert_transition` and `remove_transition` actually take.
   */
  fromClipId?: string
  toClipId?: string
  /** The Transition identity, for a junction that carries one. */
  transitionId?: string
}

export interface ReferenceResolution {
  resolution: 'unique' | 'ambiguous' | 'none'
  candidates: ReferenceCandidate[]
  /** What the agent should do next, in one line. */
  message: string
}

/** "test pattern" must match TestPattern1D: compare alphanumerics only. */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** A Zone constraint matches the Zone's id or name, alphanumerics only. */
function inZone(site: { zoneId: string; zoneName: string }, zoneFilter: string): boolean {
  return normalizeName(site.zoneId) === normalizeName(zoneFilter) ||
    normalizeName(site.zoneName) === normalizeName(zoneFilter)
}

function clipCandidate(site: ClipSite): ReferenceCandidate {
  return {
    id: site.item.id,
    kind: 'clip',
    description:
      `${site.item.patternName} on ${site.zoneName} (${site.layerName}), ` +
      `${site.item.startMs}–${site.item.endMs} ms` +
      (site.item.groupOccurrenceId ? `, inside Group occurrence ${site.item.groupOccurrenceId}` : ''),
  }
}

function junctionCandidate(site: JunctionSite): ReferenceCandidate {
  const { junction } = site
  return {
    id: junction.id,
    kind: 'junction',
    description:
      `${junction.kind} ${junction.scope === 'derived-cut' ? 'Cut' : 'junction'} between Clips ` +
      `${junction.leftItemId} and ${junction.rightItemId} at ${junction.startMs} ms on ${site.zoneName}`,
    fromClipId: junction.leftItemId,
    toClipId: junction.rightItemId,
    ...(junction.transitionId ? { transitionId: junction.transitionId } : {}),
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

/**
 * The five candidates to offer on a miss: the pool is the requested Zone's
 * elements when it has any, else every Zone's; with a time they are ranked by
 * distance from it (ties in start order, the sort being stable) before
 * truncation, so a late query names the late element.
 */
function nearestFive<T>(pool: T[], startOf: (site: T) => number, atMs: number | undefined): T[] {
  const ranked = atMs === undefined
    ? pool
    : [...pool].sort((a, b) => Math.abs(startOf(a) - atMs) - Math.abs(startOf(b) - atMs))
  return ranked.slice(0, 5)
}

/** Resolve a described element to identities with human descriptions. */
export function resolveReference(
  document: ShowGrammarDocument,
  context: EditorContext,
  query: ReferenceQuery,
): ReferenceResolution | { issue: GrammarIssue } {
  const kind = query.kind ?? 'clip'
  const zoneFilter = query.zone?.toLowerCase()
  const timeline = timelineOf(document)

  if (kind === 'junction') {
    // The time is validated before the Zone filter, so a Zone without junctions
    // cannot turn a missing at_ms into a clean "none".
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
    const all = junctionSites(timeline)
    const sites = zoneFilter ? all.filter((site) => inZone(site, zoneFilter)) : all
    const nearest = nearestFive(sites.length > 0 ? sites : all, (site) => site.junction.startMs, atMs).map(junctionCandidate)
    const matches = sites.filter(({ junction }) => atMs >= junction.startMs && atMs <= junction.endMs)
    return conclude(matches.map(junctionCandidate), nearest)
  }

  // The context pointers a query relies on are validated before the Zone filter,
  // for the same reason as the junction time.
  const hovered = query.hovered ? context.hoveredClipId : undefined
  if (query.hovered && !hovered) {
    return {
      issue: {
        code: 'invalid-argument',
        message: 'Nothing is hovered; the editor context has no hoveredClipId. Ask the user to point, or address the Clip another way.',
      },
    }
  }
  const selected = new Set(query.selected ? context.selectedClipIds ?? [] : [])
  if (query.selected && selected.size === 0) {
    return {
      issue: {
        code: 'invalid-argument',
        message: 'Nothing is selected; the editor context has no selectedClipIds. Ask the user to select, or address the Clip another way.',
      },
    }
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

  const all = clipSites(timeline)
  let sites = zoneFilter ? all.filter((site) => inZone(site, zoneFilter)) : all
  const pool = sites.length > 0 ? sites : all

  if (hovered) sites = sites.filter((site) => site.item.id === hovered)
  if (query.selected) sites = sites.filter((site) => selected.has(site.item.id))
  if (query.pattern_name !== undefined) {
    const needle = normalizeName(query.pattern_name)
    sites = sites.filter((site) => normalizeName(site.item.patternName).includes(needle))
  }
  if (atMs !== undefined) {
    sites = sites.filter((site) => atMs >= site.item.startMs && atMs < site.item.endMs)
  }
  if (query.ordinal !== undefined) {
    sites = query.ordinal >= 1 ? sites.slice(query.ordinal - 1, query.ordinal) : []
  }

  const nearest = nearestFive(pool, (site) => site.item.startMs, atMs).map(clipCandidate)
  return conclude(sites.map(clipCandidate), nearest)
}

export interface ShowDescription {
  name: string
  /** Show End owns the loop length. */
  showEndMs: number
  zones: Array<{
    zoneId: string
    zoneName: string
    layers: Array<{
      layerId: string
      name: string
      rank: number
      clips: Array<{
        clipId: string
        patternName: string
        startMs: number
        endMs: number
        durationMs: number
        instanceId: string
        entryPolicy: 'continue' | 'restart'
        groupOccurrenceId?: string
        appearanceKeys: Array<{
          keyId: string
          timeMs: number
          opacity: number
          /** Authored Effects of this key, with the identities the Effect commands take. */
          effects: Array<{ effectId: string; kind: string }>
        }>
      }>
      junctions: Array<{
        junctionId: string
        kind: string
        scope: 'layer' | 'whole-output' | 'derived-cut'
        fromClipId: string
        toClipId: string
        transitionId: string | null
        startMs: number
        endMs: number
        durationMs: number
      }>
    }>
  }>
  transitions: Array<{ transitionId: string; kind: string; startMs: number; endMs: number; durationMs: number }>
  markers: Array<{ markerId: string; timeMs: number; name?: string; color?: string; role?: 'chapter' }>
  /** Zone Layout definitions and their occurrences on the timeline. */
  layouts: Array<{ layoutId: string; name: string }>
  layoutOccurrences: Array<{
    occurrenceId: string
    layoutId: string
    layoutName: string
    startMs: number
    endMs: number
  }>
  groups: Array<{
    occurrenceId: string
    definitionId: string
    name: string
    zoneId: string
    startMs: number
    endMs: number
    linkedOccurrenceCount: number
  }>
  /** Authored Property tracks in their owner's time domain. */
  propertyTracks: Array<{
    trackId: string
    owner: 'show' | string
    target: string
    targetEntityId?: string
    activeStartMs: number
    activeEndMs: number
    keyframes: DescribedKeyframe[]
  }>
  /** What the user is pointing at, pre-resolved from the editor context. */
  editorFocus: {
    hovered: ReferenceCandidate | null
    selected: ReferenceCandidate[]
    playhead: { ms: number; clips: ReferenceCandidate[] } | null
  }
}

/** The compact view of the Show as the user sees it, with stable identities. */
export function describeShow(document: ShowGrammarDocument, context: EditorContext = {}): ShowDescription {
  const timeline = timelineOf(document)
  const sites = clipSites(timeline)
  const candidateFor = (clipId: string | undefined) => {
    const site = clipId === undefined ? undefined : sites.find((candidate) => candidate.item.id === clipId)
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
            .filter((site) => context.playheadMs! >= site.item.startMs && context.playheadMs! < site.item.endMs)
            .map(clipCandidate),
        },
  }

  const layoutNames = new Map(document.show.zoneLayouts.map((layout) => [layout.id, layout.name]))
  // Effect identity lives in the record, not in the timeline view. Read it from
  // the effective record so a materialized Group Clip use reports the same
  // Effect identities its definition holds.
  const effectiveClips = new Map(materializeShowGroupsV2(document.show).composition.clips.map((clip) => [clip.id, clip]))
  return {
    name: document.show.name,
    showEndMs: timeline.showEndMs,
    zones: timeline.rows.map((row) => ({
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      layers: row.layers.map((layer) => ({
        layerId: layer.id,
        name: layer.name,
        rank: layer.rank,
        clips: layer.items.map((item) => ({
          clipId: item.id,
          patternName: item.patternName,
          startMs: item.startMs,
          endMs: item.endMs,
          durationMs: item.durationMs,
          instanceId: item.instanceId,
          entryPolicy: item.entryPolicy,
          ...(item.groupOccurrenceId ? { groupOccurrenceId: item.groupOccurrenceId } : {}),
          appearanceKeys: (item.appearanceKeys ?? []).map((key) => ({
            keyId: key.id,
            timeMs: key.timeMs,
            opacity: key.opacity,
            effects: (effectiveClips.get(item.id)?.appearance.keys.find((candidate) => candidate.id === key.id)
              ?.value.effects ?? []).map((effect) => ({ effectId: effect.id, kind: effect.kind })),
          })),
        })),
        junctions: layer.junctions.map((junction) => ({
          junctionId: junction.id,
          kind: junction.kind,
          scope: junction.scope,
          fromClipId: junction.leftItemId,
          toClipId: junction.rightItemId,
          transitionId: junction.transitionId,
          startMs: junction.startMs,
          endMs: junction.endMs,
          durationMs: junction.durationMs,
        })),
      })),
    })),
    transitions: timeline.transitions.map((transition) => ({
      transitionId: transition.id,
      kind: transition.kind,
      startMs: transition.startMs,
      endMs: transition.endMs,
      durationMs: transition.durationMs,
    })),
    markers: timeline.markers.map((marker) => ({
      markerId: marker.id,
      timeMs: marker.timeMs,
      ...(marker.name !== undefined ? { name: marker.name } : {}),
      ...(marker.color !== undefined ? { color: marker.color } : {}),
      ...(marker.role !== undefined ? { role: marker.role } : {}),
    })),
    layouts: document.show.zoneLayouts.map((layout) => ({ layoutId: layout.id, name: layout.name })),
    layoutOccurrences: timeline.layoutIntervals.map((interval) => ({
      occurrenceId: interval.id,
      layoutId: interval.definitionId,
      layoutName: layoutNames.get(interval.definitionId) ?? interval.definitionName,
      startMs: interval.startMs,
      endMs: interval.endMs,
    })),
    groups: timeline.rows.flatMap((row) => row.groups.map((group) => ({
      occurrenceId: group.id,
      definitionId: group.definitionId,
      name: group.name,
      zoneId: group.zoneId,
      startMs: group.startMs,
      endMs: group.endMs,
      linkedOccurrenceCount: group.linkedOccurrenceCount,
    }))),
    propertyTracks: (timeline.propertyTracks ?? []).map((track) => ({
      trackId: track.id,
      owner: track.owner.kind === 'show' ? 'show' : track.owner.definitionId,
      target: describeTarget(track.target),
      ...(targetEntityId(track.target) ? { targetEntityId: targetEntityId(track.target)! } : {}),
      activeStartMs: track.activeStartMs,
      activeEndMs: track.activeEndMs,
      keyframes: track.keys.map((key) => ({
        id: key.id,
        timeMs: key.timeMs,
        value: key.value,
        easing: key.easing.curve,
        retainedCurve: key.retainedCurve,
      })),
    })),
    editorFocus,
  }
}

export interface PropertyEvaluation {
  trackId: string
  target: string
  /** The owner whose time domain `atMs` is read in: the Show, or a Group definition. */
  owner: 'show' | string
  atMs: number
  /** Absent when the time lies outside the track's half-open activation. */
  value?: number
  active: boolean
}

/**
 * Evaluate one Property track at a time in its own authored domain.
 *
 * A track has effect only inside `[activeStartMs, activeStartMs +
 * activeDurationMs)`; key extrema do not define activation (specification
 * section 6). Outside activation this reports `active: false` and no value
 * rather than holding an edge value the Show never shows.
 */
export function evaluatePropertyAt(
  document: ShowGrammarDocument,
  trackId: string,
  atMs: number,
): { ok: true; evaluation: PropertyEvaluation } | { ok: false; issues: GrammarIssue[] } {
  const found = findTrack(document, trackId)
  if (!found.ok) return found
  const { owner, track } = found.site
  const value = evaluateShowPropertyTrackV2(track, atMs)
  return {
    ok: true,
    evaluation: {
      trackId: track.id,
      target: describeTarget(track.target),
      owner: owner.kind === 'show' ? 'show' : owner.definitionId,
      atMs,
      active: value !== undefined,
      ...(value !== undefined ? { value } : {}),
    },
  }
}

export { describeKeyframes }
export type { DescribedKeyframe }

/**
 * The rules of engagement. The server serves the 'server' text as its MCP
 * instructions (clients hold their own transactions); the dictation loop uses
 * the 'dictation' text, where the harness holds the turn's transaction.
 */
export function operatingRules(mode: 'server' | 'dictation'): string {
  const transaction = mode === 'server'
    ? `4. One transaction per user turn: bracket the turn's operations in begin_edit … commit_edit so the whole
   turn is one undo step. A refused commit stays open — fix it or roll it back before ending the turn.`
    : `4. One transaction per user turn, held by the editor: do not open or commit transactions yourself.
   Every completion requires explicit intent: apply, ask, refuse or incomplete. Reply punctuation never
   decides mutation. Ask, refuse and incomplete discard all private edits. Apply validates private work
   as one history entry; this is not live-editor application or durable saving.
   End in the same response as the final operation by setting its finish_turn_reply to
   { "intent": "apply", "reply": "One line describing the edit." } (omit reply to use change descriptions).
   Or call finish_turn with {intent, reply?}, including when asking or refusing. Plain text alone does
   not complete a turn. No extra final acknowledgement round trip is needed.`
  return `PXLBLZ Show grammar editing — operating rules:
1. Resolve before acting: every element is addressed by its own identity — Clip, Layer, Zone, Transition,
   Layout occurrence, Group occurrence, track, key, Marker — and never by index, Scene or time lookup.
   An operation that takes clip_id also takes a clip referent instead — clip: { hovered: true } for "that
   Clip", { at_playhead: true }, { at_ms }, { pattern_name }, or { ordinal, zone } — and resolves it
   itself, refusing with the candidates when it is ambiguous. The projection's editorFocus already names
   the hovered and selected Clips and the Clips under the playhead. Use resolve_reference only to inspect
   candidates before asking.
2. On ambiguity, ask — never guess. When resolve_reference returns more than one candidate, list them
   to the user and ask which one they mean. When it returns none, or the context lacks the pointer
   ("that Clip" with nothing hovered), say so and ask what to target. A clarifying turn ends with a
   question, not a statement.
3. Look before asking. Before asking which element the user means, check the Show (describe_show or
   resolve_reference) for how many candidates actually exist: when exactly one matches — one Crossfade,
   one brightness Effect, one Marker — act on it and name it in your report instead of asking.
   The same goes for names: look up a Pattern's real control exports (get_stock_pattern) and an
   Effect's real parameters before using one; never guess an identifier.
${transaction}
5. Report in one line what changed, from the operation results' change descriptions. A result also
   carries the affected-entity collections the edit actually touched; the requested scope is your input,
   the affected scope is that report.
6. Refuse rather than force: when an operation refuses with a remedy, follow the remedy or tell the
   user; do not work around a refusal with generic edits. Never substitute a different property or
   element for the one requested: when the request is impossible but a near alternative exists,
   leave the document unchanged and offer the alternative as a question. A valid request that changes
   nothing is reported as an accepted no-op, not a refusal — do not retry it differently.
7. Operation results are authoritative: a result's changes, listing, keys and evaluated values are
   the state after the edit. Do not re-read the Show to confirm an edit; use evaluate_property_at only
   for a time the result did not evaluate.
8. Times are global integer milliseconds and intervals are half-open. A Cut is the absence of a
   Transition at exact adjacency of two Clips on one Zone and Layer; a one-millisecond gap is blank
   time, not a Cut.`
}

export const OPERATING_RULES = operatingRules('server')
export const DICTATION_RULES = operatingRules('dictation')
