import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'

test.describe('authenticated Show authoring', () => {
  test('opens built-in Show lessons read-only through the production editor (#363)', async ({ page }) => {
    const showWrites: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/shows') && request.method() !== 'GET') showWrites.push(request.method())
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-portable-split')

    await expect(page.getByText('Built-in Show', { exact: true })).toBeVisible()
    await expect(page.getByText('One composition, two normalized halves', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    await expect(page.getByLabel('Show stage')).toContainText('Square')
    await expect(page.getByRole('button', { name: 'Split at playhead' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Clone selection' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Remove scene Establish' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Select KaleidoBloom', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' }).locator('fieldset')).toHaveAttribute('disabled', '')
    expect(showWrites).toEqual([])

    await page.getByRole('radio', { name: 'Shows' }).click()
    await expect(page.getByRole('button', { name: 'Built-in Shows' })).toHaveAttribute('aria-expanded', 'true')
    await page.getByText('Installation Bands', { exact: true }).click()
    await expect(page).toHaveURL(/\/studio\/shows\/stock-show-installation-bands$/)
    await expect(page.getByText('256 assigned · 0 missing · 0 overlapping · 0 out of range · 256 total')).toBeVisible()
    expect(showWrites).toEqual([])

    await page.setViewportSize({ width: 600, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
  })

  test('ships the dense Timeline frame across desktop and narrow workspaces', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const toolbar = page.getByTestId('show-timeline-toolbar')
    await expect(toolbar.getByRole('group', { name: 'Show transport controls' })).toBeVisible()
    await expect(toolbar.getByRole('group', { name: 'Timeline zoom controls' })).toBeVisible()
    await expect(toolbar.getByRole('group', { name: 'Timeline commands' })).toBeVisible()
    const transportToggle = toolbar.locator('button[aria-label="Play Show preview"], button[aria-label="Pause Show preview"]')
    await expect(transportToggle).toHaveCount(1)
    await expect(transportToggle).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Go to Show start' })).toBeVisible()
    await expect(toolbar.getByLabel('Show time')).toHaveText(/^\d{2}:\d{2}\.\d\/\d{2}:\d{2}\.\d$/)
    await expect(toolbar.getByRole('slider', { name: 'Timeline zoom' })).toHaveValue('1')
    await expect(toolbar.getByLabel('Timeline zoom level')).toHaveText('1.0x')

    const commands = toolbar.getByRole('group', { name: 'Timeline commands' })
    await expect(commands.getByRole('button')).toHaveText(['', '', 'Snap', 'Fit', 'Split', 'Clone'])
    await expect(commands.getByRole('button', { name: 'Clone selection' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Select TestPattern1D', exact: true })).toHaveCSS('min-height', '44px')

    await page.getByRole('button', { name: 'Collapse library' }).click()
    await expect(page.getByTestId('left-pane')).toHaveCSS('width', '46px')
    await page.getByRole('radio', { name: 'Patterns' }).click()
    await expect(page.getByRole('button', { name: 'Expand library' })).toBeVisible()
    await page.getByRole('radio', { name: 'Shows' }).click()
    await expect(page.getByTestId('left-pane')).toHaveCSS('width', '46px')
    await page.getByRole('button', { name: 'Expand library' }).click()

    await page.setViewportSize({ width: 760, height: 900 })
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByLabel('Show time')).toBeVisible()
    await expect(toolbar.getByRole('slider', { name: 'Timeline zoom' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)

    await page.setViewportSize({ width: 600, height: 900 })
    await expect(toolbar.getByLabel('Show time')).toHaveCSS('display', 'grid')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
  })

  test('keeps vertical scroll, horizontal trackpad pan, and Shift-wheel pan distinct (#476)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 500 })
    await page.goto('studio/shows/stock-show-installation-finale')
    await page.getByRole('slider', { name: 'Timeline zoom' }).fill('5.1')

    const timeline = page.getByTestId('show-timeline-scroll-region')
    const editor = page.getByTestId('show-editor-scroll')
    await expect.poll(() => timeline.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    await expect.poll(() => editor.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    const beforeHorizontal = await timeline.evaluate((element) => element.scrollLeft)
    const beforeVertical = await editor.evaluate((element) => element.scrollTop)

    await timeline.hover()
    await page.mouse.wheel(0, 480)
    await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeVertical)
    expect(await timeline.evaluate((element) => element.scrollLeft)).toBe(beforeHorizontal)

    await page.mouse.wheel(480, 0)
    await expect.poll(() => timeline.evaluate((element) => element.scrollLeft)).toBeGreaterThan(beforeHorizontal)
    const afterTrackpad = await timeline.evaluate((element) => element.scrollLeft)

    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, 480)
    await page.keyboard.up('Shift')
    await expect.poll(() => timeline.evaluate((element) => element.scrollLeft)).toBeGreaterThan(afterTrackpad)
  })

  test('bridges Global Show to one read-only Scene X-ray and Super Detail layer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const timeline = page.getByRole('region', { name: 'Show timeline' })
    const before = await timeline.boundingBox()
    const xray = page.getByRole('group', { name: 'Scene 1 Scene X-ray, read only' })
    await expect(xray).toHaveCSS('height', '36px')
    await expect(xray.locator('input, select, textarea, [contenteditable="true"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Inspect Scene 1 in Super Detail' }).click()
    const firstDetail = page.getByRole('dialog', { name: 'Scene 1 Super Detail' })
    await expect(firstDetail).toHaveAttribute('aria-modal', 'false')
    await expect(firstDetail).toContainText('Global')
    await expect(firstDetail).toContainText('Local')
    await expect(firstDetail.locator('input, select, textarea, [contenteditable="true"]')).toHaveCount(0)
    await expect(firstDetail.getByRole('button', { name: 'Open Scene' })).toHaveCount(0)
    expect((await timeline.boundingBox())?.height).toBe(before?.height)

    await page.getByRole('slider', { name: 'Timeline zoom' }).fill('5.1')
    await expect(xray).toHaveCSS('height', '36px')
    await page.getByRole('button', { name: 'Show Scene 2 Scene X-ray' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByRole('dialog', { name: 'Scene 2 Super Detail' })).toBeVisible()

    await page.setViewportSize({ width: 600, height: 720 })
    const detailBounds = await page.getByRole('dialog', { name: 'Scene 2 Super Detail' }).boundingBox()
    expect(detailBounds?.x).toBeGreaterThanOrEqual(0)
    expect((detailBounds?.x ?? 0) + (detailBounds?.width ?? 0)).toBeLessThanOrEqual(600)
    expect((detailBounds?.y ?? 0) + (detailBounds?.height ?? 0)).toBeLessThanOrEqual(720)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Scene 2 Super Detail' })).toHaveCount(0)
  })

  test('clones and magnetically moves one owner with session undo, redo, and durable Snap', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)
    const showId = new URL(page.url()).pathname.split('/').at(-1)!

    await page.getByRole('button', { name: 'Select CometLoom', exact: true }).click()
    await page.keyboard.press('Delete')
    await waitForCurrentShow(page, (show) => show.cells.length === 1)

    const source = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    const destination = page.getByRole('button', { name: 'Add clip to main in Scene 2' })
    await source.dragTo(destination)
    await waitForCurrentShow(page, (show) => show.cells[0]?.sceneId === 'scene-2')

    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await waitForCurrentShow(page, (show) => show.cells[0]?.sceneId === 'scene-1')
    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    await waitForCurrentShow(page, (show) => show.cells[0]?.sceneId === 'scene-2')
    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await waitForCurrentShow(page, (show) => show.cells[0]?.sceneId === 'scene-1')

    await page.getByRole('button', { name: 'Select TestPattern1D', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Clone selection' })).toHaveAttribute('title', 'Clone TestPattern1D into Scene 2')
    await page.getByRole('button', { name: 'Clone selection' }).click()
    await waitForCurrentShow(page, (show) => show.cells.length === 2 && show.cells.some((cell) => cell.sceneId === 'scene-2'))

    await page.getByRole('button', { name: 'Open Scene 1 properties' }).click()
    await expect(page.getByRole('button', { name: 'Clone selection' })).toHaveAttribute('title', 'Clone Scene 1 after itself')
    await page.getByRole('button', { name: 'Clone selection' }).click()
    await waitForCurrentShow(page, (show) => show.scenes.length === 3 && new Set(show.scenes.map((scene) => scene.id)).size === 3)

    const snap = page.getByRole('button', { name: 'Snap playhead' })
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'false')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Snap playhead' })).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await persistedShow(page, showId))?.scenes.length).toBe(3)

    await page.setViewportSize({ width: 600, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    expect(consoleErrors).toEqual([])
  })

  test('anchors one Entity Detail Panel without reflow and preserves exact edits', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)
    const showId = new URL(page.url()).pathname.split('/').at(-1)!
    const show = await persistedShow(page, showId)
    const firstClip = show?.cells[0]
    if (!firstClip) throw new Error('Created Show has no first clip.')

    const timeline = page.getByRole('region', { name: 'Show timeline' })
    const before = await timeline.boundingBox()
    const clip = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    await clip.click()

    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(panel).toHaveCount(1)
    await expect(panel).toHaveAttribute('data-owner-key', `clip:${firstClip.id}`)
    await expect(panel.getByRole('region', { name: 'Clip properties' })).toBeVisible()
    await expect(panel.getByTestId('show-entity-detail-stem')).toBeVisible()
    expect((await timeline.boundingBox())?.height).toBe(before?.height)
    const panelBounds = await panel.boundingBox()
    expect(panelBounds?.x).toBeGreaterThanOrEqual(0)
    expect((panelBounds?.x ?? 0) + (panelBounds?.width ?? 0)).toBeLessThanOrEqual(1440)
    expect(panelBounds?.y).toBeGreaterThanOrEqual(0)
    expect((panelBounds?.y ?? 0) + (panelBounds?.height ?? 0)).toBeLessThanOrEqual(900)

    await panel.getByLabel('Brightness').fill('0.63')
    await panel.getByLabel('Brightness').blur()
    await waitForCurrentShow(page, (candidate) => candidate.cells.find((cell) => cell.id === firstClip.id)?.adaptations.brightness === 0.63)

    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(clip).toBeFocused()

    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Select TestPattern1D', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' }).getByRole('spinbutton', { name: 'Brightness' })).toHaveValue('0.63')
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }).click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(1)
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', `transition:${show?.transitions?.[0].id}`)

    await page.setViewportSize({ width: 600, height: 700 })
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    await page.getByText('Show time', { exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
  })

  test('authors, previews, edits, duplicates, removes, and reloads static Effects', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    const stack = panel.getByRole('region', { name: 'Clip Effects' })
    await stack.getByRole('button', { name: 'Add' }).click()
    const palette = page.getByRole('dialog', { name: 'Add Effect' })
    await expect(palette.getByRole('button', { name: /Add .* Effect/ })).toHaveCount(19)

    await palette.getByRole('button', { name: 'Add Ripple Effect' }).hover()
    await expect.poll(async () => (await persistedShow(page, new URL(page.url()).pathname.split('/').at(-1)!))?.cells[0].effects?.length ?? 0).toBe(0)
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
    await expect(panel).toBeVisible()

    await stack.getByRole('button', { name: 'Add' }).click()
    await page.getByRole('searchbox', { name: 'Search Effects' }).fill('ripple')
    await page.getByRole('button', { name: 'Add Ripple Effect' }).click()
    await waitForCurrentShow(page, (show) => show.cells[0].effects?.[0]?.kind === 'ripple')
    await expect(stack.getByRole('button', { name: 'Edit Ripple Effect' })).toBeFocused()

    await stack.getByRole('button', { name: 'Edit Ripple Effect' }).click()
    await stack.getByRole('spinbutton', { name: 'Amount' }).fill('0.2')
    await stack.getByRole('spinbutton', { name: 'Frequency' }).fill('6')
    await waitForCurrentShow(page, (show) => (
      show.cells[0].effects?.[0]?.kind === 'ripple'
      && show.cells[0].effects[0].amount === 0.2
      && show.cells[0].effects[0].frequency === 6
    ))

    await stack.getByRole('button', { name: 'Duplicate Ripple Effect' }).click()
    await waitForCurrentShow(page, (show) => show.cells[0].effects?.map((effect) => effect.id).join(',') === 'ripple,ripple-2')
    await stack.getByRole('button', { name: 'Move Ripple Effect earlier' }).last().click()
    await waitForCurrentShow(page, (show) => show.cells[0].effects?.map((effect) => effect.id).join(',') === 'ripple-2,ripple')
    await page.getByTestId('show-effect-ripple-2').getByRole('button', { name: 'Remove Ripple Effect' }).click()
    await waitForCurrentShow(page, (show) => show.cells[0].effects?.map((effect) => effect.id).join(',') === 'ripple')

    await page.reload()
    await page.getByRole('button', { name: 'Select TestPattern1D', exact: true }).click()
    const reloadedStack = page.getByRole('dialog', { name: 'Entity Detail Panel' }).getByRole('region', { name: 'Clip Effects' })
    await expect(reloadedStack.getByRole('button', { name: 'Edit Ripple Effect' })).toBeVisible()
    await reloadedStack.getByRole('button', { name: 'Edit Ripple Effect' }).click()
    await expect(reloadedStack.getByRole('spinbutton', { name: 'Amount' })).toHaveValue('0.2')
    await expect(reloadedStack.getByRole('spinbutton', { name: 'Frequency' })).toHaveValue('6')

    await page.setViewportSize({ width: 600, height: 700 })
    await reloadedStack.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByRole('dialog', { name: 'Add Effect' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
  })

  test('previews, authors, configures, reloads, and resets registry Transitions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)
    const showId = new URL(page.url()).pathname.split('/').at(-1)!

    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }).click()
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await panel.getByRole('button', { name: /Crossfade · Change/ }).click()
    const palette = page.getByRole('dialog', { name: 'Choose Transition' })
    await expect(palette.getByRole('button', { name: /Use .* Transition/ })).toHaveCount(35)

    await palette.getByRole('button', { name: 'Use Star Transition' }).hover()
    await expect.poll(async () => (await persistedShow(page, showId))?.transitions?.[0]?.kind).toBe('crossfade')
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
    await expect(panel).toBeVisible()

    await panel.getByRole('button', { name: /Crossfade · Change/ }).click()
    await page.getByRole('searchbox', { name: 'Search Transitions' }).fill('star')
    await page.getByRole('button', { name: 'Use Star Transition' }).click()
    await panel.getByRole('spinbutton', { name: 'Duration' }).fill('3400')
    await waitForCurrentShow(page, (show) => show.transitions?.[0]?.durationMs === 3400)
    await panel.getByRole('spinbutton', { name: 'Points' }).fill('7')
    await expect.poll(async () => JSON.stringify((await persistedShow(page, showId))?.transitions?.[0])).toContain('"starPoints":7')
    await panel.getByRole('combobox', { name: 'Edge' }).selectOption('blend')
    await waitForCurrentShow(page, (show) => show.transitions?.[0]?.kind === 'portal'
      && show.transitions[0].shape === 'star'
      && show.transitions[0].durationMs === 3400
      && show.transitions[0].starPoints === 7
      && show.transitions[0].edgePolicy === 'blend')

    await page.reload()
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (portal)' }).click()
    const reloadedPanel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(reloadedPanel.getByRole('button', { name: /Star · Change/ })).toBeVisible()
    await expect(reloadedPanel.getByRole('spinbutton', { name: 'Duration' })).toHaveValue('3400')
    await expect(reloadedPanel.getByRole('spinbutton', { name: 'Points' })).toHaveValue('7')
    await expect(reloadedPanel.getByRole('combobox', { name: 'Edge' })).toHaveValue('blend')

    await page.setViewportSize({ width: 600, height: 700 })
    await reloadedPanel.getByRole('button', { name: /Star · Change/ }).click()
    await expect(page.getByRole('dialog', { name: 'Choose Transition' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    await page.getByRole('button', { name: 'Use Cut Transition' }).click()
    await waitForCurrentShow(page, (show) => show.transitions?.[0]?.kind === 'cut' && show.transitions[0].durationMs === 0)
  })

  test('creates and reloads a Portable output contract at desktop and narrow widths', async ({ page }) => {
    const seriousConsoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') seriousConsoleErrors.push(message.text())
    })
    await page.goto('studio/shows')
    await page.getByRole('button', { name: 'New show' }).click()

    await expect(page.getByText('LED-resolution independent')).toBeVisible()
    await expect(page.getByText('Exact pixel and map identity')).toBeVisible()
    await page.getByRole('button', { name: 'Create Portable Show' }).click()
    await page.getByLabel('Show name').fill('Touring field')
    await page.getByLabel('Reference pixels').fill('1024')
    await page.getByRole('button', { name: 'Create Show' }).click()

    await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)
    await expect(page.getByTitle('Show output contract')).toHaveText('Portable 2D')
    await waitForCurrentShow(page, (show) => (
      show.outputContract?.kind === 'portable-2d'
      && show.outputContract.referencePixelCount === 1024
      && show.outputContract.referenceMapId === 'plane'
    ))

    await page.reload()
    await expect(page.getByTitle('Show output contract')).toHaveText('Portable 2D')
    await expect(page.getByText('Portable · Resolution-independent 2D')).toBeVisible()
    await expect(page.getByText('Compatible 2D mapped surfaces at variable resolution.')).toBeVisible()
    await expect(page.getByLabel('Portable reference map')).toHaveValue('plane')
    await expect(page.getByLabel('Portable reference pixels')).toHaveValue('1024')
    await expect(page.getByLabel('Default routing mode')).toHaveValue('single')
    await expect(page.getByText(/pixel ranges/i)).toHaveCount(0)

    await page.getByLabel('Portable reference map').selectOption('wide')
    await page.getByLabel('Portable reference pixels').fill('1536')
    await page.getByLabel('Portable reference pixels').blur()
    await page.getByRole('button', { name: 'Add zone' }).last().click()
    await page.getByRole('button', { name: 'Add zone' }).last().click()
    await page.getByRole('button', { name: 'Add zone' }).last().click()
    await page.getByLabel('Default routing mode').selectOption('grid-2x2')
    await waitForCurrentShow(page, (show) => (
      show.outputContract?.kind === 'portable-2d'
      && show.outputContract.referencePixelCount === 1536
      && show.outputContract.referenceMapId === 'wide'
      && show.routingLayouts[0]?.logical?.kind === 'grid'
    ))

    await page.reload()
    await expect(page.getByLabel('Portable reference map')).toHaveValue('wide')
    await expect(page.getByLabel('Portable reference pixels')).toHaveValue('1536')
    await expect(page.getByLabel('Default routing mode')).toHaveValue('grid-2x2')
    await expect(page.getByRole('button', { name: 'View code' }).first()).toBeEnabled()
    await expect(page.getByText(/preserves about a 2.0:1 aspect/i)).toBeVisible()

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(8)
    expect(seriousConsoleErrors).toEqual([])
  })

  test('Cancel and workspace Escape leave no Show record', async ({ page }) => {
    await page.goto('studio/shows')
    await page.getByRole('button', { name: 'New show' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('No show selected')).toBeVisible()

    await page.getByRole('button', { name: 'New show' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('No show selected')).toBeVisible()

    const response = await page.context().request.get('/api/shows')
    const { shows } = await response.json() as { shows: PersistedShow[] }
    expect(shows).toEqual([])
  })

  test('classifies legacy Shows once, preserves cancellation, and auto-migrates physical evidence', async ({ page }) => {
    const ambiguous = legacyShowFixture('legacy-ambiguous', 'Legacy field', [])
    const proven = legacyShowFixture('legacy-physical', 'Legacy installation', [{ start: 0, end: 59 }])
    for (const show of [ambiguous, proven]) {
      const response = await page.context().request.post('/api/shows', { data: show })
      expect(response.ok()).toBe(true)
    }

    await page.goto(`studio/shows/${ambiguous.id}`)
    await expect(page.getByRole('heading', { name: 'Classify this legacy Show' })).toBeVisible()
    await expect(page.getByText('Square')).toBeVisible()
    await expect(page.getByText('60 pixels')).toBeVisible()
    await expect(page.getByText('No target Controller')).toBeVisible()
    await page.setViewportSize({ width: 720, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    await expect(page.getByRole('button', { name: 'Use Installation contract' })).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 720 })

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/studio\/shows\/?$/)
    await expect.poll(async () => (await persistedShow(page, ambiguous.id))?.outputContract).toBeUndefined()

    await page.getByRole('listitem').filter({ hasText: ambiguous.name }).click()
    await page.getByRole('button', { name: 'Use Portable contract' }).click()
    await expect(page.getByLabel('Reference map')).toHaveValue('plane')
    await expect(page.getByLabel('Reference pixels')).toHaveValue('60')
    await page.getByRole('button', { name: 'Confirm classification' }).click()
    await expect(page.getByTitle('Show output contract')).toHaveText('Portable 2D')
    await waitForCurrentShow(page, (show) => show.outputContract?.kind === 'portable-2d')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Classify this legacy Show' })).toHaveCount(0)
    await expect(page.getByTitle('Show output contract')).toHaveText('Portable 2D')

    await page.goto(`studio/shows/${proven.id}`)
    await expect(page.getByRole('heading', { name: 'Classify this legacy Show' })).toHaveCount(0)
    await expect(page.getByTitle('Show output contract')).toHaveText('Installation')
    await expect.poll(async () => (await persistedShow(page, proven.id))?.outputContract?.kind).toBe('installation')
  })

  test('returns timeline focus after a discrete edit and supports keyboard preview and seeking', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).first().click()
    await page.getByLabel('Source pattern').selectOption('stock:TestPattern2D')
    const editedClip = page.getByRole('button', { name: 'Select TestPattern2D' }).first()
    await expect(editedClip).toBeFocused()

    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Play Show preview' })).toBeVisible()
    await page.keyboard.press('Home')
    await expect(page.getByRole('slider', { name: 'Show playhead' })).toHaveValue('0')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('slider', { name: 'Show playhead' })).toHaveValue('1000')
    await expect(page.getByRole('button', { name: 'Play Show preview' })).toBeVisible()

    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Pause Show preview' })).toBeVisible()
    const beforeRunningSeek = Number(await page.getByRole('slider', { name: 'Show playhead' }).inputValue())
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Show playhead' }).inputValue())).toBeGreaterThanOrEqual(beforeRunningSeek + 1000)
    await expect(page.getByRole('button', { name: 'Pause Show preview' })).toBeVisible()
    await page.keyboard.press('Home')
    await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Show playhead' }).inputValue())).toBeLessThan(1000)
    await expect(page.getByRole('button', { name: 'Pause Show preview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to Show start' })).toHaveAttribute('title', 'Go to Show start (Home)')
  })

  test('selects discontinuous Installation LED ranges on the saved 2D map at desktop and narrow widths', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)
    await page.getByRole('button', { name: 'Select zone main' }).click()
    await page.getByRole('button', { name: 'Select main LEDs on output map' }).click()

    await expect(page.getByRole('heading', { name: 'Select LEDs for main' })).toBeVisible()
    await expect(page.getByLabel('Show stage')).toBeVisible()
    const surface = page.getByLabel('Select LEDs for zone main')
    const bounds = await surface.boundingBox()
    if (!bounds) throw new Error('Spatial selection surface has no bounds.')
    await page.mouse.move(bounds.x + bounds.width * 0.05, bounds.y + bounds.height * 0.05)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width * 0.46, bounds.y + bounds.height * 0.46)
    await page.mouse.up()

    await expect(page.getByText(/^Indexes (?!none)/)).toBeVisible()
    await expect(page.getByText(/selected.*assigned of 256 total.*missing/i)).toBeVisible()
    await page.setViewportSize({ width: 720, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    await expect(page.getByRole('button', { name: 'Save physical zone' })).toBeVisible()
    await page.getByRole('button', { name: 'Save physical zone' }).click()

    await waitForCurrentShow(page, (show) => (
      show.routingLayouts[0]?.zones[0]?.ranges.length > 1
      && show.routingLayouts[0].zones[0].ranges.every((range) => range.start <= range.end)
    ))
    await expect(page.getByText(/missing/i).first()).toBeVisible()
  })

  test('persists invalid Installation coverage and unblocks artifacts after repair', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const ranges = page.getByLabel('Default main pixel ranges')
    await ranges.fill('0-199')
    await ranges.blur()
    await expect(page.getByText(/Default assigns 200 of 256 pixels \(56 missing\)/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'View code' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()

    await page.reload()
    await expect(page.getByLabel('Default main pixel ranges')).toHaveValue('0-199')
    await page.getByLabel('Default main pixel ranges').fill('0-255')
    await page.getByLabel('Default main pixel ranges').blur()

    await expect(page.getByText(/Default assigns 256 of 256 pixels exactly once/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'View code' }).first()).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    await waitForCurrentShow(page, (show) => (
      show.outputContract?.kind === 'installation'
      && show.outputContract.pixelCount === 256
      && show.routingLayouts[0]?.zones[0]?.ranges[0]?.end === 255
    ))
  })

  test('locks a measured output map to its fixed count and reloads the Installation contract', async ({ page }) => {
    const map = {
      id: 'playwright-fixed-map',
      name: 'Measured four',
      dim: 2,
      generator: 'custom',
      params: {},
      points: [[0, 0], [1, 0], [0, 1], [1, 1]],
      updatedAt: Date.now(),
    }
    const response = await page.context().request.post('/api/maps', { data: map })
    expect(response.ok()).toBe(true)

    await page.goto('studio/shows')
    await page.getByRole('button', { name: 'New show' }).click()
    await page.getByRole('button', { name: 'Create Installation Show' }).click()
    await page.getByLabel('Output map').selectOption(map.id)
    await expect(page.getByLabel('Pixels')).toHaveValue('4')
    await expect(page.getByLabel('Pixels')).toBeDisabled()
    await page.getByRole('button', { name: 'Create Show' }).click()

    await expect(page.getByTitle('Show output contract')).toHaveText('Installation')
    await waitForCurrentShow(page, (show) => (
      show.outputContract?.kind === 'installation'
      && show.outputContract.pixelCount === 4
      && show.outputContract.outputMapId === map.id
    ))
    await page.reload()
    await expect(page.getByText('4 px fixed')).toBeVisible()
    await expect(page.getByLabel('Show stage').getByText('Measured four')).toBeVisible()
  })

  test('repairs an empty clip slot, splits at the playhead, and persists Restart', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).first().click()
    await page.getByRole('button', { name: 'Delete clip TestPattern1D' }).click()
    await page.getByRole('button', { name: 'Add clip to main in Scene 1' }).click()
    await page.getByLabel('Pattern for new clip').selectOption('stock:TestPattern2D')
    await expect(page.getByRole('button', { name: 'Select TestPattern2D' })).toBeVisible()

    await page.getByRole('slider', { name: 'Show playhead' }).fill('10000')
    await page.getByRole('button', { name: 'Split at playhead' }).click()
    await expect(page.getByLabel('Scene 1 part 2 scene name')).toHaveValue('Scene 1 part 2')

    await page.getByRole('button', { name: 'Select TestPattern2D' }).last().click()
    await page.getByText('Advanced clip controls').click()
    await page.getByLabel('Restart Pattern on entry').check()
    await waitForCurrentShow(page, (show) => (
      show.scenes.length === 3
      && show.cells.some((clip) => clip.patternName === 'TestPattern2D' && clip.restartOnEntry === true)
    ))

    await page.reload()

    await expect(page.getByLabel('Scene 1 part 2 scene name')).toHaveValue('Scene 1 part 2')
    await page.getByRole('button', { name: 'Select TestPattern2D' }).last().click()
    await page.getByText('Advanced clip controls').click()
    await expect(page.getByLabel('Restart Pattern on entry')).toBeChecked()
  })

  test('authors a routed wipe and time automation through the generated artifact', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select CometLoom' }).click()
    await page.getByLabel('Source pattern').selectOption('stock:TestPattern1D')
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }).click()
    await page.getByRole('button', { name: /Crossfade · Change/ }).click()
    await page.getByRole('button', { name: 'Use Linear Transition' }).click()
    await page.getByLabel('Easing').selectOption('ease-in-out')
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Animate time for main').check()
    await page.getByLabel('Time scale target main').fill('0.25')

    await waitForCurrentShow(page, (show) => (
      show.transitions?.[0]?.kind === 'wipe'
      && showEasingId(show.transitions[0].easing) === 'ease-in-out'
      && show.transitions[0].propertyTransitions?.timeScale !== undefined
      && show.cells.some((clip) => clip.sceneId === 'scene-2' && clip.adaptations.timeScale === 0.25)
    ))

    await page.getByRole('button', { name: 'View code' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to show' })).toBeVisible()
  })

  test('authors and reloads a named routing layout switch', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Add routing layout' }).click()
    await page.getByLabel('New layout routing layout name').fill('Alternating')
    const ranges = page.getByLabel('Alternating main pixel ranges')
    await ranges.fill('0-29')
    await ranges.blur()
    await page.getByRole('button', { name: 'Set routing layout after Scene 1' }).click()
    await page.getByLabel('Destination routing layout').selectOption({ label: 'Alternating' })
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (routing)' }).click()
    await page.getByLabel('Routing transfer duration seconds').fill('2')
    await page.getByLabel('Routing transfer easing').selectOption('ease-in-out')
    await page.getByLabel('Routing transfer direction').selectOption('reverse')

    await waitForCurrentShow(page, (show) => (
      show.routingLayouts.some((layout) => (
        layout.name === 'Alternating'
        && layout.zones[0]?.ranges[0]?.start === 0
        && layout.zones[0]?.ranges[0]?.end === 29
      ))
      && show.routingSwitches.some((routingSwitch) => routingSwitch.afterSceneId === 'scene-1')
      && show.transitions?.some((transition) => (
        transition.kind === 'routing'
        && transition.durationMs === 2000
        && showEasingId(transition.easing) === 'ease-in-out'
        && transition.routingDirection === 'reverse'
      ))
    ))

    await page.reload()

    await expect(page.getByLabel('Alternating routing layout name')).toHaveValue('Alternating')
    await expect(page.getByLabel('Alternating main pixel ranges')).toHaveValue('0-29')
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (routing)' }).click()
    await expect(page.getByLabel('Destination routing layout')).toHaveValue('layout-2')
    await expect(page.getByLabel('Routing transfer duration seconds')).toHaveValue('2')
    await expect(page.getByLabel('Routing transfer easing')).toHaveValue('ease-in-out')
    await expect(page.getByLabel('Routing transfer direction')).toHaveValue('reverse')
  })

  test('authors and reloads a shared moving-split property', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)
    await page.getByRole('button', { name: 'Add zone' }).last().click()
    await page.getByLabel('Default routing mode').selectOption('split-x')
    await expect(page.getByRole('group', { name: 'Split position lane' })).toBeVisible()

    await page.getByRole('group', { name: 'Scene Scene 1' }).click()
    await page.getByRole('spinbutton', { name: 'Split position', exact: true }).fill('0.25')
    await page.getByRole('group', { name: 'Scene Scene 2' }).click()
    await page.getByRole('spinbutton', { name: 'Split position', exact: true }).fill('0.75')
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }).click()
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Animate split position').check()
    await page.getByLabel('Split position start').fill('0.2')
    await page.getByLabel('Split position duration seconds').fill('1.2')
    await page.getByLabel('Split position easing').selectOption('ease-in-out')

    await waitForCurrentShow(page, (show) => (
      show.routingLayouts[0]?.logical?.kind === 'split'
      && show.scenes[0]?.routingTargets?.splitPosition === 0.25
      && show.scenes[1]?.routingTargets?.splitPosition === 0.75
      && show.transitions?.[0]?.propertyTransitions?.routing?.splitPosition?.from === 0.2
      && show.transitions[0].propertyTransitions.routing.splitPosition.durationMs === 1200
      && showEasingId(show.transitions[0].propertyTransitions.routing.splitPosition.easing) === 'ease-in-out'
    ))

    await page.reload()
    await expect(page.getByLabel('Default routing mode')).toHaveValue('split-x')
    await page.getByRole('group', { name: 'Scene Scene 2' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Split position', exact: true })).toHaveValue('0.75')
    await expect(page.getByText(/moving split: 1 scalar/i)).toBeVisible()

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByRole('group', { name: 'Split position lane' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Split position', exact: true })).toBeVisible()
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(pageOverflow.scrollWidth - pageOverflow.clientWidth).toBeLessThanOrEqual(8)
  })

  test('authors and reloads synchronized sample tiling', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('group', { name: 'Scene Scene 1' }).click()
    await page.getByRole('spinbutton', { name: 'Repeat scale', exact: true }).fill('1.5')
    await expect(page.getByRole('group', { name: 'Sample repeat lane' })).toBeVisible()
    await page.getByRole('group', { name: 'Scene Scene 2' }).click()
    await page.getByRole('spinbutton', { name: 'Repeat scale', exact: true }).fill('3')
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }).click()
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Animate repeat scale').check()
    await page.getByLabel('Repeat scale start').fill('1.25')
    await page.getByLabel('Repeat scale duration seconds').fill('1.2')
    await page.getByLabel('Repeat scale easing').selectOption('ease-in-out')

    await waitForCurrentShow(page, (show) => (
      show.scenes[0]?.sampleTargets?.repeatScale === 1.5
      && show.scenes[1]?.sampleTargets?.repeatScale === 3
      && show.transitions?.[0]?.propertyTransitions?.sample?.repeatScale?.from === 1.25
      && show.transitions[0].propertyTransitions.sample.repeatScale.durationMs === 1200
      && showEasingId(show.transitions[0].propertyTransitions.sample.repeatScale.easing) === 'ease-in-out'
    ))

    await page.reload()
    await expect(page.getByRole('group', { name: 'Sample repeat lane' })).toBeVisible()
    await page.getByRole('group', { name: 'Scene Scene 2' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Repeat scale', exact: true })).toHaveValue('3')
    await expect(page.getByText(/sample repeat: 1 scalar/i)).toBeVisible()

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByRole('group', { name: 'Sample repeat lane' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Repeat scale', exact: true })).toBeVisible()
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(pageOverflow.scrollWidth - pageOverflow.clientWidth).toBeLessThanOrEqual(8)

    await page.getByRole('button', { name: 'View code' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
  })

  test('authors shape-aware diamond and ring spatial transitions', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }).click()
    await page.getByRole('button', { name: /Crossfade · Change/ }).click()
    await page.getByRole('button', { name: 'Use Diamond Transition' }).click()
    await page.getByLabel('Rotation').fill('0.125')
    await page.getByLabel('Spin').fill('1')
    await expect(page.getByLabel('Ring width')).toHaveCount(0)

    await waitForCurrentShow(page, (show) => show.transitions?.some((transition) => (
      transition.kind === 'portal'
      && transition.shape === 'diamond'
      && transition.rotation === 0.125
      && transition.spin === 1
    )) ?? false)

    await page.getByRole('button', { name: /Diamond · Change/ }).click()
    await page.getByRole('button', { name: 'Use Ring Transition' }).click()
    await expect(page.getByLabel('Rotation')).toHaveCount(0)
    await expect(page.getByLabel('Spin')).toHaveCount(0)
    await page.getByLabel('Ring width').fill('0.2')

    await waitForCurrentShow(page, (show) => show.transitions?.some((transition) => (
      transition.kind === 'portal'
      && transition.shape === 'ring'
      && transition.ringWidth === 0.2
      && transition.rotation === undefined
      && transition.spin === undefined
    )) ?? false)

    await page.reload()
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (portal)' }).click()
    await expect(page.getByRole('button', { name: /Ring · Change/ })).toBeVisible()
    await expect(page.getByLabel('Ring width')).toHaveValue('0.2')
    await page.getByRole('button', { name: 'View code' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
  })
})

type PersistedShow = {
  id: string
  outputContract?:
    | { kind: 'portable-2d'; referenceMapId: string | null; referencePixelCount: number }
    | { kind: 'installation'; outputMapId: string | null; pixelCount: number }
  scenes: Array<{
    name: string
    durationMs: number
    routingTargets?: { splitPosition?: number }
    sampleTargets?: { repeatScale?: number }
  }>
  cells: Array<{
    id: string
    sceneId: string
    patternName: string
    restartOnEntry?: boolean
    adaptations: { timeScale: number; brightness: number }
    effects?: Array<{ id: string; kind: string; amount?: number; frequency?: number }>
  }>
  transitions?: Array<{
    id: string
    kind: string
    durationMs: number
    easing: string | { curve: string; direction?: string }
    routingDirection?: string
    shape?: string
    rotation?: number
    spin?: number
    ringWidth?: number
    starPoints?: number
    edgePolicy?: string
    propertyTransitions?: {
      timeScale?: unknown
      routing?: { splitPosition?: { from: number; durationMs: number; easing: string | { curve: string; direction?: string } } }
      sample?: { repeatScale?: { from: number; durationMs: number; easing: string | { curve: string; direction?: string } } }
    }
  }>
  routingLayouts: Array<{
    name: string
    zones: Array<{ ranges: Array<{ start: number; end: number }> }>
    logical?: { kind: string }
  }>
  routingSwitches: Array<{ afterSceneId: string; layoutId: string }>
}

async function createInstallationShow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)
}

