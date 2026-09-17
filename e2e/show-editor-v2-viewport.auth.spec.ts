import { readFileSync } from 'node:fs'
import { convertibleV1Show } from '../src/test/showV2TracerFixture'
import { expect, test, type Locator, type Page } from './fixtures/authenticated'

/**
 * The v2 timeline's visible window on the real route (#1039): zoom, pan, the
 * snap toggle and the diagnostic lane toggles, and one Clip dragged while
 * zoomed, judged at the record the provider hands back.
 *
 * The stored bytes are the animation fixture's, under this spec's own id, with
 * the "reprise" Clip moved to 12 350 ms - a boundary no drop-grid step lands
 * on, so a drop that reaches it can only have been magnetized there.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/showEditorV2Viewport.json', import.meta.url), 'utf8'),
) as {
  record: { id: string; name: string; composition: { showEndMs: number } }
  patterns: Array<{ id: string; name: string; src: string; controls: Record<string, never>; updatedAt: number }>
}
const SHOW_ID = 'show-editor-v2-viewport'
const SHOW_END_MS = 30_000
/** The off-grid boundary the Magnet toggle is judged against. */
const OFF_GRID_BOUNDARY_MS = 12_350

test('the v2 timeline zooms, pans, snaps and toggles its lanes on the ordinary route', async ({ page }) => {
  // One route session covering zoom, pan, three saved gestures and the lane
  // toggles at two widths; the keyboard zoom alone is tens of presses.
  test.setTimeout(120_000)
  for (const pattern of fixture.patterns) {
    const created = await page.request.post('/api/patterns', { data: pattern })
    expect(created.ok(), await created.text()).toBe(true)
  }
  const legacy = convertibleV1Show()
  legacy.id = SHOW_ID
  legacy.name = fixture.record.name
  const row = await page.request.post('/api/shows', { data: legacy })
  expect(row.ok(), await row.text()).toBe(true)
  const seeded = await page.request.put(`/api/shows/${SHOW_ID}?show-version=2`, { data: fixture.record })
  expect(seeded.ok(), await seeded.text()).toBe(true)

  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => consoleErrors.push(error.message))
  // Count completed saves, not started ones: every readback below asks the
  // provider what it holds, and a started request has not reached it yet.
  let writes = 0
  page.on('response', response => {
    if (response.request().method() === 'PUT'
      && response.url().includes(`/api/shows/${SHOW_ID}?show-version=2`)) writes++
  })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows/${SHOW_ID}?show-v2-editor=1&capture`)

  const surface = page.getByTestId('show-timeline-read-only')
  const status = page.getByTestId('show-timeline-read-only-status')
  const ruler = page.getByTestId('show-timeline-read-only-ruler')
  const soloLane = surface.locator('[data-show-layer-id="solo-layer"]')
  const controls = surface.getByRole('group', { name: 'Timeline view controls' })
  await expect(surface).toHaveAttribute('data-show-timeline-editable', 'true')
  await expect(status).toContainText('Editing this v2 Show')

  // The playhead is a snap candidate (#1039), and a running preview moves it.
  // Hold it at the Show start so every drop below resolves against the grid,
  // the Marker and the Clip edges this test names, not wherever playback was.
  const transport = page.getByTestId('show-editor-v2-transport')
  const pause = transport.getByRole('button', { name: 'Pause Show preview' })
  if (await pause.count() > 0) await pause.click()
  await expect(transport.getByRole('button', { name: 'Play Show preview' })).toBeVisible()
  await transport.getByRole('button', { name: 'Go to Show start' }).click()

  /** The window the ruler publishes. */
  const window = async () => ({
    startMs: Number(await ruler.getAttribute('data-show-visible-start-ms')),
    durationMs: Number(await ruler.getAttribute('data-show-visible-duration-ms')),
  })
  const laneBox = async () => {
    const box = await soloLane.boundingBox()
    expect(box).not.toBeNull()
    return box!
  }
  const settled = async (expectedWrites: number) => {
    await expect.poll(() => writes).toBe(expectedWrites)
    await expect(surface.locator('[data-show-composition-clip]').first())
      .not.toHaveAttribute('aria-disabled', 'true')
  }
  const savedClip = async (clipId: string) => {
    const response = await page.request.get('/api/shows?show-version=2')
    const stored = (await response.json()).shows.find((show: { id: string }) => show.id === SHOW_ID)
    return stored.composition.clips.find((clip: { id: string }) => clip.id === clipId)
  }

  // Fitted: the whole Show, and a Clip drawn at its share of it.
  expect(await window()).toEqual({ startMs: 0, durationMs: SHOW_END_MS })
  const curve = surface.getByRole('button', { name: /^Clip Voice, 0\.00s to 4\.00s/ })
  const fitWidth = (await curve.boundingBox())!.width

  // Zoom: the navigator's end handle is the keyboard zoom, five percent a press.
  const endHandle = controls.getByRole('button', { name: 'Resize visible range end' })
  await endHandle.focus()
  for (let press = 0; press < 40 && (await window()).durationMs > SHOW_END_MS / 4; press++) {
    await page.keyboard.press('ArrowLeft')
  }
  const zoomed = await window()
  expect(zoomed.durationMs).toBeLessThanOrEqual(SHOW_END_MS / 4)
  expect(zoomed.startMs).toBe(0)
  await expect(controls).toContainText('%')
  // The same four-second Clip now fills far more of the same lane.
  expect((await curve.boundingBox())!.width).toBeGreaterThan(fitWidth * 3)

  // Drag it while zoomed: the pointer names a time in the window, and the
  // record that reaches the provider is the authored time, not a pixel.
  const targetMs = 2_000
  const box = await laneBox()
  const grabbed = (await curve.boundingBox())!
  const toX = box.x + (targetMs + 2_000 - zoomed.startMs) / zoomed.durationMs * box.width
  await page.mouse.move(grabbed.x + grabbed.width / 2, grabbed.y + grabbed.height / 2)
  await page.mouse.down()
  await page.mouse.move(toX, grabbed.y + grabbed.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(status).toHaveText('Clip saved.')
  await settled(1)
  expect((await savedClip('curve-clip')).startMs).toBe(targetMs)

  // Pan: the window moves, and content behind it draws past the lane's edge.
  const panThumb = controls.getByRole('slider', { name: 'Pan visible timeline range' })
  await panThumb.focus()
  for (let press = 0; press < 10; press++) await page.keyboard.press('ArrowRight')
  const panned = await window()
  expect(panned.startMs).toBeGreaterThan(0)
  expect(panned.durationMs).toBe(zoomed.durationMs)
  const bed = surface.getByRole('button', { name: /^Clip Voice, 0\.00s to 12\.35s/ })
  expect(await leftPercent(bed)).toBeLessThan(0)

  // Fit returns the whole Show.
  await controls.getByRole('button', { name: 'Fit timeline to Show' }).click()
  expect(await window()).toEqual({ startMs: 0, durationMs: SHOW_END_MS })

  // Snap: with the Magnet on, a drop near 12 350 ms is magnetized exactly onto
  // that Clip boundary, which no drop-grid step lands on.
  await dragCurveTo(page, soloLane, surface, OFF_GRID_BOUNDARY_MS - 60)
  await expect(status).toHaveText('Clip saved.')
  await settled(2)
  expect((await savedClip('curve-clip')).startMs).toBe(OFF_GRID_BOUNDARY_MS)

  // Magnet off: nothing attracts, and the always-on drop grid still lands the
  // drop on a visible tick rather than on raw milliseconds.
  const magnet = controls.getByRole('button', { name: 'Snap to boundaries' })
  await expect(magnet).toHaveAttribute('aria-pressed', 'true')
  await magnet.click()
  await expect(magnet).toHaveAttribute('aria-pressed', 'false')
  await dragCurveTo(page, soloLane, surface, OFF_GRID_BOUNDARY_MS + 3_060)
  await expect(status).toHaveText('Clip saved.')
  await settled(3)
  const unmagnetized = (await savedClip('curve-clip')).startMs
  expect(unmagnetized).not.toBe(OFF_GRID_BOUNDARY_MS + 3_000)
  expect(unmagnetized % 100).toBe(0)
  expect(Math.abs(unmagnetized - (OFF_GRID_BOUNDARY_MS + 3_060))).toBeLessThanOrEqual(1_000)
  await magnet.click()

  // Lanes: each toggle changes only what is drawn, and writes nothing.
  const writesBeforeToggles = writes
  const markerLane = surface.getByRole('group', { name: 'Show Markers' })
  await expect(markerLane.getByRole('button', { name: /^Marker Opening at/ })).toBeVisible()
  await controls.getByRole('button', { name: 'Hide Markers' }).click()
  await expect(markerLane.getByRole('button', { name: /^Marker Opening at/ })).toHaveCount(0)

  await expect(surface.getByRole('group', { name: 'Zone Layouts lane' })).toBeVisible()
  await controls.getByRole('button', { name: 'Hide the Zone Layouts lane' }).click()
  await expect(surface.getByRole('group', { name: 'Zone Layouts lane' })).toHaveCount(0)

  await expect(surface.locator('[data-show-layer-junction]').first()).toBeAttached()
  await controls.getByRole('button', { name: 'Hide Transition junctions' }).click()
  await expect(surface.locator('[data-show-layer-junction]')).toHaveCount(0)

  for (const label of ['Show Markers', 'Show the Zone Layouts lane', 'Show Transition junctions']) {
    await controls.getByRole('button', { name: label }).click()
  }
  await expect(surface.getByRole('group', { name: 'Zone Layouts lane' })).toBeVisible()
  expect(writes).toBe(writesBeforeToggles)

  // Narrow: every view control is reachable, usable and inside the window.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await surface.scrollIntoViewIfNeeded()
  await expect(controls.getByRole('button', { name: 'Snap to boundaries' })).toBeVisible()
  await endHandle.focus()
  await page.keyboard.press('ArrowLeft')
  expect((await window()).durationMs).toBeLessThan(SHOW_END_MS)
  await controls.getByRole('button', { name: 'Fit timeline to Show' }).click()
  expect(await window()).toEqual({ startMs: 0, durationMs: SHOW_END_MS })

  // Nothing the view controls draw leaves the window, and the page itself
  // still does not scroll sideways. Timeline content outside the visible
  // window is meant to sit past the lane edge, where the lane clips it.
  const overflow = await controls.evaluate(root => [...root.querySelectorAll<HTMLElement>('button, [role="slider"]')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > globalThis.innerWidth + 1)
    })
    .map(element => element.getAttribute('aria-label')))
  expect(overflow).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - globalThis.innerWidth))
    .toBeLessThanOrEqual(1)

  expect(consoleErrors).toEqual([])
})

/** Drag the four-second solo Clip so its start lands near `targetMs`. */
async function dragCurveTo(page: Page, lane: Locator, surface: Locator, targetMs: number): Promise<void> {
  const ruler = surface.getByTestId('show-timeline-read-only-ruler')
  const startMs = Number(await ruler.getAttribute('data-show-visible-start-ms'))
  const durationMs = Number(await ruler.getAttribute('data-show-visible-duration-ms'))
  const box = (await lane.boundingBox())!
  // The solo Layer holds exactly this Clip, wherever the last gesture left it.
  const clip = lane.getByRole('button', { name: /^Clip Voice, \d+\.\d\ds to \d+\.\d\ds/ })
  const grabbed = (await clip.boundingBox())!
  const grabOffsetMs = (grabbed.x + grabbed.width / 2 - box.x) / box.width * durationMs + startMs
  const clipStartMs = Number(/([\d.]+)s to/.exec(await clip.getAttribute('aria-label') ?? '')![1]) * 1_000
  const toX = box.x + (targetMs + (grabOffsetMs - clipStartMs) - startMs) / durationMs * box.width
  await page.mouse.move(grabbed.x + grabbed.width / 2, grabbed.y + grabbed.height / 2)
  await page.mouse.down()
  await page.mouse.move(toX, grabbed.y + grabbed.height / 2, { steps: 12 })
  await page.mouse.up()
}

async function leftPercent(locator: Locator): Promise<number> {
  const drawn = locator.locator('xpath=ancestor-or-self::*[@data-show-clip-id][1]')
  return Number.parseFloat(await drawn.evaluate(element => (element as HTMLElement).style.left))
}
