import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

export const transitionRouteFixture = JSON.parse(readFileSync(new URL('./showV2Transitions.json', import.meta.url), 'utf8'))
const JUNCTION = 'participant:3000:zone:layer:zone:overlay:1:verse-a:verse-b'

type Region = ReturnType<Page['getByTestId']>

/**
 * Insert, change kind, resize and Reset one Transition through the real route.
 * Each save is read back from the provider before the next visible action.
 */
export async function exerciseShowV2Transitions(
  page: Page,
  onReady?: (context: { route: Region; editor: Region; stage: Region }) => Promise<void>,
) {
  const { record, legacy, patterns } = transitionRouteFixture
  for (const [resource, value] of [...patterns.map((pattern: object) => ['patterns', pattern]), ['shows', legacy]] as [string, object][]) {
    const created = await page.request.post(`/api/${resource}`, { data: value })
    expect(created.ok(), await created.text()).toBe(true)
  }
  const seeded = await page.request.put(`/api/shows/${record.id}?show-version=2`, { data: record })
  expect(seeded.ok(), await seeded.text()).toBe(true)

  let writes = 0, settled = 0
  const matches = (url: string) => url.includes(`/api/shows/${record.id}?show-version=2`)
  page.on('request', request => { if (request.method() === 'PUT' && matches(request.url())) writes++ })
  page.on('response', response => { if (response.request().method() === 'PUT' && matches(response.url()) && response.ok()) settled++ })
  await page.goto(`studio/shows/${record.id}?show-v2-pilot=1&capture`)
  const unpin = page.getByRole('button', { name: 'Unpin Shows list', exact: true })
  if (await unpin.count()) await unpin.click()
  const close = page.getByRole('button', { name: 'Close Shows list', exact: true })
  if (await close.count()) await close.click()

  const route = page.getByTestId('show-v2-route-pilot')
  const editor = route.getByTestId('show-v2-transitions')
  const stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible()
  const persisted = async () => {
    const response = await page.request.get('/api/shows?show-version=2')
    expect(response.ok()).toBe(true)
    return (await response.json()).shows.find((show: { id: string }) => show.id === record.id)
  }
  const waitSave = async (count: number) => { await expect.poll(() => settled).toBe(count); expect(writes).toBe(count) }
  const clipStart = (saved: { composition: { clips: { id: string; startMs: number }[] } }, id: string) => saved.composition.clips.find(clip => clip.id === id)!.startMs

  // A Fade over the spanning Main Clip is a bounded compiler refusal, not a save.
  await editor.getByLabel('Cut junction', { exact: true }).selectOption(JUNCTION)
  await editor.getByLabel('Transition kind', { exact: true }).selectOption('transition:fade:through-color')
  await editor.getByRole('button', { name: 'Insert Transition', exact: true }).click()
  await expect(route).toContainText('RL08')
  expect(writes).toBe(0)
  expect((await persisted()).composition.transitions).toEqual([])

  await editor.getByLabel('Transition kind', { exact: true }).selectOption('transition:blend:crossfade')
  await editor.getByLabel('Crossfade policy', { exact: true }).selectOption('snapshot-live')
  const duration = editor.getByLabel('New Transition duration', { exact: true })
  await duration.fill('1500'); await duration.press('Enter')
  await editor.getByRole('button', { name: 'Insert Transition', exact: true }).click()
  await waitSave(1)
  let saved = await persisted()
  expect(saved.composition.transitions).toHaveLength(1)
  const transitionId = saved.composition.transitions[0].id
  expect(saved.composition.transitions[0]).toMatchObject({ kind: 'crossfade', crossfadePolicy: 'snapshot-live', durationMs: 1500 })
  expect(clipStart(saved, 'verse-b')).toBe(4500)
  expect(clipStart(saved, 'clip')).toBe(0)
  expect(saved.composition.propertyTracks).toEqual(record.composition.propertyTracks)
  expect(saved.composition.patternInstances).toEqual(record.composition.patternInstances)
  await expect(editor.getByLabel('Transition', { exact: true })).toHaveValue(transitionId)
  await expect(editor.getByLabel('Cut junction', { exact: true })).toHaveValue('')

  // Settings keep identity, endpoints, duration and every Clip time.
  await editor.getByLabel('Transition kind', { exact: true }).selectOption('transition:wipe:linear')
  await editor.getByRole('button', { name: 'Apply settings', exact: true }).click()
  await waitSave(2)
  saved = await persisted()
  expect(saved.composition.transitions[0]).toMatchObject({ id: transitionId, kind: 'wipe', wipeVariant: 'linear', durationMs: 1500 })
  expect(saved.composition.transitions[0].participants).toHaveLength(1)
  expect(clipStart(saved, 'verse-b')).toBe(4500)

  // The existing resize control still owns duration on the same identity.
  const resize = route.getByLabel('Transition duration', { exact: true })
  await resize.fill('1000'); await resize.press('Enter')
  await waitSave(3)
  saved = await persisted()
  expect(saved.composition.transitions[0]).toMatchObject({ id: transitionId, durationMs: 1000 })
  expect(clipStart(saved, 'verse-b')).toBe(4000)

  await route.getByRole('button', { name: 'Undo', exact: true }).click(); await waitSave(4)
  expect((await persisted()).composition.transitions[0].durationMs).toBe(1500)
  await route.getByRole('button', { name: 'Redo', exact: true }).click(); await waitSave(5)
  expect((await persisted()).composition.transitions[0].durationMs).toBe(1000)

  if (onReady) await onReady({ route, editor, stage })

  // Reset to Cut removes the record and moves the incoming contributor back.
  await editor.getByLabel('Transition', { exact: true }).selectOption(transitionId)
  await editor.getByRole('button', { name: 'Reset to Cut', exact: true }).click()
  await waitSave(6)
  saved = await persisted()
  expect(saved.composition.transitions).toEqual([])
  expect(clipStart(saved, 'verse-b')).toBe(3000)
  expect(saved.composition.clips).toEqual(record.composition.clips)
  await expect(editor.getByLabel('Transition', { exact: true })).toHaveValue('')
  await expect(route.getByLabel('Transition duration', { exact: true })).toHaveCount(0)

  await route.getByRole('button', { name: 'Reload saved v2', exact: true }).click()
  await expect(route).toContainText('Reloaded v2 bytes from the provider.')
  await page.reload()
  await expect(stage).toBeVisible()
  await route.getByRole('button', { name: 'Reopen artifacts', exact: true }).click()
  await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  expect(writes).toBe(6)
  return { route, editor, stage, saved: await persisted(), readWrites: () => writes }
}
