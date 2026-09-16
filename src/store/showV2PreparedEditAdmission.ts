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
import { editShowLayerV2, type ShowLayerEditIntentV2, type ShowLayerEditResultV2, type ShowLayerEditAffectedV2 } from '@/engine/showLayersV2'
import { editShowClipAppearanceV2, type ShowClipAppearanceEditIntentV2, type ShowClipAppearanceEditResultV2 } from '@/engine/showClipAppearanceEditsV2'
import { editShowPropertyV2, type ShowPropertyTrackOwnerV2, type ShowPropertyEditIntentV2, type ShowPropertyEditResultV2 } from '@/engine/showPropertyEditsV2'
import { createShowGroupFromSelectionV2, type CreateShowGroupFromSelectionIntentV2, type ShowGroupCreateResultV2 } from '@/engine/showGroupCreationV2'
import type { ShowGroupEditAffectedV2 } from '@/engine/showGroupEditsV2'
import { moveShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, ungroupShowGroupOccurrenceV2, deleteShowGroupOccurrenceV2, type MoveShowGroupOccurrenceIntentV2, type DuplicateShowGroupOccurrenceIntentV2, type MakeShowGroupUniqueIntentV2, type UngroupShowGroupOccurrenceIntentV2, type DeleteShowGroupOccurrenceIntentV2, type ShowGroupEditResultV2 } from '@/engine/showGroupEditsV2'
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
export type ShowV2PilotTransitionResizeIntent = Extract<ShowTransitionEditIntentV2, { kind: 'resize-transition' }>
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
  | { owner: 'create-group'; intent: CreateShowGroupFromSelectionIntentV2 }
  | { owner: 'marker'; intent: ShowMarkerEditIntentV2 }
  | { owner: 'transition-resize'; intent: ShowV2PilotTransitionResizeIntent }
  | { owner: 'create-clip'; intent: CreateShowClipIntentV2 }
  | { owner: 'clip-temporal'; intent: ShowClipTemporalIntentV2 }
  | { owner: 'clip-sharing'; intent: ShowV2PilotClipSharingIntent }
  | { owner: 'insert-time'; intent: ShowInsertTimeIntentV2 }
  | { owner: 'layer'; intent: ShowLayerEditIntentV2 }
  | { owner: 'appearance'; intent: ShowClipAppearanceEditIntentV2 }
  | { owner: 'property'; propertyOwner: ShowPropertyTrackOwnerV2; intent: ShowPropertyEditIntentV2 }
  | { owner: 'set-show-end'; intent: Extract<ShowLayoutEditIntentV2, { kind: 'set-show-end' }> }
