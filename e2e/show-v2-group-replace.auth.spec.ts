import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2GroupReplace } from './fixtures/showV2GroupReplace'

test('definition-local Group replacement forks once, refuses mixed Group animation and saves native history', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const { route, stage, panel, readWrites } = await exerciseShowV2GroupReplace(page)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  await stage.getByRole('button', { name: 'Pause Show preview', exact: true }).click()
  for (const mode of ['Fast', 'Precise']) {
    if (mode === 'Precise') {
      await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
      await page.getByRole('option', { name: mode, exact: true }).click()
    }
    expect((await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 22000, prefix }), `group-replace-${mode}`)).failures).toEqual([])
  }
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const select = panel.getByRole('combobox', { name: 'Group Clip', exact: true })
    await select.scrollIntoViewIfNeeded()
    await select.focus()
    await expect(select).toBeFocused()
    await select.selectOption('dormant:dormant-child')
    const input = panel.getByRole('combobox', { name: 'Replacement Group Pattern' })
    await input.scrollIntoViewIfNeeded()
    await input.focus()
    await expect(input).toBeFocused()
    await input.press('Escape')
    expect(await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1)
    }).map(element => element.getAttribute('aria-label') || element.textContent))).toEqual([])
  }
  expect(readWrites()).toBe(6)
  expect(errors).toEqual([])
})
