import type { ShowRecord, ShowTimelineMarker } from './personalContentRecords'

export type ShowMarkerRequest =
  | { kind: 'add'; marker: ShowTimelineMarker }
  | { kind: 'move'; markerId: string; timeMs: number }
  | { kind: 'update'; markerId: string; patch: Partial<Omit<ShowTimelineMarker, 'id'>> }
  | { kind: 'remove'; markerId: string }
export type ShowMarkerResult =
  | { status: 'changed' | 'noop'; record: ShowRecord }
  | { status: 'refused'; code: 'invalid-argument' | 'missing-composition' | 'unknown-marker' | 'duplicate-marker'; reason: string; candidates?: string[] }

/** Exact marker edits. Only the marker collection and changed-record stamp are owned here. */
export function editShowMarkerExactly(show: ShowRecord, request: ShowMarkerRequest): ShowMarkerResult {
  const refuse = (code: Extract<ShowMarkerResult, { status: 'refused' }>['code'], reason: string): ShowMarkerResult => ({ status: 'refused', code, reason })
  if (!show.composition) return refuse('missing-composition', 'This Show has no composition.')
  const markers = show.composition.markers ?? []
  if (markers.some(marker => !marker.id || !Number.isSafeInteger(marker.timeMs) || marker.timeMs < 0)) return refuse('invalid-argument', 'Existing markers require valid identities and exact times.')
  if (new Set(markers.map(marker => marker.id)).size !== markers.length) return refuse('duplicate-marker', 'Marker identities must be unique.')
  const id = request.kind === 'add' ? request.marker.id : request.markerId
  if (typeof id !== 'string' || !id) return refuse('invalid-argument', 'Give a nonempty marker id.')
  const marker = markers.find(value => value.id === id)
  if (request.kind === 'add' && marker) return refuse('duplicate-marker', 'That marker id already exists.')
  if (request.kind !== 'add' && !marker) return { status: 'refused', code: 'unknown-marker', reason: `No marker has id "${id}".`, candidates: markers.map(value => value.id) }
  const patch = request.kind === 'add' ? request.marker : request.kind === 'move' ? { timeMs: request.timeMs } : request.kind === 'update' ? request.patch : undefined
  if (patch) {
    if (!Object.keys(patch).length) return refuse('invalid-argument', 'Give at least one of name, color, or time.')
    if (('timeMs' in patch && (!Number.isSafeInteger(patch.timeMs) || patch.timeMs! < 0))
      || ('name' in patch && patch.name !== undefined && typeof patch.name !== 'string')
      || ('color' in patch && patch.color !== undefined && typeof patch.color !== 'string')) return refuse('invalid-argument', 'Use nonnegative safe integer milliseconds and string marker fields.')
  }
  // Explicit undefined removes a manual optional field; JSON callers omit it.
  const nextMarker = { ...marker, ...patch } as ShowTimelineMarker
  if (nextMarker.name === undefined) delete nextMarker.name
  if (nextMarker.color === undefined) delete nextMarker.color
  if (request.kind !== 'add' && request.kind !== 'remove'
    && marker!.timeMs === nextMarker.timeMs && marker!.name === nextMarker.name && marker!.color === nextMarker.color) return { status: 'noop', record: show }
  const nextMarkers = (request.kind === 'add' ? [...markers, nextMarker]
    : request.kind === 'remove' ? markers.filter(value => value.id !== id)
      : markers.map(value => value.id === id ? nextMarker : value))
    .sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id))
  const composition: NonNullable<ShowRecord['composition']> = { ...show.composition, markers: nextMarkers }
  if (!nextMarkers.length) delete composition.markers
  return { status: 'changed', record: { ...show, composition, updatedAt: Math.max(Date.now(), show.updatedAt + 1) } }
}

/** Manual controls keep their existing conversion before entering exact semantics. */
export function editShowMarkerFromUI(show: ShowRecord, request: ShowMarkerRequest): ShowMarkerResult {
  const timeMs = request.kind === 'add' ? request.marker.timeMs : request.kind === 'move' ? request.timeMs : request.kind === 'update' ? request.patch.timeMs : undefined
  if (timeMs !== undefined && !Number.isFinite(timeMs)) return { status: 'refused', code: 'invalid-argument', reason: 'Use a finite marker time.' }
  if (request.kind === 'add') return editShowMarkerExactly(show, { ...request, marker: { ...request.marker, timeMs: Math.max(0, Math.round(request.marker.timeMs)) } })
  if (request.kind === 'move') return editShowMarkerExactly(show, { ...request, timeMs: Math.max(0, Math.round(request.timeMs)) })
  if (request.kind === 'update' && request.patch.timeMs !== undefined) return editShowMarkerExactly(show, { ...request, patch: { ...request.patch, timeMs: Math.max(0, Math.round(request.patch.timeMs)) } })
  return editShowMarkerExactly(show, request)
}
