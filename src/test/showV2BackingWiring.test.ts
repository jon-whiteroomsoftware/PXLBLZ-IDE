import { describe, expect, it } from 'vitest'
import type { Page } from '@playwright/test'
import {
  ensureCurrentShowV2Binding,
  installShowBacking,
} from '../../e2e/support/showBacking'

interface FakeFrame {
  label: string
}

function fakeBackingPage() {
  const mainFrame: FakeFrame = { label: 'main' }
  let currentUrl = 'studio/shows/wiring-show'
  const handlers = new Map<string, (...args: never[]) => void>()
  const fake = {
    url: () => currentUrl,
    mainFrame: () => mainFrame,
    isClosed: () => false,
    waitForTimeout: async () => {},
    on: (event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler)
    },
    goto: async () => undefined,
    reload: async () => undefined,
  }
  const fireRegistration = (showId: string, showVersion: number): void => {
    handlers.get('request')?.({
      method: () => 'POST',
      url: () => 'https://localhost/api/agent/channel',
      postData: () => JSON.stringify({ type: 'register', showId, showVersion }),
    } as never)
  }
  const fireFramenavigated = (frame: FakeFrame): void => {
    handlers.get('framenavigated')?.(frame as never)
  }
  return {
    page: fake as unknown as Page,
    mainFrame,
    navigate: (url: string) => { currentUrl = url },
    fireRegistration,
    fireFramenavigated,
  }
}

describe('in-app navigation proof retirement', () => {
  it('does not reuse a stale proof when the same Show is re-opened in-app', async () => {
    const harness = fakeBackingPage()
    installShowBacking(harness.page)
    harness.fireRegistration('wiring-show', 2)
    await ensureCurrentShowV2Binding(harness.page)

    harness.navigate('studio/shows')
    harness.fireFramenavigated(harness.mainFrame)
    harness.navigate('studio/shows/wiring-show')
    harness.fireFramenavigated(harness.mainFrame)

    await expect(ensureCurrentShowV2Binding(harness.page, 250)).rejects.toThrow(/never bound/)
  })

  it('re-establishes the proof when the re-opened Show registers again', async () => {
    const harness = fakeBackingPage()
    installShowBacking(harness.page)
    harness.fireRegistration('wiring-show', 2)
    await ensureCurrentShowV2Binding(harness.page)

    harness.navigate('studio/shows')
    harness.fireFramenavigated(harness.mainFrame)
    harness.navigate('studio/shows/wiring-show')
    harness.fireFramenavigated(harness.mainFrame)
    harness.fireRegistration('wiring-show', 2)

    await ensureCurrentShowV2Binding(harness.page, 250)
  })

  it('ignores subframe navigations instead of retiring the proof', async () => {
    const harness = fakeBackingPage()
    installShowBacking(harness.page)
    harness.fireRegistration('wiring-show', 2)
    await ensureCurrentShowV2Binding(harness.page)

    harness.fireFramenavigated({ label: 'subframe' })

    await ensureCurrentShowV2Binding(harness.page, 250)
  })
})
