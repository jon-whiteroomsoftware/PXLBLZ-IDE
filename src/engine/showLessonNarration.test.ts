import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { stockShowCatalogueById } from '@/pixelblaze/stock/showCatalogueV2'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { projectShowTimeline, showLoopDurationMs } from './showModel'
import {
  currentShowClip,
  currentShowReferenceExample,
  currentShowScene,
} from './showReferenceShow'
import {
  showLessonAuthoredSlotPatternV1,
  showLessonAuthoredSlotPatternV2,
  showLessonNarrationV1,
  showLessonNarrationV2,
} from './showLessonNarration'

const STEP_MS = 250

function oracleV1(entry: (typeof STOCK_SHOWS)[number], positionMs: number) {
  const show = entry.show
  const reference = entry.reference
  const current = reference ? currentShowReferenceExample(show, reference, positionMs) : null
  const scene = reference ? null : currentShowScene(show, positionMs)
  const clipNarration = !reference && show.scenes.length === 1
  const clip = clipNarration ? currentShowClip(show, positionMs) : null
  const index = reference
    ? (current ? reference.examples.findIndex((example) => example.id === current.id) : -1)
    : clipNarration
      ? (clip?.index ?? -1)
      : (scene?.index ?? -1)
  const count = reference
    ? reference.examples.length
    : clipNarration
      ? (clip?.count ?? 0)
      : show.scenes.length
  const durationMs = showLoopDurationMs(show)
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  if (reference) {
    return {
      kind: 'LIVE' as const,
      label: current?.label ?? 'Reference frame',
      detail: current?.detail ?? 'The fixed comparison source before the first example.',
      index,
      count,
      ...(current?.easing ? { easing: current.easing } : {}),
      progress,
    }
  }
  if (clipNarration) {
    return { kind: 'CLIP' as const, label: clip?.patternName ?? 'No Clip', index, count }
  }
  return { kind: 'INTERVAL' as const, label: scene?.scene.name ?? 'No Scene', index, count }
}

describe('v1 lesson narration extraction (#1066 11c2a)', () => {
  for (const entry of STOCK_SHOWS) {
    // Phase 4 deletes this with shows.ts.
    it(`${entry.id} matches the inline ShowLiveNarration expression`, () => {
      const durationMs = projectShowTimeline(entry.show).durationMs
      const mismatches: string[] = []
      for (let position = 0; position < durationMs; position += STEP_MS) {
        const expected = oracleV1(entry, position)
        const actual = showLessonNarrationV1(entry.show, entry.reference, position)
        try {
          expect(actual).toEqual(expected)
        } catch {
          mismatches.push(`${position}ms expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
        }
      }
      expect(mismatches, `${entry.id} first mismatch: ${mismatches[0]}`).toEqual([])
    })
  }
})

describe('v2 lesson narration parity (#1066 11c2a)', () => {
  for (const entry of STOCK_SHOWS) {
    // Phase 4 deletes this with shows.ts.
    it(`${entry.id} agrees with v1 at every 250 ms sample`, () => {
      const record = stockShowV2ById(entry.id)
      const referenceV2 = stockShowCatalogueById(entry.id)?.reference
      expect(record, `${entry.id} has no native v2 record`).toBeDefined()
      if (!record) return
      const durationMs = record.composition.showEndMs
      expect(projectShowTimeline(entry.show).durationMs).toBe(durationMs)
      const mismatches: string[] = []
      for (let position = 0; position < durationMs; position += STEP_MS) {
        const fromV1 = showLessonNarrationV1(entry.show, entry.reference, position)
        const fromV2 = showLessonNarrationV2(record, referenceV2, position)
        const fields: Array<'kind' | 'label' | 'detail' | 'index' | 'count' | 'easing'> = ['kind', 'label', 'detail', 'index', 'count', 'easing']
        for (const field of fields) {
          const left = (fromV1 as unknown as Record<string, unknown>)[field] ?? null
          const right = (fromV2 as unknown as Record<string, unknown>)[field] ?? null
          if (JSON.stringify(left) !== JSON.stringify(right)) {
            mismatches.push(`${position}ms ${field} v1=${JSON.stringify(left)} v2=${JSON.stringify(right)}`)
          }
        }
        const leftProgress = fromV1.kind === 'LIVE' ? (fromV1.progress ?? 0) : null
        const rightProgress = fromV2.kind === 'LIVE' ? (fromV2.progress ?? 0) : null
        if (leftProgress === null || rightProgress === null) {
          if (leftProgress !== rightProgress) {
            mismatches.push(`${position}ms progress presence v1=${String(leftProgress)} v2=${String(rightProgress)}`)
          }
        } else if (Math.abs(leftProgress - rightProgress) > 1e-9) {
          mismatches.push(`${position}ms progress v1=${leftProgress} v2=${rightProgress}`)
        }
      }
      expect(mismatches, `${entry.id} first mismatch: ${mismatches[0]}`).toEqual([])
    })
  }
})

describe('lesson authored slot pattern (#1066 11c2a)', () => {
  for (const entry of STOCK_SHOWS) {
    const metadataV2 = stockShowCatalogueById(entry.id)
    const groups = entry.patternSlots
      ?? (entry.reference?.patternSlots ? [entry.reference.patternSlots] : undefined)
    const groupsV2 = metadataV2?.patternSlots
      ?? (metadataV2?.reference?.patternSlots ? [metadataV2.reference.patternSlots] : undefined)
    if (!groups || groups.length === 0) continue
    // Phase 4 deletes this with shows.ts.
    it(`${entry.id} resolves the authored pattern identically on v1 and v2`, () => {
      const record = stockShowV2ById(entry.id)
      expect(record, `${entry.id} has no native v2 record`).toBeDefined()
      if (!record) return
      expect(groupsV2).toHaveLength(groups.length)
      for (const [index, group] of groups.entries()) {
        const fromV1 = showLessonAuthoredSlotPatternV1(entry.show, group)
        const fromV2 = showLessonAuthoredSlotPatternV2(record, groupsV2![index])
        expect(fromV2, `${entry.id} group ${group.instanceIds.join(':')}`).toEqual(fromV1)
      }
    })
  }

  it('shows the selected Pattern declared first by the blend and fade reference guide (#1110)', () => {
    const entry = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-blend-fade-transitions')!
    const record = stockShowV2ById(entry.id)!
    const referenceV2 = stockShowCatalogueById(entry.id)?.reference
    expect(showLessonAuthoredSlotPatternV2(record, referenceV2!.patternSlots!)).toEqual({
      kind: 'stock', id: 'MetaballGarden',
    })
  })
})
