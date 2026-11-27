import { mkdir } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import { artifactHash } from '../src/engine/artifactStamp'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import { controllerProfileArtifactSignature } from '../src/engine/controllerProfilePassRecipe'
import type { ControllerPushRecord, ControllerPushRecords } from '../src/engine/controllerPushRecord'
import {
  WRAPPER_TAG_LABELS,
  describeWrapperTags,
  formatWrapperSkipReason,
  savedRowDomId,
  type WrapperTagModel,
} from '../src/engine/controllerWrapperTags'
import { encodePbp } from '../src/engine/pbpEncode'
import { expect, test } from './fixtures/authenticated'
import { fakeControllerMutations } from './fixtures/controllerBulkSelect'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'

// #1277 slice 1277a1: saved-row tags against the stored push record and the
// stored program source on the fake Controller transport.
const ip = '192.168.8.231'
const pixelCount = 64
const speedControl = 'sliderSpeedForTheEntireInstallationAcrossTheLongestMappedSegment'
const profile: ControllerProfile = {
  id: 'wrapper-tags-1277',
  name: 'Tags test Controller',
  deviceId: 'pixelblaze_pb32_775544332211',
  lastSeenIp: ip,
  lastKnownPixelCount: pixelCount,
  board: { kind: 'pixelblaze-v3-standard' },
  inputs: [
    { id: 'speed-knob', name: 'Speed knob', pin: 36, signal: 'analog', smoothing: 0, fallback: 0, invert: false },
    { id: 'dimmer', name: 'Dimmer', pin: 39, signal: 'analog', smoothing: 0, fallback: 0, invert: false },
  ],
  globalTransforms: [
    { id: 'power-cap', mixinId: 'builtin:power-cap', type: 'power-cap', enabled: true, mode: 'direct', maxDuty: 0.25 },
    { id: 'brightness', mixinId: 'builtin:hardware-brightness', type: 'hardware-brightness', enabled: true, inputId: 'dimmer', mode: 'multiply-output' },
  ],
  patternBindings: [
    { id: 'speed-binding', patternId: 'tags-fits', inputId: 'speed-knob', target: { kind: 'call-exported-slider', name: speedControl } },
  ],
  updatedAt: 1,
}
type Fixture = { id: string; name: string; binding: string | null; source: string; studio: boolean; record?: Partial<ControllerPushRecord> | null }
const render = 'export function render(i) { rgb(0.9, i/pixelCount, 0.2) }'
const fixtures: Fixture[] = [
  { id: 'pxbTagsFits000001', name: 'Fits', binding: 'tags-fits', studio: true, source: `export function ${speedControl}(v) {}\n${render}` },
  { id: 'pxbTagsMemory0001', name: 'Memory heavy', binding: 'tags-memory', studio: true, source: `var large = array(9700)\nexport function render(i) { rgb(0, 0, large[0]) }` },
  { id: 'pxbTagsNameTaken1', name: 'Name taken', binding: 'tags-name', studio: true, source: `export function sliderSlowMo(v) {}\n${render}` },
  { id: 'pxbTagsShow000001', name: 'Fixture Show', binding: 'show:tags-show', studio: false, source: render, record: {
    transforms: ['power-cap', 'hardware-brightness'],
    wrapperOutcome: { applied: ['slow-mo'], skipped: { dreamy: { reason: 'control-name-taken', message: 'stray' } } },
    wrapperProgramId: 'pxbTagsShow000001',
  } },
  { id: 'pxbTagsAbsent0001', name: 'Absent outcome', binding: 'tags-absent', studio: false, source: render, record: {} },
  { id: 'pxbTagsEmpty00001', name: 'Empty outcome', binding: 'tags-empty', studio: false, source: render, record: {
    wrapperOutcome: { applied: [], skipped: {} }, wrapperProgramId: 'pxbTagsEmpty00001',
  } },
  { id: 'pxbTagsForeign001', name: 'Foreign', binding: null, studio: false, source: render },
]
const owned = fixtures.filter((fixture) => fixture.binding)

