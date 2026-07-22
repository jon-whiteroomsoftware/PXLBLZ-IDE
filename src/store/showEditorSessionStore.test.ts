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
      setShowNoteOpen: () => {},
      setZoneWorkspaceOpen: () => {},
      setZoneCollapsed: () => {},
      setFocusedZone: () => {},
      setReferencePattern: () => {},
      setDiagnostic: () => {},
      setDiagnosticFocus: () => {},
    }
    expect(mergePersistedShowEditorSession({ snapEnabled: false, histories: { stale: true } }, current)).toMatchObject({
      snapEnabled: false,
    })
    expect(mergePersistedShowEditorSession({}, current)).toMatchObject({ snapEnabled: true })
  })

  it('persists progressive Zone disclosure independently for each Show (#581)', () => {
    useShowEditorSessionStore.setState(showEditorSessionInitialState)
    const session = useShowEditorSessionStore.getState()

    session.setZoneWorkspaceOpen('show-a', true)
    session.setZoneCollapsed('show-a', 'zone-left', true)
    session.setZoneCollapsed('show-a', 'zone-right', true)
    session.setZoneCollapsed('show-a', 'zone-left', false)
    session.setFocusedZone('show-a', 'zone-right')
    session.setZoneWorkspaceOpen('show-b', false)

    expect(useShowEditorSessionStore.getState()).toMatchObject({
      zoneWorkspaceOpenByShowId: { 'show-a': true, 'show-b': false },
      collapsedZoneIdsByShowId: { 'show-a': ['zone-right'] },
      focusedZoneIdByShowId: { 'show-a': 'zone-right' },
    })

    const merged = mergePersistedShowEditorSession({
      zoneWorkspaceOpenByShowId: { 'show-a': true, invalid: 'yes' },
      collapsedZoneIdsByShowId: {
        'show-a': ['zone-right', 'zone-right', 42],
        invalid: 'zone-left',
      },
      focusedZoneIdByShowId: { 'show-a': 'zone-right', invalid: 42 },
    }, useShowEditorSessionStore.getState())

    expect(merged).toMatchObject({
      zoneWorkspaceOpenByShowId: { 'show-a': true },
      collapsedZoneIdsByShowId: { 'show-a': ['zone-right'] },
      focusedZoneIdByShowId: { 'show-a': 'zone-right' },
    })
  })

  it('persists Show-note visibility independently for each Show (#363)', () => {
    useShowEditorSessionStore.setState(showEditorSessionInitialState)

    useShowEditorSessionStore.getState().setShowNoteOpen('stock-show-learn-101', false)
    useShowEditorSessionStore.getState().setShowNoteOpen('stock-show-learn-102', true)

    expect(useShowEditorSessionStore.getState().showNoteOpenById).toEqual({
      'stock-show-learn-101': false,
      'stock-show-learn-102': true,
    })

    const merged = mergePersistedShowEditorSession({
      snapEnabled: false,
      showNoteOpenById: {
        'stock-show-learn-101': false,
        'stock-show-learn-102': true,
      },
      diagnostics: { zoneOutlines: true },
    }, useShowEditorSessionStore.getState())

    expect(merged).toMatchObject({
      snapEnabled: false,
      showNoteOpenById: {
        'stock-show-learn-101': false,
        'stock-show-learn-102': true,
      },
      diagnostics: { zoneOutlines: false, clipOutlines: false, otherZoneGuides: false },
    })
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

  it('keeps reference-Show Pattern choices session-only and resets them independently (#506)', () => {
    useShowEditorSessionStore.setState(showEditorSessionInitialState)

    useShowEditorSessionStore.getState().setReferencePattern(
      'stock-show-transition-wipes',
      { kind: 'stock', id: 'CompassRose' },
    )
    expect(useShowEditorSessionStore.getState().referencePatternByShowId).toEqual({
      'stock-show-transition-wipes': { kind: 'stock', id: 'CompassRose' },
    })

    useShowEditorSessionStore.getState().setReferencePattern('stock-show-transition-wipes', null)
    expect(useShowEditorSessionStore.getState().referencePatternByShowId).toEqual({})

    const merged = mergePersistedShowEditorSession({
      referencePatternByShowId: {
        stale: { kind: 'user', id: 'persisted-by-mistake' },
      },
    }, useShowEditorSessionStore.getState())
    expect(merged.referencePatternByShowId).toEqual({})
  })
})
