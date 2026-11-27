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
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'

// #1277 slice 1277a1: saved-row tags against the stored push record and the
// stored program source on the fake Controller transport.
const ip = '192.168.8.231'
const pixelCount = 64
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
    { id: 'speed-binding', patternId: 'tags-fits', inputId: 'speed-knob', target: { kind: 'call-exported-slider', name: 'sliderSpeed' } },
  ],
  updatedAt: 1,
}
type Fixture = { id: string; name: string; binding: string | null; source: string; studio: boolean; record?: Partial<ControllerPushRecord> }
const render = 'export function render(i) { rgb(0.9, i/pixelCount, 0.2) }'
const fixtures: Fixture[] = [
  { id: 'pxbTagsFits000001', name: 'Fits', binding: 'tags-fits', studio: true, source: `export function sliderSpeed(v) {}\n${render}` },
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

async function seed(page: Page) {
  const request = page.context().request
  await installFakeControllerHelper(page, {
    address: ip, programs: fixtures.map(({ id, name }) => ({ id, name })), activeProgramId: fixtures.at(-1)!.id,
    deviceName: profile.name, boardType: 'pb32', mac: '11:22:33:44:55:77', pixelCount,
    savedProgramData: Object.fromEntries(fixtures.map(({ id, name, source }) => [
      id, Buffer.from(encodePbp({ id, name, sourceCode: source, byteCode: new Uint8Array(8) })).toString('base64'),
    ])),
    trackSavedPrograms: true,
  })
  expect((await request.post('/api/controllers', { data: profile })).ok()).toBe(true)
  for (const { binding, name, source } of fixtures.filter((fixture) => fixture.studio)) {
    expect((await request.post('/api/patterns', { data: { id: binding, name, src: source, controls: {}, updatedAt: 1 } })).ok()).toBe(true)
  }
  const bindings = Object.fromEntries(owned.map(({ id, binding }) => [binding, id]))
  const pushRecords = Object.fromEntries(owned.map(({ binding, name, source, record }) => [binding, {
    name, transforms: [], artifactHash: artifactHash(source), sourceHash: artifactHash(source),
    profileSignature: controllerProfileArtifactSignature(profile, binding, { mapDim: null }),
    stampedAt: '2026-11-26T00:00:00.000Z',
    ...record,
  }]))
  for (const [key, value] of Object.entries({ 'controller-bindings': bindings, 'controller-push-records': pushRecords })) {
    expect((await request.put(`/api/controller-metadata/${key}`, { data: { value: { [ip]: value } } })).ok()).toBe(true)
  }
  await page.goto(`studio/controllers/${profile.id}`)
  await expect(page.getByTestId('controller-saved-programs-pane')).toBeVisible()
  await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
  await page.getByTestId('controller-go').click()
  await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
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
  expect(texts('pxbTagsFits000001')).toEqual(['slow-mo', 'dreamy', 'power', 'bright', 'IO36 → sliderSpeed'])
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
