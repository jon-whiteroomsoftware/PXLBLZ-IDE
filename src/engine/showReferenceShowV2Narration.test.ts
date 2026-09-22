import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { projectShowTimeline } from './showModel'
import {
  currentShowClip,
  currentShowReferenceExample,
  currentShowScene,
} from './showReferenceShow'
import {
  currentShowChapterV2,
  currentShowMainClipV2,
  currentShowReferenceExampleV2,
} from './showReferenceNarrationV2'

const STEP_MS = 250

type LessonMode = 'scene' | 'clip' | 'reference'

function lessonMode(entry: (typeof STOCK_SHOWS)[number]): LessonMode {
  if (entry.reference) return 'reference'
  return entry.show.scenes.length > 1 ? 'scene' : 'clip'
}

function afterSceneIdByTransitionId(entry: (typeof STOCK_SHOWS)[number]): Record<string, string> {
  return Object.fromEntries((entry.show.transitions ?? []).map((transition) => [transition.id, transition.afterSceneId]))
}

describe('v2 live strip narration parity (#1066 slice 11c1)', () => {
  it('covers the researched mode census (7 scene, 14 clip, 19 reference)', () => {
    const modes = STOCK_SHOWS.map(lessonMode)
    expect(modes.filter((mode) => mode === 'scene')).toHaveLength(7)
    expect(modes.filter((mode) => mode === 'clip')).toHaveLength(14)
    expect(modes.filter((mode) => mode === 'reference')).toHaveLength(19)
  })

  for (const entry of STOCK_SHOWS) {
    it(`${entry.id} agrees at every 250 ms sample`, () => {
      const record = stockShowV2ById(entry.id)
      expect(record, `${entry.id} has no native v2 record`).toBeDefined()
      if (!record) return
      const durationMs = record.composition.showEndMs
      expect(projectShowTimeline(entry.show).durationMs).toBe(durationMs)
      const mode = lessonMode(entry)
      const sceneCount = projectShowTimeline(entry.show).scenes.length
      const mapping = afterSceneIdByTransitionId(entry)
      const mismatches: string[] = []
      for (let position = 0; position < durationMs; position += STEP_MS) {
        if (mode === 'scene') {
          const fromV1 = currentShowScene(entry.show, position)
          const fromV2 = currentShowChapterV2(record, position)
          const v1 = fromV1 ? `${fromV1.scene.name}#${fromV1.index}/${sceneCount}` : 'null'
          const v2 = fromV2 ? `${fromV2.name}#${fromV2.index}/${fromV2.count}` : 'null'
          if (v1 !== v2) mismatches.push(`${position}ms v1=${v1} v2=${v2}`)
        } else if (mode === 'clip') {
          const fromV1 = currentShowClip(entry.show, position)
          const fromV2 = currentShowMainClipV2(record, position)
          const v1 = fromV1 ? `${fromV1.patternName}#${fromV1.index}/${fromV1.count}` : 'null'
          const v2 = fromV2 ? `${fromV2.patternName}#${fromV2.index}/${fromV2.count}` : 'null'
          if (v1 !== v2) mismatches.push(`${position}ms v1=${v1} v2=${v2}`)
        } else {
          const fromV1 = currentShowReferenceExample(entry.show, entry.reference!, position)
          const fromV2 = currentShowReferenceExampleV2(record, entry.reference!, position, mapping)
          const v1 = fromV1?.id ?? 'null'
          const v2 = fromV2?.id ?? 'null'
          if (v1 !== v2) mismatches.push(`${position}ms v1=${v1} v2=${v2}`)
        }
      }
      expect(mismatches, `${entry.id} first mismatch: ${mismatches[0]}`).toEqual([])
    })
  }

  it('skips a boundary example whose transitionId is absent from the mapping', () => {
    const entry = STOCK_SHOWS.find((item) => item.id === 'stock-show-reference-blend-fade-transitions')!
    const record = stockShowV2ById(entry.id)!
    const { 'transition-reference-2': _removed, ...partialMapping } = afterSceneIdByTransitionId(entry)
    const reducedGuide = {
      ...entry.reference!,
      examples: entry.reference!.examples.filter((example) => example.id !== 'crossfade'),
    }
    expect(currentShowReferenceExample(entry.show, entry.reference!, 7000)?.id).toBe('crossfade')
    expect(currentShowReferenceExampleV2(record, entry.reference!, 7000, partialMapping)).toBeNull()
    for (const position of [6000, 7000, 12499]) {
      const fromV1 = currentShowReferenceExample(entry.show, reducedGuide, position)
      const fromV2 = currentShowReferenceExampleV2(record, entry.reference!, position, partialMapping)
      expect(fromV2?.id ?? null, `position ${position}ms`).toBe(fromV1?.id ?? null)
    }
  })
})
