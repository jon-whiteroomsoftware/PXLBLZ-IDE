import { editShowClipV2, type ShowClipEditIntentV2, type ShowClipEditResultV2 } from '@/engine/showClipsV2'
import { editShowMarkerV2, type ShowMarkerEditIntentV2 } from '@/engine/showMarkersV2'
import { prepareShowStageV2, prepareShowStageFromCapturedInputsV2, type ShowPreparedStageInputCaptureResultV2, type ShowPreparedStageDependenciesV2, type ShowPreparedStageResultV2 } from '@/engine/showPreparedStageV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { getPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { isValidatedEmptyShowV2 } from '@/engine/showMarkerRouteModel'
import { useShowStore } from './showStore'

import { editShowTransitionV2, type ShowTransitionEditIntentV2, type ShowTransitionEditResultV2, type ShowTransitionEditRefusalV2 } from '@/engine/showTransitionsV2'
import type { ShowMarkerEditResultV2 } from '@/engine/showMarkersV2'
import { createShowClipV2, type CreateShowClipIntentV2, type ShowClipCreationResultV2 } from '@/engine/showClipCreationV2'
import { editShowClipTemporalV2, type ShowClipTemporalIntentV2, type ShowClipTemporalResultV2 } from '@/engine/showClipTemporalV2'
import { insertShowTimeV2, type ShowInsertTimeIntentV2, type ShowTimelineEditResultV2, type ShowTimelineEditAffectedV2 } from '@/engine/showTimelineV2'
import { editShowLayoutIntervalsV2, type ShowLayoutEditIntentV2, type ShowLayoutEditResultV2 } from '@/engine/showLayoutIntervalsV2'
import { insertShowLayoutIntervalV2, type ShowLayoutIntervalInsertIntentV2 } from '@/engine/showLayoutIntervalInsertV2'
import { editShowLayerV2, type ShowLayerEditIntentV2, type ShowLayerEditResultV2, type ShowLayerEditAffectedV2 } from '@/engine/showLayersV2'
import { editShowClipAppearanceV2, type ShowClipAppearanceEditIntentV2, type ShowClipAppearanceEditResultV2 } from '@/engine/showClipAppearanceEditsV2'
import { editShowPropertyV2, type ShowPropertyTrackOwnerV2, type ShowPropertyEditIntentV2, type ShowPropertyEditResultV2 } from '@/engine/showPropertyEditsV2'
import { createShowGroupFromSelectionV2, type CreateShowGroupFromSelectionIntentV2, type ShowGroupCreateResultV2 } from '@/engine/showGroupCreationV2'
import type { ShowGroupEditAffectedV2 } from '@/engine/showGroupEditsV2'
import { moveShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, ungroupShowGroupOccurrenceV2, deleteShowGroupOccurrenceV2, setShowGroupDefinitionClipTimingV2, editShowGroupDefinitionClipAppearanceV2, writeShowGroupDefinitionInstancePropertiesV2, insertShowGroupDefinitionLayerTransitionV2, resizeShowGroupDefinitionLayerTransitionV2, type MoveShowGroupOccurrenceIntentV2, type DuplicateShowGroupOccurrenceIntentV2, type MakeShowGroupUniqueIntentV2, type SetShowGroupDefinitionClipTimingIntentV2, type EditShowGroupDefinitionClipAppearanceIntentV2, type WriteShowGroupDefinitionInstancePropertiesIntentV2, type InsertShowGroupDefinitionLayerTransitionIntentV2, type ResizeShowGroupDefinitionLayerTransitionIntentV2, type UngroupShowGroupOccurrenceIntentV2, type DeleteShowGroupOccurrenceIntentV2, type ShowGroupEditResultV2 } from '@/engine/showGroupEditsV2'
import { resolveCapturedShowPatternReplacementV2, type ShowV2ClipReplacementIntent } from '@/engine/showV2ClipReplacementModel'
import { writeShowInstancePropertiesV2, type ShowInstancePropertiesResultV2, type ShowInstancePropertyDependenciesV2 } from '@/engine/showInstancePropertiesV2'
import type { ShowClipEvaluationPolicy } from '@/engine/personalContentRecords'
import { replaceShowGroupDefinitionClipPatternV2, type ReplaceShowGroupDefinitionClipPatternIntentV2, type ShowGroupReplacementResultV2 } from '@/engine/showGroupReplacementV2'
import type { ShowV2GroupReplacementIntent } from '@/engine/showV2GroupReplacementEditorModel'
import { editShowZoneV2, type ShowZoneEditAffectedV2, type ShowZoneEditIntentV2, type ShowZoneEditResultV2 } from '@/engine/showZonesV2'
import { editShowZoneLayoutDefinitionV2, type ShowZoneLayoutDefinitionAffectedV2, type ShowZoneLayoutDefinitionIntentV2, type ShowZoneLayoutDefinitionResultV2 } from '@/engine/showZoneLayoutDefinitionsV2'
import { applyShowCommandV2, type ShowCommandV2Outcome } from '@/engine/showCommandsV2/registry'
import type { ShowV2ShowMetadataCommand } from '@/engine/showV2ShowPropertiesEditorModel'
import { resolveShowV2StageMap, showV2StageMapAvailable } from './showV2StageMap'
export interface ShowV2PilotPreparedCapture {
  readonly record: ShowRecordV2
  readonly dependencies: ShowPreparedStageDependenciesV2
  readonly prepared: ShowPreparedStageResultV2
  readonly inputCapture?: ShowPreparedStageInputCaptureResultV2
}
export interface ShowV2PilotAdoptionReceipt {
  readonly showId: string
  readonly record: ShowRecordV2
  readonly revision: number
  readonly provider: PersonalContentProvider
}
export interface ShowV2PilotPreparedEditContext {
  showId: string
  baseRevision: number
  capture: ShowV2PilotPreparedCapture
  /** Trusted local notification records identity only; it never controls persistence. */
  onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
  /** Trusted adapter checks its route lifetime and captured dependency identity. */
  isCurrent: () => boolean
}
export type ShowV2PilotMarkerEditRequest = ShowV2PilotPreparedEditContext & { intent: ShowMarkerEditIntentV2 }
export type ShowV2PilotMarkerEditOutcome =
  | { status: 'applied'; settlement: 'saved' | 'superseded'; affectedMarkerIds: string[] }
  | { status: 'unchanged'; affectedMarkerIds: [] }
  | { status: 'refused'; code: 'stale-edit' | 'missing-show' | 'unsupported-provider' | 'invalid-marker' | 'unsupported-pilot-record'; message: string; affectedMarkerIds: [] }


type AdmissionRefusal = 'stale-edit' | 'missing-show' | 'unsupported-provider' | 'unsupported-pilot-record'
type ResizeAffected = Pick<ShowTransitionEditResultV2, 'affectedClipIds' | 'affectedTransitionIds' | 'affectedTrackIds' | 'removedIds'>
type ResizeEmpty = { [K in keyof ResizeAffected]: [] }
export type ShowV2PilotTransitionResizeIntent = Extract<
  ShowTransitionEditIntentV2,
  { kind: 'resize-transition' | 'resize-leading' | 'resize-trailing' | 'move-connected' }
>
export type ShowV2PilotTransitionResizeRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotTransitionResizeIntent }
export type ShowV2PilotTransitionResizeOutcome =
  | ({ status: 'applied'; settlement: 'saved' | 'superseded' } & ResizeAffected)
  | ({ status: 'unchanged' } & ResizeEmpty)
  | ({ status: 'refused'; source: 'admission'; code: AdmissionRefusal; message: string } & ResizeEmpty)
  | ({ status: 'refused'; source: 'transition'; code: ShowTransitionEditRefusalV2; message: string } & ResizeEmpty)
type Command =
  | { owner: 'layout-occurrence'; intent: ShowV2PilotLayoutOccurrenceIntent }
  | { owner: 'delete-clip'; intent: ShowV2PilotClipDeleteIntent }
  | { owner: 'group-occurrence'; intent: ShowV2PilotGroupOccurrenceEditIntent }
  | { owner: 'group-replace'; intent: ReplaceShowGroupDefinitionClipPatternIntentV2 }
  | { owner: 'create-group'; intent: CreateShowGroupFromSelectionIntentV2 }
  | { owner: 'marker'; intent: ShowMarkerEditIntentV2 }
  | { owner: 'transition-resize'; intent: ShowV2PilotTransitionResizeIntent }
  | { owner: 'transition-edit'; intent: ShowV2PilotTransitionEditIntent }
  | { owner: 'create-clip'; intent: CreateShowClipIntentV2 }
  | { owner: 'clip-temporal'; intent: ShowClipTemporalIntentV2 }
  | { owner: 'clip-sharing'; intent: ShowV2PilotClipSharingIntent }
  | { owner: 'clip-entry-policy'; intent: Extract<ShowClipEditIntentV2, { kind: 'set-entry-policy' }> }
  | { owner: 'clip-replace'; intent: Extract<ShowClipEditIntentV2, { kind: 'replace-pattern' }> }
  | { owner: 'instance-properties'; intent: ShowV2PilotInstancePropertiesIntent }
  | { owner: 'insert-time'; intent: ShowInsertTimeIntentV2 }
  | { owner: 'layer'; intent: ShowLayerEditIntentV2 }
  | { owner: 'appearance'; intent: ShowClipAppearanceEditIntentV2 }
  | { owner: 'property'; propertyOwner: ShowPropertyTrackOwnerV2; intent: ShowPropertyEditIntentV2 }
  | { owner: 'set-show-end'; intent: Extract<ShowLayoutEditIntentV2, { kind: 'set-show-end' }> }
  | { owner: 'show-metadata'; intent: ShowV2ShowMetadataCommand }
  | { owner: 'zone'; intent: ShowZoneEditIntentV2 }
  | { owner: 'layout-definition'; intent: ShowZoneLayoutDefinitionIntentV2 }
