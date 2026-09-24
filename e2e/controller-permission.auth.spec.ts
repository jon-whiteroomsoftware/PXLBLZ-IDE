import { test, expect } from './fixtures/authenticated'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'

test('first-time approval connects without a page reload (#63)', async ({ page }, testInfo) => {
  await installFakeControllerHelper(page, {
    programs: [{ id: 'P1', name: 'Bench Pattern' }], activeProgramId: 'P1',
    deviceName: 'Grant Bench', boardType: 'pb32', mac: '11:22:33:44:55:00',
    pixelCount: 100, permissionDelayMs: 4500,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/controllers')
  let navigations = 0
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1
  })
  // The Controllers page also shows an empty-state Connect button when the
  // allocated account has no profiles (#1119); this test covers the header entry.
  await page.getByTestId('controller-entry-button').click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill('192.0.2.10')
  await page.getByTestId('controller-go').click()
  const hint = page.getByText('Authorize this Controller in the PXLBLZ-IDE helper.', { exact: true })
  await expect(hint).toBeVisible()
  // Wait beyond the production 3s socket deadline while the synthetic grant is pending.
  await page.waitForTimeout(3200)
  await expect(hint).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('permission-pending.png') })
  await expect(page.getByRole('button', { name: 'Toggle Grant Bench panel', exact: true })).toBeVisible()
  await expect(hint).toHaveCount(0)
  expect(navigations).toBe(0)
  await page.getByRole('button', { name: 'Toggle Grant Bench panel', exact: true }).click()
  await expect(page.getByTestId('controller-panel-popover')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('permission-connected.png') })
})
