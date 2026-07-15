import { describe, expect, it } from 'vitest'
import {
  mergePersistedShowEditorSession,
  showEditorSessionInitialState,
} from './showEditorSessionStore'

describe('showEditorSessionStore (#470)', () => {
  it('restores only the durable Snap preference over fresh session state', () => {
    const current = {
      ...showEditorSessionInitialState,
      setSnapEnabled: () => {},
    }
    expect(mergePersistedShowEditorSession({ snapEnabled: false, histories: { stale: true } }, current)).toMatchObject({
      snapEnabled: false,
    })
    expect(mergePersistedShowEditorSession({}, current)).toMatchObject({ snapEnabled: true })
  })
})