export type ShowV2PilotClipDeleteIntent = Extract<ShowTransitionEditIntentV2, { kind: 'delete-clip' }>
export type ShowV2PilotClipDeleteRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotClipDeleteIntent }
export type ShowV2PilotClipDeleteOutcome = PilotOwnerOutcome<ShowTransitionEditResultV2, ShowTimelineEditAffectedV2>
type OwnerResult<C extends Command> = C extends { owner: 'layout-occurrence' } ? ShowLayoutEditResultV2
  : C extends { owner: 'group-occurrence' } ? ShowGroupEditResultV2
  : C extends { owner: 'group-replace' } ? ShowGroupReplacementResultV2
  : C extends { owner: 'create-group' } ? ShowGroupCreateResultV2
  : C extends { owner: 'marker' } ? ShowMarkerEditResultV2
  : C extends { owner: 'create-clip' } ? ShowClipCreationResultV2
  : C extends { owner: 'clip-temporal' } ? ShowClipTemporalResultV2
  : C extends { owner: 'clip-sharing' | 'clip-replace' | 'clip-entry-policy' } ? ShowClipEditResultV2
  : C extends { owner: 'instance-properties' } ? ShowInstancePropertiesResultV2
  : C extends { owner: 'insert-time' } ? ShowTimelineEditResultV2
  : C extends { owner: 'layer' } ? ShowLayerEditResultV2
  : C extends { owner: 'appearance' } ? ShowClipAppearanceEditResultV2
  : C extends { owner: 'property' } ? ShowPropertyEditResultV2
  : C extends { owner: 'set-show-end' } ? ShowLayoutEditResultV2
  : C extends { owner: 'show-metadata' } ? ShowCommandV2Outcome
  : C extends { owner: 'zone' } ? ShowZoneEditResultV2
  : C extends { owner: 'layout-definition' } ? ShowZoneLayoutDefinitionResultV2
  : ShowTransitionEditResultV2
type CheckedOutcome<R> =
  | { status: 'applied'; settlement: 'saved' | 'superseded'; result: R }
  | { status: 'unchanged'; result: R }
  | { status: 'refused'; source: 'owner'; result: R }
  | { status: 'refused'; source: 'admission'; code: AdmissionRefusal; message: string }

// Private closed owner dispatch; the conditional result is determined only by
// this discriminator. No caller-supplied candidate or transformation is accepted.
async function admitPreparedEdit<C extends Command>(request: ShowV2PilotPreparedEditContext & C): Promise<CheckedOutcome<OwnerResult<C>>> {
  const { showId, baseRevision, isCurrent } = request
  const refuse = (code: AdmissionRefusal, message: string): CheckedOutcome<OwnerResult<C>> => ({ status: 'refused', source: 'admission', code, message })
  const current = useShowStore.getState().showV2Pilots[showId]
  if (!current) return refuse('missing-show', 'The v2 Show is no longer open.')
  const provider = getPersonalContentProvider()
  const eligible = (): boolean => {
    try {
      return request.capture.record === current && isCurrent() && Number.isSafeInteger(baseRevision) && baseRevision >= 0
        && (useShowStore.getState().showRevisions[showId] ?? 0) === baseRevision
        && useShowStore.getState().showV2Pilots[showId] === current && getPersonalContentProvider() === provider
    } catch { return false }
  }
  if (!eligible()) return refuse('stale-edit', 'The Show or its dependencies changed. Try the edit again.')
  if (!provider.replaceShowV2) return refuse('unsupported-provider', 'The active provider does not support v2 Shows.')
  const command: Command = request
  const result = (command.owner === 'layout-occurrence'
    ? (command.intent.kind === 'insert-interval'
      ? insertShowLayoutIntervalV2(current, structuredClone(command.intent))
      : editShowLayoutIntervalsV2(current, structuredClone(command.intent)))
    : command.owner === 'group-occurrence'
        ? groupOccurrenceOwnerResult(current, structuredClone(command.intent), request.capture)
        : command.owner === 'group-replace'
        ? replaceShowGroupDefinitionClipPatternV2(current, structuredClone(command.intent))
        : command.owner === 'create-group'
          ? createShowGroupFromSelectionV2(current, structuredClone(command.intent))
        : command.owner === 'marker'
          ? editShowMarkerV2(current, structuredClone(command.intent))
          : command.owner === 'create-clip'
            ? createShowClipV2(current, structuredClone(command.intent))
            : command.owner === 'clip-sharing' || command.owner === 'clip-replace' || command.owner === 'clip-entry-policy'
            ? editShowClipV2(current, structuredClone(command.intent))
            : command.owner === 'instance-properties'
              ? writeShowInstancePropertiesV2(current, command.intent.clipId, structuredClone(command.intent.properties), capturedPatternResolver(request.capture))
          : command.owner === 'clip-temporal'
              ? editShowClipTemporalV2(current, structuredClone(command.intent))
              : command.owner === 'insert-time'
                ? insertShowTimeV2(current, structuredClone(command.intent))
                : command.owner === 'layer'
                  ? editShowLayerV2(current, structuredClone(command.intent))
                  : command.owner === 'appearance'
                    ? editShowClipAppearanceV2(current, structuredClone(command.intent))
                    : command.owner === 'property'
                      ? editShowPropertyV2(current, command.propertyOwner, command.intent)
                      : command.owner === 'set-show-end'
                        ? editShowLayoutIntervalsV2(current, structuredClone(command.intent))
                        : command.owner === 'show-metadata'
                          ? applyShowCommandV2(current, command.intent.command, structuredClone(command.intent.input))
                          : command.owner === 'zone'
                            ? editShowZoneV2(current, structuredClone(command.intent))
                            : command.owner === 'layout-definition'
                              ? editShowZoneLayoutDefinitionV2(current, structuredClone(command.intent))
                              : editShowTransitionV2(current, structuredClone(command.intent))) as OwnerResult<C>
  if (result.status === 'refused') return { status: 'refused', source: 'owner', result }
  if (result.status === 'unchanged') return { status: 'unchanged', result }
  const { capture } = request
  const prepared = capture.prepared
  const capturedInputs = capture.inputCapture
  if (capturedInputs?.status === 'invalid') return refuse('unsupported-pilot-record', capturedInputs.message)
  if (capturedInputs?.status === 'qualified' && (capturedInputs.inputs.identity.record !== current || capturedInputs.inputs.identity.dependencies !== capture.dependencies)) return refuse('stale-edit', 'The Show or its captured inputs changed. Try the edit again.')
  if (prepared.status === 'refused' && capturedInputs?.status !== 'qualified') return refuse('unsupported-pilot-record', prepared.message)
  if (prepared.status === 'ready' && (prepared.bundle.identity.record !== current || prepared.bundle.identity.dependencies !== capture.dependencies)) {
    return refuse('stale-edit', 'The Show or its prepared context changed. Try the edit again.')
  }
  if (prepared.status === 'empty' && (!isValidatedEmptyShowV2(current) || !isValidatedEmptyShowV2(prepared.record))) {
    return refuse('unsupported-pilot-record', 'The prepared empty Show does not match this edit.')
  }
  // An accepted edit may select another Stage map, which the capture's pinned
  // map cannot prepare. Resolve the named one exactly as the route resolves its
  // own, and refuse a map that is gone or at an unsupported dimension rather
  // than preparing the Show against geometry it does not name. This is the same
  // rule `showV2CandidateAdmission` applies to an agent's candidate.
  const movedStage = (result.record.stageMapId ?? null) !== (current.stageMapId ?? null)
  if (movedStage && !showV2StageMapAvailable(result.record.stageMapId, capture.dependencies.maps)) {
    return refuse('unsupported-pilot-record', `The Stage map "${result.record.stageMapId}" is unavailable at a dimension the Stage supports.`)
  }
  const candidate = movedStage
    ? prepareShowStageV2(result.record, { ...capture.dependencies, stageMap: resolveShowV2StageMap(result.record.stageMapId, capture.dependencies.maps) })
    : capturedInputs?.status === 'qualified'
      ? prepareShowStageFromCapturedInputsV2(result.record, capturedInputs.inputs)
      : prepareShowStageV2(result.record, prepared.status === 'ready' ? { ...prepared.bundle.assets, stageMap: capture.dependencies.stageMap } : capture.dependencies)
  const deletingToEmpty = ((command.owner === 'group-occurrence' && command.intent.kind === 'delete-occurrence')
    || (command.owner === 'zone' && command.intent.kind === 'remove')
    || command.owner === 'delete-clip') && isValidatedEmptyShowV2(result.record)
  const expectedCapability = deletingToEmpty ? 'empty' : command.owner === 'create-clip' || prepared.status === 'refused' ? 'ready' : prepared.status
  if (candidate.status !== expectedCapability) return refuse('unsupported-pilot-record', candidate.status === 'refused' ? candidate.message : 'The edit changed the prepared Show capability.')
  if (!eligible()) return refuse('stale-edit', 'The Show or its dependencies changed. Try the edit again.')
  const saving = useShowStore.getState().updateShowV2Pilot(showId, result.record)
  const adopted = useShowStore.getState().showV2Pilots[showId]
  const revision = useShowStore.getState().showRevisions[showId] ?? 0
  try { request.onAdopted({ showId, record: adopted, revision, provider }) } catch { /* Identity notification cannot interrupt persistence. */ }
  await saving
  return { status: 'applied', settlement: getPersonalContentProvider() === provider && useShowStore.getState().showV2Pilots[showId] === adopted ? 'saved' : 'superseded', result }
}

