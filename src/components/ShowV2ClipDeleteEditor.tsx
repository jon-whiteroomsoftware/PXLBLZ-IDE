import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import type { ShowV2PilotPreparedCapture, ShowV2PilotAdoptionReceipt, ShowV2PilotClipDeleteIntent, ShowV2PilotClipDeleteOutcome } from '@/store/showV2PreparedEditAdmission'
export interface ShowV2ClipDeleteSubmission {
  intent: ShowV2PilotClipDeleteIntent
  isCurrent: () => boolean
  onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
}
interface Props {
  clipId: string
  capture: ShowV2PilotPreparedCapture
  submitClipDelete: (request: ShowV2ClipDeleteSubmission) => Promise<ShowV2PilotClipDeleteOutcome>
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onDeleted: (clipId: string) => void
  onStatus: (message: string) => void
}
/** Show-scoped lifetime survives optimistic removal of its selected Clip. */
export function ShowV2ClipDeleteEditor({ clipId, capture, submitClipDelete, isCurrentCapture, isCurrentCompletion, onDeleted, onStatus }: Props) {
  const [busy, setBusy] = useState(false)
  const pending = useRef(false), live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const ordinary = capture.record.composition.clips.some(clip => clip.id === clipId)
  const available = ordinary && (capture.inputCapture?.status === 'qualified' || (!capture.inputCapture && capture.prepared.status !== 'refused'))
  const remove = async () => {
    if (pending.current || !available || !isCurrentCapture()) return
    pending.current = true; setBusy(true)
    const selectedId = clipId
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submitClipDelete({ intent: { kind: 'delete-clip', clipId: selectedId }, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adopted.current = receipt } })
      const current = outcome.status === 'applied' ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return
      if (outcome.status === 'applied') { onDeleted(selectedId); onStatus('Clip deleted.') }
      else onStatus(outcome.status === 'refused' ? outcome.message : 'Clip is unchanged.')
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  if (!ordinary && !busy) return null
  return <Button type="button" size="xs" variant="outline" className="mt-3 max-w-full whitespace-normal border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-200" disabled={!available || busy} onClick={() => void remove()}>Delete Clip</Button>
}
