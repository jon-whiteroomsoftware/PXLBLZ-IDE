import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { DraftTextField } from './ui/draft-text-field'
import { showChaptersV2 } from '@/engine/showChaptersV2'
import type { ShowMarkerEditIntentV2 } from '@/engine/showMarkersV2'
import { newShowPilotMarkerV2, selectedShowMarkerV2 } from '@/engine/showMarkerRouteModel'
import { admitShowV2PilotMarkerEdit, type ShowV2PilotMarkerCapture, type ShowV2PilotMarkerAdoptionReceipt } from '@/store/showV2MarkerAdmission'
import { useShowStore } from '@/store/showStore'

export function ShowV2MarkerEditor({ capture, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotMarkerCapture
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotMarkerAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record
  const [selectedId, setSelectedId] = useState(record.composition.markers[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [fieldReset, setFieldReset] = useState(0)
  const pending = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])
  const marker = selectedShowMarkerV2(record.composition.markers, selectedId)
  // Read-only narrative projection (#1040): chapter-role Markers in their
  // deterministic order. The route still edits general Marker fields only and
  // never authors or clears a role.
  const chapters = showChaptersV2(record)
  const submit = async (intent: ShowMarkerEditIntentV2): Promise<boolean> => {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    const adoption: { current: ShowV2PilotMarkerAdoptionReceipt | null } = { current: null }
    const baseRevision = useShowStore.getState().showRevisions[record.id] ?? 0
    try {
      const outcome = await admitShowV2PilotMarkerEdit({
        showId: record.id, baseRevision, intent, capture,
        isCurrent: () => live.current && isCurrentCapture(),
        onAdopted: receipt => { adoption.current = receipt },
      })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return false
      if (outcome.status === 'refused') setFieldReset(value => value + 1)
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Marker is unchanged.' : outcome.settlement === 'saved' ? 'Marker saved.' : 'A newer edit replaced this Marker edit.')
      return outcome.status === 'applied'
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) setFieldReset(value => value + 1)
      if (live.current && current) onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
      return false
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }
  const add = async () => {
    const added = newShowPilotMarkerV2(record.composition.markers)
    if (await submit({ kind: 'add', marker: added })) setSelectedId(added.id)
  }
  return (
    <div className="mt-7" data-testid="show-v2-markers">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Markers</h2>
        <Button size="xs" variant="outline" disabled={busy} onClick={() => void add()}>Add Marker</Button>
      </div>
      {chapters.length > 0 && (
        <ol className="mb-3 flex flex-col gap-1 text-xs text-zinc-400" data-testid="show-v2-chapters" aria-label="Chapters">
          {chapters.map(chapter => (
            <li key={chapter.id} className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate text-zinc-300">{chapter.name || 'Unnamed'}</span>
              <span className="ml-auto shrink-0 tabular-nums text-zinc-500">{chapter.timeMs} ms</span>
            </li>
          ))}
        </ol>
      )}
      {marker && (
        <div className="space-y-3">
          <label className="block text-xs text-zinc-500">
            Marker
            <select aria-label="Marker" value={marker.id} disabled={busy} onChange={event => setSelectedId(event.target.value)} className="mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200">
              {record.composition.markers.map(item => <option key={item.id} value={item.id}>{item.name || 'Unnamed'} · {item.timeMs} ms</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" key={`${marker.id}:${fieldReset}`}>
            <label className="block min-w-0 text-xs text-zinc-500">
              Name
              <DraftTextField ariaLabel="Marker name" value={marker.name ?? ''} onApply={name => { void submit({ kind: 'update', markerId: marker.id, patch: { name: name || undefined } }) }} inputProps={{ disabled: busy }} className="mt-1 block w-full" inputClassName="w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200" />
            </label>
            <NumberField label="Marker time" value={marker.timeMs} step={1} suffix="ms" variant="editor" disabled={busy} onChange={timeMs => void submit({ kind: 'move', markerId: marker.id, timeMs })} />
            <label className="block min-w-0 text-xs text-zinc-500">
              Color
              <DraftTextField ariaLabel="Marker color" value={marker.color ?? ''} onApply={color => { void submit({ kind: 'update', markerId: marker.id, patch: { color: color || undefined } }) }} inputProps={{ disabled: busy }} className="mt-1 block w-full" inputClassName="w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200" />
            </label>
            <div className="flex items-end sm:justify-end">
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void submit({ kind: 'remove', markerId: marker.id })}>Remove Marker</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