export async function admitShowV2PilotMarkerEdit(request: ShowV2PilotMarkerEditRequest): Promise<ShowV2PilotMarkerEditOutcome> {
  const outcome = await admitPreparedEdit({ ...request, owner: 'marker' as const })
  if (outcome.status === 'refused') {
    if (outcome.source === 'admission') return { status: 'refused', code: outcome.code, message: outcome.message, affectedMarkerIds: [] }
    if (outcome.result.status !== 'refused') throw new Error('Invalid Marker owner result.')
    return { status: 'refused', code: 'invalid-marker', message: outcome.result.message, affectedMarkerIds: [] }
  }
  return outcome.status === 'unchanged' ? { status: 'unchanged', affectedMarkerIds: [] } : { status: 'applied', settlement: outcome.settlement, affectedMarkerIds: outcome.result.affectedMarkerIds }
}
const resizeEmpty = (): ResizeEmpty => ({ affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [] })
function validTransitionResizeIntent(intent: unknown): intent is ShowV2PilotTransitionResizeIntent {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const raw = intent as Record<string, unknown>
  if (raw.kind === 'resize-transition') {
    return Object.keys(raw).every(key => ['kind', 'transitionId', 'durationMs'].includes(key))
  }
  if (raw.kind === 'resize-leading') {
    return Object.keys(raw).every(key => ['kind', 'clipId', 'startMs'].includes(key))
  }
  if (raw.kind === 'resize-trailing') {
    return Object.keys(raw).every(key => ['kind', 'clipId', 'endMs'].includes(key))
  }
  if (raw.kind === 'move-connected') {
    return Object.keys(raw).every(key => ['kind', 'clipId', 'startMs', 'zoneId', 'layerId'].includes(key))
      && ['kind', 'clipId', 'startMs'].every(key => Object.prototype.hasOwnProperty.call(raw, key))
  }
  return false
}
export async function admitShowV2PilotTransitionResize(request: ShowV2PilotTransitionResizeRequest): Promise<ShowV2PilotTransitionResizeOutcome> {
  // Guard the public command partition before the broad pure Transition owner.
  // The door admits the Transition-duration resize plus the three connected
  // Clip forms the owner defines; palette insert/update, reset and delete
  // stay on their own doors.
  if (!validTransitionResizeIntent(request.intent)) {
    return { status: 'refused', source: 'transition', code: 'invalid-intent', message: 'Give one explicit Transition resize or connected Clip edit.', ...resizeEmpty() }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'transition-resize' as const })
  if (outcome.status === 'refused') {
    if (outcome.source === 'admission') return { ...outcome, ...resizeEmpty() }
    if (outcome.result.status !== 'refused') throw new Error('Invalid Transition owner result.')
    return { status: 'refused', source: 'transition', code: outcome.result.code, message: outcome.result.message, ...resizeEmpty() }
  }
  if (outcome.status === 'unchanged') return { status: 'unchanged', ...resizeEmpty() }
  const { affectedClipIds, affectedTransitionIds, affectedTrackIds, removedIds } = outcome.result
  return { status: 'applied', settlement: outcome.settlement, affectedClipIds, affectedTransitionIds, affectedTrackIds, removedIds }
}
export type ShowV2PilotTransitionEditIntent = Extract<ShowTransitionEditIntentV2, { kind: 'insert' | 'update-transition' | 'reset-to-cut' }>
export type ShowV2PilotTransitionEditRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotTransitionEditIntent }
export type ShowV2PilotTransitionEditOutcome = PilotOwnerOutcome<ShowTransitionEditResultV2, ResizeAffected>
function validTransitionEditIntent(intent: unknown): intent is ShowV2PilotTransitionEditIntent {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  if (!object(intent)) return false
  if (intent.kind === 'reset-to-cut') {
    if (!text(intent.transitionId)) return false
    if (exactIntentFields(intent, ['kind', 'transitionId'])) return true
    if (!exactIntentFields(intent, ['kind', 'transitionId', 'propertyRampProjections']) || !Array.isArray(intent.propertyRampProjections)) return false
    return intent.propertyRampProjections.every(projection => (
      exactIntentFields(projection, ['rampIndex', 'trackId', 'startKeyId', 'endKeyId', 'activeEndMs', 'toValue']) && object(projection)
      && typeof projection.rampIndex === 'number' && Number.isSafeInteger(projection.rampIndex) && projection.rampIndex >= 0
      && text(projection.trackId) && text(projection.startKeyId) && text(projection.endKeyId)
      && typeof projection.activeEndMs === 'number' && Number.isSafeInteger(projection.activeEndMs) && projection.activeEndMs >= 0
      && typeof projection.toValue === 'number' && Number.isFinite(projection.toValue)
    ))
  }
  if (intent.kind !== 'insert' && intent.kind !== 'update-transition') return false
  if (!exactIntentFields(intent, ['kind', 'transition']) || !object(intent.transition)) return false
  const transition = intent.transition
  // Structure, references, timing and unknown fields stay with the record validator.
  if (!text(transition.id) || !text(transition.kind) || transition.kind === 'cut'
    || typeof transition.durationMs !== 'number' || !Number.isSafeInteger(transition.durationMs) || transition.durationMs <= 0
    || !Array.isArray(transition.participants) || !Array.isArray(transition.propertyRamps)) return false
  // A fresh insert never authors a boundary carrier through this surface.
  return intent.kind !== 'insert' || transition.propertyRamps.length === 0
}
export async function admitShowV2PilotTransitionEdit(request: ShowV2PilotTransitionEditRequest): Promise<ShowV2PilotTransitionEditOutcome> {
  if (!validTransitionEditIntent(request.intent)) {
    return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one complete explicit Transition Insert, settings or Reset operation.', ...resizeEmpty() }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'transition-edit' as const })
  const result = 'result' in outcome ? outcome.result : undefined
  const effects: ResizeAffected = result && result.status !== 'refused'
    ? { affectedClipIds: result.affectedClipIds, affectedTransitionIds: result.affectedTransitionIds, affectedTrackIds: result.affectedTrackIds, removedIds: result.removedIds }
    : resizeEmpty()
  return presentOwnerOutcome(outcome, effects)
}
export type ShowV2PilotCreateClipRequest = ShowV2PilotPreparedEditContext & { intent: CreateShowClipIntentV2 }
type CreateEffects = Pick<ShowClipCreationResultV2, 'affectedClipIds' | 'affectedTrackIds' | 'affectedInstanceIds' | 'affectedAppearanceKeyIds' | 'affectedKeyframeIds' | 'hoistedInstanceIds' | 'removedIds'>
export type ShowV2PilotCreateClipOutcome =
  | ({ status: 'applied'; settlement: 'saved' | 'superseded' } & CreateEffects)
  | ({ status: 'unchanged' } & CreateEffects)
  | ({ status: 'refused'; source: 'admission'; code: AdmissionRefusal; message: string } & CreateEffects)
  | ({ status: 'refused'; source: 'owner'; code: Extract<ShowClipCreationResultV2, { status: 'refused' }>['code']; message: string } & CreateEffects)
export async function admitShowV2PilotCreateClip(request: ShowV2PilotCreateClipRequest): Promise<ShowV2PilotCreateClipOutcome> {
  const outcome = await admitPreparedEdit({ ...request, owner: 'create-clip' as const })
  if (outcome.status === 'refused' && outcome.source === 'admission') return { ...outcome, affectedClipIds: [], affectedTrackIds: [], affectedInstanceIds: [], affectedAppearanceKeyIds: [], affectedKeyframeIds: [], hoistedInstanceIds: [], removedIds: [] }
  const { affectedClipIds, affectedTrackIds, affectedInstanceIds, affectedAppearanceKeyIds, affectedKeyframeIds, hoistedInstanceIds, removedIds } = outcome.result
  const effects = { affectedClipIds, affectedTrackIds, affectedInstanceIds, affectedAppearanceKeyIds, affectedKeyframeIds, hoistedInstanceIds, removedIds }
  if (outcome.status === 'refused') {
    if (outcome.result.status !== 'refused') throw new Error('Invalid Create owner result.')
    return { status: 'refused', source: 'owner', code: outcome.result.code, message: outcome.result.message, ...effects }
  }
  return outcome.status === 'unchanged' ? { status: 'unchanged', ...effects } : { status: 'applied', settlement: outcome.settlement, ...effects }
}
export type ShowV2PilotCreateGroupRequest = ShowV2PilotPreparedEditContext & { intent: CreateShowGroupFromSelectionIntentV2 }
export type ShowV2PilotCreateGroupOutcome = PilotOwnerOutcome<ShowGroupCreateResultV2, ShowGroupEditAffectedV2>
export async function admitShowV2PilotCreateGroup(request: ShowV2PilotCreateGroupRequest): Promise<ShowV2PilotCreateGroupOutcome> {
  const outcome = await admitPreparedEdit({ ...request, owner: 'create-group' as const })
  const result = 'result' in outcome ? outcome.result : undefined
  return presentOwnerOutcome(outcome, { ...timelineEffects(result), hoistedInstanceIds: result?.hoistedInstanceIds ?? [] })
}
type OwnerRefusal<R> = R extends { status: 'refused'; code: infer C extends string } ? C : never
type PilotOwnerOutcome<R, E> =
  | ({ status: 'applied'; settlement: 'saved' | 'superseded' } & E)
  | ({ status: 'unchanged' } & E)
  | ({ status: 'refused'; source: 'admission'; code: AdmissionRefusal; message: string } & E)
  | ({ status: 'refused'; source: 'owner'; code: OwnerRefusal<R>; message: string } & E)
function presentOwnerOutcome<R extends { status: string }, E>(outcome: CheckedOutcome<R>, effects: E): PilotOwnerOutcome<R, E> {
  if (outcome.status === 'refused') {
    if (outcome.source === 'admission') return { ...outcome, ...effects }
    if (outcome.result.status !== 'refused' || !('code' in outcome.result) || !('message' in outcome.result)) throw new Error('Invalid typed owner refusal.')
    return { status: 'refused', source: 'owner', code: outcome.result.code as OwnerRefusal<R>, message: String(outcome.result.message), ...effects }
  }
  return outcome.status === 'unchanged' ? { status: 'unchanged', ...effects } : { status: 'applied', settlement: outcome.settlement, ...effects }
}
function timelineEffects(result?: ShowTimelineEditAffectedV2): ShowTimelineEditAffectedV2 {
  return result ? {
    affectedClipIds: result.affectedClipIds, affectedInstanceIds: result.affectedInstanceIds, affectedTransitionIds: result.affectedTransitionIds,
    affectedTrackIds: result.affectedTrackIds, affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedLayoutOccurrenceIds: result.affectedLayoutOccurrenceIds,
    affectedGroupDefinitionIds: result.affectedGroupDefinitionIds, affectedGroupOccurrenceIds: result.affectedGroupOccurrenceIds, affectedLayerIds: result.affectedLayerIds,
    affectedMarkerIds: result.affectedMarkerIds, affectedAppearanceKeyIds: result.affectedAppearanceKeyIds, affectedPropertyKeyIds: result.affectedPropertyKeyIds,
    removedIds: result.removedIds, discardedControlTargets: result.discardedControlTargets,
  } : {
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [],
    affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], removedIds: [], discardedControlTargets: [],
  }
}
function exactIntentFields(intent: unknown, fields: readonly string[]): boolean {
  return !!intent && typeof intent === 'object' && !Array.isArray(intent) && Object.keys(intent).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(intent, field))
}
export type ShowV2PilotClipTemporalRequest = ShowV2PilotPreparedEditContext & { intent: ShowClipTemporalIntentV2 }
export type ShowV2PilotClipTemporalOutcome = PilotOwnerOutcome<ShowClipTemporalResultV2, ShowTimelineEditAffectedV2>
export async function admitShowV2PilotClipTemporal(request: ShowV2PilotClipTemporalRequest): Promise<ShowV2PilotClipTemporalOutcome> {
  const outcome = await admitPreparedEdit({ ...request, owner: 'clip-temporal' as const })
  return presentOwnerOutcome(outcome, timelineEffects('result' in outcome ? outcome.result : undefined))
}
export type ShowV2PilotInsertTimeRequest = ShowV2PilotPreparedEditContext & { intent: ShowInsertTimeIntentV2 }
export type ShowV2PilotInsertTimeOutcome = PilotOwnerOutcome<ShowTimelineEditResultV2, ShowTimelineEditAffectedV2>
export async function admitShowV2PilotInsertTime(request: ShowV2PilotInsertTimeRequest): Promise<ShowV2PilotInsertTimeOutcome> {
  if (!exactIntentFields(request.intent, ['atMs', 'durationMs'])) return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one explicit Insert Time operation.', ...timelineEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'insert-time' as const })
  return presentOwnerOutcome(outcome, timelineEffects('result' in outcome ? outcome.result : undefined))
}
type EndEffects = Pick<ShowLayoutEditResultV2, 'affectedClipIds' | 'affectedGroupOccurrenceIds' | 'affectedLayoutDefinitionIds' | 'affectedLayoutOccurrenceIds' | 'affectedMarkerIds' | 'affectedTrackIds' | 'affectedTransitionIds' | 'removedLayoutOccurrenceIds'>
function endEffects(result?: ShowLayoutEditResultV2): EndEffects {
  return result ? { affectedClipIds: result.affectedClipIds, affectedGroupOccurrenceIds: result.affectedGroupOccurrenceIds, affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedLayoutOccurrenceIds: result.affectedLayoutOccurrenceIds, affectedMarkerIds: result.affectedMarkerIds, affectedTrackIds: result.affectedTrackIds, affectedTransitionIds: result.affectedTransitionIds, removedLayoutOccurrenceIds: result.removedLayoutOccurrenceIds }
    : { affectedClipIds: [], affectedGroupOccurrenceIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedTrackIds: [], affectedTransitionIds: [], removedLayoutOccurrenceIds: [] }
}
export type ShowV2PilotSetShowEndRequest = ShowV2PilotPreparedEditContext & { intent: Extract<ShowLayoutEditIntentV2, { kind: 'set-show-end' }> }
export type ShowV2PilotSetShowEndOutcome = PilotOwnerOutcome<ShowLayoutEditResultV2, EndEffects>
export async function admitShowV2PilotSetShowEnd(request: ShowV2PilotSetShowEndRequest): Promise<ShowV2PilotSetShowEndOutcome> {
  if (!exactIntentFields(request.intent, ['kind', 'showEndMs']) || request.intent.kind !== 'set-show-end') return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one explicit Show End operation.', ...endEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'set-show-end' as const })
  return presentOwnerOutcome(outcome, endEffects('result' in outcome ? outcome.result : undefined))
}

