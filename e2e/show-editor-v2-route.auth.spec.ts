import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from './fixtures/authenticated'
import { convertibleV1Show } from '../src/test/showV2TracerFixture'

/**
 * The #1039 acceptance flows on the ordinary Show route, now on the production
 * URL with no query flag at all: a fresh Show is authored natively as v2, the
 * delete/re-add boundary behaves, the Show list offers a stored v2 row, the
 * artifacts export and reopen, and the transport, Undo, Redo and reload all act
 * on the same record.
 *
 * The last test covers what the flip leaves visible during the transition: a
 * row storage still holds as v1 opens on the previous editor, because
 * specification section 10 forbids migrating a row on read, and the same row
 * opens on this route once it is stored as v2.
 */

/**
 * The stored version-2 documents. `?show-version=2` means "do not skip the
 * rows the v1 list hides", so it answers with both stored versions; the
 * provider filters it to actual v2 records and so does this.
 */
async function listV2(page: Page): Promise<Array<{ id: string; name: string; composition: Record<string, unknown> }>> {
  const response = await page.request.get('/api/shows?show-version=2')
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()).shows as Array<{ version?: number }>)
    .filter(show => show.version === 2) as Array<{ id: string; name: string; composition: Record<string, unknown> }>
}

async function createFreshShow(page: Page): Promise<string> {
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+/)
  return new URL(page.url()).pathname.split('/').at(-1)!
}

/** The drawn interval of the first Clip whose Pattern has this name. */
async function clipRange(page: Page, name: string, which: 'first' | 'last' = 'first'): Promise<[number, number]> {
  const matches = page.getByTestId('show-timeline-read-only')
    .getByRole('button', { name: new RegExp(`^Clip ${name},`) })
  const label = await (which === 'first' ? matches.first() : matches.last()).getAttribute('aria-label')
  const match = /([\d.]+)s to ([\d.]+)s/.exec(label ?? '')
  expect(match, label ?? 'missing label').not.toBeNull()
  return [Math.round(Number(match![1]) * 1_000), Math.round(Number(match![2]) * 1_000)]
}

