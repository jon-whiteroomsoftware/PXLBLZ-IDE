import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import {
  buildShowV2PropertyEditorModel, createShowV2PropertyKeyIntent, createShowV2PropertyTrackIntent,
  propertyEasingDraft, propertyEasingFromDraft, propertyKeyPatchFromDraft, propertyTrackPatchFromDraft,
  type ShowV2PropertyEasingDraft,
} from '@/engine/showV2PropertyEditorModel'
import type { ShowPropertyEditIntentV2, ShowPropertyTrackOwnerV2 } from '@/engine/showPropertyEditsV2'
import type { ShowPropertyTargetV2, ShowPropertyTrackV2 } from '@/engine/showCompositionV2'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'

const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const targetSignature = (target: ShowPropertyTargetV2) => JSON.stringify(Object.entries(target).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
export interface ShowV2PropertySubmission {
  propertyOwner: ShowPropertyTrackOwnerV2; intent: ShowPropertyEditIntentV2
  isCurrent: () => boolean; onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
}
type SubmissionOutcome = { status: 'applied'; settlement: 'saved' | 'superseded' } | { status: 'unchanged' } | { status: 'refused'; message: string }
interface EditorProps {
  capture: ShowV2PilotPreparedCapture
  submitPropertyEdit: (request: ShowV2PropertySubmission) => Promise<SubmissionOutcome>
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
  /** A track an outside surface selected, such as an animation lane. */
  selectedTrackId?: string
  onSelectTrack?: (trackId: string) => void
}

/** A typed UI boundary sends authored intent only. The Route binds the prepared Property owner. */
export function ShowV2PropertyEditor({ capture, submitPropertyEdit, isCurrentCapture, isCurrentCompletion, onStatus, selectedTrackId, onSelectTrack }: EditorProps) {
  const [ownerKey, setOwnerKey] = useState(''), [trackId, setTrackId] = useState(''), [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false), [reset, setReset] = useState(0)
  const pending = useRef(false), live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const selectTrack = (next: string) => { setTrackId(next); onSelectTrack?.(next) }
  // A lane selection names a track without naming its owner, so the owner the
  // panel shows follows the record's own ownership of that track.
  const ownerOfSelected = selectedTrackId === undefined ? undefined
    : capture.record.composition.propertyTracks.some(track => track.id === selectedTrackId) ? 'show'
      : capture.record.composition.groupDefinitions.find(definition => definition.propertyTracks.some(track => track.id === selectedTrackId))?.id
  const effectiveOwnerKey = ownerOfSelected === undefined ? ownerKey : ownerOfSelected === 'show' ? 'show' : `group:${ownerOfSelected}`
  const owner: ShowPropertyTrackOwnerV2 | undefined = effectiveOwnerKey === 'show' ? { kind: 'show' }
    : effectiveOwnerKey.startsWith('group:') ? { kind: 'group-definition', definitionId: effectiveOwnerKey.slice(6) } : undefined
  const model = buildShowV2PropertyEditorModel(capture, owner)
  // A selection the caller still holds for a track this record no longer has
  // selects nothing here, so the panel's own choice stays reachable.
  const callerTrackId = selectedTrackId !== undefined && model.tracks.some(value => value.id === selectedTrackId)
    ? selectedTrackId
    : undefined
  const track = model.tracks.find(value => value.id === (callerTrackId ?? trackId))
  const [draftRecord, setDraftRecord] = useState(capture.record)
  if (!busy && draftRecord !== capture.record) {
    setDraftRecord(capture.record); setReset(value => value + 1)
    // Only this component's own state: notifying the caller here would update
    // it while this one renders.
    if (trackId && !track) setTrackId('')
  }
  const submit = async (intent: ShowPropertyEditIntentV2) => {
    if (!owner || pending.current) return
    pending.current = true; setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submitPropertyEdit({ propertyOwner: owner, intent, isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adopted.current = receipt } })
      const current = outcome.status === 'applied'
        ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Property is unchanged.' : 'Property saved.')
      if (outcome.status === 'refused' || outcome.status === 'unchanged') setReset(value => value + 1)
      if (outcome.status === 'applied') {
        if (intent.kind === 'add-track') { selectTrack(intent.track.id); setCreating(false) }
        if (intent.kind === 'remove-track') selectTrack('')
      }
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { setReset(value => value + 1); onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  const available = !busy && (capture.inputCapture?.status === 'qualified' || (!capture.inputCapture && capture.prepared.status !== 'refused'))
  return <section aria-label="Properties" className="mt-7 space-y-3">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium text-zinc-200">Properties</h2>
      <Button size="xs" variant="outline" className={buttonStyle} disabled={!available || !model.selected} onClick={() => { setCreating(true); selectTrack('') }}>New track</Button></div>
    <label className="block text-xs text-zinc-400">Owner<select aria-label="Property owner" className={fieldStyle} disabled={busy} value={model.selected ? effectiveOwnerKey : ''} onChange={event => { setOwnerKey(event.target.value); selectTrack(''); setCreating(false) }}>
      <option value="">Choose Show or Group definition</option>{model.owners.map(choice => <option key={choice.key} value={choice.owner.kind === 'show' ? 'show' : `group:${choice.owner.definitionId}`}>{choice.label}</option>)}</select></label>
    {model.selected && <p className="text-xs text-zinc-500">{model.selected.owner.kind === 'show' ? 'Show milliseconds.' : `Definition-local milliseconds. Changes affect ${model.selected.linkedOccurrenceIds.length} linked occurrences.`}</p>}
    <label className="block text-xs text-zinc-400">Track<select aria-label="Property track" className={fieldStyle} disabled={busy || !model.selected} value={track?.id ?? ''} onChange={event => { selectTrack(event.target.value); setCreating(false) }}>
      <option value="">Choose persisted track</option>{model.tracks.map(value => <option key={value.id} value={value.id}>{value.id} · {value.target.kind}</option>)}</select></label>
    {model.selected && (creating || track) && <PropertyFields key={`${effectiveOwnerKey}:${track?.id ?? 'new'}:${reset}`} capture={capture} owner={model.selected.owner} track={track}
      available={available} busy={busy} submit={intent => { void submit(intent) }} report={message => { if (isCurrentCapture()) onStatus(message) }} />}
  </section>
}

interface KeyDraft { timeMs: string; value: string; easing: ShowV2PropertyEasingDraft }
const blankKey = (): KeyDraft => ({ timeMs: '', value: '', easing: { curve: 'linear' } })
function PropertyFields({ capture, owner, track, available, busy, submit, report }: {
  capture: ShowV2PilotPreparedCapture; owner: ShowPropertyTrackOwnerV2; track?: ShowPropertyTrackV2
  available: boolean; busy: boolean; submit: (intent: ShowPropertyEditIntentV2) => void; report: (message: string) => void
}) {
  const [targetDirty, setTargetDirty] = useState<string | undefined>(), [startDirty, setStartDirty] = useState<string | undefined>(), [durationDirty, setDurationDirty] = useState<string | undefined>()
  const start = startDirty ?? (track ? String(track.activeStartMs) : ''), duration = durationDirty ?? (track ? String(track.activeDurationMs) : '')
  const model = buildShowV2PropertyEditorModel(capture, owner, { activeStartMs: start.trim() ? Number(start) : NaN, activeDurationMs: duration.trim() ? Number(duration) : NaN })
  const choice = model.targets.find(value => targetDirty !== undefined ? value.key === targetDirty : track && targetSignature(value.target) === targetSignature(track.target))
  const targetKey = targetDirty ?? choice?.key ?? (track ? JSON.stringify(track.target) : '')
  const [newKeys, setNewKeys] = useState<KeyDraft[]>([blankKey(), blankKey()])
  const [keyId, setKeyId] = useState(''), [addingKey, setAddingKey] = useState(false)
  const [keyTime, setKeyTime] = useState<string | undefined>(), [keyValue, setKeyValue] = useState<string | undefined>(), [keyEasing, setKeyEasing] = useState<ShowV2PropertyEasingDraft | undefined>()
  const key = track?.keyframes.find(value => value.id === keyId)
  const resetKey = () => { setKeyTime(undefined); setKeyValue(undefined); setKeyEasing(undefined) }
  const selectedTarget = (): ShowPropertyTargetV2 | undefined => choice?.target
  const ordinaryDraft = (draft: KeyDraft) => {
    const easing = propertyEasingFromDraft(draft.easing)
    return easing ? { timeMs: draft.timeMs, value: draft.value, easing } : undefined
  }
  return <>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (!available) return
      if (track) {
        if (targetDirty !== undefined && !selectedTarget()) { report('Choose an eligible exact Property target.'); return }
        submit({ kind: 'update-track', trackId: track.id, patch: propertyTrackPatchFromDraft({
          ...(targetDirty !== undefined ? { target: selectedTarget()! } : {}), ...(startDirty !== undefined ? { activeStartMs: startDirty } : {}), ...(durationDirty !== undefined ? { activeDurationMs: durationDirty } : {}),
        }) }); return
      }
      const drafts = newKeys.map(ordinaryDraft)
      if (drafts.some(value => !value)) { report('Complete each key’s outgoing curve.'); return }
      const plan = createShowV2PropertyTrackIntent(model.tracks, selectedTarget(), start, duration, drafts.map(value => value!), newPersonalContentId)
      if (plan.status === 'refused') { report(plan.message); return }
      submit(plan.intent)
    }}>
      <label className="block text-xs text-zinc-400">Target<select aria-label="Property target" className={fieldStyle} disabled={!available} value={targetKey} onChange={event => setTargetDirty(event.target.value)}>
        <option value="">Choose exact target</option>{track && !choice && <option value={JSON.stringify(track.target)}>Current target · unavailable for this activation</option>}
        {model.targets.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}</select></label>
      {!!choice?.sharedClipIds.length && <p className="break-words text-xs text-zinc-500">Shared consumers: {choice.sharedClipIds.join(', ')}.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <NumericField label="Activation start (ms)" aria="Property activation start" value={start} disabled={!available} onChange={setStartDirty} />
        <NumericField label="Duration (ms)" aria="Property activation duration" value={duration} disabled={!available} onChange={setDurationDirty} />
      </div>
      {!track && <>
        {newKeys.map((draft, index) => <fieldset key={index} className="space-y-2 border-t border-zinc-800 pt-3"><legend className="text-xs text-zinc-400">Key {index + 1}</legend>
          <KeyFields prefix={`New key ${index + 1}`} draft={draft} disabled={!available} onChange={patch => setNewKeys(values => values.map((value, position) => position === index ? { ...value, ...patch } : value))} />
        </fieldset>)}
        <Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => setNewKeys(values => [...values, blankKey()])}>Another key</Button>
      </>}
      <div className="flex flex-wrap gap-2"><Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>{track ? 'Apply track' : 'Create track'}</Button>
        {track && <Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => submit({ kind: 'remove-track', trackId: track.id })}>Remove track</Button>}</div>
    </form>
    {track && <>
      <div className="flex items-center justify-between gap-2"><h3 className="pt-3 text-sm text-zinc-200">Keys</h3>
        <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => { setAddingKey(true); setKeyId(''); resetKey() }}>Add key</Button></div>
      <label className="block text-xs text-zinc-400">Key<select aria-label="Property key" className={fieldStyle} disabled={busy} value={key?.id ?? ''} onChange={event => { setKeyId(event.target.value); setAddingKey(false); resetKey() }}>
        <option value="">Choose exact key</option>{track.keyframes.map(value => <option key={value.id} value={value.id}>{value.id} · {value.timeMs} ms · {value.value}</option>)}</select></label>
      {(key || addingKey) && <form className="space-y-3" onSubmit={event => {
        event.preventDefault(); if (!available) return
        if (key) {
          const easing = keyEasing ? propertyEasingFromDraft(keyEasing) : undefined
          if (keyEasing && !easing) { report('Complete a valid outgoing curve.'); return }
          submit({ kind: 'update-key', trackId: track.id, keyId: key.id, patch: propertyKeyPatchFromDraft({
            ...(keyTime !== undefined ? { timeMs: keyTime } : {}), ...(keyValue !== undefined ? { value: keyValue } : {}), ...(easing ? { easing } : {}),
          }) }); return
        }
        const easing = propertyEasingFromDraft(keyEasing ?? { curve: 'linear' })
        if (!easing) { report('Complete a valid outgoing curve.'); return }
        const plan = createShowV2PropertyKeyIntent(track, { timeMs: keyTime ?? '', value: keyValue ?? '', easing }, newPersonalContentId)
        if (plan.status === 'refused') { report(plan.message); return } submit(plan.intent)
      }}>
        {key?.curveSegment && <p className="text-xs text-zinc-500">This key has a retained curve. An explicit edit reauthors its segment and affected neighbors.</p>}
        <KeyFields prefix="Key" draft={{ timeMs: keyTime ?? (key ? String(key.timeMs) : ''), value: keyValue ?? (key ? String(key.value) : ''), easing: keyEasing ?? (key ? propertyEasingDraft(key.easing) : { curve: 'linear' }) }} disabled={!available}
          onChange={patch => { if (patch.timeMs !== undefined) setKeyTime(patch.timeMs); if (patch.value !== undefined) setKeyValue(patch.value); if (patch.easing !== undefined) setKeyEasing(patch.easing) }} />
        <div className="flex flex-wrap gap-2"><Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>{key ? 'Apply key' : 'Create key'}</Button>
          {key && <Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => submit({ kind: 'remove-key', trackId: track.id, keyId: key.id })}>Remove key</Button>}</div>
      </form>}
    </>}
  </>
}

