import { expect, showtimePath, test } from './fixtures/authenticated'

test('gates functional Show access behind the showtime query parameter', async ({ page }) => {
  await page.goto('studio')

  await expect(page.getByRole('radio', { name: 'Shows' })).toHaveCount(0)

  await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

  await expect(page).toHaveURL(/\/studio\/patterns$/)
  await expect(page.getByRole('radio', { name: 'Shows' })).toHaveCount(0)

  await page.goto(showtimePath('studio/shows/stock-show-101-clips-cuts-blank-time'))

  await expect(page).toHaveURL(/\/studio\/shows\/stock-show-101-clips-cuts-blank-time\?showtime$/)
  await expect(page.getByRole('radio', { name: 'Shows' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
})

test('authenticated Studio creates, renames, and reloads a persisted Show', async ({ page }) => {
  await page.goto(showtimePath('studio/shows'))

  await expect(page.getByRole('button', { name: /Account menu for playwright-worker-\d+/i })).toBeVisible()
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+\?showtime$/)

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
    { path: showtimePath('studio/shows/stock-show-101-clips-cuts-blank-time'), activity: 'Shows', heading: 'Shows' },
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

test('keeps the Shows header inside the center editor pane (#758)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(showtimePath('studio/shows/stock-show-101-clips-cuts-blank-time'))

  const geometry = await page.locator('.show-pane-header').evaluate((header) => {
    const editor = header.closest('[data-testid="editor-pane"]')
    const preview = document.querySelector('[data-testid="preview-pane"]')
    if (!editor || !preview) return null

    const headerBounds = header.getBoundingClientRect()
    const editorBounds = editor.getBoundingClientRect()
    const previewBounds = preview.getBoundingClientRect()
    return {
      editorWidth: editorBounds.width,
      headerRight: Math.round(headerBounds.right),
      editorRight: Math.round(editorBounds.right),
      previewLeft: Math.round(previewBounds.left),
    }
  })

  expect(geometry).not.toBeNull()
  expect(geometry!.editorWidth).toBeGreaterThan(0)
  expect(geometry!.headerRight).toBe(geometry!.editorRight)
  expect(geometry!.headerRight).toBeLessThanOrEqual(geometry!.previewLeft)
})

test('Studio authoring keeps the rail and editor reachable at 390px (#622)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(showtimePath('studio/shows'))
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

  await page.goto(showtimePath('studio/shows'))
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

test('rail search stays inside the list pane at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 507, height: 520 })
  await page.goto('studio/patterns/IridescentFibers')
  const search = page.getByRole('button', { name: 'Search by name', exact: true })
  const searchInput = page.getByRole('textbox', { name: 'Search by name', exact: true })
  await search.hover()

  const hoverBounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const activityBounds = document.querySelector('[aria-label="Studio activity"]')?.getBoundingClientRect()
    return { inputLeft: inputBounds.left, activityRight: activityBounds?.right }
  })
  expect(hoverBounds.inputLeft).toBeGreaterThanOrEqual(hoverBounds.activityRight ?? Number.POSITIVE_INFINITY)

  const dimensionFilter = page.getByRole('button', { name: 'Dimension filter', exact: true })
  await dimensionFilter.click()
  await expect(page.getByRole('listbox', { name: 'Dimension filter', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '2D', exact: true }).click()
  await expect(dimensionFilter).toContainText('2D')
  await search.click()

  const bounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const railBounds = input.closest('[data-testid="studio-rail"]')?.getBoundingClientRect()
    const activityBounds = document.querySelector('[aria-label="Studio activity"]')?.getBoundingClientRect()
    return {
      inputLeft: inputBounds.left,
      inputRight: inputBounds.right,
      inputWidth: inputBounds.width,
      railRight: railBounds?.right,
      activityRight: activityBounds?.right,
    }
  })

  expect(bounds.inputLeft).toBeGreaterThanOrEqual(bounds.activityRight ?? Number.POSITIVE_INFINITY)
  expect(bounds.inputRight).toBeLessThanOrEqual(bounds.railRight ?? Number.NEGATIVE_INFINITY)
  expect(bounds.inputWidth).toBeGreaterThanOrEqual(80)

  await page.getByRole('button', { name: 'Close search', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 720 })
  const librarySplitter = page.getByRole('separator', { name: 'Resize library pane', exact: true })
  for (let step = 0; step < 4; step += 1) await librarySplitter.press('Shift+ArrowLeft')
  await expect(librarySplitter).toHaveAttribute('aria-valuenow', '184')
  await search.hover()

  const minimumRailHoverBounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const activityBounds = document.querySelector('[aria-label="Studio activity"]')?.getBoundingClientRect()
    return { inputLeft: inputBounds.left, activityRight: activityBounds?.right }
  })
  expect(minimumRailHoverBounds.inputLeft).toBeGreaterThanOrEqual(
    minimumRailHoverBounds.activityRight ?? Number.POSITIVE_INFINITY,
  )
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
  const patternCanvas = previewPane.locator('canvas')
  const patternControls = previewPane.getByTestId('preview-controls-region')
  await expect(
    previewPane.getByRole('button', { name: 'Pixelblaze', exact: true }),
  ).toBeInViewport()
  await expect.poll(async () => {
    const canvasBounds = await patternCanvas.boundingBox()
    const controlsBounds = await patternControls.boundingBox()
    return canvasBounds && controlsBounds ? canvasBounds.y + canvasBounds.height <= controlsBounds.y : false
  }).toBe(true)
  await previewPane.getByRole('button', { name: 'Pixelblaze', exact: true }).click()
  await previewPane.getByRole('button', { name: 'Preview', exact: true }).click()
  await previewPane.getByRole('button', { name: 'Pattern controls', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Watch variables' })).toBeInViewport()

  await page.goto(showtimePath('studio/shows/stock-show-showcase-redline-installation'))
  await previewPane.hover()
  await page.mouse.wheel(0, 1200)
  await expect(previewPane.getByRole('button', { name: 'Renderer' })).toBeInViewport()
})
