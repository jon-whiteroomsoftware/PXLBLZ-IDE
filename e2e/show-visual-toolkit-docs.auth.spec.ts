import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from './fixtures/authenticated'

const refreshScreenshots = process.env.UPDATE_DOC_SCREENSHOTS === '1'
const overviewPath = resolve('docs/screenshots/show-visual-toolkit-overview.png')
const entityDetailPath = resolve('docs/screenshots/show-visual-toolkit-entity-detail.png')

test('regenerates the Visual Effects Guide screenshots from the current Show UI (#655)', async ({ page }) => {
  test.skip(!refreshScreenshots, 'Run npm run docs:screenshots:visual-effects to refresh the committed guide assets.')

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('studio/shows/stock-show-showcase-redline-installation')

  await expect(page.getByRole('button', { name: 'Collapse Redline Installation guide' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  await expect(page.getByText('complete coverage', { exact: false })).toBeVisible()

  const pause = page.getByRole('button', { name: 'Pause Show preview' })
  if (await pause.isVisible()) await pause.click()
  await page.getByRole('slider', { name: 'Show playhead' }).fill('16900')
  await expect(page.getByRole('status', { name: 'Show time' })).toContainText('00:16.9')

  await page.screenshot({
    path: overviewPath,
    animations: 'disabled',
  })
  await expectPngSize(overviewPath, 1280, 720)

  await page.getByRole('button', { name: 'Select RedlineMachine', exact: true }).first().click()
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  await expect(panel.getByRole('heading', { name: 'RedlineMachine' })).toBeVisible()
  await expect(panel.getByRole('tab', { name: /^Pattern/ })).toBeVisible()
  await expect(panel.getByRole('table', { name: 'Pattern controls' })).toBeVisible()

  await page.screenshot({
    path: entityDetailPath,
    animations: 'disabled',
  })
  await expectPngSize(entityDetailPath, 1280, 720)
})

async function expectPngSize(path: string, width: number, height: number): Promise<void> {
  const png = await readFile(path)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width, height })
}
