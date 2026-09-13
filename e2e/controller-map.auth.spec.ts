import { test, expect } from './fixtures/authenticated'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'

test('a Controller with no map stays settled across panel polling, reopen, and Trash (#1024)', async ({ page }, testInfo) => {
  const request = page.context().request
  const deviceId = 'pixelblaze_pb32_005544332211'
  const ip = '192.168.8.224'
  for (const [id, name, updatedAt] of [
    ['map-kept', 'Bench Controller', 1],
    ['map-trashed', 'Legacy Controller', 2],
  ] as const) {
    const created = await request.post('/api/controllers', { data: {
      id, name, deviceId, lastKnownDeviceName: name, lastSeenIp: ip,
      board: { kind: 'pixelblaze-v3-standard' }, inputs: [], globalTransforms: [],
      patternBindings: [], zones: [], updatedAt,
    } })
    expect(created.ok()).toBe(true)
  }
  await installFakeControllerHelper(page, {
    programs: [{ id: 'NO_MAP_PATTERN', name: 'Bench Pattern' }],
    activeProgramId: 'NO_MAP_PATTERN', deviceName: 'Bench Controller',
    boardType: 'pb32', mac: '11:22:33:44:55:00', pixelCount: 100,
  })
  // Observe requests at the synthetic helper boundary, not application state.
  await page.addInitScript(() => {
    const counts = { maps: 0, configs: 0 }
    Object.defineProperty(window, '__mapReadCounts', { value: counts })
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.dir !== 'to-helper') return
      if (event.data.type === 'get-map') counts.maps += 1
      if (event.data.type === 'send' && event.data.payload?.text) {
        const command = JSON.parse(event.data.payload.text)
        if (command.getConfig) counts.configs += 1
      }
    })
  })
  const counts = () => page.evaluate(() => (window as typeof window & {
    __mapReadCounts: { maps: number; configs: number }
  }).__mapReadCounts)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/controllers/map-kept')
  await page.getByRole('treeitem', { name: 'Legacy Controller', exact: true }).hover()
  await page.getByRole('button', { name: 'More actions for Legacy Controller' }).click()
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click()
  await expect(page.getByRole('treeitem', { name: 'Legacy Controller', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
  await page.getByTestId('controller-go').click()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByText('No installed map', { exact: true })).toBeVisible()
  await expect.poll(async () => (await counts()).maps).toBe(1)

  const toggle = page.getByRole('button', { name: 'Toggle Bench Controller panel', exact: true })
  await toggle.click()
  const panel = page.getByTestId('controller-panel-popover')
  await expect(panel.getByText('No installed map', { exact: true })).toBeVisible()
  const configs = (await counts()).configs
  await expect.poll(async () => (await counts()).configs, { timeout: 10000 }).toBeGreaterThanOrEqual(configs + 3)
  expect((await counts()).maps).toBe(1)
  await expect(page.getByRole('link', { name: 'Open Bench Controller profile' })).toHaveAttribute('href', /\/controllers\/map-kept$/)
  await toggle.click()
  await toggle.click()
  await expect(panel.getByText('No installed map', { exact: true })).toBeVisible()
  expect((await counts()).maps).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('no-map-desktop.png') })

  await toggle.click()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(async () => (await counts()).maps).toBe(2)
  await expect(page.getByRole('main').getByText('No installed map', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await toggle.click()
  await expect(panel.getByText('No installed map', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Bench Controller profile' })).toHaveAttribute('href', /\/controllers\/map-kept$/)
  expect((await counts()).maps).toBe(1)
  await toggle.click()
  await page.getByRole('button', { name: 'Unpin Controllers list', exact: true }).click()
  await page.setViewportSize({ width: 900, height: 900 })
  await toggle.click()
  await expect(panel.getByText('No installed map', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('no-map-narrow.png') })
})