/**
 * The Show-level metadata the editor writes through the registry owner: the
 * output contract, the Stage map, one Zone's metadata and the Trails output
 * Effect. The allowlist is the surface's own scope, not a new rule: every
 * command outside it has its own admission wrapper, and a caller may not reach
 * one through this door.
 */
const SHOW_METADATA_COMMANDS = ['set_output_contract', 'set_stage_map', 'update_zone', 'set_output_trails'] as const
export type ShowV2PilotShowMetadataRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2ShowMetadataCommand }
export type ShowV2PilotShowMetadataOutcome =
  | { status: 'applied'; settlement: 'saved' | 'superseded'; description: string; affected: string[] }
  | { status: 'unchanged'; affected: [] }
  | { status: 'refused'; source: 'admission'; code: AdmissionRefusal; message: string; affected: [] }
  | { status: 'refused'; source: 'owner'; code: string; message: string; affected: [] }
function validShowMetadataIntent(intent: unknown): intent is ShowV2ShowMetadataCommand {
  return exactIntentFields(intent, ['command', 'input'])
    && (SHOW_METADATA_COMMANDS as readonly string[]).includes((intent as ShowV2ShowMetadataCommand).command)
    && !!(intent as ShowV2ShowMetadataCommand).input
    && typeof (intent as ShowV2ShowMetadataCommand).input === 'object'
    && !Array.isArray((intent as ShowV2ShowMetadataCommand).input)
}
export async function admitShowV2PilotShowMetadata(request: ShowV2PilotShowMetadataRequest): Promise<ShowV2PilotShowMetadataOutcome> {
  if (!validShowMetadataIntent(request.intent)) {
    return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one Show output contract, Stage map, Zone or Trails command with its complete input.', affected: [] }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'show-metadata' as const })
  if (outcome.status === 'refused') {
    if (outcome.source === 'admission') return { ...outcome, affected: [] }
    if (outcome.result.status !== 'refused') throw new Error('Invalid Show metadata owner result.')
    const issue = outcome.result.issues[0]
    return { status: 'refused', source: 'owner', code: issue?.code ?? 'invalid-argument', message: issue?.message ?? 'The owner declined this edit.', affected: [] }
  }
  if (outcome.status === 'unchanged') return { status: 'unchanged', affected: [] }
  if (outcome.result.status !== 'changed') throw new Error('Invalid Show metadata owner result.')
  const change = outcome.result.changes[0]
  return {
    status: 'applied',
    settlement: outcome.settlement,
    description: change?.description ?? '',
    affected: change?.targetId ? [change.targetId] : [],
  }
}

function validLayerIntent(intent: unknown): intent is ShowLayerEditIntentV2 {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const value = intent as Record<string, unknown>
  const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
  if (value.kind === 'add') {
    if (!exactIntentFields(value, ['kind', 'layer']) || !exactIntentFields(value.layer, ['id', 'zoneId', 'name', 'rank'])) return false
    const layer = value.layer as Record<string, unknown>
    return text(layer.id) && text(layer.zoneId) && text(layer.name) && typeof layer.rank === 'number' && Number.isSafeInteger(layer.rank) && layer.rank >= 0
  }
  if (value.kind === 'rename') return exactIntentFields(value, ['kind', 'zoneId', 'layerId', 'name']) && text(value.zoneId) && text(value.layerId) && text(value.name)
  if (value.kind === 'reorder') return exactIntentFields(value, ['kind', 'zoneId', 'layerIds']) && text(value.zoneId) && Array.isArray(value.layerIds) && Array.from(value.layerIds).every(text)
  if (value.kind !== 'remove' || !text(value.zoneId) || !text(value.layerId)) return false
  if (exactIntentFields(value, ['kind', 'zoneId', 'layerId'])) return true
  if (!exactIntentFields(value, ['kind', 'zoneId', 'layerId', 'reassignments']) || !Array.isArray(value.reassignments)) return false
  return Array.from(value.reassignments).every(plan => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return false
    const entry = plan as Record<string, unknown>
    if (!text(entry.layerId)) return false
    if (entry.kind === 'clip') return exactIntentFields(entry, ['kind', 'clipId', 'layerId']) && text(entry.clipId)
    if (entry.kind === 'group-layer-binding') return exactIntentFields(entry, ['kind', 'groupOccurrenceId', 'definitionLayerId', 'layerId']) && text(entry.groupOccurrenceId) && text(entry.definitionLayerId)
    return entry.kind === 'transition-participant' && exactIntentFields(entry, ['kind', 'transitionId', 'participantId', 'layerId']) && text(entry.transitionId) && text(entry.participantId)
  })
}
function layerEffects(result?: ShowLayerEditAffectedV2): ShowLayerEditAffectedV2 {
  return result ? {
    affectedClipIds: result.affectedClipIds, affectedInstanceIds: result.affectedInstanceIds, affectedTransitionIds: result.affectedTransitionIds,
    affectedTrackIds: result.affectedTrackIds, affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedLayoutOccurrenceIds: result.affectedLayoutOccurrenceIds,
    affectedGroupDefinitionIds: result.affectedGroupDefinitionIds, affectedGroupOccurrenceIds: result.affectedGroupOccurrenceIds, affectedLayerIds: result.affectedLayerIds,
    affectedMarkerIds: result.affectedMarkerIds, removedIds: result.removedIds, discardedControlTargets: result.discardedControlTargets,
  } : {
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [],
    affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], removedIds: [], discardedControlTargets: [],
  }
}
export type ShowV2PilotLayerEditRequest = ShowV2PilotPreparedEditContext & { intent: ShowLayerEditIntentV2 }
export type ShowV2PilotLayerEditOutcome = PilotOwnerOutcome<ShowLayerEditResultV2, ShowLayerEditAffectedV2>
export async function admitShowV2PilotLayerEdit(request: ShowV2PilotLayerEditRequest): Promise<ShowV2PilotLayerEditOutcome> {
  if (!validLayerIntent(request.intent)) return { status: 'refused', source: 'owner', code: 'invalid-request', message: 'Give one complete explicit Layer edit.', ...layerEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'layer' as const })
  return presentOwnerOutcome(outcome, layerEffects('result' in outcome ? outcome.result : undefined))
}
export type ShowV2PilotAppearanceEditRequest = ShowV2PilotPreparedEditContext & { intent: ShowClipAppearanceEditIntentV2 }
export type ShowV2PilotAppearanceEditOutcome = PilotOwnerOutcome<ShowClipAppearanceEditResultV2, ShowTimelineEditAffectedV2>
function validAppearanceIntentShape(intent: unknown): intent is ShowClipAppearanceEditIntentV2 {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const value = intent as Record<string, unknown>
  const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  if (!text(value.clipId)) return false
  const fields = ['kind', 'clipId', 'scope']
  if (value.scope === 'selected-time') {
    if (typeof value.atMs !== 'number' || !Number.isSafeInteger(value.atMs) || !exactIntentFields(value.keyIdentity, ['kind', 'appearanceKeyId'])) return false
    const identity = value.keyIdentity as Record<string, unknown>
    if (typeof identity.kind !== 'string' || !['retain', 'insert'].includes(identity.kind) || !text(identity.appearanceKeyId)) return false
    fields.push('atMs', 'keyIdentity')
  } else if (value.scope !== 'whole-clip') return false
  if (value.kind === 'appearance') return exactIntentFields(value, [...fields, 'patch']) && object(value.patch)
  if (value.kind === 'add-effect') return exactIntentFields(value, [...fields, 'effect']) && object(value.effect) && text(value.effect.id) && text(value.effect.kind)
  if (!text(value.effectId) || !text(value.effectKind)) return false
  if (value.kind === 'remove-effect') return exactIntentFields(value, [...fields, 'effectId', 'effectKind'])
  if (value.kind === 'update-effect') return exactIntentFields(value, [...fields, 'effectId', 'effectKind', 'parameter', 'value']) && text(value.parameter) && ['number', 'string'].includes(typeof value.value)
  if (value.kind === 'duplicate-effect') return exactIntentFields(value, [...fields, 'effectId', 'effectKind', 'newEffectId']) && text(value.newEffectId)
  return value.kind === 'reorder-effect' && exactIntentFields(value, [...fields, 'effectId', 'effectKind', 'targetEffectId', 'targetEffectKind', 'edge']) && text(value.targetEffectId) && text(value.targetEffectKind) && typeof value.edge === 'string' && ['before', 'after'].includes(value.edge)
}
export async function admitShowV2PilotAppearanceEdit(request: ShowV2PilotAppearanceEditRequest): Promise<ShowV2PilotAppearanceEditOutcome> {
  if (!validAppearanceIntentShape(request.intent)) return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one complete appearance operation with explicit scope and identities.', ...timelineEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'appearance' as const })
  return presentOwnerOutcome(outcome, timelineEffects('result' in outcome ? outcome.result : undefined))
}
export type ShowV2PilotPropertyEditRequest = ShowV2PilotPreparedEditContext & { propertyOwner: ShowPropertyTrackOwnerV2; intent: ShowPropertyEditIntentV2 }
export type ShowV2PilotPropertyEditOutcome = PilotOwnerOutcome<ShowPropertyEditResultV2, ShowTimelineEditAffectedV2>
export async function admitShowV2PilotPropertyEdit(request: ShowV2PilotPropertyEditRequest): Promise<ShowV2PilotPropertyEditOutcome> {
  const outcome = await admitPreparedEdit({ ...request, owner: 'property' as const })
  return presentOwnerOutcome(outcome, timelineEffects('result' in outcome ? outcome.result : undefined))
}

