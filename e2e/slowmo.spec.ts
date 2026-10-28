import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/authenticated'
import { clearEditorSource } from './support/editorSource'
import { sequenceFrameName } from '../src/dev/captureSequence'

const source = (prime: string, later: string) => `export var patternMs = 0, patternClock = 0; export function beforeRender(delta) { patternMs += delta; patternClock = time(1) * 1024 } export function render(index) { if (patternMs == 0) rgb(${prime}); else rgb(${later}) }`
const originalSource = source('1,0,0', '1,0,1')
const editedSource = source('0,1,0', '1,1,0')

test.use({ viewport: { width: 1440, height: 1000 } })

async function seed(page: Page, id: string, name: string, src: string) {
  const pattern = { id, name, src, controls: {}, updatedAt: Date.now() }
  const response = await page.context().request.post('/api/patterns', { data: pattern })
  expect(response.ok(), `POST /api/patterns -> ${response.status()}`).toBe(true)
  return pattern
}

async function expand(page: Page, name: string) {
  const button = page.getByTestId('preview-deck').getByRole('button', { name, exact: true })
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
}

async function choose(page: Page, name: string, value: string) {
  const button = page.getByRole('button', { name, exact: true })
  await button.click()
  await page.getByRole('option', { name: value, exact: true }).click()
  await expect(button).toHaveText(value)
}

async function setStaggerWidth(page: Page, value: number): Promise<void> {
  const slider = page.getByRole('slider', { name: 'Slow-mo stagger width', exact: true })
  await slider.focus()
  await slider.press('Home')
  if (value === 0.9) await slider.press('End')
  else for (let step = 0; step < Math.round(value * 100); step++) await slider.press('ArrowRight')
  await expect(slider).toHaveValue(String(value))
}

async function published(page: Page, src: string) {
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expect.poll(() => page.evaluate(() => window.__pxlblz?.getPreviewSource())).toBe(src)
}

async function setup(page: Page, id: string, src: string, fidelity: 'fast' | 'fidelity') {
  await page.goto(`studio/patterns/${id}?capture&slowmo=1`)
  await expect(page.locator('.monaco-editor .view-lines').first()).toBeVisible()
  await published(page, src)
  await page.evaluate((fidelity) => window.__pxlblz!.setPreview({
    isRunning: false, fidelity, brightness: 1, diffusion: 0,
  }), fidelity)
  await expand(page, 'Preview')
  await choose(page, 'Slow-mo method', 'Blend')
  await choose(page, 'Slow-mo rate', '1/4')
  await choose(page, 'Slow-mo step', '16 ms')
  await expand(page, 'Variables')
}

async function captures(page: Page) {
  const frames = new Map<string, Buffer>()
  await page.route(/\/__capture\?/, async (route) => {
    const name = new URL(route.request().url()).searchParams.get('name') ?? ''
    const body = route.request().postDataBuffer()
    if (!body) throw new Error(`capture ${name} arrived without a body`)
    frames.set(name, body)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, bytes: body.length }) })
  })
  return async (prefix: string, delta = 0) => {
    const count = delta === 0 ? 1 : 2
    const outcome = await page.evaluate(({ prefix, delta, count }) => window.__pxlblz!.captureSequence({
      frames: count, fps: delta === 0 ? 60 : 1000 / delta, prefix, startMs: 0,
    }), { prefix, delta, count })
    expect(outcome.failures).toEqual([])
    const png = frames.get(sequenceFrameName(prefix, count - 1))
    expect(png, `${prefix} PNG received`).toBeTruthy()
    await test.info().attach(prefix, { body: png!, contentType: 'image/png' })
    return png!
  }
}

async function channels(page: Page, png: Buffer) {
  return page.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const maxima = [0, 0, 0]
    let lit = 0
    for (let i = 0; i < data.length; i += 4) {
      // The renderer background is dark and neutral; only measure LED ink.
      if (Math.max(data[i], data[i + 1], data[i + 2]) < 50) continue
      lit++
      for (let c = 0; c < 3; c++) maxima[c] = Math.max(maxima[c], data[i + c])
    }
    return { maxima, lit }
  }, png.toString('base64'))
}

