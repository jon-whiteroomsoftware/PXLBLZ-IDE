import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2GroupOccurrences } from './fixtures/showV2GroupOccurrences'

test('Group occurrence controls preserve shared held choreography and adopt validated empty last deletion with durable history', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await exerciseShowV2GroupOccurrences(page, async ({ route, editor, stage }) => {
    await page.waitForFunction(() => Boolean(window.__pxlblzShow))
    await stage.getByRole('button', { name: 'Pause Show preview' }).click()
    for (const mode of ['Fast', 'Precise'] as const) {
      if (mode === 'Precise') { await stage.getByRole('button', { name: 'Renderer', exact: true }).click(); await page.getByRole('option', { name: mode, exact: true }).click() }
      expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 3000, prefix }), `group-occurrences-${mode}`)).failures).toEqual([])
    }
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 844 }); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
      const selected = editor.getByLabel('Group occurrence', { exact: true })
      await selected.scrollIntoViewIfNeeded(); await selected.focus(); await expect(selected).toBeFocused()
      expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  })
  expect(errors).toEqual([])
})
