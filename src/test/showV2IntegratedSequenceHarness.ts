import { expect, vi, type Mock } from 'vitest'
import { captureShowStageEditV2, prepareShowStageV2, type ShowPreparedStageDependenciesV2 } from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { parseShowFileBundle } from '../engine/showFileBundle'
import { createFastReplayRuntime } from '../engine/fastReplay'
import { emitFixedPoint } from '../engine/fxEmit'
import { useShowStore } from '../store/showStore'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotPreparedEditContext } from '../store/showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

/**
 * Shared integration harness for the #1038 audit sequences. It only wires the
 * existing provider, store, capture and native artifact seams together; it owns
 * no edit policy and allocates no identities.
 */
export interface IntegratedShowV2Pilot {
  readonly showId: string
  context(): ShowV2PilotPreparedEditContext & { onAdopted: Mock<(receipt: ShowV2PilotAdoptionReceipt) => void> }
  current(): ShowRecordV2
  saved(): ShowRecordV2
  writes(): number
  history(): { past: ShowRecordV2[]; future: ShowRecordV2[] }
  undo(): Promise<boolean>
  redo(): Promise<boolean>
}

let integratedSerial = 0

/** Opens one v2 pilot on a recording provider and returns fresh trusted contexts. */
export function openIntegratedShowV2Pilot(record: ShowRecordV2, dependencies: ShowPreparedStageDependenciesV2): IntegratedShowV2Pilot {
  record.id = `${record.id}-integrated-${++integratedSerial}`
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'integrated-sequence-provider', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  return {
    showId: record.id,
    context() {
      const provider = getPersonalContentProvider()
      const current = useShowStore.getState().showV2Pilots[record.id]
      const capture = captureShowStageEditV2(current, dependencies)
      return {
        showId: record.id,
        baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
        capture,
        isCurrent: () => getPersonalContentProvider() === provider,
        onAdopted: vi.fn(),
      }
    },
    current: () => useShowStore.getState().showV2Pilots[record.id],
    saved: () => saved,
    writes: () => write.mock.calls.length,
    history: () => useShowStore.getState().showV2Histories[record.id],
    undo: () => useShowStore.getState().undoShowV2Pilot(record.id),
    redo: () => useShowStore.getState().redoShowV2Pilot(record.id),
  }
}

export interface IntegratedNativeArtifacts {
  readonly importedShow: ShowRecordV2
  /** Every compiled logical member, including the compiler's empty routed member. */
  readonly members: ReadonlyArray<{ id: string; prefix: string }>
  /** Compiled members belonging to authored runtime identities, by instance ID. */
  prefixFor(instanceId: string): string
  replay(fidelity: 'fast' | 'fidelity'): ReturnType<typeof createFastReplayRuntime>
}

/**
 * Prepares one record through the same public Stage seam the route uses, delivers
 * its native `.pxlshow`/`.epe` bytes, and replays the reopened compiled source.
 */
export async function nativeShowV2Artifacts(
  record: ShowRecordV2,
  dependencies: ShowPreparedStageDependenciesV2,
  mapPoints: ReadonlyArray<{ sample: number[]; pos: [number, number] }> = [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }],
): Promise<IntegratedNativeArtifacts> {
  const prepared = prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status === 'refused' ? prepared.message : prepared.status)
  const delivered = await qualifyShowV2PilotArtifacts(prepared.bundle, { appVersion: 'integrated-audit', exportedAt: '2026-09-16T00:00:00.000Z' })
  const file = await parseShowFileBundle(delivered.pxlshowBytes, { acceptV2: true })
  expect(file.version).toBe(2)
  expect(file.show).toEqual(record)
  const artifact = {
    ...prepared.bundle.artifact,
    dimension: prepared.bundle.presentation.stageDimension,
    code: delivered.epeSource,
    fxCode: emitFixedPoint(delivered.epeSource),
  }
  const members = artifact.summary.clips.map(member => ({ id: member.id, prefix: member.prefix }))
  return {
    importedShow: delivered.importedShow,
    members,
    prefixFor(instanceId) {
      const member = members.find(item => item.id === instanceId)
      if (!member) throw new Error(`No compiled member for runtime ${instanceId}.`)
      return member.prefix
    },
    replay: fidelity => createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: mapPoints.map(point => ({ ...point })) }),
  }
}

/** Reads one exported scalar in authored units from either runtime mode. */
export function exportedScalar(exports: Record<string, unknown>, name: string, fidelity: 'fast' | 'fidelity'): number {
  return Number(exports[name]) / (fidelity === 'fidelity' ? 65536 : 1)
}
