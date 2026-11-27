import { readFile } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import { artifactHash, stripPxlblzBanner } from '../src/engine/artifactStamp'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import type { ControllerPushRecords } from '../src/engine/controllerPushRecord'
import { controllerProfileArtifactSignature, controllerProfilePassRecipe } from '../src/engine/controllerProfilePassRecipe'
import { formatWrapperSkipReason, savedRowDomId } from '../src/engine/controllerWrapperTags'
import { decodePbp, encodePbp } from '../src/engine/pbpEncode'
import { parseEpe } from '../src/engine/epeImport'
import { bundleWithPasses } from '../src/engine/passEngine'
import { createShowWithOutputContract } from '../src/engine/showModel'
import { createPortableShowOutputContract } from '../src/engine/showOutputContract'
import { expect, test } from './fixtures/authenticated'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'
import { seedShowV2 } from './support/showBackingRecords'

const proofStorageState = process.env.PXLBLZ_RECONCILIATION_STORAGE_STATE
if (proofStorageState) test.use({ storageState: proofStorageState })

const ip = '192.168.8.224'
const profile: ControllerProfile = {
  id: 'rewrites-1274',
  name: 'Studio test Controller',
  deviceId: 'pixelblaze_pb32_665544332211',
  lastSeenIp: ip,
  board: { kind: 'pixelblaze-v3-standard' },
  inputs: [],
  globalTransforms: [{ id: 'power-cap', mixinId: 'builtin:power-cap', type: 'power-cap', enabled: false, mode: 'direct', maxDuty: 0.25 }],
  patternBindings: [],
  updatedAt: 1,
}
const programs = [
  { id: 'pxbManagedAurora1', name: 'Aurora', binding: 'rewrite-aurora', source: 'export function render(i) { rgb(0.9, i/pixelCount, 0.2) }' },
  { id: 'pxbManagedEmbers2', name: 'Embers', binding: 'rewrite-embers', source: 'export function render(i) { rgb(i/pixelCount, 0.3, 0.1) }' },
  { id: 'pxbMissingSource1', name: 'Missing source', binding: 'rewrite-missing', source: 'export function render(i) { rgb(0.7, 0.9, 0.1) }' },
  { id: 'pxbForeignPattern', name: 'Other Pattern', binding: null, source: 'export function render(i) { rgb(0.1, 0.9, 0.8) }' },
]
const managed = programs.slice(0, 2)
const [first, second] = managed.map(({ id }) => id)
const programIds = programs.map(({ id }) => id)
const savedProgramData = Object.fromEntries(programs.map(({ id, name, source }) => [
  id, Buffer.from(encodePbp({ id, name, sourceCode: source, byteCode: new Uint8Array(8) })).toString('base64'),
]))

interface RelayControls {
  holdSaves: () => void
  acknowledgeSave: () => void
  releaseSaves: () => void
  waitingSaveIds: () => string[]
  savedBytes: () => Record<string, string>
  savedControls: () => Record<string, Record<string, number>>
  controlWrites: () => Array<{ programId: string; values: Record<string, number>; save: boolean }>
  disconnect: () => void
  reconnect: () => void
  dropProgramLists: () => void
  rejectCompiles: () => void
}

function relay<K extends keyof RelayControls>(page: Page, action: K): Promise<ReturnType<RelayControls[K]>> {
  return page.evaluate((name) => {
    const { __fakeControllerReconciliation: controls } = window as unknown as { __fakeControllerReconciliation: RelayControls }
    return controls[name]() as ReturnType<RelayControls[K]>
  }, action)
}

async function seed(page: Page, seedProfile = profile, fixturePrograms = programs, pixelCount = 64) {
  const request = page.context().request
  const data = Object.fromEntries(fixturePrograms.map(({ id, name, source }) => [
    id, Buffer.from(encodePbp({ id, name, sourceCode: source, byteCode: new Uint8Array(8) })).toString('base64'),
  ]))
  await installFakeControllerHelper(page, {
    address: ip, programs: fixturePrograms, activeProgramId: programs[3].id, deviceName: profile.name,
    boardType: 'pb32', mac: '11:22:33:44:55:66', pixelCount,
    savedProgramData: data, trackSavedPrograms: true,
  })
  expect((await request.post('/api/controllers', { data: seedProfile })).ok()).toBe(true)
  for (const { binding, name, source } of fixturePrograms.filter(({ binding, id }) =>
    binding && !binding.startsWith('show:') && id !== programs[2].id,
  )) {
    expect((await request.post('/api/patterns', {
      data: { id: binding, name, src: source, controls: {}, updatedAt: 1 },
    })).ok()).toBe(true)
  }
  const bindings = Object.fromEntries(fixturePrograms.flatMap(({ id, binding }) => binding ? [[binding, id]] : []))
  const pushRecords = Object.fromEntries(fixturePrograms.flatMap(({ binding, name, source }) => binding ? [[binding, {
    name, transforms: [], artifactHash: artifactHash(source), sourceHash: artifactHash(source),
    // A Show fixture starts with placeholder bytes and has to earn its receipt
    // through a Save when the Studio source is available.
    profileSignature: binding.startsWith('show:') ? undefined : controllerProfileArtifactSignature(seedProfile, binding, { mapDim: null }),
    stampedAt: '2026-11-25T00:00:00.000Z',
  }]] : []))
  for (const [key, value] of Object.entries({ 'controller-bindings': bindings, 'controller-push-records': pushRecords })) {
    expect((await request.put(`/api/controller-metadata/${key}`, { data: { value: { [ip]: value } } })).ok()).toBe(true)
  }
  await page.goto(`studio/controllers/${seedProfile.id}`)
  await expect(page.getByTestId('controller-saved-programs-pane')).toBeVisible()
}

async function connectFixture(page: Page) {
  await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
  await page.getByTestId('controller-go').click()
  await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
}

