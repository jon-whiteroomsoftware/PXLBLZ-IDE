import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2TransitionResize } from './fixtures/showV2TransitionResize'
test('checked native Transition resize preserves preparation, no-op/refusal, history/save/reload and narrow controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { route, stage, readWrites } = await exerciseShowV2TransitionResize(page)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') { await stage.getByRole('button', { name: 'Renderer', exact: true }).click(); await page.getByRole('option', { name: mode, exact: true }).click() }
    expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 17000, prefix }), `transition-${mode}`)).failures).toEqual([])
  }
  expect(readWrites()).toBe(3)
  await page.setViewportSize({ width: 390, height: 844 }); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  await route.getByLabel('Transition duration', { exact: true }).scrollIntoViewIfNeeded(); await expect(route.getByLabel('Transition duration', { exact: true })).toBeVisible()
  expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1) }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
})
