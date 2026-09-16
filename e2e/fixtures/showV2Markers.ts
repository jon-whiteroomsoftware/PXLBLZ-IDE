import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'

export function markerRouteShow() {
  const source = convertibleV1Show()
  source.id = 'marker-route-synthetic'
  source.name = 'Marker Route'
  source.scenes[0].durationMs = 30_000
  source.composition!.durationMs = 30_000
  source.composition!.scenes[0].zones[0].main[0].durationMs = 30_000
  return source
}
export async function exerciseShowV2Markers(page: Page) {
  const source = markerRouteShow()
  const created = await page.request.post('/api/shows', { data: source })
  expect(created.ok(), await created.text()).toBe(true)
  let writes = 0
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes(`/api/shows/${source.id}?show-version=2`)) writes++
  })
  await page.goto(`studio/shows/${source.id}?show-v2-pilot=1`)
  const route = page.getByTestId('show-v2-route-pilot')
  await expect(route).toBeVisible()
  const markers = route.getByTestId('show-v2-markers')
  await expect(markers.getByRole('button', { name: 'Add Marker' })).toBeVisible()
  await markers.getByRole('button', { name: 'Add Marker' }).click()
  await expect(route.getByText('Marker saved.', { exact: true })).toBeVisible()
  expect(writes).toBe(1)
  await expect(markers.getByLabel('Marker', { exact: true })).toHaveValue('marker:1')
  await expect(markers.getByRole('option')).toHaveCount(2)
  const commit = async (label: string, value: string) => {
    await markers.getByLabel(label, { exact: true }).fill(value)
    await markers.getByLabel(label, { exact: true }).press('Enter')
    await expect(markers.getByRole('button', { name: 'Add Marker' })).toBeEnabled()
  }
  await commit('Marker time', '45000')
  expect(writes).toBe(2)
  await commit('Marker time', '0.5')
  await expect(route.getByText('Marker time must be nonnegative safe integer milliseconds.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker time')).toHaveValue('45000')
  expect(writes).toBe(2)
  await commit('Marker name', 'Outro')
  expect(writes).toBe(3)
  await commit('Marker color', '#ffaa00')
  expect(writes).toBe(4)
  await route.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker color')).toHaveValue('')
  expect(writes).toBe(5)
  await route.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker color')).toHaveValue('#ffaa00')
  expect(writes).toBe(6)
  await route.getByRole('button', { name: 'Reload saved v2' }).click()
  await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible()
  await markers.getByLabel('Marker', { exact: true }).selectOption('marker:1')
  await expect(markers.getByLabel('Marker name')).toHaveValue('Outro')
  await expect(markers.getByLabel('Marker time')).toHaveValue('45000')
  await expect(markers.getByLabel('Marker color')).toHaveValue('#ffaa00')
  expect(writes).toBe(6)
  await route.getByRole('button', { name: 'Reopen artifacts' }).click()
  await expect(route.getByText(/Reopened \.pxlshow v2 and \.epe/)).toBeVisible()
  return { route, markers, source, readWrites: () => writes }
}
