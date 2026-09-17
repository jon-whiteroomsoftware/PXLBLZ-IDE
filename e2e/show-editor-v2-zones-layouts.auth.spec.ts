import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from './fixtures/authenticated'

/**
 * Zones and Zone Layout definitions on the production Show route (#1039).
 *
 * Before this slice the v2 editor had no owner for either: a person could not
 * create a second Zone or change how a Layout routes, while the v1 editor's
 * Zone Map and Zone Layout inspector could. These are the route counterparts of
 * the `e2e/shows.auth.spec.ts` tests that still seed version-1 rows for those
 * surfaces.
 *
 * The oracles are the provider readback, the reopened `.pxlshow` through
 * `parseShowFileBundle`, the exported `.epe` through `parseEpe`, and Fast and
 * Precise Stage frames at named times on both sides of a Layout switch.
 */

interface SavedShowV2 {
  id: string
  zones: Array<{ id: string; name: string; nominalPixelCount: number }>
  zoneLayouts: Array<{
    id: string
    name: string
    zones: Array<{ zoneId: string; ranges: Array<{ start: number; end: number }> }>
    logical?: { kind: string; zoneIds: string[]; axis?: string }
  }>
  composition: {
    layers: Array<{ id: string; zoneId: string; name: string }>
    clips: Array<{ id: string; zoneId: string; layerId: string; startMs: number; durationMs: number; zoneSampleMode: string }>
    propertyTracks: unknown[]
    layoutOccurrences: Array<{ id: string; layoutId: string; startMs: number; durationMs: number }>
  }
}

/** The stored version-2 documents, filtered the way the provider filters them. */
async function listV2(page: Page): Promise<SavedShowV2[]> {
  const response = await page.request.get('/api/shows?show-version=2')
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()).shows as Array<{ version?: number }>)
    .filter(show => show.version === 2) as unknown as SavedShowV2[]
}

/**
 * A fresh Show's two Clips sample their Zone independently, which the lowerer
 * admits only while the Show has exactly one Zone: adding a second one is then
 * refused with `lowering requires repeat-mode Clip sampling evidence`. Neither
 * editor route offers a Clip-sampling control - only the `update_clips` command
 * writes it - so this setup writes `span` through the provider the way an agent
 * would. The gap is recorded in the editor contract as a residual of #1039.
 */
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
  const before = new URL(page.url()).pathname
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(before)
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  return new URL(page.url()).pathname.split('/').at(-1)!
}

/** Two frames in both renderer modes at one named Show time. */
async function captureBothFidelities(page: Page, prefix: string, startMs: number): Promise<void> {
  const stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') {
      await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
      await page.getByRole('option', { name: 'Precise', exact: true }).click()
      await expect(stage).toContainText('Precise')
    }
    const capture = await page.evaluate(request => window.__pxlblzShow!.captureSequence({
      frames: 2, fps: 8, startMs: request.startMs, prefix: request.prefix,
    }), { prefix: `${prefix}-${mode.toLowerCase()}`, startMs })
    expect(capture.failures).toEqual([])
    expect(capture.names).toHaveLength(2)
  }
  await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
  await page.getByRole('option', { name: 'Fast', exact: true }).click()
}

