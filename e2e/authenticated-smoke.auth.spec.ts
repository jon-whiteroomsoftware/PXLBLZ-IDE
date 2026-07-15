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

test('shared Studio microtype stays legible and dense at narrow width (#465)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 })
  await page.goto('studio/maps')

  await expect(page.getByRole('radio', { name: 'Maps' })).toHaveClass(/text-\[10px\]/)
  const surfaces = page.getByText('Surfaces', { exact: true })
  await expect(surfaces).toHaveClass(/text-\[10px\]/)
  await expect(surfaces).toHaveClass(/text-zinc-400/)
  await expect(page.getByText(/views$/, { exact: false }).first()).toHaveClass(/text-zinc-400/)

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768)
})
