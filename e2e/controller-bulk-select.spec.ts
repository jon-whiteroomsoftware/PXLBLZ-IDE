import { test, expect } from './fixtures/authenticated'
import { bulkPrograms, fakeControllerMutations, seedBulkSelectFixture } from './fixtures/controllerBulkSelect'

test('Controller bulk selection cancels, imports, switches sections, deletes and refreshes (#1218)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedBulkSelectFixture(page)
  const pane = page.getByTestId('controller-saved-programs-pane')
  await pane.getByRole('button', { name: 'Select Other Patterns' }).click()
  await pane.getByRole('checkbox', { name: 'Select Alpha', exact: true }).check()
  await pane.getByRole('checkbox', { name: 'Select Beta', exact: true }).check()
  await expect(pane.getByRole('status')).toHaveText('2 of 3 selected')
  const before = await fakeControllerMutations(page)
  await pane.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(pane.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
  const response = await page.context().request.get('/api/patterns')
  expect(response.ok()).toBe(true)
  const { patterns } = await response.json() as { patterns: Array<{ name: string; src: string }> }
  expect(patterns.filter((pattern) => ['Alpha', 'Beta'].includes(pattern.name)).map((pattern) => pattern.name).sort()).toEqual(['Alpha', 'Beta'])
  expect(await fakeControllerMutations(page)).toEqual(before)
  await expect(page).toHaveURL(/\/studio\/controllers\/bulk-select-1218$/)

  await pane.getByRole('button', { name: 'Select Saved PXLBLZ Patterns' }).click()
  await expect(pane.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0)
  await expect(pane.getByRole('checkbox', { name: 'Select Running Pattern', exact: true })).toBeDisabled()
  await pane.getByRole('checkbox', { name: 'Select all Saved PXLBLZ Patterns', exact: true }).check()
  await expect(pane.getByRole('status')).toHaveText('2 of 3 selected')
  await pane.getByRole('button', { name: 'Select Other Patterns' }).click()
  await expect(pane.getByRole('status')).toHaveText('0 of 3 selected')
  await pane.getByRole('checkbox', { name: 'Select Alpha', exact: true }).check()
  await pane.getByRole('button', { name: 'Select Saved PXLBLZ Patterns' }).click()
  await expect(pane.getByRole('status')).toHaveText('0 of 3 selected')
  await pane.getByRole('button', { name: 'Select Other Patterns' }).click()
  await pane.getByRole('checkbox', { name: 'Select all Other Patterns', exact: true }).check()
  await pane.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading')).toHaveText('Delete 3 Patterns from Bulk fixture Controller?')
  await expect(dialog.getByRole('listitem')).toHaveText(['Alpha', 'Beta', 'Gamma'])
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await fakeControllerMutations(page)).toEqual(before)
  await pane.getByRole('button', { name: 'Delete', exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete 3 from Controller', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(pane.getByText('No other Patterns are saved on this Controller.')).toBeVisible()
  expect((await fakeControllerMutations(page)).filter((write) => 'deleteProgram' in write)).toEqual(
    bulkPrograms.slice(3).map((program) => ({ deleteProgram: program.id })),
  )
  await expect(pane.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
  const reads = () => page.evaluate(() => (window as typeof window & {
    __fakeControllerWrites: Array<Record<string, unknown>>
  }).__fakeControllerWrites.filter((write) => write.listPrograms).length)
  const priorReads = await reads()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(reads).toBe(priorReads + 1)
  await expect(pane.getByRole('table', { name: 'Saved PXLBLZ Patterns', exact: true })).toContainText('Owned Aurora')
  await expect(page.getByRole('button', { name: /Refresh/i })).toHaveCount(1)
  for (const section of ['Saved PXLBLZ Patterns', 'Other Patterns']) {
    const header = pane.getByRole('heading', { name: new RegExp(`^${section} \\(\\d+\\)$`) }).locator('..')
    await expect(header.getByRole('button')).toHaveCount(1)
    await expect(header.getByRole('button', { name: `Select ${section}`, exact: true })).toHaveCount(1)
  }
})
