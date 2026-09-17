import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { PatternCombobox } from './PatternCombobox'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import type { CreateShowClipIntentV2 } from '@/engine/showClipCreationV2'
import { allocateShowClipTimingIdsV2, type ShowV2TimelineSourceChoice } from '@/engine/showV2TimelineEditorModel'
import {
  admitShowV2PilotCreateClip,
  type ShowV2PilotAdoptionReceipt,
  type ShowV2PilotPreparedCapture,
} from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'

const selectStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'

/**
 * Placing a Pattern on the timeline (#1056 slice 6). The gesture seam moves,
 * resizes, splits, duplicates and deletes Clips; this is where a Clip that did
 * not exist comes from, and it is the surface specification section 4 requires
 * for the explicit runtime choice.
 *
 * Adding a Pattern reuses its sole existing instance; several independent
 * instances require an explicit selection, and a Pattern with none makes its
 * first instance as explicit placement setup. Identity is allocated once, at
 * submission, by `allocateShowClipTimingIdsV2`.
 */
export function ShowV2AddClipEditor({ capture, sources, onCreated, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture
  sources: ShowV2TimelineSourceChoice[]
  onCreated?: (clipId: string) => void
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const [adding, setAdding] = useState(false)
  const [sourceKey, setSourceKey] = useState<string | null>(null)
  const source = sources.find((candidate) => candidate.key === sourceKey)
  const [runtimeChoice, setRuntimeChoice] = useState('')
  const [explicitRuntimeChoice, setExplicitRuntimeChoice] = useState(false)
  const effectiveRuntimeChoice = !source
    ? ''
    : source.runtimeIds.length === 0
      ? 'first'
      : source.runtimeIds.length === 1
        ? `runtime:${source.runtimeIds[0]}`
        : explicitRuntimeChoice
          && runtimeChoice.startsWith('runtime:')
          && source.runtimeIds.includes(runtimeChoice.slice('runtime:'.length))
          ? runtimeChoice
          : ''
  const [zoneId, setZoneId] = useState(record.zones[0]?.id ?? '')
  const [layerId, setLayerId] = useState(record.composition.layers.find((layer) => layer.zoneId === zoneId)?.id ?? '')
  const [startMs, setStartMs] = useState(0)
  const [durationMs, setDurationMs] = useState(1_000)
  const available = capture.prepared.status !== 'refused'

  const add = async () => {
    if (!source || !effectiveRuntimeChoice || pending.current) return
    const first = effectiveRuntimeChoice === 'first' && source.runtimeIds.length === 0
    const existingId = effectiveRuntimeChoice.startsWith('runtime:')
      ? effectiveRuntimeChoice.slice('runtime:'.length)
      : ''
    if (!first && !source.runtimeIds.includes(existingId)) {
      onStatus('Select one existing runtime for this Pattern source.')
      return
    }
    const ids = allocateShowClipTimingIdsV2(record, 'create', first, () => newPersonalContentId())
    if (ids.status === 'refused') { onStatus(ids.message); return }
    const intent: CreateShowClipIntentV2 = {
      kind: 'create-clip',
      patternReference: { ...source.reference },
      clip: {
        id: ids.clipId,
        zoneId,
        layerId,
        startMs,
        durationMs,
        entryPolicy: 'continue',
        zoneSampleMode: 'span',
        appearance: {
          keys: [{
            id: ids.appearanceKeyId!,
            timeMs: startMs,
            value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
          }],
        },
      },
      runtime: first
        ? {
            kind: 'first',
            instance: {
              id: ids.instanceId!,
              pattern: { ...source.reference },
              patternName: source.name,
              time: { timeScale: 1, timeOffsetMs: 0 },
              controlTargets: {},
            },
          }
        : { kind: 'existing', instanceId: existingId },
    }

    pending.current = true
    setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await admitShowV2PilotCreateClip({
        showId: record.id,
        baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
        capture,
        isCurrent: () => live.current && isCurrentCapture(),
        onAdopted: (receipt) => { adoption.current = receipt },
        intent,
      })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return
      onStatus(outcome.status === 'refused'
        ? outcome.message
        : outcome.status === 'unchanged' ? 'Clip is unchanged.' : 'Clip saved.')
      if (outcome.status === 'applied') {
        setAdding(false)
        onCreated?.(ids.clipId)
      }
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  return (
    <section aria-label="Add Clip" data-testid="show-v2-add-clip" className="mt-7 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Clips</h2>
        <Button size="xs" variant="outline" disabled={busy || !available} className={buttonStyle} onClick={() => setAdding(true)}>
          Add Clip
        </Button>
      </div>
      {adding && (
        <div className="space-y-3">
          <PatternCombobox
            ariaLabel="Clip Pattern"
            value={sourceKey}
            disabled={busy}
            options={sources.map((candidate) => ({ value: candidate.key, label: candidate.label, group: candidate.group }))}
            onChange={(key) => {
              const next = sources.find((candidate) => candidate.key === key)!
              setSourceKey(key)
              setRuntimeChoice(next.runtimeIds.length === 0
                ? 'first'
                : next.runtimeIds.length === 1 ? `runtime:${next.runtimeIds[0]}` : '')
              setExplicitRuntimeChoice(false)
            }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-xs text-zinc-500">Zone
              <select
                aria-label="Clip Zone"
                value={zoneId}
                disabled={busy}
                className={selectStyle}
                onChange={(event) => {
                  const zone = event.target.value
                  setZoneId(zone)
                  if (!record.composition.layers.some((layer) => layer.id === layerId && layer.zoneId === zone)) {
                    setLayerId(record.composition.layers.find((layer) => layer.zoneId === zone)?.id ?? '')
                  }
                }}
              >
                {record.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-xs text-zinc-500">Layer
              <select
                aria-label="Clip Layer"
                value={layerId}
                disabled={busy}
                className={selectStyle}
                onChange={(event) => setLayerId(event.target.value)}
              >
                {record.composition.layers
                  .filter((layer) => layer.zoneId === zoneId)
                  .sort((left, right) => left.rank - right.rank)
                  .map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
              </select>
            </label>
          </div>
          {source && (
            <label className="block text-xs text-zinc-500">Runtime
              <select
                aria-label="Clip runtime"
                value={effectiveRuntimeChoice}
                disabled={busy}
                className={selectStyle}
                onChange={(event) => { setRuntimeChoice(event.target.value); setExplicitRuntimeChoice(true) }}
              >
                {source.runtimeIds.length > 1 && <option value="">Select runtime</option>}
                {source.runtimeIds.length === 0
                  ? <option value="first">First runtime</option>
                  : source.runtimeIds.map((id) => <option key={id} value={`runtime:${id}`}>{id}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField label="New Clip start" value={startMs} disabled={busy} step={1} suffix="ms" variant="editor" onChange={setStartMs} />
            <NumberField label="New Clip duration" value={durationMs} disabled={busy} step={1} suffix="ms" variant="editor" onChange={setDurationMs} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={busy || !source || !effectiveRuntimeChoice} className={buttonStyle} onClick={() => void add()}>
              Add
            </Button>
            <Button size="xs" variant="outline" disabled={busy} className={buttonStyle} onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
