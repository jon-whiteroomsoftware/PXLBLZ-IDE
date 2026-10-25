import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from './fixtures/authenticated'
import { seedShowV2 } from './support/showBackingRecords'
import { createDefaultShow } from '../src/engine/showModel'
import { parseEpe } from '../src/engine/epeImport'
import type { ControllerStatus } from '../src/engine/ControllerProvider'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'

test('keeps an export estimate when the active Controller exceeds the Portable Show pixel ceiling (#1222)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows')
  await expect(page.getByRole('button', { name: 'Add show' })).toBeVisible()
  const portable = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { stockShowV2ById } = await load('/PXLBLZ-IDE/src/pixelblaze/stock/showsV2.ts')
    return stockShowV2ById('stock-show-100-getting-around')
  }) as ShowRecordV2
  const id = randomUUID()
  await seedShowV2(page, createDefaultShow(id, 'Preparation refusal', 1000), 'Portable pricing refusal', {
    edit: (converted) => Object.assign(converted, portable, { id }),
  })
  await page.goto(`studio/shows/${id}`)
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { useControllerStore } = await load('/PXLBLZ-IDE/src/store/controllerStore.ts')
    const { useControllerProfileStore, defaultControllerProfile } = await load('/PXLBLZ-IDE/src/store/controllerProfileStore.ts')
    const { NullControllerProvider } = await load('/PXLBLZ-IDE/src/engine/ControllerProvider.ts')
    const { setControllerProvider } = await load('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts')
    const ip = '192.0.2.123'
    const provider = new NullControllerProvider()
    const status = { kind: 'connected', controller: { id: 'pricing-refusal', address: ip, deviceId: null } } satisfies ControllerStatus
    provider.getStatus = () => status
    provider.compile = async () => { throw Error('Pricing readout must never compile') }
    setControllerProvider(provider)
    useControllerProfileStore.setState({ profilesLoaded: true, profiles: [{
      ...defaultControllerProfile({ id: 'pricing-refusal-profile', name: 'Pricing refusal', ip, now: 1 }),
      lastSeenIp: ip, lastKnownPixelCount: 2001,
    }] })
    useControllerStore.setState({ activeIp: ip, controllers: {
      [ip]: { ip, phase: 'live', liveEpoch: 1223, mapDim: 2, firmwareVersion: '3.67' },
    }, lastShowArtifactCompilation: null })
  })
  const refusal = 'Target Controller reports 2,001 pixels; compiled Shows support at most 2,000. Reduce the Controller pixel count before Run or Save.'
  const toggle = page.getByRole('button', { name: 'Source code', exact: true })
  await toggle.click()
  // Deck omits section summaries while Source code is expanded (src/components/Deck.tsx:103; unchanged since a7704c06).
  await expect(page.getByLabel(/^(Show|Controller) source .* advisory\.$/)).toHaveCount(0)
  // The source outlet contains both the inventory and its sibling preparation-refusal notice.
  const inventory = page.getByTestId('show-source-outlet')
  await expect(inventory).toContainText(refusal)
  await expect(inventory.locator('[data-source-resource="Delivered source"]')).toContainText(/[1-9][\d.]* KB estimate \/ 53\.4 KB/)
  await expect(inventory.locator('[data-source-resource="Raw headroom"]')).toBeVisible()
  await expect(inventory.locator('[data-source-resource="Usable headroom"]')).toBeVisible()
  const output = process.env.PXLBLZ_CAPTURE_OUTPUT
  if (output) {
    await page.mouse.move(0, 0)
    await toggle.focus()
    await inventory.locator('[data-source-resource="Usable headroom"]').scrollIntoViewIfNeeded()
    await expect(page.getByRole('tooltip')).toBeHidden()
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: join(output, 'preparation-failed-1440-900.png') })
  }
})