async function primary(page: Page, png: Buffer, channel: number) {
  const { maxima, lit } = await channels(page, png)
  expect(lit, 'positive LED ink').toBeGreaterThan(0)
  expect(maxima[channel]).toBeGreaterThan(100)
  for (let c = 0; c < 3; c++) if (c !== channel) expect(maxima[c], `absent channel ${c}`).toBeLessThanOrEqual(4)
}

async function clocks(page: Page) {
  const deck = page.getByTestId('preview-deck')
  const elapsed = deck.locator('[data-deck="cell"]').filter({ has: page.getByText('elapsed', { exact: true }) }).locator('span').last()
  const watched = (name: string) => deck.locator('.panel-variable-values > div')
    .filter({ has: page.locator(`span[title="${name}"]`) }).locator('.text-live.tabular-nums')
  return {
    elapsed: await elapsed.innerText(),
    patternMs: await watched('patternMs').innerText(),
    patternClock: await watched('patternClock').innerText(),
  }
}

async function zeroClocks(page: Page) {
  await expect.poll(() => clocks(page)).toEqual({ elapsed: '0.0s', patternMs: '0', patternClock: '0' })
}

for (const fidelity of ['fast', 'fidelity'] as const) {
  test(`source edit and same-source Pattern switch re-prime frame 0 (${fidelity})`, async ({ page }) => {
    test.setTimeout(90_000)
    const capture = await captures(page)
    const a = await seed(page, 'slowmo-a', 'Slowmo lifecycle A', originalSource)
    const b = await seed(page, 'slowmo-b', 'Slowmo lifecycle B', editedSource)
    await setup(page, a.id, a.src, fidelity)
    await primary(page, await capture('initial-red'), 0)
    await zeroClocks(page)
    const dirtyOriginal = await channels(page, await capture('red-to-magenta', 80))
    expect(dirtyOriginal.maxima[2], 'old A/B contains blue').toBeGreaterThan(20)

    await clearEditorSource(page, page.locator('.monaco-editor').first())
    await page.keyboard.type(editedSource)
    await published(page, editedSource)
    await primary(page, await capture('edited-green'), 1)
    await zeroClocks(page)
    const dirtyEdited = await channels(page, await capture('green-to-yellow', 80))
    expect(dirtyEdited.maxima[0], 'edited A/B contains red').toBeGreaterThan(20)

    await page.getByRole('tree', { name: 'Patterns', exact: true }).getByRole('treeitem')
      .filter({ hasText: b.name }).click()
    await expect.poll(() => new URL(page.url()).pathname).toMatch(new RegExp(`/studio/patterns/${b.id}$`))
    expect(new URL(page.url()).searchParams.get('slowmo')).toBe('1')
    await published(page, b.src)
    await primary(page, await capture('switched-green'), 1)
    await zeroClocks(page)
  })

  test(`live tunables preserve elapsed and Pattern clock (${fidelity})`, async ({ page }) => {
    test.setTimeout(90_000)
    const capture = await captures(page)
    const a = await seed(page, 'slowmo-live', 'Slowmo live tunables', originalSource)
    await setup(page, a.id, a.src, fidelity)
    await capture('live-prime')
    await capture('live-positive', 1024)
    await expect.poll(async () => {
      const value = await clocks(page)
      return Object.values(value).every((scalar) => parseFloat(scalar) > 0)
    }).toBe(true)
    const before = await clocks(page)
    for (const [control, value] of [
      ['Slow-mo rate', '1/16'], ['Slow-mo step', '32 ms'],
      ['Slow-mo method', 'Hold'], ['Slow-mo method', 'Eased'], ['Slow-mo method', 'Blend'],
      ['Slow-mo stagger', 'Sweep'], ['Slow-mo stagger', 'Radial'], ['Slow-mo stagger', 'Scatter'],
    ]) {
      await choose(page, control, value)
      await capture(`preserved-${value.replaceAll('/', '-')}`)
      await expect.poll(() => clocks(page), { message: `${control} ${value} preserves elapsed/patternMs/patternClock` }).toEqual(before)
    }
    for (const width of [0, 0.5, 0.9]) {
      await setStaggerWidth(page, width)
      await capture(`preserved-width-${width}`)
      await expect.poll(() => clocks(page), { message: `width ${width} preserves elapsed/patternMs/patternClock` }).toEqual(before)
      await expect(page.getByRole('button', { name: 'Slow-mo stagger', exact: true })).toHaveText('Scatter')
    }
    await capture('live-still-executes', 512)
    await expect.poll(async () => Number((await clocks(page)).patternMs)).toBe(Number(before.patternMs) + 32)
    await expect.poll(async () => Number((await clocks(page)).patternClock)).toBeGreaterThan(Number(before.patternClock))
    await expect.poll(async () => parseFloat((await clocks(page)).elapsed)).toBeGreaterThan(parseFloat(before.elapsed))
  })
}

