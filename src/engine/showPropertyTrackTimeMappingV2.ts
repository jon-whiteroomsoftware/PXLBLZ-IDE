import { applyShowEasing } from './showEasing'
import type { ShowPropertyKeyframeV2, ShowPropertyTrackV2 } from './showCompositionV2'

export type ShowInsertPropertyTimeResultV2 =
  | { status: 'changed'; propertyTracks: ShowPropertyTrackV2[]; affectedTrackIds: string[] }
  | { status: 'unchanged'; propertyTracks: ShowPropertyTrackV2[]; affectedTrackIds: [] }
  | { status: 'refused'; propertyTracks: ShowPropertyTrackV2[]; affectedTrackIds: []; message: string }

/** Evaluate Property keys without depending on the Show or Group owners. */
export function evaluateShowPropertyKeysV2(
  source: readonly ShowPropertyKeyframeV2[],
  atMs: number,
): number {
  const keys = [...source].sort(compareKeys)
  if (keys.length === 0) return 0
  const exact = keys.find(key => key.timeMs === atMs)
  if (exact) return exact.value
  if (atMs <= keys[0].timeMs) return keys[0].value
  const last = keys[keys.length - 1]
  if (atMs >= last.timeMs) return last.value
  const rightIndex = keys.findIndex(key => key.timeMs > atMs)
  const left = keys[rightIndex - 1]
  const right = keys[rightIndex]
  if (left.curveSegment) {
    const segment = left.curveSegment
    const progress = (segment.elapsedOffsetMs + atMs - left.timeMs) / segment.sourceDurationMs
    return segment.baseValue + segment.deltaValue * applyShowEasing(segment.easing, progress)
  }
  const progress = (atMs - left.timeMs) / (right.timeMs - left.timeMs)
  return left.value + (right.value - left.value) * applyShowEasing(left.easing, progress)
}

/** Map an arbitrary Property-track array across one positive Insert Time edit. */
export function insertTimeInPropertyTracksV2(
  propertyTracks: ShowPropertyTrackV2[],
  showEndMs: number,
  atMs: number,
  durationMs: number,
): ShowInsertPropertyTimeResultV2 {
  if (!Number.isSafeInteger(atMs) || !Number.isSafeInteger(durationMs)
    || atMs < 0 || atMs > showEndMs || durationMs <= 0
    || !Number.isSafeInteger(showEndMs + durationMs)) {
    return { status: 'refused', propertyTracks, affectedTrackIds: [], message: 'Insert Time requires safe integer milliseconds inside Show time.' }
  }
  const affectedTrackIds: string[] = []
  const mapped = propertyTracks.map(source => {
    const activeEndMs = source.activeStartMs + source.activeDurationMs
    if (activeEndMs <= atMs) return structuredClone(source)
    affectedTrackIds.push(source.id)
    if (source.activeStartMs >= atMs) return {
      ...structuredClone(source),
      activeStartMs: source.activeStartMs + durationMs,
      keyframes: source.keyframes.map(key => ({ ...structuredClone(key), timeMs: key.timeMs + durationMs })),
    }
    return insertTrackHold(propertyTracks, source, atMs, durationMs)
  })
  return affectedTrackIds.length === 0
    ? { status: 'unchanged', propertyTracks, affectedTrackIds: [] }
    : { status: 'changed', propertyTracks: mapped, affectedTrackIds }
}

/** Restrict an active interval without changing its original nonlinear curve. */
export function restrictShowPropertyTrackV2(
  propertyTracks: ShowPropertyTrackV2[],
  source: ShowPropertyTrackV2,
  requestedStartMs: number,
  requestedEndMs: number,
  reservedSourceKeyIds?: ReadonlySet<string>,
): ShowPropertyTrackV2 | undefined {
  const activeEndMs = source.activeStartMs + source.activeDurationMs
  const startMs = Math.max(source.activeStartMs, requestedStartMs)
  const endMs = Math.min(activeEndMs, requestedEndMs)
  if (endMs <= startMs) return undefined
  if (startMs === source.activeStartMs && endMs === activeEndMs) return source
  return {
    ...structuredClone(source),
    activeStartMs: startMs,
    activeDurationMs: endMs - startMs,
    keyframes: retainedKeys(propertyTracks, source, startMs, endMs, reservedSourceKeyIds),
  }
}

