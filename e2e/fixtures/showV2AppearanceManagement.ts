import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
export const appearanceManagementRecord = JSON.parse(readFileSync(new URL('./showV2AppearanceManagement.json', import.meta.url), 'utf8'))
export const appearanceManagementPattern = { id: 'appearance-voice', name: 'Appearance Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(.375+x/4,.25+y/4,.625+elapsed/50000)}', controls: {}, updatedAt: 1 }
export const appearanceManagementMap = { id: 'appearance-management-map', name: 'Appearance Grid', dim: 2, generator: 'custom', params: {}, points: Array.from({ length: 256 }, (_, i) => [(i % 16) / 15, Math.floor(i / 16) / 15]), normalizeMode: 'contain', updatedAt: 1 }

export async function exerciseShowV2AppearanceManagement(page: Page) {
  const legacy = convertibleV1Show(); legacy.id = appearanceManagementRecord.id; legacy.name = appearanceManagementRecord.name
  for (const [resource, value] of [['patterns', appearanceManagementPattern], ['maps', appearanceManagementMap], ['shows', legacy]] as const) {
    const response = await page.request.post(`/api/${resource}`, { data: value }); expect(response.ok(), await response.text()).toBe(true)
  }
  const seeded = await page.request.put(`/api/shows/${legacy.id}?show-version=2`, { data: appearanceManagementRecord }); expect(seeded.ok(), await seeded.text()).toBe(true)
  let writes = 0
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${legacy.id}?show-version=2`)) writes++ })
  await page.goto(`studio/shows/${legacy.id}?show-v2-pilot=1&capture`)
  const route = page.getByTestId('show-v2-route-pilot'), stage = page.getByTestId('show-stage-preview')
  const selectClip = async () => route.getByRole('button', { name: 'Appearance Voice · Main / Main · 0–10000 ms', exact: true }).click()
  await expect(stage).toBeVisible(); await expect(stage).toContainText('Appearance Grid'); await selectClip()
  const editor = route.getByRole('region', { name: 'Clip appearance', exact: true })
  const settled = async (count: number) => { await expect(editor.getByRole('button', { name: 'Apply appearance', exact: true })).toBeEnabled(); expect(writes).toBe(count) }
  await expect(editor.getByLabel('Appearance scope')).toHaveValue('')
  await expect(editor.getByRole('button', { name: 'Apply appearance' })).toBeDisabled(); expect(writes).toBe(0)
  await editor.getByLabel('Appearance scope').selectOption('whole-clip')
  await expect(editor.getByLabel('Clip opacity')).toHaveAttribute('placeholder', 'Mixed')
  await editor.getByLabel('View brightness').fill('.6'); expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Apply appearance', exact: true }).click(); await settled(1)
  await editor.getByLabel('Appearance scope').selectOption('selected-time'); await editor.getByLabel('Appearance time').fill('2000')
  await editor.getByLabel('Clip opacity').fill('.7'); await editor.getByRole('button', { name: 'Apply appearance', exact: true }).click(); await settled(2)
  await editor.getByLabel('Appearance time').fill('10000'); await expect(editor.getByRole('button', { name: 'Apply appearance' })).toBeDisabled(); expect(writes).toBe(2)
  await editor.getByLabel('Appearance scope').selectOption('whole-clip')
  await editor.getByLabel('New Effect kind').selectOption('effect:output:hue'); await editor.getByRole('button', { name: 'Add Effect', exact: true }).click(); await settled(3)
  await editor.getByLabel('Selected Effect').selectOption('hue'); await editor.getByLabel('Effect parameter').selectOption('turns'); await editor.getByLabel('Effect value').fill('.3')
  await editor.getByRole('button', { name: 'Apply parameter' }).click(); await settled(4)
  await editor.getByRole('button', { name: 'Duplicate Effect' }).click(); await settled(5)
  const documents = await page.request.get('/api/shows?show-version=2'); expect(documents.ok()).toBe(true)
  const intermediate = (await documents.json()).shows.find((show: { id: string }) => show.id === legacy.id)
  const duplicateId = intermediate.composition.clips[0].appearance.keys[0].value.effects[1].id
  await editor.getByLabel('Effect order target').selectOption(duplicateId); await editor.getByLabel('Effect order edge').selectOption('after')
  await editor.getByRole('button', { name: 'Move Effect' }).click(); await settled(6)
  await route.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible(); expect(writes).toBe(7)
  await route.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible(); expect(writes).toBe(8)
  await route.getByRole('button', { name: 'Reload saved v2' }).click(); await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible(); expect(writes).toBe(8)
  await route.getByRole('button', { name: 'Reopen artifacts' }).click(); await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/); expect(writes).toBe(8)
  const response = await page.request.get('/api/shows?show-version=2'); expect(response.ok()).toBe(true)
  const saved = (await response.json()).shows.find((show: { id: string }) => show.id === legacy.id), keys = saved.composition.clips[0].appearance.keys
  expect(keys.map((key: { timeMs: number }) => key.timeMs)).toEqual([0, 2000, 6000, 9000])
  expect(keys.map((key: { value: { opacity: number } }) => key.value.opacity)).toEqual([.9, .7, .6, .8])
  expect(keys.map((key: { value: { view: unknown } }) => key.value.view)).toEqual(Array(4).fill({ mirror: false, phase: 0, brightness: .6 }))
  expect(keys.map((key: { value: { effects: Array<{ id: string; kind: string; turns: number }> } }) => key.value.effects.map(effect => [effect.kind, effect.turns]))).toEqual(Array(4).fill([['hue', .3], ['hue', .3], ['hue', 0]]))
  expect(keys[0].value.effects[0].id).toBe(duplicateId); expect(keys[0].value.effects[1].id).toBe('hue')
  for (const field of ['patternInstances', 'groupDefinitions', 'groupOccurrences', 'propertyTracks', 'layers', 'transitions']) expect(saved.composition[field]).toEqual(appearanceManagementRecord.composition[field])
  await page.reload(); await expect(stage).toBeVisible(); await selectClip(); await expect(editor.getByLabel('Appearance scope')).toHaveValue(''); expect(writes).toBe(8)
  await editor.getByLabel('Appearance scope').selectOption('whole-clip')
  await editor.getByLabel('Selected Effect').selectOption('hue'); await editor.getByLabel('Effect parameter').selectOption('turns')
  await expect(editor.getByLabel('Effect value')).toHaveValue('0.3')
  return { route, editor, stage, saved, readWrites: () => writes }
}