for (const width of [1440, 641]) {
  test(`Controller pill marks refresh attention at ${width}px (#1287)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    await seed(page)
    await connectFixture(page)

    const bar = page.getByTestId('controller-bar')
    const dot = bar.getByTestId('controller-pill-dot')
    const attention = bar.getByRole('button', { name: 'Managed Pattern refresh needs attention' })
    const barButtons = bar.getByRole('button')
    const pane = page.getByTestId('controller-saved-programs-pane')
    const current = pane.getByText('2 of 2 up to date', { exact: true })
    const powerLimit = page.getByRole('switch', { name: 'Power limit', exact: true })
    const directory = process.env.PXLBLZ_1287_UI_PROOF_DIR

    await expect(current).toBeVisible()
    await expect(dot).toHaveClass(/\bbg-ok\b/)
    await expect(barButtons).toHaveCount(2)

    await relay(page, 'holdSaves')
    await powerLimit.check()
    await expect.poll(() => relay(page, 'waitingSaveIds')).toEqual([first])
    await expect(pane.getByText('Updating 0 of 2', { exact: true })).toBeVisible()
    await expect(dot).toHaveClass(/\bbg-ok\b/)
    await expect(barButtons).toHaveCount(2)
    if (directory) await page.screenshot({ path: `${directory}/1287-${width}-running.png`, animations: 'disabled' })

    await relay(page, 'releaseSaves')
    await expect(current).toBeVisible()
    await relay(page, 'rejectCompiles')
    await powerLimit.uncheck()
    await expect(pane.getByRole('button', { name: 'Retry failed updates' })).toBeVisible()
    await expect(dot).toHaveClass(/\bbg-ok\b/)
    await expect(barButtons).toHaveCount(3)
    await expect(attention).toBeVisible()
    await expect(attention).toHaveClass(/\bbg-red-400\b/)
    if (directory) await page.screenshot({ path: `${directory}/1287-${width}-attention.png`, animations: 'disabled' })

    await page.getByRole('button', { name: 'Controllers', exact: true }).click()
    await page.getByRole('option', { name: /^Patterns\b/ }).click()
    await expect(page).toHaveURL(/\/studio\/patterns(?:\/|$)/)
    await attention.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/studio/controllers/${profile.id}$`))
    await expect(pane.getByRole('button', { name: 'Retry failed updates' })).toBeVisible()
  })
}

async function profileTestSource(page: Page, id: string) {
  const bytes = (await relay(page, 'savedBytes'))[id]
  const saved = bytes && decodePbp(Buffer.from(bytes, 'base64'))
  if (!saved) throw new Error(`Could not open saved PBP ${id}`)
  return stripPxlblzBanner(saved.sourceCode)
}

