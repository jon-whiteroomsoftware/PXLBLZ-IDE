import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures/authenticated'

test.use({ viewport: { width: 1440, height: 900 } })

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const slider = (page: Page, name: string) => page.getByRole('slider', { name: `Slow-mo ${name}`, exact: true })

async function mouseClick(page: Page, control: Locator) {
  await expect(control).toBeVisible()
  await expect(control).toBeEnabled()
  await control.scrollIntoViewIfNeeded()
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

async function choose(page: Page, name: string, value: string) {
  const control = button(page, `Slow-mo ${name}`)
  await mouseClick(page, control)
  await mouseClick(page, page.getByRole('option', { name: value, exact: true }))
  await expect(control).toHaveText(value)
}

async function drag(page: Page, name: string, fraction: number) {
  const control = slider(page, name)
  await expect(control).toBeEnabled()
  await control.scrollIntoViewIfNeeded()
  const before = await control.inputValue()
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  const min = Number(await control.getAttribute('min'))
  const max = Number(await control.getAttribute('max'))
  const position = (Number(before) - min) / (max - min)
  const x = (value: number) => box!.x + 8 + (box!.width - 16) * value
  const y = box!.y + box!.height / 2
  await page.mouse.move(x(position), y)
  await page.mouse.down()
  await page.mouse.move(x(fraction), y, { steps: 10 })
  await page.mouse.up()
  await expect(control).not.toHaveValue(before)
  return Number(await control.inputValue())
}

// Tab traversal proves controls remain in the keyboard path from fresh Off.
async function tabTo(page: Page, control: Locator, backwards = false) {
  for (let count = 0; count < 40; count++) {
    if (await control.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab')
  }
  await expect(control).toBeFocused()
}

async function keyboardChoose(page: Page, name: string, keys: string[], value: string, backwards = false) {
  const control = button(page, `Slow-mo ${name}`)
  await tabTo(page, control, backwards)
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox', { name: `Slow-mo ${name}`, exact: true })).toBeVisible()
  // The portaled menu focuses its selected option on the next task.
  await expect(page.getByRole('option', { selected: true })).toBeFocused()
  for (const key of keys) await page.keyboard.press(key)
  await page.keyboard.press('Enter')
  await expect(control).toHaveText(value)
  await expect(control).toBeFocused()
}

async function copy(page: Page, keyboard = false) {
  const control = button(page, 'Copy generated code')
  await expect(control).toBeEnabled()
  if (keyboard) {
    await tabTo(page, control)
    await page.keyboard.press('Enter')
  } else await mouseClick(page, control)
  return page.evaluate(() => navigator.clipboard.readText())
}

async function fresh(page: Page) {
  await page.goto('studio/patterns/KaleidoBloom?slowmo=1')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
  await expect(page.locator('.monaco-editor .view-lines').first()).toBeVisible()
  await expect(page.getByTestId('preview-pane').locator('canvas.rounded-sm')).toBeVisible()
  const preview = page.getByTestId('preview-deck').getByRole('button', { name: 'Preview', exact: true })
  if (await preview.getAttribute('aria-expanded') !== 'true') await mouseClick(page, preview)
  await expect(page.getByTestId('slowmo-lab')).toBeVisible()
  await expect(button(page, 'Slow-mo method')).toHaveText('Off')
  await expect(button(page, 'Slow-mo persistence')).toHaveText('Off')
  await expect(button(page, 'Slow-mo rate')).toHaveText('1')
  await expect(button(page, 'Slow-mo step')).toHaveText('16 ms')
  await expect(button(page, 'Slow-mo stagger')).toHaveText('Sweep')
  await expect(slider(page, 'stagger width')).toHaveValue('0')
  await expect(slider(page, 'attack')).toHaveValue('0')
  await expect(slider(page, 'decay')).toHaveValue('2000')
  return copy(page)
}

function initializer(code: string, name: string) {
  const match = code.match(new RegExp(`\\b__pxlblz_slowmo_${name}\\s*=\\s*([-+\\d.eE]+)`))
  expect(match, `${name} initializer in copied artifact`).not.toBeNull()
  return Number(match![1])
}

async function activeCopy(page: Page, expected: Record<string, number>, keyboard = false) {
  let code = ''
  await expect.poll(async () => {
    code = await copy(page, keyboard)
    // Wait for the artifact publication rather than reading a stale Off copy.
    return /\b__pxlblz_slowmo_rate\s*=/.test(code)
  }).toBe(true)
  for (const [name, value] of Object.entries(expected)) expect(initializer(code, name), name).toBeCloseTo(value, 8)
  return code
}

test('fresh Off accepts real pointer edits and preserves exact Copy through Off and Clock round trips', async ({ page }) => {
  const baseline = await fresh(page)
  await choose(page, 'method', 'Off')
  await choose(page, 'rate', '1/4')
  await choose(page, 'step', '32 ms')
  await choose(page, 'stagger', 'Scatter')
  await choose(page, 'persistence', 'On')
  const width = await drag(page, 'stagger width', 0.6)
  const attack = await drag(page, 'attack', 0.6)
  const decay = await drag(page, 'decay', 0.7)
  expect(await copy(page)).toBe(baseline)
  const retained = async () => {
    await expect(button(page, 'Slow-mo rate')).toHaveText('1/4')
    await expect(button(page, 'Slow-mo step')).toHaveText('32 ms')
    await expect(button(page, 'Slow-mo stagger')).toHaveText('Scatter')
    await expect(button(page, 'Slow-mo persistence')).toHaveText('On')
    await expect(slider(page, 'stagger width')).toHaveValue(String(width))
    await expect(slider(page, 'attack')).toHaveValue(String(attack))
    await expect(slider(page, 'decay')).toHaveValue(String(decay))
  }
  await choose(page, 'method', 'Blend')
  const active = await activeCopy(page, { rate: 0.25, step: 32, curve: 1, shape: 2, width, attack, decay })
  await choose(page, 'method', 'Off')
  await retained()
  await expect.poll(() => copy(page)).toBe(baseline)
  await choose(page, 'method', 'Blend')
  await retained()
  await expect.poll(() => copy(page)).toBe(active)
  await choose(page, 'method', 'Clock')
  const stagger = page.getByRole('group', { name: 'Stagger', exact: true })
  await expect(stagger).toHaveCSS('opacity', '0.45')
  await expect(button(page, 'Slow-mo stagger')).toBeDisabled()
  await expect(slider(page, 'stagger width')).toBeDisabled()
  await retained()
  await choose(page, 'method', 'Blend')
  await expect(button(page, 'Slow-mo stagger')).toBeEnabled()
  await expect(slider(page, 'stagger width')).toBeEnabled()
  await retained()
  await expect.poll(() => copy(page)).toBe(active)
})

test('fresh Off controls participate in Tab traversal and keyboard edits project to Copy', async ({ page }) => {
  const baseline = await fresh(page)
  // Copy is the last lab control; traverse backwards to start at rate.
  await tabTo(page, button(page, 'Slow-mo rate'), true)
  await keyboardChoose(page, 'rate', ['Home', 'ArrowDown', 'ArrowDown'], '1/4')
  await keyboardChoose(page, 'step', ['End'], '32 ms')
  await keyboardChoose(page, 'method', ['Home'], 'Off')
  await keyboardChoose(page, 'stagger', ['End'], 'Scatter')
  const width = slider(page, 'stagger width')
  await tabTo(page, width)
  for (const [key, value] of [['Home', '0'], ['ArrowRight', '0.01'], ['End', '0.9']]) {
    await page.keyboard.press(key)
    await expect(width).toHaveValue(value)
  }
  await keyboardChoose(page, 'persistence', ['Home', 'End'], 'On')
  for (const [name, max] of [['attack', '5000'], ['decay', '10000']]) {
    const control = slider(page, name)
    await tabTo(page, control)
    for (const [key, value] of [['Home', '0'], ['ArrowRight', '1'], ['End', max]]) {
      await page.keyboard.press(key)
      await expect(control).toHaveValue(value)
    }
  }
  expect(await copy(page, true)).toBe(baseline)
  await keyboardChoose(page, 'method', ['Home', 'ArrowDown', 'ArrowDown', 'ArrowDown'], 'Blend', true)
  const expected = { rate: 0.25, step: 32, curve: 1, shape: 2, width: 0.9, attack: 5000, decay: 10000 }
  const active = await activeCopy(page, expected, true)
  await keyboardChoose(page, 'method', ['Home'], 'Off', true)
  await expect.poll(() => copy(page, true)).toBe(baseline)
  await keyboardChoose(page, 'method', ['Home', 'ArrowDown', 'ArrowDown', 'ArrowDown'], 'Blend', true)
  await expect.poll(() => copy(page, true)).toBe(active)
})

test('all three dials edit before either Method or After-effect activation', async ({ page }) => {
  const baseline = await fresh(page)
  const width = await drag(page, 'stagger width', 0.5)
  const attack = await drag(page, 'attack', 0.4)
  const decay = await drag(page, 'decay', 0.8)
  expect(await copy(page)).toBe(baseline)
  await choose(page, 'persistence', 'On')
  expect(await copy(page)).toBe(baseline)
  await choose(page, 'method', 'Blend')
  const expected = { rate: 1, step: 16, curve: 1, shape: 0, width, attack, decay }
  const active = await activeCopy(page, expected)
  await choose(page, 'persistence', 'Off')
  await expect(slider(page, 'attack')).toBeEnabled()
  await expect(slider(page, 'decay')).toBeEnabled()
  await choose(page, 'persistence', 'On')
  await expect.poll(() => copy(page)).toBe(active)
})
