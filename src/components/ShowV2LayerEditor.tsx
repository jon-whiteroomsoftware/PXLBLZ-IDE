import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { buildShowV2LayerEditorModel, createShowV2LayerAtTopIntent, reorderShowV2LayerIntent } from '@/engine/showV2LayerEditorModel'
import type { LayerReference, ShowLayerEditIntentV2, ShowLayerReassignmentV2 } from '@/engine/showLayersV2'
import { admitShowV2PilotLayerEdit, type ShowV2PilotAdoptionReceipt, type ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'

const selectStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
function reassignment(reference: LayerReference, layerId: string): ShowLayerReassignmentV2 {
  if (reference.kind === 'clip') return { kind: reference.kind, clipId: reference.clipId, layerId }
  if (reference.kind === 'group-layer-binding') return { kind: reference.kind, groupOccurrenceId: reference.groupOccurrenceId, definitionLayerId: reference.definitionLayerId, layerId }
  return { kind: reference.kind, transitionId: reference.transitionId, participantId: reference.participantId, layerId }
}
function referenceLabel(reference: LayerReference): string {
  if (reference.kind === 'clip') return `Clip ${reference.clipId}`
  if (reference.kind === 'group-layer-binding') return `Group ${reference.groupOccurrenceId} / ${reference.definitionLayerId}`
  return `Transition ${reference.transitionId} / ${reference.participantId}`
}

export function ShowV2LayerEditor({ capture, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture; isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record, model = buildShowV2LayerEditorModel(record)
  const [zoneId, setZoneId] = useState(''), [layerId, setLayerId] = useState('')
  const layer = model.layers.find(layer => layer.id === layerId && layer.zoneId === zoneId)
  const [adding, setAdding] = useState(false), [removing, setRemoving] = useState(false)
  const [destinations, setDestinations] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false), [reset, setReset] = useState(0)
  const pending = useRef(false), live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useLayoutEffect(() => {
    if (!pending.current && layerId && !record.composition.layers.some(layer => layer.id === layerId)) {
      setLayerId(''); setRemoving(false); setDestinations({})
    }
  }, [record, layerId, busy])
  const submit = async (intent: ShowLayerEditIntentV2, selectAfter?: string): Promise<boolean> => {
    if (pending.current) return false
    pending.current = true; setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await admitShowV2PilotLayerEdit({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0, capture,
        isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adoption.current = receipt }, intent })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return false
      if (outcome.status === 'refused') setReset(value => value + 1)
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Layer is unchanged.' : 'Layer saved.')
      if (outcome.status === 'applied') {
        if (selectAfter !== undefined) { setLayerId(selectAfter); if (intent.kind === 'add') setZoneId(intent.layer.zoneId) }
        setAdding(false); setRemoving(false); setDestinations({})
      }
      return outcome.status === 'applied'
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { setReset(value => value + 1); onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
      return false
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  const available = !busy && (capture.inputCapture ? capture.inputCapture.status === 'qualified' : capture.prepared.status !== 'refused')
  const sameZone = model.layers.filter(layer => layer.zoneId === zoneId)
  const choices = sameZone.filter(value => value.id !== layerId)
  const remove = () => {
    if (!layer) return
    if (!layer.references.length) { void submit({ kind: 'remove', zoneId, layerId }, ''); return }
    setDestinations({}); setRemoving(true); setAdding(false)
  }
  return <section className="mt-7 space-y-3" aria-label="Layers">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium text-zinc-200">Layers</h2>
      <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => { setAdding(true); setRemoving(false) }}>Add Layer</Button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-zinc-400">Zone<select aria-label="Layer Zone" className={selectStyle} value={zoneId} disabled={busy} onChange={event => { setZoneId(event.target.value); setLayerId(''); setRemoving(false) }}><option value="">Choose Zone</option>{record.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Layer<select aria-label="Selected Layer" className={selectStyle} value={layer?.id ?? ''} disabled={busy || !zoneId} onChange={event => { setLayerId(event.target.value); setRemoving(false); setDestinations({}) }}><option value="">Choose Layer</option>{sameZone.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
    </div>
    {adding && <form key={`add:${reset}`} className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (!available || pending.current) return
      const data = new FormData(event.currentTarget)
      const plan = createShowV2LayerAtTopIntent(record, String(data.get('zoneId') ?? ''), String(data.get('name') ?? ''), () => newPersonalContentId())
      if (plan.status === 'refused') { if (isCurrentCapture()) onStatus(plan.message); return }
      void submit(plan.intent, plan.intent.layer.id)
    }}>
      <label className="block text-xs text-zinc-400">Zone<select aria-label="New Layer Zone" name="zoneId" required defaultValue="" className={selectStyle} disabled={busy}><option value="">Choose Zone</option>{record.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
      <label className="block text-xs text-zinc-400">Name<input aria-label="New Layer name" name="name" required className={selectStyle} disabled={busy} /></label>
      <div className="flex flex-wrap gap-2"><Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>Add Layer at top</Button><Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={busy} onClick={() => setAdding(false)}>Cancel</Button></div>
    </form>}
    {layer && <>
      <form key={`name:${layer.id}:${layer.name}:${reset}`} className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (available) void submit({ kind: 'rename', zoneId, layerId, name: String(new FormData(event.currentTarget).get('name') ?? '') }) }}>
        <label className="min-w-0 flex-1 text-xs text-zinc-400">Name<input aria-label="Layer name" name="name" required defaultValue={layer.name} className={selectStyle} disabled={busy} /></label>
        <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>Rename Layer</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="outline" className={buttonStyle} disabled={!available || !reorderShowV2LayerIntent(record, layerId, 'up')} onClick={() => { const intent = reorderShowV2LayerIntent(record, layerId, 'up'); if (intent) void submit(intent) }}>Move up</Button>
        <Button size="xs" variant="outline" className={buttonStyle} disabled={!available || !reorderShowV2LayerIntent(record, layerId, 'down')} onClick={() => { const intent = reorderShowV2LayerIntent(record, layerId, 'down'); if (intent) void submit(intent) }}>Move down</Button>
        <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={remove}>Remove Layer</Button>
      </div>
      {removing && <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (available) void submit({ kind: 'remove', zoneId, layerId, reassignments: layer.references.map(reference => reassignment(reference, destinations[reference.key] ?? '')) }, '') }}>
        {layer.references.map(reference => <label key={reference.key} className="block break-words text-xs text-zinc-400">{referenceLabel(reference)}<select aria-label={`Destination for ${referenceLabel(reference)}`} required className={selectStyle} disabled={busy} value={destinations[reference.key] ?? ''} onChange={event => setDestinations(current => ({ ...current, [reference.key]: event.target.value }))}><option value="">Choose destination</option>{choices.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>)}
        <div className="flex flex-wrap gap-2"><Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available || layer.references.some(reference => !destinations[reference.key])}>Reassign and remove</Button><Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={busy} onClick={() => { setRemoving(false); setDestinations({}) }}>Cancel</Button></div>
      </form>}
    </>}
  </section>
}
