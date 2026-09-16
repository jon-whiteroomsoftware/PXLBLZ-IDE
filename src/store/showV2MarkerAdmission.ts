import { editShowMarkerV2, type ShowMarkerEditIntentV2 } from '@/engine/showMarkersV2'
import { compileShowV2PilotArtifact, lowerShowV2PilotPreview, type ShowV2PilotAssets } from '@/engine/showV2Pilot'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { isValidatedEmptyShowV2 } from '@/engine/showMarkerRouteModel'
import { useShowStore } from './showStore'

export interface ShowV2PilotMarkerEditRequest {
  showId: string
  baseRevision: number
  intent: ShowMarkerEditIntentV2
  assets: ShowV2PilotAssets
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
      return isCurrent() && Number.isSafeInteger(baseRevision) && baseRevision >= 0
        && (useShowStore.getState().showRevisions[showId] ?? 0) === baseRevision
        && useShowStore.getState().showV2Pilots[showId] === current
        && getPersonalContentProvider() === provider
    } catch { return false }
  }
  if (!eligible()) return refuse('stale-edit', 'The Show or its dependencies changed. Try the edit again.')
  if (!provider.replaceShowV2) return refuse('unsupported-provider', 'The active provider does not support v2 Shows.')
  const intent = structuredClone(request.intent)
  const assets = structuredClone(request.assets)
  const result = editShowMarkerV2(current, intent)
  if (result.status === 'refused') return refuse('invalid-marker', result.message)
  if (result.status === 'unchanged') return { status: 'unchanged', affectedMarkerIds: [] }
  try {
    // This first visible slice requires the existing compatibility preview path.
    // Preparation success alone must not admit an advanced record this pilot cannot preview.
    if (!(isValidatedEmptyShowV2(current) && isValidatedEmptyShowV2(result.record))) {
      lowerShowV2PilotPreview(current, assets.patterns)
      compileShowV2PilotArtifact(current, assets)
      lowerShowV2PilotPreview(result.record, assets.patterns)
      compileShowV2PilotArtifact(result.record, assets)
    }
  } catch (error) {
    return refuse('unsupported-pilot-record', error instanceof Error ? error.message : 'The v2 pilot cannot prepare this Show.')
  }
  if (!eligible()) return refuse('stale-edit', 'The Show or its dependencies changed. Try the edit again.')
  // Invocation adopts synchronously before its first persistence await. No await
  // separates final eligibility and the existing one-history/one-save operation.
  const saving = useShowStore.getState().updateShowV2Pilot(showId, result.record)
  const adopted = useShowStore.getState().showV2Pilots[showId]
  await saving
  const settlement = getPersonalContentProvider() === provider && useShowStore.getState().showV2Pilots[showId] === adopted ? 'saved' : 'superseded'
  return { status: 'applied', settlement, affectedMarkerIds: result.affectedMarkerIds }
}
