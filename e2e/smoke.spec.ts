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

test('app icon keeps the live accent color on hover (#674)', async ({ page }) => {
  await page.goto('/')
  const homeLink = page.getByRole('link', { name: 'PXLBLZ home' })
  const icon = homeLink.locator('svg')
  const liveAccent = await page.locator('html').evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-live)'
    element.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })

  await expect(icon).toHaveCSS('color', liveAccent)
  await homeLink.hover()

  await expect(homeLink).toHaveCSS('filter', 'none')
  await expect(icon).toHaveCSS('color', liveAccent)
  await expect(icon.locator('path')).toHaveCSS('stroke', liveAccent)
  await expect(icon.locator('circle')).toHaveCSS('fill', liveAccent)
})

test('gallery Back navigation restores the originating Pattern card', async ({ page }) => {
  await page.goto('/')
  const cards = page.locator('[id^="gallery-"]')
  const origin = cards.first()
  const anchorId = await origin.getAttribute('id')
  await origin.dispatchEvent('click')

  await page.goBack()

  await expect(page).toHaveURL(new RegExp(`#${anchorId}$`))
  await expect(page.locator(`#${anchorId}`)).toBeInViewport()
})

test('Gallery directory routes are shareable and stay in sync with the filter', async ({ page }) => {
  await page.goto('gallery/zranger1')

  const directoryFilter = page.getByRole('combobox', { name: 'Directory filter' })
  await expect(directoryFilter).toHaveValue('ZRanger1')
  // galleryCatalog.test.ts owns exact membership; this pins the rendered directory count.
  await expect(page.locator('[id^="gallery-"]')).toHaveCount(32)

  await directoryFilter.selectOption('Living 1D')
  await expect(page).toHaveURL(/\/gallery\/living-1d$/)

  await page.reload()
  await expect(directoryFilter).toHaveValue('Living 1D')

  await directoryFilter.selectOption('Everything')
  await expect(page).toHaveURL(/\/gallery$/)
})

test('filtered Gallery Back navigation restores the directory and Pattern card', async ({ page }) => {
  await page.goto('gallery/zranger1')
  const origin = page.locator('[id^="gallery-"]').first()
  const anchorId = await origin.getAttribute('id')
  await origin.dispatchEvent('click')

  await page.goBack()

  await expect(page).toHaveURL(new RegExp(`/gallery/zranger1#${anchorId}$`))
  await expect(page.getByRole('combobox', { name: 'Directory filter' })).toHaveValue('ZRanger1')
  await expect(page.locator(`#${anchorId}`)).toBeInViewport()
})

