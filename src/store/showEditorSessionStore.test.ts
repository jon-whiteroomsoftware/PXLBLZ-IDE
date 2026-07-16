import { describe, expect, it } from 'vitest'
import {
  mergePersistedShowEditorSession,
  showEditorSessionInitialState,
  useShowEditorSessionStore,
} from './showEditorSessionStore'

describe('showEditorSessionStore (#470)', () => {
  it('restores only the durable Snap preference over fresh session state', () => {
    const current = {
      ...showEditorSessionInitialState,
      setSnapEnabled: () => {},
      setDiagnostic: () => {},
      setDiagnosticFocus: () => {},
    }
    expect(mergePersistedShowEditorSession({ snapEnabled: false, histories: { stale: true } }, current)).toMatchObject({
      snapEnabled: false,
    })
    expect(mergePersistedShowEditorSession({}, current)).toMatchObject({ snapEnabled: true })
  })

  it('keeps independent Stage diagnostics and editor focus session-only (#491)', () => {
    useShowEditorSessionStore.setState(showEditorSessionInitialState)
    const session = useShowEditorSessionStore.getState()
    session.setDiagnostic('zoneOutlines', true)
    session.setDiagnostic('clipOutlines', true)
    session.setDiagnosticFocus({ showId: 'show-1', sceneId: 'scene-2', zoneId: 'zone-3', placementId: 'clip-4' })

    expect(useShowEditorSessionStore.getState()).toMatchObject({
      diagnostics: { zoneOutlines: true, clipOutlines: true, otherZoneGuides: false },
      diagnosticFocus: { showId: 'show-1', sceneId: 'scene-2', zoneId: 'zone-3', placementId: 'clip-4' },
    })

    const merged = mergePersistedShowEditorSession({
      snapEnabled: false,
      diagnostics: { zoneOutlines: true, clipOutlines: true, otherZoneGuides: true },
      diagnosticFocus: { showId: 'stale' },
    }, useShowEditorSessionStore.getState())
    expect(merged).toMatchObject({
      snapEnabled: false,
      diagnostics: { zoneOutlines: false, clipOutlines: false, otherZoneGuides: false },
      diagnosticFocus: null,
    })
  })
})
