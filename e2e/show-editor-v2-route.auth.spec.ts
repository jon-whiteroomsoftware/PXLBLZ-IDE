import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from './fixtures/authenticated'

/**
 * The #1039 acceptance flows on the ordinary Show route with a version-2
 * record, behind the one route gate (#1056 slice 6): a fresh Show is authored
 * natively as v2, the delete/re-add boundary behaves, the Show list offers a
 * stored v2 row, the artifacts export and reopen, and the transport, Undo,
 * Redo and reload all act on the same record.
 */
const GATE = 'show-v2-editor=1'

async function listV2(page: Page): Promise<Array<{ id: string; name: string; composition: Record<string, unknown> }>> {
  const response = await page.request.get('/api/shows?show-version=2')
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).shows
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
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+\?/)
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
  await page.goto(`studio/shows?${GATE}&capture`)
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

  // No mixed window: the v2 route registers no agent binding, so no command
  // can reach this record (specification section 10).
  expect(await page.evaluate(() => Boolean((window as { __pxlblzEditor?: unknown }).__pxlblzEditor))).toBe(false)

  expect(errors).toEqual([])
})

test('a v2 Show exports a file the Show list re-imports as its own record', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows?${GATE}`)
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
  // The v1 list stays empty: a v2 record never enters it before #1039.
  const v1 = await page.request.get('/api/shows')
  expect((await v1.json()).shows).toEqual([])

  // The Show list offers both rows, and the imported one opens on this route.
  await expect(page.getByRole('treeitem', { name: /Untitled Show \(2\)/ })).toBeVisible()
  await page.getByRole('treeitem', { name: /Untitled Show \(2\)/ }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${imported.id}\\?`))
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  await expect(page.getByTestId('show-timeline-read-only')).toHaveAttribute('data-show-record-version', '2')

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
