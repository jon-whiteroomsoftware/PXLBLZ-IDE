import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { DraftTextField } from './ui/draft-text-field'
import { NumberField } from './ui/number-field'
import { PercentageField } from './ui/percentage-field'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { parseShowRoutingRanges } from '@/engine/showModel'
import {
  buildShowV2ZoneLayoutModel,
  nextShowV2ZoneLayoutName,
  showV2RoutingForMode,
  showV2RoutingWithMembers,
  showV2RoutingWithParameter,
  type ShowV2RoutingMode,
} from '@/engine/showV2ZoneLayoutEditorModel'
import type { ShowZoneLayoutDefinitionIntentV2 } from '@/engine/showZoneLayoutDefinitionsV2'
import {
  admitShowV2PilotLayoutDefinitionEdit,
  type ShowV2PilotAdoptionReceipt,
  type ShowV2PilotPreparedCapture,
} from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'

const selectStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'

/**
 * Zone Layout definitions on the v2 route (#1039): add, duplicate, rename,
 * remove, the routing mode with its operator and member Zones, and an
 * Installation Zone's physical LED ranges.
 *
 * The Transitions and Zone Layouts panel beside the timeline edits Layout
 * *occurrences* - which definition plays when. Nothing on this route edited a
 * definition itself, so a person could not create a second routing or change
 * how one routes, while the v1 editor's Zone Layout inspector could.
 *
 * Every control plans one intent with `showV2ZoneLayoutEditorModel` and submits
 * it through `admitShowV2PilotLayoutDefinitionEdit`, so one accepted edit is
 * one history entry and one save, and a refusal - the last definition, a name
 * another definition holds, an operator that would leave a Clip unrouted -
 * writes nothing and keeps the record identity.
 */
