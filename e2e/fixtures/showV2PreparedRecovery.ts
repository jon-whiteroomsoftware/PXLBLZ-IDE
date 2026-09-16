import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
const fixture = JSON.parse(readFileSync(new URL('./showV2PreparedRecovery.json', import.meta.url), 'utf8'))
/** Existing visible typed Layer edit; no test candidate/adoption callback. */
export async function exerciseShowV2PreparedRecovery(page: Page) {
  for (const pattern of fixture.patterns) {
    const response = await page.request.post('/api/patterns', { data: pattern })
    expect(response.ok(), await response.text()).toBe(true)
  }
  const legacy = await page.request.post('/api/shows', { data: fixture.legacy })
  expect(legacy.ok(), await legacy.text()).toBe(true)
  const seeded = await page.request.put(`/api/shows/${fixture.record.id}?show-version=2`, { data: fixture.record })
  expect(seeded.ok(), await seeded.text()).toBe(true)
  let writes = 0
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${fixture.record.id}?show-version=2`)) writes++ })
  await page.goto(`studio/shows/${fixture.record.id}?show-v2-pilot=1&capture`)
  const route = page.getByTestId('show-v2-route-pilot')
  const editor = route.getByRole('region', { name: 'Layers', exact: true })
  const refused = route.getByText('composition.clips: lowering requires repeat-mode Clip sampling evidence before compilation.', { exact: true })
  await expect(refused).toBeVisible(); await expect(page.getByTestId('show-stage-preview')).toHaveCount(0)
  await expect(route.getByRole('button', { name: 'Reopen artifacts', exact: true })).toBeDisabled()
  await editor.getByLabel('Layer Zone', { exact: true }).selectOption('zone')
  await editor.getByLabel('Selected Layer', { exact: true }).selectOption(fixture.removedLayerId)
  expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Rename Layer', exact: true }).click()
  await expect(route.getByText('Layer is unchanged.', { exact: true })).toBeVisible(); expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Remove Layer', exact: true }).click()
  await expect(route.getByText('Layer saved.', { exact: true })).toBeVisible(); expect(writes).toBe(1)
  await expect(page.getByTestId('show-stage-preview')).toBeVisible()
  await expect(editor.getByLabel('Selected Layer', { exact: true })).toHaveValue('')
  await route.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible(); await expect(refused).toBeVisible(); expect(writes).toBe(2)
  await expect(page.getByTestId('show-stage-preview')).toHaveCount(0)
  await route.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible(); expect(writes).toBe(3)
  await expect(page.getByTestId('show-stage-preview')).toBeVisible()
  await route.getByRole('button', { name: 'Reload saved v2', exact: true }).click()
  await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible(); expect(writes).toBe(3)
  await route.getByRole('button', { name: 'Reopen artifacts', exact: true }).click()
  await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  const readback = await page.request.get('/api/shows?show-version=2'); expect(readback.ok()).toBe(true)
  const saved = (await readback.json()).shows.find((record: { id: string }) => record.id === fixture.record.id)
  expect(saved.composition.layers).toEqual(fixture.record.composition.layers.filter((layer: { id: string }) => layer.id !== fixture.removedLayerId))
  expect(saved.composition.patternInstances).toEqual(fixture.record.composition.patternInstances)
  expect(saved.composition.clips).toEqual(fixture.record.composition.clips)
  expect(saved.composition.showEndMs).toBe(30000)
  return { route, editor, stage: page.getByTestId('show-stage-preview'), saved, readWrites: () => writes }
}
