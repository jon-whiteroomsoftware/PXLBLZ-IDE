import { expect, test } from './fixtures/authenticated'

test('ends divider dragging after release and capture loss while the Show plays (#63)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('studio/shows/stock-show-301-installation-mapping')
  const divider = page.getByRole('separator', { name: 'Resize timeline and Stage' })
  await expect(divider).toBeVisible()
  const toolbar = page.getByTestId('show-timeline-toolbar')
  await toolbar.getByRole('button', { name: 'Play Show preview' }).click()
  for (let attempt = 0; attempt < 4; attempt++) {
    const bounds = (await divider.boundingBox())!
    const x = bounds.x + bounds.width / 2
    await page.mouse.move(x, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(x, 160, { steps: 12 })
    await expect(divider).not.toHaveAttribute('data-clamp', 'none')
    await page.mouse.move(x, 420, { steps: 12 })
    if (attempt % 2 === 1) {
      // Exercise the browser's real capture-loss event, as when capture is
      // taken away before the separator receives pointerup.
      expect(await divider.evaluate((element) => element.hasPointerCapture(1))).toBe(true)
      await divider.evaluate((element) => element.releasePointerCapture(1))
      await page.mouse.move(x, 200)
    }
    await page.mouse.up()
    const released = await divider.getAttribute('aria-valuenow')
    const stoppedBounds = (await divider.boundingBox())!
    await page.mouse.move(x, stoppedBounds.y + 2)
    await page.mouse.move(x, stoppedBounds.y + 3)
    await page.mouse.move(x, 300, { steps: 8 })
    await page.mouse.move(x, 500, { steps: 8 })
    await expect(divider).toHaveAttribute('aria-valuenow', released!)
  }
  await toolbar.getByRole('button', { name: 'Pause Show preview' }).click()
})

test('uses a short undecorated timeline tail (#63)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('studio/shows/stock-show-301-installation-mapping')
  const grid = page.getByTestId('show-timeline-grid')
  await expect(grid).toBeVisible()
  expect(await grid.evaluate((element) => Number.parseFloat(getComputedStyle(element).gridTemplateRows.split(' ').at(-1)!))).toBe(17)
  expect(await page.getByTestId('show-timeline-toolbar').evaluate((element) => getComputedStyle(element.parentElement!).borderBottomWidth)).toBe('0px')
})

test('warns only when timeline rows are clipped, not when decorative slack or a size limit is reached (#63)', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1400 })
  await page.goto('studio/shows/stock-show-301-installation-mapping')
  const divider = page.getByRole('separator', { name: 'Resize timeline and Stage' })
  const pane = page.getByTestId('show-timeline-pane')
  await expect(divider).toBeVisible()
  const clipped = () => pane.evaluate((element) => {
    const lanes = [...element.querySelectorAll<HTMLElement>('[data-show-zone-id]')]
    return Math.max(...lanes.map((lane) => lane.getBoundingClientRect().bottom)) - element.getBoundingClientRect().bottom > 1
  })
  for (let step = 0; step < 30; step++) await divider.press('Shift+ArrowUp')
  await expect(divider).toHaveAttribute('data-clamp', 'controls-min')
  expect(await clipped()).toBe(false)
  await expect(divider).not.toHaveClass(/border-red-400/)

  await page.setViewportSize({ width: 1280, height: 720 })
  for (let step = 0; step < 10; step++) await divider.press('Shift+ArrowDown')
  let sawClipping = false
  for (let step = 0; step < 60; step++) {
    await divider.press('ArrowUp')
    const isClipped = await clipped()
    if (isClipped) {
      sawClipping = true
      await expect(divider).toHaveClass(/border-red-400/)
      break
    } else {
      await expect(divider).not.toHaveClass(/border-red-400/)
    }
    if (await divider.getAttribute('data-clamp') === 'timeline-min') break
  }
  expect(sawClipping).toBe(true)
  await page.getByRole('button', { name: 'Collapse zone Columns', exact: true }).click()
  await expect(divider).not.toHaveClass(/border-red-400/)
  await page.getByRole('button', { name: 'Expand zone Columns', exact: true }).click()
  await expect(divider).toHaveClass(/border-red-400/)
  await page.getByTestId('show-editor-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(divider).toHaveClass(/border-red-400/)
})

test('does not restore the legacy source footer below the narrow breakpoint (#63)', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 900 })
  await page.goto('studio/shows/stock-show-remix-quadrille')
  await expect(page.getByRole('region', { name: 'Show timeline', exact: true })).toBeVisible()
  await expect(page.getByTestId('show-compile-bar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Show source inventory/ })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Show source inventory' })).toHaveCount(0)
})

test('preserves the split ratio while resizing and restores it after a width clamp (#63)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1000 })
  await page.goto('studio/shows/stock-show-301-installation-mapping')
  const divider = page.getByRole('separator', { name: 'Resize timeline and Stage' })
  await expect(divider).toBeVisible()
  await divider.press('Shift+ArrowDown')
  const ratio = () => page.getByTestId('show-over-under-workspace').evaluate((root) => {
    const timeline = root.querySelector('[data-testid="show-timeline-pane"]')!.getBoundingClientRect().height
    const strip = root.querySelector('[data-testid="show-stage-strip"]')!.getBoundingClientRect().height
    return timeline / (timeline + strip)
  })
  const original = await ratio()
  for (const size of [{ width: 1600, height: 900 }, { width: 1900, height: 1200 }, { width: 1800, height: 1000 }]) {
    await page.setViewportSize(size)
    await expect(divider).toHaveAttribute('data-clamp', 'none')
    await expect.poll(async () => Math.abs(await ratio() - original)).toBeLessThan(0.003)
    await testInfo.attach(`split-${size.width}x${size.height}`, { body: await page.screenshot(), contentType: 'image/png' })
  }
  await page.setViewportSize({ width: 640, height: 1000 })
  await expect(page.getByTestId('show-stage-strip')).toBeVisible()
  await expect(divider).toHaveAttribute('data-clamp', 'controls-min')
  await testInfo.attach('split-640x1000', { body: await page.screenshot(), contentType: 'image/png' })
  await page.setViewportSize({ width: 1800, height: 1000 })
  await expect.poll(async () => Math.abs(await ratio() - original)).toBeLessThan(0.003)
})
