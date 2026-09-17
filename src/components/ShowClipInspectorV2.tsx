import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import {
  buildShowClipInspectorModelV2,
  showClipInspectorChoicesV2,
} from '@/engine/showClipInspectorV2Model'
import type { ShowClipTemporalIntentV2 } from '@/engine/showClipTemporalV2'
import {
  createShowV2IndependentIntent,
  createShowV2RejoinIntent,
  type ShowV2ClipSharingPlan,
} from '@/engine/showV2ClipSharingEditorModel'
import { buildShowV2TimelineEditorModel } from '@/engine/showV2TimelineEditorModel'
import type { ShowTimelineSelection } from '@/engine/showTimelineViewModel'
import {
  admitShowV2PilotClipReplacementEdit,
  admitShowV2PilotClipSharingEdit,
  admitShowV2PilotClipTemporal,
  admitShowV2PilotGroupOccurrenceEdit,
  admitShowV2PilotGroupReplacementEdit,
  type ShowV2PilotAdoptionReceipt,
} from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { ShowPatternInstanceControls } from './ShowPatternInstanceControls'
import { ShowV2AppearanceEditor } from './ShowV2AppearanceEditor'
import { ShowV2ClipReplacementEditor } from './ShowV2ClipReplacementEditor'
import { ShowV2GroupCreationEditor } from './ShowV2GroupCreationEditor'
import { ShowV2GroupOccurrenceEditor } from './ShowV2GroupOccurrenceEditor'
import { ShowV2GroupReplacementEditor } from './ShowV2GroupReplacementEditor'
import type { ShowV2EditCaptureBinding } from './useShowV2EditCapture'

const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'max-w-full whitespace-normal border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'

/**
 * The Clip inspector for a `ShowRecordV2` on the ordinary Show editor route.
 *
 * Selection comes from the version-agnostic timeline view model, and every edit
 * is planned by a landed v2 model and adopted through the closed admission in
 * `showV2PreparedEditAdmission`, so one accepted edit is one history entry and a
 * refusal writes nothing. The panel holds no record of its own: it reads the
 * prepared capture the route pinned and re-reads it after each adoption.
 */