test('a fresh v2 Show is authored, delivered and reopened through the ordinary route', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows?capture')
  const showId = await createFreshShow(page)

  // A fresh Show is native v2: two 30-second Clips over one two-sided Crossfade.
  const route = page.getByTestId('show-editor-v2-route')
  const surface = page.getByTestId('show-timeline-read-only')
  await expect(route).toBeVisible()
  await expect(surface).toHaveAttribute('data-show-record-version', '2')
  await expect(page.getByTestId('show-editor-v2-route-version')).toHaveText('v2')
  expect(await clipRange(page, 'TestPattern1D')).toEqual([0, 30_000])
  expect(await clipRange(page, 'CometLoom')).toEqual([32_000, 62_000])
  await expect(surface.locator('[data-show-layer-junction="layer"]'))
    .toHaveAttribute('data-show-transition-kind', 'crossfade')
  const [stored] = await listV2(page)
  expect(stored.id).toBe(showId)
  expect(stored.composition.showEndMs).toBe(62_000)

  // The summary and the artifact gauge describe that same prepared Show.
  const summary = page.getByTestId('show-editor-v2-summary')
  await expect(summary).toHaveAttribute('data-show-record-version', '2')
  await expect(summary).toContainText('62.00s')
  await expect(summary).toContainText('2 Clips')
  await expect(page.getByTestId('show-editor-v2-artifact-gauge')).toContainText('VM')

  // Transport: the route's own controls pause and rewind the running preview,
  // an arrow seeks five seconds, and `A` returns to the Show start.
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  const transport = page.getByTestId('show-editor-v2-transport')
  const playhead = surface.getByTestId('show-timeline-playhead')
  const position = page.getByTestId('show-editor-v2-playhead-time')
  await expect(playhead).toBeVisible()
  await transport.getByRole('button', { name: 'Pause Show preview' }).click()
  await transport.getByRole('button', { name: 'Go to Show start' }).click()
  await expect(position).toHaveText('0:00.0 / 1:02.0')
  await page.keyboard.press('ArrowRight')
  await expect(position).toHaveText('0:05.0 / 1:02.0')
  await expect(playhead).toHaveAttribute('data-show-playhead-ms', '5000')
  await page.keyboard.press('a')
  await expect(position).toHaveText('0:00.0 / 1:02.0')

  // DELETE-READD: deleting the second Clip leaves the first and Show End
  // untouched and removes the Transition that named it.
  const writes = { count: 0 }
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes(`/api/shows/${showId}?show-version=2`)) writes.count++
  })
  const status = page.getByTestId('show-timeline-read-only-status')
  await surface.getByRole('button', { name: /^Clip CometLoom,/ }).focus()
  await page.keyboard.press('Delete')
  await expect(status).toHaveText('Clip deleted.')
  expect(await clipRange(page, 'TestPattern1D')).toEqual([0, 30_000])
  await expect(surface.locator('[data-show-layer-junction]')).toHaveCount(0)
  await expect.poll(async () => (await listV2(page))[0].composition.showEndMs).toBe(62_000)

  // Add a replacement Clip exactly at the freed boundary. It joins the first
  // Clip as a plain Cut: no Transition resurrects.
  const inspector = page.getByTestId('show-clip-inspector-v2')
  await inspector.getByRole('button', { name: 'Add Clip', exact: true }).click()
  const pattern = inspector.getByRole('combobox', { name: 'Clip Pattern' })
  await pattern.click()
  await page.getByRole('option', { name: 'CometLoom', exact: true }).first().click()
  for (const [label, value] of [['New Clip start', '30000'], ['New Clip duration', '10000']] as const) {
    const field = inspector.getByRole('textbox', { name: label, exact: true })
    await field.fill(value)
    await field.press('Enter')
  }
  await inspector.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(inspector.getByText('Clip saved.', { exact: true })).toBeVisible()
  expect(await clipRange(page, 'CometLoom')).toEqual([30_000, 40_000])
  expect(await clipRange(page, 'TestPattern1D')).toEqual([0, 30_000])
  // Exact adjacency draws a derived Cut, and no authored Transition exists.
  await expect(surface.locator('[data-show-layer-junction="derived-cut"]')).toHaveCount(1)
  await expect.poll(async () => (await listV2(page))[0].composition.transitions).toEqual([])

  // Undo and Redo settle through the same queue, and the record reopens with
  // exactly what was saved.
  const history = surface.getByRole('group', { name: 'Show history' })
  await history.getByRole('button', { name: 'Undo' }).click()
  await expect(status).toHaveText('Undo saved.')
  await expect(surface.getByRole('button', { name: /^Clip CometLoom,/ })).toHaveCount(0)
  await history.getByRole('button', { name: 'Redo' }).click()
  await expect(status).toHaveText('Redo saved.')
  expect(await clipRange(page, 'CometLoom')).toEqual([30_000, 40_000])

  const delivery = page.getByTestId('show-editor-v2-delivery')
  await delivery.getByRole('button', { name: 'Reload saved v2' }).click()
  await expect(delivery).toContainText('Reloaded v2 bytes from the provider.')
  expect(await clipRange(page, 'CometLoom')).toEqual([30_000, 40_000])

  // Artifacts: the .pxlshow and the .epe reopen through their own importers.
  await delivery.getByRole('button', { name: 'Reopen artifacts' }).click()
  await expect(delivery).toContainText(/Reopened \.pxlshow v2 and \.epe/)

  await captureBothFidelities(page, 'editor-v2-route')

  // Narrow width: the route stays reachable and nothing escapes the viewport.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  const narrowSummary = page.getByTestId('show-editor-v2-summary')
  await narrowSummary.scrollIntoViewIfNeeded()
  await expect(narrowSummary).toBeVisible()
  const overflow = await route.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button,[role="button"]')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
    })
    .map(element => element.getAttribute('aria-label') ?? element.textContent))
  expect(overflow).toEqual([])

  // No mixed window: this route registers an agent binding only once the agent
  // service is enabled for the workspace, and when it does it declares record
  // version 2, so the executor and both catalogues follow the record this
  // editor holds (specification section 10). Without that onboarding, as here,
  // no editor is exposed for a command to attach to at all.
  expect(await page.evaluate(() => Boolean((window as { __pxlblzEditor?: unknown }).__pxlblzEditor))).toBe(false)

  expect(errors).toEqual([])
})

