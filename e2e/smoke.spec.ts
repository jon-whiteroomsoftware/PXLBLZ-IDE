import { test, expect } from '@playwright/test'

/**
 * Pre-push smoke test — NOT exhaustive.
 *
 * Since #308 the app routes by path, and since #311 signed-out Studio access
 * lands on the Studio welcome/sign-in interstitial instead of silently bouncing
 * to Gallery. Until an authenticated e2e story exists, this smoke covers the
 * routing seam itself — public entry, Studio gate, docs deep links, legacy hash
 * links, and graceful dead ends.
 */

test('signed-out visitors can load the public app shell at root', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/PXLBLZ-IDE\/$/)
  await expect(page.getByTestId('top-bar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('gallery Back navigation restores the originating Pattern card', async ({ page }) => {
  await page.goto('/')
  const cards = page.locator('[id^="gallery-"]')
  const origin = cards.last()
  const anchorId = await origin.getAttribute('id')
  await origin.scrollIntoViewIfNeeded()
  await origin.click()

  await page.goBack()

  await expect(page).toHaveURL(new RegExp(`#${anchorId}$`))
  await expect(page.locator(`#${anchorId}`)).toBeInViewport()
})

test('Pattern detail uses the shared recommended presentation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /LatticeWarp3D/ }).click()

  await expect(page.getByRole('button', { name: 'Map', exact: true })).toContainText('Cube volume')
  await expect(page.getByRole('button', { name: 'Edit pixel count' })).toHaveText('1728')
  await expect(page.getByText('12×12×12')).toBeVisible()
})

test('signed-out /studio shows the Studio welcome gate', async ({ page }) => {
  await page.goto('studio')
  await expect(page).toHaveURL(/\/studio-welcome$/)
  await expect(page.getByTestId('studio-welcome-page')).toContainText('Sign in to Studio')
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
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