export function ShowClipInspectorV2({
  showId,
  binding,
  selection,
  onSelectionChange,
}: {
  showId: string
  binding: ShowV2EditCaptureBinding
  /** The timeline selection this inspector follows; `null` selects from its own list. */
  selection?: ShowTimelineSelection | null
  onSelectionChange?: (selection: ShowTimelineSelection | null) => void
}) {
  const { capture, isCurrentCapture, isCurrentCompletion } = binding
  const history = useShowStore((state) => state.showV2Histories[showId])
  const undo = useShowStore((state) => state.undoShowV2Pilot)
  const redo = useShowStore((state) => state.redoShowV2Pilot)
  const [status, setStatus] = useState('')
  const [ownSelection, setOwnSelection] = useState<ShowTimelineSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const record = capture?.record ?? null
  const active = selection ?? ownSelection
  const model = useMemo(
    () => (record ? buildShowClipInspectorModelV2(record, active) : null),
    [record, active],
  )
  const choices = useMemo(() => (record ? showClipInspectorChoicesV2(record) : []), [record])
  const sources = useMemo(
    () => (capture ? buildShowV2TimelineEditorModel(capture).sources : []),
    [capture],
  )
  const select = (next: ShowTimelineSelection | null) => {
    setOwnSelection(next)
    onSelectionChange?.(next)
  }
  // A Clip this panel selected and the record no longer holds stops being the
  // inspected selection; a selection the route owns stays the route's to clear.
  if (!selection && ownSelection?.kind === 'clip' && record && !model && !busy) setOwnSelection(null)

  const available = Boolean(capture) && !busy
    && (capture?.inputCapture?.status === 'qualified'
      || (!capture?.inputCapture && capture?.prepared.status !== 'refused'))
  const editable = Boolean(model?.editable) && available

  const submit = async (
    run: (context: {
      showId: string
      baseRevision: number
      capture: NonNullable<typeof capture>
      isCurrent: () => boolean
      onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
    }) => Promise<{ status: 'applied'; settlement: 'saved' | 'superseded' } | { status: 'unchanged' } | { status: 'refused'; message: string }>,
    label: string,
  ) => {
    if (pending.current || !capture || !isCurrentCapture()) return
    pending.current = true
    setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await run({
        showId,
        baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
        capture,
        isCurrent: () => live.current && isCurrentCapture(),
        onAdopted: (receipt) => { adopted.current = receipt },
      })
      const current = outcome.status === 'applied'
        ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return
      setStatus(outcome.status === 'refused'
        ? outcome.message
        : outcome.status === 'unchanged' ? `${label} is unchanged.` : `${label} saved.`)
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  const submitTemporal = (intent: ShowClipTemporalIntentV2) => {
    void submit((context) => admitShowV2PilotClipTemporal({ ...context, intent }), 'Clip')
  }
  const submitSharing = (plan: ShowV2ClipSharingPlan, label: string) => {
    if (plan.status !== 'ready') {
      setStatus(plan.status === 'refused' ? plan.message : `${label} is unchanged.`)
      return
    }
    void submit((context) => admitShowV2PilotClipSharingEdit({ ...context, intent: plan.intent }), label)
  }
  const runHistory = async (direction: 'undo' | 'redo') => {
    const changed = direction === 'undo' ? await undo(showId) : await redo(showId)
    if (live.current) setStatus(changed ? `${direction === 'undo' ? 'Undo' : 'Redo'} saved.` : `Nothing to ${direction}.`)
  }

  if (!capture || !record) {
    return (
      <section aria-label="Clip inspector" data-testid="show-clip-inspector-v2" className="min-h-0 overflow-y-auto bg-zinc-950 px-4 py-4 text-zinc-200">
        <output role="status" className="block text-sm text-zinc-500">Opening this Show…</output>
      </section>
    )
  }

  return (
    <section
      aria-label="Clip inspector"
      data-testid="show-clip-inspector-v2"
      data-show-selection-key={model ? `clip:${model.clipId}` : 'none'}
      className="min-h-0 overflow-y-auto bg-zinc-950 px-4 py-4 text-zinc-200"
    >
      <h2 className="text-sm font-medium text-zinc-200">Clip</h2>
      <label className="mt-3 block text-xs text-zinc-400">Selected Clip
        <select
          aria-label="Selected Clip"
          className={fieldStyle}
          disabled={busy}
          value={model?.editable ? model.clipId : ''}
          onChange={(event) => select(event.target.value ? { kind: 'clip', clipId: event.target.value } : null)}
        >
          <option value="">Choose Clip</option>
          {choices.map((choice) => (
            <option key={choice.clipId} value={choice.clipId}>{choice.label}</option>
          ))}
        </select>
      </label>

      {model && (
        <>
          <dl className="mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-zinc-500">Pattern</dt>
            <dd className="truncate">{model.patternName}</dd>
            <dt className="text-zinc-500">Placement</dt>
            <dd className="truncate">{model.zoneName} / {model.layerName}</dd>
            <dt className="text-zinc-500">Entry policy</dt>
            <dd data-show-entry-policy={model.entryPolicy}>{model.entryPolicy === 'restart' ? 'Restart' : 'Continue'}</dd>
          </dl>
          {model.entryPolicy === 'restart' && (
            <p className="mt-2 text-xs text-zinc-500">Restart resets the whole Pattern instance at this Clip&apos;s first contribution.</p>
          )}
          {!model.editable && (
            <p className="mt-2 text-xs text-zinc-500">This Clip belongs to a Group occurrence. Edit it through the Group.</p>
          )}
        </>
      )}

      {model?.editable && (
        <ShowClipTimingFields
          key={`timing:${record.id}:${model.clipId}:${model.startMs}:${model.durationMs}`}
          startMs={model.startMs}
          endMs={model.endMs}
          disabled={!editable}
          onMove={(startMs) => submitTemporal({ kind: 'move', clipId: model.clipId, startMs })}
          onBounds={(endMs) => submitTemporal({
            kind: endMs < model.endMs ? 'trim' : 'extend',
            clipId: model.clipId,
            startMs: model.startMs,
            endMs,
          })}
        />
      )}

      {model && (
        <section aria-label="Pattern instance panel" className="mt-7 space-y-2">
          <h2 className="text-sm font-medium text-zinc-200">Pattern instance</h2>
          <ShowPatternInstanceControls
            key={`instance:${record.id}:${model.clipId}`}
            ownership={model.ownership}
            steppedClockEditable={false}
            onMakeIndependent={() => {
              if (!model.editable) return
              submitSharing(createShowV2IndependentIntent(capture, model.clipId, newPersonalContentId), 'Clip sharing')
            }}
            onRejoin={(targetInstanceId) => {
              if (!model.editable) return
              submitSharing(createShowV2RejoinIntent(capture, model.clipId, targetInstanceId), 'Clip sharing')
            }}
            onSteppedClockChange={() => undefined}
          />
          <p className="text-xs text-zinc-500">Linked Clips share controls, clock and private state.</p>
          <ul aria-label="Clip uses of this Pattern instance" className="space-y-1 text-xs text-zinc-400">
            {model.users.map((user) => (
              <li key={user.clipId} className="break-words" data-show-instance-user={user.clipId}>
                {user.patternName} · {user.zoneName} / {user.layerName} · {user.startMs}–{user.endMs} ms
                {user.groupOccurrenceId ? ` · Group ${user.groupOccurrenceId}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {model?.editable && (
        <ShowV2ClipReplacementEditor
          key={`replacement:${record.id}:${model.clipId}`}
          clipId={model.clipId}
          capture={capture}
          sources={sources}
          requireLossConfirmation
          submitReplacement={(request) => admitShowV2PilotClipReplacementEdit({
            showId,
            baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
            capture,
            ...request,
          })}
          isCurrentCapture={isCurrentCapture}
          isCurrentCompletion={isCurrentCompletion}
          onStatus={setStatus}
        />
      )}

      {model?.editable && (
        <ShowV2AppearanceEditor
          key={`appearance:${record.id}:${model.clipId}`}
          clipId={model.clipId}
          capture={capture}
          isCurrentCapture={isCurrentCapture}
          isCurrentCompletion={isCurrentCompletion}
          onStatus={setStatus}
        />
      )}

      <ShowV2GroupCreationEditor
        key={`groups:${record.id}`}
        capture={capture}
        isCurrentCapture={isCurrentCapture}
        isCurrentCompletion={isCurrentCompletion}
        onStatus={setStatus}
      />
      <ShowV2GroupOccurrenceEditor
        key={`group-occurrences:${record.id}`}
        capture={capture}
        submitGroupOccurrenceEdit={(request) => admitShowV2PilotGroupOccurrenceEdit({
          showId,
          baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
          capture,
          ...request,
        })}
        isCurrentCapture={isCurrentCapture}
        isCurrentCompletion={isCurrentCompletion}
        onStatus={setStatus}
      />
      <ShowV2GroupReplacementEditor
        key={`group-replacement:${record.id}`}
        capture={capture}
        sources={sources}
        submitGroupReplacement={(request) => admitShowV2PilotGroupReplacementEdit({
          showId,
          baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
          capture,
          ...request,
        })}
        isCurrentCapture={isCurrentCapture}
        isCurrentCompletion={isCurrentCompletion}
        onStatus={setStatus}
      />

      <div className="mt-7 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" className={buttonStyle} disabled={busy || !history?.past.length} onClick={() => void runHistory('undo')}>Undo</Button>
        <Button size="xs" variant="outline" className={buttonStyle} disabled={busy || !history?.future.length} onClick={() => void runHistory('redo')}>Redo</Button>
      </div>
      <output aria-live="polite" className="mt-4 block text-sm leading-6 text-zinc-400">
        {status || 'Select a Clip to edit it.'}
      </output>
    </section>
  )
}

/**
 * Exact-millisecond Clip timing. The draft is local until submitted, so a
 * refused edit restores the authored values rather than leaving a stale draft.
 */
function ShowClipTimingFields({
  startMs,
  endMs,
  disabled,
  onMove,
  onBounds,
}: {
  startMs: number
  endMs: number
  disabled: boolean
  onMove: (startMs: number) => void
  onBounds: (endMs: number) => void
}) {
  const [durationMs, setDurationMs] = useState(endMs - startMs)
  return (
    <div className="mt-5 space-y-3">
      <NumberField
        label="Clip start"
        value={startMs}
        disabled={disabled}
        step={1}
        suffix="ms"
        variant="editor"
        onChange={onMove}
      />
      <NumberField
        label="Clip duration"
        value={durationMs}
        disabled={disabled}
        step={1}
        suffix="ms"
        variant="editor"
        onChange={(next) => { setDurationMs(next); onBounds(startMs + next) }}
      />
      <NumberField
        label="Clip end"
        value={endMs}
        disabled={disabled}
        step={1}
        suffix="ms"
        variant="editor"
        onChange={onBounds}
      />
    </div>
  )
}