for (const width of [1440, 641]) {
  test(`Profile Wrapper controls reconcile through the rendered page at ${width}px (#1277b)`, async ({ page }) => {
    const desktop = width === 1440
    const errors: string[] = []
    if (desktop) {
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      page.on('pageerror', (error) => errors.push(error.message))
    }
    const [fit, memory] = [
      { ...managed[0], source: `export function sliderWash(v) {}\n${managed[0].source}` },
      { ...managed[1], source: 'var heavy = array(10200)\nexport function render(i) { rgb(0, 0, heavy[0]) }' },
    ]
    const secondSkip = { ...memory, id: 'pxbManagedMemory2', binding: 'rewrite-memory-second', name: 'Another memory Pattern' }
    const unaffected = { ...fit, id: 'pxbManagedNamesak', binding: 'rewrite-namesake', name: memory.name }
    const show = { ...fit, id: 'pxbManagedShow123', binding: 'show:fixture-1277b', name: 'Fixture Show' }
    const fixturePrograms = [fit, memory, unaffected, ...programs.slice(2), show]
    if (desktop) fixturePrograms.push(secondSkip)
    const seedProfile: ControllerProfile = {
      ...profile,
      lastKnownPixelCount: 64,
      inputs: [{ id: 'knob', name: 'Wash knob', pin: 36, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false }],
      globalTransforms: [...profile.globalTransforms, {
        id: 'hardware-brightness', type: 'hardware-brightness', mixinId: 'builtin:hardware-brightness',
        mode: 'multiply-output', enabled: false, inputId: '',
      }],
      patternBindings: [{ id: 'wash', inputId: 'knob', patternId: fit.binding!, target: { kind: 'call-exported-slider', name: 'sliderWash' } }],
    }
    await page.setViewportSize({ width, height: 1000 })
    await seed(page, seedProfile, fixturePrograms)
    const runStarts = await observeRunStarts(page)
    await connectFixture(page)

    const profilePage = page.getByTestId('controller-profile-page')
    const pane = page.getByTestId('controller-saved-programs-pane')
    const wrappers = profilePage.locator('section').filter({ has: page.getByRole('heading', { name: 'Wrappers', exact: true }) })
    const slow = wrappers.getByRole('switch', { name: 'Slow-mo' })
    const dreamy = wrappers.getByRole('switch', { name: 'Dreamy' })
    const power = wrappers.getByRole('switch', { name: 'Power limit' })
    const note = pane.getByText(/^Shows keep their own timing:/)
    const upToDate = pane.getByText(desktop ? '4 of 4 up to date' : '3 of 3 up to date', { exact: true })
    const unbind = wrappers.getByRole('button', { name: 'Unbind Brightness', exact: true })
    const row = (id: string) => pane.locator(`#${savedRowDomId(id)}`)
    const tag = (id: string, label: string) => row(id).getByText(label, { exact: true })
    const skippedTag = (id: string) => row(id).locator('[data-skipped-wrapper="slow-mo"]')
    const proofDir = process.env.PXLBLZ_1277B_UI_PROOF_DIR
    const capture = async (state: string, captureWidth = width) => {
      if (proofDir) await page.screenshot({ path: `${proofDir}/1277b-${captureWidth}-${state}.png` })
    }
    await expect(upToDate).toBeVisible()
    await expect.poll(runStarts).toBe(1)
    await expect(slow).not.toBeChecked()
    await expect(dreamy).not.toBeChecked()
    await expect(power).not.toBeChecked()
    await expect(note).toHaveCount(0)
    await expect(unbind).toHaveCount(0)
    await capture('rest')
    const baseline = await relay(page, 'savedBytes')

    await relay(page, 'holdSaves')
    await slow.check()
    await expect(note).toHaveText('Shows keep their own timing: no Slow-mo.')
    await expect.poll(() => relay(page, 'waitingSaveIds')).toEqual([fit.id])
    await expect(pane.getByText(/Updating \d+ of [34]/)).toBeVisible()
    expect(await relay(page, 'savedBytes')).toEqual(baseline)
    await expect(tag(fit.id, 'slow-mo')).toHaveCount(0)
    await capture('updating')
    await dreamy.check()
    await expect(note).toHaveText('Shows keep their own timing: no Slow-mo or Dreamy.')
    await expect(pane.getByText(/Updating .* · restarted/)).toBeVisible()
    expect(await relay(page, 'waitingSaveIds')).toEqual([fit.id])
    if (desktop) await capture('folded')
    await relay(page, 'acknowledgeSave')
    await expect.poll(async () => (await relay(page, 'waitingSaveIds')).length).toBe(1)
    await relay(page, 'releaseSaves')
    await expect(upToDate).toBeVisible()
    expect(await runStarts()).toBe(2)
    for (const id of [fit.id, unaffected.id]) {
      const source = await profileTestSource(page, id)
      expect(source).toContain('export function sliderSlowMo')
      expect(source).toContain('export function sliderDreamy')
      await expect(tag(id, 'slow-mo')).toBeVisible()
      await expect(tag(id, 'dreamy')).toBeVisible()
    }
    const memoryIds = desktop ? [memory.id, secondSkip.id] : [memory.id]
    for (const id of memoryIds) {
      expect((await relay(page, 'savedBytes'))[id]).toBe(baseline[id])
      await expect(skippedTag(id)).toBeVisible()
    }
    await expect(row(show.id).locator('[data-skipped-wrapper]')).toHaveCount(0)
    await expect(tag(show.id, 'slow-mo')).toHaveCount(0)
    await expect(tag(show.id, 'dreamy')).toHaveCount(0)
    expect((await relay(page, 'savedBytes'))[programs[3].id]).toBe(baseline[programs[3].id])

    await dreamy.uncheck()
    await expect(note).toHaveText('Shows keep their own timing: no Slow-mo.')
    await expect(tag(fit.id, 'dreamy')).toHaveCount(0)
    const count = wrappers.getByRole('button', { name: `${memoryIds.length} skipped for Slow-mo` })
    const firstSkipped = skippedTag(desktop ? secondSkip.id : memory.id)
    const skippedBinding = desktop ? secondSkip.binding : memory.binding
    const tooltip = firstSkipped.getByRole('tooltip', { includeHidden: true })
    const receipt = await page.context().request.get('/api/controller-metadata/controller-push-records')
    expect(receipt.ok()).toBe(true)
    const { value } = await receipt.json() as { value: ControllerPushRecords }
    const reason = formatWrapperSkipReason(value[ip][skippedBinding!].wrapperOutcome!.skipped['slow-mo']!)
    await expect(firstSkipped).toHaveAccessibleDescription(reason)
    await expect(tooltip).toBeHidden()
    await firstSkipped.hover()
    await expect(tooltip).toHaveText(reason)
    const paneBounds = (await pane.boundingBox())!
    const tipBounds = (await tooltip.boundingBox())!
    expect(tipBounds.x).toBeGreaterThanOrEqual(paneBounds.x)
    expect(tipBounds.x + tipBounds.width).toBeLessThanOrEqual(paneBounds.x + paneBounds.width)
    await capture('skip-hover')
    await page.mouse.move(0, 0)
    await count.click()
    await expect(firstSkipped).toBeFocused()
    await expect(tooltip).toBeVisible()
    const isFlashing = (target: Locator) => target.evaluate((node) => node.getAnimations().some(
      (animation) => animation.playState === 'running',
    ))
    for (const id of memoryIds) expect(await isFlashing(row(id))).toBe(true)
    expect(await isFlashing(row(unaffected.id))).toBe(false)
    await capture('skip-focus')
    if (!desktop && proofDir) {
      // The desktop flow has two memory skips. Keep the single-skip proof at both widths.
      await page.setViewportSize({ width: 1440, height: 1000 })
      await firstSkipped.blur()
      await firstSkipped.hover()
      await expect(tooltip).toHaveText(reason)
      await capture('single-skip-hover', 1440)
      await page.mouse.move(0, 0)
      await count.click()
      await expect(firstSkipped).toBeFocused()
      await expect(tooltip).toHaveText(reason)
      await capture('single-skip-focus', 1440)
      await page.setViewportSize({ width, height: 1000 })
    }
    await count.focus()
    await count.press('Enter')
    await expect(firstSkipped).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(tooltip).toBeHidden()
    await expect(firstSkipped).toBeFocused()

    if (desktop) {
      await slow.focus()
      const visited: string[] = []
      for (let index = 0; index < 45 && !visited.includes('saved'); index += 1) {
        const section = await page.evaluate(() => {
          const active = document.activeElement
          if (active?.closest('[data-testid="controller-saved-programs-pane"] tbody tr')) return 'saved'
          const heading = active?.closest('section')?.querySelector('h2')
          return heading?.textContent === 'Wrappers' ? 'wrappers' : heading?.textContent === 'Inputs' ? 'inputs' : ''
        })
        if (section && visited.at(-1) !== section) visited.push(section)
        await page.keyboard.press('Tab')
      }
      expect(visited).toEqual(['wrappers', 'inputs', 'saved'])
    }
    for (const surface of [profilePage, pane]) {
      await expect.poll(() => surface.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0)
    }
    await expect(row(fit.id).getByRole('cell').nth(2).locator('[aria-label]')).toBeVisible()
    await row(fit.id).getByRole('button', { name: 'Run Aurora on the Controller' }).click({ trial: true })
    await row(fit.id).getByRole('button', { name: 'Delete Aurora from the Controller' }).click({ trial: true })

    await slow.uncheck()
    await expect(note).toHaveCount(0)
    await expect(count).toHaveCount(0)
    await expect(tag(fit.id, 'slow-mo')).toHaveCount(0)
    await expect(upToDate).toBeVisible()

    const unboundSource = await profileTestSource(page, fit.id)
    const trigger = profilePage.getByRole('button', { name: 'Use Wash knob for a Wrapper' })
    await trigger.click()
    const picker = profilePage.getByRole('group', { name: 'Wrapper for Wash knob' })
    await expect(picker.getByRole('button')).toHaveText(['Brightness', 'Slow-mo', 'Dreamy', 'Cancel'])
    await picker.getByRole('button', { name: 'Cancel' }).click()
    await expect(trigger).toBeFocused()
    await expect(unbind).toHaveCount(0)
    await trigger.click()
    await picker.getByRole('button', { name: 'Brightness' }).click()
    await expect(unbind).toBeVisible()
    await expect(wrappers.getByRole('switch')).toHaveCount(3)
    await expect(tag(unaffected.id, 'bright')).toBeVisible()
    await expect(tag(fit.id, 'bright')).toHaveCount(0)
    expect(await profileTestSource(page, unaffected.id)).toContain('__px_hardwareBrightnessRgb')
    expect(await profileTestSource(page, fit.id)).toBe(unboundSource)
    await expect(tag(fit.id, 'IO36 → sliderWash')).toBeVisible()
    await wrappers.scrollIntoViewIfNeeded()
    await capture('brightness')
    await unbind.click()
    await expect(unbind).toHaveCount(0)
    await expect(tag(unaffected.id, 'bright')).toHaveCount(0)
    await expect(upToDate).toBeVisible()
    expect(await profileTestSource(page, unaffected.id)).not.toContain('__px_hardwareBrightnessRgb')
    expect(await profileTestSource(page, fit.id)).toBe(unboundSource)
    await capture('unbound')

    await relay(page, 'disconnect')
    await expect(pane.getByText(/Nothing to show while offline/)).toBeVisible()
    const beforeOffline = await relay(page, 'savedBytes')
    await dreamy.check()
    await expect(pane.getByText(new RegExp(`waiting for ${profile.name}`))).toBeVisible()
    expect(await relay(page, 'savedBytes')).toEqual(beforeOffline)
    expect(await relay(page, 'waitingSaveIds')).toEqual([])
    await relay(page, 'reconnect')
    await expect(note).toHaveText('Shows keep their own timing: no Dreamy.')
    await expect(tag(fit.id, 'dreamy')).toBeVisible()
    await expect(upToDate).toBeVisible()
    expect(await profileTestSource(page, fit.id)).toContain('export function sliderDreamy')
    await dreamy.uncheck()
    await expect(note).toHaveCount(0)
    await expect(tag(fit.id, 'dreamy')).toHaveCount(0)
    await power.check()
    await expect(wrappers.getByRole('slider', { name: 'Power cap duty percent' })).toBeVisible()
    await expect(wrappers.getByText('25% fixed cap')).toBeVisible()
    await expect(tag(fit.id, 'power')).toBeVisible()
    await expect(upToDate).toBeVisible()
    await capture('power')

    await page.reload()
    await expect(unbind).toHaveCount(0)
    await expect(trigger).toBeVisible()
    const stored = await page.context().request.get('/api/controllers')
    expect(stored.ok()).toBe(true)
    const { controllers } = await stored.json() as { controllers: ControllerProfile[] }
    const durable = controllers.find(({ id }) => id === profile.id)!
    expect(durable.patternBindings).toEqual(seedProfile.patternBindings)
    expect(durable.globalTransforms.find(({ type }) => type === 'hardware-brightness'))
      .toMatchObject({ enabled: false, inputId: '' })
    const patternResponse = await page.context().request.get('/api/patterns')
    expect(patternResponse.ok()).toBe(true)
    const { patterns } = await patternResponse.json() as { patterns: Array<{ id: string; src: string }> }
    expect(patterns.find(({ id }) => id === fit.binding)?.src).toBe(fit.source)
    expect(errors).toEqual([])
  })
}