test('stagger controls fit desktop and narrow layouts and support keyboard round trips', async ({ page }) => {
  const a = await seed(page, 'slowmo-stagger-controls', 'Slowmo stagger controls', originalSource)
  await setup(page, a.id, a.src, 'fast')
  await choose(page, 'Slow-mo stagger', 'Sweep')
  await setStaggerWidth(page, 0.5)
  const lab = page.getByTestId('slowmo-lab')
  const shape = lab.getByRole('button', { name: 'Slow-mo stagger', exact: true })
  const width = lab.getByRole('slider', { name: 'Slow-mo stagger width', exact: true })
  const copy = lab.getByRole('button', { name: 'Copy generated code', exact: true })
  for (const [name, viewport] of [
    ['1237-k8-desktop', { width: 1440, height: 1000 }],
    ['1237-k8-narrow', { width: 768, height: 1000 }],
  ] as const) {
    await page.setViewportSize(viewport)
    await lab.scrollIntoViewIfNeeded()
    for (const control of [shape, width, copy]) {
      await expect(control).toBeVisible()
      await expect(control).toBeEnabled()
      const bounds = await control.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
    }
    await expect(shape).toHaveText('Sweep')
    await expect(width).toHaveValue('0.5')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await lab.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await test.info().attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  }
  await shape.focus()
  await shape.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(shape).toHaveText('Scatter')
  await shape.focus()
  await shape.press('ArrowDown')
  await page.keyboard.press('Escape')
  await expect(shape).toBeFocused()
  await width.focus()
  for (const [key, value] of [['Home', '0'], ['ArrowRight', '0.01'], ['End', '0.9'], ['Home', '0']]) {
    await width.press(key)
    await expect(width).toHaveValue(value)
  }
  await width.press('Tab')
  await expect(width).not.toBeFocused()
  await setStaggerWidth(page, 0.5)
  await choose(page, 'Slow-mo method', 'Clock')
  await expect(shape).toBeDisabled()
  await expect(width).toBeDisabled()
  await expect(shape).toHaveText('Scatter')
  await expect(width).toHaveValue('0.5')
  await choose(page, 'Slow-mo method', 'Blend')
  await expect(shape).toBeEnabled()
  await expect(width).toBeEnabled()
  await expect(shape).toHaveText('Scatter')
  await expect(width).toHaveValue('0.5')
  await choose(page, 'Slow-mo method', 'Off')
  await expect(shape).toBeDisabled()
  await expect(width).toBeDisabled()
})

test('absent flag hides the lab on a loaded Pattern editor', async ({ page }) => {
  const a = await seed(page, 'slowmo-absent', 'Slowmo absent flag', originalSource)
  await page.goto(`studio/patterns/${a.id}`)
  await expect(page.locator('.monaco-editor .view-lines').first()).toBeVisible()
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expect(page.getByTestId('preview-pane').locator('canvas.rounded-sm')).toBeVisible()
  await expand(page, 'Preview')
  await expect(page.getByTestId('preview-deck').getByRole('slider', { name: 'Light size', exact: true })).toBeVisible()
  await expect(page.getByTestId('slowmo-lab')).toHaveCount(0)
})
