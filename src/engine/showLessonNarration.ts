import type { ShowPatternRef, ShowRecord, ShowTransitionEasing } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import { showLoopDurationMs } from './showModel'
import {
  currentShowClip,
  currentShowReferenceExample,
  currentShowScene,
  type ShowPatternSlotGroup,
  type ShowReferenceGuide,
} from './showReferenceShow'
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

export function showLessonNarrationV1(
  show: ShowRecord,
  reference: ShowReferenceGuide | undefined,
  positionMs: number,
): ShowLessonNarration {
  const current = reference ? currentShowReferenceExample(show, reference, positionMs) : null
  if (reference) {
    const index = current ? reference.examples.findIndex((example) => example.id === current.id) : -1
    const count = reference.examples.length
    const durationMs = showLoopDurationMs(show)
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
  const clipNarration = show.scenes.length === 1
  if (clipNarration) {
    const clip = currentShowClip(show, positionMs)
    return { kind: 'CLIP', label: clip?.patternName ?? 'No Clip', index: clip?.index ?? -1, count: clip?.count ?? 0 }
  }
  const scene = currentShowScene(show, positionMs)
  return { kind: 'INTERVAL', label: scene?.scene.name ?? 'No Scene', index: scene?.index ?? -1, count: show.scenes.length }
}

export function showLessonNarrationV2(
  record: ShowRecordV2,
  reference: ShowReferenceGuide | undefined,
  positionMs: number,
  afterSceneIdByTransitionId: Readonly<Record<string, string>>,
): ShowLessonNarration {
  if (reference) {
    const current = currentShowReferenceExampleV2(record, reference, positionMs, afterSceneIdByTransitionId)
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
  return { kind: 'INTERVAL', label: chapter?.name ?? 'No Scene', index: chapter?.index ?? -1, count: chapter?.count ?? 0 }
}

export function showLessonAuthoredSlotPatternV1(
  show: ShowRecord,
  group: ShowPatternSlotGroup,
): ShowPatternRef | undefined {
  return show.cells.find((cell) => group.cellIds.includes(cell.id))?.pattern
    ?? show.composition?.patternInstances.find((instance) => group.instanceIds.includes(instance.id))?.pattern
}

export function showLessonAuthoredSlotPatternV2(
  record: ShowRecordV2,
  group: ShowPatternSlotGroup,
): ShowPatternRef | undefined {
  // A group's first declared instance names the Pattern its picker shows (#1110).
  for (const id of group.instanceIds) {
    const instance = record.composition.patternInstances.find((candidate) => candidate.id === id)
    if (instance) return instance.pattern
  }
  return undefined
}
