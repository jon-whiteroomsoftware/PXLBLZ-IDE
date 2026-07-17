import { expect, test } from './fixtures/authenticated'

test('authenticated Studio creates, edits, and reloads a persisted Show', async ({ page }) => {
  await page.goto('studio/shows')

  await expect(page.getByRole('button', { name: /Account menu for playwright-shows/i })).toBeVisible()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)

  const sceneName = page.getByLabel('Scene 1 scene name')
  await sceneName.fill('Opening')
  await page.getByLabel('Opening duration seconds').fill('12')
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/shows')
    if (!response.ok()) return false
    const { shows } = await response.json() as {
      shows: Array<{ scenes: Array<{ name: string; durationMs: number }> }>
    }
    return shows.some((show) => show.scenes[0]?.name === 'Opening' && show.scenes[0]?.durationMs === 12_000)
  }).toBe(true)

  await page.reload()

  await expect(page.getByLabel('Opening scene name')).toHaveValue('Opening')
  await expect(page.getByLabel('Opening duration seconds')).toHaveValue('12')
})

test('shared Studio chrome remains legible, dense, and reachable across routes (#479)', async ({ page }) => {
  const routes = [
    { path: 'studio/patterns/IridescentFibers', activity: 'Patterns', heading: 'Patterns' },
    { path: 'studio/maps/plane', activity: 'Maps', heading: 'Maps' },
    { path: 'studio/libraries/Shader', activity: 'Libraries', heading: 'Libraries' },
    { path: 'studio/controllers', activity: 'Controllers', heading: 'Controllers' },
    { path: 'studio/shows/stock-show-installation-finale', activity: 'Shows', heading: 'Shows' },
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
  await page.getByRole('button', { name: 'Collapse library' }).click()
  await expect(page.getByRole('button', { name: 'Expand library' })).toBeVisible()
  expect(await page.locator('[aria-label="Studio activity"]').evaluate((element) => element.getBoundingClientRect().width))
    .toBe(46)
})
