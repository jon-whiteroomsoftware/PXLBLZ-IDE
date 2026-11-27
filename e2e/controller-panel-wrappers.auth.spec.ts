import type { Locator, Page } from '@playwright/test'
import { artifactHash } from '../src/engine/artifactStamp'
import { prepareControllerArtifactDelivery } from '../src/engine/controllerArtifactDelivery'
import type { ControllerProfile, ControllerWrapperOutcome } from '../src/engine/controllerProfile'
import type { ControllerPushRecord } from '../src/engine/controllerPushRecord'
import { encodePbp } from '../src/engine/pbpEncode'
import { expect, test } from './fixtures/authenticated'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'

const ip = '192.168.8.224'
const pixelCount = 64
const profile: ControllerProfile = {
  id: 'panel-wrappers-1280',
  name: 'Wrapper Test Controller',
  deviceId: 'pixelblaze_pb32_665544332211',
  lastSeenIp: ip,
  lastKnownPixelCount: pixelCount,
  board: { kind: 'pixelblaze-v3-standard' },
  inputs: [],
  globalTransforms: [
    { id: 'slow-mo', type: 'slow-mo', enabled: true },
    { id: 'dreamy', type: 'dreamy', enabled: true },
    { id: 'power-cap', mixinId: 'builtin:power-cap', type: 'power-cap', enabled: false, mode: 'direct', maxDuty: 0.25 },
  ],
  patternBindings: [],
  updatedAt: 1,
}

type ProgramFixture = {
  id: string
  binding: string
  name: string
  controls: Record<string, number>
  outcome?: ControllerWrapperOutcome
}

const both: ProgramFixture = {
  id: '1280fixture000001', binding: 'wrapped-both', name: 'Both Wrappers',
  controls: { sliderSpeed: 0.4, sliderSlowMo: 0.3, sliderDreamy: 0.6, sliderHue: 0.2 },
  outcome: { applied: ['slow-mo', 'dreamy'], skipped: {} },
}
const slow: ProgramFixture = {
  id: '1280fixture000002', binding: 'wrapped-slow', name: 'Slow Pattern',
  controls: { sliderSpeed: 0.8, sliderSlowMo: 0.1 },
  outcome: { applied: ['slow-mo'], skipped: {} },
}
const skipped: ProgramFixture = {
  id: '1280fixture000003', binding: 'wrapped-skipped', name: 'Dreamy Pattern',
  controls: { sliderSlowMo: 0.75, sliderSpeed: 0.5 },
  outcome: { applied: ['dreamy'], skipped: { 'slow-mo': { reason: 'array-budget', message: 'Insufficient memory.' } } },
}
const show: ProgramFixture = {
  id: '1280fixture000004', binding: 'show:evening', name: 'Evening Show', controls: {},
}
const plain: ProgramFixture = {
  id: '1280fixture000005', binding: 'unwrapped', name: 'Plain Pattern', controls: { sliderSpeed: 0.7 },
  outcome: { applied: [], skipped: {} },
}
const rewriteTarget: ProgramFixture = {
  id: '1280fixture000006', binding: 'rewrite-target', name: 'Rewrite Target', controls: {},
}
const source = 'export function render(i) { rgb(i/pixelCount, 0.2, 0.4) }'

async function seed(page: Page, withRewriteTarget = false) {
  const request = page.context().request
  const programs = [both, slow, skipped, show, plain]
  const savedProgramData: Record<string, string> = {}
  const pushRecords: Record<string, ControllerPushRecord> = {}
  for (const { id, binding, name, outcome } of programs) {
    pushRecords[binding] = {
      name, transforms: outcome?.applied ?? [], artifactHash: 'synthetic', stampedAt: '2026-11-26T00:00:00.000Z',
      ...(outcome && { wrapperOutcome: outcome, wrapperProgramId: id, wrapperPixelCount: pixelCount }),
    }
  }
  if (withRewriteTarget) {
    programs.push(rewriteTarget)
    const { id, name, binding } = rewriteTarget
    const delivery = prepareControllerArtifactDelivery({ source, profile, artifactId: binding, pixelCount, mapDim: null })
    savedProgramData[id] = Buffer.from(encodePbp({
      id, name, sourceCode: delivery.source, byteCode: new Uint8Array(8),
    })).toString('base64')
    pushRecords[binding] = {
      name, transforms: delivery.transformIds, artifactHash: artifactHash(delivery.source),
      sourceHash: artifactHash(source), profileSignature: delivery.profileSignature,
      wrapperOutcome: delivery.wrapperOutcome, wrapperProgramId: id, wrapperPixelCount: pixelCount,
      stampedAt: '2026-11-26T00:00:00.000Z',
    }
    expect((await request.post('/api/patterns', {
      data: { id: binding, name, src: source, controls: {}, updatedAt: 1 },
    })).ok()).toBe(true)
  }
  const bindings = Object.fromEntries(programs.map(({ id, binding }) => [binding, id]))
  await installFakeControllerHelper(page, {
    address: ip, programs, activeProgramId: both.id, deviceName: profile.name,
    boardType: 'pb32', mac: '11:22:33:44:55:66', pixelCount,
    controls: both.controls, programControls: Object.fromEntries(programs.map(({ id, controls }) => [id, controls])),
    savedProgramData, trackSavedPrograms: true,
  })
  expect((await request.post('/api/controllers', { data: profile })).ok()).toBe(true)
  for (const [key, value] of Object.entries({ 'controller-bindings': bindings, 'controller-push-records': pushRecords })) {
    expect((await request.put(`/api/controller-metadata/${key}`, { data: { value: { [ip]: value } } })).ok()).toBe(true)
  }
  await page.goto(`studio/controllers/${profile.id}`)
  await expect(page.getByTestId('controller-saved-programs-pane')).toBeAttached()
}

