import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2GroupCreation } from './fixtures/showV2GroupCreation'

test('ordinary selection creates a lossless native Group with one shared runtime, durable history and native reopen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { route, editor, stage, readWrites } = await exerciseShowV2GroupCreation(page)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') { await stage.getByRole('button', { name: 'Renderer', exact: true }).click(); await page.getByRole('option', { name: mode, exact: true }).click() }
    expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 5000, prefix }), `group-creation-${mode}`)).failures).toEqual([])
  }
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    if (width === 390) await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
    const remaining = editor.getByRole('checkbox'); await remaining.scrollIntoViewIfNeeded(); await remaining.focus(); await remaining.press('Space'); await expect(remaining).toBeChecked(); await remaining.press('Space'); await expect(remaining).not.toBeChecked()
    await editor.getByLabel('Group name').focus(); await page.keyboard.press('Tab'); expect(readWrites()).toBe(3)
    expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
  }
  expect(errors).toEqual([])
})