test('a v2 Show exports a file the Show list re-imports as its own record', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows')
  const showId = await createFreshShow(page)
  const delivery = page.getByTestId('show-editor-v2-delivery')

  const downloadPromise = page.waitForEvent('download')
  await delivery.getByRole('button', { name: 'Export .pxlshow' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pxlshow$/)
  const path = await download.path()
  expect(path).not.toBeNull()
  const bytes = await readFile(path!)
  await expect(delivery).toContainText('Exported untitled-show.pxlshow')

  // The same bytes import through the isolated v2 adapters as a second Show.
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'Import Show file…' }).click()
  await page.getByTestId('show-file-input').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/gzip',
    buffer: bytes,
  })
  const dialog = page.getByRole('alertdialog', { name: 'Import “Untitled Show”' })
  await expect(dialog).toContainText('Untitled Show (2)')
  await dialog.getByRole('button', { name: 'Import Show' }).click()
  await expect(dialog).toBeHidden()

  // Both rows are version-2 records, and the imported one has its own identity.
  await expect.poll(async () => (await listV2(page)).length).toBe(2)
  const shows = await listV2(page)
  const imported = shows.find(show => show.id !== showId)!
  expect(imported.name).toBe('Untitled Show (2)')
  expect(imported.composition).toEqual(shows.find(show => show.id === showId)!.composition)
  // The v1 list stays empty: a v2 record is never a `ShowRecord`.
  const v1 = await page.request.get('/api/shows')
  expect((await v1.json()).shows).toEqual([])

  // The Show list offers both rows, and the imported one opens on this route.
  await expect(page.getByRole('treeitem', { name: /Untitled Show \(2\)/ })).toBeVisible()
  await page.getByRole('treeitem', { name: /Untitled Show \(2\)/ }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${imported.id}`))
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  await expect(page.getByTestId('show-timeline-read-only')).toHaveAttribute('data-show-record-version', '2')

  expect(errors).toEqual([])
})

test('the production creation flow stores the chosen output contract on the v2 record', async ({ page }) => {
  // The flow is version-agnostic, and since the flip it writes a version-2
  // document. What it chose has to survive on that record and across a reload.
  // Reading or changing the contract afterwards is a v1 editor surface with no
  // v2 counterpart yet; see the editor contract's absent-surface list.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows')
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await expect(page.getByText('LED-resolution independent')).toBeVisible()
  await expect(page.getByText('Exact pixel and map identity')).toBeVisible()
  await page.getByRole('button', { name: 'Create Portable Show' }).click()
  await page.getByLabel('Show name').fill('Touring field')
  const previewPixels = page.getByRole('textbox', { name: 'Preview pixels exact pixel count' })
  await previewPixels.fill('1024')
  await page.getByRole('button', { name: 'Create Show' }).click()

  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+/)
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  const showId = new URL(page.url()).pathname.split('/').at(-1)!
  await expect.poll(async () => (await listV2(page))[0] as unknown as { outputContract?: unknown }).toMatchObject({
    id: showId,
    name: 'Touring field',
    outputContract: { kind: 'portable-2d', referencePixelCount: 1024, referenceMapId: 'plane' },
  })

  // Reload: the same record, still v2, still carrying the contract.
  await page.reload()
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  await expect(page.getByTestId('show-timeline-read-only')).toHaveAttribute('data-show-record-version', '2')
  expect((await listV2(page))[0].id).toBe(showId)
  // The v1 list never sees it.
  expect((await (await page.request.get('/api/shows')).json()).shows).toEqual([])
})

test('an unconverted row keeps the v1 editor, and the same row opens here once it is stored as v2', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  const source = { ...convertibleV1Show(), id: 'cutover-transition-row', name: 'Not Yet Converted' }
  const created = await page.request.post('/api/shows', { data: source })
  expect(created.ok(), await created.text()).toBe(true)

  // Before conversion: storage holds v1, so the v1 editor holds it too. Section
  // 10 forbids migrating a row on read, and nothing here writes one.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows/${source.id}`)
  await expect(page.getByTestId('show-timeline-toolbar')).toBeVisible()
  await expect(page.getByTestId('show-editor-v2-route')).toHaveCount(0)
  expect((await (await page.request.get('/api/shows')).json()).shows.map((show: { id: string }) => show.id))
    .toEqual([source.id])
  expect((await listV2(page)).map(show => show.id)).toEqual([])

  // The Shows list marks it as the exception while it is selected.
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  if (await openShows.isVisible()) await openShows.click()
  await expect(page.getByRole('treeitem', { name: /Not Yet Converted/ })).toContainText('v1')
  await page.keyboard.press('Escape')

  // Convert the row through the same writer the operator runbook uses. The
  // version-2 body comes from a Show the app itself authored, so this test
  // never has to run the converter outside the browser.
  await page.goto('studio/shows')
  const donorId = await createFreshShow(page)
  await expect.poll(async () => (await listV2(page)).map(show => show.id)).toContain(donorId)
  const donor = (await listV2(page)).find(show => show.id === donorId)!
  expect(donor).toBeDefined()
  const written = await page.request.put(`/api/shows/${source.id}?show-version=2`, {
    data: { ...donor, id: source.id, name: source.name },
  })
  expect(written.ok(), await written.text()).toBe(true)
  const removedDonor = await page.request.delete(`/api/shows/${donorId}`)
  expect(removedDonor.ok(), await removedDonor.text()).toBe(true)

  // After conversion the same URL opens this route, the v1 list no longer
  // offers the row, and the v2 list does.
  await page.goto(`studio/shows/${source.id}`)
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  await expect(page.getByTestId('show-timeline-read-only')).toHaveAttribute('data-show-record-version', '2')
  await expect(page.getByTestId('show-editor-v2-route-version')).toHaveText('v2')
  expect((await (await page.request.get('/api/shows')).json()).shows).toEqual([])
  expect((await listV2(page)).map(show => show.id)).toEqual([source.id])

  expect(errors).toEqual([])
})

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
