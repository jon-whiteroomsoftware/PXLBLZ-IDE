import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2Markers } from './fixtures/showV2Markers'

test('v2 Marker changes, refusal, Undo/Redo and saved-byte reopen share one history/write per edit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { route, markers, source, readWrites } = await exerciseShowV2Markers(page)
  await markers.getByRole('button', { name: 'Remove Marker' }).click()
  await expect(route.getByText('Marker saved.', { exact: true })).toBeVisible()
  expect(readWrites()).toBe(7)
  const stored = await page.request.get('/api/shows?show-version=2')
  expect(stored.ok()).toBe(true)
  const { shows } = await stored.json()
  expect(shows.find((show: { id: string }) => show.id === source.id).composition.markers).toHaveLength(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(markers.getByRole('button', { name: 'Add Marker' })).toBeVisible()
  const overflows = await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1).map(element => element.getAttribute('aria-label') || element.textContent))
  expect(overflows).toEqual([])
})
