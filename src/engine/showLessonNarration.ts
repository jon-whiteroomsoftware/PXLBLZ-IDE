import type { ShowPatternRef, ShowTransitionEasing } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import type { ShowPatternSlotGroupV2, ShowReferenceGuideV2 } from '@/pixelblaze/stock/showCatalogueV2'
import {
  currentShowChapterV2,
  currentShowMainClipV2,
  currentShowReferenceExampleV2,
} from './showReferenceNarrationV2'

export interface ShowLessonNarration {
  kind: 'LIVE' | 'CLIP' | 'INTERVAL'
  label: string
  detail?: string
  index: number
  count: number
  easing?: ShowTransitionEasing
  progress?: number
}

export function showLessonNarrationV2(
  record: ShowRecordV2,
  reference: ShowReferenceGuideV2 | undefined,
  positionMs: number,
): ShowLessonNarration {
  if (reference) {
    const current = currentShowReferenceExampleV2(record, reference, positionMs)
    const index = current ? reference.examples.findIndex((example) => example.id === current.id) : -1
    const count = reference.examples.length
    const durationMs = record.composition.showEndMs
    const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
    return {
      kind: 'LIVE',
      label: current?.label ?? 'Reference frame',
      detail: current?.detail ?? 'The fixed comparison source before the first example.',
      index,
      count,
      ...(current?.easing ? { easing: current.easing } : {}),
      progress,
    }
  }
  const chapterCount = record.composition.markers.filter((marker) => marker.role === 'chapter').length
  if (chapterCount <= 1) {
    const clip = currentShowMainClipV2(record, positionMs)
    return { kind: 'CLIP', label: clip?.patternName ?? 'No Clip', index: clip?.index ?? -1, count: clip?.count ?? 0 }
  }
  const chapter = currentShowChapterV2(record, positionMs)
  return { kind: 'INTERVAL', label: chapter?.name ?? 'No chapter', index: chapter?.index ?? -1, count: chapter?.count ?? 0 }
}

export function showLessonAuthoredSlotPatternV2(
  record: ShowRecordV2,
  group: ShowPatternSlotGroupV2,
): ShowPatternRef | undefined {
  // A group's first declared instance names the Pattern its picker shows (#1110).
  for (const id of group.instanceIds) {
    const instance = record.composition.patternInstances.find((candidate) => candidate.id === id)
    if (instance) return instance.pattern
  }
  return undefined
}
