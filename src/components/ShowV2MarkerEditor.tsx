import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { DraftTextField } from './ui/draft-text-field'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowMarkerEditIntentV2 } from '@/engine/showMarkersV2'
import { newShowPilotMarkerV2, selectedShowMarkerV2 } from '@/engine/showMarkerRouteModel'
import { admitShowV2PilotMarkerEdit } from '@/store/showV2MarkerAdmission'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useMapStore } from '@/store/mapStore'
import { useLibraryStore } from '@/store/libraryStore'

export function ShowV2MarkerEditor({ record, onStatus }: { record: ShowRecordV2; onStatus: (status: string) => void }) {
  const patterns = usePatternStore(state => state.userPatterns)
  const maps = useMapStore(state => state.userMaps)
  const libraries = useLibraryStore(state => state.userLibraries)
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
  const submit = async (intent: ShowMarkerEditIntentV2): Promise<boolean> => {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    const baseRevision = useShowStore.getState().showRevisions[record.id] ?? 0
    try {
      const outcome = await admitShowV2PilotMarkerEdit({
        showId: record.id, baseRevision, intent, assets: { patterns, maps, libraries },
        isCurrent: () => live.current && useShowStore.getState().showV2Pilots[record.id] === record
          && usePatternStore.getState().userPatterns === patterns
          && useMapStore.getState().userMaps === maps
          && useLibraryStore.getState().userLibraries === libraries,
      })
      if (!live.current) return false
      if (outcome.status === 'refused') setFieldReset(value => value + 1)
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Marker is unchanged.' : outcome.settlement === 'saved' ? 'Marker saved.' : 'A newer edit replaced this Marker edit.')
      return outcome.status === 'applied'
    } catch (error) {
      if (live.current) setFieldReset(value => value + 1)
      if (live.current) onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
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
