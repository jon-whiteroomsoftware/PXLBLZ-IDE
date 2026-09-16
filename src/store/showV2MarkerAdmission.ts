import { editShowMarkerV2, type ShowMarkerEditIntentV2 } from '@/engine/showMarkersV2'
import { prepareShowStageV2, type ShowPreparedStageDependenciesV2, type ShowPreparedStageResultV2 } from '@/engine/showPreparedStageV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { getPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { isValidatedEmptyShowV2 } from '@/engine/showMarkerRouteModel'
import { useShowStore } from './showStore'

export interface ShowV2PilotMarkerCapture {
  readonly record: ShowRecordV2
  readonly dependencies: ShowPreparedStageDependenciesV2
  readonly prepared: ShowPreparedStageResultV2
}
export interface ShowV2PilotMarkerAdoptionReceipt {
  readonly showId: string
  readonly record: ShowRecordV2
  readonly revision: number
  readonly provider: PersonalContentProvider
}
export interface ShowV2PilotMarkerEditRequest {
  showId: string
  baseRevision: number
  intent: ShowMarkerEditIntentV2
  capture: ShowV2PilotMarkerCapture
  /** Trusted local notification records identity only; it never controls persistence. */
  onAdopted: (receipt: ShowV2PilotMarkerAdoptionReceipt) => void
  /** Trusted adapter checks its route lifetime and captured dependency identity. */
  isCurrent: () => boolean
}
export type ShowV2PilotMarkerEditOutcome =
  | { status: 'applied'; settlement: 'saved' | 'superseded'; affectedMarkerIds: string[] }
  | { status: 'unchanged'; affectedMarkerIds: [] }
  | { status: 'refused'; code: 'stale-edit' | 'missing-show' | 'unsupported-provider' | 'invalid-marker' | 'unsupported-pilot-record'; message: string; affectedMarkerIds: [] }

/** Marker-only checked v2 admission; the existing Show store owns all history/save settlement. */
export async function admitShowV2PilotMarkerEdit(request: ShowV2PilotMarkerEditRequest): Promise<ShowV2PilotMarkerEditOutcome> {
  const { showId, baseRevision, isCurrent } = request
  const refuse = (code: Extract<ShowV2PilotMarkerEditOutcome, { status: 'refused' }>['code'], message: string): ShowV2PilotMarkerEditOutcome => ({ status: 'refused', code, message, affectedMarkerIds: [] })
  const current = useShowStore.getState().showV2Pilots[showId]
  if (!current) return refuse('missing-show', 'The v2 Show is no longer open.')
  const provider = getPersonalContentProvider()
  const eligible = (): boolean => {
    try {
      return request.capture.record === current && isCurrent() && Number.isSafeInteger(baseRevision) && baseRevision >= 0
        && (useShowStore.getState().showRevisions[showId] ?? 0) === baseRevision
        && useShowStore.getState().showV2Pilots[showId] === current
        && getPersonalContentProvider() === provider
    } catch { return false }
  }
  if (!eligible()) return refuse('stale-edit', 'The Show or its dependencies changed. Try the edit again.')
  if (!provider.replaceShowV2) return refuse('unsupported-provider', 'The active provider does not support v2 Shows.')
  const intent = structuredClone(request.intent)
  const result = editShowMarkerV2(current, intent)
  if (result.status === 'refused') return refuse('invalid-marker', result.message)
  if (result.status === 'unchanged') return { status: 'unchanged', affectedMarkerIds: [] }
  const { capture } = request
  const prepared = capture.prepared
  if (prepared.status === 'refused') return refuse('unsupported-pilot-record', prepared.message)
  if (prepared.status === 'ready' && (prepared.bundle.identity.record !== current || prepared.bundle.identity.dependencies !== capture.dependencies)) {
    return refuse('stale-edit', 'The Show or its prepared context changed. Try the edit again.')
  }
  if (prepared.status === 'empty' && (!isValidatedEmptyShowV2(current) || !isValidatedEmptyShowV2(prepared.record))) {
    return refuse('unsupported-pilot-record', 'The prepared empty Show does not match this Marker edit.')
  }
  const inputs = prepared.status === 'ready' ? { ...prepared.bundle.assets, stageMap: capture.dependencies.stageMap } : capture.dependencies
  const candidate = prepareShowStageV2(result.record, inputs)
  if (candidate.status !== prepared.status) {
    return refuse('unsupported-pilot-record', candidate.status === 'refused' ? candidate.message : 'The Marker edit changed the prepared Show capability.')
  }
  if (!eligible()) return refuse('stale-edit', 'The Show or its dependencies changed. Try the edit again.')
  // Invocation adopts synchronously before its first persistence await. No await
  // separates final eligibility and the existing one-history/one-save operation.
  const saving = useShowStore.getState().updateShowV2Pilot(showId, result.record)
  const adopted = useShowStore.getState().showV2Pilots[showId]
  const revision = useShowStore.getState().showRevisions[showId] ?? 0
  try { request.onAdopted({ showId, record: adopted, revision, provider }) } catch {
    // A trusted identity notification cannot interrupt the already-started save.
  }
  await saving
  const settlement = getPersonalContentProvider() === provider && useShowStore.getState().showV2Pilots[showId] === adopted ? 'saved' : 'superseded'
  return { status: 'applied', settlement, affectedMarkerIds: result.affectedMarkerIds }
}
