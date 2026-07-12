import { expect, test } from './fixtures/authenticated'

test('EPE import preserves source and discloses a missing preferred custom map', async ({ page }) => {
  const source = [
    '// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/',
    '// pxlblz:1 kind=show id=playwright-map-import name="Installation Show" hash=00000000 stamped=2026-07-12T00:00:00.000Z',
    '// pxlblz:map preferred=custom name="Missing Stage"',
    '// pxlblz:compat portability=installation-bound dimensions=2 classes=custom resolution=fixed exact=true',
    'export function render2D(index, x, y) { hsv(x, 1, y) }',
  ].join('\n')

  await page.goto('studio/patterns')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'installation-show.epe',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ name: 'Installation Show', sources: { main: source } })),
  })

  await expect(page.getByRole('status')).toContainText('Preferred custom map "Missing Stage" is not available')
  await expect(page.getByTestId('pattern-list-scroll').getByText('Installation Show', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/studio\/patterns\/[a-z0-9-]+$/)
})