test('Pattern detail Gallery control restores the filtered directory origin', async ({ page }) => {
  await page.goto('gallery/zranger1')
  const origin = page.locator('[id^="gallery-"]').first()
  const anchorId = await origin.getAttribute('id')
  await origin.dispatchEvent('click')

  await page.getByRole('button', { name: 'Gallery', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/gallery/zranger1#${anchorId}$`))
  await expect(page.getByRole('combobox', { name: 'Directory filter' })).toHaveValue('ZRanger1')
  await expect(page.locator(`#${anchorId}`)).toBeInViewport()
})

test('direct Pattern detail Gallery control falls back to the unfiltered Gallery', async ({ page }) => {
  await page.goto('p/oasis')

  await page.getByRole('button', { name: 'Gallery', exact: true }).click()

  await expect(page).toHaveURL(/\/gallery$/)
  await expect(page.getByRole('combobox', { name: 'Directory filter' })).toHaveValue('Everything')
})

test('unknown Gallery directory routes fail gracefully', async ({ page }) => {
  await page.goto('gallery/not-a-directory')

  await expect(page.getByTestId('route-message')).toContainText('Gallery directory not found')
  await expect(page.getByRole('button', { name: 'Browse the Gallery' })).toBeVisible()
})

test('Pattern detail uses the shared recommended presentation', async ({ page }) => {
  await page.goto('/')
  await page.locator('#gallery-lattice-warp3-d').dispatchEvent('click')

  await expect(page.getByRole('button', { name: 'Map', exact: true })).toContainText('Cube volume')
  await expect(page.getByRole('button', { name: 'Edit pixel count' })).toHaveText('1728')
  await expect(page.getByText('12×12×12')).toBeVisible()

  const detail = page.getByTestId('pattern-detail-page')
  const canvas = detail.locator('[data-height-constrained] canvas')
  await expect.poll(async () => canvas.evaluate((element) => {
    const root = element.closest('[data-height-constrained]')
    return root ? element.width / root.getBoundingClientRect().width : 0
  }), { timeout: 15_000 }).toBeGreaterThanOrEqual(0.99)

  await page.getByRole('button', { name: 'View code' }).click()
  await page.getByRole('button', { name: 'View preview' }).click()

  await expect.poll(async () => canvas.evaluate((element) => {
    const root = element.closest('[data-height-constrained]')
    return root ? element.width / root.getBoundingClientRect().width : 0
  }), { timeout: 15_000 }).toBeGreaterThanOrEqual(0.99)
})

test('3D Pattern detail offers ephemeral zoom and Reset View framing (#739)', async ({ page }) => {
  await page.goto('/')
  await page.locator('#gallery-lattice-warp3-d').dispatchEvent('click')

  const zoom = page.getByRole('slider', { name: '3D view zoom' })
  await expect(zoom).toHaveAttribute('aria-orientation', 'vertical')
  await expect(zoom).toHaveValue('1')

  await zoom.fill('2')
  await expect(zoom).toHaveValue('2')
  await expect(zoom).toHaveAttribute('aria-valuetext', '2×')

  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect(zoom).toHaveValue('1')
  await expect(zoom).toHaveAttribute('aria-valuetext', '1×')

  const canvas = page.getByTestId('pattern-detail-page').locator('[data-height-constrained] canvas')
  await canvas.hover()
  await page.mouse.wheel(0, -100)
  await expect(zoom).toHaveValue('1.25')
  await page.mouse.wheel(0, 100)
  await expect(zoom).toHaveValue('1')

  await page.reload()
  await expect(page.getByRole('slider', { name: '3D view zoom' })).toHaveValue('1')
})

test('Preview resolution moves through natural geometry stops', async ({ page }) => {
  await page.goto('/')
  await page.locator('#gallery-lattice-warp3-d').dispatchEvent('click')
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

test('Show visual-toolkit guide renders its final-UI workflow and screenshots (#460)', async ({ page }) => {
  await page.goto('docs/show-visual-toolkit')
  await expect(page).toHaveURL(/\/docs\/show-visual-toolkit$/)
  const reader = page.getByTestId('docs-reader')
  await expect(reader).toContainText('The ownership rule')
  await expect(reader).toContainText(/cheap selector/i)
  // Two workflow screenshots plus the transition-cost-classes diagram the
  // dark diagram house style added (#357).
  await expect(reader.getByRole('img')).toHaveCount(3)
  await expect(reader.getByRole('img').first()).toBeVisible()
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

test('API entries use two columns when the reference reader has room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('reference/Anim')

  const first = await page.getByText('Anim.easeIn2(t)', { exact: true }).boundingBox()
  const second = await page.getByText('Anim.easeOut2(t)', { exact: true }).boundingBox()

  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(4)
  expect(second!.x).toBeGreaterThan(first!.x + first!.width)
})

test('Docs and API header buttons preserve one public return origin', async ({ page }) => {
  await page.goto('gallery')
  await page.getByRole('button', { name: 'Docs' }).click()
  await expect(page).toHaveURL(/\/docs$/)

  const docsButton = page.getByRole('button', { name: 'Docs' })
  await expect(docsButton).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => {
    const [docsColor, docsIconColor] = await Promise.all([
      docsButton.evaluate((element) => getComputedStyle(element).color),
      docsButton.locator('svg').evaluate((element) => getComputedStyle(element).color),
    ])
    return docsIconColor === docsColor
  }).toBe(true)

  await page.getByRole('button', { name: 'API' }).click()
  await expect(page).toHaveURL(/\/reference$/)
  await page.getByRole('button', { name: 'Back to Gallery' }).click()
  await expect(page).toHaveURL(/\/gallery$/)
})

test('reference workspaces keep navigation and long content reachable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('docs/feature-guide')
  await expect(page.getByRole('button', { name: 'Docs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'API' })).toBeVisible()
  await expect(page.getByTestId('top-bar')).toBeInViewport()
  await expect(page.getByTestId('docs-catalog')).toBeVisible()
  await expect(page.getByTestId('docs-catalog').getByRole('link', { name: /Feature Guide/ })).toBeInViewport()

  const docsArticle = page.getByTestId('docs-reader').locator('article')
  await expect.poll(() => docsArticle.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await docsArticle.evaluate((element) => { element.scrollTop = 400 })
  await expect.poll(() => docsArticle.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  await page.goto('reference/PixelBlaze')
  await expect(page.getByTestId('api-reference-catalog')).toBeVisible()
  const apiArticle = page.getByTestId('api-reference-reader').locator('article')
  await expect.poll(() => apiArticle.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await apiArticle.evaluate((element) => { element.scrollTop = 400 })
  await expect.poll(() => apiArticle.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
})

test('the Studio welcome gate remains reachable on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('studio-welcome')

  const welcome = page.getByTestId('studio-welcome-page')
  const card = welcome.locator('section')
  const [welcomeBox, cardBox] = await Promise.all([welcome.boundingBox(), card.boundingBox()])
  expect(welcomeBox).not.toBeNull()
  expect(cardBox).not.toBeNull()
  expect(cardBox!.y).toBeGreaterThanOrEqual(welcomeBox!.y)

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(horizontalOverflow).toBeLessThanOrEqual(0)

  for (const name of ['Continue with GitHub', 'Continue with Google', 'Back to Gallery']) {
    const action = page.getByRole('button', { name })
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeInViewport()
  }
})

test('unknown paths fail gracefully', async ({ page }) => {
  await page.goto('no-such-page')
  await expect(page.getByTestId('route-message')).toContainText('Nothing at this address')
})

test('Gallery animates the cards nearest the pointer and freezes the rest on posters (#888)', async ({ page }) => {
  await page.goto('gallery')
  const live = page.locator('[data-testid="gallery-live-preview"][data-gallery-mode="live"]')
  // The pool holds at most six cards, all of them on screen.
  const allLiveOnScreen = () =>
    live.evaluateAll((elements) =>
      elements.length > 0 && elements.length <= 6 && elements.every((element) => {
        const rect = element.getBoundingClientRect()
        return rect.bottom > 0 && rect.top < window.innerHeight
      }),
    )
  await expect.poll(allLiveOnScreen).toBe(true)

  const cards = page.locator('[id^="gallery-"]')
  const first = cards.first().locator('[data-testid="gallery-live-preview"]')
  await expect(first).toHaveAttribute('data-gallery-mode', 'live')
  // Wait for the card to paint (its keyframe fetch has settled) before displacing it.
  await expect(first.locator('canvas[aria-label]')).toHaveCSS('opacity', '1')

  // Hover a card outside the initial set: it goes live, the pool stays bounded,
  // and the card that left the set keeps a captured poster.
  const target = cards.nth(8)
  await target.scrollIntoViewIfNeeded()
  await target.hover()
  await expect(target.locator('[data-testid="gallery-live-preview"]')).toHaveAttribute('data-gallery-mode', 'live')
  await expect.poll(allLiveOnScreen).toBe(true)
  await expect(first).toHaveAttribute('data-gallery-mode', 'frozen')
  await expect(first.locator('[data-testid="gallery-poster"]')).toHaveAttribute('data-has-poster', 'true')

  // Scrolling moves the live set to the new viewport.
  await page.getByTestId('gallery-page').evaluate((element) => { element.scrollTop = 3000 })
  await expect.poll(allLiveOnScreen).toBe(true)
  // Frozen cards in view receive posters one at a time.
  await expect.poll(() => page.locator('[data-gallery-mode="frozen"] [data-has-poster="true"]').count()).toBeGreaterThan(1)
})

test('Gallery density picker changes the grid and persists (#888)', async ({ page }) => {
  await page.goto('gallery')
  const grid = page.getByTestId('gallery-grid')
  await expect(grid).toHaveAttribute('data-density', '3')
  await expect(page.locator('[data-gallery-strip="true"]').first()).toBeAttached()

  await page.getByRole('radio', { name: 'Small cards, 4 per row' }).click()
  await expect(grid).toHaveAttribute('data-density', '4')
  await page.reload()
  await expect(page.getByTestId('gallery-grid')).toHaveAttribute('data-density', '4')
})

test('Gallery leads with a Show band and opens its detail page (#894)', async ({ page }) => {
  await page.goto('gallery')
  const bands = page.getByTestId('gallery-show-band')
  await expect(bands).toHaveCount(4)
  // The hero band comes before the first Pattern card, and keeps the stage's shape.
  const hero = page.locator('#show-overture-installation')
  await expect(hero).toBeVisible()
  const heroBox = await hero.boundingBox()
  const firstCard = await page.locator('[id^="gallery-"]').first().boundingBox()
  expect(heroBox!.y).toBeLessThan(firstCard!.y)
  expect(heroBox!.width).toBeGreaterThan(heroBox!.height)
  // The hero is live, and its loop thermometer advances.
  const heroPreview = hero.locator('[data-testid="gallery-live-preview"]')
  await expect(heroPreview).toHaveAttribute('data-gallery-mode', 'live')
  await expect.poll(() =>
    hero.locator('[data-testid="gallery-loop-progress"]').evaluate((el) => el.style.transform),
  ).not.toBe('scaleX(0)')

  // The Shows directory lists only bands; a search hides them.
  await page.getByLabel('Directory filter').selectOption('Shows')
  await expect(page).toHaveURL(/\/gallery\/shows$/)
  await expect(bands).toHaveCount(4)
  await expect(page.locator('[id^="gallery-"]')).toHaveCount(0)
  await page.goto('gallery')
  await page.getByLabel('Search patterns').fill('aurora')
  await expect(bands).toHaveCount(0)

  // A band opens the Show's page; Back returns to the band.
  await page.goto('gallery')
  await hero.click()
  await expect(page).toHaveURL(/\/s\/overture-installation$/)
  await expect(page.getByTestId('show-detail-stage')).toBeVisible()
  await expect(page.getByTestId('show-detail-scenes').locator('li')).toHaveCount(4)
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  await expect(page).toHaveURL(/\/gallery#show-overture-installation$/)
})

test('unknown Show routes fail gracefully (#894)', async ({ page }) => {
  await page.goto('s/not-a-show')
  await expect(page.getByTestId('route-message')).toContainText('Show not found')
  await expect(page.getByRole('button', { name: 'Browse the Gallery' })).toBeVisible()
})
