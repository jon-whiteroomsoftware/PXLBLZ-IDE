import { readFile } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures/authenticated'
import { parseEpe } from '../src/engine/epeImport'

const slider = (page: Page, name: 'Slow-mo' | 'Dreamy') => page.getByRole('slider', { name, exact: true })
const section = (page: Page) => page.getByRole('region', { name: 'Wrappers', exact: true })

async function downloadEpe(page: Page): Promise<{ text: string; src: string }> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pattern actions' }).click()
  await page.getByRole('menuitem', { name: 'Download .epe' }).click()
  const download = await downloadPromise
  const text = await readFile((await download.path())!, 'utf8')
  return { text, src: parseEpe(text).src }
}

function recordMatches(actual: Record<string, unknown> | undefined, expected: Record<string, unknown> | undefined): boolean {
  if (expected === undefined) return actual === undefined
  if (!actual) return false
  const actualKeys = Object.keys(actual)
  const expectedKeys = Object.keys(expected)
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => actual[key] === expected[key])
}

function waitForDemoOverrideSave(page: Page, demoName: string, expected: Record<string, unknown> | undefined) {
  return page.waitForResponse((response) => {
    if (!response.ok() || response.request().method() !== 'PUT') return false
    if (!response.url().includes('/api/settings/demoOverrides')) return false
    const body = response.request().postDataJSON() as { value?: Record<string, Record<string, unknown>> } | null
    return recordMatches(body?.value?.[demoName], expected)
  })
}

function waitForPatternSettingsSave(page: Page, patternId: string, expected: Record<string, unknown>) {
  return page.waitForResponse((response) => {
    if (!response.ok() || response.request().method() !== 'PATCH') return false
    if (!response.url().includes(`/api/patterns/${patternId}`)) return false
    const body = response.request().postDataJSON() as { settings?: Record<string, unknown> } | null
    return recordMatches(body?.settings, expected)
  })
}

async function openPattern(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('.monaco-editor .view-lines').first()).toBeVisible()
  await expect(section(page)).toBeVisible()
  await expect(section(page).getByText('preview only', { exact: true })).toBeVisible()
}

async function setExpanded(page: Page, expanded: boolean) {
  const disclosure = section(page).getByRole('button', { name: 'Wrappers', exact: true })
  if (await disclosure.getAttribute('aria-expanded') !== String(expanded)) await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', String(expanded))
}

async function fresh(page: Page) {
  await openPattern(page, 'studio/patterns/KaleidoBloom')
  await setExpanded(page, true)
  await expect(section(page).getByRole('slider')).toHaveCount(2)
  await expect(slider(page, 'Slow-mo')).toHaveValue('0')
  await expect(slider(page, 'Slow-mo')).toHaveAttribute('aria-valuetext', 'off')
  await expect(slider(page, 'Dreamy')).toHaveValue('0')
  await expect(slider(page, 'Dreamy')).toHaveAttribute('aria-valuetext', '0%')
}

