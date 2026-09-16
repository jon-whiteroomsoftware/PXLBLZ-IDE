import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { PatternCombobox } from './PatternCombobox'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import type { ShowV2ClipSharingCapture } from '@/engine/showV2ClipSharingEditorModel'
import { buildShowV2GroupReplacementEditorModel, planShowV2GroupReplacementEdit, previewShowV2GroupReplacement, type ShowV2GroupReplacementIntent } from '@/engine/showV2GroupReplacementEditorModel'
import type { ShowV2TimelineSourceChoice } from '@/engine/showV2TimelineEditorModel'
import type { ShowV2PilotAdoptionReceipt } from '@/store/showV2PreparedEditAdmission'

export interface ShowV2GroupReplacementSubmission { intent: ShowV2GroupReplacementIntent; isCurrent: () => boolean; onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void }
type Outcome = { status: 'applied'; settlement: 'saved' | 'superseded' } | { status: 'unchanged' } | { status: 'refused'; message: string }
interface Props {
  capture: ShowV2ClipSharingCapture; sources: ShowV2TimelineSourceChoice[]
  submitGroupReplacement: (request: ShowV2GroupReplacementSubmission) => Promise<Outcome>
  isCurrentCapture: () => boolean; isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (message: string) => void
}
const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'max-w-full whitespace-normal border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-200'

/** Replaces one definition-local Group Clip Pattern through the explicit Group-edit target context. */
export function ShowV2GroupReplacementEditor({ capture, sources, submitGroupReplacement, isCurrentCapture, isCurrentCompletion, onStatus }: Props) {
  const model = useMemo(() => buildShowV2GroupReplacementEditorModel(capture), [capture])
  const [targetKey, setTargetKey] = useState(''), [sourceKey, setSourceKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false), [draftGeneration, setDraftGeneration] = useState(0)
  const [draftCapture, setDraftCapture] = useState(capture)
  const pending = useRef(false), live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  if (!busy && draftCapture !== capture) {
    setDraftCapture(capture); setSourceKey(null); setConfirming(false); setDraftGeneration(draftGeneration + 1)
    if (!model?.targets.some(target => target.key === targetKey)) setTargetKey('')
  }
  const target = model?.targets.find(value => value.key === targetKey) ?? null
  const source = sources.find(value => value.key === sourceKey) ?? null
  const available = Boolean(model?.targets.length) && !busy && (capture.inputCapture?.status === 'qualified' || (!capture.inputCapture && capture.prepared.status !== 'refused'))
  const preview = target && source ? previewShowV2GroupReplacement(capture, target.definitionId, target.clipId, source.reference) : null
  const losses = preview?.status === 'ready' ? preview.discardedControlTargets : []

  const submit = async () => {
    if (pending.current || !available || !target || !source || !isCurrentCapture()) return
    const plan = planShowV2GroupReplacementEdit(capture, target.definitionId, target.clipId, source.reference, newPersonalContentId)
    if (plan.status === 'refused') { if (live.current && isCurrentCapture()) onStatus(plan.message); return }
    pending.current = true; setBusy(true); setConfirming(false)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submitGroupReplacement({ intent: plan.intent, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adopted.current = receipt } })
      const current = outcome.status === 'applied' ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Group Pattern is unchanged.' : 'Group Pattern replacement saved.')
      setSourceKey(null)
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { setSourceKey(null); onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  const request = () => {
    if (!target || !source) return
    if (preview?.status === 'refused') { onStatus(preview.message); return }
    if (losses.length > 0) { setConfirming(true); return }
    void submit()
  }

  if (!model?.targets.length) return null
  return <section aria-label="Replace Group Pattern" className="mt-7 space-y-3">
    <h2 className="text-sm font-medium text-zinc-200">Replace Group Pattern</h2>
    <label className="block text-xs text-zinc-400">Group Clip<select aria-label="Group Clip" disabled={busy} className={fieldStyle} value={targetKey}
      onChange={event => { setTargetKey(event.target.value); setConfirming(false) }}>
      <option value="">Choose Group Clip</option>
      {model.targets.map(value => <option key={value.key} value={value.key}>{value.definitionName} · {value.clipId} · {value.patternName}</option>)}
    </select></label>
    {target && <p className="text-xs text-zinc-500">{target.context === 'dormant-definition'
      ? 'This Group has no occurrences. Replacement edits the local template only.'
      : `Replacement changes ${target.occurrenceIds.length} linked occurrence${target.occurrenceIds.length === 1 ? '' : 's'}. Make Group Unique first to select one.`}</p>}
    <PatternCombobox key={draftGeneration} ariaLabel="Replacement Group Pattern" value={sourceKey} disabled={!available || !target}
      options={sources.map(value => ({ value: value.key, label: value.label, group: value.group }))} onChange={value => { setSourceKey(value); setConfirming(false) }}/>
    {target && target.sharedRuntimeIds.length > 0 && <p className="text-xs text-zinc-500">This Group Clip changes independently. Other users keep their Pattern, controls and state.</p>}
    {confirming
      ? <div role="group" aria-label="Confirm Group animation loss" className="space-y-2 rounded-sm border border-amber-800/60 bg-amber-950/30 p-3">
        <p className="text-xs text-amber-200">Replacement drops {losses.length} incompatible control{losses.length === 1 ? '' : 's'}: {losses.map(loss => loss.kind === 'instance-control' ? loss.exportName : loss.kind).join(', ')}. {losses.length === 1 ? 'Its' : 'Their'} animation is removed.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="xs" variant="outline" className={buttonStyle} onClick={() => void submit()}>Confirm Group replacement</Button>
          <Button type="button" size="xs" variant="outline" className={buttonStyle} onClick={() => { setConfirming(false); onStatus('Group Pattern replacement cancelled.') }}>Cancel Group replacement</Button>
        </div>
      </div>
      : <Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={!available || !target || !source} onClick={request}>Replace Group Pattern</Button>}
  </section>
}
