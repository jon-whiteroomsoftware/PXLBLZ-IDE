import { expect, test } from './fixtures/authenticated'

test('authenticated Studio renames a Pattern from the middle-pane title', async ({ page }) => {
  await page.goto('studio/patterns')

  await expect(page.getByRole('button', { name: /Account menu for playwright-shows/i })).toBeVisible()
  await page.getByRole('button', { name: 'New pattern' }).click()
  await expect(page).toHaveURL(/\/studio\/patterns\/[a-z0-9-]+$/)

  const title = page.getByRole('button', { name: /Rename pattern Untitled Pattern/i })
  await title.click()
  await page.getByRole('textbox', { name: 'Pattern name' }).fill('Header Renamed Pattern')
  await page.getByRole('button', { name: 'Apply pattern name' }).click()

  await expect(page.getByRole('button', { name: 'Rename pattern Header Renamed Pattern' })).toBeVisible()
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/patterns')
    if (!response.ok()) return false
    const { patterns } = await response.json() as { patterns: Array<{ name: string }> }
    return patterns.some((pattern) => pattern.name === 'Header Renamed Pattern')
  }).toBe(true)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Rename pattern Header Renamed Pattern' })).toBeVisible()

  await page.setViewportSize({ width: 640, height: 900 })
  await expect(page.getByRole('button', { name: 'Rename pattern Header Renamed Pattern' })).toBeVisible()
})
