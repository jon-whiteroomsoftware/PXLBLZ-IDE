import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2Transitions } from './fixtures/showV2Transitions'

test('native Transition Insert, settings, resize and Reset to Cut survive history, save, reload and native reopening', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1000 })

  const result = await exerciseShowV2Transitions(page, async ({ route, editor, stage }) => {
    await page.waitForFunction(() => Boolean(window.__pxlblzShow))
    await stage.getByRole('button', { name: 'Pause Show preview', exact: true }).click()
    for (const mode of ['Fast', 'Precise'] as const) {
      if (mode === 'Precise') {
        await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
        await page.getByRole('option', { name: mode, exact: true }).click()
      }
      expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 3500, prefix }), `transitions-${mode}`)).failures).toEqual([])
    }
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await editor.getByLabel('Cut junction', { exact: true }).scrollIntoViewIfNeeded()
      await editor.getByLabel('Cut junction', { exact: true }).focus()
      await page.keyboard.press('Tab')
      await expect(editor.getByLabel('Transition', { exact: true })).toBeFocused()
      expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1)
      }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  })

  expect(result.readWrites()).toBe(6)
  expect(errors).toEqual([])
})
