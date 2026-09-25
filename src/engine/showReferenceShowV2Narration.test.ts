import { describe, expect, it } from 'vitest'
import { STOCK_SHOW_CATALOGUE, stockShowCatalogueById } from '@/pixelblaze/stock/showCatalogueV2'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { currentShowReferenceExampleV2 } from './showReferenceNarrationV2'

describe('v2 live strip narration parity (#1066 slice 11c1)', () => {
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
