import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2AppearanceSurface } from './fixtures/showV2AppearanceSurface'
test('native appearance authors every held component and removes an Effect with its animation through history/save/cold reopen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { route, editor, stage, readWrites } = await exerciseShowV2AppearanceSurface(page)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow)); await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') { await stage.getByRole('button', { name: 'Renderer', exact: true }).click(); await page.getByRole('option', { name: mode, exact: true }).click() }
    expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 4000, prefix }), `appearance-surface-${mode}`)).failures).toEqual([])
  }
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    const clear = editor.getByLabel('Appearance component to clear'); await clear.scrollIntoViewIfNeeded(); await clear.selectOption('blink'); await clear.focus(); await clear.press('Tab')
    await expect(editor.getByRole('button', { name: 'Clear component', exact: true })).toBeFocused()
    const blink = editor.getByLabel('Blink duty'); await blink.scrollIntoViewIfNeeded(); await blink.focus(); await blink.press('Tab')
    await expect(editor.getByLabel('Blink phase')).toBeFocused()
    expect(readWrites()).toBe(6)
    expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
  }
  expect(errors).toEqual([])
})