function retainedKeys(
  propertyTracks: ShowPropertyTrackV2[],
  source: ShowPropertyTrackV2,
  startMs: number,
  endMs: number,
  reservedSourceKeyIds?: ReadonlySet<string>,
): ShowPropertyKeyframeV2[] {
  const keys = [...source.keyframes].sort(compareKeys)
  const result: ShowPropertyKeyframeV2[] = []
  const exactStart = keys.find(key => key.timeMs === startMs)
  if (exactStart) result.push(structuredClone(exactStart))
  else {
    const left = [...keys].reverse().find(key => key.timeMs < startMs)
    const right = keys.find(key => key.timeMs > startMs)
    const seedSource = left ?? keys[0]
    const seed = structuredClone(seedSource)
    if ((seedSource.timeMs > startMs && seedSource.timeMs <= endMs) || reservedSourceKeyIds?.has(seedSource.id)) {
      seed.id = freshKeyId(
        propertyTracks,
        `${source.id}:boundary:${startMs}`,
        new Set(keys.map(key => key.id)),
      )
    }
    seed.timeMs = startMs
    seed.value = evaluateShowPropertyKeysV2(keys, startMs)
    if (left && right) seed.curveSegment = retainedSegment(left, right, startMs)
    else delete seed.curveSegment
    result.push(seed)
  }
  result.push(...keys.filter(key => key.timeMs > startMs && key.timeMs < endMs).map(key => structuredClone(key)))
  const exactEnd = keys.find(key => key.timeMs === endMs)
  const sourceLeftAtEnd = [...keys].reverse().find(key => key.timeMs < endMs)
  const sourceRightAtEnd = exactEnd ?? keys.find(key => key.timeMs > endMs)
  if (sourceLeftAtEnd && sourceRightAtEnd) {
    const retainedLeft = [...result].reverse().find(key => key.timeMs === sourceLeftAtEnd.timeMs)
      ?? result[result.length - 1]
    if (!retainedLeft.curveSegment) {
      retainedLeft.curveSegment = retainedSegment(sourceLeftAtEnd, sourceRightAtEnd, retainedLeft.timeMs)
    }
  }
  const end = exactEnd ? structuredClone(exactEnd) : {
    ...structuredClone([...keys].reverse().find(key => key.timeMs < endMs) ?? keys[0]),
    id: freshKeyId(propertyTracks, `${source.id}:boundary:${endMs}`, new Set(result.map(key => key.id))),
    timeMs: endMs,
    value: evaluateShowPropertyKeysV2(keys, endMs),
  }
  delete end.curveSegment
  if (!result.some(key => key.timeMs === endMs)) result.push(end)
  return result.sort(compareKeys)
}


function insertTrackHold(
  propertyTracks: ShowPropertyTrackV2[],
  source: ShowPropertyTrackV2,
  atMs: number,
  durationMs: number,
): ShowPropertyTrackV2 {
  const keys = [...source.keyframes].sort(compareKeys)
  const exact = keys.find(key => key.timeMs === atMs)
  const value = evaluateShowPropertyKeysV2(keys, atMs)
  const localIds = new Set(keys.map(key => key.id))
  const shifted = keys.map(key => key.timeMs >= atMs
    ? { ...structuredClone(key), timeMs: key.timeMs + durationMs }
    : structuredClone(key))
  if (exact) {
    const holdId = freshKeyId(propertyTracks, `${source.id}:hold:${atMs}`, localIds)
    shifted.push({ id: holdId, timeMs: atMs, value, easing: { curve: 'linear' } })
  } else {
    const left = [...keys].reverse().find(key => key.timeMs < atMs)
    const right = keys.find(key => key.timeMs > atMs)
    if (left && right) {
      const retainedLeft = shifted.find(key => key.id === left.id)!
      if (!retainedLeft.curveSegment) retainedLeft.curveSegment = retainedSegment(left, right, left.timeMs)
      const holdId = freshKeyId(propertyTracks, `${source.id}:hold:${atMs}`, localIds)
      localIds.add(holdId)
      const resumeId = freshKeyId(propertyTracks, `${source.id}:resume:${atMs + durationMs}`, localIds)
      shifted.push(
        { id: holdId, timeMs: atMs, value, easing: { curve: 'linear' } },
        {
          id: resumeId, timeMs: atMs + durationMs, value, easing: structuredClone(left.easing),
          curveSegment: retainedSegment(left, right, atMs),
        },
      )
    } else {
      const holdId = freshKeyId(propertyTracks, `${source.id}:hold:${atMs}`, localIds)
      localIds.add(holdId)
      const resumeId = freshKeyId(propertyTracks, `${source.id}:resume:${atMs + durationMs}`, localIds)
      shifted.push(
        { id: holdId, timeMs: atMs, value, easing: { curve: 'linear' } },
        { id: resumeId, timeMs: atMs + durationMs, value, easing: { curve: 'linear' } },
      )
    }
  }
  return {
    ...structuredClone(source),
    activeDurationMs: source.activeDurationMs + durationMs,
    keyframes: shifted.sort(compareKeys),
  }
}

function retainedSegment(
  left: ShowPropertyKeyframeV2,
  right: ShowPropertyKeyframeV2,
  startMs: number,
) {
  if (left.curveSegment) return {
    ...structuredClone(left.curveSegment),
    elapsedOffsetMs: left.curveSegment.elapsedOffsetMs + startMs - left.timeMs,
  }
  return {
    baseValue: left.value,
    deltaValue: right.value - left.value,
    easing: structuredClone(left.easing),
    sourceDurationMs: right.timeMs - left.timeMs,
    elapsedOffsetMs: startMs - left.timeMs,
  }
}

function freshKeyId(
  propertyTracks: ShowPropertyTrackV2[],
  base: string,
  local: Set<string>,
): string {
  const used = new Set(propertyTracks.flatMap(track => track.keyframes.map(key => key.id)))
  for (const id of local) used.add(id)
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}:${suffix}`)) suffix += 1
  return `${base}:${suffix}`
}

function compareKeys(left: ShowPropertyKeyframeV2, right: ShowPropertyKeyframeV2): number {
  return left.timeMs - right.timeMs || left.id.localeCompare(right.id)
}
