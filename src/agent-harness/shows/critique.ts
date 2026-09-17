// Provenance: pxlblz-v3 src/shows/critique.ts at 9ecd481f, re-authored onto the
// version-2 record for #1039 (see src/agent-harness/PROVENANCE.md).
// Advisory structural critic over a `ShowRecordV2` — the weakest, cheapest layer
// of the evaluation cascade. Every finding is a suggestion; the tool never
// blocks. Legality is validate_show's job, measurement is telemetry's.
// Pure logic — no MCP imports.
//
// The heuristics keep their meaning and move to the v2 entities they were always
// about: pacing reads Clip durations on one Layer rather than Scene lengths,
// repetition reads exactly adjacent Clips rather than consecutive Scene rows,
// and junction variety reads authored Transitions beside the derived Cuts.
// Source comparisons key on the canonical stock id, so a Show naming the retired
// DoomFire beside DoomFireV20_2D critiques exactly as one naming the successor
// twice.
import type { PatternRecord, ShowPatternRef } from '@/engine/personalContentRecords'
import type { ShowClipV2, ShowRecordV2 } from '@/engine/showCompositionV2'
import { materializeShowGroupsV2 } from '@/engine/showGroupsV2'
import { projectShowTransitionJunctionsV2 } from '@/engine/showTransitionsV2'
import { inspectPatternMetadata } from '@/engine/bundle'
import { nativeDimension } from '@/engine/loadPattern'
import { resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { stockPatternSource } from './stockCatalogue.js'

export type CritiqueRule =
  | 'pacing-monotony'
  | 'adjacent-pattern-repetition'
  | 'transition-variety'
  | 'dimensional-fit'
  | 'budget-headroom'

export interface CritiqueFinding {
  rule: CritiqueRule
  severity: 'suggestion'
  /** Which part of the Show the finding points at. */
  where: string
  /** What reads as a problem, why, and what to try. */
  message: string
}

export interface CritiqueContext {
  /** artifactBudgetRatio from a compile summary, when the caller has one. */
  budgetRatio?: number
  /** Resolved user Patterns (inline sources), for dimensional inspection. */
  userPatterns?: PatternRecord[]
}

const suggestion = (rule: CritiqueRule, where: string, message: string): CritiqueFinding => ({
  rule,
  severity: 'suggestion',
  where,
  message,
})

const seconds = (ms: number) => `${Math.round(ms / 100) / 10}s`

/** One key per Pattern source: stock ids through the retired-id table. */
function sourceKey(pattern: ShowPatternRef): string {
  return `${pattern.kind}:${pattern.kind === 'stock' ? resolveStockPatternId(pattern.id) : pattern.id}`
}

/** Every Clip use, Group occurrences materialized, with its effective instance. */
function effectiveClips(show: ShowRecordV2): Array<{ clip: ShowClipV2; pattern: ShowPatternRef; patternName: string }> {
  const effective = materializeShowGroupsV2(show)
  const instances = new Map(effective.composition.patternInstances.map((instance) => [instance.id, instance]))
  return effective.composition.clips.flatMap((clip) => {
    const instance = instances.get(clip.instanceId)
    return instance ? [{ clip, pattern: instance.pattern, patternName: instance.patternName }] : []
  })
}

function pacingMonotony(show: ShowRecordV2): CritiqueFinding[] {
  const clips = effectiveClips(show)
  if (clips.length < 3) return []
  const durations = clips.map((entry) => entry.clip.durationMs)
  const min = Math.min(...durations)
  const max = Math.max(...durations)
  if (min <= 0 || max / min > 1.2) return []
  return [
    suggestion(
      'pacing-monotony',
      `all ${clips.length} Clips`,
      `Every Clip runs ${seconds(min)}–${seconds(max)}, so the Show advances on a fixed beat and starts to ` +
        'read as a slideshow. Try making an anchor moment 2–3× longer than its neighbors, or cutting one ' +
        'Clip down to a short accent.',
    ),
  ]
}

function adjacentPatternRepetition(show: ShowRecordV2): CritiqueFinding[] {
  const findings: CritiqueFinding[] = []
  const layerNames = new Map(show.composition.layers.map((layer) => [layer.id, layer.name]))
  const byLayer = new Map<string, Array<{
    clip: ShowClipV2
    patternKey: string
    patternName: string
    presentation: string
  }>>()
  for (const { clip, pattern, patternName } of effectiveClips(show)) {
    const entry = {
      clip,
      patternKey: sourceKey(pattern),
      patternName,
      // The same Pattern with different dressing (Effects, transform, Aperture,
      // opacity, …) is deliberate variation — an Effect showcase, not a
      // repetition smell. Only identical held appearance gets flagged.
      presentation: JSON.stringify(clip.appearance.keys.map((key) => key.value)),
    }
    const layerClips = byLayer.get(clip.layerId) ?? []
    layerClips.push(entry)
    byLayer.set(clip.layerId, layerClips)
  }
  // A Layout switch at the boundary rearranges the output spatially, so the
  // same Pattern continuing across it is continuity, not repetition.
  const layoutSwitchTimes = new Set(show.composition.layoutOccurrences.map((occurrence) => occurrence.startMs))
  for (const [layerId, layerClips] of byLayer) {
    layerClips.sort((a, b) => a.clip.startMs - b.clip.startMs || a.clip.id.localeCompare(b.clip.id))
    for (let index = 1; index < layerClips.length; index += 1) {
      const previous = layerClips[index - 1]
      const current = layerClips[index]
      const boundaryMs = previous.clip.startMs + previous.clip.durationMs
      if (
        // Exact adjacency only: a gap is blank time, not a repeated texture.
        current.clip.startMs === boundaryMs &&
        current.patternKey === previous.patternKey &&
        current.presentation === previous.presentation &&
        !layoutSwitchTimes.has(boundaryMs)
      ) {
        findings.push(
          suggestion(
            'adjacent-pattern-repetition',
            `Layer "${layerNames.get(layerId) ?? layerId}", Clips ${previous.clip.id} and ${current.clip.id}`,
            `${current.patternName} plays in back-to-back Clips with identical held appearance, so the ` +
              'junction buys no visual change — the Cut lands on the same texture. Either make it one Clip ' +
              'spanning both intervals, or separate the reprises with a different Pattern between them.',
          ),
        )
      }
    }
  }
  return findings
}

function transitionVariety(show: ShowRecordV2): CritiqueFinding[] {
  const effective = materializeShowGroupsV2(show)
  const cuts = projectShowTransitionJunctionsV2(effective).length
  const transitions = effective.composition.transitions
  const junctions = transitions.length + cuts
  if (junctions < 3) return []
  const kinds = new Set<string>([
    ...transitions.map((transition) => transition.kind),
    ...(cuts > 0 ? ['cut'] : []),
  ])
  if (kinds.size > 1) return []
  const kind = [...kinds][0]
  return [
    suggestion(
      'transition-variety',
      `all ${junctions} junctions`,
      `Every junction is the same "${kind}", so the Show's boundaries all carry the same gesture. Keep it ` +
        'where sameness is the point, but try one contrasting boundary — a wipe or fade-color at the biggest ' +
        'mood change — so at least one junction lands differently.',
    ),
  ]
}

function dimensionalFit(show: ShowRecordV2, userPatterns: PatternRecord[]): CritiqueFinding[] {
  if (show.outputContract?.kind !== 'portable-2d') return []
  const findings: CritiqueFinding[] = []
  const flagged = new Set<string>()
  for (const { clip, pattern, patternName } of effectiveClips(show)) {
    const source = pattern.kind === 'stock'
      ? stockPatternSource(pattern.id)
      : userPatterns.find((candidate) => candidate.id === pattern.id)?.src
    if (!source) continue // Unresolvable references are validate_show's concern.
    const key = sourceKey(pattern)
    if (flagged.has(key)) continue
    let dimensions: 1 | 2 | 3
    try {
      dimensions = nativeDimension(inspectPatternMetadata(source).renderFns)
    } catch {
      continue
    }
    if (dimensions === 1) {
      flagged.add(key)
      findings.push(
        suggestion(
          'dimensional-fit',
          `Clip "${clip.id}" (${patternName})`,
          `${patternName} is a 1D Pattern (render only) placed on this 2D portable Stage; the adapter ` +
            'maps it by pixel index, which usually reads as horizontal stripes or scan lines rather than a ' +
            'surface. Fine if that is the intent — otherwise pick a render2D Pattern ' +
            '(dimensions: 2 in list_stock_patterns).',
        ),
      )
    }
  }
  return findings
}

function budgetHeadroom(show: ShowRecordV2, budgetRatio: number | undefined): CritiqueFinding[] {
  if (budgetRatio === undefined || budgetRatio >= 0.3) return []
  const distinctSources = new Set(effectiveClips(show).map((entry) => sourceKey(entry.pattern))).size
  if (distinctSources >= 4) return []
  return [
    suggestion(
      'budget-headroom',
      'whole Show',
      `The compiled artifact uses only ${Math.round(budgetRatio * 100)}% of the device budget with ` +
        `${distinctSources} distinct Pattern${distinctSources === 1 ? '' : 's'}. That headroom is room for ` +
        'character: another Pattern source, a second Zone, or richer Transitions cost bytes you have to spare.',
    ),
  ]
}

/**
 * Run every structural heuristic. The input must already be a valid
 * `ShowRecordV2` (prepareShowDocument); critique never re-litigates legality.
 */
export function critiqueShow(show: ShowRecordV2, context: CritiqueContext = {}): CritiqueFinding[] {
  return [
    ...pacingMonotony(show),
    ...adjacentPatternRepetition(show),
    ...transitionVariety(show),
    ...dimensionalFit(show, context.userPatterns ?? []),
    ...budgetHeadroom(show, context.budgetRatio),
  ]
}