async function waitForCurrentShow(page: Page, predicate: (show: PersistedShow) => boolean): Promise<void> {
  const id = new URL(page.url()).pathname.split('/').at(-1)
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/shows')
    if (!response.ok()) return false
    const { shows } = await response.json() as { shows: PersistedShow[] }
    const show = shows.find((candidate) => candidate.id === id)
    return show ? predicate(show) : false
  }).toBe(true)
}

async function persistedShow(page: Page, id: string): Promise<PersistedShow | undefined> {
  const response = await page.context().request.get('/api/shows')
  if (!response.ok()) return undefined
  const { shows } = await response.json() as { shows: PersistedShow[] }
  return shows.find((show) => show.id === id)
}

function showEasingId(easing: string | { curve: string; direction?: string }): string {
  if (typeof easing === 'string') return easing
  if (easing.curve === 'quadratic' && easing.direction === 'in-out') return 'ease-in-out'
  return easing.direction ? `${easing.curve}-${easing.direction}` : easing.curve
}

function legacyShowFixture(id: string, name: string, ranges: Array<{ start: number; end: number }>) {
  const scenes = [
    { id: 'scene-1', name: 'Scene 1', durationMs: 30_000, transitionOut: { kind: 'crossfade', durationMs: 2_000 } },
    { id: 'scene-2', name: 'Scene 2', durationMs: 30_000 },
  ]
  return {
    id,
    name,
    scenes,
    zones: [{ id: 'zone-1', name: 'main', nominalPixelCount: 60, color: '#38bdf8' }],
    cells: scenes.map((scene, index) => ({
      id: `cell-${index + 1}`,
      zoneId: 'zone-1',
      sceneId: scene.id,
      sceneSpan: 1,
      pattern: { kind: 'stock', id: index === 0 ? 'TestPattern1D' : 'CometLoom' },
      patternName: index === 0 ? 'TestPattern1D' : 'CometLoom',
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      restartOnEntry: false,
    })),
    routingLayouts: [{ id: 'layout-1', name: 'Default', zones: [{ zoneId: 'zone-1', ranges }] }],
    routingSwitches: [],
    transitions: [{ id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'crossfade', durationMs: 2_000, easing: 'linear' }],
    stageMapId: 'plane',
    updatedAt: Date.now(),
  }
}
