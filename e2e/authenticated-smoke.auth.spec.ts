import { expect, test } from './fixtures/authenticated'

test('authenticated Studio creates, renames, and reloads a persisted Show', async ({ page }) => {
  await page.goto('studio/shows')

  await expect(page.getByRole('button', { name: /Account menu for playwright-worker-\d+/i })).toBeVisible()
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)

  await page.getByRole('button', { name: 'Rename show Untitled Show' }).click()
  await page.getByRole('textbox', { name: 'Show name' }).fill('Opening')
  await page.getByRole('textbox', { name: 'Show name' }).press('Enter')
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/shows')
    if (!response.ok()) return false
    const { shows } = await response.json() as {
      shows: Array<{ name: string }>
    }
    return shows.some((show) => show.name === 'Opening')
  }).toBe(true)

  await page.reload()

  await expect(page.getByRole('button', { name: 'Rename show Opening' })).toBeVisible()
})

test('shared Studio chrome remains legible, dense, and reachable across routes (#479)', async ({ page }) => {
  const routes = [
    { path: 'studio/patterns/IridescentFibers', activity: 'Patterns', heading: 'Patterns' },
    { path: 'studio/maps/plane', activity: 'Maps', heading: 'Maps' },
    { path: 'studio/libraries/Shader', activity: 'Libraries', heading: 'Libraries' },
    { path: 'studio/controllers', activity: 'Controllers', heading: 'Controllers' },
    { path: 'studio/shows/stock-show-101-clips-cuts-blank-time', activity: 'Shows', heading: 'Shows' },
  ] as const

  for (const viewport of [{ width: 1440, height: 900 }, { width: 720, height: 720 }]) {
    await page.setViewportSize(viewport)
    for (const route of routes) {
      await page.goto(route.path)

      const activity = page.getByRole('radio', { name: route.activity })
      await expect(activity).toHaveAttribute('aria-checked', 'true')
      await activity.focus()
      await expect(activity).toBeFocused()

      const heading = page.getByRole('heading', { name: route.heading, exact: true }).first()
      await expect(heading).toHaveClass(/text-\[13px\]/)
      await expect(heading).toHaveClass(/text-zinc-200/)
      await expect.poll(
        () => page.evaluate(() => document.documentElement.scrollWidth),
        `${route.path} at ${viewport.width}px should not create document-level horizontal overflow`,
      ).toBeLessThanOrEqual(viewport.width + 1)
    }
  }

  await page.goto('studio/patterns/IridescentFibers')
  await page.getByRole('button', { name: 'Collapse rail' }).click()
  await expect(page.getByRole('button', { name: 'Expand library' })).toBeVisible()
  expect(await page.locator('[aria-label="Studio activity"]').evaluate((element) => element.getBoundingClientRect().width))
    .toBe(46)
})

test('Studio authoring keeps the rail and editor reachable at 390px (#622)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows')
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()

  await page.setViewportSize({ width: 390, height: 844 })

  for (const route of [
    { path: 'studio/patterns/IridescentFibers', action: 'Collapse rail' },
    { path: 'studio/maps/plane', action: 'Collapse rail' },
  ]) {
    await page.goto(route.path)

    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `${route.path} should not create document-level horizontal overflow at 390px`,
    ).toBeLessThanOrEqual(1)

    await expect(page.getByRole('button', { name: route.action })).toBeInViewport()
  }

  await page.goto('studio/patterns/IridescentFibers')
  await expect(page.getByTestId('preview-pane')).toBeHidden()
  await expect(page.getByTestId('editor-pane')).toBeInViewport()

  await page.goto('studio/shows')
  await page.getByRole('treeitem', { name: 'Untitled Show' }).click()
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'Show authoring should not create document-level horizontal overflow at 390px',
  ).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: 'Show properties' })).toBeInViewport()

  // The Learn number is composed from catalogue level and order at runtime.
  await page.getByRole('treeitem', { name: /Clips, Cuts, and Blank Time$/ }).click()
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'A built-in Show with the full guide and deployment header should stay contained at 390px',
  ).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: 'Collapse rail' }).click()
  await expect(page.getByRole('button', { name: 'Expand library' })).toBeInViewport()
})

test('resized Pattern and Show previews keep their controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('studio/patterns/IridescentFibers')

  const previewPane = page.getByTestId('preview-pane')
  const initialBounds = await previewPane.boundingBox()
  if (!initialBounds) throw new Error('Preview pane is not visible')

  const splitterX = initialBounds.x - 2
  const dragY = initialBounds.y + 180
  await page.mouse.move(splitterX, dragY)
  await page.mouse.down()
  await page.mouse.move(splitterX - 240, dragY, { steps: 6 })
  await page.mouse.up()

  await expect.poll(async () => (await previewPane.boundingBox())?.width ?? 0).toBeGreaterThan(680)
  await previewPane.hover()
  await page.mouse.wheel(0, 1200)
  await expect(page.getByRole('button', { name: 'Watch variables' })).toBeInViewport()

  await page.goto('studio/shows/stock-show-showcase-redline-installation')
  await previewPane.hover()
  await page.mouse.wheel(0, 1200)
  await expect(previewPane.getByRole('button', { name: 'Renderer' })).toBeInViewport()
})
