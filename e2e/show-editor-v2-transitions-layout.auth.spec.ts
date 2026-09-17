import { readFileSync } from 'node:fs'
import { expect, test, type Page } from './fixtures/authenticated'

// Persisted synthetic bytes exercise the stored v2 shape without importing the
// converter, whose schema validator does not resolve under the spec runtime.
const { record, legacy, patterns } = JSON.parse(
  readFileSync(new URL('./fixtures/showEditorV2Authoring.json', import.meta.url), 'utf8'),
)

interface SavedShow {
  composition: {
    showEndMs: number
    clips: { id: string; startMs: number }[]
    transitions: { id: string; kind: string; durationMs: number; participants: unknown[] }[]
    layoutOccurrences: {
      id: string
      layoutId: string
      startMs: number
      durationMs: number
      incomingTransfer?: { id: string; fromOccurrenceId: string; durationMs: number; direction: string }
    }[]
    markers: unknown[]
    propertyTracks: unknown[]
  }
  zoneLayouts: { id: string; name: string }[]
}

test('the ordinary Show route authors Transitions and the Zone Layout lane on a v2 record', async ({ page }) => {
  for (const [resource, value] of [
    ...patterns.map((pattern: object) => ['patterns', pattern]),
    ['shows', legacy],
  ] as [string, object][]) {
    const created = await page.request.post(`/api/${resource}`, { data: value })
    expect(created.ok(), await created.text()).toBe(true)
  }
  const seeded = await page.request.put(`/api/shows/${record.id}?show-version=2`, { data: record })
  expect(seeded.ok(), await seeded.text()).toBe(true)

  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => consoleErrors.push(error.message))
  let writes = 0
  let settled = 0
  const isSave = (url: string) => url.includes(`/api/shows/${record.id}?show-version=2`)
  page.on('request', request => { if (request.method() === 'PUT' && isSave(request.url())) writes++ })
  page.on('response', response => {
    if (response.request().method() === 'PUT' && isSave(response.url()) && response.ok()) settled++
  })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows/${record.id}?show-v2-editor=1&capture`)

  // Undo and Redo are slice 2's timeline controls; the panel renders none.
  const surface = page.getByTestId('show-timeline-read-only')
  const panel = page.getByTestId('show-editor-v2-transitions-layout')
  const status = page.getByTestId('show-editor-v2-authoring-status')
  const stage = page.getByTestId('show-stage-preview')
  await expect(surface).toHaveAttribute('data-show-record-version', '2')
  await expect(panel).toBeVisible()
  await expect(stage).toBeVisible()

  const persisted = async (): Promise<SavedShow> => {
    const response = await page.request.get('/api/shows?show-version=2')
    expect(response.ok()).toBe(true)
    return (await response.json()).shows.find((show: { id: string }) => show.id === record.id)
  }
  const waitSave = async (count: number) => {
    await expect.poll(() => settled).toBe(count)
    expect(writes).toBe(count)
  }
  const clipStart = (saved: SavedShow, id: string) => saved.composition.clips.find(clip => clip.id === id)!.startMs
  const coverage = (saved: SavedShow) => saved.composition.layoutOccurrences
    .map(occurrence => [occurrence.startMs, occurrence.durationMs])

  // Transitions: the derived Cut junction the view model drew.
  const cut = panel.getByRole('button', { name: /^Cut on Layer Atmosphere in Zone Main/ })
  await expect(cut).toBeVisible()
  await cut.click()

  // A Fade over the spanning Main Clip is a bounded compiler refusal, not a save.
  await choosePaletteKind(page, panel, 'Insert Transition', 'Through color')
  await expect(status).toContainText('RL08')
  expect(writes).toBe(0)
  expect((await persisted()).composition.transitions).toEqual([])

  await choosePaletteKind(page, panel, 'Insert Transition', 'Crossfade', 1.5)
  await waitSave(1)
  let saved = await persisted()
  expect(saved.composition.transitions).toHaveLength(1)
  const transitionId = saved.composition.transitions[0].id
  expect(saved.composition.transitions[0]).toMatchObject({ kind: 'crossfade', durationMs: 1500 })
  expect(saved.composition.transitions[0].participants).toHaveLength(1)
  expect(clipStart(saved, 'verse-b')).toBe(4500)
  expect(clipStart(saved, 'verse-a')).toBe(2000)
  expect(clipStart(saved, 'clip')).toBe(0)
  expect(saved.composition.propertyTracks).toEqual(record.composition.propertyTracks)

  // A kind change keeps identity, endpoints, duration and every Clip time.
  await choosePaletteKind(page, panel, 'Change kind', 'Linear')
  await waitSave(2)
  saved = await persisted()
  expect(saved.composition.transitions[0]).toMatchObject({ id: transitionId, kind: 'wipe', durationMs: 1500 })
  expect(clipStart(saved, 'verse-b')).toBe(4500)

  // A resize applies its delta once to the downstream affected set.
  const duration = panel.getByLabel('Transition duration exact time', { exact: true })
  await duration.fill('1')
  await duration.press('Enter')
  await waitSave(3)
  saved = await persisted()
  expect(saved.composition.transitions[0]).toMatchObject({ id: transitionId, durationMs: 1000 })
  expect(clipStart(saved, 'verse-b')).toBe(4000)

  await surface.getByRole('button', { name: 'Undo', exact: true }).click()
  await waitSave(4)
  expect((await persisted()).composition.transitions[0].durationMs).toBe(1500)
  await surface.getByRole('button', { name: 'Redo', exact: true }).click()
  await waitSave(5)
  expect((await persisted()).composition.transitions[0].durationMs).toBe(1000)

  await panel.getByRole('button', { name: 'Reset to Cut', exact: true }).click()
  await waitSave(6)
  saved = await persisted()
  expect(saved.composition.transitions).toEqual([])
  expect(clipStart(saved, 'verse-b')).toBe(3000)
  expect(saved.composition.clips).toEqual(record.composition.clips)

  // Zone Layouts: both occurrences share one definition.
  const occurrence = panel.getByRole('button', { name: /^Full Zone Layout occurrence, 5\.00s/ })
  await occurrence.click()
  await panel.getByLabel('Unique Layout name', { exact: true }).fill('Second voice')
  await panel.getByRole('button', { name: 'Make Layout Unique', exact: true }).click()
  await waitSave(7)
  saved = await persisted()
  const unique = saved.composition.layoutOccurrences[1].layoutId
  expect(unique).not.toBe('layout')
  expect(saved.zoneLayouts.find(layout => layout.id === unique)?.name).toBe('Second voice')

  await panel.getByLabel('Layout definition', { exact: true }).selectOption('alternate-layout')
  await waitSave(8)
  expect((await persisted()).composition.layoutOccurrences[1].layoutId).toBe('alternate-layout')

  const shift = panel.getByLabel('Layout switch exact time', { exact: true })
  await shift.fill('6')
  await shift.press('Enter')
  await waitSave(9)
  expect(coverage(await persisted())).toEqual([[0, 6000], [6000, 24000]])

  await panel.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await waitSave(10)
  saved = await persisted()
  expect(saved.composition.layoutOccurrences).toHaveLength(3)
  expect(saved.composition.showEndMs).toBe(54000)
  await surface.getByRole('button', { name: 'Undo', exact: true }).click()
  await waitSave(11)
  saved = await persisted()
  expect(coverage(saved)).toEqual([[0, 6000], [6000, 24000]])
  expect(saved.composition.showEndMs).toBe(30000)

  const transfer = panel.getByLabel('Layout transfer exact time', { exact: true })
  await transfer.fill('0.4')
  await transfer.press('Enter')
  await waitSave(12)
  saved = await persisted()
  expect(saved.composition.layoutOccurrences[1].incomingTransfer).toMatchObject({
    fromOccurrenceId: saved.composition.layoutOccurrences[0].id, durationMs: 400, direction: 'forward',
  })
  await panel.getByRole('button', { name: 'Clear transfer', exact: true }).click()
  await waitSave(13)
  expect((await persisted()).composition.layoutOccurrences[1].incomingTransfer).toBeUndefined()

  await panel.getByRole('button', { name: 'Remove', exact: true }).click()
  await waitSave(14)
  saved = await persisted()
  expect(coverage(saved)).toEqual([[0, 30000]])
  await expect(panel.getByLabel('Layout definition', { exact: true })).toHaveCount(0)
  await surface.getByRole('button', { name: 'Undo', exact: true }).click()
  await waitSave(15)
  expect(coverage(await persisted())).toEqual([[0, 6000], [6000, 24000]])

  // The Stage preview still captures in both fidelities after the edits.
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
    }), `editor-v2-authoring-${mode.toLowerCase()}`)
    expect(capture.failures).toEqual([])
    expect(capture.names).toHaveLength(2)
  }

  // Reload: the route reopens the saved v2 bytes with the edits in place.
  await page.reload()
  await expect(page.getByTestId('show-editor-v2-transitions-layout')).toBeVisible()
  await expect(page.getByTestId('show-timeline-read-only')
    .getByRole('button', { name: /Alternate Zone Layout, 6\.00s to 30\.00s/ })).toBeVisible()
  expect(coverage(await persisted())).toEqual([[0, 6000], [6000, 24000]])
  expect(writes).toBe(15)

  // Narrow width: every control stays reachable and nothing overflows.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const reloadedPanel = page.getByTestId('show-editor-v2-transitions-layout')
  await reloadedPanel.scrollIntoViewIfNeeded()
  const narrowCut = reloadedPanel.getByRole('button', { name: /^Cut on Layer Atmosphere in Zone Main/ })
  await narrowCut.focus()
  await expect(narrowCut).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(reloadedPanel.getByRole('button', { name: 'Insert Transition', exact: true })).toBeVisible()
  const overflow = await reloadedPanel.evaluate(root => [...root.querySelectorAll<HTMLElement>('button, select, input')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
    })
    .map(element => element.getAttribute('aria-label') ?? element.textContent))
  expect(overflow).toEqual([])

  expect(consoleErrors).toEqual([])
})

/** Open the panel's palette through one control and apply one catalogue kind. */
async function choosePaletteKind(
  page: Page,
  panel: ReturnType<Page['getByTestId']>,
  opener: string,
  label: string,
  durationSeconds?: number,
) {
  await panel.getByRole('button', { name: opener, exact: true }).click()
  const palette = page.getByRole('dialog', { name: 'Choose Layer Transition' })
  await expect(palette).toBeVisible()
  if (durationSeconds !== undefined) {
    const duration = palette.getByLabel('Transition duration in seconds exact time', { exact: true })
    await duration.fill(String(durationSeconds))
    await duration.press('Enter')
  }
  await palette.getByRole('button', { name: `Use ${label} Transition`, exact: true }).click()
  await expect(palette).toHaveCount(0)
}
