import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { STOCK_SHOW_CATALOGUE, stockShowCatalogueById } from '@/pixelblaze/stock/showCatalogueV2'
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
  if (stockShowCatalogueById(entry.id)?.reference) return 'reference'
  return entry.show.scenes.length > 1 ? 'scene' : 'clip'
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
      const reference = stockShowCatalogueById(entry.id)?.reference
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
          const fromV2 = currentShowReferenceExampleV2(record, reference!, position)
          const v1 = fromV1?.id ?? 'null'
          const v2 = fromV2?.id ?? 'null'
          if (v1 !== v2) mismatches.push(`${position}ms v1=${v1} v2=${v2}`)
        }
      }
      expect(mismatches, `${entry.id} first mismatch: ${mismatches[0]}`).toEqual([])
    })
  }

  it('resolves every catalogue example at its v2 chapter or boundary anchor', () => {
    for (const entry of STOCK_SHOW_CATALOGUE) {
      if (!entry.reference) continue
      const record = stockShowV2ById(entry.id)!
      const chapters = record.composition.markers
        .filter((marker) => marker.role === 'chapter')
        .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
      const clipById = new Map(record.composition.clips.map((clip) => [clip.id, clip]))
      const windows = record.composition.transitions.flatMap((transition) => {
        if (transition.wholeOutput) {
          const startMs = transition.wholeOutput.startMs
          return [{ startMs, endMs: startMs + transition.durationMs }]
        }
        const participant = transition.participants[0]
        const from = participant && clipById.get(participant.fromClipId)
        const to = participant && clipById.get(participant.toClipId)
        return from && to ? [{ startMs: from.startMs + from.durationMs, endMs: to.startMs }] : []
      })
      for (const example of entry.reference.examples) {
        const anchor = example.anchor
        const chapterIndex = chapters.findIndex((marker) => (
          marker.id === (anchor.kind === 'chapter' ? anchor.markerId : anchor.afterChapterMarkerId)
        ))
        expect(chapterIndex, `${entry.id} ${example.id} chapter`).toBeGreaterThanOrEqual(0)
        const chapter = chapters[chapterIndex]
        const nextChapter = chapters[chapterIndex + 1]
        const position = anchor.kind === 'chapter'
          ? chapter.timeMs
          : (windows.find((window) => window.endMs === nextChapter?.timeMs)?.startMs ?? nextChapter?.timeMs)
        expect(position, `${entry.id} ${example.id} position`).toBeDefined()
        expect(currentShowReferenceExampleV2(record, entry.reference, position!),
          `${entry.id} ${example.id} at ${position}ms`).toEqual(example)
      }
    }
  })

  it('skips a boundary example whose chapter Marker is absent', () => {
    const entry = stockShowCatalogueById('stock-show-reference-blend-fade-transitions')!
    const record = stockShowV2ById(entry.id)!
    const guide = {
      ...entry.reference!,
      examples: entry.reference!.examples.map((example) => (
        example.id === 'crossfade'
          ? { ...example, anchor: { kind: 'boundary' as const, afterChapterMarkerId: 'missing-chapter' } }
          : example
      )),
    }
    expect(currentShowReferenceExampleV2(record, entry.reference!, 7000)?.label).toBe('Crossfade')
    expect(currentShowReferenceExampleV2(record, guide, 7000)).toBeNull()
  })
})
