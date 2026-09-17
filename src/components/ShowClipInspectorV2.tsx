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
import { resolveCapturedShowPatternReplacementV2 } from '@/engine/showV2ClipReplacementModel'
import type { ShowClipInspectorModelV2 } from '@/engine/showClipInspectorV2Model'
import {
  admitShowV2PilotClipEntryPolicy,
  admitShowV2PilotClipReplacementEdit,
  admitShowV2PilotClipSharingEdit,
  admitShowV2PilotClipTemporal,
  admitShowV2PilotGroupOccurrenceEdit,
  admitShowV2PilotGroupReplacementEdit,
  admitShowV2PilotInstanceProperties,
  type ShowV2PilotAdoptionReceipt,
  type ShowV2PilotInstancePropertiesIntent,
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
  // Exported sliders come from the captured Pattern boundary, never from the
  // record's own control map, so an undeclared name is never offered.
  const sliders = useMemo(() => {
    if (!capture || !model) return []
    const resolved = resolveCapturedShowPatternReplacementV2(capture, model.instanceValues.patternReference)
    return resolved.status === 'ready' ? resolved.replacement.exportedSliders.map((control) => control.exportName) : []
  }, [capture, model])
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
  // One shared Pattern instance write: every Clip on the runtime observes it.
  const submitInstanceProperties = (
    clipId: string,
    properties: ShowV2PilotInstancePropertiesIntent['properties'],
  ) => {
    void submit(
      (context) => admitShowV2PilotInstanceProperties({ ...context, intent: { clipId, properties } }),
      'Pattern instance',
    )
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
          {model.editable && (
            <label className="mt-3 block text-xs text-zinc-400">On entry
              <select
                aria-label="Clip entry policy"
                className={fieldStyle}
                disabled={!editable}
                value={model.entryPolicy}
                onChange={(event) => void submit(
                  (context) => admitShowV2PilotClipEntryPolicy({
                    ...context,
                    intent: {
                      kind: 'set-entry-policy',
                      clipId: model.clipId,
                      entryPolicy: event.target.value === 'restart' ? 'restart' : 'continue',
                    },
                  }),
                  'Entry policy',
                )}
              >
                <option value="continue">Continue</option>
                <option value="restart">Restart</option>
              </select>
            </label>
          )}
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
          {/*
            Every instance write - sharing, stutter and the values below - names
            an ordinary Clip id, and a Group-child selection resolves a
            materialized use those owners refuse. Report the shared runtime
            here and leave the edit to the Group rather than offering controls
            whose every write comes back refused (#1056 slice 5 review).
          */}
          <ShowPatternInstanceControls
            key={`instance:${record.id}:${model.clipId}`}
            ownership={model.ownership}
            {...(model.instanceValues.steppedClock ? { steppedClock: model.instanceValues.steppedClock } : {})}
            steppedClockEditable={model.editable}
            sharingEditable={model.editable}
            onMakeIndependent={() => {
              if (!model.editable) return
              submitSharing(createShowV2IndependentIntent(capture, model.clipId, newPersonalContentId), 'Clip sharing')
            }}
            onRejoin={(targetInstanceId) => {
              if (!model.editable) return
              submitSharing(createShowV2RejoinIntent(capture, model.clipId, targetInstanceId), 'Clip sharing')
            }}
            onSteppedClockChange={(next) => {
              if (!model.editable) return
              submitInstanceProperties(model.clipId, { stepped_clock: next ? { stepMs: next.stepMs } : null })
            }}
          />
          <p className="text-xs text-zinc-500">Linked Clips share controls, clock and private state.</p>
          <ShowClipInstanceValues
            key={`values:${record.id}:${model.instanceId}:${model.instanceValues.timeScale}:${model.instanceValues.evaluationPolicy}`}
            values={model.instanceValues}
            sliders={sliders}
            userCount={model.users.length}
            disabled={!available || !model.editable}
            {...(model.editable ? {} : { unavailableReason: 'Edit this Pattern instance through its Group.' })}
            onChange={(properties) => {
              if (!model.editable) return
              submitInstanceProperties(model.clipId, properties)
            }}
          />
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
 * Pattern-instance values the shared owner writes: exported slider targets, the
 * clock and the evaluation policy. They belong to the runtime, so the panel says
 * how many Clip uses observe the edit before it is made.
 */
function ShowClipInstanceValues({
  values,
  sliders,
  userCount,
  disabled,
  unavailableReason,
  onChange,
}: {
  values: ShowClipInspectorModelV2['instanceValues']
  sliders: string[]
  userCount: number
  disabled: boolean
  /** Why no value here can be adopted, when the selection admits no write at all. */
  unavailableReason?: string
  onChange: (properties: ShowV2PilotInstancePropertiesIntent['properties']) => void
}) {
  return (
    <div className="space-y-3 border-t border-zinc-800 pt-3" data-testid="show-clip-instance-values">
      {userCount > 1 && (
        <p className="text-xs text-cyan-300/70">These values affect all {userCount} Clip uses of this Pattern instance.</p>
      )}
      {unavailableReason && <p className="text-xs text-zinc-500">{unavailableReason}</p>}
      <NumberField
        label="Animation speed"
        value={values.timeScale}
        disabled={disabled}
        min={0}
        max={8}
        step={0.05}
        variant="editor"
        onChange={(timeScale) => onChange({ time_scale: timeScale })}
      />
      <label className="block text-xs text-zinc-400">Evaluation
        <select
          aria-label="Pattern evaluation policy"
          className={fieldStyle}
          disabled={disabled}
          value={values.evaluationPolicy}
          onChange={(event) => onChange({ evaluation: event.target.value as ShowClipInspectorModelV2['instanceValues']['evaluationPolicy'] })}
        >
          <option value="live">Live</option>
          <option value="freeze-at-entry">Freeze at entry</option>
          <option value="rolling-refresh">Rolling refresh</option>
        </select>
      </label>
      {sliders.length === 0
        ? <p className="text-xs text-zinc-500">This Pattern exports no sliders.</p>
        : sliders.map((exportName) => (
          <NumberField
            key={exportName}
            label={exportName}
            value={values.controlTargets[exportName] ?? 0}
            disabled={disabled}
            min={0}
            max={1}
            step={0.01}
            variant="editor"
            onChange={(value) => onChange({ controls: { [exportName]: value } })}
          />
        ))}
    </div>
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