export type ShowV2PilotClipSharingIntent = Extract<ShowClipEditIntentV2, { kind: 'duplicate' | 'make-independent' | 'rejoin' }>
export type ShowV2PilotClipSharingRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotClipSharingIntent }
export type ShowV2PilotClipSharingOutcome = PilotOwnerOutcome<ShowClipEditResultV2, ShowTimelineEditAffectedV2>
function validSharingIntentShape(intent: unknown): intent is ShowV2PilotClipSharingIntent {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  const identities = (value: unknown): boolean => object(value) && Object.entries(value).every(([key, id]) => text(key) && text(id))
  const tracks = (value: unknown): boolean => object(value) && Object.entries(value).every(([key, plan]) => text(key) && exactIntentFields(plan, ['trackId', 'keyframeIdsBySourceId']) && object(plan) && text(plan.trackId) && identities(plan.keyframeIdsBySourceId))
  if (!object(intent) || !text(intent.clipId)) return false
  if (intent.kind === 'rejoin') return exactIntentFields(intent, ['kind', 'clipId', 'targetInstanceId']) && text(intent.targetInstanceId)
  if (intent.kind === 'make-independent') return exactIntentFields(intent, ['kind', 'clipId', 'independence']) && exactIntentFields(intent.independence, ['instanceId', 'identitiesBySourceTrackId']) && object(intent.independence) && text(intent.independence.instanceId) && tracks(intent.independence.identitiesBySourceTrackId)
  return intent.kind === 'duplicate' && exactIntentFields(intent, ['kind', 'clipId', 'zoneId', 'layerId', 'startMs', 'identities']) && text(intent.zoneId) && text(intent.layerId)
    && typeof intent.startMs === 'number' && Number.isSafeInteger(intent.startMs) && intent.startMs >= 0
    && exactIntentFields(intent.identities, ['clipId', 'appearanceKeyIdsBySourceId', 'clipTrackIdentitiesBySourceTrackId']) && object(intent.identities) && text(intent.identities.clipId)
    && identities(intent.identities.appearanceKeyIdsBySourceId) && tracks(intent.identities.clipTrackIdentitiesBySourceTrackId)
}
function sharingEffects(before: ShowRecordV2, intent: ShowV2PilotClipSharingIntent | Extract<ShowClipEditIntentV2, { kind: 'replace-pattern' }>, result?: ShowClipEditResultV2): ShowTimelineEditAffectedV2 {
  const effects = timelineEffects()
  if (!result) return effects
  effects.affectedClipIds = result.affectedClipIds
  effects.affectedInstanceIds = result.affectedInstanceIds ?? []
  effects.affectedTrackIds = result.affectedTrackIds
  effects.affectedPropertyKeyIds = result.affectedKeyframeIds ?? []
  effects.removedIds = result.removedIds ?? []
  effects.discardedControlTargets = result.discardedControlTargets ?? []
  // Duplicate's legacy local result reports created Clip/track IDs. Derive only
  // those new owners' exact keys; never diff or scan unrelated held owners.
  if (intent.kind === 'duplicate' && result.status === 'changed') {
    effects.affectedAppearanceKeyIds = result.affectedClipIds.filter(id => !before.composition.clips.some(clip => clip.id === id)).flatMap(id => result.record.composition.clips.find(clip => clip.id === id)?.appearance.keys.map(key => key.id) ?? [])
    effects.affectedPropertyKeyIds = result.affectedTrackIds.filter(id => !before.composition.propertyTracks.some(track => track.id === id)).flatMap(id => result.record.composition.propertyTracks.find(track => track.id === id)?.keyframes.map(key => key.id) ?? [])
  }
  return effects
}
export async function admitShowV2PilotClipSharingEdit(request: ShowV2PilotClipSharingRequest): Promise<ShowV2PilotClipSharingOutcome> {
  if (!validSharingIntentShape(request.intent)) return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one complete explicit Clip sharing operation.', ...timelineEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'clip-sharing' as const })
  return presentOwnerOutcome(outcome, sharingEffects(request.capture.record, request.intent, 'result' in outcome ? outcome.result : undefined))
}

export type ShowV2PilotClipEntryPolicyIntent = Extract<ShowClipEditIntentV2, { kind: 'set-entry-policy' }>
export type ShowV2PilotClipEntryPolicyRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotClipEntryPolicyIntent }
export type ShowV2PilotClipEntryPolicyOutcome = PilotOwnerOutcome<ShowClipEditResultV2, ShowTimelineEditAffectedV2>
/**
 * Write one existing Clip's Continue/Restart instruction through the same
 * `set-entry-policy` owner `update_clips` calls, so the editor and the command
 * are one writer (specification section 4).
 */
export async function admitShowV2PilotClipEntryPolicy(request: ShowV2PilotClipEntryPolicyRequest): Promise<ShowV2PilotClipEntryPolicyOutcome> {
  const intent: unknown = request.intent
  if (!exactIntentFields(intent, ['kind', 'clipId', 'entryPolicy'])
    || (intent as ShowV2PilotClipEntryPolicyIntent).kind !== 'set-entry-policy'
    || typeof (intent as ShowV2PilotClipEntryPolicyIntent).clipId !== 'string'
    || !(intent as ShowV2PilotClipEntryPolicyIntent).clipId.trim()
    || !['continue', 'restart'].includes((intent as ShowV2PilotClipEntryPolicyIntent).entryPolicy)) {
    return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Choose Continue or Restart for one ordinary Clip.', ...timelineEffects() }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'clip-entry-policy' as const })
  const result = 'result' in outcome ? outcome.result : undefined
  const effects = timelineEffects()
  if (result && result.status !== 'refused') effects.affectedClipIds = result.affectedClipIds
  return presentOwnerOutcome(outcome, effects)
}

/**
 * Pattern-instance values in the shared owner's own field names. The wrapper
 * hands them to `writeInstanceProperties` unchanged, so an editor write and an
 * `update_clips.instance_properties` write are the same write.
 */
export interface ShowV2PilotInstancePropertiesIntent {
  clipId: string
  properties: {
    controls?: Record<string, number>
    time_scale?: number
    time_offset_ms?: number
    evaluation?: ShowClipEvaluationPolicy
    /** `null` clears the stutter; the command descriptor does not expose this key yet. */
    stepped_clock?: { stepMs: number } | null
  }
}
type InstancePropertiesEffects = Pick<ShowTimelineEditAffectedV2, 'affectedClipIds' | 'affectedInstanceIds'>
export type ShowV2PilotInstancePropertiesRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotInstancePropertiesIntent }
export type ShowV2PilotInstancePropertiesOutcome =
  | ({ status: 'applied'; settlement: 'saved' | 'superseded' } & InstancePropertiesEffects)
  | ({ status: 'unchanged' } & InstancePropertiesEffects)
  | ({ status: 'refused'; source: 'admission'; code: AdmissionRefusal; message: string } & InstancePropertiesEffects)
  | ({ status: 'refused'; source: 'owner'; code: string; message: string } & InstancePropertiesEffects)
