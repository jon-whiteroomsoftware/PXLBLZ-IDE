import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from './fixtures/authenticated'

/**
 * The Show-level surface on the production Show route (#1039): the output
 * summary, the output contract, the Stage map, the Zone Map's rename, Trails,
 * and the header's View code and Download .epe.
 *
 * These are the v2 counterparts of the `e2e/shows.auth.spec.ts` tests that the
 * flip re-seeded as version-1 rows - "reloads a Portable output contract", the
 * Installation Show properties readback and the Zone Map. Those stay in place
 * for rows still stored as v1; #1042 retires them.
 *
 * Two of that spec's surfaces have no counterpart to assert here, because they
 * have no v2 owner at all: adding or removing a Zone, and a Zone Layout
 * definition's routing mode. `src/engine/showV2ShowSurfaceResiduals.test.ts`
 * holds those gaps as checked facts and the editor contract records them.
 */

/** The stored version-2 documents, filtered the way the provider filters them. */
async function listV2(page: Page): Promise<Array<Record<string, unknown>>> {
  const response = await page.request.get('/api/shows?show-version=2')
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()).shows as Array<{ version?: number }>)
    .filter(show => show.version === 2) as Array<Record<string, unknown>>
}

async function createPortableShow(page: Page, name: string, pixels: string): Promise<string> {
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Portable Show' }).click()
  await page.getByLabel('Show name').fill(name)
  const previewPixels = page.getByRole('textbox', { name: 'Preview pixels exact pixel count' })
  await previewPixels.fill(pixels)
  const before = new URL(page.url()).pathname
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(before)
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  return new URL(page.url()).pathname.split('/').at(-1)!
}

/** The Show properties section inside the v2 Show inspector. */
function properties(page: Page) {
  return page.getByTestId('show-v2-show-properties')
}

async function captureBothFidelities(page: Page, prefix: string): Promise<void> {
  const stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  const pause = stage.getByRole('button', { name: 'Pause Show preview' }).first()
  if (await pause.isVisible()) await pause.click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') {
      await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
      await page.getByRole('option', { name: 'Precise', exact: true }).click()
      await expect(stage).toContainText('Precise')
    }
    const capture = await page.evaluate(name => window.__pxlblzShow!.captureSequence({
      frames: 2, fps: 8, startMs: 0, prefix: name,
    }), `${prefix}-${mode.toLowerCase()}`)
    expect(capture.failures).toEqual([])
    expect(capture.names).toHaveLength(2)
  }
}

