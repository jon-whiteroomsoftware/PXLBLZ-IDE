import { expect, test } from './fixtures/authenticated'

// Layout tests exercise the opt-in UI with an unavailable Agent service.
// Transport admission and execution are covered by the Agent suites.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/agent/channel?agent=1', route => route.fulfill({ json: { code: 'service_disabled' } }))
})

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

test('does not restore the legacy source footer below the narrow breakpoint (#63)', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 900 })
  await page.goto('studio/shows/stock-show-remix-quadrille')
  await expect(page.getByRole('region', { name: 'Show timeline', exact: true })).toBeVisible()
  await expect(page.getByTestId('show-compile-bar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Show source inventory/ })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Show source inventory' })).toHaveCount(0)
})

test('preserves the split ratio through resizing, reload, and narrow width (#63)', async ({ page }, testInfo) => {
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
  let original = await ratio()
  for (const size of [{ width: 1600, height: 900 }, { width: 1900, height: 1200 }, { width: 1800, height: 1000 }]) {
    await page.setViewportSize(size)
    await expect(divider).toHaveAttribute('data-clamp', 'none')
    await expect.poll(async () => Math.abs(await ratio() - original)).toBeLessThan(0.003)
    if (size.width === 1900) {
      await divider.press('Shift+ArrowUp')
      original = await ratio()
    }
    await page.reload()
    await expect(divider).toHaveAttribute('data-clamp', 'none')
    await expect.poll(async () => Math.abs(await ratio() - original)).toBeLessThan(0.003)
    await testInfo.attach(`split-${size.width}x${size.height}`, { body: await page.screenshot(), contentType: 'image/png' })
  }
  await page.setViewportSize({ width: 640, height: 1000 })
  await expect(page.getByTestId('show-stage-strip')).toBeVisible()
  await expect(divider).toHaveAttribute('data-clamp', 'none')
  await page.reload()
  await expect(divider).toHaveAttribute('data-clamp', 'none')
  await expect(page.getByTestId('studio-entity-drawer')).toBeHidden()
  await testInfo.attach('split-640x1000', { body: await page.screenshot(), contentType: 'image/png' })
  await page.setViewportSize({ width: 1800, height: 1000 })
  await expect.poll(async () => Math.abs(await ratio() - original)).toBeLessThan(0.003)
})

for (const agent of [false, true]) {
  test(`fades remaining timeline content and permits a large preview with Agent ${agent} (#1006)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`studio/shows/stock-show-301-installation-mapping${agent ? '?agent=1' : ''}`)
    const divider = page.getByRole('separator', { name: 'Resize timeline and Stage' })
    await expect(divider).toBeVisible()
    const pane = page.getByTestId('show-timeline-pane')
    const strip = page.getByTestId('show-stage-strip')
    await expect.poll(async () => (await strip.boundingBox())!.height - (await pane.boundingBox())!.height).toBeGreaterThanOrEqual(0)
    const bounds = (await divider.boundingBox())!
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 3)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width / 2, 40, { steps: 12 })
    await page.mouse.up()
    await expect(divider).toHaveAttribute('data-clamp', 'timeline-min')
    expect(Number(await divider.getAttribute('aria-valuenow'))).toBeLessThan(180)
    await expect.poll(async () => (await strip.boundingBox())!.height).toBeGreaterThan(650)
    const fade = page.getByTestId('show-timeline-overflow-fade')
    await expect(fade).toBeVisible()
    await expect(divider).not.toHaveClass(/red-/)
    await page.getByTestId('show-editor-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect(fade).toBeHidden()
    await page.getByTestId('show-editor-scroll').evaluate((element) => { element.scrollTop = 0 })
    await expect(fade).toBeVisible()
    await divider.press('Shift+ArrowDown')
    await expect.poll(async () => Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(150)
  })
}

for (const agent of [false, true]) {
  test(`contains Studio document scrolling with Agent ${agent ? 'enabled' : 'hidden'} (#1006)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    for (const route of ['studio/shows/stock-show-301-installation-mapping', 'studio/patterns']) {
      await page.goto(`${route}${agent ? '?agent=1' : ''}`)
      await expect(page.getByTestId('studio-drawer-layout')).toBeVisible()
      const edge = page.getByTestId('agent-drawer-edge-tab')
      const hasAgentDrawer = agent && route.includes('/shows/')
      if (hasAgentDrawer) await expect(edge).toBeVisible()
      else await expect(edge).toHaveCount(0)
      const overflow = () => page.evaluate(() => {
        const root = document.documentElement
        return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight]
      })
      await expect.poll(overflow).toEqual([0, 0])
      if (hasAgentDrawer) {
        await edge.click()
        await expect(page.getByRole('complementary', { name: 'Agent drawer', exact: true })).toBeVisible()
        await expect.poll(overflow).toEqual([0, 0])
        await page.getByRole('button', { name: 'Agent menu', exact: true }).click()
        await expect(page.getByRole('menuitemcheckbox', { name: 'Show MCP calls', exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Pin the Agent drawer', exact: true }).click()
        await expect(page.getByTestId('agent-drawer-layout')).toHaveAttribute('data-drawer-mode', 'pinned')
        await expect.poll(overflow).toEqual([0, 0])
        await page.getByRole('button', { name: 'Unpin the Agent drawer', exact: true }).click()
        await page.keyboard.press('Escape')
        await expect(edge).toHaveAttribute('aria-expanded', 'false')
        await expect.poll(overflow).toEqual([0, 0])
      }
      await page.setViewportSize({ width: 640, height: 800 })
      await expect.poll(overflow).toEqual([0, 0])
      const listEdge = page.getByTestId('studio-drawer-edge-tab')
      await listEdge.click()
      await expect(page.getByTestId('studio-drawer-layout')).toHaveAttribute('data-drawer-mode', 'open')
      await expect.poll(overflow).toEqual([0, 0])
      await page.keyboard.press('Escape')
      await expect(listEdge).toHaveAttribute('aria-expanded', 'false')
      await expect.poll(overflow).toEqual([0, 0])
      await page.setViewportSize({ width: 1280, height: 720 })
    }
  })
}
