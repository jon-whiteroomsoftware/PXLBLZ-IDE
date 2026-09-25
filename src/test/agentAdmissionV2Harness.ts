// A v2 Show open in the editor, as the agent admission sees it (#1042).
//
// The Show opens through `openShowV2Pilot` against a provider that stores v2
// records, so the store holds its durable baseline exactly as the route does,
// and the binding is the route's own prepared capture, recaptured whenever the
// open record changes. Tests that were written against a v1 Show use this in
// place of `createDefaultShow` + `loadShows`.
import { vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { getPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { useShowStore } from '@/store/showStore'
import type { AgentEditorRecordBinding } from '@/agent/editorAdmission'
import { convertibleV1Show } from './showV2TracerFixture'

/** A small valid v2 record: one Zone, one Layer, one stock Pattern Clip. */
export function agentV2Record(id = 'test', name = 'Original'): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('The v2 agent fixture did not convert.')
  return { ...converted.record, id, name }
}

export type AgentV2Writes = ReturnType<typeof vi.fn<(id: string, record: ShowRecordV2) => Promise<void>>>

/**
 * Store `record` behind a v2 provider whose writes go to `writes`, open it as
 * the editor would, and return the route binding for the admission.
 */
export async function openAgentV2Show(record: ShowRecordV2, writes: AgentV2Writes = vi.fn(async () => {})) {
  let stored = structuredClone(record)
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: 'agent-v2-test',
    replaceShowV2: vi.fn(async (id: string, next: ShowRecordV2) => {
      await writes(id, next)
      stored = structuredClone(next)
    }),
    listShowDocumentsV2: async () => [structuredClone(stored)],
  })
  const opened = await useShowStore.getState().openShowV2Pilot(record.id)
  if (opened.status !== 'ready') throw new Error(`The v2 agent fixture did not open: ${JSON.stringify(opened.issues)}`)
  return { writes, binding: agentV2Binding(record.id), stored: () => stored }
}

/** The route's prepared capture for the open v2 record, recaptured on every change. */
export function agentV2Binding(showId: string): AgentEditorRecordBinding & { stop: () => void } {
  const dependencies = { patterns: [], maps: [], libraries: [], profiles: [], stageMap: null }
  const captureOf = (value: ShowRecordV2) => captureShowStageEditV2(value, dependencies)
  let capture = captureOf(useShowStore.getState().showV2Pilots[showId])
  const stop = useShowStore.subscribe(() => {
    const current = useShowStore.getState().showV2Pilots[showId]
    if (current && current !== capture.record) capture = captureOf(current)
  })
  return {
    recordVersion: 2,
    capture: () => capture,
    isCurrentCapture: () => useShowStore.getState().showV2Pilots[showId] === capture.record,
    stop,
  }
}
