import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
export const groupCreationFixture = JSON.parse(readFileSync(new URL('./showV2GroupCreation.json', import.meta.url), 'utf8'))
/** Actual ordinary selection controls and one registered typed adoption; synthetic data only. */
export async function exerciseShowV2GroupCreation(page: Page) {
  const { record, legacy, patterns } = groupCreationFixture
  for (const [resource, value] of [...patterns.map((pattern: object) => ['patterns', pattern]), ['shows', legacy]] as [string, object][]) {
    const response = await page.request.post(`/api/${resource}`, { data: value }); expect(response.ok(), await response.text()).toBe(true)
  }
  const seeded = await page.request.put(`/api/shows/${record.id}?show-version=2`, { data: record }); expect(seeded.ok(), await seeded.text()).toBe(true)
  let writes = 0, settled = 0
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${record.id}?show-version=2`)) writes++ })
  page.on('response', response => { if (response.request().method() === 'PUT' && response.url().includes(`/api/shows/${record.id}?show-version=2`) && response.ok()) settled++ })
  await page.goto(`studio/shows/${record.id}?show-v2-pilot=1&capture`)
  const unpin = page.getByRole('button', { name: 'Unpin Shows list', exact: true }); if (await unpin.count()) await unpin.click()
  const close = page.getByRole('button', { name: 'Close Shows list', exact: true }); if (await close.count()) await close.click()
  const route = page.getByTestId('show-v2-route-pilot'), editor = route.getByRole('region', { name: 'Create Group', exact: true })
  const stage = page.getByTestId('show-stage-preview'), timeline = route.getByTestId('show-v2-timeline')
  await expect(stage).toBeVisible(); await expect(editor.getByRole('button', { name: 'Create Group', exact: true })).toBeDisabled()
  await editor.getByRole('checkbox', { name: /Voice.*2000.*3000/ }).check()
  await editor.getByLabel('Group name', { exact: true }).fill('Verse')
  const transition = editor.getByRole('checkbox', { name: /crossfade.*verse-transition/ })
  await expect(transition).not.toBeChecked(); expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Create Group', exact: true }).click()
  await expect(route).toContainText('Explicitly select every attached internal Transition')
  await expect(editor.getByRole('checkbox', { name: /Voice.*2000.*3000/ })).toBeChecked()
  await expect(editor.getByLabel('Group name', { exact: true })).toHaveValue('Verse'); expect(writes).toBe(0)
  const unchanged = await page.request.get('/api/shows?show-version=2'); expect((await unchanged.json()).shows.find((show: { id: string }) => show.id === record.id)).toEqual(record)
  await editor.getByRole('checkbox', { name: /Voice.*4000.*7000/ }).check(); await transition.check()
  await editor.getByRole('button', { name: 'Create Group', exact: true }).click()
  await expect(route.getByText('Group saved.', { exact: true })).toBeVisible(); await expect.poll(() => settled).toBe(1); expect(writes).toBe(1)
  await expect(timeline.getByLabel(/Verse.*Group occupancy/)).toHaveCount(2)
  await expect(editor.getByRole('checkbox')).toHaveCount(1); await expect(editor.getByRole('button', { name: 'Create Group', exact: true })).toBeDisabled()
  await route.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible(); await expect.poll(() => settled).toBe(2)
  await expect(editor.getByRole('checkbox')).toHaveCount(3); await expect(timeline.getByLabel(/Verse.*Group occupancy/)).toHaveCount(0)
  await route.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible(); await expect.poll(() => settled).toBe(3)
  await expect(timeline.getByLabel(/Verse.*Group occupancy/)).toHaveCount(2)
  await route.getByRole('button', { name: 'Reload saved v2', exact: true }).click(); await expect(route).toContainText('Reloaded v2 bytes from the provider.')
  await page.reload(); await expect(stage).toBeVisible(); await expect(timeline.getByLabel(/Verse.*Group occupancy/)).toHaveCount(2); expect(writes).toBe(3)
  await route.getByRole('button', { name: 'Reopen artifacts', exact: true }).click(); await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  const response = await page.request.get('/api/shows?show-version=2'); expect(response.ok()).toBe(true)
  const saved = (await response.json()).shows.find((show: { id: string }) => show.id === record.id)
  expect(saved.composition.patternInstances).toEqual(record.composition.patternInstances); expect(saved.composition.propertyTracks).toEqual(record.composition.propertyTracks)
  expect(saved.composition.showEndMs).toBe(30000); expect(saved.composition.clips).toEqual([record.composition.clips[0]])
  expect(saved.composition.groupDefinitions[0]).toMatchObject({ name: 'Verse', clips: [{ startMs: 0, durationMs: 1000, entryPolicy: 'continue' }, { startMs: 2000, durationMs: 3000, entryPolicy: 'restart' }], transitions: [{ kind: 'crossfade', crossfadePolicy: 'live-live', durationMs: 1000, easing: { curve: 'sine', direction: 'in-out' } }] })
  expect(saved.composition.groupOccurrences[0]).toMatchObject({ startMs: 2000, zoneId: 'zone', translationX: 0, translationY: 0, holds: [] })
  expect(Object.values(saved.composition.groupOccurrences[0].instanceBindings)).toEqual(['instance'])
  return { route, editor, stage, timeline, saved, readWrites: () => writes }
}
