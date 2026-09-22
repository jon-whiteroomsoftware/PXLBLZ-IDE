import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { buildShowV2GroupOccurrenceEditorModel, planShowV2GroupOccurrenceEdit, type ShowV2GroupOccurrenceIntent } from '@/engine/showV2GroupOccurrenceEditorModel'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'

export interface ShowV2GroupOccurrenceSubmission {
  intent: ShowV2GroupOccurrenceIntent
  isCurrent: () => boolean
  onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
}
type SubmissionOutcome = { status: 'applied'; settlement: 'saved' | 'superseded' } | { status: 'unchanged' } | { status: 'refused'; message: string }
const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
function placementDraft(record: ShowRecordV2, id: string) {
  const occurrence = record.composition.groupOccurrences.find(value => value.id === id)
  return { start: occurrence ? String(occurrence.startMs) : '', zoneId: occurrence?.zoneId ?? '',
    bindings: Object.fromEntries(occurrence?.layerBindings.map(binding => [binding.definitionLayerId, binding.layerId]) ?? []),
    x: String(occurrence?.translationX ?? 0), y: String(occurrence?.translationY ?? 0) }
}
/** Submits one typed existing-owner intent; no materialized child becomes an edit target. */
export function ShowV2GroupOccurrenceEditor({ capture, submitGroupOccurrenceEdit, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture
  submitGroupOccurrenceEdit: (request: ShowV2GroupOccurrenceSubmission) => Promise<SubmissionOutcome>
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record, model = buildShowV2GroupOccurrenceEditorModel(record)
  const [occurrenceId, setOccurrenceId] = useState(''), [draft, setDraft] = useState(() => placementDraft(record, ''))
  const [busy, setBusy] = useState(false), pending = useRef(false), live = useRef(true)
  const draftRecord = useRef(record), latestRecord = useRef(record)
  useLayoutEffect(() => { latestRecord.current = record }, [record])
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useLayoutEffect(() => {
    if (pending.current || draftRecord.current === record) return
    draftRecord.current = record
    const id = record.composition.groupOccurrences.some(value => value.id === occurrenceId) ? occurrenceId : ''
    setOccurrenceId(id); setDraft(placementDraft(record, id))
  }, [record, occurrenceId, busy])
  const selected = model.occurrences.find(value => value.id === occurrenceId)
  const available = !busy && (capture.inputCapture?.status === 'qualified' || (!capture.inputCapture && capture.prepared.status === 'ready'))
  const act = async (kind: Exclude<ShowV2GroupOccurrenceIntent['kind'], 'set-definition-clip-timing' | 'edit-definition-clip-appearance' | 'write-definition-instance-properties'>) => {
    if (pending.current || !available || !selected) return
    if ((kind === 'move-occurrence' || kind === 'duplicate-occurrence') && (!draft.start.trim() || !draft.x.trim() || !draft.y.trim())) {
      if (isCurrentCapture()) onStatus('Give the complete Group placement.'); return
    }
    const request = kind === 'move-occurrence' || kind === 'duplicate-occurrence'
      ? { kind, occurrenceId, placement: { startMs: Number(draft.start), zoneId: draft.zoneId,
        layerBindings: selected.layers.map(layer => ({ definitionLayerId: layer.id, layerId: draft.bindings[layer.id] ?? '' })), translationX: Number(draft.x), translationY: Number(draft.y) } }
      : { kind, occurrenceId }
    const plan = planShowV2GroupOccurrenceEdit(record, request, () => newPersonalContentId())
    if (plan.status === 'refused') { if (isCurrentCapture()) onStatus(plan.message); return }
    pending.current = true; setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submitGroupOccurrenceEdit({ intent: plan.intent, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adopted.current = receipt } })
      const current = outcome.status === 'applied'
        ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Group is unchanged.' : 'Group saved.')
      if (outcome.status === 'applied' && adopted.current) {
        const id = kind === 'delete-occurrence' || kind === 'ungroup-occurrence' ? ''
          : plan.intent.kind === 'duplicate-occurrence' ? plan.intent.newOccurrenceId : occurrenceId
        draftRecord.current = adopted.current.record; setOccurrenceId(id); setDraft(placementDraft(adopted.current.record, id))
      }
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) {
        draftRecord.current = latestRecord.current
        onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
      }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  return <section aria-label="Group occurrences" className="mt-7 space-y-3">
    <h2 className="text-sm font-medium text-zinc-200">Group occurrences</h2>
    <label className="block text-xs text-zinc-400">Occurrence<select aria-label="Group occurrence" disabled={busy} className={fieldStyle} value={selected ? occurrenceId : ''} onChange={event => { setOccurrenceId(event.target.value); setDraft(placementDraft(record, event.target.value)); draftRecord.current = record }}>
      <option value="">Choose occurrence</option>{model.occurrences.map(value => <option key={value.id} value={value.id}>{value.name} · {value.startMs}–{value.endMs} ms · {value.id}</option>)}</select></label>
    {selected && <>
      <p className="text-xs text-zinc-500">{selected.startMs}–{selected.endMs} ms{selected.holdDurationMs > 0 ? ` · ${selected.holdDurationMs} ms held` : ''}</p>
      <fieldset disabled={!available} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Start (ms)" ariaLabel="Group start (ms)" value={Number(draft.start)} variant="editor" onChange={value => setDraft(current => ({ ...current, start: String(value) }))} />
          <label className="min-w-0 text-xs text-zinc-400">Zone<select aria-label="Group Zone" className={fieldStyle} value={draft.zoneId} onChange={event => setDraft(value => ({ ...value, zoneId: event.target.value, bindings: {} }))}>{model.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        </div>
        {selected.layers.map(layer => <label key={layer.id} className="block text-xs text-zinc-400">{layer.name} Layer<select aria-label={`Group Layer ${layer.name}`} className={fieldStyle} value={draft.bindings[layer.id] ?? ''} onChange={event => setDraft(value => ({ ...value, bindings: { ...value.bindings, [layer.id]: event.target.value } }))}><option value="">Choose Layer</option>{model.layers.filter(value => value.zoneId === draft.zoneId).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>)}
        <div className="grid grid-cols-2 gap-3">{(['x', 'y'] as const).map(axis => <NumberField key={axis} label={`Translation ${axis.toUpperCase()}`} ariaLabel={`Group translation ${axis.toUpperCase()}`} value={Number(draft[axis])} variant="editor" onChange={value => setDraft(current => ({ ...current, [axis]: String(value) }))} />)}</div>
        <div className="flex flex-wrap gap-2"><Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('move-occurrence')}>Move Group</Button><Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('duplicate-occurrence')}>Duplicate Group</Button></div>
        <div className="flex flex-wrap gap-2"><Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('make-unique')}>Make Group Unique</Button><Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('ungroup-occurrence')}>Ungroup</Button><Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('delete-occurrence')}>Delete Group</Button></div>
      </fieldset>
      <p className="text-xs text-zinc-500">Make Group Unique separates choreography and keeps shared Pattern instances.</p>
    </>}
  </section>
}
