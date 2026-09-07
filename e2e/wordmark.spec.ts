import { test, expect, chromium, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Read painted amber ink, not computed color: Chromium reports the animated
 * unvisited color even when a visited home link paints static white (#63). */
async function paintedCrest(page: Page, fraction: number): Promise<number> {
  const wordmark = page.getByRole('link', { name: 'PXLBLZ home' }).getByLabel('PXLBLZ', { exact: true })
  const boxes = await wordmark.evaluate((element, phase) => {
    const bounds = element.getBoundingClientRect()
    return Array.from(element.children).map((letter) => {
      for (const animation of letter.getAnimations()) {
        animation.pause()
        animation.currentTime = Number(animation.effect!.getTiming().duration) * phase
      }
      const box = letter.getBoundingClientRect()
      return { left: box.left - bounds.left, right: box.right - bounds.left, width: bounds.width }
    })
  }, fraction)
  const png = await wordmark.screenshot({ animations: 'allow' })
  const counts = await page.evaluate(async ({ encoded, regions }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    return regions.map((region) => {
      const scale = canvas.width / region.width
      let amber = 0
      for (let y = 0; y < canvas.height; y++) {
        for (let x = Math.ceil(region.left * scale); x < Math.floor(region.right * scale); x++) {
          const offset = (y * canvas.width + x) * 4
          const [red, green, blue] = data.subarray(offset, offset + 3)
          if (red > 180 && green > 100 && red - blue > 70) amber++
        }
      }
      return amber
    })
  }, { encoded: png.toString('base64'), regions: boxes })
  expect(Math.max(...counts), `Painted amber pixels by letter: ${counts}`).toBeGreaterThan(0)
  return counts.indexOf(Math.max(...counts))
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`wordmark paints its round-trip chase after following home (${reducedMotion}, #63)`, async ({ baseURL }) => {
    // The normal Playwright context is private and does not retain visited links.
    // Use full Chromium as well: headless shell passed the broken implementation.
    // A disposable persistent profile exercises the actual failing sequence.
    const profile = await mkdtemp(join(tmpdir(), 'pxlblz-wordmark-'))
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion,
    })
    try {
      const page = context.pages()[0]
      await page.goto(new URL('gallery/zranger1', baseURL).href)
      await expect(page.getByRole('link', { name: 'PXLBLZ home' })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      expect(await paintedCrest(page, 0)).toBe(0)
      await page.getByRole('link', { name: 'PXLBLZ home' }).click()
      await page.waitForURL(baseURL!)
      await page.reload()
      await expect(page.getByRole('link', { name: 'PXLBLZ home' })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      for (const [phase, letter] of [[0, 0], [0.3, 3], [0.5, 5], [0.7, 3], [1, 0]]) {
        expect(await paintedCrest(page, phase)).toBe(letter)
      }
      await expect(page.locator('.pxlblz-letter').first()).toHaveCSS('animation-duration', reducedMotion === 'reduce' ? '4.2s' : '2.8s')
    } finally {
      await context.close()
      await rm(profile, { recursive: true, force: true })
    }
  })
}
