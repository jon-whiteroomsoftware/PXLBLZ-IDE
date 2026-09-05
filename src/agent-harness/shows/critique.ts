// Provenance: pxlblz-v3 src/shows/critique.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Advisory structural critic over a ShowRecord — the weakest, cheapest layer
// of the evaluation cascade. Every finding is a suggestion; the tool never
// blocks. Legality is validate_show's job, measurement is telemetry's.
// Pure logic — no MCP imports.
import type { PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import { inspectPatternMetadata } from '@/engine/bundle'
import { nativeDimension } from '@/engine/loadPattern'
import { DEMOS } from '@/pixelblaze/stock/patterns'

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
  /** Resolved user patterns (inline sources), for dimensional inspection. */
  userPatterns?: PatternRecord[]
}

const suggestion = (rule: CritiqueRule, where: string, message: string): CritiqueFinding => ({
  rule,
  severity: 'suggestion',
  where,
  message,
})

const seconds = (ms: number) => `${Math.round(ms / 100) / 10}s`

function pacingMonotony(show: ShowRecord): CritiqueFinding[] {
  if (show.scenes.length < 3) return []
  const durations = show.scenes.map((scene) => scene.durationMs)
  const min = Math.min(...durations)
  const max = Math.max(...durations)
  if (min <= 0 || max / min > 1.2) return []
  return [
    suggestion(
      'pacing-monotony',
      `all ${show.scenes.length} Scenes`,
      `Every Scene runs ${seconds(min)}–${seconds(max)}, so the Show advances on a fixed beat and starts to ` +
        'read as a slideshow. Try making an anchor moment 2–3× longer than its neighbors, or cutting one ' +
        'Scene down to a short accent.',
    ),
  ]
}

function adjacentPatternRepetition(show: ShowRecord): CritiqueFinding[] {
  const findings: CritiqueFinding[] = []
  const sceneIndex = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  interface Placement {
    start: number
    end: number
    patternKey: string
    patternName: string
    presentation: string
  }
  const byZone = new Map<string, Placement[]>()
  for (const cell of show.cells) {
    const start = sceneIndex.get(cell.sceneId)
    if (start === undefined) continue
    const entry: Placement = {
      start,
      end: start + Math.max(1, cell.sceneSpan) - 1,
      patternKey: `${cell.pattern.kind}:${cell.pattern.id}`,
      patternName: cell.patternName,
      // Same pattern with different dressing (Effects, transform, viewport,
      // adaptations, …) is deliberate variation — an effect showcase, not a
      // repetition smell. Only identical presentations get flagged.
      presentation: JSON.stringify([
        cell.adaptations,
        cell.effects ?? null,
        cell.transform ?? null,
        cell.viewport ?? null,
        cell.presentation ?? null,
        cell.blink ?? null,
        cell.controlTargets ?? null,
      ]),
    }
    const zoneCells = byZone.get(cell.zoneId) ?? []
    zoneCells.push(entry)
    byZone.set(cell.zoneId, zoneCells)
  }
  // A Zone Layout change at the boundary rearranges the output spatially, so
  // the same pattern continuing across it is continuity, not repetition.
  const layoutChangeAfterScene = new Set(
    show.transitions.filter((transition) => transition.layoutId).map((transition) => sceneIndex.get(transition.afterSceneId)),
  )
  for (const [zoneId, zoneCells] of byZone) {
    zoneCells.sort((a, b) => a.start - b.start)
    for (let index = 1; index < zoneCells.length; index += 1) {
      const previous = zoneCells[index - 1]
      const current = zoneCells[index]
      if (
        current.start === previous.end + 1 &&
        current.patternKey === previous.patternKey &&
        current.presentation === previous.presentation &&
        !layoutChangeAfterScene.has(previous.end)
      ) {
        findings.push(
          suggestion(
            'adjacent-pattern-repetition',
            `Zone "${zoneId}", Scenes ${previous.start + 1}–${current.end + 1}`,
            `${current.patternName} plays in back-to-back Scenes with identical presentation, so the boundary ` +
              'buys no visual change — the cut lands on the same texture. Either merge the two placements into ' +
              'one Cell spanning both Scenes (sceneSpan), or separate the reprises with a different Pattern ' +
              'between them.',
          ),
        )
      }
    }
  }
  return findings
}

function transitionVariety(show: ShowRecord): CritiqueFinding[] {
  if (show.transitions.length < 3) return []
  const kinds = new Set(show.transitions.map((transition) => transition.kind))
  if (kinds.size > 1) return []
  const kind = [...kinds][0]
  return [
    suggestion(
      'transition-variety',
      `all ${show.transitions.length} Transitions`,
      `Every Scene boundary uses the same "${kind}" transition, so the Show's junctions all carry the same ` +
        'gesture. Keep it where sameness is the point, but try one contrasting boundary — a wipe or ' +
        'fade-color at the biggest mood change — so at least one junction lands differently.',
    ),
  ]
}

function dimensionalFit(show: ShowRecord, userPatterns: PatternRecord[]): CritiqueFinding[] {
  if (show.outputContract?.kind !== 'portable-2d') return []
  const findings: CritiqueFinding[] = []
  const flagged = new Set<string>()
  for (const cell of show.cells) {
    const source =
      cell.pattern.kind === 'stock'
        ? DEMOS[cell.pattern.id]
        : userPatterns.find((pattern) => pattern.id === cell.pattern.id)?.src
    if (!source) continue // Unresolvable references are validate_show's concern.
    const key = `${cell.pattern.kind}:${cell.pattern.id}`
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
          `cell "${cell.id}" (${cell.patternName})`,
          `${cell.patternName} is a 1D Pattern (render only) placed on this 2D portable Stage; the adapter ` +
            'maps it by pixel index, which usually reads as horizontal stripes or scan lines rather than a ' +
            'surface. Fine if that is the intent — otherwise pick a render2D Pattern ' +
            '(dimensions: 2 in list_stock_patterns).',
        ),
      )
    }
  }
  return findings
}

function budgetHeadroom(show: ShowRecord, budgetRatio: number | undefined): CritiqueFinding[] {
  if (budgetRatio === undefined || budgetRatio >= 0.3) return []
  const distinctSources = new Set(show.cells.map((cell) => `${cell.pattern.kind}:${cell.pattern.id}`)).size
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

/** Run every structural heuristic. The input must already be a valid
 * ShowRecord (prepareShowDocument); critique never re-litigates legality. */
export function critiqueShow(show: ShowRecord, context: CritiqueContext = {}): CritiqueFinding[] {
  return [
    ...pacingMonotony(show),
    ...adjacentPatternRepetition(show),
    ...transitionVariety(show),
    ...dimensionalFit(show, context.userPatterns ?? []),
    ...budgetHeadroom(show, context.budgetRatio),
  ]
}
