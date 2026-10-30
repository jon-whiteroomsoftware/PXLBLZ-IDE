import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures/authenticated'

const slider = (page: Page, name: string) => page.getByRole('slider', { name: `Slow-mo ${name}`, exact: true })
const section = (page: Page) => page.getByRole('region', { name: 'Slow-Mo', exact: true })

async function fresh(page: Page) {
  await page.goto('studio/patterns/KaleidoBloom?slowmo=1')
  await expect(page.locator('.monaco-editor .view-lines').first()).toBeVisible()
  await expect(section(page)).toBeVisible()
  const disclosure = section(page).getByRole('button', { name: 'Slow-Mo', exact: true })
  if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
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

for (const width of [1440, 900]) {
  test(`Slow-Mo has a folded readout and expanded slider row at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await fresh(page)
    const disclosure = section(page).getByRole('button', { name: 'Slow-Mo', exact: true })
    for (const expanded of [false, true]) {
      if (await disclosure.getAttribute('aria-expanded') !== String(expanded)) await disclosure.click()
      await expect(section(page).getByRole('slider')).toHaveCount(expanded ? 2 : 0)
      if (expanded) {
        const speed = await slider(page, 'speed').boundingBox()
        const dreamy = await slider(page, 'dreamy').boundingBox()
        expect(speed).not.toBeNull()
        expect(dreamy).not.toBeNull()
        expect(Math.abs(speed!.y - dreamy!.y)).toBeLessThanOrEqual(1)
        expect(speed!.x + speed!.width).toBeLessThan(dreamy!.x)
      } else {
        await expect(section(page).locator('[data-deck="section-summary"]')).toHaveText('speed1×·dreamy0%')
      }
      await expect(section(page).getByRole('button')).toHaveCount(1)
      expect(await section(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`slowmo-${width}-${expanded}.png`) })
    }
    await drag(page, 'speed', 0.5)
    expect(Number(await slider(page, 'dreamy').inputValue())).toBe(0)
    await slider(page, 'dreamy').focus()
    await slider(page, 'dreamy').press('End')
    await expect(slider(page, 'dreamy')).toHaveValue('1')
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
  await expect(slider(page, 'dreamy')).toHaveValue('0')
})
