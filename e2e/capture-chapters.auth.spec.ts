// UI proof captures for #1040's chapter projections, run through
// `npm run capture:chapters`. Drives the Gallery band, a Show's reading card
// and the v2 editor route's Marker panel and screenshots each under .wrsp/ui-proof.
// Not a gate: it exists so the review proof is the route actually driven.
import { expect, test } from './fixtures/authenticated'
import { convertibleV1Show } from '../src/test/showV2TracerFixture'

test('captures the Gallery band and the Show reading card chapters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto('gallery')
  const band = page.getByRole('button', { name: /, a Show$/ }).first()
  await expect(band).toBeVisible()
  await expect(page.getByTestId('gallery-show-facts').first()).toBeVisible()
  // Let the nearest bands go live so the chapter caption has painted.
  await band.hover()
  await expect(page.getByTestId('gallery-live-chapter').first()).not.toBeEmpty({ timeout: 15_000 })
  await page.screenshot({ path: '.wrsp/ui-proof/1040-chapters-gallery.png' })

  await page.goto('s/overture-installation')
  await expect(page.getByTestId('show-detail-stage')).toBeVisible()
  await expect(page.getByTestId('show-detail-chapters').locator('li')).toHaveCount(4)
  await expect(page.getByTestId('gallery-live-chapter')).not.toBeEmpty({ timeout: 15_000 })
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: '.wrsp/ui-proof/1040-chapters-reading-card.png' })
})
