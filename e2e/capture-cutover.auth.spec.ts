// UI proof captures for #1039's flip, run through `npm run capture:cutover`.
// Everything here is driven on the production URL with no query flag at all,
// because that is what the flip decides: which editor an ordinary user reaches
// for a given Show. Not a gate; it exists so the review proof is the route
// actually driven.
import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures/authenticated'

/** A converted v1 Show, stored as v2, standing in for a migrated row. */
const converted = JSON.parse(readFileSync(new URL('./fixtures/showEditorV2ReadOnly.json', import.meta.url), 'utf8'))

test('captures the production Show route after the cutover', async ({ page }) => {
  // One row of each stored version: the converted one, and one the operator
  // conversion has not reached.
  const legacy = await page.request.post('/api/shows', { data: converted.source })
  expect(legacy.ok(), await legacy.text()).toBe(true)
  const stored = await page.request.put(`/api/shows/${converted.record.id}?show-version=2`, { data: converted.record })
  expect(stored.ok(), await stored.text()).toBe(true)
  const unconverted = { ...converted.source, id: 'cutover-unconverted-row', name: 'Not Yet Converted' }
  const seeded = await page.request.post('/api/shows', { data: unconverted })
  expect(seeded.ok(), await seeded.text()).toBe(true)

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows?capture')

  // A fresh Show on the production URL: authored as version 2, on the v2 editor.
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+/)
  expect(new URL(page.url()).search).not.toContain('show-v2-editor')

  const route = page.getByTestId('show-editor-v2-route')
  await expect(route).toBeVisible()
  await expect(page.getByTestId('show-editor-v2-route-version')).toHaveText('v2')
  await expect(page.getByTestId('show-editor-v2-summary')).toContainText('62.00s')
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  const transport = page.getByTestId('show-editor-v2-transport')
  await transport.getByRole('button', { name: 'Pause Show preview' }).click()
  await transport.getByRole('button', { name: 'Go to Show start' }).click()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-cutover-fresh.png' })

  // The Shows list carries both stored versions, and marks the exception: the
  // selected row reads `v1` only while storage still holds it that way.
  if (await openShows.isVisible()) await openShows.click()
  await expect(page.getByRole('treeitem', { name: /Editor v2 read only/ })).toBeVisible()
  await page.getByRole('treeitem', { name: /Not Yet Converted/ }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${unconverted.id}`))
  await expect(page.getByTestId('show-timeline-toolbar')).toBeVisible()
  await expect(route).toHaveCount(0)
  if (await openShows.isVisible()) await openShows.click()
  await expect(page.getByRole('treeitem', { name: /Not Yet Converted/ })).toContainText('v1')
  // The marker shares its corner with the row's hover actions, so the pointer
  // has to leave the row for the capture to show what the assertion checked.
  await page.mouse.move(700, 900)
  await page.screenshot({ path: '.wrsp/ui-proof/1039-cutover-unconverted.png' })

  // The converted row opens on the v2 editor from the same list.
  await page.getByRole('treeitem', { name: /Editor v2 read only/ }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${converted.record.id}`))
  await expect(page.getByTestId('show-editor-v2-route-version')).toHaveText('v2')
  await page.screenshot({ path: '.wrsp/ui-proof/1039-cutover-converted.png' })

  // 390 px: the production route stacks and stays reachable.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  await expect(page.getByTestId('show-editor-v2-route-version')).toBeVisible()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-cutover-narrow.png' })
})