function NumericField({ label, aria, value, disabled, onChange }: { label: string; aria: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="block text-xs text-zinc-400">{label}<input aria-label={aria} className={fieldStyle} type="text" inputMode="decimal" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /></label>
}
function KeyFields({ prefix, draft, disabled, onChange }: { prefix: string; draft: KeyDraft; disabled: boolean; onChange: (patch: Partial<KeyDraft>) => void }) {
  const update = (patch: Partial<ShowV2PropertyEasingDraft>) => onChange({ easing: { ...draft.easing, ...patch } })
  const numericFields: Array<[keyof ShowV2PropertyEasingDraft, string]> = draft.easing.curve === 'cubic-bezier' ? [['x1', 'Control 1 X'], ['y1', 'Control 1 Y'], ['x2', 'Control 2 X'], ['y2', 'Control 2 Y']]
    : draft.easing.curve === 'steps' ? [['steps', 'Steps']] : draft.easing.curve === 'hold' ? [['at', 'Switch point']] : draft.easing.curve === 'back' ? [['overshoot', 'Overshoot']] : []
  const directional = ['quadratic', 'cubic', 'sine', 'back'].includes(draft.easing.curve)
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <NumericField label="Time (ms)" aria={prefix === 'Key' ? 'Property key time' : `${prefix} time`} value={draft.timeMs} disabled={disabled} onChange={timeMs => onChange({ timeMs })} />
      <NumericField label="Value" aria={prefix === 'Key' ? 'Property key value' : `${prefix} value`} value={draft.value} disabled={disabled} onChange={value => onChange({ value })} />
    </div>
    <label className="block text-xs text-zinc-400">Outgoing curve<select aria-label={`${prefix} curve`} className={fieldStyle} disabled={disabled} value={draft.easing.curve} onChange={event => update({ curve: event.target.value as ShowV2PropertyEasingDraft['curve'] })}>
      {['linear', 'quadratic', 'cubic', 'sine', 'cubic-bezier', 'steps', 'hold', 'back'].map(curve => <option key={curve} value={curve}>{curve}</option>)}</select></label>
    {directional && <label className="block text-xs text-zinc-400">Direction<select aria-label={`${prefix} direction`} className={fieldStyle} disabled={disabled} value={draft.easing.direction ?? ''} onChange={event => update({ direction: event.target.value })}>
      <option value="">Choose direction</option>{['in', 'out', 'in-out'].map(direction => <option key={direction} value={direction}>{direction}</option>)}</select></label>}
    <div className="grid gap-3 sm:grid-cols-2">{numericFields.map(([field, label]) => <NumericField key={field} label={label} aria={`${prefix} ${label}`} disabled={disabled} value={draft.easing[field] ?? ''} onChange={value => update({ [field]: value })} />)}</div>
    {draft.easing.curve === 'steps' && <label className="block text-xs text-zinc-400">Position<select aria-label={`${prefix} position`} className={fieldStyle} disabled={disabled} value={draft.easing.position ?? ''} onChange={event => update({ position: event.target.value })}>
      <option value="">Choose step position</option><option value="start">Start</option><option value="end">End</option></select></label>}
  </>
}