test('prices the current full Show artifact and invalidates it when the live session changes (#1222)', async ({ page }) => {
  // One small Show, one download and six optional viewport captures. Allow
  // 60 s for the cold editor and capture I/O on the shared agent host.
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows')
  await expect(page.getByRole('button', { name: /Account menu for playwright-worker-\d+/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add show' })).toBeVisible()
  const show = createDefaultShow(randomUUID(), 'Pricing study', 1000)
  await seedShowV2(page, show, 'pricing study')
  await page.goto(`studio/shows/${show.id}`)

  // This provider and its record are controlled UI fixtures. No native
  // compilation or hardware measurement is performed by this test.
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { useControllerStore } = await load('/PXLBLZ-IDE/src/store/controllerStore.ts')
    const { NullControllerProvider } = await load('/PXLBLZ-IDE/src/engine/ControllerProvider.ts')
    const { setControllerProvider } = await load('/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts')
    const provider = new NullControllerProvider()
    const status = { kind: 'connected', controller: { id: 'pricing-synthetic', address: '192.0.2.122', deviceId: null } } satisfies ControllerStatus
    provider.getStatus = () => status
    provider.compile = async () => { throw Error('Pricing readout must never compile') }
    setControllerProvider(provider)
    useControllerStore.setState({
      activeIp: '192.0.2.122',
      controllers: { '192.0.2.122': { ip: '192.0.2.122', phase: 'live', liveEpoch: 1222, mapDim: null } },
      lastShowArtifactCompilation: null,
    })
  })
  const sourceToggle = page.getByRole('button', { name: 'Source code', exact: true })
  await test.step('ShowEditor mounts with the connected provider', async () => {
    await expect(sourceToggle).toBeVisible()
  })
  expect(errors).toEqual([])
  if (await sourceToggle.getAttribute('aria-expanded') === 'true') await sourceToggle.click()
  const gauge = page.getByLabel(/^Controller source .* advisory\.$/)
  await expect(gauge).toHaveAccessibleName(/estimate \/ 53\.4 KB advisory\.$/)

  // Reopen the public EPE to obtain the complete, banner-bearing source.
  // With no profile or map adaptation it is the Controller compile input.
  await page.getByRole('button', { name: 'Show actions', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download .epe', exact: true }).click()
  const download = await downloaded
  const source = parseEpe(await readFile((await download.path())!, 'utf8')).src
  const sourceSha256 = createHash('sha256').update(source).digest('hex')
  const byteLength = 70_000
  await page.evaluate(async (measurement) => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { useControllerStore } = await load('/PXLBLZ-IDE/src/store/controllerStore.ts')
    useControllerStore.setState({ lastShowArtifactCompilation: measurement })
  }, { controllerId: 'pricing-synthetic', liveEpoch: 1222, sourceSha256, byteLength })
  await expect(gauge).toHaveAccessibleName('Controller source 68.4 KB exact / 53.4 KB advisory.')

  const output = process.env.PXLBLZ_CAPTURE_OUTPUT
  const captures: object[] = []
  const viewports = output
    ? [{ width: 1440, height: 900 }, { width: 1180, height: 800 }, { width: 390, height: 844 }]
    : [{ width: 1440, height: 900 }]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const kind of ['exact', 'estimate'] as const) {
      await page.evaluate(async (live) => {
        const load = (path: string) => import(/* @vite-ignore */ path)
        const { useControllerStore } = await load('/PXLBLZ-IDE/src/store/controllerStore.ts')
        const state = useControllerStore.getState()
        useControllerStore.setState({ controllers: {
          ...state.controllers,
          '192.0.2.122': { ...state.controllers['192.0.2.122'], phase: live ? 'live' : 'pending' },
        } })
      }, kind === 'exact')
      const toggle = page.getByRole('button', { name: 'Source code', exact: true })
      if (await toggle.isVisible()) {
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
      } else {
        const trigger = page.getByRole('button', { name: /Show source inventory,/ })
        if (await trigger.getAttribute('aria-expanded') !== 'true') {
          await trigger.focus()
          await page.keyboard.press('Enter')
        }
      }
      const inventory = page.locator('.show-source-inventory-body:visible')
      const priced = inventory.locator('[data-source-resource="Controller source"]')
      await expect(priced).toContainText(`${kind} / 53.4 KB`)
      if (kind === 'exact') {
        await expect(priced).toContainText('128.0% advisory')
        await expect(inventory.locator('[data-source-resource="Raw headroom"]')).toContainText('-1,616 B')
        await expect(inventory.locator('[data-source-resource="Usable headroom"]')).toContainText('-15,293 B')
      }
      const help = inventory.getByRole('button', { name: 'About Controller source' })
      await help.focus()
      await expect(page.getByRole('tooltip')).toContainText('54,707 B provisional budget; 68,384 B firmware 3.67 observation.')
      if (output) {
        if (viewport.width === 1180) {
          await page.mouse.move(0, 0)
          await toggle.focus()
          await inventory.locator('[data-source-resource="Usable headroom"]').scrollIntoViewIfNeeded()
          await expect(page.getByRole('tooltip')).toBeHidden()
        }
        await mkdir(output, { recursive: true })
        const file = `${viewport.width}-${viewport.height}-${kind}.png`
        await page.screenshot({ path: join(output, file) })
        captures.push({ viewport, operation: kind === 'exact' ? 'current controlled record' : 'live to pending, record retained', kind, file,
          strings: await inventory.innerText(),
          layout: await inventory.evaluate((element) => {
            const box = element.getBoundingClientRect()
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth }
          }),
          keyboard: viewport.width === 1180
            ? 'inventory opened with native control; budget help verified, then Source code focused and tooltip hidden'
            : 'inventory opened with native control; budget help focused and tooltip visible',
        })
      }
    }
  }
  expect(errors).toEqual([])
  if (output) await writeFile(join(output, 'report.json'), JSON.stringify({
    codeSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    route: page.url(), measurement: { controlled: true, controllerId: 'pricing-synthetic', liveEpoch: 1222, sourceSha256, byteLength },
    limitation: 'Synthetic in-memory byteLength proves UI pricing, not native compilation or hardware capacity. Native 45-row evidence is separate.',
    consoleErrors: errors, captures,
  }, null, 2))
})
