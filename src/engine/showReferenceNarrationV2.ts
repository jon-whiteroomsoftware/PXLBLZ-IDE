import type { ShowMarkerV2, ShowRecordV2 } from './showCompositionV2'
import {
  participantTransitionWindows,
  type ParticipantTransitionWindowV2,
} from './showBoundaryScopeV2'
import type { ShowReferenceExample, ShowReferenceGuide } from './showReferenceShow'

function wrapLoopPosition(positionMs: number, durationMs: number): number {
  return durationMs > 0 ? ((positionMs % durationMs) + durationMs) % durationMs : 0
}

function sortedChaptersV2(record: ShowRecordV2): (ShowMarkerV2 & { role: 'chapter' })[] {
  return record.composition.markers
    .filter((marker): marker is ShowMarkerV2 & { role: 'chapter' } => marker.role === 'chapter')
    .slice()
    .sort((left, right) => left.timeMs - right.timeMs || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}

/** Names the chapter at loop time, mirroring v1 Scene selection over chapter Markers. */
export function currentShowChapterV2(
  record: ShowRecordV2,
  positionMs: number,
): { name: string; index: number; count: number } | null {
  const chapters = sortedChaptersV2(record)
  if (chapters.length === 0) return null
  const position = wrapLoopPosition(positionMs, record.composition.showEndMs)
  let index = 0
  for (let candidate = 1; candidate < chapters.length; candidate++) {
    if (chapters[candidate].timeMs <= position) index = candidate
  }
  return { name: chapters[index].name ?? '', index, count: chapters.length }
}

/** Names the most recently started Clip on the first Zone's lowest-rank Layer. */
export function currentShowMainClipV2(
  record: ShowRecordV2,
  positionMs: number,
): { patternName: string; index: number; count: number } | null {
  const firstZone = record.zones[0]
  if (!firstZone) return null
  const mainLayer = record.composition.layers
    .filter((layer) => layer.zoneId === firstZone.id)
    .slice()
    .sort((left, right) => left.rank - right.rank)[0]
  if (!mainLayer) return null
  const clips = record.composition.clips
    .filter((clip) => clip.layerId === mainLayer.id)
    .slice()
    .sort((left, right) => left.startMs - right.startMs)
  if (clips.length === 0) return null
  const position = wrapLoopPosition(positionMs, record.composition.showEndMs)
  let index = 0
  for (let candidate = 1; candidate < clips.length; candidate++) {
    if (clips[candidate].startMs <= position) index = candidate
  }
  const instance = record.composition.patternInstances.find((candidate) => candidate.id === clips[index].instanceId)
  return { patternName: instance?.patternName ?? 'Unknown Pattern', index, count: clips.length }
}

interface TransitionWindowV2 {
  id: string
  startMs: number
  endMs: number
}

function transitionWindowsV2(record: ShowRecordV2): TransitionWindowV2[] {
  const participantById = new Map<string, ParticipantTransitionWindowV2>()
  if (record.composition.transitions.every((transition) => transition.participants.length > 0)) {
    for (const window of participantTransitionWindows(record)) participantById.set(window.transitionId, window)
  } else {
    const clipById = new Map(record.composition.clips.map((clip) => [clip.id, clip]))
    for (const transition of record.composition.transitions) {
      const participant = transition.participants[0]
      if (transition.wholeOutput !== undefined || !participant) continue
      const from = clipById.get(participant.fromClipId)
      const to = clipById.get(participant.toClipId)
      if (!from || !to) continue
      participantById.set(transition.id, {
        transitionId: transition.id,
        startMs: from.startMs + from.durationMs,
        endMs: to.startMs,
      })
    }
  }
  return record.composition.transitions.flatMap((transition) => {
    if (transition.wholeOutput !== undefined) {
      const startMs = transition.wholeOutput.startMs
      return [{ id: transition.id, startMs, endMs: startMs + transition.durationMs }]
    }
    const participant = participantById.get(transition.id)
    return participant ? [{ id: transition.id, startMs: participant.startMs, endMs: participant.endMs }] : []
  })
}

function chapterBoundaryStartsV2(
  chapters: readonly (ShowMarkerV2 & { role: 'chapter' })[],
  windows: readonly TransitionWindowV2[],
): number[] {
  return chapters.map((chapter, index) => {
    if (index === 0) return chapter.timeMs
    return windows.find((window) => window.endMs === chapter.timeMs)?.startMs ?? chapter.timeMs
  })
}

/** Names the reference example covering loop time, mirroring v1 window selection. */
export function currentShowReferenceExampleV2(
  record: ShowRecordV2,
  guide: ShowReferenceGuide,
  positionMs: number,
  afterSceneIdByTransitionId: Readonly<Record<string, string>>,
): ShowReferenceExample | null {
  const durationMs = record.composition.showEndMs
  if (durationMs <= 0) return guide.examples[0] ?? null
  const position = wrapLoopPosition(positionMs, durationMs)
  const chapters = sortedChaptersV2(record)
  const boundaryStartByChapter = chapterBoundaryStartsV2(chapters, transitionWindowsV2(record))
  const boundaryStarts = boundaryStartByChapter.slice(1).sort((left, right) => left - right)
  const candidates = guide.examples.flatMap((example) => {
    const anchor = example.anchor
    if (anchor.kind === 'scene') {
      const marker = record.composition.markers.find((candidate) => candidate.id === `scene-marker:${anchor.sceneId}`)
      if (!marker || marker.role !== 'chapter') return []
      const chapterIndex = chapters.findIndex((chapter) => chapter.id === marker.id)
      if (chapterIndex < 0) return []
      return [{
        example,
        startMs: marker.timeMs,
        endMs: chapters[chapterIndex + 1]?.timeMs ?? durationMs,
      }]
    }
    const afterSceneId = afterSceneIdByTransitionId[anchor.transitionId]
    if (afterSceneId === undefined) return []
    const chapterIndex = chapters.findIndex((chapter) => chapter.id === `scene-marker:${afterSceneId}`)
    if (chapterIndex < 0 || chapterIndex + 1 >= chapters.length) return []
    const startMs = boundaryStartByChapter[chapterIndex + 1]
    return [{ example, startMs, endMs: boundaryStarts.find((start) => start > startMs) ?? durationMs }]
  }).filter(({ startMs, endMs }) => position >= startMs && position < endMs)

  candidates.sort((left, right) => right.startMs - left.startMs)
  return candidates[0]?.example ?? null
}