async function observeRunStarts(page: Page) {
  await page.evaluate(async (profileId) => {
    const path = new URL('/PXLBLZ-IDE/src/store/controllerReconciliationQueue.ts', location.origin).href
    const { ControllerReconciliationQueue } = await import(/* @vite-ignore */ path) as typeof import('../src/store/controllerReconciliationQueue')
    const request = ControllerReconciliationQueue.prototype.request
    let starts = 0
    let passes = 0
    const active = new Set<Promise<void>>()
    ControllerReconciliationQueue.prototype.request = function (id, trigger, run) {
      if (id !== profileId) return request.call(this, id, trigger, run)
      const done = request.call(this, id, trigger, (flight) => {
        starts += 1
        return run({
          ...flight,
          next: () => {
            const next = flight.next()
            if (next) passes += 1
            return next
          },
        })
      })
      active.add(done)
      void done.then(() => active.delete(done), () => active.delete(done))
      return done
    }
    Object.assign(window, { __wrapperRunCounts: () => ({ starts, passes, pending: active.size }) })
  }, profile.id)
  return () => page.evaluate(() => {
    const { __wrapperRunCounts: counts } = window as unknown as {
      __wrapperRunCounts: () => { starts: number; passes: number; pending: number }
    }
    return counts()
  })
}

async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
  await page.getByTestId('controller-go').click()
  await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: `Toggle ${profile.name} panel`, exact: true }).click()
  const panel = page.getByTestId('controller-panel-popover')
  await expect(panel).toBeVisible()
  return panel
}

