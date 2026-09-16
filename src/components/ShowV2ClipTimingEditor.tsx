import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { PatternCombobox } from './PatternCombobox'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { allocateShowClipTimingIdsV2, selectedShowOrdinaryClipV2, type ShowV2TimelineRow, type ShowV2TimelineSourceChoice } from '@/engine/showV2TimelineEditorModel'
import type { CreateShowClipIntentV2 } from '@/engine/showClipCreationV2'
import type { ShowClipTemporalIntentV2 } from '@/engine/showClipTemporalV2'
import type { ShowInsertTimeIntentV2 } from '@/engine/showTimelineV2'
import {
  admitShowV2PilotCreateClip, admitShowV2PilotClipTemporal, admitShowV2PilotInsertTime, admitShowV2PilotSetShowEnd,
  type ShowV2PilotPreparedCapture, type ShowV2PilotAdoptionReceipt,
} from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'

type TimingCommand = { owner: 'create'; intent: CreateShowClipIntentV2 } | { owner: 'clip'; intent: ShowClipTemporalIntentV2 }
  | { owner: 'insert'; intent: ShowInsertTimeIntentV2 } | { owner: 'end'; intent: { kind: 'set-show-end'; showEndMs: number } }
const selectStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const timingButtonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
export function ShowV2ClipTimingEditor({ capture, sources, selectedClipId, onSelectClip, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture; sources: ShowV2TimelineSourceChoice[]; selectedClipId: string; onSelectClip: (id: string) => void
  isCurrentCapture: () => boolean; isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean; onStatus: (status: string) => void
}) {
  const record = capture.record
  const clip = selectedShowOrdinaryClipV2(record, selectedClipId)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const [fieldReset, setFieldReset] = useState(0)
  const [adding, setAdding] = useState(false)
  const [sourceKey, setSourceKey] = useState<string | null>(null)
  const source = sources.find(source => source.key === sourceKey)
  const [runtimeChoice, setRuntimeChoice] = useState('')
  const [zoneId, setZoneId] = useState(record.zones[0]?.id ?? '')
  const [layerId, setLayerId] = useState(record.composition.layers.find(layer => layer.zoneId === zoneId)?.id ?? '')
  const [createStart, setCreateStart] = useState(clip ? clip.startMs + clip.durationMs : 0)
  const [createDuration, setCreateDuration] = useState(1000)
  const [insertAt, setInsertAt] = useState(0)
  const [insertDuration, setInsertDuration] = useState(1000)
  const restoreDrafts = () => { setFieldReset(value => value + 1) }
  const submit = async (command: TimingCommand, selectAfter?: string): Promise<boolean> => {
    if (pending.current) return false
    pending.current = true; setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    const context = { showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0, capture,
      isCurrent: () => live.current && isCurrentCapture(), onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => { adoption.current = receipt } }
    try {
      const outcome = command.owner === 'create' ? await admitShowV2PilotCreateClip({ ...context, intent: command.intent })
        : command.owner === 'clip' ? await admitShowV2PilotClipTemporal({ ...context, intent: command.intent })
          : command.owner === 'insert' ? await admitShowV2PilotInsertTime({ ...context, intent: command.intent })
            : await admitShowV2PilotSetShowEnd({ ...context, intent: command.intent })
      const current = outcome.status === 'applied' ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved') : isCurrentCapture()
      if (!live.current || !current) return false
      if (outcome.status === 'refused') restoreDrafts()
      const label = command.owner === 'insert' ? 'Insert Time' : command.owner === 'end' ? 'Show End' : 'Clip'
      onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? `${label} is unchanged.` : `${label} saved.`)
      if (outcome.status === 'applied' && selectAfter) onSelectClip(selectAfter)
      return outcome.status === 'applied'
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { restoreDrafts(); onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
      return false
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  const split = (splitAt: number) => {
    if (!clip || pending.current) return
    const ids = allocateShowClipTimingIdsV2(record, 'split', false, () => newPersonalContentId())
    if (ids.status === 'refused') { onStatus(ids.message); return }
    void submit({ owner: 'clip', intent: { kind: 'split', clipId: clip.id, atMs: splitAt, rightClipId: ids.clipId } }, ids.clipId)
  }
  const add = async () => {
    if (!source || !runtimeChoice || pending.current) return
    const first = runtimeChoice === 'first' && source.runtimeIds.length === 0
    const existingId = runtimeChoice.startsWith('runtime:') ? runtimeChoice.slice('runtime:'.length) : ''
    if (!first && !source.runtimeIds.includes(existingId)) { onStatus('Select one existing runtime for this Pattern source.'); return }
    const ids = allocateShowClipTimingIdsV2(record, 'create', first, () => newPersonalContentId())
    if (ids.status === 'refused') { onStatus(ids.message); return }
    const intent: CreateShowClipIntentV2 = { kind: 'create-clip', patternReference: { ...source.reference },
      clip: { id: ids.clipId, zoneId, layerId, startMs: createStart, durationMs: createDuration, entryPolicy: 'continue', zoneSampleMode: 'span',
        appearance: { keys: [{ id: ids.appearanceKeyId!, timeMs: createStart, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] } },
      runtime: first ? { kind: 'first', instance: { id: ids.instanceId!, pattern: { ...source.reference }, patternName: source.name, time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: {} } } : { kind: 'existing', instanceId: existingId } }
    if (await submit({ owner: 'create', intent }, ids.clipId)) setAdding(false)
  }
  const available = capture.prepared.status !== 'refused'
  return <div className="mt-7 space-y-5" data-testid="show-v2-clip-timing">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium">Clips</h2><Button size="xs" variant="outline" disabled={busy || !available} onClick={() => setAdding(true)} className={timingButtonStyle}>Add Clip</Button></div>
    {adding && <div className="space-y-3">
      <PatternCombobox ariaLabel="Clip Pattern" value={sourceKey} disabled={busy} options={sources.map(source => ({ value: source.key, label: source.label, group: source.group }))} onChange={key => { const next = sources.find(source => source.key === key)!; setSourceKey(key); setRuntimeChoice(next.runtimeIds.length === 0 ? 'first' : next.runtimeIds.length === 1 ? `runtime:${next.runtimeIds[0]}` : '') }} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs text-zinc-500">Zone<select aria-label="Clip Zone" value={zoneId} disabled={busy} className={selectStyle} onChange={event => { const zone = event.target.value; setZoneId(zone); if (!record.composition.layers.some(layer => layer.id === layerId && layer.zoneId === zone)) setLayerId(record.composition.layers.find(layer => layer.zoneId === zone)?.id ?? '') }}>{record.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        <label className="min-w-0 text-xs text-zinc-500">Layer<select aria-label="Clip Layer" value={layerId} disabled={busy} className={selectStyle} onChange={event => setLayerId(event.target.value)}>{record.composition.layers.filter(layer => layer.zoneId === zoneId).sort((a, b) => a.rank - b.rank).map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
      </div>
      {source && <label className="block text-xs text-zinc-500">Runtime<select aria-label="Clip runtime" value={runtimeChoice} disabled={busy} className={selectStyle} onChange={event => setRuntimeChoice(event.target.value)}>{source.runtimeIds.length > 1 && <option value="">Select runtime</option>}{source.runtimeIds.length === 0 ? <option value="first">First runtime</option> : source.runtimeIds.map(id => <option key={id} value={`runtime:${id}`}>{id}</option>)}</select></label>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><NumberField label="New Clip start" value={createStart} disabled={busy} step={1} suffix="ms" variant="editor" onChange={setCreateStart}/><NumberField label="New Clip duration" value={createDuration} disabled={busy} step={1} suffix="ms" variant="editor" onChange={setCreateDuration}/></div>
      <div className="flex flex-wrap gap-2"><Button size="xs" variant="outline" disabled={busy || !source || !runtimeChoice} onClick={() => void add()} className={timingButtonStyle}>Add</Button><Button size="xs" variant="outline" disabled={busy} onClick={() => setAdding(false)} className={timingButtonStyle}>Cancel</Button></div>
    </div>}
    {clip && <div key={`${clip.id}:${clip.startMs}:${clip.durationMs}:${fieldReset}`} className="space-y-3">
      <div className="truncate text-sm">{sources.find(source => source.runtimeIds.includes(clip.instanceId))?.name ?? clip.id}</div>
      <NumberField label="Clip start" value={clip.startMs} disabled={busy || !available} step={1} suffix="ms" variant="editor" onChange={startMs => void submit({ owner: 'clip', intent: { kind: 'move', clipId: clip.id, startMs } })}/>
      <ClipTimingBounds startMs={clip.startMs} endMs={clip.startMs + clip.durationMs} disabled={busy || !available} onBounds={(kind, startMs, endMs) => { void submit({ owner: 'clip', intent: { kind, clipId: clip.id, startMs, endMs } }) }} onSplit={split}/>
    </div>}
    <div className="space-y-3"><h2 className="text-sm font-medium">Insert Time</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><NumberField label="Insert at" value={insertAt} disabled={busy || !available} step={1} suffix="ms" variant="editor" onChange={setInsertAt}/><NumberField label="Insert duration" value={insertDuration} disabled={busy || !available} step={1} suffix="ms" variant="editor" onChange={setInsertDuration}/></div><Button size="xs" variant="outline" disabled={busy || !available} onClick={() => void submit({ owner: 'insert', intent: { atMs: insertAt, durationMs: insertDuration } })} className={timingButtonStyle}>Insert Time</Button></div>
    <div key={`end:${fieldReset}`}><NumberField label="Show End" value={record.composition.showEndMs} disabled={busy || !available} step={1} suffix="ms" variant="editor" onChange={showEndMs => void submit({ owner: 'end', intent: { kind: 'set-show-end', showEndMs } })}/></div>
  </div>
}
function ClipTimingBounds({ startMs, endMs, disabled, onBounds, onSplit }: { startMs: number; endMs: number; disabled: boolean; onBounds: (kind: 'trim' | 'extend', start: number, end: number) => void; onSplit: (atMs: number) => void }) {
  const [start, setStart] = useState(startMs)
  const [end, setEnd] = useState(endMs)
  const [splitAt, setSplitAt] = useState(startMs)
  return <>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><NumberField label="Bounds start" value={start} disabled={disabled} step={1} suffix="ms" variant="editor" onChange={setStart}/><NumberField label="Bounds end" value={end} disabled={disabled} step={1} suffix="ms" variant="editor" onChange={setEnd}/></div>
    <div className="flex flex-wrap gap-2">{(['trim', 'extend'] as const).map(kind => <Button key={kind} size="xs" variant="outline" disabled={disabled} onClick={() => onBounds(kind, start, end)} className={timingButtonStyle}>{kind === 'trim' ? 'Trim' : 'Extend'}</Button>)}</div>
    <NumberField label="Split at" value={splitAt} disabled={disabled} step={1} suffix="ms" variant="editor" onChange={setSplitAt}/><Button size="xs" variant="outline" disabled={disabled} onClick={() => onSplit(splitAt)} className={timingButtonStyle}>Split</Button>
  </>
}
export function ShowV2TimelineRows({ rows, showEndMs, selectedClipId, onSelectClip }: { rows: ShowV2TimelineRow[]; showEndMs: number; selectedClipId: string; onSelectClip: (id: string) => void }) {
  return <div className="space-y-3 border-t border-zinc-800 p-3" data-testid="show-v2-timeline"><div className="flex justify-between font-mono text-xs text-zinc-500"><h2>Timeline</h2><span>0 – {showEndMs} ms</span></div>{rows.map(row => <div key={row.layerId}><div className="mb-1 truncate text-xs text-zinc-500">{row.zoneName} / {row.layerName}</div><div className="space-y-1">{row.items.map(item => {
    const style = { marginLeft: `${100 * item.startMs / showEndMs}%`, width: `${100 * (item.endMs - item.startMs) / showEndMs}%` }
    const label = `${item.name} · ${row.zoneName} / ${row.layerName} · ${item.startMs}–${item.endMs} ms`
    return item.kind === 'clip' ? <button type="button" key={item.id} aria-label={label} aria-pressed={item.id === selectedClipId} onClick={() => onSelectClip(item.id)} style={style} className={`block min-w-0 overflow-hidden rounded-sm border px-2 py-1 text-left text-xs focus-visible:outline focus-visible:outline-amber-400 ${item.id === selectedClipId ? 'border-amber-400 bg-amber-400/10' : 'border-zinc-700 bg-zinc-900'}`}><span className="block truncate">{item.name}</span></button> : <div key={item.id} aria-label={`${label} · Group occupancy`} style={style} className="min-w-0 overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/40 px-2 py-1 text-xs text-zinc-500"><span className="block truncate">{item.name}</span></div>
  })}</div></div>)}</div>
}