/** Trusted captured Pattern metadata, the only source the control check accepts. */
function capturedPatternResolver(capture: ShowV2PilotPreparedCapture): ShowInstancePropertyDependenciesV2 {
  return { resolvePattern: reference => resolveCapturedShowPatternReplacementV2(capture, reference) }
}
function validInstancePropertiesIntent(intent: unknown): intent is ShowV2PilotInstancePropertiesIntent {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  const unit = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
  if (!exactIntentFields(intent, ['clipId', 'properties']) || !object(intent)) return false
  if (typeof intent.clipId !== 'string' || !intent.clipId.trim() || !object(intent.properties)) return false
  const properties = intent.properties
  const names = Object.keys(properties)
  if (!names.length || names.some(name => !['controls', 'time_scale', 'time_offset_ms', 'evaluation', 'stepped_clock'].includes(name))) return false
  if (properties.controls !== undefined && (!object(properties.controls) || !Object.values(properties.controls).every(unit))) return false
  if (properties.time_scale !== undefined && (typeof properties.time_scale !== 'number' || !Number.isFinite(properties.time_scale) || properties.time_scale < 0 || properties.time_scale > 8)) return false
  if (properties.time_offset_ms !== undefined && (typeof properties.time_offset_ms !== 'number' || !Number.isSafeInteger(properties.time_offset_ms))) return false
  if (properties.evaluation !== undefined && !['live', 'freeze-at-entry', 'rolling-refresh'].includes(properties.evaluation as string)) return false
  if (properties.stepped_clock === undefined || properties.stepped_clock === null) return true
  return exactIntentFields(properties.stepped_clock, ['stepMs'])
    && typeof (properties.stepped_clock as { stepMs: unknown }).stepMs === 'number'
    && Number.isFinite((properties.stepped_clock as { stepMs: number }).stepMs)
    && (properties.stepped_clock as { stepMs: number }).stepMs > 0
}
export async function admitShowV2PilotInstanceProperties(request: ShowV2PilotInstancePropertiesRequest): Promise<ShowV2PilotInstancePropertiesOutcome> {
  const empty: InstancePropertiesEffects = { affectedClipIds: [], affectedInstanceIds: [] }
  if (!validInstancePropertiesIntent(request.intent)) {
    return { status: 'refused', source: 'owner', code: 'invalid-argument', message: 'Give one Clip and at least one supported Pattern-instance value.', ...empty }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'instance-properties' as const })
  if (outcome.status === 'refused' && outcome.source === 'admission') return { ...outcome, ...empty }
  if (outcome.status === 'refused') {
    return { status: 'refused', source: 'owner', code: outcome.result.code ?? 'engine-refused', message: outcome.result.message ?? 'The owner declined this edit.', ...empty }
  }
  if (outcome.status === 'unchanged') return { status: 'unchanged', ...empty }
  const effects: InstancePropertiesEffects = {
    affectedClipIds: outcome.result.affectedClipIds ?? [],
    affectedInstanceIds: outcome.result.affectedInstanceIds ?? [],
  }
  return { status: 'applied', settlement: outcome.settlement, ...effects }
}
export type ShowV2PilotGroupOccurrenceEditIntent = MoveShowGroupOccurrenceIntentV2 | DuplicateShowGroupOccurrenceIntentV2 | MakeShowGroupUniqueIntentV2 | UngroupShowGroupOccurrenceIntentV2 | DeleteShowGroupOccurrenceIntentV2 | SetShowGroupDefinitionClipTimingIntentV2 | EditShowGroupDefinitionClipAppearanceIntentV2 | WriteShowGroupDefinitionInstancePropertiesIntentV2 | InsertShowGroupDefinitionLayerTransitionIntentV2 | ResizeShowGroupDefinitionLayerTransitionIntentV2
export type ShowV2PilotGroupOccurrenceEditRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotGroupOccurrenceEditIntent }
export type ShowV2PilotGroupOccurrenceEditOutcome = PilotOwnerOutcome<ShowGroupEditResultV2, ShowGroupEditAffectedV2>
function groupOccurrenceOwnerResult(record: ShowRecordV2, intent: ShowV2PilotGroupOccurrenceEditIntent, capture: ShowV2PilotPreparedCapture): ShowGroupEditResultV2 {
  switch (intent.kind) {
    case 'move-occurrence': return moveShowGroupOccurrenceV2(record, intent)
    case 'duplicate-occurrence': return duplicateShowGroupOccurrenceV2(record, intent)
    case 'make-unique': return makeShowGroupUniqueV2(record, intent)
    case 'ungroup-occurrence': return ungroupShowGroupOccurrenceV2(record, intent)
    case 'delete-occurrence': return deleteShowGroupOccurrenceV2(record, intent)
    case 'set-definition-clip-timing': return setShowGroupDefinitionClipTimingV2(record, intent)
    case 'edit-definition-clip-appearance': return editShowGroupDefinitionClipAppearanceV2(record, intent)
    case 'write-definition-instance-properties': return writeShowGroupDefinitionInstancePropertiesV2(record, intent, capturedPatternResolver(capture))
    case 'insert-definition-layer-transition': return insertShowGroupDefinitionLayerTransitionV2(record, intent)
    case 'resize-definition-layer-transition': return resizeShowGroupDefinitionLayerTransitionV2(record, intent)
  }
}
function validGroupOccurrenceIntent(intent: unknown): intent is ShowV2PilotGroupOccurrenceEditIntent {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const value = intent as Record<string, unknown>
  const text = (item: unknown): item is string => typeof item === 'string' && item.length > 0
  const mapping = (item: unknown): boolean => !!item && typeof item === 'object' && !Array.isArray(item) && Object.values(item).every(text)
  if (value.kind === 'set-definition-clip-timing') {
    const hasStart = 'startMs' in value
    const hasDuration = 'durationMs' in value
    if (!hasStart && !hasDuration) return false
    const expected = ['clipId', 'definitionId', 'kind', ...(hasStart ? ['startMs'] : []), ...(hasDuration ? ['durationMs'] : [])].sort()
    if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected)) return false
    if (!text(value.definitionId) || !text(value.clipId)) return false
    if (hasStart && (typeof value.startMs !== 'number' || !Number.isSafeInteger(value.startMs) || (value.startMs as number) < 0)) return false
    if (hasDuration && (typeof value.durationMs !== 'number' || !Number.isSafeInteger(value.durationMs) || (value.durationMs as number) <= 0)) return false
    return true
  }
  if (value.kind === 'edit-definition-clip-appearance') {
    if (!exactIntentFields(value, ['kind', 'definitionId', 'appearance'])) return false
    if (!text(value.definitionId)) return false
    return validAppearanceIntentShape(value.appearance)
  }
  if (value.kind === 'write-definition-instance-properties') {
    if (!exactIntentFields(value, ['kind', 'definitionId', 'clipId', 'properties'])) return false
    if (!text(value.definitionId) || !text(value.clipId)) return false
    return validInstancePropertiesIntent({ clipId: value.clipId, properties: value.properties })
  }
  if (value.kind === 'insert-definition-layer-transition') {
    if (!exactIntentFields(value, ['kind', 'definitionId', 'transition'])) return false
    if (!text(value.definitionId)) return false
    const transition = value.transition as Record<string, unknown>
    if (!transition || typeof transition !== 'object' || Array.isArray(transition)) return false
    const transitionText = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0
    if (!transitionText(transition.id) || !transitionText(transition.kind) || transition.kind === 'cut') return false
    if (typeof transition.durationMs !== 'number' || !Number.isSafeInteger(transition.durationMs) || (transition.durationMs as number) <= 0) return false
    if (!Array.isArray(transition.participants) || !Array.isArray(transition.propertyRamps)) return false
    return (transition.propertyRamps as unknown[]).length === 0
  }
  if (value.kind === 'resize-definition-layer-transition') {
    if (!exactIntentFields(value, ['kind', 'definitionId', 'transitionId', 'durationMs'])) return false
    if (!text(value.definitionId) || !text(value.transitionId)) return false
    return typeof value.durationMs === 'number' && Number.isSafeInteger(value.durationMs) && (value.durationMs as number) >= 0
  }
  if (!text(value.occurrenceId)) return false
  if (value.kind === 'ungroup-occurrence' || value.kind === 'delete-occurrence') return exactIntentFields(value, ['kind', 'occurrenceId'])
  if (value.kind === 'make-unique') {
    if (!exactIntentFields(value, ['kind', 'occurrenceId', 'identities']) || !exactIntentFields(value.identities, ['definitionId', 'patternInstanceIds', 'layerIds', 'clipIds', 'transitionIds', 'propertyTrackIds', 'appearanceKeyIdsByClipId', 'propertyKeyIdsByTrackId'])) return false
    const plan = value.identities as Record<string, unknown>
    const nested = (item: unknown) => !!item && typeof item === 'object' && !Array.isArray(item) && Object.values(item).every(mapping)
    return text(plan.definitionId) && ['patternInstanceIds', 'layerIds', 'clipIds', 'transitionIds', 'propertyTrackIds'].every(key => mapping(plan[key])) && nested(plan.appearanceKeyIdsByClipId) && nested(plan.propertyKeyIdsByTrackId)
  }
  if (value.kind !== 'move-occurrence' && value.kind !== 'duplicate-occurrence') return false
  const fields = ['kind', 'occurrenceId', 'startMs', 'layoutOccurrenceId', 'zoneId', 'layerBindings', 'translationX', 'translationY']
  if (value.kind === 'duplicate-occurrence') fields.push('newOccurrenceId')
  return exactIntentFields(value, fields) && typeof value.startMs === 'number' && Number.isSafeInteger(value.startMs)
    && text(value.layoutOccurrenceId) && text(value.zoneId) && typeof value.translationX === 'number' && Number.isFinite(value.translationX) && typeof value.translationY === 'number' && Number.isFinite(value.translationY)
    && Array.isArray(value.layerBindings) && value.layerBindings.every(binding => exactIntentFields(binding, ['definitionLayerId', 'layerId']) && typeof binding.definitionLayerId === 'string' && typeof binding.layerId === 'string')
    && (value.kind !== 'duplicate-occurrence' || text(value.newOccurrenceId))
}
export async function admitShowV2PilotGroupOccurrenceEdit(request: ShowV2PilotGroupOccurrenceEditRequest): Promise<ShowV2PilotGroupOccurrenceEditOutcome> {
  if (!validGroupOccurrenceIntent(request.intent)) return { status: 'refused', source: 'owner', code: 'invalid-placement', message: 'Give one complete explicit Group occurrence operation.', ...timelineEffects(), hoistedInstanceIds: [] }
  const outcome = await admitPreparedEdit({ ...request, owner: 'group-occurrence' as const })
  const result = 'result' in outcome ? outcome.result : undefined
  return presentOwnerOutcome(outcome, { ...timelineEffects(result), hoistedInstanceIds: result?.hoistedInstanceIds ?? [] })
}
/** Deletion may carry one complete ramp projection plan for each removed carrier. */
function validClipDeleteIntent(intent: unknown): intent is ShowV2PilotClipDeleteIntent {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  if (!object(intent) || intent.kind !== 'delete-clip' || typeof intent.clipId !== 'string' || !intent.clipId.trim()) return false
  if (exactIntentFields(intent, ['kind', 'clipId'])) return true
  if (!exactIntentFields(intent, ['kind', 'clipId', 'propertyRampProjections']) || !Array.isArray(intent.propertyRampProjections)) return false
  return intent.propertyRampProjections.every(plan => (
    exactIntentFields(plan, ['transitionId', 'projections']) && object(plan)
    && typeof plan.transitionId === 'string' && plan.transitionId.trim().length > 0
    && Array.isArray(plan.projections)
    && validTransitionEditIntent({ kind: 'reset-to-cut', transitionId: plan.transitionId, propertyRampProjections: plan.projections })
  ))
}
export async function admitShowV2PilotClipDelete(request: ShowV2PilotClipDeleteRequest): Promise<ShowV2PilotClipDeleteOutcome> {
  if (!validClipDeleteIntent(request.intent)) {
    return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Choose one ordinary Clip to delete.', ...timelineEffects() }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'delete-clip' as const })
  const effects = timelineEffects()
  if ('result' in outcome && outcome.result.status === 'changed') {
    const result = outcome.result
    effects.affectedClipIds = result.affectedClipIds
    effects.affectedTransitionIds = result.affectedTransitionIds
    effects.affectedTrackIds = result.affectedTrackIds
    effects.removedIds = result.removedIds
    // Only keys owned by the explicitly reported removed Clip/track owners.
    effects.affectedAppearanceKeyIds = result.affectedClipIds.filter(id => result.removedIds.includes(id)).flatMap(id => request.capture.record.composition.clips.find(clip => clip.id === id)?.appearance.keys.map(key => key.id) ?? [])
    effects.affectedPropertyKeyIds = result.affectedTrackIds.filter(id => result.removedIds.includes(id)).flatMap(id => request.capture.record.composition.propertyTracks.find(track => track.id === id)?.keyframes.map(key => key.id) ?? [])
  }
  return presentOwnerOutcome(outcome, effects)
}
export type ShowV2PilotLayoutOccurrenceIntent = Extract<ShowLayoutEditIntentV2,
  { kind: 'select-layout' | 'move' | 'remove' | 'remove-switch' | 'make-unique' | 'duplicate' | 'set-parameters' | 'set-transfer' | 'append' }>
  | ShowLayoutIntervalInsertIntentV2
type LayoutOccurrenceEffects = Pick<ShowLayoutEditResultV2, 'affectedClipIds' | 'affectedGroupOccurrenceIds' | 'affectedLayoutDefinitionIds' | 'affectedLayoutOccurrenceIds' | 'affectedMarkerIds' | 'affectedTrackIds' | 'affectedTransitionIds' | 'removedLayoutOccurrenceIds'>
export type ShowV2PilotLayoutOccurrenceRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotLayoutOccurrenceIntent }
export type ShowV2PilotLayoutOccurrenceOutcome = PilotOwnerOutcome<ShowLayoutEditResultV2, LayoutOccurrenceEffects>
function layoutOccurrenceEffects(result?: ShowLayoutEditResultV2): LayoutOccurrenceEffects {
  return result ? { affectedClipIds: result.affectedClipIds, affectedGroupOccurrenceIds: result.affectedGroupOccurrenceIds, affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedLayoutOccurrenceIds: result.affectedLayoutOccurrenceIds, affectedMarkerIds: result.affectedMarkerIds, affectedTrackIds: result.affectedTrackIds, affectedTransitionIds: result.affectedTransitionIds, removedLayoutOccurrenceIds: result.removedLayoutOccurrenceIds }
    : { affectedClipIds: [], affectedGroupOccurrenceIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedTrackIds: [], affectedTransitionIds: [], removedLayoutOccurrenceIds: [] }
}
function validLayoutOccurrenceIntent(intent: unknown): intent is ShowV2PilotLayoutOccurrenceIntent {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const value = intent as Record<string, unknown>
  const text = (input: unknown): input is string => typeof input === 'string' && input.trim().length > 0
  if (value.kind === 'insert-interval') {
    if (!exactIntentFields(value, ['kind', 'atMs', 'durationMs', 'layoutId', 'definition', 'occurrenceIds', 'rightClipIds'])) return false
    if (typeof value.atMs !== 'number' || !Number.isSafeInteger(value.atMs) || value.atMs < 0) return false
    if (typeof value.durationMs !== 'number' || !Number.isSafeInteger(value.durationMs) || value.durationMs <= 0) return false
    if (!text(value.layoutId)) return false
    const definition = value.definition
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return false
    const defined = definition as Record<string, unknown>
    if (defined.kind !== 'add' && defined.kind !== 'duplicate') return false
    if (defined.layoutId !== value.layoutId) return false
    if (defined.kind === 'add') {
      if (!exactIntentFields(defined, ['kind', 'layoutId', 'name'])) return false
      if (!text(defined.name)) return false
    } else {
      if (!exactIntentFields(defined, ['kind', 'layoutId', 'name', 'sourceLayoutId'])) return false
      if (!text(defined.name) || !text(defined.sourceLayoutId)) return false
    }
    if (!exactIntentFields(value.occurrenceIds, ['interval', 'resume'])) return false
    const occurrenceIds = value.occurrenceIds as Record<string, unknown>
    if (!text(occurrenceIds.interval) || !text(occurrenceIds.resume)) return false
    const rightClipIds = value.rightClipIds
    if (!rightClipIds || typeof rightClipIds !== 'object' || Array.isArray(rightClipIds)) return false
    return Object.entries(rightClipIds).every(([source, right]) => text(source) && text(right))
  }
  if (!text(value.occurrenceId)) return false
  if (value.kind === 'move') return exactIntentFields(value, ['kind', 'occurrenceId', 'startMs']) && typeof value.startMs === 'number' && Number.isSafeInteger(value.startMs)
  if (value.kind === 'remove' || value.kind === 'remove-switch') return exactIntentFields(value, ['kind', 'occurrenceId'])
  if (value.kind === 'select-layout') return exactIntentFields(value, ['kind', 'occurrenceId', 'layoutId']) && text(value.layoutId)
  if (value.kind === 'make-unique') return exactIntentFields(value, ['kind', 'occurrenceId', 'layoutId', 'name']) && text(value.layoutId) && text(value.name)
  if (value.kind === 'append') {
    const withDefinition = exactIntentFields(value, ['kind', 'occurrenceId', 'layoutId', 'durationMs', 'definition'])
    if (!exactIntentFields(value, ['kind', 'occurrenceId', 'layoutId', 'durationMs']) && !withDefinition) return false
    if (!text(value.layoutId) || typeof value.durationMs !== 'number' || !Number.isSafeInteger(value.durationMs)) return false
    if (!withDefinition) return true
    const definition = value.definition as Record<string, unknown>
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return false
    if (definition.kind === 'add') {
      return exactIntentFields(definition, ['kind', 'layoutId', 'name']) && text(definition.layoutId) && text(definition.name)
    }
    if (definition.kind === 'duplicate') {
      return exactIntentFields(definition, ['kind', 'layoutId', 'name', 'sourceLayoutId'])
        && text(definition.layoutId) && text(definition.name) && text(definition.sourceLayoutId)
    }
    return false
  }
  if (value.kind === 'set-parameters') {
    if (!exactIntentFields(value, ['kind', 'occurrenceId', 'parameters']) || !value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters)) return false
    const parameters = value.parameters as Record<string, unknown>
    if (!exactIntentFields(parameters, []) && !exactIntentFields(parameters, ['splitPosition'])) return false
    return parameters.splitPosition === undefined
      || (typeof parameters.splitPosition === 'number' && Number.isFinite(parameters.splitPosition))
  }
  if (value.kind === 'duplicate') {
    if (!text(value.newOccurrenceId)) return false
    if (exactIntentFields(value, ['kind', 'occurrenceId', 'newOccurrenceId'])) return true
    // A content plan names one fresh identity per copied entity; the owner
    // still checks that the map covers exactly its own source identities.
    if (!exactIntentFields(value, ['kind', 'occurrenceId', 'newOccurrenceId', 'content'])
      || !exactIntentFields(value.content, ['idsBySourceId'])) return false
    const ids = (value.content as Record<string, unknown>).idsBySourceId
    return !!ids && typeof ids === 'object' && !Array.isArray(ids)
      && Object.entries(ids).every(([source, id]) => text(source) && text(id))
  }
  if (value.kind !== 'set-transfer' || !exactIntentFields(value, ['kind', 'occurrenceId', 'transfer'])) return false
  if (value.transfer === null) return true
  if (!value.transfer || typeof value.transfer !== 'object' || Array.isArray(value.transfer)) return false
  const transfer = value.transfer as Record<string, unknown>
  if (!exactIntentFields(transfer, ['id', 'durationMs', 'direction'])
    && !exactIntentFields(transfer, ['id', 'durationMs', 'direction', 'easing'])) return false
  return text(transfer.id) && typeof transfer.durationMs === 'number' && Number.isSafeInteger(transfer.durationMs)
    && (transfer.direction === 'forward' || transfer.direction === 'reverse')
    && (transfer.easing === undefined || (!!transfer.easing && typeof transfer.easing === 'object' && !Array.isArray(transfer.easing)))
}
export async function admitShowV2PilotLayoutOccurrenceEdit(request: ShowV2PilotLayoutOccurrenceRequest): Promise<ShowV2PilotLayoutOccurrenceOutcome> {
  if (!validLayoutOccurrenceIntent(request.intent)) return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one complete explicit Layout occurrence edit.', ...layoutOccurrenceEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'layout-occurrence' as const })
  return presentOwnerOutcome(outcome, layoutOccurrenceEffects('result' in outcome ? outcome.result : undefined))
}
export type ShowV2PilotClipReplacementRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2ClipReplacementIntent }
export type ShowV2PilotClipReplacementOutcome = PilotOwnerOutcome<ShowClipEditResultV2, ShowTimelineEditAffectedV2>
function validReplacementIntentShape(intent: unknown): intent is ShowV2ClipReplacementIntent {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const value = intent as Record<string, unknown>
  const text = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0
  const fields = ['kind', 'clipId', 'patternReference', ...(Object.prototype.hasOwnProperty.call(value, 'independence') ? ['independence'] : [])]
  if (!exactIntentFields(value, fields) || value.kind !== 'replace-pattern' || !text(value.clipId) || !exactIntentFields(value.patternReference, ['kind', 'id'])) return false
  const reference = value.patternReference as Record<string, unknown>
  if ((reference.kind !== 'stock' && reference.kind !== 'user') || !text(reference.id)) return false
  return !Object.prototype.hasOwnProperty.call(value, 'independence') || validSharingIntentShape({ kind: 'make-independent', clipId: value.clipId, independence: value.independence })
}
export async function admitShowV2PilotClipReplacementEdit(request: ShowV2PilotClipReplacementRequest): Promise<ShowV2PilotClipReplacementOutcome> {
  if (!validReplacementIntentShape(request.intent)) return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Choose one captured Pattern with complete replacement identities.', ...timelineEffects() }
  const resolved = resolveCapturedShowPatternReplacementV2(request.capture, request.intent.patternReference)
  if (resolved.status === 'refused') return { status: 'refused', source: 'admission', code: 'unsupported-pilot-record', message: resolved.message, ...timelineEffects() }
  const intent: Extract<ShowClipEditIntentV2, { kind: 'replace-pattern' }> = { kind: 'replace-pattern', clipId: request.intent.clipId, replacement: resolved.replacement, ...(request.intent.independence ? { independence: request.intent.independence } : {}) }
  const outcome = await admitPreparedEdit({ ...request, intent, owner: 'clip-replace' as const })
  return presentOwnerOutcome(outcome, sharingEffects(request.capture.record, intent, 'result' in outcome ? outcome.result : undefined))
}
export type ShowV2PilotGroupReplacementRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2GroupReplacementIntent }
export type ShowV2PilotGroupReplacementOutcome = PilotOwnerOutcome<ShowGroupReplacementResultV2, ShowGroupEditAffectedV2>
function validTrackIdentityPlans(value: unknown): boolean {
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
  const text = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0
  return object(value) && Object.entries(value).every(([key, plan]) => text(key) && exactIntentFields(plan, ['trackId', 'keyframeIdsBySourceId']) && object(plan)
    && text(plan.trackId) && object(plan.keyframeIdsBySourceId) && Object.entries(plan.keyframeIdsBySourceId).every(([source, id]) => text(source) && text(id)))
}
function validGroupReplacementIntentShape(intent: unknown): intent is ShowV2GroupReplacementIntent {
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
  const text = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0
  if (!object(intent) || intent.kind !== 'replace-group-clip-pattern' || !text(intent.definitionId) || !text(intent.clipId)
    || !exactIntentFields(intent.patternReference, ['kind', 'id'])) return false
  const reference = intent.patternReference as Record<string, unknown>
  if ((reference.kind !== 'stock' && reference.kind !== 'user') || !text(reference.id)) return false
  if (intent.context === 'dormant-definition') {
    if (!exactIntentFields(intent, ['kind', 'definitionId', 'clipId', 'patternReference', 'context', 'slot']) || !object(intent.slot)) return false
    if (intent.slot.kind === 'retain') return exactIntentFields(intent.slot, ['kind'])
    return intent.slot.kind === 'split' && exactIntentFields(intent.slot, ['kind', 'slotId', 'localTrackIdentitiesBySourceTrackId'])
      && text(intent.slot.slotId) && validTrackIdentityPlans(intent.slot.localTrackIdentitiesBySourceTrackId)
  }
  if (intent.context !== 'linked-occurrences'
    || !exactIntentFields(intent, ['kind', 'definitionId', 'clipId', 'patternReference', 'context', 'slot', 'runtimePlansBySourceRuntimeId'])
    || !object(intent.slot)) return false
  const slot = intent.slot.kind === 'retain' ? exactIntentFields(intent.slot, ['kind'])
    : intent.slot.kind === 'split' && exactIntentFields(intent.slot, ['kind', 'slotId']) && text(intent.slot.slotId)
  return slot && object(intent.runtimePlansBySourceRuntimeId) && Object.entries(intent.runtimePlansBySourceRuntimeId).every(([source, plan]) => text(source) && object(plan)
    && (plan.kind === 'retain' ? exactIntentFields(plan, ['kind'])
      : plan.kind === 'independent' && exactIntentFields(plan, ['kind', 'instanceId', 'identitiesBySourceTrackId']) && text(plan.instanceId) && validTrackIdentityPlans(plan.identitiesBySourceTrackId)))
}
/**
 * The Show's Zone collection and its Zone Layout definitions (#1039), through
 * the same closed dispatch every other editor section uses: one accepted edit
 * is one prepared candidate, one history entry and one save; a refusal or no-op
 * writes nothing and keeps the record identity.
 *
 * Both wrappers check the complete public intent shape before the typed owner,
 * so a malformed runtime object never reaches preparation or adoption. Removing
 * the last Zone's content may leave an empty Show, which the dispatch's
 * `deletingToEmpty` rule already admits for Clip and Group deletion.
 */