export type ShowV2PilotClipDeleteIntent = Extract<ShowTransitionEditIntentV2, { kind: 'delete-clip' }>
export type ShowV2PilotClipDeleteRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotClipDeleteIntent }
export type ShowV2PilotClipDeleteOutcome = PilotOwnerOutcome<ShowTransitionEditResultV2, ShowTimelineEditAffectedV2>
type OwnerResult<C extends Command> = C extends { owner: 'layout-occurrence' } ? ShowLayoutEditResultV2
  : C extends { owner: 'group-occurrence' } ? ShowGroupEditResultV2
  : C extends { owner: 'create-group' } ? ShowGroupCreateResultV2
  : C extends { owner: 'marker' } ? ShowMarkerEditResultV2
  : C extends { owner: 'create-clip' } ? ShowClipCreationResultV2
  : C extends { owner: 'clip-temporal' } ? ShowClipTemporalResultV2
  : C extends { owner: 'clip-sharing' } ? ShowClipEditResultV2
  : C extends { owner: 'insert-time' } ? ShowTimelineEditResultV2
  : C extends { owner: 'layer' } ? ShowLayerEditResultV2
  : C extends { owner: 'appearance' } ? ShowClipAppearanceEditResultV2
  : C extends { owner: 'property' } ? ShowPropertyEditResultV2
  : C extends { owner: 'set-show-end' } ? ShowLayoutEditResultV2
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
    ? editShowLayoutIntervalsV2(current, structuredClone(command.intent))
    : command.owner === 'group-occurrence'
        ? groupOccurrenceOwnerResult(current, structuredClone(command.intent))
        : command.owner === 'create-group'
          ? createShowGroupFromSelectionV2(current, structuredClone(command.intent))
        : command.owner === 'marker'
          ? editShowMarkerV2(current, structuredClone(command.intent))
          : command.owner === 'create-clip'
            ? createShowClipV2(current, structuredClone(command.intent))
            : command.owner === 'clip-sharing'
            ? editShowClipV2(current, structuredClone(command.intent))
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
  const candidate = capturedInputs?.status === 'qualified'
    ? prepareShowStageFromCapturedInputsV2(result.record, capturedInputs.inputs)
    : prepareShowStageV2(result.record, prepared.status === 'ready' ? { ...prepared.bundle.assets, stageMap: capture.dependencies.stageMap } : capture.dependencies)
  const deletingToEmpty = ((command.owner === 'group-occurrence' && command.intent.kind === 'delete-occurrence') || command.owner === 'delete-clip') && isValidatedEmptyShowV2(result.record)
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
export async function admitShowV2PilotTransitionResize(request: ShowV2PilotTransitionResizeRequest): Promise<ShowV2PilotTransitionResizeOutcome> {
  // Guard the public command partition before the broad pure Transition owner.
  if (!request.intent || request.intent.kind !== 'resize-transition' || Object.keys(request.intent).some(key => !['kind', 'transitionId', 'durationMs'].includes(key))) {
    return { status: 'refused', source: 'transition', code: 'invalid-intent', message: 'Give one explicit Transition resize.', ...resizeEmpty() }
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
type EndEffects = Pick<ShowLayoutEditResultV2, 'affectedClipIds' | 'affectedGroupOccurrenceIds' | 'affectedLayoutDefinitionIds' | 'affectedLayoutOccurrenceIds' | 'affectedTrackIds' | 'removedLayoutOccurrenceIds'>
function endEffects(result?: ShowLayoutEditResultV2): EndEffects {
  return result ? { affectedClipIds: result.affectedClipIds, affectedGroupOccurrenceIds: result.affectedGroupOccurrenceIds, affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedLayoutOccurrenceIds: result.affectedLayoutOccurrenceIds, affectedTrackIds: result.affectedTrackIds, removedLayoutOccurrenceIds: result.removedLayoutOccurrenceIds }
    : { affectedClipIds: [], affectedGroupOccurrenceIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedTrackIds: [], removedLayoutOccurrenceIds: [] }
}
export type ShowV2PilotSetShowEndRequest = ShowV2PilotPreparedEditContext & { intent: Extract<ShowLayoutEditIntentV2, { kind: 'set-show-end' }> }
export type ShowV2PilotSetShowEndOutcome = PilotOwnerOutcome<ShowLayoutEditResultV2, EndEffects>
export async function admitShowV2PilotSetShowEnd(request: ShowV2PilotSetShowEndRequest): Promise<ShowV2PilotSetShowEndOutcome> {
  if (!exactIntentFields(request.intent, ['kind', 'showEndMs']) || request.intent.kind !== 'set-show-end') return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one explicit Show End operation.', ...endEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'set-show-end' as const })
  return presentOwnerOutcome(outcome, endEffects('result' in outcome ? outcome.result : undefined))
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
function sharingEffects(before: ShowRecordV2, intent: ShowV2PilotClipSharingIntent, result?: ShowClipEditResultV2): ShowTimelineEditAffectedV2 {
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
export type ShowV2PilotGroupOccurrenceEditIntent = MoveShowGroupOccurrenceIntentV2 | DuplicateShowGroupOccurrenceIntentV2 | MakeShowGroupUniqueIntentV2 | UngroupShowGroupOccurrenceIntentV2 | DeleteShowGroupOccurrenceIntentV2
export type ShowV2PilotGroupOccurrenceEditRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotGroupOccurrenceEditIntent }
export type ShowV2PilotGroupOccurrenceEditOutcome = PilotOwnerOutcome<ShowGroupEditResultV2, ShowGroupEditAffectedV2>
function groupOccurrenceOwnerResult(record: ShowRecordV2, intent: ShowV2PilotGroupOccurrenceEditIntent): ShowGroupEditResultV2 {
  switch (intent.kind) {
    case 'move-occurrence': return moveShowGroupOccurrenceV2(record, intent)
    case 'duplicate-occurrence': return duplicateShowGroupOccurrenceV2(record, intent)
    case 'make-unique': return makeShowGroupUniqueV2(record, intent)
    case 'ungroup-occurrence': return ungroupShowGroupOccurrenceV2(record, intent)
    case 'delete-occurrence': return deleteShowGroupOccurrenceV2(record, intent)
  }
}
function validGroupOccurrenceIntent(intent: unknown): intent is ShowV2PilotGroupOccurrenceEditIntent {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const value = intent as Record<string, unknown>
  const text = (item: unknown): item is string => typeof item === 'string' && item.length > 0
  const mapping = (item: unknown): boolean => !!item && typeof item === 'object' && !Array.isArray(item) && Object.values(item).every(text)
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
export async function admitShowV2PilotClipDelete(request: ShowV2PilotClipDeleteRequest): Promise<ShowV2PilotClipDeleteOutcome> {
  if (!exactIntentFields(request.intent, ['kind', 'clipId']) || request.intent.kind !== 'delete-clip' || typeof request.intent.clipId !== 'string' || !request.intent.clipId.trim()) {
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
export type ShowV2PilotLayoutOccurrenceIntent = Extract<ShowLayoutEditIntentV2, { kind: 'select-layout' | 'move' | 'remove' | 'make-unique' }>
type LayoutOccurrenceEffects = Pick<ShowLayoutEditResultV2, 'affectedClipIds' | 'affectedGroupOccurrenceIds' | 'affectedLayoutDefinitionIds' | 'affectedLayoutOccurrenceIds' | 'affectedTrackIds' | 'removedLayoutOccurrenceIds'>
export type ShowV2PilotLayoutOccurrenceRequest = ShowV2PilotPreparedEditContext & { intent: ShowV2PilotLayoutOccurrenceIntent }
export type ShowV2PilotLayoutOccurrenceOutcome = PilotOwnerOutcome<ShowLayoutEditResultV2, LayoutOccurrenceEffects>
function layoutOccurrenceEffects(result?: ShowLayoutEditResultV2): LayoutOccurrenceEffects {
  return result ? { affectedClipIds: result.affectedClipIds, affectedGroupOccurrenceIds: result.affectedGroupOccurrenceIds, affectedLayoutDefinitionIds: result.affectedLayoutDefinitionIds, affectedLayoutOccurrenceIds: result.affectedLayoutOccurrenceIds, affectedTrackIds: result.affectedTrackIds, removedLayoutOccurrenceIds: result.removedLayoutOccurrenceIds }
    : { affectedClipIds: [], affectedGroupOccurrenceIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedTrackIds: [], removedLayoutOccurrenceIds: [] }
}
function validLayoutOccurrenceIntent(intent: unknown): intent is ShowV2PilotLayoutOccurrenceIntent {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const value = intent as Record<string, unknown>
  const text = (input: unknown): input is string => typeof input === 'string' && input.trim().length > 0
  if (!text(value.occurrenceId)) return false
  if (value.kind === 'move') return exactIntentFields(value, ['kind', 'occurrenceId', 'startMs']) && typeof value.startMs === 'number' && Number.isSafeInteger(value.startMs)
  if (value.kind === 'remove') return exactIntentFields(value, ['kind', 'occurrenceId'])
  if (value.kind === 'select-layout') return exactIntentFields(value, ['kind', 'occurrenceId', 'layoutId']) && text(value.layoutId)
  return value.kind === 'make-unique' && exactIntentFields(value, ['kind', 'occurrenceId', 'layoutId', 'name']) && text(value.layoutId) && text(value.name)
}
export async function admitShowV2PilotLayoutOccurrenceEdit(request: ShowV2PilotLayoutOccurrenceRequest): Promise<ShowV2PilotLayoutOccurrenceOutcome> {
  if (!validLayoutOccurrenceIntent(request.intent)) return { status: 'refused', source: 'owner', code: 'invalid-intent', message: 'Give one complete explicit Layout occurrence edit.', ...layoutOccurrenceEffects() }
  const outcome = await admitPreparedEdit({ ...request, owner: 'layout-occurrence' as const })
  return presentOwnerOutcome(outcome, layoutOccurrenceEffects('result' in outcome ? outcome.result : undefined))
}