async function seed(page: Page, inventory = fixtures, seededProfile = profile, activeProgramId = inventory.at(-1)!.id) {
  const request = page.context().request
  await installFakeControllerHelper(page, {
    address: ip, programs: inventory.map(({ id, name }) => ({ id, name })), activeProgramId,
    deviceName: seededProfile.name, boardType: 'pb32', mac: '11:22:33:44:55:77', pixelCount,
    savedProgramData: Object.fromEntries(inventory.map(({ id, name, source }) => [
      id, Buffer.from(encodePbp({ id, name, sourceCode: source, byteCode: new Uint8Array(8) })).toString('base64'),
    ])),
    trackSavedPrograms: true,
  })
  expect((await request.post('/api/controllers', { data: seededProfile })).ok()).toBe(true)
  for (const { binding, name, source } of inventory.filter((fixture) => fixture.studio)) {
    expect((await request.post('/api/patterns', { data: { id: binding, name, src: source, controls: {}, updatedAt: 1 } })).ok()).toBe(true)
  }
  const managed = inventory.filter((fixture) => fixture.binding)
  const bindings = Object.fromEntries(managed.map(({ id, binding }) => [binding, id]))
  const pushRecords: Record<string, ControllerPushRecord> = Object.fromEntries(managed.filter(({ record }) => record !== null).map(({ binding, name, source, record }) => [binding, {
    name, transforms: [], artifactHash: artifactHash(source), sourceHash: artifactHash(source),
    profileSignature: controllerProfileArtifactSignature(seededProfile, binding, { mapDim: null }),
    stampedAt: '2026-11-26T00:00:00.000Z',
    ...record,
  }]))
  for (const [key, value] of Object.entries({ 'controller-bindings': bindings, 'controller-push-records': pushRecords })) {
    expect((await request.put(`/api/controller-metadata/${key}`, { data: { value: { [ip]: value } } })).ok()).toBe(true)
  }
  await page.goto(`studio/controllers/${seededProfile.id}`)
  await expect(page.getByTestId('controller-saved-programs-pane')).toBeVisible()
  await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
  await page.getByTestId('controller-go').click()
  await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
  return pushRecords
}

const tagText = (tag: WrapperTagModel) => tag.wrapper === 'binding' ? tag.label : WRAPPER_TAG_LABELS[tag.wrapper]
const exports = (source: string | undefined, name: string) => source?.split(`export function ${name}`).length ?? 1

