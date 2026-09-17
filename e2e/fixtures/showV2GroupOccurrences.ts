import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
export const groupOccurrenceFixture = JSON.parse(readFileSync(new URL('./showV2GroupOccurrences.json', import.meta.url), 'utf8'))
/** All actions use existing visible controls and the one checked adoption/save queue. */
export async function exerciseShowV2GroupOccurrences(page: Page, onReady?: (context: { route: ReturnType<Page['getByTestId']>; editor: ReturnType<Page['getByTestId']>; stage: ReturnType<Page['getByTestId']>; readWrites: () => number }) => Promise<void>) {
  const { record, legacy, patterns } = groupOccurrenceFixture
  for (const [resource, value] of [...patterns.map((pattern: object) => ['patterns', pattern]), ['shows', legacy]] as [string, object][]) {
    const response = await page.request.post(`/api/${resource}`, { data: value }); expect(response.ok(), await response.text()).toBe(true)
  }
  const seeded = await page.request.put(`/api/shows/${record.id}?show-version=2`, { data: record }); expect(seeded.ok(), await seeded.text()).toBe(true)
  let writes = 0, settled = 0
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${record.id}?show-version=2`)) writes++ })
  page.on('response', response => { if (response.request().method() === 'PUT' && response.url().includes(`/api/shows/${record.id}?show-version=2`) && response.ok()) settled++ })
  await page.goto(`studio/shows/${record.id}?show-v2-editor=1&capture`)
  const unpin = page.getByRole('button', { name: 'Unpin Shows list', exact: true }); if (await unpin.count()) await unpin.click()
  const close = page.getByRole('button', { name: 'Close Shows list', exact: true }); if (await close.count()) await close.click()
  const route = page.getByTestId('show-editor-v2-route'), editor = route.getByRole('region', { name: 'Group occurrences', exact: true }), stage = page.getByTestId('show-stage-preview')
  const persisted = async () => { const response = await page.request.get('/api/shows?show-version=2'); expect(response.ok()).toBe(true); return (await response.json()).shows.find((show: { id: string }) => show.id === record.id) }
  const waitSave = async (count: number) => { await expect.poll(() => settled).toBe(count); expect(writes).toBe(count) }
  const applyStart = async (time: string) => { const field = editor.getByLabel('Group start (ms)', { exact: true }); await field.fill(time); await field.press('Enter') }
  await expect(stage).toBeVisible()
  const timing = route.getByTestId('show-v2-show-timing')
  await timing.getByLabel('Insert Time at (ms)', { exact: true }).fill('5000'); await timing.getByLabel('Insert Time at (ms)', { exact: true }).press('Enter')
  await timing.getByLabel('Insert Time duration (ms)', { exact: true }).fill('1000'); await timing.getByLabel('Insert Time duration (ms)', { exact: true }).press('Enter')
  await timing.getByRole('button', { name: 'Insert Time', exact: true }).click(); await waitSave(1)
  const initial = record.composition.groupOccurrences[0].id
  await editor.getByLabel('Group occurrence', { exact: true }).selectOption(initial)
  await expect(editor).toContainText('2000–7000 ms · 1000 ms held')
  const originalBinding = (await persisted()).composition.groupOccurrences[0].layerBindings[0].layerId
  const destination = editor.locator('select[aria-label^="Group Layer "]')
  await destination.selectOption(''); await editor.getByRole('button', { name: 'Move Group', exact: true }).click()
  await expect(route).toContainText('Every Group occurrence Layer binding must target an existing Layer'); expect(writes).toBe(1)
  await destination.selectOption(originalBinding)
  await applyStart('9000'); await editor.getByRole('button', { name: 'Move Group', exact: true }).click(); await waitSave(2)
  await expect(editor.getByLabel('Group occurrence', { exact: true })).toHaveValue(initial)
  await applyStart('17000'); await editor.getByRole('button', { name: 'Duplicate Group', exact: true }).click(); await waitSave(3)
  let saved = await persisted(); const copied = saved.composition.groupOccurrences.find((value: { id: string }) => value.id !== initial)
  expect(copied).toMatchObject({ startMs: 17000, layoutOccurrenceId: 'later-layout', holds: saved.composition.groupOccurrences[0].holds })
  expect(Object.values(copied.instanceBindings)).toEqual(['instance']); await expect(editor.getByLabel('Group occurrence', { exact: true })).toHaveValue(copied.id)
  await editor.getByRole('button', { name: 'Make Group Unique', exact: true }).click(); await waitSave(4)
  saved = await persisted(); expect(saved.composition.groupDefinitions).toHaveLength(2)
  expect(saved.composition.groupOccurrences[0].definitionId).not.toBe(saved.composition.groupOccurrences[1].definitionId)
  expect(saved.composition.patternInstances).toEqual(record.composition.patternInstances)
  await editor.getByRole('button', { name: 'Ungroup', exact: true }).click(); await waitSave(5)
  saved = await persisted(); expect(saved.composition.groupOccurrences.map((value: { id: string }) => value.id)).toEqual([initial]); expect(saved.composition.clips).toHaveLength(2)
  expect(saved.composition.clips.map((value: { instanceId: string }) => value.instanceId)).toEqual(['instance', 'instance'])
  await editor.getByLabel('Group occurrence', { exact: true }).selectOption(initial)
  await route.getByRole('button', { name: 'Reopen artifacts', exact: true }).click(); await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  if (onReady) await onReady({ route, editor, stage, readWrites: () => writes })
  await route.getByRole('group', { name: 'Show history' }).getByRole('button', { name: 'Undo', exact: true }).click(); await waitSave(6)
  saved = await persisted(); expect(saved.composition.clips).toEqual([]); expect(saved.composition.groupOccurrences).toHaveLength(2)
  await editor.getByLabel('Group occurrence', { exact: true }).selectOption(copied.id)
  await editor.getByRole('button', { name: 'Delete Group', exact: true }).click(); await waitSave(7)
  await editor.getByLabel('Group occurrence', { exact: true }).selectOption(initial)
  await editor.getByRole('button', { name: 'Delete Group', exact: true }).click(); await waitSave(8)
  saved = await persisted(); expect(saved.composition.clips).toEqual([]); expect(saved.composition.groupOccurrences).toEqual([])
  expect(saved.composition.patternInstances).toEqual(record.composition.patternInstances); expect(saved.composition.groupDefinitions).toHaveLength(2)
  await expect(route.getByRole('button', { name: 'Reopen artifacts', exact: true })).toBeDisabled()
  await expect(stage).toBeHidden()
  await route.getByRole('group', { name: 'Show history' }).getByRole('button', { name: 'Undo', exact: true }).click(); await waitSave(9); await expect(stage).toBeVisible()
  await route.getByRole('group', { name: 'Show history' }).getByRole('button', { name: 'Redo', exact: true }).click(); await waitSave(10); await expect(stage).toBeHidden()
  await route.getByRole('button', { name: 'Reload saved v2', exact: true }).click(); await expect(route).toContainText('Reloaded v2 bytes from the provider.')
  await page.reload(); await expect(editor.getByLabel('Group occurrence', { exact: true })).toHaveValue('')
  await expect(route.getByRole('button', { name: 'Reopen artifacts', exact: true })).toBeDisabled(); expect(writes).toBe(10)
  saved = await persisted(); expect(saved.composition.showEndMs).toBe(31000)
  expect(saved.composition.layoutOccurrences.map((value: { startMs: number; durationMs: number }) => [value.startMs, value.durationMs])).toEqual([[0, 17000], [17000, 14000]])
  return { route, editor, stage, saved, readWrites: () => writes }
}