test('the v2 route adds a Zone with its own content and routes it through a new Zone Layout', async ({ page }) => {
  test.slow()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows?capture')
  const showId = await createShow(page, 'Portable', 'Two voices')
  await spanSampling(page, showId)
  const inspector = page.getByTestId('show-inspector-v2')
  const properties = page.getByTestId('show-v2-show-properties')
  await properties.scrollIntoViewIfNeeded()

  // A fresh Show has one Zone, which the route could never add to.
  await expect(properties.getByLabel<HTMLSelectElement>('Zone')).toHaveValue('')
  await properties.getByRole('button', { name: 'Add Zone' }).click()
  await expect.poll(async () => (await listV2(page))[0].zones.map(zone => zone.name)).toEqual(['main', 'zone-2'])
  // The new Zone carries the identity the surface allocated, not a guessed one.
  const zoneId = (await listV2(page))[0].zones[1].id
  // The counterexample the missing owner produced: a Zone no Layout definition
  // routes stops the whole Show preparing. Every definition names it now, and
  // the Stage is still previewing.
  await expect.poll(async () => (await listV2(page))[0].zoneLayouts[0].logical)
    .toEqual({ kind: 'stripes', axis: 'x', zoneIds: ['zone-1', zoneId] })
  await expect(page.getByTestId('show-stage-preview')).toBeVisible()

  // A Layer and a Clip of its own on the new Zone.
  const layers = inspector.getByRole('region', { name: 'Layers' }).or(inspector.locator('section[aria-label="Layers"]'))
  await layers.scrollIntoViewIfNeeded()
  await layers.getByRole('button', { name: 'Add Layer' }).click()
  await layers.getByLabel('New Layer Zone').selectOption(zoneId)
  await layers.getByLabel('New Layer name').fill('Accent')
  await layers.getByRole('button', { name: 'Add Layer at top' }).click()
  await expect.poll(async () => (await listV2(page))[0].composition.layers.map(layer => [layer.zoneId, layer.name]))
    .toEqual([['zone-1', 'Main'], [zoneId, 'Accent']])

  const clips = page.getByTestId('show-v2-add-clip')
  await clips.scrollIntoViewIfNeeded()
  await clips.getByRole('button', { name: 'Add Clip', exact: true }).click()
  await clips.getByRole('combobox', { name: 'Clip Pattern' }).click()
  await page.getByRole('option', { name: 'CometLoom', exact: true }).first().click()
  await clips.getByLabel('Clip Zone').selectOption(zoneId)
  await clips.getByLabel('Clip Layer').selectOption({ label: 'Accent' })
  for (const [label, value] of [['New Clip start', '0'], ['New Clip duration', '20000']] as const) {
    const field = clips.getByRole('textbox', { name: label, exact: true })
    await field.fill(value)
    await field.press('Enter')
  }
  await clips.getByRole('button', { name: 'Add', exact: true }).click()
  await expect.poll(async () => (await listV2(page))[0].composition.clips
    .filter(clip => clip.zoneId === zoneId)
    .map(clip => [clip.startMs, clip.durationMs])).toEqual([[0, 20_000]])

  // A second Zone Layout definition, renamed, with its own routing mode.
  const layouts = page.getByTestId('show-v2-zone-layouts')
  await layouts.scrollIntoViewIfNeeded()
  await expect(layouts.getByLabel('Routing mode')).toHaveValue('stripes-x')
  await layouts.getByRole('button', { name: 'Add Zone Layout' }).click()
  await expect.poll(async () => (await listV2(page))[0].zoneLayouts.map(layout => layout.name))
    .toEqual(['Default', 'Zone Layout'])
  await layouts.getByLabel('Zone Layout name').fill('Halves')
  await layouts.getByRole('button', { name: 'Rename Zone Layout' }).click()
  await expect.poll(async () => (await listV2(page))[0].zoneLayouts[1].name).toBe('Halves')
  await layouts.getByLabel('Routing mode').selectOption('split-y')
  await expect.poll(async () => (await listV2(page))[0].zoneLayouts[1].logical)
    .toEqual({ kind: 'split', axis: 'y', zoneIds: ['zone-1', zoneId] })
  // Both member Zones are authorable, and the operator keeps its arity.
  await expect(layouts.getByLabel('Routing Zone 1')).toHaveValue('zone-1')
  await expect(layouts.getByLabel('Routing Zone 2')).toHaveValue(zoneId)
  await expect(layouts.getByRole('button', { name: 'Add routing Zone' })).toHaveCount(0)

  // LAYOUT-END: the new definition plays on a second Layout occurrence.
  const panel = page.getByTestId('show-editor-v2-transitions-layout')
  await panel.scrollIntoViewIfNeeded()
  // The occurrence controls belong to the selected occurrence band.
  await panel.getByRole('button', { name: /Zone Layout occurrence/ }).first().click()
  await panel.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect.poll(async () => (await listV2(page))[0].composition.layoutOccurrences).toHaveLength(2)
  const switchMs = (await listV2(page))[0].composition.layoutOccurrences[1].startMs
  await panel.getByRole('button', { name: /Zone Layout occurrence/ }).nth(1).click()
  await panel.getByLabel('Layout definition', { exact: true }).selectOption({ label: 'Halves' })
  await expect.poll(async () => (await listV2(page))[0].composition.layoutOccurrences.map(occurrence => occurrence.layoutId))
    .toEqual(['layout-1', (await listV2(page))[0].zoneLayouts[1].id])

  // The Stage compiles and renders on both sides of the switch, in both modes.
  await captureBothFidelities(page, 'zones-layouts-before-switch', Math.max(0, switchMs - 1_000))
  await captureBothFidelities(page, 'zones-layouts-after-switch', switchMs + 1_000)

  // ROUTE: the exported `.pxlshow` reopens through its own importer with both
  // Zones, both definitions and the occurrence routing this surface wrote.
  const delivery = page.getByTestId('show-editor-v2-delivery')
  await delivery.scrollIntoViewIfNeeded()
  const download = page.waitForEvent('download')
  await delivery.getByRole('button', { name: 'Export .pxlshow' }).click()
  const bytes = await readFile((await (await download).path())!)
  const reopened = await page.evaluate(async (buffer: number[]) => {
    const load = (path: string) => import(path)
    const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
    return parseShowFileBundle(new Uint8Array(buffer), { acceptV2: true })
  }, [...bytes])
  expect(reopened.show.zones.map((zone: { name: string }) => zone.name)).toEqual(['main', 'zone-2'])
  expect(reopened.show.zoneLayouts.map((layout: { name: string }) => layout.name)).toEqual(['Default', 'Halves'])
  expect(reopened.show.zoneLayouts[1].logical).toEqual({ kind: 'split', axis: 'y', zoneIds: ['zone-1', zoneId] })
  expect(reopened.show.composition.layoutOccurrences).toHaveLength(2)

  // And the `.epe` the header downloads reopens as one portable Pattern.
  await page.getByRole('button', { name: 'Show actions' }).click()
  const epeDownload = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download .epe' }).click()
  const epe = await readFile((await (await epeDownload).path())!, 'utf8')
  const parsed = await page.evaluate(async (contents: string) => {
    const load = (path: string) => import(path)
    const { parseEpe } = await load('/PXLBLZ-IDE/src/engine/epeImport.ts')
    const imported = parseEpe(contents)
    return { name: imported.name, src: imported.src }
  }, epe)
  expect(parsed.name).toBe('Two voices')
  expect(parsed.src).toContain('Compiled PXLBLZ Show: Two voices')

  expect(errors).toEqual([])
})

