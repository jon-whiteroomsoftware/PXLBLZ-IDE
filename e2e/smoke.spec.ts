import { test, expect } from '@playwright/test'

/**
 * Pre-push smoke test — NOT exhaustive.
 *
 * Since #308 the app routes by path and signed-out visitors are redirected from
 * the Studio to the Gallery (a placeholder until the real Gallery slice lands).
 * That retires the old signed-out IDE walkthrough this file used to run: the
 * three-pane Studio now requires an authenticated session, which headless e2e
 * doesn't have yet. Until an authenticated e2e story exists, this smoke covers
 * the routing seam itself — redirect, docs deep links, legacy hash links, and
 * graceful dead ends.
 */

test('signed-out visitors land on the gallery placeholder', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/gallery$/)
  await expect(page.getByTestId('route-message')).toContainText('Gallery')
  // The header (and its sign-in affordance) still renders on the placeholder.
  await expect(page.getByTestId('top-bar')).toBeVisible()
})

test('signed-out /studio redirects to /gallery', async ({ page }) => {
  await page.goto('studio')
  await expect(page).toHaveURL(/\/gallery$/)
})

test('docs deep links render the docs reader without signing in', async ({ page }) => {
  await page.goto('docs/feature-guide')
  await expect(page).toHaveURL(/\/docs\/feature-guide$/)
  await expect(page.getByTestId('editor-pane')).toContainText('PXLBLZ Feature Guide')
})

test('legacy #/docs/<id> hash links redirect to the path route', async ({ page }) => {
  await page.goto('/#/docs/optimization-guide')
  await expect(page).toHaveURL(/\/docs\/optimization-guide$/)
  await expect(page.getByTestId('editor-pane')).toContainText('Optimizing Pixelblaze Patterns')
})

test('unknown paths fail gracefully', async ({ page }) => {
  await page.goto('no-such-page')
  await expect(page.getByTestId('route-message')).toContainText('Nothing at this address')
})