function validZoneIntent(intent: unknown): intent is ShowZoneEditIntentV2 {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  if (!object(intent)) return false
  if (intent.kind === 'add') {
    if (!exactIntentFields(intent, ['kind', 'zone']) || !object(intent.zone)) return false
    const zone = intent.zone
    if (Object.keys(zone).some(field => !['id', 'name', 'nominalPixelCount', 'color', 'icon'].includes(field))) return false
    return text(zone.id) && text(zone.name)
      && typeof zone.nominalPixelCount === 'number' && Number.isSafeInteger(zone.nominalPixelCount) && zone.nominalPixelCount >= 1
      && (zone.color === undefined || text(zone.color)) && (zone.icon === undefined || text(zone.icon))
  }
  if (intent.kind !== 'remove' || !text(intent.zoneId)) return false
  if (exactIntentFields(intent, ['kind', 'zoneId'])) return true
  if (!exactIntentFields(intent, ['kind', 'zoneId', 'clipRemovals']) || !Array.isArray(intent.clipRemovals)) return false
  return intent.clipRemovals.every(plan => (
    exactIntentFields(plan, ['clipId', 'propertyRampProjections']) && object(plan) && text(plan.clipId)
    // One removed Clip's carrier plans are exactly the Clip-deletion plans.
    && validClipDeleteIntent({ kind: 'delete-clip', clipId: plan.clipId, propertyRampProjections: plan.propertyRampProjections })
  ))
}
function zoneEffects(result?: ShowZoneEditResultV2): ShowZoneEditAffectedV2 {
  return result ? {
    affectedZoneIds: result.affectedZoneIds, affectedLayerIds: result.affectedLayerIds, affectedClipIds: result.affectedClipIds,
    affectedInstanceIds: result.affectedInstanceIds, affectedTransitionIds: result.affectedTransitionIds, affectedTrackIds: result.affectedTrackIds,
    affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedGroupOccurrenceIds: result.affectedGroupOccurrenceIds, removedIds: result.removedIds,
  } : {
    affectedZoneIds: [], affectedLayerIds: [], affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [],
    affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedGroupOccurrenceIds: [], removedIds: [],
  }
}
export type ShowV2PilotZoneEditRequest = ShowV2PilotPreparedEditContext & { intent: ShowZoneEditIntentV2 }
export type ShowV2PilotZoneEditOutcome = PilotOwnerOutcome<ShowZoneEditResultV2, ShowZoneEditAffectedV2>
export async function admitShowV2PilotZoneEdit(request: ShowV2PilotZoneEditRequest): Promise<ShowV2PilotZoneEditOutcome> {
  if (!validZoneIntent(request.intent)) {
    return { status: 'refused', source: 'owner', code: 'invalid-request', message: 'Give one complete explicit Zone edit.', ...zoneEffects() }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'zone' as const })
  return presentOwnerOutcome(outcome, zoneEffects('result' in outcome ? outcome.result : undefined))
}

