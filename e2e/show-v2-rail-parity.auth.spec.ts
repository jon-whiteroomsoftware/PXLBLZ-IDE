import { expect, test, type Page } from './fixtures/authenticated'

/**
 * A stored version-2 row is an ordinary personal Show in the Shows rail
 * (#1039): it renames, duplicates and trashes with the same row actions a v1
 * record offers, and emptying the Shows Trash leaves every surviving row
 * organized.
 *
 * #1056 landed the v2 row as listed and openable but offered none of the three,
 * and emptying the Trash reconciled the persisted rail organization against the
 * v1 ids alone, which pruned every surviving v2 row from it.
 */
const GATE = 'show-v2-editor=1'

async function listV2(page: Page): Promise<Array<{ id: string; name: string }>> {
  const response = await page.request.get('/api/shows?show-version=2')
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).shows
}

async function createFreshShow(page: Page): Promise<string> {
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+\?/)
  return new URL(page.url()).pathname.split('/').at(-1)!
}

async function rowAction(page: Page, name: string, action: string): Promise<void> {
  // The row's action button is revealed by hover or focus-within, so the row
  // has to be pointed at before its menu exists to click.
  await page.getByRole('treeitem', { name: new RegExp(`^${name}`) }).hover()
  await page.getByRole('button', { name: `More actions for ${name}` }).click()
  await page.getByRole('button', { name: action, exact: true }).click()
}

test('a stored v2 row renames, duplicates and trashes from the Shows rail', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows?${GATE}`)
  const showId = await createFreshShow(page)
  expect((await listV2(page)).map(row => row.id)).toEqual([showId])

  await page.goto(`studio/shows?${GATE}`)
  const created = (await listV2(page))[0].name
  const row = page.getByRole('treeitem', { name: new RegExp(created) })
  await expect(row).toBeVisible()

  // Rename. The list, the store and the provider carry the new name.
  await rowAction(page, created, 'Rename')
  const field = page.getByRole('textbox').and(page.locator('input')).last()
  await field.fill('Renamed v2 Show')
  await field.press('Enter')
  await expect(page.getByRole('treeitem', { name: /Renamed v2 Show/ })).toBeVisible()
  await expect.poll(async () => (await listV2(page)).map(item => item.name)).toEqual(['Renamed v2 Show'])
  await page.screenshot({ path: '.wrsp/ui-proof/1039-rail-v2-rename.png' })

  // Duplicate. The copy is stored under its own identity and a free name, and
  // the rail opens it on the same route.
  await rowAction(page, 'Renamed v2 Show', 'Duplicate')
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+/)
  await expect.poll(async () => (await listV2(page)).map(item => item.name).sort())
    .toEqual(['Renamed v2 Show', 'Renamed v2 Show copy'])
  const copyId = (await listV2(page)).find(item => item.name === 'Renamed v2 Show copy')!.id
  expect(copyId).not.toBe(showId)

  await page.goto(`studio/shows?${GATE}`)
  await expect(page.getByRole('treeitem', { name: /Renamed v2 Show copy/ })).toBeVisible()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-rail-v2-duplicate.png' })

  // Trash the copy and empty the Trash. The deleted row is gone from the
  // provider; the survivor is still listed, which is what the organization
  // reconciliation used to break.
  await rowAction(page, 'Renamed v2 Show copy', 'Move to Trash')
  await page.getByRole('button', { name: /^Open Trash/ }).click()
  await page.getByRole('button', { name: 'Empty Trash', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Empty Trash?' })
  await dialog.getByRole('button', { name: 'Empty Trash', exact: true }).click()

  await expect.poll(async () => (await listV2(page)).map(item => item.id)).toEqual([showId])
  await expect(page.getByRole('treeitem', { name: /Renamed v2 Show/ })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: /Renamed v2 Show copy/ })).toHaveCount(0)
  await page.screenshot({ path: '.wrsp/ui-proof/1039-rail-v2-trash.png' })

  expect(errors).toEqual([])
})
