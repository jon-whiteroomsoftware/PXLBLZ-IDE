import type { Locator } from '@playwright/test'
import { test, expect } from './fixtures/authenticated'
import { bulkProfileId, bulkPrograms, fakeControllerMutations, seedBulkSelectFixture } from './fixtures/controllerBulkSelect'

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

test('Other inventory actions fit at 768px through selection and at desktop (#1218)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 })
  // Repeated private proofs reuse only these synthetic IDs.
  if (process.env.PXLBLZ_SESSION_COOKIE) {
    for (const path of [
      ...bulkPrograms.slice(0, 3).map(({ id }) => `/api/patterns/studio-${id.toLowerCase()}`),
      `/api/controllers/${bulkProfileId}`,
    ]) {
      const response = await page.context().request.delete(path)
      expect(response.ok() || response.status() === 404, `Fixture cleanup: ${path}`).toBe(true)
    }
  }
  await seedBulkSelectFixture(page)
  await expect(page).toHaveURL(new RegExp(`/studio/controllers/${bulkProfileId}$`))
  const pane = page.getByTestId('controller-saved-programs-pane')
  const table = pane.getByRole('table', { name: 'Other Patterns', exact: true })

  const assertFits = async (state: string, selecting = false) => {
    await expect(table).toBeVisible()
    await expect(table.getByRole('row')).toHaveCount(4)
    const dimensions = (element: HTMLElement | SVGElement) => ({
      client: element.clientWidth, scroll: element.scrollWidth,
    })
    const tableSize = await table.evaluate(dimensions)
    expect.soft(tableSize.scroll, `${state}: Other table ${JSON.stringify(tableSize)}`).toBeLessThanOrEqual(tableSize.client)
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      const runName = `Run ${name} on the Controller`
      const row = table.getByRole('row').filter({ has: page.getByRole('button', { name: runName, exact: true }) })
      const cell = row.getByRole('cell').last()
      await expect(row).toHaveCount(1)
      await expect(row.getByRole('button')).toHaveCount(selecting ? 1 : 3)
      const cellSize = await cell.evaluate(dimensions)
      expect.soft(cellSize.scroll, `${state}: ${name} action cell ${JSON.stringify(cellSize)}`).toBeLessThanOrEqual(cellSize.client)
      const controls: Locator[] = [row.getByRole('button', { name: runName, exact: true })]
      for (const label of [`Import ${name}`, `Delete ${name} from the Controller`]) {
        const control = row.getByRole('button', { name: label, exact: true })
        await expect(control).toHaveCount(selecting ? 0 : 1)
        if (!selecting) controls.push(control)
      }
      for (const control of controls) {
        await expect(control).toBeEnabled()
        await control.focus()
        await expect(control).toBeFocused()
        // Trial click checks real hit-target reachability without running,
        // importing or deleting a Pattern.
        await control.click({ trial: true })
        const bounds = await control.boundingBox()
        const cellBounds = await cell.boundingBox()
        const rowBounds = await row.boundingBox()
        expect(bounds).not.toBeNull()
        expect(cellBounds).not.toBeNull()
        expect(rowBounds).not.toBeNull()
        for (const [boundary, box] of [['cell', cellBounds!], ['row', rowBounds!]] as const) {
          const label = `${state}: ${name} ${await control.getAttribute('aria-label')} within ${boundary}`
          expect.soft(bounds!.x, label).toBeGreaterThanOrEqual(box.x)
          expect.soft(bounds!.y, label).toBeGreaterThanOrEqual(box.y)
          expect.soft(bounds!.x + bounds!.width, label).toBeLessThanOrEqual(box.x + box.width)
          expect.soft(bounds!.y + bounds!.height, label).toBeLessThanOrEqual(box.y + box.height)
        }
      }
    }
  }

  await test.step('768 normal', () => assertFits('768 normal'))
  await pane.getByRole('button', { name: 'Select Saved PXLBLZ Patterns', exact: true }).click()
  await expect(pane.getByRole('checkbox', { name: 'Select all Saved PXLBLZ Patterns', exact: true })).toBeVisible()
  await test.step('Saved selection preserves Other actions', () => assertFits('768 Saved selection'))
  await pane.getByRole('button', { name: 'Select Other Patterns', exact: true }).click()
  await expect(pane.getByRole('checkbox', { name: 'Select all Other Patterns', exact: true })).toBeVisible()
  await test.step('Other selection keeps Run only', () => assertFits('768 Other selection', true))
  await pane.getByRole('checkbox', { name: 'Select Alpha', exact: true }).check()
  await pane.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await test.step('Cancel preserves selection layout', () => assertFits('768 after Cancel', true))
  await pane.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(pane.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
  await test.step('Done restores normal actions', () => assertFits('768 after Done'))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await test.step('Desktop normal preservation', () => assertFits('1440 normal'))
})
