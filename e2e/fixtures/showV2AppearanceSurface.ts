import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
import { appearanceManagementRecord, appearanceManagementPattern, appearanceManagementMap } from './showV2AppearanceManagement'

const showId = 'appearance-surface-synthetic'
/** The management record plus one Clip-owned Effect track, so removal has a cascade to prove. */
export function appearanceSurfaceRecord() {
  const record = structuredClone(appearanceManagementRecord)
  record.id = showId
  record.name = 'Appearance Surface'
  record.composition.propertyTracks.push({ id: 'hue-track',
    target: { kind: 'clip-effect', clipId: 'voice', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' },
    activeStartMs: 0, activeDurationMs: 9000,
    keyframes: [{ id: 'hue-first', timeMs: 0, value: 0, easing: { curve: 'sine', direction: 'in-out' } },
      { id: 'hue-last', timeMs: 9000, value: .4, easing: { curve: 'linear' } }] })
  return record
}

export async function exerciseShowV2AppearanceSurface(page: Page) {
  const record = appearanceSurfaceRecord()
  const legacy = convertibleV1Show(); legacy.id = showId; legacy.name = record.name
  for (const [resource, value] of [['patterns', appearanceManagementPattern], ['maps', appearanceManagementMap], ['shows', legacy]] as const) {
    const response = await page.request.post(`/api/${resource}`, { data: value }); expect(response.ok(), await response.text()).toBe(true)
  }
  const seeded = await page.request.put(`/api/shows/${showId}?show-version=2`, { data: record }); expect(seeded.ok(), await seeded.text()).toBe(true)
  let writes = 0
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${showId}?show-version=2`)) writes++ })
  await page.goto(`studio/shows/${showId}?show-v2-pilot=1&capture`)
  const route = page.getByTestId('show-v2-route-pilot'), stage = page.getByTestId('show-stage-preview')
  const selectClip = async () => route.getByRole('button', { name: 'Appearance Voice · Main / Main · 0–10000 ms', exact: true }).click()
  await expect(stage).toBeVisible(); await expect(stage).toContainText('Appearance Grid'); await selectClip()
  const editor = route.getByRole('region', { name: 'Clip appearance', exact: true })
  const saved = async () => {
    const response = await page.request.get('/api/shows?show-version=2'); expect(response.ok()).toBe(true)
    return (await response.json()).shows.find((show: { id: string }) => show.id === showId)
  }
  const settled = async (count: number) => { await expect(editor.getByRole('button', { name: 'Apply appearance', exact: true })).toBeEnabled(); expect(writes).toBe(count) }

  // Optional held components: only dirty fields enter one patch.
  await editor.getByLabel('Appearance scope').selectOption('whole-clip')
  await expect(editor.getByLabel('Transform position X')).toHaveValue('')
  await expect(editor.getByLabel('Presentation mode')).toHaveValue('')
  for (const [label, value] of [['Transform position X', '.1'], ['Transform scale Y', '1.2'], ['Aperture x', '.05'],
    ['Aperture width', '.8'], ['Aperture feather', '.2'], ['Blink rate', '2'], ['Blink duty', '.6'], ['Blink phase', '.1']] as const) {
    await editor.getByLabel(label).fill(value)
  }
  await editor.getByLabel('Aperture enabled').selectOption('true')
  await editor.getByLabel('Aperture shape').selectOption('ellipse')
  await editor.getByLabel('Presentation mode').selectOption('live')
  expect(writes).toBe(0)
  await editor.getByRole('button', { name: 'Apply appearance', exact: true }).click(); await settled(1)
  const applied = await saved()
  expect(applied.composition.clips[0].appearance.keys.map((key: { value: { transform: unknown } }) => key.value.transform))
    .toEqual(Array(3).fill({ positionX: .1, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1.2 }))
  expect(applied.composition.clips[0].appearance.keys[0].value.aperture).toEqual({ enabled: true, x: .05, y: 0, width: .8, height: 1, aperture: 'ellipse', feather: .2 })
  expect(applied.composition.clips[0].appearance.keys[0].value.presentation).toEqual({ mode: 'live' })
  expect(applied.composition.clips[0].appearance.keys[0].value.blink).toEqual({ rateHz: 2, duty: .6, phase: .1 })

  // The existing static-cache compiler restriction refuses atomically with no write.
  await editor.getByLabel('Presentation mode').selectOption('freeze')
  await editor.getByRole('button', { name: 'Apply appearance', exact: true }).click()
  await expect(route.getByText(/Freeze Clip presentation cannot be compiled exactly/)).toBeVisible()
  expect(writes).toBe(1)
  expect((await saved()).composition).toEqual(applied.composition)
  await expect(editor.getByLabel('Presentation mode')).toHaveValue('live')

  // One explicit nested Aperture removal; unrelated components stay authored.
  await editor.getByLabel('Appearance component to clear').selectOption('aperture.feather')
  await editor.getByRole('button', { name: 'Clear component', exact: true }).click(); await settled(2)
  const cleared = await saved()
  expect(cleared.composition.clips[0].appearance.keys[0].value.aperture).toEqual({ enabled: true, x: .05, y: 0, width: .8, height: 1, aperture: 'ellipse' })
  expect(cleared.composition.clips[0].appearance.keys[0].value.blink).toEqual({ rateHz: 2, duty: .6, phase: .1 })

  // Selected time holds one interior key without touching its neighbours.
  await editor.getByLabel('Appearance scope').selectOption('selected-time')
  await editor.getByLabel('Appearance time').fill('3000')
  await editor.getByLabel('Aperture width').fill('.4')
  await editor.getByRole('button', { name: 'Apply appearance', exact: true }).click(); await settled(3)
  const interior = await saved()
  expect(interior.composition.clips[0].appearance.keys.map((key: { timeMs: number }) => key.timeMs)).toEqual([0, 3000, 6000, 9000])
  expect(interior.composition.clips[0].appearance.keys.map((key: { value: { aperture: { width: number } } }) => key.value.aperture.width)).toEqual([.8, .4, .8, .8])

  // Effect removal takes exactly its Clip-owned track.
  await editor.getByLabel('Appearance scope').selectOption('whole-clip')
  await editor.getByLabel('Selected Effect').selectOption('hue')
  await editor.getByRole('button', { name: 'Remove Effect', exact: true }).click(); await settled(4)
  const removed = await saved()
  expect(removed.composition.clips[0].appearance.keys.map((key: { value: { effects: unknown[] } }) => key.value.effects)).toEqual([[], [], [], []])
  expect(removed.composition.propertyTracks.map((track: { id: string }) => track.id)).toEqual(['clock'])
  expect(removed.composition.groupDefinitions).toEqual(record.composition.groupDefinitions)
  expect(removed.composition.patternInstances).toEqual(record.composition.patternInstances)

  await route.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible(); expect(writes).toBe(5)
  const undone = await saved()
  expect(undone.composition.propertyTracks.map((track: { id: string }) => track.id)).toEqual(['clock', 'hue-track'])
  expect(undone.composition.clips[0].appearance.keys[0].value.effects).toEqual(record.composition.clips[0].appearance.keys[0].value.effects)
  await route.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible(); expect(writes).toBe(6)
  await route.getByRole('button', { name: 'Reload saved v2' }).click(); await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible(); expect(writes).toBe(6)
  await route.getByRole('button', { name: 'Reopen artifacts' }).click(); await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/); expect(writes).toBe(6)

  // Cold reopen: authored optional components and the removal survive.
  await page.reload(); await expect(stage).toBeVisible(); await selectClip()
  await expect(editor.getByLabel('Appearance scope')).toHaveValue(''); expect(writes).toBe(6)
  await editor.getByLabel('Appearance scope').selectOption('whole-clip')
  await expect(editor.getByLabel('Transform scale Y')).toHaveValue('1.2')
  await expect(editor.getByLabel('Aperture shape')).toHaveValue('ellipse')
  await expect(editor.getByLabel('Aperture feather')).toHaveValue('')
  await expect(editor.getByLabel('Aperture width')).toHaveAttribute('placeholder', 'Mixed')
  await expect(editor.getByLabel('Presentation mode')).toHaveValue('live')
  await expect(editor.getByLabel('Selected Effect')).toHaveValue('')
  return { route, editor, stage, readWrites: () => writes }
}
