import { expect, test } from './fixtures/authenticated'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { openShowEditorV2Animation } from './fixtures/showEditorV2Animation'

test('the ordinary route edits v2 animation, Markers, Show End, Insert Time and Groups', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  const { showId, clipInspector, showInspector, lanes, sidePanel, readSaved, writes } = await openShowEditorV2Animation(page)
  await expect(showInspector).toBeVisible()

  const saved = async (count: number, check: (record: ShowRecordV2) => boolean, status: string) => {
    await expect.poll(() => writes.length).toBe(count)
    await expect.poll(async () => check(await readSaved())).toBe(true)
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible()
  }
  // The editor number fields adopt on Enter; the Property panel's plain inputs
  // are submitted by their own form button, so pressing Enter there would send
  // an incomplete draft.
  const commit = async (scope: typeof showInspector, label: string, value: string) => {
    const field = scope.getByRole('textbox', { name: label, exact: true })
    await field.fill(value)
    await field.press('Enter')
  }
  const fill = async (scope: typeof showInspector, label: string, value: string) => {
    await scope.getByRole('textbox', { name: label, exact: true }).fill(value)
  }

  // The animation lane draws the authored track and marks nothing retained yet.
  const lane = lanes.getByRole('button', { name: /Voice sliderGain/ })
  await expect(lane).toHaveAttribute('data-show-lane-retained-keys', '0')
  await expect(lanes.getByRole('button', { name: /^Group Verse in Zone/ })).toHaveCount(2)

  // Selecting the lane selects the same track in the Show inspector.
  await lane.click()
  await expect(showInspector.getByLabel('Property track')).toHaveValue('solo-gain')

  // Add a key to that track through the landed Property owner.
  await showInspector.getByRole('button', { name: 'Add key' }).click()
  await fill(showInspector, 'Property key time', '2000')
  await fill(showInspector, 'Property key value', '0.5')
  await showInspector.getByRole('button', { name: 'Create key' }).click()
  await saved(1, record => record.composition.propertyTracks[0].keyframes.length === 3, 'Property saved.')

  // Edit the new key's value. Adoption re-reads the capture, so the panel
  // returns to its list and the key is selected again by its authored time.
  await showInspector.getByLabel('Property key').selectOption({ index: 2 })
  await fill(showInspector, 'Property key value', '0.6')
  await showInspector.getByRole('button', { name: 'Apply key' }).click()
  await saved(2, record => record.composition.propertyTracks[0].keyframes[1].value === 0.6, 'Property saved.')

  // Insert Time at zero: Show End grows and the first Layout occurrence extends.
  await commit(showInspector, 'Insert Time at (ms)', '0')
  await commit(showInspector, 'Insert Time duration (ms)', '500')
  await showInspector.getByRole('button', { name: 'Insert Time' }).click()
  await saved(3, record => record.composition.showEndMs === 30500
    && record.composition.layoutOccurrences[0].startMs === 0
    && record.composition.layoutOccurrences[0].durationMs === 20500, 'Insert Time saved.')

  // Insert Time mid-Show across the first Group occurrence: it holds, and the
  // later occurrence only moves.
  await commit(showInspector, 'Insert Time at (ms)', '5500')
  await commit(showInspector, 'Insert Time duration (ms)', '2000')
  await showInspector.getByRole('button', { name: 'Insert Time' }).click()
  await saved(4, record => record.composition.groupOccurrences[0].holds.length === 1
    && record.composition.groupOccurrences[1].startMs === 22500, 'Insert Time saved.')

  // Set Show End, exactly.
  await commit(showInspector, 'Show End', '50000')
  await saved(5, record => record.composition.showEndMs === 50000, 'Show End saved.')

  // A chapter Marker through the Marker owner's role field.
  await showInspector.getByRole('button', { name: 'Add Marker' }).click()
  await expect.poll(() => writes.length).toBe(6)
  await showInspector.getByLabel('Marker role').selectOption('chapter')
  await saved(7, record => record.composition.markers.some(marker => marker.role === 'chapter'), 'Marker saved.')

  // Group occurrence actions through the existing occurrence owner.
  const groups = clipInspector.getByRole('region', { name: 'Group occurrences' })
  await groups.getByLabel('Group occurrence').selectOption({ index: 2 })
  // Duplicate into free time after the second occurrence; an overlapping
  // placement on the bound Layer would be refused whole.
  const groupStart = groups.getByRole('textbox', { name: 'Group start (ms)', exact: true })
  await groupStart.fill('33000')
  await groupStart.press('Enter')
  await groups.getByRole('button', { name: 'Duplicate Group' }).click()
  await saved(8, record => record.composition.groupOccurrences.length === 3, 'Group saved.')
  await groups.getByRole('button', { name: 'Ungroup' }).click()
  await saved(9, record => record.composition.groupOccurrences.length === 2, 'Group saved.')

  // Undo and Redo settle through the same save queue.
  await clipInspector.getByRole('button', { name: 'Undo', exact: true }).click()
  await saved(10, record => record.composition.groupOccurrences.length === 3, 'Undo saved.')
  await clipInspector.getByRole('button', { name: 'Redo', exact: true }).click()
  await saved(11, record => record.composition.groupOccurrences.length === 2, 'Redo saved.')

  // Everything survives a reload of the stored v2 bytes.
  await page.reload()
  await expect(page.getByTestId('show-inspector-v2')).toBeVisible()
  const reloaded = await readSaved()
  expect(reloaded.composition.showEndMs).toBe(50000)
  expect(reloaded.composition.markers.filter(marker => marker.role === 'chapter')).toHaveLength(1)
  expect(reloaded.composition.groupOccurrences[0].holds).toHaveLength(1)
  expect(reloaded.composition.propertyTracks[0].keyframes).toHaveLength(3)

  // Narrow width: the side panel scrolls as one container and nothing overflows.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  const scrollable = await sidePanel.evaluate(element => ({
    scrollable: element.scrollHeight > element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
  }))
  expect(scrollable.overflowY).toBe('auto')
  expect(scrollable.scrollable).toBe(true)
  // The last control in the panel is reachable by ordinary scrolling.
  await sidePanel.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(page.getByTestId('show-inspector-v2-status')).toBeInViewport()
  const overflow = await sidePanel.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
    })
    .map(element => element.getAttribute('aria-label') ?? element.textContent))
  expect(overflow).toEqual([])

  expect(showId).toBe('show-editor-v2-animation')
  expect(errors).toEqual([])
})
