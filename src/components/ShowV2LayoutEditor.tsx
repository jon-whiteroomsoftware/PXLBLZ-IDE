import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { buildShowV2LayoutEditorModel, planShowV2LayoutEdit, type ShowV2LayoutEditorIntent } from '@/engine/showV2LayoutEditorModel'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
export interface ShowV2LayoutSubmission {
  intent: ShowV2LayoutEditorIntent
  isCurrent: () => boolean
  onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
}
type SubmissionOutcome = { status: 'applied'; settlement: 'saved' | 'superseded' } | { status: 'unchanged' } | { status: 'refused'; message: string }
const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
function placementDraft(record: ShowRecordV2, id: string) {
  const occurrence = record.composition.layoutOccurrences.find(value => value.id === id)
  return { startMs: occurrence?.startMs ?? 0, layoutId: occurrence?.layoutId ?? '', name: occurrence ? record.zoneLayouts.find(value => value.id === occurrence.layoutId)!.name : '' }
}
/** Existing occurrence owners determine coverage; this surface submits exact explicit intents. */
export function ShowV2LayoutEditor({ capture, submitLayoutEdit, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture
  submitLayoutEdit: (request: ShowV2LayoutSubmission) => Promise<SubmissionOutcome>
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record, model = buildShowV2LayoutEditorModel(record)
  const [occurrenceId, setOccurrenceId] = useState(''), [draft, setDraft] = useState(() => placementDraft(record, ''))
  const [busy, setBusy] = useState(false), pending = useRef(false), live = useRef(true)
  const draftRecord = useRef(record), latestRecord = useRef(record)
  useLayoutEffect(() => { latestRecord.current = record }, [record])
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useLayoutEffect(() => {
    if (pending.current || draftRecord.current === record) return
    draftRecord.current = record
    const id = record.composition.layoutOccurrences.some(value => value.id === occurrenceId) ? occurrenceId : ''
    setOccurrenceId(id); setDraft(placementDraft(record, id))
  }, [record, occurrenceId, busy])
  const selected = model.occurrences.find(value => value.id === occurrenceId)
  const available = !busy && (capture.inputCapture?.status === 'qualified' || (!capture.inputCapture && capture.prepared.status === 'ready'))
  const act = async (kind: ShowV2LayoutEditorIntent['kind']) => {
    if (pending.current || !available || !selected) return
    const request = kind === 'move' ? { kind, occurrenceId, startMs: draft.startMs }
      : kind === 'select-layout' ? { kind, occurrenceId, layoutId: draft.layoutId }
        : kind === 'make-unique' ? { kind, occurrenceId, name: draft.name } : { kind, occurrenceId }
    const plan = planShowV2LayoutEdit(record, request, () => newPersonalContentId())
    if (plan.status === 'refused') { if (isCurrentCapture()) onStatus(plan.message); return }
    pending.current = true; setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submitLayoutEdit({ intent: plan.intent, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adopted.current = receipt } })
      const current = outcome.status === 'applied'
        ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Layout is unchanged.' : 'Layout saved.')
      if (outcome.status === 'applied' && adopted.current) {
        const id = kind === 'remove' ? '' : occurrenceId
        draftRecord.current = adopted.current.record; setOccurrenceId(id); setDraft(placementDraft(adopted.current.record, id))
      }
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { draftRecord.current = latestRecord.current; onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  return <section aria-label="Layout occurrences" className="mt-7 space-y-3">
    <h2 className="text-sm font-medium text-zinc-200">Layout occurrences</h2>
    <label className="block text-xs text-zinc-400">Occurrence<select aria-label="Layout occurrence" disabled={busy} className={fieldStyle} value={selected ? occurrenceId : ''} onChange={event => { setOccurrenceId(event.target.value); setDraft(placementDraft(record, event.target.value)); draftRecord.current = record }}>
      <option value="">Choose occurrence</option>{model.occurrences.map(value => <option key={value.id} value={value.id}>{value.name} · {value.startMs}–{value.endMs} ms · {value.id}</option>)}</select></label>
    {selected && <fieldset disabled={!available} className="space-y-3">
      <label className="block text-xs text-zinc-400">Layout<select aria-label="Layout definition" className={fieldStyle} value={draft.layoutId} onChange={event => setDraft(value => ({ ...value, layoutId: event.target.value }))}>{model.layouts.map(layout => <option key={layout.id} value={layout.id}>{layout.name}</option>)}</select></label>
      <Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('select-layout')}>Apply Layout</Button>
      <NumberField label="Switch (ms)" ariaLabel="Layout switch (ms)" value={draft.startMs} disabled={selected.isInitial} variant="editor" onChange={startMs => setDraft(value => ({ ...value, startMs }))} />
      <Button size="xs" variant="outline" className={buttonStyle} disabled={selected.isInitial} onClick={() => void act('move')}>Move switch</Button>
      <label className="block text-xs text-zinc-400">Unique name<input aria-label="Unique Layout name" className={fieldStyle} value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} /></label>
      <div className="flex flex-wrap gap-2"><Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('make-unique')}>Make Layout Unique</Button><Button size="xs" variant="outline" className={buttonStyle} onClick={() => void act('remove')}>Remove occurrence</Button></div>
    </fieldset>}
  </section>
}