test('Saved-row Wrapper tags agree with stored records and sources (#1277)', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seed(page)

  await page.evaluate(async (profileId) => {
    const storePath = new URL('/PXLBLZ-IDE/src/store/controllerProfileStore.ts', location.origin).href
    const { useControllerProfileStore } = await import(/* @vite-ignore */ storePath) as typeof import('../src/store/controllerProfileStore')
    await useControllerProfileStore.getState().setWrapperEnabled(profileId, 'slow-mo', true)
    await useControllerProfileStore.getState().setWrapperEnabled(profileId, 'dreamy', true)
    const path = new URL('/PXLBLZ-IDE/src/store/controllerStore.ts', location.origin).href
    const { useControllerStore } = await import(/* @vite-ignore */ path) as typeof import('../src/store/controllerStore')
    await useControllerStore.getState().reconcileControllerProfile(profileId)
  }, profile.id)

  const records = async () => {
    const response = await page.context().request.get('/api/controller-metadata/controller-push-records')
    expect(response.ok()).toBe(true)
    return (await response.json() as { value: ControllerPushRecords }).value[ip]
  }
  await expect.poll(async () => (await records())['tags-memory']?.wrapperOutcome?.skipped).not.toEqual(undefined)
  const stored = await records()
  const sources = await page.evaluate(async (ids) => {
    const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
    const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
    return Promise.all(ids.map(async (id) => (await getControllerProvider().readSavedProgram(id))?.sourceCode))
  }, fixtures.map(({ id }) => id))
  const sourceOf = (id: string) => sources[fixtures.findIndex((fixture) => fixture.id === id)]

  const pane = page.getByTestId('controller-saved-programs-pane')
  const rowTags = (id: string) => pane.locator(`#${savedRowDomId(id)} td`).nth(1).locator('> span > span')
  const expectedTags: Record<string, WrapperTagModel[]> = {}
  for (const { id, binding, source } of owned) {
    const expected = describeWrapperTags({ record: stored[binding!], programId: id, kind: binding!.startsWith('show:') ? 'show' : 'pattern' })
    expectedTags[id] = expected
    // Each tag's own label; a greyed tag's hidden reason is its child tooltip.
    await expect.poll(() => rowTags(id).evaluateAll((tags) => tags.map((tag) => tag.firstChild?.textContent)))
      .toEqual(expected.map(tagText))
    // An applied timing tag means the stored bytes gained the Wrapper's Control;
    // a greyed or missing tag means they did not.
    for (const [wrapper, control] of [['slow-mo', 'sliderSlowMo'], ['dreamy', 'sliderDreamy']] as const) {
      const applied = expected.some((tag) => tag.wrapper === wrapper && tag.state === 'applied')
      expect(exports(sourceOf(id), control) - exports(source, control), `${id} ${wrapper}`).toBe(applied ? 1 : 0)
    }
  }
  // Named cases, independent of the model applied above.
  const texts = (id: string) => expectedTags[id].map(tagText)
  expect(texts('pxbTagsFits000001')).toEqual(['slow-mo', 'dreamy', 'power', 'bright', `IO36 → ${speedControl}`])
  expect(expectedTags.pxbTagsMemory0001.filter((tag) => tag.state === 'skipped').map((tag) => tag.state === 'skipped' && tag.reason))
    .toEqual([expect.stringMatching(/^Skipped: not enough memory\. Needs [\d,]+ array words, [\d,]+ free\.$/)])
  expect(expectedTags.pxbTagsNameTaken1).toContainEqual({ wrapper: 'slow-mo', state: 'skipped', reason: "Skipped: this Pattern's code can't take a Wrapper." })
  expect(texts('pxbTagsShow000001')).toEqual(['power', 'bright'])
  expect(texts('pxbTagsAbsent0001')).toEqual([])
  expect(texts('pxbTagsEmpty00001')).toEqual([])
  expect(sourceOf('pxbTagsForeign001')).toBe(render)

  const skipped = (id: string, wrapper: 'slow-mo' | 'dreamy') => {
    const skip = stored[owned.find((fixture) => fixture.id === id)!.binding!].wrapperOutcome!.skipped[wrapper]!
    return { tag: rowTags(id).filter({ hasText: new RegExp(`^${wrapper}`) }), reason: formatWrapperSkipReason(skip) }
  }
  const memory = skipped('pxbTagsMemory0001', 'dreamy')
  const structural = skipped('pxbTagsNameTaken1', 'slow-mo')
  const tooltip = (tag: Locator) => tag.getByRole('tooltip', { includeHidden: true })
  const proofDir = process.env.PXLBLZ_UI_PROOF_DIR
  if (proofDir) await mkdir(proofDir, { recursive: true })
  const capture = async (name: string, surface: Page | Locator = pane) => {
    const path = proofDir ? `${proofDir}/${name}.png` : testInfo.outputPath(`${name}.png`)
    await surface.screenshot({ path })
  }

  for (const [name, { tag, reason }] of [['memory', memory], ['structural', structural]] as const) {
    await expect(tag).toHaveAttribute('tabindex', '0')
    await expect(tag).toHaveAccessibleDescription(reason)
    await expect(tooltip(tag)).toBeHidden()
    const box = (await tag.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(tooltip(tag)).toBeVisible()
    await expect(tooltip(tag)).toHaveText(reason)
    if (proofDir) await capture(`1277a1-tags-1440-${name}-hover`, page)
    await page.keyboard.press('Escape')
    await expect(tooltip(tag)).toBeHidden()
    await page.mouse.move(0, 0)
    await expect(tooltip(tag)).toBeHidden()
    await tag.focus()
    await expect(tooltip(tag)).toHaveText(reason)
    await page.keyboard.press('Escape')
    await expect(tooltip(tag)).toBeHidden()
    await expect(tag).toBeFocused()
    await tag.blur()
  }
  await memory.tag.focus()
  await capture('1277a1-tags-1440-memory-focus')
  await structural.tag.focus()
  await capture('1277a1-tags-1440-structural-focus')

  // At 640 px and below the Studio context pane, and with it this list, is
  // hidden (src/index.css, phone layout). 641 px is the narrowest width that
  // shows it; 420 px confirms the list is not reachable there at all.
  await page.setViewportSize({ width: 420, height: 900 })
  await expect(pane).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await capture('1277a1-tags-420-page', page)
  await page.setViewportSize({ width: 641, height: 900 })
  await memory.tag.focus()
  await expect(tooltip(memory.tag)).toBeVisible()
  const paneBox = (await pane.boundingBox())!
  const tipBox = (await tooltip(memory.tag).boundingBox())!
  expect(tipBox.x).toBeGreaterThanOrEqual(paneBox.x)
  expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width)
  expect(await pane.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await capture('1277a1-tags-641-memory-focus')
  expect(consoleErrors).toEqual([])
})