async function tabTo(page: Page, control: Locator) {
  for (let count = 0; count < 40; count++) {
    if (await control.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(control).toBeFocused()
}

async function drag(page: Page, name: 'Slow-mo' | 'Dreamy', fraction: number) {
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

async function setByKeyboard(page: Page, name: 'Slow-mo' | 'Dreamy', tenths: number) {
  const control = slider(page, name)
  await control.focus()
  await control.press('Home')
  for (let i = 0; i < tenths; i++) await control.press('PageUp')
  await expect(control).toHaveValue(String(tenths / 10))
}

async function seedPattern(page: Page, id: string, name: string, src: string) {
  const response = await page.context().request.post('/api/patterns', {
    data: { id, name, src, controls: {}, updatedAt: Date.now() },
  })
  expect(response.ok(), `POST /api/patterns -> ${response.status()}`).toBe(true)
}

for (const width of [1440, 900]) {
  test(`Wrappers ships without URL flag with folded readout and expanded slider row at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await fresh(page)
    for (const expanded of [false, true]) {
      await setExpanded(page, expanded)
      await expect(section(page).getByRole('slider')).toHaveCount(expanded ? 2 : 0)
      if (expanded) {
        const slowMo = await slider(page, 'Slow-mo').boundingBox()
        const dreamy = await slider(page, 'Dreamy').boundingBox()
        expect(slowMo).not.toBeNull()
        expect(dreamy).not.toBeNull()
        expect(Math.abs(slowMo!.y - dreamy!.y)).toBeLessThanOrEqual(1)
        expect(slowMo!.x + slowMo!.width).toBeLessThan(dreamy!.x)
      } else {
        await expect(section(page).locator('[data-deck="section-summary"]')).toHaveText('slow-mooff·dreamy0%')
      }
      await expect(section(page).getByRole('button')).toHaveCount(1)
      expect(await section(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`wrappers-${width}-${expanded}.png`) })
    }
    await drag(page, 'Slow-mo', 0.5)
    expect(Number(await slider(page, 'Dreamy').inputValue())).toBe(0)
    await slider(page, 'Dreamy').focus()
    await slider(page, 'Dreamy').press('End')
    await expect(slider(page, 'Dreamy')).toHaveValue('1')
  })
}

test('native keyboard traversal edits both sliders and preserves the independent value', async ({ page }) => {
  await fresh(page)
  await section(page).getByRole('button', { name: 'Wrappers', exact: true }).focus()
  await tabTo(page, slider(page, 'Slow-mo'))
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await expect(slider(page, 'Slow-mo')).toHaveValue('0.001')
  await expect(slider(page, 'Slow-mo')).not.toHaveAttribute('aria-valuetext', 'off')
  await tabTo(page, slider(page, 'Dreamy'))
  await page.keyboard.press('End')
  await expect(slider(page, 'Dreamy')).toHaveValue('1')
  await expect(slider(page, 'Slow-mo')).toHaveValue('0.001')
  await page.keyboard.press('Home')
  await expect(slider(page, 'Dreamy')).toHaveValue('0')
})

test('persists per-Pattern Wrappers values across stock demo and user Pattern switches, reload, reset, and declined Pattern', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const userId = 'wrappers-persist-user'
  const declinedId = 'wrappers-declined-user'
  await seedPattern(page, userId, 'Wrappers Persist User', 'export function render(index) { rgb(1, 0.5, 0) }')
  await seedPattern(page, declinedId, 'Wrappers Declined User', 'var time = 1; export function render(index) { rgb(0, 1, 0) }')

  // 1. Set values on stock demo KaleidoBloom
  await openPattern(page, 'studio/patterns/KaleidoBloom')
  await setExpanded(page, true)
  const demoSave = waitForDemoOverrideSave(page, 'KaleidoBloom', { slowMo: 0.5 })
  await setByKeyboard(page, 'Slow-mo', 5)
  await demoSave
  const demoSave2 = waitForDemoOverrideSave(page, 'KaleidoBloom', { slowMo: 0.5, dreamy: 0.3 })
  await setByKeyboard(page, 'Dreamy', 3)
  await demoSave2
  await expect(slider(page, 'Slow-mo')).toHaveAttribute('aria-valuetext', '1/4×')
  await expect(slider(page, 'Dreamy')).toHaveAttribute('aria-valuetext', '30%')

  // 2. Switch to user Pattern, verify defaults, capture baseline .epe download, then set its own values
  await openPattern(page, `studio/patterns/${userId}`)
  await setExpanded(page, true)
  await expect(slider(page, 'Slow-mo')).toHaveValue('0')
  await expect(slider(page, 'Dreamy')).toHaveValue('0')
  const baselineEpe = await downloadEpe(page)
  const userSave = waitForPatternSettingsSave(page, userId, { slowMo: 0.7 })
  await setByKeyboard(page, 'Slow-mo', 7)
  await userSave
  const userSave2 = waitForPatternSettingsSave(page, userId, { slowMo: 0.7, dreamy: 0.4 })
  await setByKeyboard(page, 'Dreamy', 4)
  await userSave2

  // 3. Reload user Pattern, read values back, and prove production .epe download is unchanged
  await page.reload()
  await expect(section(page)).toBeVisible()
  await setExpanded(page, true)
  await expect(slider(page, 'Slow-mo')).toHaveValue('0.7')
  await expect(slider(page, 'Dreamy')).toHaveValue('0.4')
  const overriddenEpe = await downloadEpe(page)
  const stripStamp = (s: string) => s.replace(/stamped=\S+/g, 'stamped=<ts>')
  expect(stripStamp(overriddenEpe.src)).toBe(stripStamp(baselineEpe.src))
  expect(stripStamp(overriddenEpe.text)).toBe(stripStamp(baselineEpe.text))

  // 4. Switch back to stock demo and reload to verify independent persistence
  await openPattern(page, 'studio/patterns/KaleidoBloom')
  await setExpanded(page, true)
  await expect(slider(page, 'Slow-mo')).toHaveValue('0.5')
  await expect(slider(page, 'Dreamy')).toHaveValue('0.3')
  await page.reload()
  await expect(section(page)).toBeVisible()
  await setExpanded(page, true)
  await expect(slider(page, 'Slow-mo')).toHaveValue('0.5')
  await expect(slider(page, 'Dreamy')).toHaveValue('0.3')

  // 5. Return sliders to 0 on stock demo and confirm override is removed (not stored as 0)
  const clear1 = waitForDemoOverrideSave(page, 'KaleidoBloom', { dreamy: 0.3 })
  await setByKeyboard(page, 'Slow-mo', 0)
  await clear1
  const clear2 = waitForDemoOverrideSave(page, 'KaleidoBloom', undefined)
  await setByKeyboard(page, 'Dreamy', 0)
  await clear2
  const storedDemo = await page.context().request.get('/api/settings/demoOverrides')
  expect(storedDemo.ok()).toBe(true)
  const storedBody = await storedDemo.json() as { value?: Record<string, Record<string, unknown>> }
  expect(storedBody.value?.KaleidoBloom).toBeUndefined()

  // 6. Declined Pattern shows reason when active and clears on reset to 0
  await openPattern(page, `studio/patterns/${declinedId}`)
  await setExpanded(page, true)
  await expect(section(page).getByRole('status')).toHaveCount(0)
  await setByKeyboard(page, 'Slow-mo', 5)
  await expect(section(page).getByRole('status')).toContainText('cannot wrap a top-level binding named time')
  await setByKeyboard(page, 'Slow-mo', 0)
  await expect(section(page).getByRole('status')).toHaveCount(0)
})
