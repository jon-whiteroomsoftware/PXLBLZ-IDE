import type { Page } from '@playwright/test'
import { artifactHash } from '../src/engine/artifactStamp'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import { controllerProfileArtifactSignature, controllerProfilePassRecipe } from '../src/engine/controllerProfilePassRecipe'
import { encodePbp } from '../src/engine/pbpEncode'
import { bundleWithPasses } from '../src/engine/passEngine'
import { expect, test } from './fixtures/authenticated'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'

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
  disconnect: () => void
  reconnect: () => void
  dropProgramLists: () => void
}

function relay<K extends keyof RelayControls>(page: Page, action: K): Promise<ReturnType<RelayControls[K]>> {
  return page.evaluate((name) => {
    const { __fakeControllerReconciliation: controls } = window as unknown as { __fakeControllerReconciliation: RelayControls }
    return controls[name]() as ReturnType<RelayControls[K]>
  }, action)
}

async function seed(page: Page) {
  const request = page.context().request
  await installFakeControllerHelper(page, {
    address: ip, programs, activeProgramId: programs[3].id, deviceName: profile.name,
    boardType: 'pb32', mac: '11:22:33:44:55:66', pixelCount: 64,
    savedProgramData, trackSavedPrograms: true,
  })
  expect((await request.post('/api/controllers', { data: profile })).ok()).toBe(true)
  for (const { binding, name, source } of managed) {
    expect((await request.post('/api/patterns', {
      data: { id: binding, name, src: source, controls: {}, updatedAt: 1 },
    })).ok()).toBe(true)
  }
  const bindings = Object.fromEntries(programs.flatMap(({ id, binding }) => binding ? [[binding, id]] : []))
  const pushRecords = Object.fromEntries(programs.flatMap(({ binding, name, source }) => binding ? [[binding, {
    name, transforms: [], artifactHash: artifactHash(source), sourceHash: artifactHash(source),
    profileSignature: controllerProfileArtifactSignature(profile, binding, { mapDim: null }),
    stampedAt: '2026-11-25T00:00:00.000Z',
  }]] : []))
  for (const [key, value] of Object.entries({ 'controller-bindings': bindings, 'controller-push-records': pushRecords })) {
    expect((await request.put(`/api/controller-metadata/${key}`, { data: { value: { [ip]: value } } })).ok()).toBe(true)
  }
  await page.goto(`studio/controllers/${profile.id}`)
}

async function observeRunStarts(page: Page) {
  await page.evaluate(async (profileId) => {
    const path = new URL('/PXLBLZ-IDE/src/store/controllerReconciliationQueue.ts', location.origin).href
    const { ControllerReconciliationQueue } = await import(/* @vite-ignore */ path) as typeof import('../src/store/controllerReconciliationQueue')
    const request = ControllerReconciliationQueue.prototype.request
    let starts = 0
    ControllerReconciliationQueue.prototype.request = function (id, trigger, run) {
      return request.call(this, id, trigger, (flight) => {
        if (id === profileId) starts += 1
        return run(flight)
      })
    }
    Object.defineProperty(window, '__reconciliationRunStarts', { get: () => starts })
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
      expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const directory = process.env.PXLBLZ_RECONCILIATION_PROOF_DIR
      if (directory) await pane.screenshot({ path: `${directory}/1274-${viewport}-${state}.png`, animations: 'disabled' })
    }
    await expect.poll(runStarts).toBe(1)
    await capture('rest', '2 of 2 up to date')
    expect(await relay(page, 'savedBytes')).toEqual(savedProgramData)
    const cap = page.getByRole('checkbox', { name: 'Limit power', exact: true })
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
    await expect(pane.getByText(/Retrying in \d+ s/)).toBeVisible()
  })
}
