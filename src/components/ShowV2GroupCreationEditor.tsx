import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { buildShowV2GroupCreationEditorModel, planShowV2GroupCreation } from '@/engine/showV2GroupCreationEditorModel'
import { admitShowV2PilotCreateGroup, type ShowV2PilotAdoptionReceipt, type ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'

export function ShowV2GroupCreationEditor({ capture, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record
  const [clipIds, setClipIds] = useState<string[]>([]), [transitionIds, setTransitionIds] = useState<string[]>([])
  const [name, setName] = useState(''), [busy, setBusy] = useState(false)
  const pending = useRef(false), live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useLayoutEffect(() => {
    if (pending.current) return
    setClipIds(ids => ids.filter(id => record.composition.clips.some(clip => clip.id === id)))
    setTransitionIds(ids => ids.filter(id => record.composition.transitions.some(transition => transition.id === id)))
  }, [record, busy])
  const model = buildShowV2GroupCreationEditorModel(record, clipIds, transitionIds)
  const available = !busy && (capture.inputCapture ? capture.inputCapture.status === 'qualified' : capture.prepared.status === 'ready')
  const create = async () => {
    if (pending.current || !available) return
    const plan = planShowV2GroupCreation(record, { clipIds, transitionIds, name }, () => newPersonalContentId())
    if (plan.status === 'refused') { if (isCurrentCapture()) onStatus(plan.message); return }
    pending.current = true; setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await admitShowV2PilotCreateGroup({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
        capture, intent: plan.intent, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adoption.current = receipt } })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Group is unchanged.' : 'Group saved.')
      if (outcome.status === 'applied') { setClipIds([]); setTransitionIds([]) }
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  const toggle = (ids: string[], id: string, checked: boolean) => checked ? [...ids, id] : ids.filter(value => value !== id)
  return <section className="mt-7 space-y-3" aria-label="Create Group">
    <h2 className="text-sm font-medium text-zinc-200">Groups</h2>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (clipIds.length && name.trim()) void create() }}>
      <fieldset disabled={!available} className="space-y-2">
        <legend className="mb-2 text-xs text-zinc-400">Clips</legend>
        {model.clips.map(clip => <label key={clip.id} className="flex items-start gap-2 text-xs text-zinc-300">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={clipIds.includes(clip.id)} onChange={event => setClipIds(ids => toggle(ids, clip.id, event.target.checked))} />
          <span className="min-w-0 break-words">{clip.name} · {clip.zoneName} / {clip.layerName} · {clip.startMs}–{clip.endMs} ms</span>
        </label>)}
      </fieldset>
      {model.transitions.length > 0 && <fieldset disabled={!available} className="space-y-2">
        <legend className="mb-2 text-xs text-zinc-400">Transitions</legend>
        {model.transitions.map(transition => <label key={transition.id} className="flex items-start gap-2 text-xs text-zinc-300">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={transitionIds.includes(transition.id)} onChange={event => setTransitionIds(ids => toggle(ids, transition.id, event.target.checked))} />
          <span className="min-w-0 break-words">{transition.kind} · {transition.id}</span>
        </label>)}
      </fieldset>}
      <label className="block text-xs text-zinc-400">Name<input aria-label="Group name" required value={name} disabled={!available} onChange={event => setName(event.target.value)} className="mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200" /></label>
      <Button type="submit" size="xs" variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800" disabled={!available || !clipIds.length || !name.trim()}>Create Group</Button>
    </form>
  </section>
}
