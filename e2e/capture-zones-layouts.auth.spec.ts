// UI proof captures for #1039's Zones and Zone Layouts surface, run through
// `npm run capture:zones-layouts`. Everything is driven on the production Show
// URL with no query flag, because that is the route the surface lives on.
// Not a gate; it exists so the review proof is the route actually driven.
import { expect, test, type Page } from './fixtures/authenticated'

interface SavedShowV2 {
  id: string
  zones: Array<{ id: string; name: string }>
  composition: { clips: Array<{ id: string; zoneSampleMode: string }> }
}

async function listV2(page: Page): Promise<SavedShowV2[]> {
  const response = await page.request.get('/api/shows?show-version=2')
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()).shows as Array<{ version?: number }>)
    .filter(show => show.version === 2) as unknown as SavedShowV2[]
}

/** A fresh Show's Clips sample `independent`ly; see the spec's own note. */
async function spanSampling(page: Page, showId: string): Promise<void> {
  const saved = (await listV2(page)).find(show => show.id === showId)!
  for (const clip of saved.composition.clips) clip.zoneSampleMode = 'span'
  const response = await page.request.put(`/api/shows/${showId}?show-version=2`, { data: saved })
  expect(response.ok(), await response.text()).toBe(true)
  await page.reload()
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
}

async function createShow(page: Page, contract: 'Portable' | 'Installation', name: string): Promise<string> {
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: `Create ${contract} Show` }).click()
  await page.getByLabel('Show name').fill(name)
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  return new URL(page.url()).pathname.split('/').at(-1)!
}

test('captures the v2 Zone Map and Zone Layouts surface', async ({ page }) => {
  test.slow()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows?capture')
  const showId = await createShow(page, 'Portable', 'Two voices')
  await spanSampling(page, showId)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  const transport = page.getByTestId('show-editor-v2-transport')
  await transport.getByRole('button', { name: 'Pause Show preview' }).click()
  await transport.getByRole('button', { name: 'Go to Show start' }).click()

  // A second Zone, routed in every Layout definition by the Zone owner.
  const properties = page.getByTestId('show-v2-show-properties')
  await properties.scrollIntoViewIfNeeded()
  await properties.getByRole('button', { name: 'Add Zone' }).click()
  await expect.poll(async () => (await listV2(page))[0].zones).toHaveLength(2)
  const zoneId = (await listV2(page))[0].zones[1].id
  await properties.getByLabel('Zone').selectOption(zoneId)
  await properties.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-zones-layouts-zone-map.png' })

  // A second Zone Layout definition with a Moving split Y operator over both
  // Zones, which is the surface the route had no counterpart for at all.
  const layouts = page.getByTestId('show-v2-zone-layouts')
  await layouts.scrollIntoViewIfNeeded()
  await layouts.getByRole('button', { name: 'Add Zone Layout' }).click()
  await expect(layouts.getByLabel('Zone Layout name')).toHaveValue('Zone Layout')
  await layouts.getByLabel('Zone Layout name').fill('Halves')
  await layouts.getByRole('button', { name: 'Rename Zone Layout' }).click()
  await expect.poll(async () => (await listV2(page))[0].zones.length).toBe(2)
  await layouts.getByLabel('Routing mode').selectOption('split-y')
  await expect(layouts.getByLabel('Routing Zone 2')).toHaveValue(zoneId)
  await layouts.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-zones-layouts-routing.png' })

  // A Wave operator shows the parameter set and the growable member list.
  await layouts.getByLabel('Routing mode').selectOption('wave')
  await expect(layouts.getByRole('button', { name: 'Add routing Zone' })).toBeVisible()
  await layouts.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-zones-layouts-operator.png' })

  // The refusal that keeps a Layout definition in use: nothing is written.
  await layouts.getByLabel('Zone Layout', { exact: true }).selectOption({ index: 0 })
  await layouts.getByRole('button', { name: 'Remove Zone Layout' }).click()
  await layouts.getByRole('button', { name: 'Remove Default?' }).click()
  const status = page.getByTestId('show-inspector-v2-status')
  await expect(status).toContainText('still uses Zone Layout')
  await layouts.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-zones-layouts-refusal.png' })
  // The refused message itself lives at the foot of the inspector column.
  await status.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-zones-layouts-refusal-status.png' })

  // 390 px: the same section, with the routing mode focused. The Shows drawer
  // overlays the editor at this width until it is dismissed.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  const narrow = page.getByTestId('show-v2-zone-layouts')
  await narrow.scrollIntoViewIfNeeded()
  await narrow.getByLabel('Routing mode').focus()
  await expect(narrow.getByLabel('Routing mode')).toBeFocused()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-zones-layouts-narrow.png' })
})

test('captures the Installation LED ranges and their coverage', async ({ page }) => {
  test.slow()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows?capture')
  const showId = await createShow(page, 'Installation', 'Stair rail')
  await spanSampling(page, showId)

  const properties = page.getByTestId('show-v2-show-properties')
  await properties.scrollIntoViewIfNeeded()
  const pixels = properties.getByRole('textbox', { name: 'Installation pixels' })
  await pixels.fill('240')
  await pixels.press('Enter')
  await properties.getByRole('button', { name: 'Apply output contract' }).click()
  await properties.getByRole('button', { name: 'Add Zone' }).click()
  await expect.poll(async () => (await listV2(page))[0].zones).toHaveLength(2)

  const layouts = page.getByTestId('show-v2-zone-layouts')
  await layouts.scrollIntoViewIfNeeded()
  for (const [zone, ranges] of [['main', '0-119'], ['zone-2', '120-239']] as const) {
    const field = layouts.getByRole('textbox', { name: `${zone} pixel ranges` })
    await field.fill(ranges)
    await field.press('Enter')
  }
  await expect(layouts.getByTestId('show-v2-zone-layout-coverage'))
    .toHaveText('240 of 240 pixels assigned · 0 missing · 0 overlapping · 0 out of range')
  await layouts.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.wrsp/ui-proof/1039-zones-layouts-ranges.png' })
})