test('Wrapper profile reconciliation writes only effective changes at the Controller transport (#1279)', async ({ page }) => {
  const [fit, refused] = [
    { ...managed[0], source: 'export function sliderWash(v) {}\nexport function render(i) { rgb(0.9, i/pixelCount, 0.2) }' },
    { ...managed[1], source: 'var large = array(10200)\nexport function render(i) { rgb(0, 0, large[0]) }' },
  ]
  const fixturePrograms = [fit, refused, ...programs.slice(2)]
  await seed(page, { ...profile, lastKnownPixelCount: 1133 }, fixturePrograms, 1133)
  const runStarts = await observeRunStarts(page)
  await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
  await page.getByTestId('controller-go').click()
  const controller = page.getByTestId('controller-pill')
  await expect(controller).toHaveAttribute('data-phase', 'live')
  await expect.poll(runStarts).toBe(1)

  const setWrappers = (slowMo: boolean, dreamy: boolean) => page.evaluate(async ({ profileId, slowMo, dreamy }) => {
    const path = new URL('/PXLBLZ-IDE/src/store/controllerProfileStore.ts', location.origin).href
    const { useControllerProfileStore } = await import(/* @vite-ignore */ path) as typeof import('../src/store/controllerProfileStore')
    const state = useControllerProfileStore.getState()
    await state.setWrapperEnabled(profileId, 'slow-mo', slowMo)
    await state.setWrapperEnabled(profileId, 'dreamy', dreamy)
  }, { profileId: profile.id, slowMo, dreamy })
  const reconcile = () => page.evaluate(async (profileId) => {
    const path = new URL('/PXLBLZ-IDE/src/store/controllerStore.ts', location.origin).href
    const { useControllerStore } = await import(/* @vite-ignore */ path) as typeof import('../src/store/controllerStore')
    await useControllerStore.getState().reconcileControllerProfile(profileId)
  }, profile.id)
  const writes = () => page.evaluate(() => {
    const { __fakeControllerWrites: writes } = window as unknown as {
      __fakeControllerWrites: Array<{ savedProgramId?: string; setControls?: Record<string, number> }>
    }
    return {
      ids: writes.flatMap((write) => write.savedProgramId ? [write.savedProgramId] : []),
      values: writes.flatMap((write) => write.setControls ? [write.setControls] : []),
    }
  })
  const readSources = () => page.evaluate(async (ids) => {
    const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
    const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
    const provider = getControllerProvider()
    return Promise.all(ids.map(async (id) => (await provider.readSavedProgram(id))?.sourceCode))
  }, programIds)
  const records = async () => {
    const response = await page.context().request.get('/api/controller-metadata/controller-push-records')
    expect(response.ok()).toBe(true)
    return (await response.json() as { value: ControllerPushRecords }).value[ip]
  }
  const baseline = await readSources()
  await setWrappers(true, true)
  await reconcile()
  await expect(page.getByText(/^Shows keep their own timing:/)).toHaveCount(0)
  const [wrapped, ...unwrapped] = await readSources()
  expect(wrapped).toContain('export function sliderSlowMo')
  expect(wrapped).toContain('export function sliderDreamy')
  expect(unwrapped).toEqual(baseline.slice(1))
  expect(await writes()).toEqual({ ids: [first], values: [] })
  expect((await records())[refused.binding!].wrapperOutcome).toMatchObject({
    applied: [],
    skipped: { 'slow-mo': { reason: 'array-budget' }, dreamy: { reason: 'array-budget' } },
  })
  await reconcile()
  expect((await writes()).ids).toEqual([first])
  const setValues = () => page.evaluate(async ({ fit, parking }) => {
    const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
    const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
    const provider = getControllerProvider()
    await provider.setActiveProgram(fit, { save: false })
    await provider.setControls({ sliderSlowMo: 0.3, sliderWash: 0.7 }, true)
    await provider.setActiveProgram(parking, { save: false })
    await provider.getConfig()
  }, { fit: first, parking: programs[3].id })
  await setValues()
  await reconcile()
  expect(await writes()).toEqual({ ids: [first], values: [{ sliderSlowMo: 0.3, sliderWash: 0.7 }] })

  // The target has room for both at 1133, and for Slow-mo alone at 1134.
  for (const [count, expectedIds, wrapper] of [
    [1134, [first, first], 'slow-mo'],
    [1703, [first, first, first], null],
  ] as const) {
    if (count === 1703) {
      await setWrappers(true, false)
      await reconcile()
      expect((await writes()).ids).toEqual([first, first])
    }
    await page.evaluate(async (pixelCount) => {
      const path = new URL('/PXLBLZ-IDE/src/store/controllerPanelStore.ts', location.origin).href
      const { useControllerPanelStore } = await import(/* @vite-ignore */ path) as typeof import('../src/store/controllerPanelStore')
      await useControllerPanelStore.getState().setPixelCount(pixelCount)
    }, count)
    await expect.poll(async () => (await writes()).ids).toEqual(expectedIds)
    await reconcile()
    expect((await records())[fit.binding!].wrapperOutcome?.applied).toEqual(wrapper ? [wrapper] : [])
  }
  expect(await readSources()).toEqual(baseline)
  await setWrappers(false, false)
  await reconcile()
  expect((await writes()).ids).toEqual([first, first, first])
  expect(await readSources()).toEqual(baseline)

  await setWrappers(true, false)
  // Let the managed Pattern wrap again to exercise export isolation while the
  // destination Controller has an enabled Wrapper.
  await page.evaluate(async () => {
    const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
    const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
    await getControllerProvider().setPixelCount(1133, true)
  })
  await reconcile()
  expect((await readSources())[0]).toContain('export function sliderSlowMo')
  const controls = await page.evaluate(async ({ fit, parking }) => {
    const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
    const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
    const provider = getControllerProvider()
    await provider.setActiveProgram(parking, { save: false })
    await provider.setActiveProgram(fit, { save: false })
    const config = await provider.getConfig()
    return { id: config.activeProgramId, values: config.activeControls }
  }, { fit: first, parking: programs[3].id })
  expect(controls).toEqual({ id: first, values: { sliderSlowMo: 0.3, sliderWash: 0.7 } })
  expect((await writes()).values).toEqual([{ sliderSlowMo: 0.3, sliderWash: 0.7 }])

  await page.goto(`studio/patterns/${fit.binding}`)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pattern actions' }).click()
  await page.getByRole('menuitem', { name: 'Download .epe' }).click()
  const exported = parseEpe(await readFile((await (await downloaded).path())!, 'utf8'))
  expect(stripPxlblzBanner(exported.src)).toBe(fit.source)
})

