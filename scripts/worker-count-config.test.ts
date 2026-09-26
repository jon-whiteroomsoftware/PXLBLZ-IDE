import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function loadedPublicWorkers(raw: string | undefined) {
  vi.stubEnv('PLAYWRIGHT_STUDIO_URL', 'http://localhost:5174/PXLBLZ-IDE/')
  vi.stubEnv('WRSP_HOST_PLAYWRIGHT_PUBLIC_WORKERS', raw)
  vi.resetModules()
  const config = await import('../playwright.config')
  return config.default.workers
}

describe('loaded public Playwright config worker count', () => {
  it('keeps the four-worker default', async () => {
    expect(await loadedPublicWorkers(undefined)).toBe(4)
  })

  it('uses a six-worker host setting', async () => {
    expect(await loadedPublicWorkers('6')).toBe(6)
  })

  it('rejects a zero-worker host setting at config load', async () => {
    await expect(loadedPublicWorkers('0')).rejects.toThrow(/WRSP_HOST_PLAYWRIGHT_PUBLIC_WORKERS/)
  })
})
