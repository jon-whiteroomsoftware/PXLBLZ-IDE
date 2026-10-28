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
    ]) {
      await choose(page, control, value)
      await capture(`preserved-${value.replaceAll('/', '-')}`)
      await expect.poll(() => clocks(page), { message: `${control} ${value} preserves elapsed/patternMs/patternClock` }).toEqual(before)
    }
    await capture('live-still-executes', 512)
    await expect.poll(async () => Number((await clocks(page)).patternMs)).toBe(Number(before.patternMs) + 32)
    await expect.poll(async () => Number((await clocks(page)).patternClock)).toBeGreaterThan(Number(before.patternClock))
    await expect.poll(async () => parseFloat((await clocks(page)).elapsed)).toBeGreaterThan(parseFloat(before.elapsed))
  })
}

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