test('Saved Patterns picker describes applied Wrappers by saved program ID (#1280)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const name = 'Same-named Pattern with a long display name'
  const firstId = 'pxbPickSame00001'
  const secondId = 'pxbPickSame00002'
  const showId = 'pxbPickShow00001'
  const inventory: Fixture[] = [
    { id: firstId, name, binding: 'picker-first', source: render, studio: false, record: {
      wrapperProgramId: firstId,
      wrapperOutcome: { applied: ['slow-mo'], skipped: { dreamy: { reason: 'array-budget', message: 'Fixture skip' } } },
    } },
    { id: secondId, name, binding: 'picker-second', source: render, studio: false, record: {
      wrapperProgramId: secondId,
      wrapperOutcome: { applied: ['dreamy'], skipped: {} },
    } },
    { id: showId, name: 'Fixture Show', binding: 'show:picker-show', source: render, studio: false, record: {
      transforms: ['power-cap', 'hardware-brightness'],
      wrapperProgramId: showId,
      wrapperOutcome: { applied: ['slow-mo'], skipped: {} },
    } },
    { id: 'pxbPickNone00001', name: 'No saved receipt', binding: 'picker-none', source: render, studio: false, record: null },
    { id: 'pxbPickOther0001', name: 'Other Pattern', binding: null, source: render, studio: false },
  ]
  const records = await seed(page, inventory, { ...profile, globalTransforms: [], patternBindings: [] })
  await page.getByTestId('controller-pill').click()
  const trigger = page.getByRole('button', { name: 'Saved Patterns', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()

  const menu = page.getByRole('listbox', { name: 'Saved Patterns', exact: true })
  const option = (id: string) => menu.getByRole('option').and(menu.locator(`[title$=" · ${id}"]`))
  const first = option(firstId)
  const second = option(secondId)
  const show = option(showId)
  const unrecorded = option('pxbPickNone00001')
  const other = option('pxbPickOther0001')
  await expect(menu.getByText('Saved PXLBLZ Patterns')).toBeVisible()
  await expect(first).toHaveAccessibleDescription('slow-mo')
  await expect(first).toHaveAccessibleName(name)
  await expect(first.getByText('slow-mo', { exact: true })).toBeVisible()
  await expect(first.getByText('dreamy', { exact: true })).toHaveCount(0)
  await expect(first.getByRole('tooltip', { includeHidden: true })).toHaveCount(0)
  await expect(second).toHaveAccessibleName(name)
  await expect(second).toHaveAccessibleDescription('dreamy')
  await expect(second.getByText('dreamy', { exact: true })).toBeVisible()
  await expect(show).toHaveAccessibleName('Fixture Show')
  await expect(show).toHaveAccessibleDescription('power bright')
  await expect(show.getByText('power', { exact: true })).toBeVisible()
  await expect(show.getByText('bright', { exact: true })).toBeVisible()
  await expect(show.getByText('slow-mo', { exact: true })).toHaveCount(0)
  await expect(unrecorded).toHaveText('No saved receipt')
  await expect(other).toHaveText('Other Pattern')

  const proofDir = process.env.PXLBLZ_UI_PROOF_DIR
  if (proofDir) await mkdir(proofDir, { recursive: true })
  const capture = (name: string) => page.screenshot({
    path: proofDir ? `${proofDir}/${name}.png` : testInfo.outputPath(`${name}.png`),
  })
  await capture('1280-picker-wrapper-pills-1440')

  await other.focus()
  await page.keyboard.press('Home')
  await expect(show).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(first).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(second).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()

  const refreshed = {
    ...records,
    'picker-first': { ...records['picker-first'], wrapperOutcome: { applied: ['slow-mo', 'dreamy'], skipped: {} } },
  }
  const response = await page.context().request.put('/api/controller-metadata/controller-push-records', {
    data: { value: { [ip]: refreshed } },
  })
  expect(response.ok()).toBe(true)
  await trigger.press('Enter')
  await expect(first).toHaveAccessibleDescription('slow-mo dreamy')
  await expect(second).toHaveAccessibleDescription('dreamy')
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(second).toBeFocused()
  await capture('1280-picker-wrapper-pills-1440-refreshed')
})

test('Long saved binding labels fit inside the Profile column (#1277)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seed(page)

  const pane = page.getByTestId('controller-saved-programs-pane')
  const row = pane.locator(`#${savedRowDomId('pxbTagsFits000001')}`)
  const profileCell = row.getByRole('cell').nth(1)
  const tag = profileCell.getByText(`IO36 → ${speedControl}`, { exact: true })
  const status = row.getByRole('cell').nth(2).locator('[aria-label]')
  const run = row.getByRole('button', { name: 'Run Fits on the Controller' })
  const remove = row.getByRole('button', { name: 'Delete Fits from the Controller' })
  const proofDir = process.env.PXLBLZ_UI_PROOF_DIR

  for (const width of [1440, 641]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(tag).toBeVisible()
    await expect.poll(() => tag.evaluate((element) => {
      const cell = element.closest('td')!.getBoundingClientRect()
      const text = document.createRange()
      text.selectNodeContents(element)
      return [element.getBoundingClientRect(), ...Array.from(text.getClientRects())]
        .every((rect) => rect.left >= cell.left && rect.right <= cell.right)
    }), { message: `Binding tag and its text fit inside the Profile cell at ${width}px` }).toBe(true)
    await expect(status).toBeVisible()
    await run.click({ trial: true })
    await remove.click({ trial: true })
    if (proofDir) {
      await mkdir(proofDir, { recursive: true })
      await page.mouse.move(0, 0)
      await page.screenshot({ path: `${proofDir}/1277a1-corrective-tags-${width}.png` })
    }
  }
})