for (const width of [1440, 641]) {
  test(`Wrapper input binding reconciles saved Patterns at ${width}px (#1278 F1)`, async ({ page }) => {
    // Six real transport reconnects and a fresh profile load share this flow.
    test.setTimeout(60_000)
    const source = 'export function sliderWash(v) {}\nexport function render(i) { rgb(i/pixelCount, 0.3, 0.1) }'
    const fit = { ...managed[0], source }
    const optOut = { ...managed[1], source }
    const independent = { id: 'pxbDifferentInput', name: 'Ripple', binding: 'rewrite-ripple', source }
    const clash = { ...independent, id: 'pxbNameCollision1', name: 'Name collision', binding: 'rewrite-clash',
      source: `export function sliderSlowMo(v) {}\n${source}` }
    const memory = { ...independent, id: 'pxbMemoryRefusal1', name: 'Memory skip', binding: 'rewrite-memory',
      source: 'var heavy = array(10200)\nexport function render(i) { rgb(0, 0, heavy[0]) }' }
    const show = { ...independent, id: 'pxbPortableShow01', name: 'Fixture Show', binding: 'show:fixture-1278' }
    const foreign = programs[3]
    const fixturePrograms = [fit, optOut, independent, clash, memory, show, foreign]
    const input = { id: 'tempo', name: 'Tempo dial', pin: 33, signal: 'analog' as const, smoothing: 0.2, fallback: 0, invert: false }
    const seedProfile: ControllerProfile = {
      ...profile,
      lastKnownPixelCount: 64,
      inputs: [input, { ...input, id: 'wash', name: 'Wash dial', pin: 36 }],
      globalTransforms: [...profile.globalTransforms, { id: 'slow-mo', type: 'slow-mo', enabled: true }],
      patternBindings: [
        { id: 'opt-out', patternId: optOut.binding!, inputId: input.id, target: { kind: 'call-exported-slider', name: 'sliderWash' } },
        { id: 'independent', patternId: independent.binding, inputId: 'wash', target: { kind: 'call-exported-slider', name: 'sliderWash' } },
      ],
    }
    await page.setViewportSize({ width, height: 1000 })
    await seed(page, seedProfile, fixturePrograms)
    const request = page.context().request
    const showFixture = createShowWithOutputContract(show.binding.slice(5), show.name,
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 64 }))
    await seedShowV2(page, showFixture, show.name)

    const runStarts = await observeRunStarts(page)
    const activeRuns = () => page.evaluate(() => (
      window as unknown as { __reconciliationActiveRuns: number }
    ).__reconciliationActiveRuns)
    const pane = page.getByTestId('controller-saved-programs-pane')
    const pill = page.getByTestId('controller-pill')
    const done = pane.getByText('6 of 6 up to date', { exact: true })
    const waitForRun = async (previous: number) => {
      await expect.poll(runStarts).toBe(previous + 1)
      await expect.poll(activeRuns).toBe(0)
      await expect(done).toBeVisible()
    }
    const saves = () => page.evaluate(() => (
      window as unknown as { __fakeControllerWrites: Array<{ savedProgramId?: string }> }
    ).__fakeControllerWrites.flatMap(({ savedProgramId }) => savedProgramId ? [savedProgramId] : []))
    // Activation sends an empty volatile setControls to clear its temporary
    // Control map. Count all value writes and any request to persist Controls.
    const valueWrites = async () => (await relay(page, 'controlWrites'))
      .filter(({ values, save }) => save || Object.keys(values).length > 0)
    const readPrograms = () => page.evaluate(async (ids) => {
      const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
      const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
      return Promise.all(ids.map((id) => getControllerProvider().readSavedProgram(id)))
    }, fixturePrograms.map(({ id }) => id))
    const storedProfile = async (id = seedProfile.id) => {
      const response = await request.get('/api/controllers')
      expect(response.ok()).toBe(true)
      const { controllers } = await response.json() as { controllers: ControllerProfile[] }
      const stored = controllers.find((item) => item.id === id)
      if (!stored) throw new Error(`Profile ${id} is missing after write`)
      return stored
    }
    const reconnectWithoutSave = async () => {
      const writeLog = await saves()
      const started = await runStarts()
      await relay(page, 'disconnect')
      await expect(pill).not.toHaveAttribute('data-phase', 'live')
      await relay(page, 'reconnect')
      await expect(pill).toHaveAttribute('data-phase', 'live')
      await waitForRun(started)
      expect(await saves()).toEqual(writeLog)
    }
    const capture = async (state: string) => {
      const proofDir = process.env.PXLBLZ_1278B_UI_PROOF_DIR
      if (proofDir) await page.screenshot({ path: `${proofDir}/1278b-${width}-${state}.png` })
    }
    const wrappers = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Wrappers', exact: true }) })
    const bindSlow = wrappers.getByRole('button', { name: 'Bind input to Slow-mo' })
    const unbindSlow = wrappers.getByRole('button', { name: 'Unbind Slow-mo', exact: true })
    const picker = wrappers.getByRole('group', { name: 'Input for Slow-mo' })
    const tempoChoice = (name: string) => picker.getByRole('button', { name: `IO${input.pin} ${name}`, exact: true })

    await connectFixture(page)
    await waitForRun(0)
    const baselineBytes = await relay(page, 'savedBytes')
    const baselinePrograms = await readPrograms()
    expect(baselinePrograms.map((program) => program?.programId)).toEqual(fixturePrograms.map(({ id }) => id))
    expect(baselinePrograms[0]?.sourceCode).toContain('export function sliderSlowMo')
    expect(baselinePrograms[5]?.stamp).toMatchObject({ kind: 'show', id: showFixture.id })
    expect(baselinePrograms[5]?.sourceCode).not.toContain('export function sliderSlowMo')
    expect(await saves()).toContain(show.id)
    await reconnectWithoutSave()

    await page.evaluate(async (id) => {
      const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
      const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
      const provider = getControllerProvider()
      await provider.setActiveProgram(id, { save: false })
      await provider.setControls({ sliderSlowMo: 0.3 }, true)
      await provider.getConfig()
    }, fit.id)
    const valueWrite = { programId: fit.id, values: { sliderSlowMo: 0.3 }, save: true }
    expect(await valueWrites()).toEqual([valueWrite])

    const baselineSaves = await saves()
    const beforeBind = await runStarts()
    await bindSlow.press('Space')
    await expect(picker.getByRole('button')).toHaveText(['IO33 Tempo dial', 'IO36 Wash dial', 'Cancel'])
    await wrappers.scrollIntoViewIfNeeded()
    await capture('wrapper-picker')
    await tempoChoice(input.name).click()
    await expect(wrappers.getByText('every Pattern except Embers')).toBeVisible()
    await expect(unbindSlow).toBeFocused()
    await waitForRun(beforeBind)
    await wrappers.scrollIntoViewIfNeeded()
    await capture('bound-wrapper')
    const rowBinding = await storedProfile()
    expect(rowBinding.patternBindings).toEqual(seedProfile.patternBindings)
    expect(rowBinding.globalTransforms).toContainEqual({ id: 'slow-mo', type: 'slow-mo', enabled: true, inputId: input.id })

    const appliedIds = [fit.id, independent.id]
    expect((await saves()).slice(baselineSaves.length).sort()).toEqual([...appliedIds].sort())
    const boundPrograms = await readPrograms()
    const boundBytes = await relay(page, 'savedBytes')
    const exportNames = (source: string | null | undefined) =>
      Array.from((source ?? '').matchAll(/^export function (\w+)/gm), ([, name]) => name)
    for (const index of [0, 2]) {
      expect(boundPrograms[index]?.sourceCode).toContain('analogRead(33)')
      expect(exportNames(boundPrograms[index]?.sourceCode)).toEqual(
        exportNames(baselinePrograms[index]?.sourceCode).filter((name) => name !== 'sliderSlowMo'),
      )
      expect(boundBytes[fixturePrograms[index].id]).not.toBe(baselineBytes[fixturePrograms[index].id])
    }
    expect(boundPrograms[1]?.sourceCode).toContain('export function sliderSlowMo')
    expect(await relay(page, 'savedControls')).toEqual({ [fit.id]: valueWrite.values })
    for (const index of [1, 3, 4, 5, 6]) {
      expect(boundPrograms[index]).toEqual(baselinePrograms[index])
      const { id } = fixturePrograms[index]
      expect(boundBytes[id]).toBe(baselineBytes[id])
    }
    await reconnectWithoutSave()

    const togglePanel = page.getByRole('button', { name: `Toggle ${profile.name} panel`, exact: true })
    await togglePanel.click()
    const panel = page.getByTestId('controller-panel-popover')
    const panelInput = (name: string) => panel.locator('[data-deck="cell"]').getByText(name, { exact: true })
    await expect(panelInput(input.name)).toBeVisible()
    await expect(panel.getByRole('slider', { name: 'Slow-mo', exact: true })).toHaveCount(0)
    await capture('panel-input')
    await togglePanel.click()

    const afterBindSaves = await saves()
    const beforeSample = await runStarts()
    await page.getByRole('button', { name: 'Adjust Tempo dial' }).click()
    await page.getByRole('checkbox', { name: 'Tempo dial invert' }).check()
    await waitForRun(beforeSample)
    // Embers opts out of the Wrapper input but its own Control still samples it.
    const samplingIds = [...appliedIds, optOut.id]
    expect((await saves()).slice(afterBindSaves.length).sort()).toEqual(samplingIds.sort())
    const sampledBytes = await relay(page, 'savedBytes')
    for (const id of samplingIds) expect(sampledBytes[id]).not.toBe(boundBytes[id])
    const sampledPrograms = await readPrograms()
    expect(sampledPrograms[1]?.sourceCode).toContain('export function sliderSlowMo')
    await reconnectWithoutSave()

    const afterSampleSaves = await saves()
    const name = page.getByRole('textbox', { name: 'Tempo dial input name' })
    const renamedInput = 'Renamed tempo dial'
    await name.fill(renamedInput)
    await name.press('Enter')
    await expect.poll(async () => (await storedProfile()).inputs[0].name).toBe(renamedInput)
    await togglePanel.click()
    await expect(panelInput(renamedInput)).toBeVisible()
    await togglePanel.click()
    expect(await saves()).toEqual(afterSampleSaves)
    expect(await relay(page, 'savedBytes')).toEqual(sampledBytes)
    await reconnectWithoutSave()

    const beforeUnbind = await runStarts()
    await unbindSlow.click()
    await waitForRun(beforeUnbind)
    expect((await saves()).slice(afterSampleSaves.length).sort()).toEqual([...appliedIds].sort())
    const restoredPrograms = await readPrograms()
    expect(restoredPrograms.map((program) => program?.sourceCode)).toEqual(
      baselinePrograms.map((program, index) => index === 1 ? sampledPrograms[index]?.sourceCode : program?.sourceCode),
    )
    expect(await relay(page, 'savedControls')).toEqual({ [fit.id]: valueWrite.values })
    expect(await valueWrites()).toEqual([valueWrite])
    await reconnectWithoutSave()
    await togglePanel.click()
    await expect(panel.getByRole('slider', { name: 'Slow-mo', exact: true })).toHaveValue('0.3')
    await togglePanel.click()

    const beforeOverlap = await runStarts()
    await relay(page, 'holdSaves')
    await wrappers.getByRole('switch', { name: 'Dreamy' }).check()
    await expect.poll(() => relay(page, 'waitingSaveIds')).toHaveLength(1)
    const held = await relay(page, 'waitingSaveIds')
    await bindSlow.click()
    await tempoChoice(renamedInput).click()
    await expect(pane.getByText(/Updating .* · restarted/)).toBeVisible()
    expect(await runStarts()).toBe(beforeOverlap + 1)
    expect(await relay(page, 'waitingSaveIds')).toEqual(held)
    await relay(page, 'releaseSaves')
    await waitForRun(beforeOverlap)
    const finalPrograms = await readPrograms()
    expect(finalPrograms[0]?.sourceCode).toContain('analogRead(33)')
    expect(finalPrograms[0]?.sourceCode).not.toContain('export function sliderSlowMo')
    expect(finalPrograms[5]).toEqual(baselinePrograms[5])
    expect(finalPrograms[6]).toEqual(baselinePrograms[6])
    expect(await valueWrites()).toEqual([valueWrite])
    await reconnectWithoutSave()

    const fresh = { ...seedProfile, id: 'rewrites-1278-fresh', deviceId: 'pixelblaze_pb32_665544332212', lastSeenIp: '192.168.8.225' }
    expect((await request.post('/api/controllers', { data: fresh })).ok()).toBe(true)
    await page.goto(`studio/controllers/${fresh.id}`)
    const inputOffer = page.getByRole('button', { name: 'Use Tempo dial for a Wrapper' })
    await inputOffer.click()
    const inputPicker = page.getByRole('group', { name: 'Wrapper for Tempo dial' })
    await expect(inputPicker.getByRole('button')).toHaveText(['Brightness', 'Slow-mo', 'Dreamy', 'Cancel'])
    await inputPicker.scrollIntoViewIfNeeded()
    await capture('input-offer')
    await inputPicker.getByRole('button', { name: 'Slow-mo', exact: true }).click()
    await expect.poll(async () => {
      const { globalTransforms, patternBindings, inputs } = await storedProfile(fresh.id)
      return { globalTransforms, patternBindings, inputs }
    }).toEqual({ globalTransforms: rowBinding.globalTransforms, patternBindings: rowBinding.patternBindings, inputs: rowBinding.inputs })
  })
}

