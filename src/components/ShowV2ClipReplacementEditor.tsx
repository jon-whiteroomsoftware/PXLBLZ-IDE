import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { PatternCombobox } from './PatternCombobox'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { buildShowV2ClipSharingEditorModel, type ShowV2ClipSharingCapture } from '@/engine/showV2ClipSharingEditorModel'
import { createShowV2ClipReplacementIntent, type ShowV2ClipReplacementIntent } from '@/engine/showV2ClipReplacementModel'
import type { ShowV2TimelineSourceChoice } from '@/engine/showV2TimelineEditorModel'
import type { ShowV2PilotAdoptionReceipt } from '@/store/showV2PreparedEditAdmission'
export interface ShowV2ClipReplacementSubmission { intent: ShowV2ClipReplacementIntent; isCurrent: () => boolean; onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void }
type Outcome = { status: 'applied'; settlement: 'saved' | 'superseded' } | { status: 'unchanged' } | { status: 'refused'; message: string }
interface Props {
  clipId: string; capture: ShowV2ClipSharingCapture; sources: ShowV2TimelineSourceChoice[]
  submitReplacement: (request: ShowV2ClipReplacementSubmission) => Promise<Outcome>
  isCurrentCapture: () => boolean; isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (message: string) => void
}
export function ShowV2ClipReplacementEditor({ clipId, capture, sources, submitReplacement, isCurrentCapture, isCurrentCompletion, onStatus }: Props) {
  const model = useMemo(() => buildShowV2ClipSharingEditorModel(capture, clipId), [capture, clipId])
  const [sourceKey, setSourceKey] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const [draftCapture, setDraftCapture] = useState(capture), [draftClipId, setDraftClipId] = useState(clipId), [draftGeneration, setDraftGeneration] = useState(0)
  const pending = useRef(false), live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  if (!busy && (draftCapture !== capture || draftClipId !== clipId)) { setDraftCapture(capture); setDraftClipId(clipId); setSourceKey(null); setDraftGeneration(draftGeneration + 1) }
  const source = sources.find(source => source.key === sourceKey)
  const available = Boolean(model) && !busy && (capture.inputCapture?.status === 'qualified' || (!capture.inputCapture && capture.prepared.status !== 'refused'))
  const submit = async () => {
    if (pending.current || !available || !source || !isCurrentCapture()) return
    const plan = createShowV2ClipReplacementIntent(capture, clipId, source.reference, newPersonalContentId)
    if (plan.status === 'refused') { if (live.current && isCurrentCapture()) onStatus(plan.message); return }
    pending.current = true; setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submitReplacement({ intent: plan.intent, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adopted.current = receipt } })
      const current = outcome.status === 'applied' ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Pattern is unchanged.' : 'Pattern replacement saved.'); setSourceKey(null)
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { setSourceKey(null); onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  if (!model) return null
  return <section aria-label="Replace Pattern" className="mt-7 space-y-3">
    <h2 className="text-sm font-medium text-zinc-200">Replace Pattern</h2>
    <PatternCombobox key={draftGeneration} ariaLabel="Replacement Pattern" value={sourceKey} disabled={!available} options={sources.map(source => ({ value: source.key, label: source.label, group: source.group }))} onChange={setSourceKey}/>
    {model.useCount > 1 && <p className="text-xs text-zinc-500">This Clip changes independently. Linked Clips keep their Pattern, controls and state.</p>}
    <Button type="button" size="xs" variant="outline" className="max-w-full whitespace-normal border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-200" disabled={!available || !source} onClick={() => void submit()}>Replace Pattern</Button>
  </section>
}
