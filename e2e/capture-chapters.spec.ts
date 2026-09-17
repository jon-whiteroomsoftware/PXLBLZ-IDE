// UI proof capture for #1040's public chapter surfaces. Drives the Gallery and
// a Show's reading card and screenshots them under .wrsp/ui-proof. Not a gate:
// it exists so the review proof is the route actually driven.
import { expect, test } from '@playwright/test'

test('captures the Gallery band and the Show reading card chapters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto('gallery')
  const band = page.getByRole('button', { name: /, a Show$/ }).first()
  await expect(band).toBeVisible()
  await expect(page.getByTestId('gallery-show-facts').first()).toBeVisible()
  // Let the nearest bands go live so the chapter caption has painted.
  await band.hover()
  await page.waitForTimeout(3_500)
  await expect(page.getByTestId('gallery-live-chapter').first()).not.toBeEmpty()
  await page.screenshot({ path: '.wrsp/ui-proof/1040-chapters-gallery.png' })

  await page.goto('s/overture-installation')
  await expect(page.getByTestId('show-detail-stage')).toBeVisible()
  await expect(page.getByTestId('show-detail-chapters').locator('li')).toHaveCount(4)
  await page.waitForTimeout(3_500)
  await expect(page.getByTestId('gallery-live-chapter')).not.toBeEmpty()
  await page.screenshot({ path: '.wrsp/ui-proof/1040-chapters-reading-card.png' })
})
