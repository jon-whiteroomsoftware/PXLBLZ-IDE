// Dev-only, read-only observation seam for the agent-editing baseline (#945).
//
// The baseline needs to tell apart, with correlated request ids, the moments
// a candidate record reaches the editor (admission), is adopted by the store,
// settles its personal save, and is published by the stage preview. Nothing
// here changes product behaviour: components record entries under
// `import.meta.env.DEV` only, the log holds no transcript, utterance, or
// Pattern source (a record is reduced to a digest), and the only way out is
// `window.__pxlblzObservations.read()`, which hands back copies.
import type { ShowRecord } from '@/engine/personalContentRecords'

export type AgentApplyPhase =
  /** `applyShow` was called with a record for this editor install. */
  | 'admitted'
  /** The store replaced the visible record (optimistic adoption). */
  | 'adopted'
  /** The store's update promise resolved: persisted, superseded, or a stock draft. */
  | 'settled'
  /** `applyShow` refused: obsolete bridge object or foreign Show id. */
  | 'rejected'
  /** The store's update promise rejected: the write rolled back. */
  | 'failed'

export type AgentObservation =
  | {
      kind: 'agent-apply'
      phase: AgentApplyPhase
      showId: string
      /** Correlation id supplied by the caller, when any. */
      requestId?: string
      /** `Date.now()` so it lines up with the bridge's own clock on this machine. */
      at: number
      /** Digest of the visible record after this phase, where one exists. */
      digest?: string
      updatedAt?: number
      /** Undo depth after this phase, where known. */
      historyDepth?: number
    }
  | {
      kind: 'preview-published'
      showId: string
      at: number
      /** Digest of the record the painted artifact was compiled from. */
      digest: string
      updatedAt: number
    }

export interface ObservationLog {
  record: (entry: AgentObservation) => void
  /** A copy of the newest entries, oldest first. */
  read: () => readonly AgentObservation[]
}

export function createObservationLog(capacity = 200): ObservationLog {
  const entries: AgentObservation[] = []
  return {
    record: (entry) => {
      entries.push(structuredClone(entry))
      if (entries.length > capacity) entries.splice(0, entries.length - capacity)
    },
    read: () => entries.map((entry) => structuredClone(entry)),
  }
}

/**
 * FNV-1a over the choreography a Show compiles from. The client stamp and the
 * display name are excluded so the same edit adopted by the store and
 * compiled by the preview yields one digest even though adoption keeps the
 * candidate's captured `updatedAt`.
 */
export function showRecordDigest(show: ShowRecord): string {
  const text = JSON.stringify({
    scenes: show.scenes,
    zones: show.zones,
    cells: show.cells,
    routingLayouts: show.routingLayouts,
    transitions: show.transitions,
    composition: show.composition ?? null,
    outputEffects: show.outputEffects ?? null,
    outputContract: show.outputContract,
    stageMapId: show.stageMapId ?? null,
  })
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const sharedLog = createObservationLog()

declare global {
  interface Window {
    __pxlblzObservations?: { read: () => readonly AgentObservation[] }
  }
}

/** Record into the shared log and expose the read API once. Inert outside dev builds. */
export function recordAgentObservation(entry: AgentObservation): void {
  if (!import.meta.env.DEV) return
  sharedLog.record(entry)
  if (typeof window !== 'undefined' && !window.__pxlblzObservations) {
    window.__pxlblzObservations = { read: sharedLog.read }
  }
}