async function observeRunStarts(page: Page) {
  await page.evaluate(async (profileId) => {
    const path = new URL('/PXLBLZ-IDE/src/store/controllerReconciliationQueue.ts', location.origin).href
    const { ControllerReconciliationQueue } = await import(/* @vite-ignore */ path) as typeof import('../src/store/controllerReconciliationQueue')
    const request = ControllerReconciliationQueue.prototype.request
    let starts = 0
    let active = 0
    ControllerReconciliationQueue.prototype.request = function (id, trigger, run) {
      if (id !== profileId) return request.call(this, id, trigger, run)
      return request.call(this, id, trigger, async (flight) => {
        starts += 1
        active += 1
        try {
          await run(flight)
        } finally {
          active -= 1
        }
      })
    }
    Object.defineProperty(window, '__reconciliationRunStarts', { get: () => starts })
    Object.defineProperty(window, '__reconciliationActiveRuns', { get: () => active })
  }, profile.id)
  return () => page.evaluate(() => (window as unknown as { __reconciliationRunStarts: number }).__reconciliationRunStarts)
}

async function expectSavedDelivery(page: Page, finalDuty: number) {
  const { installed, sources } = await page.evaluate(async (ids) => {
    const path = new URL('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts', location.origin).href
    const { getControllerProvider } = await import(/* @vite-ignore */ path) as typeof import('../src/engine/controllerProviderRegistry')
    const provider = getControllerProvider()
    const installed = (await provider.listPrograms()).map(({ id }) => id)
    const sources = await Promise.all(ids.map(async (id) => (await provider.readSavedProgram(id))?.sourceCode))
    return { installed, sources }
  }, programIds)
  expect(installed).toEqual(programIds)
  const finalProfile: ControllerProfile = {
    ...profile,
    globalTransforms: [{ ...profile.globalTransforms[0], enabled: true, maxDuty: finalDuty } as ControllerProfile['globalTransforms'][number]],
  }
  expect(sources).toEqual(programs.map(({ binding, source }, index) => index < managed.length
    ? bundleWithPasses(source, {}, controllerProfilePassRecipe(finalProfile, source, binding!)).code
    : source))
  const bytes = await relay(page, 'savedBytes')
  for (const id of programIds.slice(2)) expect(bytes[id]).toBe(savedProgramData[id])
}

