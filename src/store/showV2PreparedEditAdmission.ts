import { editShowMarkerV2, type ShowMarkerEditIntentV2 } from '@/engine/showMarkersV2'
import { prepareShowStageV2, type ShowPreparedStageDependenciesV2, type ShowPreparedStageResultV2 } from '@/engine/showPreparedStageV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { getPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { isValidatedEmptyShowV2 } from '@/engine/showMarkerRouteModel'
import { useShowStore } from './showStore'

import { editShowTransitionV2, type ShowTransitionEditIntentV2, type ShowTransitionEditResultV2, type ShowTransitionEditRefusalV2 } from '@/engine/showTransitionsV2'
import type { ShowMarkerEditResultV2 } from '@/engine/showMarkersV2'
export interface ShowV2PilotPreparedCapture {
  readonly record: ShowRecordV2
  readonly dependencies: ShowPreparedStageDependenciesV2
  readonly prepared: ShowPreparedStageResultV2
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
type Command = { owner: 'marker'; intent: ShowMarkerEditIntentV2 } | { owner: 'transition-resize'; intent: ShowV2PilotTransitionResizeIntent }
type OwnerResult<C extends Command> = C['owner'] extends 'marker' ? ShowMarkerEditResultV2 : ShowTransitionEditResultV2
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
  const result = (command.owner === 'marker'
    ? editShowMarkerV2(current, structuredClone(command.intent))
    : editShowTransitionV2(current, structuredClone(command.intent))) as OwnerResult<C>
  if (result.status === 'refused') return { status: 'refused', source: 'owner', result }
  if (result.status === 'unchanged') return { status: 'unchanged', result }
  const { capture } = request
  const prepared = capture.prepared
  if (prepared.status === 'refused') return refuse('unsupported-pilot-record', prepared.message)
  if (prepared.status === 'ready' && (prepared.bundle.identity.record !== current || prepared.bundle.identity.dependencies !== capture.dependencies)) {
    return refuse('stale-edit', 'The Show or its prepared context changed. Try the edit again.')
  }
  if (prepared.status === 'empty' && (!isValidatedEmptyShowV2(current) || !isValidatedEmptyShowV2(prepared.record))) {
    return refuse('unsupported-pilot-record', 'The prepared empty Show does not match this edit.')
  }
  const inputs = prepared.status === 'ready' ? { ...prepared.bundle.assets, stageMap: capture.dependencies.stageMap } : capture.dependencies
  const candidate = prepareShowStageV2(result.record, inputs)
  if (candidate.status !== prepared.status) return refuse('unsupported-pilot-record', candidate.status === 'refused' ? candidate.message : 'The edit changed the prepared Show capability.')
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
