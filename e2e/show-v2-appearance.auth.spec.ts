import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2AppearanceManagement } from './fixtures/showV2AppearanceManagement'
test('native appearance preserves mixed held values and explicit Effect identity through history/save/cold reopen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { route, editor, stage, readWrites } = await exerciseShowV2AppearanceManagement(page)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow)); await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') { await stage.getByRole('button', { name: 'Renderer', exact: true }).click(); await page.getByRole('option', { name: mode, exact: true }).click() }
    expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 23000, prefix }), `appearance-${mode}`)).failures).toEqual([])
  }
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    const scope = editor.getByLabel('Appearance scope'); await scope.scrollIntoViewIfNeeded(); await scope.focus(); await scope.selectOption('selected-time'); await scope.press('Tab')
    await expect(editor.getByLabel('Appearance time')).toBeFocused(); await editor.getByLabel('Appearance time').fill('6000'); expect(readWrites()).toBe(8)
    expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
  }
  expect(errors).toEqual([])
})