for (const [viewport, width] of [['desktop', 1440], ['narrow', 768]] as const) {
  test(`confirmed map absence keeps saved programs current offline at ${viewport} width (#1274)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    await seed(page, {
      ...profile,
      lastKnownMapDim: 2,
      lastKnownInstalledMap: { status: 'absent', observedAt: 1 },
    })
    const pane = page.getByTestId('controller-saved-programs-pane')
    await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
    await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
    await page.getByTestId('controller-go').click()
    await expect(pane.getByText('2 of 2 up to date', { exact: true })).toBeVisible()
    await relay(page, 'disconnect')
    await expect(pane.getByText(`0 waiting for ${profile.name}`, { exact: true })).toBeVisible()
    expect(await relay(page, 'savedBytes')).toEqual(savedProgramData)
    const directory = process.env.PXLBLZ_RECONCILIATION_PROOF_DIR
    if (directory) await pane.screenshot({ path: `${directory}/1274-${viewport}-offline-current.png`, animations: 'disabled' })
  })

  test(`managed saved programs reconcile through the Controller transport at ${viewport} width (#1274)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    await seed(page)
    const runStarts = await observeRunStarts(page)
    const pane = page.getByTestId('controller-saved-programs-pane')
    const pill = page.getByTestId('controller-pill')
    await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
    await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
    await page.getByTestId('controller-go').click()
    await expect(pill).toHaveAttribute('data-phase', 'live')
    const capture = async (state: string, line: string | RegExp) => {
      await expect(pane.getByText(line, { exact: true })).toBeVisible()
      if (state === 'rest' || state === 'running') {
        await expect(pane.locator('h2, h3, [aria-live="polite"]')).toHaveText([
          'Saved by PXLBLZ (3)', line, 'Patterns (3)', 'Shows (0)', 'Other Patterns (1)',
        ])
      }
      expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const directory = process.env.PXLBLZ_RECONCILIATION_PROOF_DIR
      if (directory) await pane.screenshot({ path: `${directory}/1274-${viewport}-${state}.png`, animations: 'disabled' })
      const groupingProof = process.env.PXLBLZ_1277A2_UI_PROOF_DIR
      if (groupingProof && state === 'running' && viewport === 'desktop') {
        await page.screenshot({ path: `${groupingProof}/1277a2-saved-groups-1440-updating.png`, animations: 'disabled' })
      }
    }
    await expect.poll(runStarts).toBe(1)
    await capture('rest', '2 of 2 up to date')
    expect(await relay(page, 'savedBytes')).toEqual(savedProgramData)
    const cap = page.getByRole('switch', { name: 'Power limit', exact: true })
    const duty = page.getByRole('slider', { name: 'Power cap duty percent' })
    await relay(page, 'holdSaves')
    await cap.check()
    await expect.poll(() => relay(page, 'waitingSaveIds')).toEqual([first])
    await capture('running', 'Updating 0 of 2')
    await duty.press('ArrowRight')
    await capture('restarted', /Updating .* · restarted/)
    await relay(page, 'releaseSaves')
    await expect(pane.getByText('2 of 2 up to date', { exact: true })).toBeVisible()
    expect(await runStarts()).toBe(2)
    await expectSavedDelivery(page, 0.26)

    await relay(page, 'holdSaves')
    await cap.uncheck()
    await expect.poll(() => relay(page, 'waitingSaveIds')).toEqual([first])
    await pane.getByRole('button', { name: 'Pause', exact: true }).press('Enter')
    await relay(page, 'acknowledgeSave')
    await capture('paused', 'Paused at 1 of 2')
    await cap.check()
    const savedDuty = page.waitForResponse((response) => {
      if (response.request().method() !== 'PATCH' || !response.url().endsWith(`/api/controllers/${profile.id}`)) return false
      const changes = response.request().postDataJSON() as Partial<ControllerProfile>
      return response.ok() && changes.globalTransforms?.some((transform) => transform.type === 'power-cap' && transform.maxDuty === 0.27) === true
    })
    await duty.press('ArrowRight')
    await savedDuty
    await expect(pane.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled()
    expect(await relay(page, 'waitingSaveIds')).toEqual([])
    expect(await runStarts()).toBe(3)
    await pane.getByRole('button', { name: 'Resume', exact: true }).press('Enter')
    await expect.poll(() => relay(page, 'waitingSaveIds')).toEqual([first])
    await relay(page, 'acknowledgeSave')
    await expect.poll(() => relay(page, 'waitingSaveIds')).toEqual([second])
    const beforeDisconnect = await relay(page, 'savedBytes')
    await relay(page, 'disconnect')
    await capture('waiting', `1 waiting for ${profile.name}`)
    await relay(page, 'reconnect')
    await expect.poll(() => relay(page, 'waitingSaveIds')).toEqual([second])
    await relay(page, 'releaseSaves')
    await expect(pane.getByText('2 of 2 up to date', { exact: true })).toBeVisible()
    expect(await runStarts()).toBe(5)
    expect((await relay(page, 'savedBytes'))[first]).toBe(beforeDisconnect[first])
    await expectSavedDelivery(page, 0.27)

    await relay(page, 'dropProgramLists')
    await cap.uncheck()
    await capture('not-responding', 'Controller not responding')
    await expect(pill.getByTestId('controller-pill-dot')).toHaveClass(/\bbg-ok\b/)
    await expect(page.getByTestId('controller-bar').getByRole('button', { name: 'Managed Pattern refresh needs attention' }))
      .toHaveClass(/\bbg-red-400\b/)
    await expect(pane.getByText(/Retrying in \d+ s/)).toBeVisible()
  })
}
