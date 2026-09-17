import { exerciseShowV2PreparedRecovery } from './fixtures/showV2PreparedRecovery'
import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2LayerManagement } from './fixtures/showV2LayerManagement'
// Group creation and Group occurrence flows have their own registered specs:
// `show-v2-group-create.auth.spec.ts` and `show-v2-group-occurrences.auth.spec.ts`.
test('native Layers persist empty names/stacking and complete ordinary/held Group reassignment with one save per action', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { route, editor, stage, readWrites } = await exerciseShowV2LayerManagement(page)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow)); await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') { await stage.getByRole('button', { name: 'Renderer', exact: true }).click(); await page.getByRole('option', { name: mode, exact: true }).click() }
    expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 23000, prefix }), `layers-${mode}`)).failures).toEqual([])
  }
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    const zone = editor.getByLabel('Layer Zone', { exact: true }); await zone.scrollIntoViewIfNeeded(); await zone.focus(); await zone.selectOption('zone')
    const selected = editor.getByLabel('Selected Layer', { exact: true }); await selected.focus(); await selected.selectOption({ label: 'Pulse' }); await selected.press('Tab')
    await expect(editor.getByLabel('Layer name', { exact: true })).toBeFocused(); expect(readWrites()).toBe(6)
    expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
  }
  expect(errors).toEqual([])
})

test('existing Layer edit recovers qualified refused Show through checked admission and durable history', async ({ page }) => {
  await exerciseShowV2PreparedRecovery(page)
})
