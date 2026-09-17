import { expect, test } from './fixtures/authenticated'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { inspectorRecord, openShowEditorV2Inspector } from './fixtures/showEditorV2Inspector'

test('the ordinary route inspects and edits a v2 Clip through the landed owners', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  const { showId, inspector, readSaved, writes } = await openShowEditorV2Inspector(page)
  await expect(inspector).toBeVisible()
  // The timeline itself stays read-only; only the inspector edits this record.
  await expect(page.getByTestId('show-timeline-read-only-status'))
    .toContainText('Read only - this Show is stored in the v2 format')

  // Selection binds the inspector to one Clip, with its authored entry policy.
  await inspector.getByLabel('Selected Clip').selectOption('voice')
  await expect(inspector).toContainText('Inspector Voice')
  await expect(inspector.locator('[data-show-entry-policy]')).toHaveText('Restart')
  await expect(inspector.getByRole('group', { name: 'Pattern instance' })).toContainText('Shared by 3 Clips')
  await expect(inspector.getByRole('listitem')).toHaveCount(3)

  const commit = async (label: string, value: string) => {
    const field = inspector.getByRole('textbox', { name: label, exact: true })
    await field.fill(value)
    await field.press('Enter')
  }
  const saved = async (count: number, check: (record: ShowRecordV2) => boolean, status: string) => {
    await expect.poll(() => writes.length).toBe(count)
    await expect.poll(async () => check(await readSaved())).toBe(true)
    await expect(inspector.getByText(status, { exact: true })).toBeVisible()
  }

  // Timing through the temporal owner, in exact milliseconds.
  await commit('Clip start', '500')
  await saved(1, record => record.composition.clips[0].startMs === 500, 'Clip saved.')
  await commit('Clip duration', '8000')
  await saved(2, record => record.composition.clips[0].durationMs === 8000, 'Clip saved.')
  // A fractional millisecond is refused whole: no write, no history entry.
  await commit('Clip start', '500.5')
  await expect(inspector).toContainText('safe integer milliseconds')
  expect(writes).toHaveLength(2)

  // Independence forks one runtime for this Clip; the held Group uses keep theirs.
  await inspector.getByRole('button', { name: 'Make Pattern Independent' }).click()
  await saved(3, record => record.composition.patternInstances.length === 2
    && record.composition.clips[0].instanceId !== 'instance', 'Clip sharing saved.')
  await expect(inspector.getByRole('group', { name: 'Pattern instance' })).toContainText('Independent')

  // Replace confirms the animation it would drop; cancelling adopts nothing.
  const replace = inspector.getByRole('region', { name: 'Replace Pattern' })
  const chooseReplacement = async () => {
    await replace.getByRole('combobox', { name: 'Replacement Pattern' }).click()
    await page.getByRole('option', { name: 'Inspector Other', exact: true }).click()
    await replace.getByRole('button', { name: 'Replace Pattern', exact: true }).click()
  }
  await chooseReplacement()
  const confirmation = inspector.getByRole('group', { name: 'Confirm Clip animation loss' })
  await expect(confirmation).toContainText('sliderLost')
  await confirmation.getByRole('button', { name: 'Cancel Pattern replacement' }).click()
  await expect(inspector).toContainText('Pattern replacement cancelled.')
  expect(writes).toHaveLength(3)

  await replace.getByRole('button', { name: 'Replace Pattern', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Confirm Pattern replacement' }).click()
  await saved(4, record => record.composition.patternInstances
    .some(instance => instance.pattern.id === 'inspector-other'), 'Pattern replacement saved.')
  // Other users of the original instance keep their Pattern, controls and state.
  const replaced = await readSaved()
  expect(replaced.composition.patternInstances.find(instance => instance.id === 'instance'))
    .toEqual(inspectorRecord.composition.patternInstances.find(instance => instance.id === 'instance'))
  expect(replaced.composition.groupOccurrences).toHaveLength(2)

  // Appearance and Effects through the landed appearance owner.
  const appearance = inspector.getByRole('region', { name: 'Clip appearance' })
  await appearance.getByLabel('Appearance scope').selectOption('whole-clip')
  await appearance.getByLabel('New Effect kind').selectOption({ index: 1 })
  await appearance.getByRole('button', { name: 'Add Effect' }).click()
  await saved(5, record => record.composition.clips[0].appearance.keys[0].value.effects.length === 2, 'Appearance saved.')
  const added = (await readSaved()).composition.clips[0].appearance.keys[0].value.effects[1]
  await appearance.getByLabel('Selected Effect').selectOption(added.id)
  await appearance.getByRole('button', { name: 'Remove Effect' }).click()
  await saved(6, record => record.composition.clips[0].appearance.keys[0].value.effects.length === 1, 'Appearance saved.')

  // Undo and Redo settle through the same save queue.
  await inspector.getByRole('button', { name: 'Undo', exact: true }).click()
  await saved(7, record => record.composition.clips[0].appearance.keys[0].value.effects.length === 2, 'Undo saved.')
  await inspector.getByRole('button', { name: 'Redo', exact: true }).click()
  await saved(8, record => record.composition.clips[0].appearance.keys[0].value.effects.length === 1, 'Redo saved.')

  // The authored entry policy survives save and reload.
  await page.reload()
  await expect(page.getByTestId('show-clip-inspector-v2')).toBeVisible()
  await page.getByTestId('show-clip-inspector-v2').getByLabel('Selected Clip').selectOption('voice')
  await expect(page.getByTestId('show-clip-inspector-v2').locator('[data-show-entry-policy]')).toHaveText('Restart')
  expect((await readSaved()).composition.clips[0].entryPolicy).toBe('restart')

  // Narrow width: reachable by keyboard and nothing escapes the viewport.
  await page.setViewportSize({ width: 390, height: 844 })
  const narrow = page.getByTestId('show-clip-inspector-v2')
  const select = narrow.getByLabel('Selected Clip')
  await select.scrollIntoViewIfNeeded()
  await select.focus()
  await expect(select).toBeFocused()
  await select.press('Tab')
  await expect(narrow.getByRole('textbox', { name: 'Clip start', exact: true })).toBeFocused()
  const overflow = await narrow.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
    })
    .map(element => element.getAttribute('aria-label') ?? element.textContent))
  expect(overflow).toEqual([])

  expect(showId).toBe('show-editor-v2-inspector')
  expect(errors).toEqual([])
})
