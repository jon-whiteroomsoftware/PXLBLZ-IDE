import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures/authenticated'

const slider = (page: Page, name: string) => page.getByRole('slider', { name: `Slow-mo ${name}`, exact: true })
const section = (page: Page) => page.getByRole('region', { name: 'Slow-Mo', exact: true })

async function fresh(page: Page) {
  await page.goto('studio/patterns/KaleidoBloom?slowmo=1')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
  await expect(page.locator('.monaco-editor .view-lines').first()).toBeVisible()
  await expect(section(page)).toBeVisible()
  await expect(section(page).getByRole('slider')).toHaveCount(2)
  await expect(slider(page, 'speed')).toHaveValue('1')
  await expect(slider(page, 'dreamy')).toHaveValue('0')
}

async function tabTo(page: Page, control: Locator) {
  for (let count = 0; count < 40; count++) {
    if (await control.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(control).toBeFocused()
}

async function drag(page: Page, name: string, fraction: number) {
  const control = slider(page, name)
  await control.scrollIntoViewIfNeeded()
  const before = await control.inputValue()
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  const x = (value: number) => box!.x + 8 + (box!.width - 16) * value
  const y = box!.y + box!.height / 2
  await page.mouse.move(x(Number(before)), y)
  await page.mouse.down()
  await page.mouse.move(x(fraction), y, { steps: 10 })
  await page.mouse.up()
  await expect(control).not.toHaveValue(before)
  return Number(await control.inputValue())
}

async function copy(page: Page, position: number, decay: number) {
  const disclosure = section(page).getByRole('button', { name: 'Slow-Mo', exact: true })
  if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
  const button = section(page).getByRole('button', { name: 'Copy generated code', exact: true })
  let code = ''
  await expect.poll(async () => {
    await button.click()
    code = await page.evaluate(() => navigator.clipboard.readText())
    return code.includes(`var __pxlblz_slowmo_position = ${position}\n`)
      && code.includes(`var __pxlblz_slowmo_decay = ${decay}\n`)
  }).toBe(true)
  expect(code).toContain('__pxlblz_slowmo_in_beforeRender(16)')
  expect(code).toContain('slider__pxlblz_slowmo_speed')
  expect(code).not.toMatch(/__pxlblz_slowmo_(?:attack|curve|shape|width|step|offset)/)
  const pixels = await page.evaluate(async code => {
    const bundlePath = '/src/engine/bundle.ts'
    const runtimePath = '/src/engine/fastReplay.ts'
    const { bundle } = await import(bundlePath)
    const { createFastReplayRuntime } = await import(runtimePath)
    const runtime = createFastReplayRuntime({ ...bundle(code, {}), dimension: 2 }, {
      mapPoints: Array.from({ length: 16 }, (_, i) => ({ sample: [(i % 4) / 4, Math.floor(i / 4) / 4] })),
      randomSeed: 7, fidelity: 'fidelity',
    })
    runtime.advanceLive(0)
    return runtime.advanceLive(16).pixels
  }, code)
  expect(pixels).toHaveLength(16)
  for (const pixel of pixels) for (const value of pixel) expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true)
  await test.info().attach(`copy-decay-${decay}.js`, { body: code, contentType: 'text/javascript' })
}

for (const width of [1440, 900]) {
  test(`two sliders remain in one row collapsed and expanded at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await fresh(page)
    const disclosure = section(page).getByRole('button', { name: 'Slow-Mo', exact: true })
    for (const expanded of [false, true]) {
      if (await disclosure.getAttribute('aria-expanded') !== String(expanded)) await disclosure.click()
      await expect(section(page).getByRole('slider')).toHaveCount(2)
      const speed = await slider(page, 'speed').boundingBox()
      const dreamy = await slider(page, 'dreamy').boundingBox()
      expect(speed).not.toBeNull()
      expect(dreamy).not.toBeNull()
      expect(Math.abs(speed!.y - dreamy!.y)).toBeLessThanOrEqual(1)
      expect(speed!.x + speed!.width).toBeLessThan(dreamy!.x)
      expect(await section(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await section(page).screenshot({ path: test.info().outputPath(`slowmo-${width}-${expanded}.png`) })
    }
    const position = await drag(page, 'speed', 0.5)
    expect(Number(await slider(page, 'dreamy').inputValue())).toBe(0)
    await copy(page, position, 0)
    await slider(page, 'dreamy').focus()
    await slider(page, 'dreamy').press('End')
    await expect(slider(page, 'dreamy')).toHaveValue('1')
    await copy(page, position, 10000)
  })
}

test('native keyboard traversal edits both sliders and preserves the independent value', async ({ page }) => {
  await fresh(page)
  await section(page).getByRole('button', { name: 'Slow-Mo', exact: true }).focus()
  await tabTo(page, slider(page, 'speed'))
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await expect(slider(page, 'speed')).toHaveValue('0.001')
  await tabTo(page, slider(page, 'dreamy'))
  await page.keyboard.press('End')
  await expect(slider(page, 'dreamy')).toHaveValue('1')
  await expect(slider(page, 'speed')).toHaveValue('0.001')
  await page.keyboard.press('Home')
  await copy(page, 0.001, 0)
})
