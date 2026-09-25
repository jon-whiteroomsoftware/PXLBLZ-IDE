// @vitest-environment jsdom
import { createDefaultShow } from '@/engine/showModel'
import { setPersonalContentProvider, resetPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { STOCK_SHOWS_V2 } from '@/pixelblaze/stock/showsV2'
import { showInitialState, useShowStore } from './showStore'

// The whole-Show v1 admission (`admitShowEdit`) was deleted in #1042 S2a; its
// session and identity refusal matrix now runs against v2 delivery in
// showV2CandidateAdmission.test.ts. What remains here is the selection seam.
function providerFor(show: ShowRecord) {
  const provider = {
    listShows: async () => [show],
    deleteShow: async () => {},
    setLastActive: async () => {},
  } as unknown as PersonalContentProvider
  setPersonalContentProvider(provider)
}
const intent = (operationId = 'op') => ({ operationId, payloadKey: 'rename', referenceContext: 'original', targets: ['target'] })
const state = () => useShowStore.getState()
const routedPilot = (id: string): ShowRecordV2 => ({ ...structuredClone(STOCK_SHOWS_V2[0]), id })

beforeEach(() => { useShowStore.setState(showInitialState); resetPersonalContentProvider() })
afterEach(() => { resetPersonalContentProvider() })

describe('clearActiveShowSelection (#1039)', () => {
  it('drops another row\'s v1 selection while the routed Show\'s session stays live', () => {
    const v1Row = createDefaultShow('v1-row', 'Still v1')
    const routed = routedPilot('routed-v2')
    providerFor(v1Row)
    useShowStore.setState({ shows: [v1Row], showV2Pilots: { [routed.id]: routed }, showsLoaded: true, activeShowId: v1Row.id })
    const session = state().beginShowEditSession(routed.id)

    state().clearActiveShowSelection()

    expect(state().activeShowId).toBeNull()
    expect(state().beginShowEdit(session, intent()).status).toBe('pending')
  })

  it('retires the deselected row\'s own session', () => {
    const v1Row = createDefaultShow('v1-row', 'Still v1')
    providerFor(v1Row)
    useShowStore.setState({ shows: [v1Row], showsLoaded: true, activeShowId: v1Row.id })
    const session = state().beginShowEditSession(v1Row.id)

    state().clearActiveShowSelection()

    expect(state().activeShowId).toBeNull()
    expect(state().beginShowEdit(session, intent()).status).toBe('retired')
  })

  it('is a no-op without a selection', () => {
    const routed = routedPilot('routed-v2')
    useShowStore.setState({ showV2Pilots: { [routed.id]: routed }, showsLoaded: true, activeShowId: null })
    const session = state().beginShowEditSession(routed.id)
    state().clearActiveShowSelection()
    expect(state().beginShowEdit(session, intent()).status).toBe('pending')
  })
})
