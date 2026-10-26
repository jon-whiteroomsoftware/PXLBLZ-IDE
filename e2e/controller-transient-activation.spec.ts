import { test, expect } from './fixtures/authenticated'
import { fakeControllerMutations, seedBulkSelectFixture } from './fixtures/controllerBulkSelect'

test('profile Run activates transiently through the production transport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedBulkSelectFixture(page)
  const before = await fakeControllerMutations(page)
  const run = page.getByRole('button', { name: 'Run Alpha on the Controller', exact: true })

  await run.click()

  await expect.poll(() => fakeControllerMutations(page)).toEqual([
    ...before,
    { activeProgramId: 'BULKFOREIGN000001', save: false },
  ])
  await expect(run).toBeDisabled()
  await expect(run).toHaveAttribute('title', 'Running now')
  await expect(page).toHaveURL(/\/studio\/controllers\/bulk-select-1218$/)
  expect(await fakeControllerMutations(page)).toEqual([
    ...before,
    { activeProgramId: 'BULKFOREIGN000001', save: false },
  ])
})
