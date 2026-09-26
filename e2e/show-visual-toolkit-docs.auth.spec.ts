import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from './fixtures/authenticated'

const refreshScreenshots = process.env.UPDATE_DOC_SCREENSHOTS === '1'
const overviewPath = resolve('docs/screenshots/show-visual-toolkit-overview.png')
const entityDetailPath = resolve('docs/screenshots/show-visual-toolkit-entity-detail.png')

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })

test('regenerates the Visual Effects Guide screenshots from the current Show UI (#655)', async ({ page }) => {
  test.skip(!refreshScreenshots, 'Run npm run docs:screenshots:visual-effects to refresh the committed guide assets.')

  await page.goto('studio/shows/stock-show-showcase-redline-installation')

  await expect(page.getByRole('button', { name: 'Redline Installation guide' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  await expect(page.getByText('complete coverage', { exact: false })).toBeVisible()

  const toolbar = page.getByTestId('show-timeline-toolbar')
  const pause = toolbar.getByRole('button', { name: 'Pause Show preview' })
  if (await pause.isVisible()) await pause.click()
  await page.getByRole('slider', { name: 'Show playhead' }).fill('16900')
  await toolbar.getByRole('button', { name: 'Play Show preview' }).click()
  await page.waitForFunction(() => Number((document.querySelector('[aria-label="Show playhead"]') as HTMLInputElement | null)?.value ?? 0) > 17700)
  await pause.click()
  await expect(page.getByRole('status', { name: 'Show time' })).toContainText(/00:1[78]\.\d/)
  await expect(page.getByTestId('show-stage-canvas-frame')).toHaveAttribute('aria-busy', 'false')

  await page.screenshot({
    path: overviewPath,
    animations: 'disabled',
  })
  await expectPngSize(overviewPath, 3200, 2000)

  await page.getByRole('slider', { name: 'Show playhead' }).fill('16900')
  await page.getByRole('button', { name: 'Select RedlineMachine', exact: true }).first().click()
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  await expect(panel.getByRole('heading', { name: 'RedlineMachine' })).toBeVisible()
  await expect(panel.getByRole('tab', { name: /^Pattern/ })).toBeVisible()
  await expect(panel.getByRole('table', { name: 'Pattern controls' })).toBeVisible()
  await panel.getByRole('button', { name: 'Pin Entity Detail Panel' }).click()
  await expect(panel).toHaveAttribute('data-pinned', 'true')
  await toolbar.getByRole('button', { name: 'Play Show preview' }).click()
  await page.waitForFunction(() => Number((document.querySelector('[aria-label="Show playhead"]') as HTMLInputElement | null)?.value ?? 0) > 17700)
  await pause.click()
  await expect(panel.getByRole('heading', { name: 'RedlineMachine' })).toBeVisible()
  await expect(page.getByTestId('show-stage-canvas-frame')).toHaveAttribute('aria-busy', 'false')

  await page.screenshot({
    path: entityDetailPath,
    animations: 'disabled',
  })
  await expectPngSize(entityDetailPath, 3200, 2000)
})

async function expectPngSize(path: string, width: number, height: number): Promise<void> {
  const png = await readFile(path)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width, height })
}
