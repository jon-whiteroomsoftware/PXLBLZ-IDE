import type { Page } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preparePatternCapture, type PxlblzCaptureApi } from './render-capture-page'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('preparePatternCapture forwarding', () => {
  it.each(['fast', 'fidelity'] as const)('applies settings before the fresh %s source rebuild', async fidelity => {
    const slowMo = { rate: 1 / 32, stepMs: 32, inBetween: 'eased' as const, stagger: { shape: 'scatter' as const, width: 0 }, persistence: null }
    const calls = await capture({ fidelity, slowMo, source: 'target' })
    expect(calls).toEqual([
      ['setPreview', { isRunning: false }],
      ['setPreview', { diffusion: 0.4 }],
      ['setPreview', { lightSize: 0.7 }],
      ['setPreview', { fidelity }],
      ['setPreview', { slowMo }],
      ['loadSource', ''], ['loadSource', 'target'],
    ])
  })

  it('keeps the omitted settings path and reuses the route source', async () => {
    expect(await capture({})).toEqual([
      ['getPreviewSource'], ['setPreview', { isRunning: false }],
      ['loadSource', ''], ['loadSource', 'route source'],
    ])
  })
})

async function capture(options: Partial<Parameters<typeof preparePatternCapture>[1]>) {
  const calls: unknown[][] = []
  const api: PxlblzCaptureApi = {
    setPreview: patch => { calls.push(['setPreview', patch]) },
    loadSource: code => { calls.push(['loadSource', code]) },
    getPreviewSource: () => { calls.push(['getPreviewSource']); return 'route source' },
    captureSequence: async () => ({ frames: 0, failures: [] }),
  }
  vi.stubGlobal('window', { __pxlblz: api })
  const page = {
    addStyleTag: async () => undefined,
    waitForFunction: async () => undefined,
    evaluate: async <T, A>(callback: (arg: A) => T, arg: A) => callback(arg),
    waitForTimeout: async () => undefined,
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
  }
  const pending = preparePatternCapture(page as unknown as Page, {
    width: 1000, diffusion: options.slowMo ? 0.4 : null, lightSize: options.slowMo ? 0.7 : null, ...options,
  }, 'fixture')
  await vi.runAllTimersAsync()
  await pending
  return calls
}