function validLayoutDefinitionIntent(intent: unknown): intent is ShowZoneLayoutDefinitionIntentV2 {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  if (!object(intent) || !text(intent.layoutId)) return false
  if (intent.kind === 'add') return exactIntentFields(intent, ['kind', 'layoutId', 'name']) && text(intent.name)
  if (intent.kind === 'duplicate') return exactIntentFields(intent, ['kind', 'layoutId', 'name', 'sourceLayoutId']) && text(intent.name) && text(intent.sourceLayoutId)
  if (intent.kind === 'rename') return exactIntentFields(intent, ['kind', 'layoutId', 'name']) && text(intent.name)
  if (intent.kind === 'remove') return exactIntentFields(intent, ['kind', 'layoutId'])
  if (intent.kind === 'set-routing') {
    if (!exactIntentFields(intent, ['kind', 'layoutId', 'logical'])) return false
    if (intent.logical === null) return true
    // The operator's own arity and parameter rules stay with the typed owner.
    return object(intent.logical) && text(intent.logical.kind)
      && Array.isArray(intent.logical.zoneIds) && intent.logical.zoneIds.every(text)
  }
  if (intent.kind !== 'set-physical-ranges'
    || !exactIntentFields(intent, ['kind', 'layoutId', 'zoneId', 'ranges'])
    || !text(intent.zoneId)
    || !Array.isArray(intent.ranges)) return false
  return intent.ranges.every(range => (
    exactIntentFields(range, ['start', 'end']) && object(range)
    && typeof range.start === 'number' && Number.isSafeInteger(range.start) && range.start >= 0
    && typeof range.end === 'number' && Number.isSafeInteger(range.end) && range.end >= 0
  ))
}
function layoutDefinitionEffects(result?: ShowZoneLayoutDefinitionResultV2): ShowZoneLayoutDefinitionAffectedV2 {
  return result ? {
    affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedLayoutOccurrenceIds: result.affectedLayoutOccurrenceIds,
    affectedZoneIds: result.affectedZoneIds, removedIds: result.removedIds,
  } : { affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedZoneIds: [], removedIds: [] }
}
export type ShowV2PilotLayoutDefinitionRequest = ShowV2PilotPreparedEditContext & { intent: ShowZoneLayoutDefinitionIntentV2 }
export type ShowV2PilotLayoutDefinitionOutcome = PilotOwnerOutcome<ShowZoneLayoutDefinitionResultV2, ShowZoneLayoutDefinitionAffectedV2>
export async function admitShowV2PilotLayoutDefinitionEdit(request: ShowV2PilotLayoutDefinitionRequest): Promise<ShowV2PilotLayoutDefinitionOutcome> {
  if (!validLayoutDefinitionIntent(request.intent)) {
    return { status: 'refused', source: 'owner', code: 'invalid-request', message: 'Give one complete explicit Zone Layout edit.', ...layoutDefinitionEffects() }
  }
  const outcome = await admitPreparedEdit({ ...request, owner: 'layout-definition' as const })
  return presentOwnerOutcome(outcome, layoutDefinitionEffects('result' in outcome ? outcome.result : undefined))
}

export async function admitShowV2PilotGroupReplacementEdit(request: ShowV2PilotGroupReplacementRequest): Promise<ShowV2PilotGroupReplacementOutcome> {
  const groupEffects = () => ({ ...timelineEffects(), hoistedInstanceIds: [] as string[] })
  if (!validGroupReplacementIntentShape(request.intent)) {
    return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Choose one definition-local Group Clip with complete explicit replacement identities.', ...groupEffects() }
  }
  const resolved = resolveCapturedShowPatternReplacementV2(request.capture, request.intent.patternReference)
  if (resolved.status === 'refused') return { status: 'refused', source: 'admission', code: 'unsupported-pilot-record', message: resolved.message, ...groupEffects() }
  const { kind: _kind, patternReference: _reference, ...owned } = request.intent
  const intent = { ...owned, replacement: resolved.replacement } as ReplaceShowGroupDefinitionClipPatternIntentV2
  const outcome = await admitPreparedEdit({ ...request, intent, owner: 'group-replace' as const })
  const result = 'result' in outcome ? outcome.result : undefined
  return presentOwnerOutcome(outcome, { ...timelineEffects(result), hoistedInstanceIds: result?.hoistedInstanceIds ?? [] })
}
