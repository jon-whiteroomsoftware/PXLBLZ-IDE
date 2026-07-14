import { test, expect } from '@playwright/test'

/**
 * Pre-push smoke test — NOT exhaustive.
 *
 * Since #308 the app routes by path, and since #311 signed-out Studio access
 * lands on the Studio welcome/sign-in interstitial instead of silently bouncing
 * to Gallery. Until an authenticated e2e story exists, this smoke covers the
 * routing seam itself — public entry, Studio gate, reference workspaces, legacy
 * hash links, and graceful dead ends.
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

test('Preview resolution moves through natural geometry stops', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /LatticeWarp3D/ }).click()
  await page.getByRole('button', { name: 'Edit pixel count' }).click()

  await expect(page.getByRole('slider', { name: 'Preview resolution' })).toHaveValue('3')
  await page.getByRole('button', { name: 'Decrease preview resolution' }).click()

  await expect(page.getByRole('button', { name: 'Edit pixel count' })).toHaveText('1000')
  const editor = page.getByRole('dialog', { name: 'Pixel count editor' })
  await expect(editor.getByText('10×10×10')).toBeVisible()
  await expect(editor.getByText('1,000 LEDs')).toBeVisible()
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
  await expect(page.getByTestId('docs-workspace')).toBeVisible()
  await expect(page.getByTestId('docs-reader')).toContainText('PXLBLZ — Feature Guide')
  await expect(page.getByTestId('docs-catalog').getByRole('link', { name: /Feature Guide/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('editor-pane')).toHaveCount(0)
})

test('legacy #/docs/<id> hash links redirect to the path route', async ({ page }) => {
  await page.goto('/#/docs/optimization-guide')
  await expect(page).toHaveURL(/\/docs\/optimization-guide$/)
  await expect(page.getByTestId('docs-reader')).toContainText('Optimizing Pixelblaze patterns')
})

test('About and API reference are public deep-linkable workspaces', async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.goto('docs/about')
  await expect(page.getByTestId('docs-reader')).toContainText('I built the Pixelblaze tool I wanted for myself.')
  await expect(page.getByRole('button', { name: 'Connect a Controller' })).toBeVisible()

  await page.goto('reference/Anim')
  await expect(page.getByTestId('api-reference-reader')).toContainText('Anim.easeIn2(t)')
  await expect(page.getByTestId('api-reference-catalog').getByRole('link', { name: /Anim/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('editor-pane')).toHaveCount(0)
  expect(runtimeErrors).toEqual([])
})

test('Docs and API header buttons preserve one public return origin', async ({ page }) => {
  await page.goto('gallery')
  await page.getByRole('button', { name: 'Docs' }).click()
  await expect(page).toHaveURL(/\/docs$/)
  await page.getByRole('button', { name: 'API' }).click()
  await expect(page).toHaveURL(/\/reference$/)
  await page.getByRole('button', { name: 'API' }).click()
  await expect(page).toHaveURL(/\/gallery$/)
})

test('reference workspaces keep navigation and content reachable in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('docs/about')
  await expect(page.getByRole('button', { name: 'Docs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'API' })).toBeVisible()
  await expect(page.getByTestId('top-bar')).toBeInViewport()
  await expect(page.getByTestId('docs-catalog')).toBeVisible()
  await expect(page.getByTestId('docs-catalog').getByRole('link', { name: /About PXLBLZ/ })).toBeInViewport()
  await expect(page.getByTestId('docs-reader')).toContainText('About PXLBLZ')
  await expect(page.getByTestId('docs-reader').getByRole('heading', { name: 'About PXLBLZ', exact: true })).toBeInViewport()
})

test('unknown paths fail gracefully', async ({ page }) => {
  await page.goto('no-such-page')
  await expect(page.getByTestId('route-message')).toContainText('Nothing at this address')
})
