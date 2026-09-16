import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
export const layerManagementRecord = JSON.parse(readFileSync(new URL('./showV2LayerManagement.json', import.meta.url), 'utf8'))
export const layerManagementPatterns = [
  { id: 'layer-red', name: 'Red Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(1,0,0)}', controls: {}, updatedAt: 1 },
  { id: 'layer-blue', name: 'Blue Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(0,0,1)}', controls: {}, updatedAt: 1 },
]
export const layerManagementMap = { id: 'layer-management-map', name: 'Layer Grid', dim: 2, generator: 'custom', params: {}, points: Array.from({ length: 256 }, (_, i) => [(i % 16) / 15, Math.floor(i / 16) / 15]), normalizeMode: 'contain', updatedAt: 1 }

export async function exerciseShowV2LayerManagement(page: Page) {
  const legacy = convertibleV1Show(); legacy.id = layerManagementRecord.id; legacy.name = layerManagementRecord.name
  for (const pattern of layerManagementPatterns) { const response = await page.request.post('/api/patterns', { data: pattern }); expect(response.ok(), await response.text()).toBe(true) }
  for (const [resource, value] of [['maps', layerManagementMap], ['shows', legacy]] as const) { const response = await page.request.post(`/api/${resource}`, { data: value }); expect(response.ok(), await response.text()).toBe(true) }
  const seeded = await page.request.put(`/api/shows/${legacy.id}?show-version=2`, { data: layerManagementRecord }); expect(seeded.ok(), await seeded.text()).toBe(true)
  let writes = 0; page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${legacy.id}?show-version=2`)) writes++ })
  await page.goto(`studio/shows/${legacy.id}?show-v2-pilot=1&capture`)
  const route = page.getByTestId('show-v2-route-pilot'), editor = route.getByRole('region', { name: 'Layers', exact: true }), stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible(); await expect(stage).toContainText('Layer Grid')
  const select = async (id: string) => { await editor.getByLabel('Layer Zone', { exact: true }).selectOption('zone'); await editor.getByLabel('Selected Layer', { exact: true }).selectOption(id) }
  const settled = async (count: number) => { await expect(editor.getByRole('button', { name: 'Add Layer', exact: true })).toBeEnabled(); expect(writes).toBe(count) }
  await select('layer:zone:main'); expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Rename Layer' }).click(); await expect(route.getByText('Layer is unchanged.', { exact: true })).toBeVisible(); expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Add Layer', exact: true }).click(); await editor.getByRole('button', { name: 'Cancel' }).click(); expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Add Layer', exact: true }).click()
  await editor.getByLabel('New Layer Zone', { exact: true }).selectOption('zone'); await editor.getByLabel('New Layer name', { exact: true }).fill('Accent')
  await editor.getByRole('button', { name: 'Add Layer at top' }).click(); await settled(1)
  const addedId = await editor.getByLabel('Selected Layer', { exact: true }).inputValue(); expect(addedId).not.toBe('')
  await editor.getByLabel('Layer name', { exact: true }).fill('Pulse'); await editor.getByRole('button', { name: 'Rename Layer' }).click(); await settled(2)
  await select('layer:zone:main'); await editor.getByRole('button', { name: 'Move up' }).click(); await settled(3)
  await select('layer:zone:overlay:1'); await editor.getByRole('button', { name: 'Remove Layer', exact: true }).click()
  const destinations = editor.getByRole('combobox', { name: /^Destination for / }); await expect(destinations).toHaveCount(3)
  await expect(editor.getByLabel('Destination for Group held-use / unused-local', { exact: true })).toHaveValue('')
  await expect(editor.getByRole('button', { name: 'Reassign and remove' })).toBeDisabled(); expect(writes).toBe(3)
  for (const field of await destinations.all()) { await expect(field).toHaveValue(''); await field.selectOption(addedId) }
  await editor.getByRole('button', { name: 'Reassign and remove' }).click(); await settled(4); await expect(editor.getByLabel('Selected Layer', { exact: true })).toHaveValue('')
  await route.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible(); expect(writes).toBe(5)
  await route.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible(); expect(writes).toBe(6)
  await route.getByRole('button', { name: 'Reload saved v2' }).click(); await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible(); expect(writes).toBe(6)
  await route.getByRole('button', { name: 'Reopen artifacts' }).click(); await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  const response = await page.request.get('/api/shows?show-version=2'); expect(response.ok()).toBe(true)
  const saved = (await response.json()).shows.find((show: { id: string }) => show.id === legacy.id)
  expect(saved.composition.layers).toEqual([{ id: 'layer:zone:main', zoneId: 'zone', name: 'Main', rank: 1 }, { id: addedId, zoneId: 'zone', name: 'Pulse', rank: 2 }])
  expect(saved.composition.clips).toEqual(layerManagementRecord.composition.clips.map((clip: { id: string; layerId: string }) => ({ ...clip, layerId: clip.id === 'blue-voice' ? addedId : clip.layerId })))
  expect(saved.composition.groupDefinitions).toEqual(layerManagementRecord.composition.groupDefinitions); expect(saved.composition.patternInstances).toEqual(layerManagementRecord.composition.patternInstances); expect(saved.composition.propertyTracks).toEqual(layerManagementRecord.composition.propertyTracks)
  expect(saved.composition.groupOccurrences).toEqual(layerManagementRecord.composition.groupOccurrences.map((occurrence: { layerBindings: Array<{ definitionLayerId: string; layerId: string }> }) => ({ ...occurrence, layerBindings: occurrence.layerBindings.map(binding => ({ ...binding, layerId: addedId })) })))
  return { route, editor, stage, saved, readWrites: () => writes }
}