test('the v2 route authors Installation LED ranges and removes a Zone with its content', async ({ page }) => {
  test.slow()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

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
  await expect(properties.getByTitle('Show output summary')).toContainText('Installation · 240 px fixed')

  await properties.getByRole('button', { name: 'Add Zone' }).click()
  await expect.poll(async () => (await listV2(page))[0].zones.map(zone => zone.name)).toEqual(['main', 'zone-2'])
  const zoneId = (await listV2(page))[0].zones[1].id

  // An Installation definition routes by exact LED indexes, which the route
  // could not author at all. The coverage readout is v1's own arithmetic.
  const layouts = page.getByTestId('show-v2-zone-layouts')
  await layouts.scrollIntoViewIfNeeded()
  await expect(layouts.getByLabel('Routing mode')).toHaveValue('physical')
  const coverage = layouts.getByTestId('show-v2-zone-layout-coverage')
  await expect(coverage).toContainText('out of range')
  for (const [zone, ranges] of [['main', '0-119'], ['zone-2', '120-239']] as const) {
    const field = layouts.getByRole('textbox', { name: `${zone} pixel ranges` })
    await field.fill(ranges)
    await field.press('Enter')
  }
  await expect(coverage).toHaveText('240 of 240 pixels assigned · 0 missing · 0 overlapping · 0 out of range')
  await expect.poll(async () => (await listV2(page))[0].zoneLayouts[0].zones).toEqual([
    { zoneId: 'zone-1', ranges: [{ start: 0, end: 119 }] },
    { zoneId, ranges: [{ start: 120, end: 239 }] },
  ])

  // Removing a Zone takes its Layers, Clips and Property tracks with it, asks
  // once, and Undo brings the whole record back.
  await properties.scrollIntoViewIfNeeded()
  await properties.getByLabel('Zone').selectOption({ label: 'main' })
  await properties.getByRole('button', { name: 'Remove Zone' }).click()
  await properties.getByRole('button', { name: 'Delete main and its Clips?' }).click()
  await expect.poll(async () => {
    const saved = (await listV2(page))[0]
    return [saved.zones.map(zone => zone.id), saved.composition.clips.length, saved.composition.layers.length]
  }).toEqual([[zoneId], 0, 0])
  await expect(properties.getByRole('button', { name: 'Remove Zone' })).toHaveCount(0)

  const history = page.getByTestId('show-timeline-read-only').getByRole('group', { name: 'Show history' })
  await history.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => {
    const saved = (await listV2(page))[0]
    return [saved.zones.map(zone => zone.id), saved.composition.clips.length]
  }).toEqual([['zone-1', zoneId], 2])

  // FAILURE-adjacent: the ranges and the Zones survive a reload of the same
  // stored record, and the routing readout is what was saved.
  await page.reload()
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  const reloaded = page.getByTestId('show-v2-zone-layouts')
  await reloaded.scrollIntoViewIfNeeded()
  await expect(reloaded.getByRole('textbox', { name: 'main pixel ranges' })).toHaveValue('0-119')
  await expect(reloaded.getByTestId('show-v2-zone-layout-coverage')).toContainText('240 of 240 pixels assigned')

  // 390 px: the new controls stay reachable by keyboard and inside the window.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  const narrow = page.getByTestId('show-v2-zone-layouts')
  await narrow.scrollIntoViewIfNeeded()
  const mode = narrow.getByLabel('Routing mode')
  await mode.focus()
  await expect(mode).toBeFocused()
  const overflow = await page.getByTestId('show-editor-v2-route').evaluate(root => (
    [...root.querySelectorAll<HTMLElement>('input,select,button,[role="button"]')]
      .filter(element => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
      })
      .map(element => element.getAttribute('aria-label') ?? element.textContent)
  ))
  expect(overflow).toEqual([])

  expect(errors).toEqual([])
})
