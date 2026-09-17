import { useLayoutEffect, useRef, useState } from 'react'
import { Route } from 'lucide-react'
import { Button } from './ui/button'
import { PercentageField } from './ui/percentage-field'
import { TimeField } from './ui/time-field'
import { ShowLayerTransitionPalette } from './ShowLayerTransitionPalette'
import { ShowTransitionFamilyPictogram, ShowTransitionParameters } from './ShowTransitionAuthoring'
import { ShowTransitionXrayPictogram } from './ShowTransitionXrayPictogram'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import type { ShowCrossfadePolicy, ShowRoutingDirection } from '@/engine/personalContentRecords'
import {
  showTimelineSelectionKey,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'
import {
  buildShowV2LayoutEditorModel,
  planShowV2LayoutEdit,
  type ShowV2LayoutEditorRequest,
} from '@/engine/showV2LayoutEditorModel'
import {
  planShowV2TransitionEdit,
  showV2TransitionJunctionKey,
  type ShowV2TransitionEditorRequest,
} from '@/engine/showV2TransitionEditorModel'
import { showBoundaryTransitionPresentationKey } from '@/engine/showTransitionAuthoring'
import type { ShowToolkitParameterValue } from '@/engine/showVisualToolkit'
import {
  buildShowToolkitPresentationCatalogue,
  type ShowToolkitPresentationItem,
} from '@/engine/showVisualToolkitPresentation'
import {
  admitShowV2PilotLayoutOccurrenceEdit,
  admitShowV2PilotTransitionEdit,
  admitShowV2PilotTransitionResize,
  type ShowV2PilotAdoptionReceipt,
  type ShowV2PilotPreparedEditContext,
} from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'
import type { ShowV2EditCaptureBinding } from './useShowV2EditCapture'

type Outcome =
  | { status: 'applied'; settlement: 'saved' | 'superseded' }
  | { status: 'unchanged' }
  | { status: 'refused'; message: string }

export interface ShowV2BoundaryOption {
  /** The view model's own selection key: a derived Cut or a Transition identity. */
  key: string
  /**
   * This drawn boundary's own identity: the selection key qualified by the
   * Layer it was drawn on. A whole-output Transition contributes on several
   * Layers and draws one junction on each, all naming the same Transition, so
   * the selection key alone is not unique in this flat list.
   */
  optionKey: string
  zoneId: string
  zoneName: string
  layerId: string
  layerName: string
  fromName: string
  toName: string
  startMs: number
  endMs: number
  transitionId: string | null
  /** The junction key the Transition owner resolves an Insert at; `null` for an authored Transition. */
  junctionKey: string | null
  kind: string
}

const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'

/**
 * Transition authoring and the Zone Layout lane for a `ShowRecordV2` on the
 * ordinary editor route (#1056 slice 4).
 *
 * Every mutation is one explicit intent planned by a pure editor model and
 * admitted through the closed prepared-edit admission, so the landed owners
 * decide timing, coverage and compiler eligibility and their refusals reach the
 * author in their own words. A Cut is the absence of a Transition at exact
 * adjacency: this surface selects a derived junction and persists no Cut.
 * Whole-output Transitions from conversion are edited by their own identity and
 * are never created here.
 *
 * The capture comes from the route's one `useShowV2EditCapture` binding, and
 * Undo and Redo belong to slice 2's timeline above, not to this panel.
 */
export function ShowEditorV2TransitionLayoutPanel({
  showId,
  view,
  binding,
}: {
  showId: string
  view: ShowTimelineViewModel
  binding: ShowV2EditCaptureBinding
}) {
  const { capture, isCurrentCapture, isCurrentCompletion } = binding
  const [status, setStatus] = useState('')
  const [boundaryKey, setBoundaryKey] = useState('')
  const [occurrenceId, setOccurrenceId] = useState('')
  const [palette, setPalette] = useState<'insert' | 'kind' | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const live = useRef(true)
  const uniqueName = useRef('')

  useLayoutEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])

  const record = capture?.record ?? null
  const stageDimensions: 1 | 2 | 3 = capture?.dependencies.stageMap?.dim === 3 ? 3 : 2
  const available = Boolean(capture) && !busy
    && (capture?.inputCapture?.status === 'qualified' || (!capture?.inputCapture && capture?.prepared.status === 'ready'))

  const boundaries = showV2BoundaryOptions(view)
  const selectedBoundary = boundaries.find((boundary) => boundary.optionKey === boundaryKey) ?? null
  const transition = selectedBoundary?.transitionId && record
    ? record.composition.transitions.find((candidate) => candidate.id === selectedBoundary.transitionId) ?? null
    : null
  const transitionItem = transition
    ? buildShowToolkitPresentationCatalogue({ stageDimensions })
      .find((item) => item.kind === 'transition' && item.key === showBoundaryTransitionPresentationKey(transition))
    : undefined

  const layoutModel = record ? buildShowV2LayoutEditorModel(record) : { layouts: [], occurrences: [] }
  const occurrence = layoutModel.occurrences.find((value) => value.id === occurrenceId) ?? null
  const totalMs = Math.max(1, view.showEndMs)
  const percent = (timeMs: number) => `${Math.min(100, Math.max(0, timeMs / totalMs * 100))}%`

  /** One admitted edit: serialized, and reported only while this capture is still the route's own. */
  const act = async (
    submit: (request: ShowV2PilotPreparedEditContext) => Promise<Outcome>,
    success: string,
    onApplied?: () => void,
  ) => {
    if (!capture || pending.current || !available) return
    pending.current = true
    setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submit({
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
        : outcome.status === 'unchanged' ? 'Nothing changed.' : success)
      if (outcome.status === 'applied') onApplied?.()
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  const planTransition = (request: ShowV2TransitionEditorRequest, success: string, nextKey?: (id: string) => string) => {
    if (!record) return
    const plan = planShowV2TransitionEdit(record, request, () => newPersonalContentId(), stageDimensions)
    if (plan.status === 'refused') {
      if (isCurrentCapture()) setStatus(plan.message)
      return
    }
    const created = plan.intent.kind === 'insert' ? plan.intent.transition.id : ''
    void act(
      (submitted) => admitShowV2PilotTransitionEdit({ ...submitted, intent: plan.intent }),
      success,
      nextKey ? () => setBoundaryKey(nextKey(created)) : undefined,
    )
  }

  const planLayout = (request: ShowV2LayoutEditorRequest, success: string, nextOccurrenceId?: string) => {
    if (!record) return
    const plan = planShowV2LayoutEdit(record, request, () => newPersonalContentId())
    if (plan.status === 'refused') {
      if (isCurrentCapture()) setStatus(plan.message)
      return
    }
    void act(
      (submitted) => admitShowV2PilotLayoutOccurrenceEdit({ ...submitted, intent: plan.intent }),
      success,
      nextOccurrenceId === undefined ? undefined : () => setOccurrenceId(nextOccurrenceId),
    )
  }

  const changeTransfer = (direction: ShowRoutingDirection, durationMs?: number) => {
    if (!occurrence) return
    const nextDuration = durationMs ?? occurrence.incomingTransfer?.durationMs ?? 0
    // A zero-duration transfer is a switch without a timed transfer object.
    planLayout(
      nextDuration <= 0
        ? { kind: 'set-transfer', occurrenceId: occurrence.id, transfer: null }
        : { kind: 'set-transfer', occurrenceId: occurrence.id, transfer: { durationMs: nextDuration, direction } },
      nextDuration <= 0 ? 'Transfer cleared.' : 'Transfer saved.',
    )
  }

  const applyPalette = (item: ShowToolkitPresentationItem, durationMs: number) => {
    const mode = palette
    setPalette(null)
    const boundary = selectedBoundary
    const junctionKey = boundary?.junctionKey
    if (mode === 'insert' && boundary && junctionKey) {
      planTransition(
        {
          kind: 'insert',
          junctionKey,
          kindKey: item.key,
          durationMs,
          crossfadePolicy: 'live-live',
        },
        'Transition inserted.',
        // The inserted Transition is drawn on the Layer the junction was on.
        (id) => `${boundary.zoneId}:${boundary.layerId}:transition:${id}`,
      )
      return
    }
    if (mode === 'kind' && transition) {
      planTransition({
        kind: 'settings',
        transitionId: transition.id,
        kindKey: item.key,
        crossfadePolicy: transition.crossfadePolicy ?? 'live-live',
      }, 'Transition kind saved.')
    }
  }

  return (
    <section
      aria-label="Transitions and Zone Layouts"
      data-testid="show-editor-v2-transitions-layout"
      className="flex max-h-[55%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-zinc-800 bg-[#08080b] px-3 py-2.5 text-zinc-300"
    >
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Transitions and Zone Layouts</h2>
      <output
        aria-live="polite"
        data-testid="show-editor-v2-authoring-status"
        className="block min-h-4 text-[11px] leading-4 text-zinc-400"
      >
        {status}
      </output>

      <div role="group" aria-label="Transitions and Cut junctions" className="flex flex-col gap-1.5">
        <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Boundaries</p>
        {boundaries.length === 0 && <p className="text-[11px] text-zinc-600">No two Clips share an exact boundary yet.</p>}
        <div className="flex flex-wrap gap-1.5">
          {boundaries.map((boundary) => (
            <button
              key={boundary.optionKey}
              type="button"
              aria-pressed={boundary.optionKey === boundaryKey}
              data-show-selection-key={boundary.key}
              data-show-boundary-key={boundary.optionKey}
              aria-label={`${boundary.transitionId ? `${boundary.kind} Transition` : 'Cut'} on Layer ${boundary.layerName} in Zone ${
                boundary.zoneName}, ${boundary.fromName} to ${boundary.toName} at ${seconds(boundary.startMs)}`}
              onClick={() => { setBoundaryKey(boundary.optionKey); setPalette(null) }}
              className={`flex items-center gap-1.5 rounded-sm border px-1.5 py-1 font-mono text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-live/80 ${
                boundary.optionKey === boundaryKey
                  ? 'border-live/70 bg-live/10 text-zinc-100'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}`}
            >
              {boundary.transitionId
                ? <ShowTransitionFamilyPictogram family={transitionFamily(boundary.kind)} />
                : <span aria-hidden className="h-3 w-px bg-zinc-500" />}
              <span className="truncate">
                {boundary.transitionId ? boundary.kind : 'Cut'} · {boundary.layerName} · {seconds(boundary.startMs)}
              </span>
            </button>
          ))}
        </div>

        {selectedBoundary && !selectedBoundary.transitionId && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => setPalette('insert')}>Insert Transition</Button>
            <span className="text-[10px] text-zinc-600">The incoming Clips move later by the Transition duration.</span>
          </div>
        )}

        {transition && selectedBoundary && (
          <div className="flex flex-col gap-2 rounded-sm border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="flex items-center gap-2">
              <span className="relative h-5 w-14 shrink-0 overflow-hidden rounded-sm border border-zinc-800">
                <ShowTransitionXrayPictogram transition={transition} />
              </span>
              <span className="min-w-0 truncate font-mono text-[10px] text-zinc-400">
                {transition.kind} · {seconds(selectedBoundary.startMs)} to {seconds(selectedBoundary.endMs)}
                {transition.wholeOutput ? ' · whole output' : ''}
              </span>
              <Button size="xs" variant="outline" className={`ml-auto ${buttonStyle}`} disabled={!available} onClick={() => setPalette('kind')}>
                Change kind
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TimeField
                key={`${transition.id}:${transition.durationMs}`}
                label="Duration"
                ariaLabel="Transition duration"
                value={transition.durationMs / 1_000}
                min={0.001}
                max={Number.MAX_SAFE_INTEGER / 1_000}
                step={0.001}
                variant="editor"
                compact
                disabled={!available}
                onChange={(next) => void act(
                  (submitted) => admitShowV2PilotTransitionResize({
                    ...submitted,
                    intent: { kind: 'resize-transition', transitionId: transition.id, durationMs: Math.round(next * 1_000) },
                  }),
                  'Transition duration saved.',
                )}
              />
              {transition.kind === 'crossfade' && (
                <label className="block text-[9px] uppercase tracking-wide text-zinc-600">
                  Crossfade policy
                  <select
                    aria-label="Crossfade policy"
                    disabled={!available}
                    className={fieldStyle}
                    value={transition.crossfadePolicy ?? 'live-live'}
                    onChange={(event) => planTransition({
                      kind: 'settings',
                      transitionId: transition.id,
                      kindKey: showBoundaryTransitionPresentationKey(transition),
                      crossfadePolicy: event.target.value as ShowCrossfadePolicy,
                    }, 'Crossfade policy saved.')}
                  >
                    <option value="live-live">Live and live</option>
                    <option value="snapshot-live">Snapshot and live</option>
                  </select>
                </label>
              )}
            </div>
            {transitionItem && (
              <ShowTransitionParameters
                transition={transition}
                item={transitionItem}
                omitParameterIds={DURATION_OWNED_ELSEWHERE}
                onChange={(parameterId, value: ShowToolkitParameterValue) => planTransition(
                  { kind: 'parameter', transitionId: transition.id, parameterId, value },
                  'Transition parameter saved.',
                )}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => planTransition(
                { kind: 'reset', transitionId: transition.id }, 'Reset to Cut.', () => '',
              )}>Reset to Cut</Button>
              {transition.propertyRamps.length > 0 && (
                <span className="text-[10px] text-amber-300/80">
                  Reset projects {transition.propertyRamps.length} Property ramp{transition.propertyRamps.length === 1 ? '' : 's'} into tracks first.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div role="group" aria-label="Zone Layout occurrences" className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] text-zinc-600">
          <Route size={11} aria-hidden /> Zone Layouts
        </p>
        <div className="relative h-6 rounded-sm bg-white/[0.025]">
          {layoutModel.occurrences.map((value) => (
            <button
              key={value.id}
              type="button"
              aria-pressed={value.id === occurrenceId}
              data-show-selection-key={showTimelineSelectionKey({ kind: 'layout-occurrence', occurrenceId: value.id })}
              aria-label={`${value.name} Zone Layout occurrence, ${seconds(value.startMs)} to ${seconds(value.endMs)}${
                value.incomingTransfer ? `, transfer ${seconds(value.incomingTransfer.durationMs)}` : ''}`}
              onClick={() => setOccurrenceId(value.id)}
              className={`absolute inset-y-0 flex min-w-[2px] items-center overflow-hidden border-l border-zinc-700 px-1 font-mono text-[9px] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80 ${
                value.id === occurrenceId ? 'bg-live/10 text-zinc-100 ring-1 ring-inset ring-live/70' : 'text-zinc-400 hover:bg-white/[0.04]'}`}
              style={{ left: percent(value.startMs), width: percent(value.endMs - value.startMs) }}
            >
              <span className="truncate">{value.name}</span>
            </button>
          ))}
        </div>

        {occurrence && (
          <div className="grid grid-cols-1 gap-2 rounded-sm border border-zinc-800 bg-zinc-950/60 p-2 sm:grid-cols-2">
            <label className="block text-[9px] uppercase tracking-wide text-zinc-600">
              Layout
              <select
                aria-label="Layout definition"
                disabled={!available}
                className={fieldStyle}
                value={occurrence.layoutId}
                onChange={(event) => planLayout(
                  { kind: 'select-layout', occurrenceId: occurrence.id, layoutId: event.target.value },
                  'Layout saved.',
                )}
              >
                {layoutModel.layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
              </select>
            </label>
            <TimeField
              key={`${occurrence.id}:switch:${occurrence.startMs}`}
              label="Switch"
              ariaLabel="Layout switch"
              value={occurrence.startMs / 1_000}
              min={0}
              max={Number.MAX_SAFE_INTEGER / 1_000}
              step={0.001}
              variant="editor"
              compact
              disabled={!available || occurrence.isInitial}
              onChange={(next) => planLayout(
                { kind: 'move', occurrenceId: occurrence.id, startMs: Math.round(next * 1_000) },
                'Layout switch saved.',
              )}
            />
            {occurrence.splitCapable && (
              <PercentageField
                key={`${occurrence.id}:split:${occurrence.splitPosition ?? 0.5}`}
                label="Split position"
                ariaLabel="Layout split position"
                value={occurrence.splitPosition ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                variant="editor"
                compact
                disabled={!available}
                onChange={(next) => planLayout(
                  { kind: 'set-parameters', occurrenceId: occurrence.id, parameters: { splitPosition: next } },
                  'Split position saved.',
                )}
              />
            )}
            <label className="block text-[9px] uppercase tracking-wide text-zinc-600">
              Transfer direction
              <select
                aria-label="Layout transfer direction"
                disabled={!available || occurrence.isInitial}
                className={fieldStyle}
                value={occurrence.incomingTransfer?.direction ?? 'forward'}
                onChange={(event) => changeTransfer(event.target.value as ShowRoutingDirection)}
              >
                <option value="forward">Forward</option>
                <option value="reverse">Reverse</option>
              </select>
            </label>
            <TimeField
              key={`${occurrence.id}:transfer:${occurrence.incomingTransfer?.durationMs ?? 0}`}
              label="Transfer"
              ariaLabel="Layout transfer"
              value={(occurrence.incomingTransfer?.durationMs ?? 0) / 1_000}
              min={0}
              max={Number.MAX_SAFE_INTEGER / 1_000}
              step={0.001}
              variant="editor"
              compact
              disabled={!available || occurrence.isInitial}
              onChange={(next) => changeTransfer(
                occurrence.incomingTransfer?.direction ?? 'forward',
                Math.round(next * 1_000),
              )}
            />
            <label className="block text-[9px] uppercase tracking-wide text-zinc-600 sm:col-span-2">
              Unique Layout name
              <input
                key={`${occurrence.id}:${occurrence.layoutId}`}
                aria-label="Unique Layout name"
                disabled={!available}
                className={fieldStyle}
                defaultValue={occurrence.name}
                onChange={(event) => { uniqueName.current = event.target.value }}
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => planLayout(
                { kind: 'make-unique', occurrenceId: occurrence.id, name: uniqueName.current.trim() || occurrence.name },
                'Layout is unique.',
              )}>Make Layout Unique</Button>
              <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => planLayout(
                { kind: 'duplicate', occurrenceId: occurrence.id, content: 'copy' },
                'Layout occurrence duplicated.',
              )}>Duplicate</Button>
              <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => planLayout(
                { kind: 'remove', occurrenceId: occurrence.id },
                'Layout occurrence removed; its predecessor extends.',
                '',
              )}>Remove</Button>
              <Button
                size="xs"
                variant="outline"
                className={buttonStyle}
                disabled={!available || !occurrence.incomingTransfer}
                onClick={() => planLayout(
                  { kind: 'set-transfer', occurrenceId: occurrence.id, transfer: null },
                  'Transfer cleared.',
                )}
              >
                Clear transfer
              </Button>
            </div>
          </div>
        )}
      </div>

      {palette && selectedBoundary && (
        <ShowLayerTransitionPalette
          stageDimensions={stageDimensions}
          maxDurationMs={palette === 'kind' && transition
            ? transition.durationMs
            : Math.max(1, view.showEndMs - selectedBoundary.startMs)}
          fullCatalogue
          fromName={selectedBoundary.fromName}
          toName={selectedBoundary.toName}
          onApply={applyPalette}
          onClose={() => setPalette(null)}
        />
      )}
    </section>
  )
}

/** The resize owner applies a duration delta once to the downstream affected set. */
const DURATION_OWNED_ELSEWHERE = ['durationMs'] as const

function transitionFamily(kind: string): string {
  if (kind === 'fade-color') return 'fade'
  if (kind === 'dither') return 'dissolve'
  if (kind === 'portal') return 'shape-reveal'
  if (kind === 'motion' || kind === 'wipe') return kind
  return 'blend'
}

function seconds(timeMs: number): string {
  return `${(timeMs / 1_000).toFixed(2)}s`
}

/**
 * Every drawn boundary in timeline order: the derived Cut junctions the
 * Transition owner accepts an Insert at, and the authored Transitions it edits
 * by identity. Both are addressed by the view model's own junction identity.
 */
export function showV2BoundaryOptions(view: ShowTimelineViewModel): ShowV2BoundaryOption[] {
  const options: ShowV2BoundaryOption[] = []
  for (const row of view.rows) {
    for (const layer of row.layers) {
      const nameById = new Map(layer.items.map((item) => [item.id, item.patternName]))
      for (const junction of layer.junctions) {
        const key = showTimelineSelectionKey(junction.selection)
        options.push({
          key,
          optionKey: `${row.zoneId}:${layer.id}:${key}`,
          zoneId: row.zoneId,
          zoneName: row.zoneName,
          layerId: layer.id,
          layerName: layer.name,
          fromName: nameById.get(junction.leftItemId) ?? junction.leftItemId,
          toName: nameById.get(junction.rightItemId) ?? junction.rightItemId,
          startMs: junction.startMs,
          endMs: junction.endMs,
          transitionId: junction.transitionId,
          junctionKey: junction.scope === 'derived-cut'
            ? showV2TransitionJunctionKey({
              atMs: junction.startMs,
              zoneId: row.zoneId,
              layerId: layer.id,
              fromClipId: junction.leftItemId,
              toClipId: junction.rightItemId,
            })
            : null,
          kind: junction.kind,
        })
      }
    }
  }
  return options.sort((left, right) => left.startMs - right.startMs || left.optionKey.localeCompare(right.optionKey))
}
