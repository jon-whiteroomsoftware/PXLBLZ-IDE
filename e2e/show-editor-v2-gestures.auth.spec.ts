import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from './fixtures/authenticated'

// Persisted synthetic bytes exercise the stored v2 shape without importing the
// converter, whose schema validator does not resolve under the spec runtime.
const { source, record } = JSON.parse(
  readFileSync(new URL('./fixtures/showEditorV2Gestures.json', import.meta.url), 'utf8'),
)
const SHOW_ID = 'show-editor-v2-gestures'
const SHOW_END_MS = 6_000

/** The first such Clip's authored interval, read back from the drawn label. */
async function clipRange(
  surface: Locator,
  name: string,
  which: 'first' | 'last' = 'first',
): Promise<[number, number]> {
  const matches = surface.getByRole('button', { name: new RegExp(`^Clip ${name},`) })
  const label = await (which === 'first' ? matches.first() : matches.last()).getAttribute('aria-label')
  const match = /([\d.]+)s to ([\d.]+)s/.exec(label ?? '')
  expect(match, label ?? 'missing label').not.toBeNull()
  return [Math.round(Number(match![1]) * 1_000), Math.round(Number(match![2]) * 1_000)]
}

test('the ordinary Show route edits a stored v2 record through timeline gestures', async ({ page }) => {
  const created = await page.request.post('/api/shows', { data: source })
  expect(created.ok(), await created.text()).toBe(true)
  const saved = await page.request.put(`/api/shows/${SHOW_ID}?show-version=2`, { data: record })
  expect(saved.ok(), await saved.text()).toBe(true)

  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => consoleErrors.push(error.message))
  let writes = 0
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes(`/api/shows/${SHOW_ID}?show-version=2`)) writes++
  })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows/${SHOW_ID}?show-v2-editor=1&capture`)

  const surface = page.getByTestId('show-timeline-read-only')
  const status = page.getByTestId('show-timeline-read-only-status')
  const lane = surface.locator('[data-show-layer-id="layer:zone:main"]')
  await expect(surface).toHaveAttribute('data-show-record-version', '2')
  await expect(surface).toHaveAttribute('data-show-timeline-editable', 'true')
  await expect(status).toContainText('Editing this v2 Show')
  expect(await clipRange(surface, 'Outgoing')).toEqual([0, 400])
  expect(await clipRange(surface, 'Incoming')).toEqual([600, 1_000])

  const laneBox = async () => {
    const box = await lane.boundingBox()
    expect(box).not.toBeNull()
    return box!
  }
  const pixelsFor = async (deltaMs: number) => deltaMs / SHOW_END_MS * (await laneBox()).width
  // Consecutive gestures report the same status text, and the store adopts its
  // candidate before the save resolves, so settling waits for the write to
  // start and then for the surface to stop refusing new gestures.
  const settled = async (expectedWrites: number) => {
    await expect.poll(() => writes).toBe(expectedWrites)
    await expect(surface.locator('[data-show-composition-clip]').first())
      .not.toHaveAttribute('aria-disabled', 'true')
  }
  const grab = async (locator: Locator) => {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  }

  // Drag: a Clip joined by a Crossfade translates its whole connected chain.
  const clip = surface.getByRole('button', { name: /^Clip Outgoing,/ })
  const from = await grab(clip)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Alt after the press asks for raw milliseconds instead of the drop grid.
  await page.keyboard.down('Alt')
  await page.mouse.move(from.x + await pixelsFor(2_000), from.y, { steps: 10 })
  await expect(lane.locator('[data-show-drop-preview="move"]')).toHaveAttribute('data-show-drop-collides', 'false')
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await expect(status).toHaveText('Clip saved.')
  const [draggedStartMs, draggedEndMs] = await clipRange(surface, 'Outgoing')
  expect(draggedStartMs).toBeGreaterThanOrEqual(1_950)
  expect(draggedStartMs).toBeLessThanOrEqual(2_050)
  expect(draggedEndMs - draggedStartMs).toBe(400)
  // Rigid: the incoming member keeps its exact offset and the window its length.
  expect(await clipRange(surface, 'Incoming')).toEqual([draggedStartMs + 600, draggedStartMs + 1_000])
  await settled(1)

  // Keyboard move: one grid step, carrying the same chain.
  await clip.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(status).toHaveText('Clip saved.')
  expect(await clipRange(surface, 'Outgoing')).toEqual([draggedStartMs - 1_000, draggedEndMs - 1_000])
  expect(await clipRange(surface, 'Incoming')).toEqual([draggedStartMs - 400, draggedStartMs])
  await settled(2)

  // Trailing resize from the end handle ripples the connected successor later.
  await surface.getByRole('button', { name: /^End edge of Clip Outgoing,/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Clip saved.')
  expect(await clipRange(surface, 'Outgoing')).toEqual([draggedStartMs - 1_000, draggedEndMs])
  expect(await clipRange(surface, 'Incoming')).toEqual([draggedStartMs + 600, draggedStartMs + 1_000])
  await settled(3)

  // Leading resize from the start handle narrows the incoming window alone and
  // leaves the outgoing end exactly where it is.
  const leadingEdge = surface.getByRole('button', { name: /^Start edge of Clip Incoming,/ })
  await leadingEdge.focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(status).toHaveText('Clip saved.')
  expect(await clipRange(surface, 'Incoming')).toEqual([draggedStartMs + 500, draggedStartMs + 1_000])
  expect(await clipRange(surface, 'Outgoing')).toEqual([draggedStartMs - 1_000, draggedEndMs])
  await settled(4)

  // A leading resize past its own outgoing neighbour is refused by the owner,
  // with the record untouched and nothing written.
  await surface.getByRole('button', { name: /^Start edge of Clip Incoming,/ }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(status).toContainText('negative Transition duration')
  expect(await clipRange(surface, 'Incoming')).toEqual([draggedStartMs + 500, draggedStartMs + 1_000])
  expect(writes).toBe(4)

  // Split: the right piece is a fresh Clip and keyboard focus follows it there.
  await clip.focus()
  await page.keyboard.press('s')
  await expect(status).toHaveText('Clip saved.')
  expect(await surface.getByRole('button', { name: /^Clip Outgoing,/ }).count()).toBe(2)
  await expect(surface.getByRole('button', { name: /^Clip Outgoing,/ }).nth(1)).toBeFocused()
  await settled(5)

  // A collided duplicate drop is drawn as such and refused with no write.
  const incoming = surface.getByRole('button', { name: /^Clip Incoming,/ })
  const copyFrom = await grab(surface.getByRole('button', { name: /^Clip Outgoing,/ }).first())
  const onto = await grab(incoming)
  await page.keyboard.down('Alt')
  await page.mouse.move(copyFrom.x, copyFrom.y)
  await page.mouse.down()
  await page.mouse.move(onto.x, onto.y, { steps: 10 })
  await expect(lane.locator('[data-show-drop-preview="duplicate"]')).toHaveAttribute('data-show-drop-collides', 'true')
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await expect(status).toContainText('cannot overlap')
  expect(writes).toBe(5)

  // Duplicate onto free time keeps the source runtime.
  const free = await laneBox()
  await page.keyboard.down('Alt')
  await page.mouse.move(copyFrom.x, copyFrom.y)
  await page.mouse.down()
  await page.mouse.move(free.x + free.width - 4, copyFrom.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await expect(status).toHaveText('Clip sharing saved.')
  await settled(6)

  // Delete removes the Clip and the Transition that named it.
  await incoming.focus()
  await page.keyboard.press('Delete')
  await expect(status).toHaveText('Clip deleted.')
  expect(await surface.getByRole('button', { name: /^Clip Incoming,/ }).count()).toBe(0)
  await settled(7)

  // Undo and Redo restore the exact records through the same history owner.
  const history = surface.getByRole('group', { name: 'Show history' })
  await history.getByRole('button', { name: 'Undo' }).click()
  await expect(status).toHaveText('Undo saved.')
  expect(await surface.getByRole('button', { name: /^Clip Incoming,/ }).count()).toBe(1)
  await history.getByRole('button', { name: 'Redo' }).click()
  await expect(status).toHaveText('Redo saved.')
  expect(await surface.getByRole('button', { name: /^Clip Incoming,/ }).count()).toBe(0)
  await settled(9)

  // The provider holds the edited record: four Clips over the two runtimes.
  const response = await page.request.get('/api/shows?show-version=2')
  const stored = (await response.json()).shows.find((show: { id: string }) => show.id === SHOW_ID)
  expect(stored.composition.clips).toHaveLength(3)
  expect(stored.composition.transitions).toEqual([])
  expect(stored.composition.patternInstances.map((instance: { id: string }) => instance.id))
    .toEqual(record.composition.patternInstances.map((instance: { id: string }) => instance.id))
  expect([...new Set(stored.composition.clips.map((entry: { instanceId: string }) => entry.instanceId))])
    .toEqual(['out-instance'])

  await captureBothFidelities(page)

  // Narrow width: the keyboard equivalents still reach and move a Clip.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  await surface.scrollIntoViewIfNeeded()
  const narrow = surface.getByRole('button', { name: /^Clip Outgoing,/ }).last()
  await narrow.focus()
  await expect(narrow).toBeFocused()
  const [narrowStartMs] = await clipRange(surface, 'Outgoing', 'last')
  await page.keyboard.press('ArrowLeft')
  await expect(status).toHaveText('Clip saved.')
  expect((await clipRange(surface, 'Outgoing', 'last'))[0]).toBe(narrowStartMs - 1_000)
  await settled(10)

  const overflow = await surface.evaluate(root => [...root.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
    })
    .map(element => element.getAttribute('aria-label')))
  expect(overflow).toEqual([])

  expect(consoleErrors).toEqual([])
})

async function captureBothFidelities(page: Page): Promise<void> {
  const stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') {
      await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
      await page.getByRole('option', { name: 'Precise', exact: true }).click()
      await expect(stage).toContainText('Precise')
    }
    const capture = await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({
      frames: 2, fps: 8, startMs: 0, prefix,
    }), `editor-v2-gestures-${mode.toLowerCase()}`)
    expect(capture.failures).toEqual([])
    expect(capture.names).toHaveLength(2)
  }
}