test('Saved by PXLBLZ groups share selection across Patterns and Shows (#1277)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const running = 'pxbTagsMemory0001'
  await seed(page, fixtures, profile, running)

  const pane = page.getByTestId('controller-saved-programs-pane')
  const patterns = pane.getByRole('table', { name: 'Patterns', exact: true })
  const shows = pane.getByRole('table', { name: 'Shows', exact: true })
  const other = pane.getByRole('table', { name: 'Other Patterns', exact: true })
  const proofDir = process.env.PXLBLZ_1277A2_UI_PROOF_DIR
  for (const width of [1440, 641]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(pane.getByRole('heading')).toHaveText(['Saved by PXLBLZ (6)', 'Patterns (5)', 'Shows (1)', 'Other Patterns (1)'])
    await expect(pane.getByText('3 of 3 up to date', { exact: true })).toBeVisible()
    await expect(patterns.getByRole('row')).toHaveCount(6)
    await expect(shows.getByRole('row')).toHaveCount(2)
    await expect(other.getByRole('row')).toHaveCount(2)
    expect(await pane.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    if (proofDir) {
      await mkdir(proofDir, { recursive: true })
      await page.screenshot({ path: `${proofDir}/1277a2-saved-groups-${width}-rest.png`, animations: 'disabled' })
    }
  }
  for (const { id, binding } of owned) {
    const group = binding?.startsWith('show:') ? shows : patterns
    await expect(group.locator(`#${savedRowDomId(id)}`)).toHaveCount(1)
  }
  await expect(other.getByText('Foreign', { exact: true })).toBeVisible()
  await expect(shows.getByText('Source Show unavailable', { exact: true })).toBeVisible()

  const selectSaved = pane.getByRole('button', { name: 'Select Saved PXLBLZ Patterns' })
  const selectOther = pane.getByRole('button', { name: 'Select Other Patterns' })
  await selectSaved.click()
  const allSaved = pane.getByRole('checkbox', { name: 'Select all Saved PXLBLZ Patterns' })
  await expect(allSaved).toHaveCount(1)
  await expect(patterns.getByRole('checkbox', { name: 'Select Memory heavy' })).toBeDisabled()
  await patterns.getByRole('checkbox', { name: 'Select Fits' }).check()
  await expect(allSaved).toHaveJSProperty('indeterminate', true)
  const writes = await fakeControllerMutations(page)

  await allSaved.check()
  await expect(allSaved).toHaveJSProperty('indeterminate', false)
  await expect(pane.getByRole('status')).toHaveText('5 of 6 selected')
  for (const { id, name, binding } of owned) {
    const group = binding?.startsWith('show:') ? shows : patterns
    const checkbox = group.getByRole('checkbox', { name: `Select ${name}`, exact: true })
    if (id === running) await expect(checkbox).not.toBeChecked()
    else await expect(checkbox).toBeChecked()
  }
  await expect(other.getByRole('checkbox')).toHaveCount(0)

  await pane.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('listitem')).toHaveCount(5)
  const confirmedNames = await dialog.getByRole('listitem').allTextContents()
  expect(confirmedNames.sort()).toEqual(owned.filter(({ id }) => id !== running).map(({ name }) => name).sort())
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await fakeControllerMutations(page)).toEqual(writes)
  await selectOther.click()
  await expect(pane.getByRole('status')).toHaveText('0 of 1 selected')
  await selectSaved.click()
  await expect(pane.getByRole('status')).toHaveText('0 of 6 selected')
})
