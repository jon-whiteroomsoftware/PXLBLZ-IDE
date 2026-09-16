import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
export const preparedTransitionRecord = JSON.parse(readFileSync(new URL('./showV2PreparedTransition.json', import.meta.url), 'utf8'))
export const preparedTransitionPattern = { id: 'prepared-transition-pattern', name: 'Transition Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 }
export const preparedTransitionMap = { id: 'prepared-transition-map', name: 'Transition Grid', dim: 2, generator: 'custom', params: {}, points: Array.from({ length: 256 }, (_, i) => [(i % 16) / 15, Math.floor(i / 16) / 15]), normalizeMode: 'contain', updatedAt: 1 }
export async function exerciseShowV2TransitionResize(page: Page) {
  const source = convertibleV1Show(); source.id = preparedTransitionRecord.id; source.name = preparedTransitionRecord.name
  for (const [resource, value] of [['patterns', preparedTransitionPattern], ['maps', preparedTransitionMap], ['shows', source]] as const) {
    const created = await page.request.post(`/api/${resource}`, { data: value }); expect(created.ok(), await created.text()).toBe(true)
  }
  const initial = await page.request.put(`/api/shows/${source.id}?show-version=2`, { data: preparedTransitionRecord }); expect(initial.ok(), await initial.text()).toBe(true)
  let writes = 0
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${source.id}?show-version=2`)) writes++ })
  await page.goto(`studio/shows/${source.id}?show-v2-pilot=1&capture`)
  const route = page.getByTestId('show-v2-route-pilot'); const stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible(); await expect(stage).toContainText('Transition Grid')
  const commit = async (value: string) => { await route.getByLabel('Transition duration', { exact: true }).fill(value); await route.getByLabel('Transition duration', { exact: true }).press('Enter'); await expect(route.getByLabel('Transition duration', { exact: true })).toBeEnabled() }
  await commit('1000'); await expect(route.getByText('Saved v2 Transition at 1000 ms.', { exact: true })).toBeVisible(); expect(writes).toBe(1)
  await commit('1000'); await expect(route.getByText('Saved v2 Transition at 1000 ms.', { exact: true })).toBeVisible(); expect(writes).toBe(1)
  await commit('9007199254740992'); await expect(route.getByText('Transition duration must be a nonnegative safe integer.', { exact: true })).toBeVisible(); await expect(route.getByLabel('Transition duration', { exact: true })).toHaveValue('1000'); expect(writes).toBe(1)
  await route.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible(); await expect(route.getByLabel('Transition duration', { exact: true })).toHaveValue('2000'); expect(writes).toBe(2)
  await route.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible(); await expect(route.getByLabel('Transition duration', { exact: true })).toHaveValue('1000'); expect(writes).toBe(3)
  await route.getByRole('button', { name: 'Reload saved v2' }).click(); await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible(); await expect(route.getByLabel('Transition duration', { exact: true })).toHaveValue('1000'); expect(writes).toBe(3)
  await route.getByRole('button', { name: 'Reopen artifacts' }).click(); await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  const saved = await page.request.get('/api/shows?show-version=2'); const record = (await saved.json()).shows.find((show: { id: string }) => show.id === source.id)
  expect(record.composition.propertyTracks).toEqual(preparedTransitionRecord.composition.propertyTracks)
  expect(record.composition.patternInstances).toEqual(preparedTransitionRecord.composition.patternInstances)
  expect(record.composition.clips.map((clip: { id: string; startMs: number; durationMs: number }) => [clip.id, clip.startMs, clip.durationMs])).toEqual([['out', 0, 13000], ['in', 14000, 16000]])
  return { route, stage, source, readWrites: () => writes }
}
