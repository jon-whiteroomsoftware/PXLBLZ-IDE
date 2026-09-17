// UI proof captures for #1039's Show properties surface, run through
// `npm run capture:show-properties`. Everything is driven on the production
// Show URL with no query flag, because that is the route the surface lives on.
// Not a gate; it exists so the review proof is the route actually driven.
import { expect, test } from './fixtures/authenticated'

test('captures the v2 Show properties surface and the header Show actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows?capture')

  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Portable Show' }).click()
  await page.getByLabel('Show name').fill('Touring field')
  const previewPixels = page.getByRole('textbox', { name: 'Preview pixels exact pixel count' })
  await previewPixels.fill('1024')
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()

  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  const transport = page.getByTestId('show-editor-v2-transport')
  await transport.getByRole('button', { name: 'Pause Show preview' }).click()
  await transport.getByRole('button', { name: 'Go to Show start' }).click()

  // The contract chosen at creation, readable for the first time on this route.
  const panel = page.getByTestId('show-v2-show-properties')
  await panel.scrollIntoViewIfNeeded()
  await expect(panel.getByTitle('Show output summary')).toHaveText('Portable · 1024 px reference · Square')
  await page.screenshot({ path: '.wrsp/ui-proof/1039-show-properties-desktop.png' })

  // Applied as one edit: an Installation contract with its own map and count,
  // then the Stage map moved on its own and Trails enabled.
  await panel.getByLabel('Output contract').selectOption('installation')
  await panel.getByLabel('Output map').selectOption('wide')
  const pixels = panel.getByRole('textbox', { name: 'Installation pixels' })
  await pixels.fill('512')
  await pixels.press('Enter')
  await panel.getByRole('button', { name: 'Apply output contract' }).click()
  await expect(panel.getByTitle('Show output summary')).toHaveText('Installation · 512 px fixed · Wide 2:1')
  await panel.getByLabel('Stage map').selectOption('plane')
  await panel.getByLabel('Zone').selectOption({ index: 1 })
  await panel.getByLabel('Enable Trails').check()
  await expect(panel.getByLabel('Trails retention exact percentage')).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-show-properties-applied.png' })

  // The header's Show actions, and the generated pattern they open.
  await page.getByRole('button', { name: 'Show actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'View code' })).toBeEnabled()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-show-properties-actions.png' })
  await page.getByRole('menuitem', { name: 'View code' }).click()
  const generated = page.getByTestId('show-editor-v2-generated')
  await expect(generated).toContainText('Generated pattern - Touring field')
  // The code editor loads lazily; the capture is worthless before it arrives.
  await expect(generated).toContainText('Compiled PXLBLZ Show', { timeout: 30_000 })
  await page.screenshot({ path: '.wrsp/ui-proof/1039-show-properties-code.png' })
  await generated.getByRole('button', { name: 'Back to show' }).click()

  // 390 px: the same surface, with the contract control focused. The Shows
  // drawer overlays the editor at this width until it is dismissed.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  await panel.scrollIntoViewIfNeeded()
  await panel.getByLabel('Output contract').focus()
  await expect(panel.getByLabel('Output contract')).toBeFocused()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-show-properties-narrow.png' })
})
