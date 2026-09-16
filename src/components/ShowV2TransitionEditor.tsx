import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { buildShowV2TransitionEditorModel, planShowV2TransitionEdit, type ShowV2TransitionEditorIntent, type ShowV2TransitionEditorRequest } from '@/engine/showV2TransitionEditorModel'
import type { ShowCrossfadePolicy } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'

export interface ShowV2TransitionSubmission {
  intent: ShowV2TransitionEditorIntent
  isCurrent: () => boolean
  onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
}
type SubmissionOutcome = { status: 'applied'; settlement: 'saved' | 'superseded' } | { status: 'unchanged' } | { status: 'refused'; message: string }
const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'

function settingsDraft(record: ShowRecordV2, stageDimensions: 1 | 2 | 3, transitionId: string) {
  const selected = buildShowV2TransitionEditorModel(record, stageDimensions).transitions.find(value => value.id === transitionId)
  return {
    kindKey: selected?.kindKey ?? 'transition:blend:crossfade',
    crossfadePolicy: (selected?.crossfadePolicy ?? 'live-live') as ShowCrossfadePolicy,
  }
}

/**
 * Explicit Transition authoring on the opt-in v2 route. Cut stays the absence of
 * a Transition; this surface selects derived junctions and existing identities.
 */
export function ShowV2TransitionEditor({ capture, submitTransitionEdit, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture
  submitTransitionEdit: (request: ShowV2TransitionSubmission) => Promise<SubmissionOutcome>
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record
  const stageDimensions: 1 | 2 | 3 = capture.dependencies.stageMap?.dim === 3 ? 3 : 2
  const model = buildShowV2TransitionEditorModel(record, stageDimensions)
  const [junctionKey, setJunctionKey] = useState('')
  const [transitionId, setTransitionId] = useState('')
  const [durationMs, setDurationMs] = useState(1_000)
  const [draft, setDraft] = useState(() => settingsDraft(record, stageDimensions, ''))
  const [busy, setBusy] = useState(false), pending = useRef(false), live = useRef(true)
  const draftRecord = useRef(record), latestRecord = useRef(record)
  useLayoutEffect(() => { latestRecord.current = record }, [record])
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useLayoutEffect(() => {
    if (pending.current || draftRecord.current === record) return
    draftRecord.current = record
    const current = buildShowV2TransitionEditorModel(record, stageDimensions)
    const nextJunction = current.junctions.some(value => value.key === junctionKey) ? junctionKey : ''
    const nextTransition = current.transitions.some(value => value.id === transitionId) ? transitionId : ''
    setJunctionKey(nextJunction); setTransitionId(nextTransition); setDraft(settingsDraft(record, stageDimensions, nextTransition))
  }, [record, stageDimensions, junctionKey, transitionId, busy])
  const selected = model.transitions.find(value => value.id === transitionId)
  const available = !busy && (capture.inputCapture?.status === 'qualified' || (!capture.inputCapture && capture.prepared.status === 'ready'))

  const act = async (request: ShowV2TransitionEditorRequest) => {
    if (pending.current || !available) return
    const plan = planShowV2TransitionEdit(record, request, () => newPersonalContentId(), stageDimensions)
    if (plan.status === 'refused') { if (isCurrentCapture()) onStatus(plan.message); return }
    pending.current = true; setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submitTransitionEdit({ intent: plan.intent, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adopted.current = receipt } })
      const current = outcome.status === 'applied'
        ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Transition is unchanged.' : 'Transition saved.')
      if (outcome.status === 'applied' && adopted.current) {
        const adoptedRecord = adopted.current.record
        const id = request.kind === 'insert' && plan.intent.kind === 'insert' ? plan.intent.transition.id : request.kind === 'settings' ? request.transitionId : ''
        draftRecord.current = adoptedRecord
        setJunctionKey('')
        setTransitionId(id)
        setDraft(settingsDraft(adoptedRecord, stageDimensions, id))
      }
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { draftRecord.current = latestRecord.current; onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }

  return <section aria-label="Transitions" data-testid="show-v2-transitions" className="mt-7 space-y-3">
    <h2 className="text-sm font-medium text-zinc-200">Transitions</h2>
    <label className="block text-xs text-zinc-400">Cut junction<select aria-label="Cut junction" disabled={busy} className={fieldStyle} value={junctionKey} onChange={event => { setJunctionKey(event.target.value); draftRecord.current = record }}>
      <option value="">Choose junction</option>{model.junctions.map(junction => <option key={junction.key} value={junction.key}>{junction.label}</option>)}</select></label>
    <label className="block text-xs text-zinc-400">Transition<select aria-label="Transition" disabled={busy} className={fieldStyle} value={selected ? transitionId : ''} onChange={event => { setTransitionId(event.target.value); setDraft(settingsDraft(record, stageDimensions, event.target.value)); draftRecord.current = record }}>
      <option value="">Choose Transition</option>{model.transitions.map(transition => <option key={transition.id} value={transition.id}>{transition.label}</option>)}</select></label>
    <fieldset disabled={!available} className="space-y-3">
      <label className="block text-xs text-zinc-400">Kind<select aria-label="Transition kind" className={fieldStyle} value={draft.kindKey} onChange={event => setDraft(value => ({ ...value, kindKey: event.target.value }))}>
        {model.kinds.map(kind => <option key={kind.key} value={kind.key} disabled={!kind.compatible}>{kind.familyLabel} · {kind.label}</option>)}</select></label>
      <label className="block text-xs text-zinc-400">Crossfade policy<select aria-label="Crossfade policy" className={fieldStyle} value={draft.crossfadePolicy} onChange={event => setDraft(value => ({ ...value, crossfadePolicy: event.target.value as ShowCrossfadePolicy }))}>
        <option value="live-live">Live and live</option><option value="snapshot-live">Snapshot and live</option></select></label>
      <NumberField label="New Transition duration" ariaLabel="New Transition duration" value={durationMs} min={1} step={1} suffix="ms" variant="editor" onChange={setDurationMs} />
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="outline" className={buttonStyle} disabled={!junctionKey} onClick={() => void act({ kind: 'insert', junctionKey, kindKey: draft.kindKey, durationMs, crossfadePolicy: draft.crossfadePolicy })}>Insert Transition</Button>
        <Button size="xs" variant="outline" className={buttonStyle} disabled={!selected} onClick={() => void act({ kind: 'settings', transitionId, kindKey: draft.kindKey, crossfadePolicy: draft.crossfadePolicy })}>Apply settings</Button>
        <Button size="xs" variant="outline" className={buttonStyle} disabled={!selected} onClick={() => void act({ kind: 'reset', transitionId })}>Reset to Cut</Button>
      </div>
    </fieldset>
  </section>
}
