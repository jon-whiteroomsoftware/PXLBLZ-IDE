import { expect, type Page } from '@playwright/test'
import type { CaptureAdapter, CaptureScenario } from '@whiteroom/software-process/capture-scenario'
import { installFakeControllers } from './fakeControllerHelper'

export const showsCaptureRoute = '/PXLBLZ-IDE/studio/shows/stock-show-301-installation-mapping'
export const captureControllers = [1, 2, 3].map((index) => ({
  address: `192.168.8.${220 + index}`, programs: [], activeProgramId: 'none',
  deviceName: `Capture ${index}`, boardType: 'standard',
  mac: `AA:BB:CC:DD:EE:2${index}`, pixelCount: 64,
}))

/** Full navigation restores only the last product connection; explicitly reconnect the scenario. */
export async function ensureCaptureControllers(page: Page, count: number): Promise<void> {
  await expect(page.getByRole('button', { name: /^Account menu for playwright-worker-/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show properties', exact: true })).toBeVisible()
  for (const fixture of captureControllers.slice(0, count)) {
    const pill = page.getByRole('button', { name: `Toggle ${fixture.deviceName} panel`, exact: true })
    if (await pill.count() === 0) {
      await page.getByTestId('controller-entry-button').click()
      await page.getByRole('textbox', { name: 'Controller IP address' }).fill(fixture.address)
      await page.getByTestId('controller-go').click()
    }
    await expect(pill).toHaveAttribute('data-phase', 'live')
  }
  await expect(page.getByTestId('controller-pill')).toHaveCount(count)
}

export async function createShowsCaptureAdapter(page: Page, count: number): Promise<CaptureAdapter> {
  await installFakeControllers(page, captureControllers.slice(0, count))
  return {
    async prepare(scenario: CaptureScenario) {
      await page.setViewportSize(scenario.viewport)
      await page.goto(scenario.route)
      await expect(page.getByRole('button', { name: /^Account menu for playwright-worker-/ })).toBeVisible()
      await ensureCaptureControllers(page, count)
      await expect(page.getByRole('button', { name: 'Show properties', exact: true })).toBeVisible()
      await expect.poll(async () => {
        const response = await page.request.get('/api/controllers')
        if (!response.ok()) return 0
        const body = await response.json() as { controllers: Array<{ deviceId: string; lastKnownDeviceName: string }> }
        const visibleNames = await page.getByTestId('controller-pill').locator('[data-controller-pill-label]').allTextContents()
        const matching = body.controllers.filter((record) => visibleNames.includes(record.lastKnownDeviceName))
        return new Set(matching.map((record) => record.deviceId)).size
      }).toBe(count)
    },
    async observe() {
      const session = await (await page.request.get('/api/me')).json() as { authenticated: boolean }
      const response = await page.request.get('/api/controllers')
      const body = response.ok() ? await response.json() as { controllers: Array<{ deviceId: string; lastKnownDeviceName: string }> } : { controllers: [] }
      const visibleNames = await page.getByTestId('controller-pill').locator('[data-controller-pill-label]').allTextContents()
      const live = await page.locator('[data-testid="controller-pill"][data-phase="live"]').count()
      const records = body.controllers.filter((record) => visibleNames.includes(record.lastKnownDeviceName))
      const editor = await page.getByRole('button', { name: 'Show properties', exact: true }).isVisible()
      return {
        route: new URL(page.url()).pathname,
        authenticated: session.authenticated && await page.getByRole('button', { name: /^Account menu for playwright-worker-/ }).isVisible(),
        deviceIds: records.map((record) => record.deviceId),
        viewport: page.viewportSize()!,
        ready: editor && live === count ? ['Shows editor', 'live Controllers'] : [],
      }
    },
    screenshot: () => page.screenshot({ type: 'png', animations: 'disabled' }),
    // The authenticated Playwright fixture owns context and synthetic D1 teardown.
    async cleanup() {},
  }
}
