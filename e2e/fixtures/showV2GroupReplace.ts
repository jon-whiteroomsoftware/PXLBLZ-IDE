import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'

export const groupReplaceRecord: ShowRecordV2 = JSON.parse(readFileSync(new URL('./showV2GroupReplace.json', import.meta.url), 'utf8'))
export const groupReplacePatterns = [
  { id: 'replacement-voice', name: 'Replacement Voice', src: 'export var elapsed=0;export var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(gain,.1+.6*x,.1+.6*y)}', controls: {}, updatedAt: 1 },
  { id: 'replacement-other', name: 'Replacement Other', src: 'export var elapsed=0;export var gain=.9;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(.1+.6*x,.1+.6*y,gain)}', controls: {}, updatedAt: 1 },
]
const instanceOf = (record: ShowRecordV2, id: string) => record.composition.patternInstances.find(instance => instance.id === id)
const definitionOf = (record: ShowRecordV2, id: string) => record.composition.groupDefinitions.find(definition => definition.id === id)!

export async function exerciseShowV2GroupReplace(page: Page) {
  const legacy = convertibleV1Show()
  legacy.id = groupReplaceRecord.id
  legacy.name = groupReplaceRecord.name
  for (const pattern of groupReplacePatterns) {
    const response = await page.request.post('/api/patterns', { data: pattern })
    expect(response.ok(), await response.text()).toBe(true)
  }
  const seededLegacy = await page.request.post('/api/shows', { data: legacy })
  expect(seededLegacy.ok(), await seededLegacy.text()).toBe(true)
  const seeded = await page.request.put(`/api/shows/${legacy.id}?show-version=2`, { data: groupReplaceRecord })
  expect(seeded.ok(), await seeded.text()).toBe(true)

  let writes = 0, settled = 0
  const matches = (url: string) => url.includes(`/api/shows/${legacy.id}?show-version=2`)
  page.on('request', request => { if (request.method() === 'PUT' && matches(request.url())) writes++ })
  page.on('response', response => { if (response.request().method() === 'PUT' && matches(response.url()) && response.ok()) settled++ })
  await page.goto(`studio/shows/${legacy.id}?show-v2-pilot=1&capture`)

  const route = page.getByTestId('show-v2-route-pilot'), stage = page.getByTestId('show-stage-preview')
  const panel = route.getByRole('region', { name: 'Replace Group Pattern', exact: true })
  const groups = route.getByRole('region', { name: 'Group occurrences', exact: true })
  const replace = panel.getByRole('button', { name: 'Replace Group Pattern', exact: true })
  const confirm = panel.getByRole('button', { name: 'Confirm Group replacement', exact: true })
  const cancel = panel.getByRole('button', { name: 'Cancel Group replacement', exact: true })
  await expect(stage).toBeVisible()
  await expect(panel).toBeVisible()
  await expect(replace).toBeDisabled()

  const readSaved = async (): Promise<ShowRecordV2> => {
    const response = await page.request.get('/api/shows?show-version=2')
    expect(response.ok()).toBe(true)
    return (await response.json()).shows.find((row: ShowRecordV2) => row.id === legacy.id)
  }
  const target = async (value: string) => { await panel.getByRole('combobox', { name: 'Group Clip', exact: true }).selectOption(value) }
  const choose = async (name: string) => {
    const input = panel.getByRole('combobox', { name: 'Replacement Group Pattern' })
    await input.click(); await input.fill(name)
    await page.getByRole('option', { name, exact: true }).click()
  }
  const runWrite = async (button: Locator, count: number, predicate: (record: ShowRecordV2) => boolean, status: string) => {
    const responsePromise = page.waitForResponse(response => response.request().method() === 'PUT' && matches(response.url()))
    await button.click()
    const response = await responsePromise
    expect(response.ok(), await response.text()).toBe(true)
    await expect.poll(() => writes).toBe(count)
    await expect.poll(() => settled).toBe(count)
    await expect.poll(async () => predicate(await readSaved())).toBe(true)
    await expect(route.getByText(status, { exact: true })).toBeVisible()
  }

  // 1. Dormant definition: local template only, no runtime created or changed.
  await target('dormant:dormant-child')
  await expect(panel).toContainText('This Group has no occurrences.')
  await choose('Replacement Other')
  await replace.click()
  await expect(confirm).toBeVisible()
  await expect(panel).toContainText('sliderLost')
  await runWrite(confirm, 1, record => definitionOf(record, 'dormant').patternInstances[0].pattern.id === 'replacement-other', 'Group Pattern replacement saved.')
  const afterDormant = await readSaved()
  expect(afterDormant.composition.patternInstances).toEqual(groupReplaceRecord.composition.patternInstances)
  expect(afterDormant.composition.groupOccurrences).toEqual(groupReplaceRecord.composition.groupOccurrences)
  expect(definitionOf(afterDormant, 'dormant').patternInstances[0].controlTargets).toEqual({ sliderGain: 0.5 })
  expect(definitionOf(afterDormant, 'dormant').clips).toEqual(definitionOf(groupReplaceRecord, 'dormant').clips)

  // 2. Same source is a validated no-op before any write.
  await choose('Replacement Other')
  await replace.click()
  await expect(route.getByText('Group Pattern is unchanged.', { exact: true })).toBeVisible()
  expect(writes).toBe(1)

  // 3. Cancelling the animation-loss confirmation adopts nothing.
  await target('group:child')
  await expect(panel).toContainText('Replacement changes 1 linked occurrence')
  await choose('Replacement Other')
  await replace.click()
  await expect(confirm).toBeVisible()
  await cancel.click()
  await expect(route.getByText('Group Pattern replacement cancelled.', { exact: true })).toBeVisible()
  expect(writes).toBe(1)
  expect(await readSaved()).toEqual(afterDormant)

  // 4. Linked definition replace forks the shared runtime exactly once.
  await replace.click()
  await expect(confirm).toBeVisible()
  await runWrite(confirm, 2, record => definitionOf(record, 'group').patternInstances.length === 2, 'Group Pattern replacement saved.')
  const linked = await readSaved()
  const group = definitionOf(linked, 'group')
  const newSlot = group.patternInstances[1]
  const binding = linked.composition.groupOccurrences.find(occurrence => occurrence.id === 'held-use')!.instanceBindings!
  expect(group.clips[0]).toEqual({ ...definitionOf(groupReplaceRecord, 'group').clips[0], instanceId: newSlot.id })
  expect(group.patternInstances[0]).toEqual(definitionOf(groupReplaceRecord, 'group').patternInstances[0])
  expect(group.propertyTracks).toEqual(definitionOf(groupReplaceRecord, 'group').propertyTracks)
  expect(newSlot).toMatchObject({ patternName: 'Replacement Other', controlTargets: { sliderGain: 0.4 } })
  expect(binding.slot).toBe('instance')
  const forked = binding[newSlot.id]
  expect(forked).not.toBe('instance')
  expect(instanceOf(linked, 'instance')).toEqual(instanceOf(groupReplaceRecord, 'instance'))
  expect(instanceOf(linked, 'solo')).toEqual(instanceOf(groupReplaceRecord, 'solo'))
  expect(instanceOf(linked, forked)).toMatchObject({ pattern: { kind: 'user', id: 'replacement-other' }, controlTargets: { sliderGain: 0.4 } })
  expect(linked.composition.clips).toEqual(groupReplaceRecord.composition.clips)
  expect(linked.composition.transitions).toEqual(groupReplaceRecord.composition.transitions)
  expect(linked.composition.propertyTracks.map(track => 'instanceId' in track.target ? track.target.instanceId : '')).toEqual([forked])
  expect(definitionOf(linked, 'mixed')).toEqual(definitionOf(groupReplaceRecord, 'mixed'))

  // 5. Mixed sole/shared incompatible Group animation refuses atomically.
  await target('mixed:mixed-child')
  await choose('Replacement Other')
  await replace.click()
  await expect(confirm).toBeVisible()
  await confirm.click()
  await expect(route).toContainText('Replacement cannot discard Group "mixed" control tracks')
  expect(writes).toBe(2)
  expect(await readSaved()).toEqual(linked)

  // 6. History replays the linked replacement through the provider.
  await runWrite(route.getByRole('button', { name: 'Undo', exact: true }), 3, record => definitionOf(record, 'group').patternInstances.length === 1, 'Undo saved.')
  await runWrite(route.getByRole('button', { name: 'Redo', exact: true }), 4, record => definitionOf(record, 'group').patternInstances.length === 2, 'Redo saved.')
  expect((await readSaved()).composition).toEqual(linked.composition)

  // 7. Make Group Unique first, then replace only that occurrence's definition.
  // The sole-use runtime is retained and its safely owned local animation prunes.
  await groups.getByRole('combobox', { name: 'Group occurrence', exact: true }).selectOption({ label: 'Mixed Voice · 5000–9000 ms · mixed-sole' })
  await runWrite(groups.getByRole('button', { name: 'Make Group Unique', exact: true }), 5, record => record.composition.groupDefinitions.length === 4, 'Group saved.')
  const unique = await readSaved()
  const uniqueDefinition = unique.composition.groupDefinitions.find(definition => !['group', 'dormant', 'mixed'].includes(definition.id))!
  expect(unique.composition.groupOccurrences.find(occurrence => occurrence.id === 'mixed-sole')!.instanceBindings)
    .toEqual({ [uniqueDefinition.patternInstances[0].id]: 'solo' })
  await target(`${uniqueDefinition.id}:${uniqueDefinition.clips[0].id}`)
  await expect(panel).toContainText('Replacement changes 1 linked occurrence')
  await choose('Replacement Other')
  await replace.click()
  await expect(confirm).toBeVisible()
  await runWrite(confirm, 6, record => instanceOf(record, 'solo')?.pattern.id === 'replacement-other', 'Group Pattern replacement saved.')
  const uniqueReplaced = await readSaved()
  const replacedUnique = uniqueReplaced.composition.groupDefinitions.find(definition => definition.id === uniqueDefinition.id)!
  expect(uniqueReplaced.composition.patternInstances.map(instance => instance.id)).toEqual(unique.composition.patternInstances.map(instance => instance.id))
  expect(instanceOf(uniqueReplaced, 'solo')).toMatchObject({ patternName: 'Replacement Other', controlTargets: { sliderGain: 0.6 } })
  expect(instanceOf(uniqueReplaced, 'instance')).toEqual(instanceOf(groupReplaceRecord, 'instance'))
  expect(replacedUnique.patternInstances.map(slot => slot.id)).toEqual(uniqueDefinition.patternInstances.map(slot => slot.id))
  expect(replacedUnique.propertyTracks).toEqual([])
  expect(definitionOf(uniqueReplaced, 'mixed')).toEqual(definitionOf(unique, 'mixed'))
  expect(uniqueReplaced.composition.groupDefinitions.find(definition => definition.id === 'group')).toEqual(definitionOf(unique, 'group'))
  expect(uniqueReplaced.composition.clips).toEqual(groupReplaceRecord.composition.clips)

  // 8. Saved bytes, cold reload and native artifacts reopen with the same content.
  await route.getByRole('button', { name: 'Reload saved v2', exact: true }).click()
  await expect(route).toContainText('Reloaded v2 bytes from the provider.')
  await page.reload()
  await expect(stage).toBeVisible()
  expect((await readSaved()).composition).toEqual(uniqueReplaced.composition)
  await route.getByRole('button', { name: 'Reopen artifacts', exact: true }).click()
  await expect(route).toContainText('Reopened .pxlshow v2 and .epe')
  expect(writes).toBe(6)
  return { route, stage, panel, saved: await readSaved(), readWrites: () => writes }
}
