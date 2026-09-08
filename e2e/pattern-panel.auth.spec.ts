import { test, expect } from './fixtures/authenticated'
import type { Page } from '@playwright/test'

async function paneWidth(page: Page, width: number) {
  const pane = page.getByTestId('preview-pane')
  const divider = page.getByRole('separator', { name: 'Resize preview pane' })
  const box = (await divider.boundingBox())!
  const current = (await pane.boundingBox())!.width
  await page.mouse.move(box.x + box.width / 2, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 100)
  await page.mouse.up()
  await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(width)
}

for (const profile of ['Show', 'Pattern'] as const) {
  test(`${profile} preview sliders repaint while paused and leave Space for playback (#63)`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(profile === 'Show'
      ? 'studio/shows/stock-show-showcase-distortion-effects?capture'
      : 'studio/patterns/TestPattern2D?capture')
    const transport = profile === 'Show'
      ? page.getByTestId('show-timeline-toolbar')
      : page.getByTestId('preview-pane')
    const play = transport.getByRole('button', { name: profile === 'Show' ? 'Play Show preview' : 'Run', exact: true })
    const pause = transport.getByRole('button', { name: profile === 'Show' ? 'Pause Show preview' : 'Pause', exact: true })
    await expect(play.or(pause)).toBeVisible()
    if (await pause.isVisible()) await pause.click()
    if (profile === 'Pattern') {
      const disclosure = transport.getByRole('button', { name: 'Preview', exact: true })
      if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
    }
    const canvas = profile === 'Show'
      ? page.getByTestId('show-stage-preview').locator('canvas')
      : transport.locator('canvas.rounded-sm')
    const pixels = () => canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement
      const gl = target.getContext('webgl')!
      const frame = new Uint8Array(target.width * target.height * 4)
      gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, frame)
      let checksum = 2166136261
      let maxChannel = 0
      for (let index = 0; index < frame.length; index += 4) {
        maxChannel = Math.max(maxChannel, frame[index], frame[index + 1], frame[index + 2])
        checksum = Math.imul(checksum ^ frame[index], 16777619)
        checksum = Math.imul(checksum ^ frame[index + 1], 16777619)
        checksum = Math.imul(checksum ^ frame[index + 2], 16777619)
      }
      return { checksum, maxChannel }
    })
    await expect.poll(async () => (await pixels()).maxChannel).toBeGreaterThan(0)
    for (const name of ['Light size', 'Diffusion']) {
      const slider = page.getByRole('slider', { name, exact: true })
      await slider.focus()
      await page.keyboard.press('Home')
      const before = await pixels()
      await page.keyboard.press('End')
      await expect.poll(async () => (await pixels()).checksum).not.toBe(before.checksum)
      await expect(play).toBeVisible()
      await expect(slider).toBeFocused()
      const value = Number(await slider.inputValue())
      await page.keyboard.press('ArrowLeft')
      await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(value)
      await expect(slider).toBeFocused()
      await page.keyboard.press('Space')
      await expect(pause).toBeVisible()
      await page.keyboard.press('Space')
      await expect(play).toBeVisible()

      const box = (await slider.boundingBox())!
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 })
      await page.mouse.up()
      await expect(slider).not.toBeFocused()
      await page.keyboard.press('Space')
      await expect(pause).toBeVisible()
      await page.keyboard.press('Space')
      await expect(play).toBeVisible()
    }
  })
}