export function ShowV2ZoneLayoutEditor({ capture, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record
  const model = buildShowV2ZoneLayoutModel(record)
  const [layoutId, setLayoutId] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(0)
  const pending = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  // The selection is derived, not stored state to repair: an accepted removal,
  // an Undo or another client's write falls back to the first definition
  // instead of leaving this section pointing at one that is gone.
  const definition = model.definitions.find(entry => entry.id === layoutId) ?? model.definitions[0]
  const available = !busy
    && (capture.inputCapture ? capture.inputCapture.status === 'qualified' : capture.prepared.status !== 'refused')

  const submit = async (intent: ShowZoneLayoutDefinitionIntentV2, selectAfter?: string): Promise<boolean> => {
    if (pending.current || !available) return false
    pending.current = true
    setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await admitShowV2PilotLayoutDefinitionEdit({
        showId: record.id,
        baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
        capture,
        intent,
        isCurrent: () => live.current && isCurrentCapture(),
        onAdopted: receipt => { adoption.current = receipt },
      })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return false
      if (outcome.status !== 'applied') setReset(value => value + 1)
      onStatus(outcome.status === 'refused'
        ? outcome.message
        : outcome.status === 'unchanged' ? 'The Zone Layout is unchanged.' : 'Zone Layout saved.')
      if (outcome.status === 'applied') {
        setConfirmRemove(false)
        if (selectAfter !== undefined) setLayoutId(selectAfter)
      }
      return outcome.status === 'applied'
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) {
        setReset(value => value + 1)
        onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
      }
      return false
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  const changeMode = (mode: ShowV2RoutingMode) => {
    if (!definition) return
    const logical = showV2RoutingForMode(mode, model.zones.map(zone => zone.id))
    void submit({ kind: 'set-routing', layoutId: definition.id, logical })
  }
  const changeMembers = (index: number, zoneId: string) => {
    if (!definition) return
    const zoneIds = definition.memberZoneIds.map((current, position) => position === index ? zoneId : current)
    void submitOperator(zoneIds)
  }
  const submitOperator = (zoneIds: readonly string[]) => {
    if (!definition) return
    const current = record.zoneLayouts.find(layout => layout.id === definition.id)?.logical
    if (!current) return
    void submit({ kind: 'set-routing', layoutId: definition.id, logical: showV2RoutingWithMembers(current, zoneIds) })
  }
  const changeParameter = (id: string, value: number | 'x' | 'y') => {
    if (!definition) return
    const current = record.zoneLayouts.find(layout => layout.id === definition.id)?.logical
    if (!current) return
    void submit({ kind: 'set-routing', layoutId: definition.id, logical: showV2RoutingWithParameter(current, id, value) })
  }

  return (
    <section aria-label="Zone Layouts" data-testid="show-v2-zone-layouts" className="mt-7 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-200">Zone Layouts</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="outline"
            className={buttonStyle}
            disabled={!available}
            onClick={() => {
              const id = newPersonalContentId()
              void submit({ kind: 'add', layoutId: id, name: nextShowV2ZoneLayoutName(record, 'Zone Layout') }, id)
            }}
          >
            Add Zone Layout
          </Button>
          <Button
            size="xs"
            variant="outline"
            className={buttonStyle}
            disabled={!available || !definition}
            onClick={() => {
              if (!definition) return
              const id = newPersonalContentId()
              void submit({
                kind: 'duplicate',
                layoutId: id,
                name: nextShowV2ZoneLayoutName(record, definition.name),
                sourceLayoutId: definition.id,
              }, id)
            }}
          >
            Duplicate Zone Layout
          </Button>
        </div>
      </div>

      <label className="block text-xs text-zinc-400">
        Zone Layout
        <select
          aria-label="Zone Layout"
          className={selectStyle}
          value={definition?.id ?? ''}
          disabled={busy}
          onChange={event => { setLayoutId(event.target.value); setConfirmRemove(false) }}
        >
          {model.definitions.map(entry => (
            <option key={entry.id} value={entry.id}>
              {`${entry.name} · ${entry.modeLabel}${entry.occurrenceIds.length === 0 ? '' : ` · ${entry.occurrenceIds.length} on the timeline`}`}
            </option>
          ))}
        </select>
      </label>

      {definition && (
        <>
          <form
            key={`name:${definition.id}:${definition.name}:${reset}`}
            className="flex flex-wrap items-end gap-2"
            onSubmit={event => {
              event.preventDefault()
              void submit({ kind: 'rename', layoutId: definition.id, name: String(new FormData(event.currentTarget).get('name') ?? '') })
            }}
          >
            <label className="min-w-0 flex-1 text-xs text-zinc-400">
              Zone Layout name
              <input aria-label="Zone Layout name" name="name" required defaultValue={definition.name} className={selectStyle} disabled={busy} />
            </label>
            <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>
              Rename Zone Layout
            </Button>
          </form>

          <label className="block text-xs text-zinc-400">
            Routing mode
            <select
              aria-label="Routing mode"
              className={selectStyle}
              value={definition.mode}
              disabled={!available}
              onChange={event => changeMode(event.target.value as ShowV2RoutingMode)}
            >
              {model.modes.map(mode => (
                <option key={mode.mode} value={mode.mode} disabled={mode.disabled && mode.mode !== definition.mode}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          {definition.memberZoneIds.length > 0 && (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {definition.memberZoneIds.map((memberZoneId, index) => (
                  <label key={`member:${index}`} className="block text-xs text-zinc-400">
                    {`Zone ${index + 1}`}
                    <select
                      aria-label={`Routing Zone ${index + 1}`}
                      className={selectStyle}
                      value={memberZoneId}
                      disabled={!available}
                      onChange={event => changeMembers(index, event.target.value)}
                    >
                      {model.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {definition.memberArity.max === null && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    className={buttonStyle}
                    disabled={!available}
                    onClick={() => submitOperator([...definition.memberZoneIds, model.zones[0].id])}
                  >
                    Add routing Zone
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className={buttonStyle}
                    disabled={!available || definition.memberZoneIds.length <= definition.memberArity.min}
                    onClick={() => submitOperator(definition.memberZoneIds.slice(0, -1))}
                  >
                    Remove routing Zone
                  </Button>
                </div>
              )}
            </div>
          )}

          {definition.parameters.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {definition.parameters.map(parameter => parameter.kind === 'axis' ? (
                <label key={parameter.id} className="block text-xs text-zinc-400">
                  {parameter.label}
                  <select
                    aria-label={parameter.ariaLabel}
                    className={selectStyle}
                    value={parameter.value}
                    disabled={!available}
                    onChange={event => changeParameter(parameter.id, event.target.value === 'y' ? 'y' : 'x')}
                  >
                    <option value="x">X</option>
                    <option value="y">Y</option>
                  </select>
                </label>
              ) : parameter.kind === 'percentage' ? (
                <PercentageField
                  key={`${parameter.id}:${parameter.value}:${reset}`}
                  label={parameter.label}
                  ariaLabel={parameter.ariaLabel}
                  value={parameter.value}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={!available}
                  onChange={value => changeParameter(parameter.id, value)}
                />
              ) : (
                <NumberField
                  key={`${parameter.id}:${parameter.value}:${reset}`}
                  label={parameter.label}
                  ariaLabel={parameter.ariaLabel}
                  value={parameter.value}
                  {...(parameter.min === undefined ? {} : { min: parameter.min })}
                  step={parameter.step}
                  variant="editor"
                  disabled={!available}
                  onChange={value => changeParameter(parameter.id, value)}
                />
              ))}
            </div>
          )}

          {definition.ranges.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-zinc-300">Physical LED ranges</h3>
              {definition.ranges.map(range => (
                <label key={range.zoneId} className="block text-xs text-zinc-400">
                  {`${range.zoneName} ranges`}
                  <DraftTextField
                    key={`ranges:${definition.id}:${range.zoneId}:${range.text}:${reset}`}
                    ariaLabel={`${range.zoneName} pixel ranges`}
                    value={range.text}
                    parse={parseShowRoutingRanges}
                    invalidDraftReason="Ranges look like 0-63, 128-191."
                    onApply={ranges => void submit({
                      kind: 'set-physical-ranges',
                      layoutId: definition.id,
                      zoneId: range.zoneId,
                      ranges,
                    })}
                    className="mt-1 w-full"
                    inputClassName={`${selectStyle} font-mono`}
                    inputProps={{ placeholder: '0-63, 128-191', disabled: busy }}
                  />
                </label>
              ))}
            </div>
          )}

          {definition.coverage?.kind === 'physical' && (
            <p data-testid="show-v2-zone-layout-coverage" className="text-xs text-zinc-500">
              {`${definition.coverage.assignedPixelCount} of ${definition.coverage.totalPixelCount} pixels assigned · ${
                definition.coverage.missingPixelCount} missing · ${definition.coverage.overlappingPixelCount} overlapping · ${
                definition.coverage.outOfRangePixelCount} out of range`}
            </p>
          )}
          {definition.routingIssue && (
            <p className="text-xs text-amber-300/80">{definition.routingIssue}</p>
          )}

          {model.canRemoveDefinition && (confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="xs"
                variant="outline"
                className="border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                disabled={!available}
                onClick={() => void submit({ kind: 'remove', layoutId: definition.id }, '')}
              >
                {`Remove ${definition.name}?`}
              </Button>
              <Button size="xs" variant="outline" className={buttonStyle} disabled={busy} onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => setConfirmRemove(true)}>
              Remove Zone Layout
            </Button>
          ))}
        </>
      )}
    </section>
  )
}