async function selectProgram(panel: Locator, name: string) {
  const title = panel.getByRole('button', { name: 'Saved Patterns', exact: true })
  await title.press('Enter')
  const picker = panel.getByRole('listbox', { name: 'Saved Patterns' })
  await picker.getByRole('option', { name, exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(title).toContainText(name)
  await expect(title).toBeFocused()
  await title.blur()
}

function controlWrites(page: Page) {
  return page.evaluate(() => {
    const { __fakeControllerWrites: writes } = window as unknown as { __fakeControllerWrites: Record<string, unknown>[] }
    return writes.filter((write) => 'setControls' in write)
  })
}

async function moveSlowMo(page: Page, panel: Locator) {
  const writes = await controlWrites(page)
  const slider = panel.getByRole('slider', { name: 'Slow-mo', exact: true })
  await expect(slider).toHaveValue('0.3')
  await slider.press('ArrowRight')
  await expect(slider).toHaveValue('0.31')
  await expect.poll(() => controlWrites(page)).toEqual([...writes, { setControls: { sliderSlowMo: 0.31 }, save: false }])
  await slider.blur()
}

for (const width of [1440, 420]) {
  test(`Wrapper Controls keep per-Pattern values and send no rewrite at ${width}px (E1, E3)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await seed(page)
    const observeRuns = await observeRunStarts(page)
    await connect(page)
    await expect.poll(async () => (await observeRuns()).starts).toBeGreaterThan(0)
    await expect.poll(observeRuns).toMatchObject({ pending: 0 })
    const panel = await openPanel(page)
    const slowMo = panel.getByRole('slider', { name: 'Slow-mo', exact: true })
    const dreamy = panel.getByRole('slider', { name: 'Dreamy', exact: true })
    const speed = panel.getByRole('slider', { name: 'sliderSpeed', exact: true })
    const capture = async (state: string) => {
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const dir = process.env.PXLBLZ_WRAPPER_PANEL_PROOF_DIR
      if (dir) await page.screenshot({ path: `${dir}/1280-panel-wrapper-controls-${width}-${state}.png`, animations: 'disabled' })
    }
    await expect(slowMo).toHaveValue('0.3')
    await expect(dreamy).toHaveValue('0.6')
    await expect(speed).toHaveValue('0.4')
    await expect(panel.getByRole('slider', { name: 'sliderHue', exact: true })).toHaveValue('0.2')
    expect(await panel.getByRole('button', { name: 'Wrappers', exact: true }).evaluate((section) =>
      (section.getBoundingClientRect().top < section.ownerDocument.querySelector('.controller-section-controls')!.getBoundingClientRect().top),
    )).toBe(true)
    await capture('both')

    const idle = await observeRuns()
    await page.clock.install()
    await moveSlowMo(page, panel)
    // Advance past the background rewrite debounce, then wait for admitted work.
    await page.clock.runFor(700)
    await expect.poll(observeRuns).toMatchObject({ pending: 0 })
    expect(await observeRuns()).toEqual(idle)

    await selectProgram(panel, slow.name)
    await expect(slowMo).toHaveValue('0.1')
    await expect(speed).toHaveValue('0.8')
    await expect(dreamy).toHaveCount(0)
    await capture('speed')
    await selectProgram(panel, both.name)
    await expect(slowMo).toHaveValue('0.31')
    await expect(dreamy).toHaveValue('0.6')
    await expect(speed).toHaveValue('0.4')

    await selectProgram(panel, skipped.name)
    await expect(dreamy).toHaveAttribute('aria-valuetext', 'not set')
    await expect(dreamy).toBeEnabled()
    await expect(slowMo).toHaveCount(0)
    await expect(panel.getByRole('slider', { name: 'sliderSlowMo', exact: true })).toHaveCount(0)
    const dreamyRow = panel.locator('[data-deck="slider"]').filter({
      has: page.getByRole('slider', { name: 'Dreamy', exact: true }),
    })
    await expect(dreamyRow.getByText('—', { exact: true })).toBeVisible()
    await capture('skipped')

    await selectProgram(panel, plain.name)
    await expect(speed).toHaveValue('0.7')
    await expect(panel.getByRole('button', { name: 'Wrappers', exact: true })).toHaveCount(0)
    await selectProgram(panel, show.name)
    await expect(panel.getByText('Slow-mo and Dreamy are off for Shows.', { exact: true })).toBeVisible()
    await expect(slowMo).toHaveCount(0)
    await expect(dreamy).toHaveCount(0)
    await capture('show')
  })
}

test('moving a Wrapper Control during an in-flight rewrite adds no queued pass (E2)', async ({ page }) => {
  await seed(page, true)
  const observeRuns = await observeRunStarts(page)
  await connect(page)
  const inventory = page.getByTestId('controller-saved-programs-pane')
  await expect(inventory.getByText('1 of 1 up to date', { exact: true })).toBeVisible()
  // An up-to-date receipt can render before the connection pass is even admitted.
  await expect.poll(async () => (await observeRuns()).passes).toBeGreaterThan(0)
  await expect.poll(observeRuns).toMatchObject({ pending: 0 })
  const initial = await observeRuns()
  const observeRewrite = async () => {
    const { starts, passes, pending } = await observeRuns()
    return { starts: starts - initial.starts, passes: passes - initial.passes, pending }
  }

  const relay = (action: 'holdSaves' | 'releaseSaves' | 'waitingSaveIds') => page.evaluate((name) => {
    const { __fakeControllerReconciliation: fake } = window as unknown as {
      __fakeControllerReconciliation: Record<typeof name, () => string[] | void>
    }
    return fake[name]()
  }, action)
  await relay('holdSaves')
  try {
    await page.getByRole('switch', { name: 'Power limit', exact: true }).check()
    await expect.poll(() => relay('waitingSaveIds')).toEqual([rewriteTarget.id])
    const inFlight = { starts: 1, passes: 1, pending: 1 }
    expect(await observeRewrite()).toEqual(inFlight)
    const panel = await openPanel(page)
    await page.clock.install()
    await moveSlowMo(page, panel)
    // Keep the Save held while any debounced request from the slider would reach the queue.
    await page.clock.runFor(700)
    expect(await observeRewrite()).toEqual(inFlight)
    await relay('releaseSaves')
    await expect(inventory.getByText('1 of 1 up to date', { exact: true })).toHaveCount(1)
    await expect.poll(observeRewrite).toEqual({ ...inFlight, pending: 0 })
  } finally {
    await relay('releaseSaves')
  }
})