test('Pattern panel preserves controls, Space ownership, canvas execution and reload preferences (#968)', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1450, height: 1000 })
  await page.goto('studio/patterns/IridescentFibers')
  const pane = page.getByTestId('preview-pane')
  const section = (name: string) => pane.getByRole('button', { name, exact: true })
  await expect(pane.getByTestId('pattern-preview-title')).toContainText('IridescentFibers')
  for (const name of ['Pixelblaze', 'Preview', 'Variables']) await expect(section(name)).toHaveAttribute('aria-expanded', 'false')
  await expect(section('Controls')).toHaveAttribute('aria-expanded', 'true')
  const brightness = pane.getByTestId('pattern-preview-title').getByRole('slider', { name: 'Brightness', exact: true })
  await brightness.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(brightness).toHaveAttribute('aria-valuetext', '99%')
  const map = pane.getByRole('button', { name: 'Map', exact: true })
  await map.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox', { name: 'Map', exact: true }).getByRole('option', { selected: true })).toBeFocused()
  await expect(section('Pixelblaze')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Escape')
  await expect(map).toBeFocused()
  await expect(page.getByRole('listbox', { name: 'Map', exact: true })).toHaveCount(0)
  const originalMap = await map.innerText()
  await map.press('ArrowDown')
  const mapOptions = page.getByRole('listbox', { name: 'Map', exact: true })
  await expect(mapOptions.getByRole('option', { selected: true })).toBeFocused()
  await mapOptions.getByRole('option', { selected: false }).first().click()
  await expect.poll(() => map.innerText()).not.toBe(originalMap)
  await expect(section('Pixelblaze')).toHaveAttribute('aria-expanded', 'false')
  await map.press('ArrowDown')
  await mapOptions.getByRole('option', { name: /^Square/ }).click()
  await expect.poll(() => map.innerText()).toBe(originalMap)
  const wasRunning = await section('Pause').count() > 0
  await section('Preview').focus()
  await page.keyboard.press('Space')
  await expect(section(wasRunning ? 'Run' : 'Pause')).toBeVisible()
  await expect(section('Preview')).toHaveAttribute('aria-expanded', 'false')
  if (wasRunning) await section('Run').click()
  const canvas = await pane.locator('canvas.rounded-sm').elementHandle()
  await page.waitForTimeout(1200)
  await section('Preview').click()
  const elapsed = pane.locator('[data-deck="cell"]').filter({ has: page.getByText('elapsed', { exact: true }) }).locator('span').last()
  const before = parseFloat((await elapsed.innerText()).replace('s', ''))
  await section('Pixelblaze').click()
  await section('Variables').click()
  await expect.poll(async () => parseFloat(await elapsed.innerText())).toBeGreaterThanOrEqual(before)
  expect(await canvas!.evaluate(c => c === document.querySelector('[data-testid="preview-pane"] canvas.rounded-sm'))).toBe(true)
  for (const width of [520, 420, 340]) {
    await paneWidth(page, width)
    const grid = pane.locator('.panel-section-body').filter({ has: page.getByRole('slider', { name: 'Light size', exact: true }) })
    const columns = await grid.evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(width === 340 ? 2 : 4)
    for (const slider of await pane.getByRole('slider').all()) {
      const box = await slider.boundingBox()
      expect(box!.width).toBeGreaterThan(24)
      const bounds = (await pane.boundingBox())!
      expect(box!.x).toBeGreaterThanOrEqual(bounds.x)
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds.x + bounds.width)
    }
  }
  await section('Variables').click()
  await page.reload()
  for (const name of ['Pixelblaze', 'Preview']) await expect(section(name)).toHaveAttribute('aria-expanded', 'true')
  await expect(section('Variables')).toHaveAttribute('aria-expanded', 'false')
  // Source switches still rebuild the executing Pattern, despite resize preserving it.
  await page.goto('studio/patterns/TestPattern3D')
  await expect(pane.getByTestId('pattern-preview-title')).toContainText('TestPattern3D')
  await expect(pane.locator('canvas.rounded-sm')).toBeVisible()
  const pauseOrbit = pane.getByRole('button', { name: 'Pause auto-orbit', exact: true })
  if (await pauseOrbit.count()) await pauseOrbit.click()
  if (await section('Pause').count()) await section('Pause').click()
  const light = pane.getByRole('slider', { name: 'Light size', exact: true })
  await light.focus()
  await page.keyboard.press('Home')
  await expect(light).toHaveValue('0.15')
  const smallLights = await pane.locator('canvas.rounded-sm').screenshot()
  await page.keyboard.press('End')
  await expect(light).toHaveValue('0.95')
  await expect.poll(async () => !(await pane.locator('canvas.rounded-sm').screenshot()).equals(smallLights)).toBe(true)
  // Space on the same slider resumes the existing owner; new frames advance.
  await page.keyboard.press('Space')
  await expect(section('Pause')).toBeVisible()
  await expect.poll(async () => parseFloat(await elapsed.innerText())).toBeGreaterThan(0)
})
