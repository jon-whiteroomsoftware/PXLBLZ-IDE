// UI proof captures for #1056 slice 6's completed v2 editor route, run through
// `npm run capture:editor-v2-route`. Drives the ordinary Show route behind the
// version gate: a native fresh v2 Show, its summary, artifact inventory and
// delivery, the transport, the DELETE-READD boundary, the converted Show in the
// list, and the whole route at 390 px. Not a gate: it exists so the review
// proof is the route actually driven.
import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures/authenticated'

const GATE = 'show-v2-editor=1'
/** A converted v1 Show, stored as v2, so the list has a converted row to show. */
const converted = JSON.parse(readFileSync(new URL('./fixtures/showEditorV2ReadOnly.json', import.meta.url), 'utf8'))

test('captures the completed v2 editor route', async ({ page }) => {
  const legacy = await page.request.post('/api/shows', { data: converted.source })
  expect(legacy.ok(), await legacy.text()).toBe(true)
  const stored = await page.request.put(`/api/shows/${converted.record.id}?show-version=2`, { data: converted.record })
  expect(stored.ok(), await stored.text()).toBe(true)

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows?${GATE}&capture`)

  // A fresh Show, authored natively as v2 by the route's own builder.
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+\?/)

  const route = page.getByTestId('show-editor-v2-route')
  const surface = page.getByTestId('show-timeline-read-only')
  const delivery = page.getByTestId('show-editor-v2-delivery')
  await expect(route).toBeVisible()
  await expect(page.getByTestId('show-editor-v2-summary')).toContainText('62.00s')
  await expect(page.getByTestId('show-editor-v2-artifact-gauge')).toContainText('VM')
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  const transport = page.getByTestId('show-editor-v2-transport')
  await transport.getByRole('button', { name: 'Pause Show preview' }).click()
  await transport.getByRole('button', { name: 'Go to Show start' }).click()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('show-editor-v2-playhead-time')).toHaveText('0:05.0 / 1:02.0')
  await expect(page.getByTestId('show-editor-v2-delivery-status')).toBeVisible()
  await page.screenshot({ path: '.wrsp/ui-proof/1056-s6-fresh-show.png' })

  // The artifact inventory the delivery panel draws from the prepared Show.
  await delivery.scrollIntoViewIfNeeded()
  await delivery.getByRole('button', { name: 'Reopen artifacts' }).click()
  await expect(delivery).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  await page.screenshot({ path: '.wrsp/ui-proof/1056-s6-delivery.png' })

  // DELETE-READD: delete the second Clip, then add a replacement exactly at the
  // freed boundary. No Transition resurrects and Show End does not move.
  await surface.getByRole('button', { name: /^Clip CometLoom,/ }).focus()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('show-timeline-read-only-status')).toHaveText('Clip deleted.')
  const inspector = page.getByTestId('show-clip-inspector-v2')
  await inspector.getByRole('button', { name: 'Add Clip', exact: true }).click()
  await inspector.getByRole('combobox', { name: 'Clip Pattern' }).click()
  await page.getByRole('option', { name: 'CometLoom', exact: true }).first().click()
  for (const [label, value] of [['New Clip start', '30000'], ['New Clip duration', '10000']] as const) {
    const field = inspector.getByRole('textbox', { name: label, exact: true })
    await field.fill(value)
    await field.press('Enter')
  }
  await inspector.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(inspector.getByText('Clip saved.', { exact: true })).toBeVisible()
  await expect(surface.locator('[data-show-layer-junction="derived-cut"]')).toHaveCount(1)
  await page.screenshot({ path: '.wrsp/ui-proof/1056-s6-delete-readd.png' })

  // The Show list offers both stored v2 rows - the converted one and the
  // natively created one - and opening the converted row routes to the editor.
  if (await openShows.isVisible()) await openShows.click()
  await expect(page.getByRole('treeitem', { name: /Editor v2 read only/ })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: /Untitled Show/ })).toBeVisible()
  await page.getByRole('treeitem', { name: /Editor v2 read only/ }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${converted.record.id}\\?`))
  await expect(page.getByTestId('show-editor-v2-route-version')).toHaveText('v2')
  await page.screenshot({ path: '.wrsp/ui-proof/1056-s6-show-list.png' })

  // Narrow width: the whole route stacks, and the side panel reaches its last
  // section - the summary, the artifact inventory and the delivery commands.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  await expect(page.getByTestId('show-editor-v2-route-version')).toBeVisible()
  await page.screenshot({ path: '.wrsp/ui-proof/1056-s6-narrow.png' })

  // The panel's last section is reachable by ordinary wheel scrolling, with no
  // programmatic scrollTop.
  const panel = page.getByTestId('show-editor-v2-side-panel')
  const status = page.getByTestId('show-editor-v2-delivery-status')
  await panel.hover()
  for (let step = 0; step < 40; step++) {
    const box = await status.boundingBox()
    if (box && box.y >= 0 && box.y + box.height <= 844) break
    await page.mouse.wheel(0, 300)
  }
  await expect(status).toBeInViewport()
  await page.screenshot({ path: '.wrsp/ui-proof/1056-s6-narrow-delivery.png' })
})
