import { resolve } from 'node:path'
import { expect, test } from './fixtures/authenticated'

const updateScreenshots = process.env.UPDATE_DOC_SCREENSHOTS === '1'

test('keeps the Show visual-toolkit guide workflow and screenshots current (#460)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows/stock-show-installation-finale')

  await expect(page.getByText('Built-in Show', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  await expect(page.getByText('Effects, Property animation, and an expensive boundary', { exact: true })).toBeVisible()

  if (updateScreenshots) {
    await page.screenshot({
      path: resolve('docs/screenshots/show-visual-toolkit-overview.png'),
      animations: 'disabled',
    })
  }

  await page.getByRole('button', { name: 'Select NeonCircuitBoard', exact: true }).first().click()
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  await expect(panel.getByRole('region', { name: 'Clip Effects' })).toBeVisible()
  await expect(panel.getByText('Advanced compiled cost')).toBeVisible()

  if (updateScreenshots) {
    await page.screenshot({
      path: resolve('docs/screenshots/show-visual-toolkit-entity-detail.png'),
      animations: 'disabled',
    })
  }
})
