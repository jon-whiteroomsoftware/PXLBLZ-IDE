import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures/authenticated'

// Persisted synthetic bytes exercise the stored v2 shape without importing the
// converter, whose schema validator does not resolve under the spec runtime.
const { source, record } = JSON.parse(
  readFileSync(new URL('./fixtures/showEditorV2ReadOnly.json', import.meta.url), 'utf8'),
)
const SHOW_ID = 'show-editor-v2-readonly'

// #1056 slice 2 replaced the read-only surface with the gesture surface for a
// preparable record, so this spec now proves the rendering and the lanes that
// stay inert until slices 4-5; editing itself is show-editor-v2-gestures.
test('the ordinary Show route renders a stored v2 record through the version gate', async ({ page }) => {
  const created = await page.request.post('/api/shows', { data: source })
  expect(created.ok(), await created.text()).toBe(true)
  const saved = await page.request.put(`/api/shows/${SHOW_ID}?show-version=2`, { data: record })
  expect(saved.ok(), await saved.text()).toBe(true)

  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => consoleErrors.push(error.message))
  let writes = 0
  page.on('request', request => {
    if (request.method() !== 'GET' && request.url().includes('/api/shows')) writes++
  })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows/${SHOW_ID}?show-v2-editor=1&capture`)

  // The ordinary route holds the v2 record, and it is the only v2 surface:
  // slice 6 retired the typed pilot route entirely.
  const surface = page.getByTestId('show-timeline-read-only')
  await expect(surface).toBeVisible()
  await expect(surface).toHaveAttribute('data-show-record-version', '2')
  await expect(page.getByTestId('show-editor-v2-route')).toHaveCount(1)
  await expect(page.getByTestId('show-timeline-read-only-status'))
    .toContainText('Editing this v2 Show')

  // Timeline: Zone rows, Layer lanes, Clips and the Transition window.
  await expect(surface.getByRole('group', { name: 'Zone Main', exact: true })).toBeVisible()
  await expect(surface.getByRole('group', { name: 'Layer Main in Zone Main' })).toBeVisible()
  await expect(surface.getByRole('button', { name: /^Clip Outgoing, 0\.00s to 0\.40s/ })).toBeVisible()
  await expect(surface.getByRole('button', { name: /^Clip Incoming, 0\.60s to 1\.00s/ })).toBeVisible()
  await expect(surface.locator('[data-show-layer-junction="layer"]')).toHaveAttribute('data-show-transition-kind', 'crossfade')

  // Layout lane, Markers and Show End.
  await expect(surface.getByRole('group', { name: 'Zone Layouts lane' })
    .getByRole('button', { name: /Full Zone Layout, 0\.00s to 1\.00s/ })).toBeVisible()
  await expect(surface.getByRole('group', { name: 'Show Markers' })
    .getByRole('button', { name: /Chapter Marker Opening at 0\.00s/ })).toBeVisible()
  await expect(page.getByTestId('show-timeline-read-only-end')).toHaveText('End 1.00s')

  // The Layout lane and the Marker lane stay inert until slices 4-5: focusable
  // for traversal, never actionable. The timeline offers no field of its own.
  for (const laneName of ['Zone Layouts lane', 'Show Markers']) {
    const controls = await surface.getByRole('group', { name: laneName }).getByRole('button').all()
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) await expect(control).toHaveAttribute('aria-disabled', 'true')
  }
  await expect(surface.locator('input, select, textarea, [role="slider"]')).toHaveCount(0)

  // Stage preview in both fidelities.
  const stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') {
      await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
      await page.getByRole('option', { name: 'Precise', exact: true }).click()
      await expect(stage).toContainText('Precise')
    }
    const capture = await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({
      frames: 2, fps: 8, startMs: 0, prefix,
    }), `editor-v2-readonly-${mode.toLowerCase()}`)
    expect(capture.failures).toEqual([])
    expect(capture.names).toHaveLength(2)
  }

  // Narrow width: keyboard traversal reaches the timeline items and nothing
  // overflows the viewport.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  await surface.scrollIntoViewIfNeeded()
  const firstItem = surface.getByRole('button', { name: /Full Zone Layout/ })
  await firstItem.focus()
  await expect(firstItem).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(surface.getByRole('button', { name: /Chapter Marker Opening/ })).toBeFocused()
  const overflow = await surface.evaluate(root => [...root.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
    })
    .map(element => element.getAttribute('aria-label')))
  expect(overflow).toEqual([])

  // Rendering a v2 record wrote nothing and logged nothing.
  expect(writes).toBe(0)
  expect(consoleErrors).toEqual([])
})