test('the v2 route reads and writes the output contract, Stage map, Zones and Trails', async ({ page }) => {
  test.slow()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows?capture')
  const showId = await createPortableShow(page, 'Touring field', '1024')

  // The contract chosen at creation is now readable on the route that owns it.
  const panel = properties(page)
  await panel.scrollIntoViewIfNeeded()
  await expect(panel.getByTitle('Show output summary')).toHaveText('Portable · 1024 px reference · Square')
  await expect(panel.getByLabel('Output contract')).toHaveValue('portable-2d')
  await expect(panel.getByLabel('Reference map')).toHaveValue('plane')
  await expect(panel.getByRole('textbox', { name: 'Portable reference pixels' })).toHaveValue('1024')
  // A Portable contract names a 2D reference map, so a 3D one is not offered.
  await expect(panel.getByLabel('Reference map').getByRole('option', { name: 'Cube volume' })).toHaveCount(0)

  // Switch it to Installation with its own map and count, as one edit.
  await panel.getByLabel('Output contract').selectOption('installation')
  await panel.getByLabel('Output map').selectOption('wide')
  const pixels = panel.getByRole('textbox', { name: 'Installation pixels' })
  await pixels.fill('512')
  await pixels.press('Enter')
  await panel.getByRole('button', { name: 'Apply output contract' }).click()
  await expect(panel.getByTitle('Show output summary')).toHaveText('Installation · 512 px fixed · Wide 2:1')
  await expect.poll(async () => (await listV2(page))[0]).toMatchObject({
    id: showId,
    outputContract: { kind: 'installation', pixelCount: 512, outputMapId: 'wide' },
    stageMapId: 'wide',
  })

  // The Stage map moves on its own, leaving the contract untouched.
  await panel.getByLabel('Stage map').selectOption('plane')
  await expect.poll(async () => (await listV2(page))[0]).toMatchObject({
    stageMapId: 'plane',
    outputContract: { kind: 'installation', outputMapId: 'wide' },
  })
  // The Stage previews and compiles against the map it now names, in both modes.
  await captureBothFidelities(page, 'editor-v2-show-properties')

  // A Zone renames through the same owner an agent calls, and Undo restores it.
  await panel.getByLabel('Zone').selectOption({ index: 1 })
  const zoneName = panel.getByRole('textbox', { name: 'Zone name' })
  const original = await zoneName.inputValue()
  await zoneName.fill('Stage left')
  await panel.getByRole('button', { name: 'Rename Zone' }).click()
  await expect.poll(async () => ((await listV2(page))[0].zones as Array<{ name: string }>)[0].name).toBe('Stage left')
  const history = page.getByTestId('show-timeline-read-only').getByRole('group', { name: 'Show history' })
  await history.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => ((await listV2(page))[0].zones as Array<{ name: string }>)[0].name).toBe(original)

  // Trails is an output Effect on the record, not an editor preference.
  await panel.getByLabel('Enable Trails').check()
  await expect.poll(async () => (await listV2(page))[0].outputEffects)
    .toEqual([{ id: 'trails', kind: 'trails', retention: 15 / 16 }])

  // Everything above survives a reload of the same stored record.
  await page.reload()
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  const reloaded = properties(page)
  await reloaded.scrollIntoViewIfNeeded()
  await expect(reloaded.getByTitle('Show output summary')).toHaveText('Installation · 512 px fixed · Wide 2:1')
  await expect(reloaded.getByLabel('Stage map')).toHaveValue('plane')
  await expect(reloaded.getByLabel('Enable Trails')).toBeChecked()

  // ROUTE: the exported `.pxlshow` reopens through its own importer carrying
  // exactly what this surface wrote.
  const delivery = page.getByTestId('show-editor-v2-delivery')
  const pxlshow = page.waitForEvent('download')
  await delivery.getByRole('button', { name: 'Export .pxlshow' }).click()
  const exported = await pxlshow
  const bytes = await readFile((await exported.path())!)
  const reopened = await page.evaluate(async (buffer: number[]) => {
    const load = (path: string) => import(path)
    const { parseShowFileBundle } = await load('/PXLBLZ-IDE/src/engine/showFileBundle.ts')
    return parseShowFileBundle(new Uint8Array(buffer), { acceptV2: true })
  }, [...bytes])
  expect(reopened.show).toMatchObject({
    version: 2,
    stageMapId: 'plane',
    outputContract: { kind: 'installation', pixelCount: 512, outputMapId: 'wide' },
    outputEffects: [{ id: 'trails', kind: 'trails', retention: 15 / 16 }],
  })

  expect(errors).toEqual([])
})

test('the v2 route header views the generated code and downloads the .epe', async ({ page }) => {
  test.slow()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows')
  await createPortableShow(page, 'Touring field', '1024')

  // View code shows the compiled Show, and Back to show returns to the editor.
  await page.getByRole('button', { name: 'Show actions' }).click()
  await page.getByRole('menuitem', { name: 'View code' }).click()
  const generated = page.getByTestId('show-editor-v2-generated')
  await expect(generated).toContainText('Generated pattern - Touring field')
  await expect(generated).toContainText('Compiled PXLBLZ Show')
  await expect(page.getByTestId('show-editor-v2-side-panel')).toHaveCount(0)
  await generated.getByRole('button', { name: 'Back to show' }).click()
  await expect(page.getByTestId('show-editor-v2-side-panel')).toBeVisible()

  // Download .epe writes the artifact the v1 exporter names, and it reopens
  // through the `.epe` importer.
  await page.getByRole('button', { name: 'Show actions' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download .epe' }).click()
  const epe = await download
  expect(epe.suggestedFilename()).toBe('touring-field.epe')
  const text = await readFile((await epe.path())!, 'utf8')
  const parsed = await page.evaluate(async (contents: string) => {
    const load = (path: string) => import(path)
    const { parseEpe } = await load('/PXLBLZ-IDE/src/engine/epeImport.ts')
    const imported = parseEpe(contents)
    return { name: imported.name, src: imported.src }
  }, text)
  expect(parsed.name).toBe('Touring field')
  expect(parsed.src).toContain('Compiled PXLBLZ Show: Touring field')

  // 390 px: the whole surface stays reachable by keyboard and nothing escapes
  // the viewport. The Shows drawer overlays the editor until it is dismissed.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  const panel = properties(page)
  await panel.scrollIntoViewIfNeeded()
  await expect(panel).toBeVisible()
  const contract = panel.getByLabel('Output contract')
  await contract.focus()
  await expect(contract).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByLabel('Reference map')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('textbox', { name: 'Portable reference pixels' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: 'Apply output contract' })).toBeFocused()

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
