import { expect, test } from './fixtures/authenticated'
import type { Locator, Page } from '@playwright/test'

test.describe('authenticated Show authoring', () => {
  test('keeps built-in Show Reset aligned with session-only edits (#363, #619)', async ({ page }) => {
    const showWrites: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/shows') && request.method() !== 'GET') showWrites.push(request.method())
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-101-clips-crossfade')

    await expect(page.getByText('Built-in Show · edits last until reload')).toBeVisible()
    await expect(page.getByRole('region', { name: '101 Clips and Crossfade guide' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()

    // Editable: a real Clip edit creates only a session draft.
    const resetButton = page.getByRole('button', { name: 'Reset built-in Show' })
    await expect(resetButton).toBeDisabled()
    await page.getByRole('button', { name: 'Select SignalMandala' }).click()
    const clipPanel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(clipPanel).toBeVisible()
    const brightness = clipPanel.getByRole('textbox', { name: 'Brightness exact percentage' })
    await brightness.fill('75')
    await brightness.blur()

    // Reset removes the draft, and reload leaves no session-only edit behind.
    await expect(resetButton).toBeEnabled()
    await resetButton.click()
    await expect(resetButton).toBeDisabled()

    // A later session draft is also discarded by reload rather than persisted.
    await page.getByRole('button', { name: 'Select SignalMandala' }).click()
    const editedAgainBrightness = page.getByRole('dialog', { name: 'Entity Detail Panel' })
      .getByRole('textbox', { name: 'Brightness exact percentage' })
    await editedAgainBrightness.fill('50')
    await editedAgainBrightness.blur()
    await expect(resetButton).toBeEnabled()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Reset built-in Show' })).toBeDisabled()
    await page.getByRole('button', { name: 'Select SignalMandala' }).click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })
      .getByRole('textbox', { name: 'Brightness exact percentage' })).toHaveValue('100')
    expect(showWrites).toEqual([])

    await page.setViewportSize({ width: 600, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
  })

  test('previews the fitted timeline continuously while dragging Show End (#592)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-101-clips-crossfade')

    const showEnd = page.getByRole('button', { name: /Show End at/ })
    const timelineGrid = page.getByTestId('show-timeline-grid')
    await expect(showEnd).toBeVisible()
    const showEndBounds = await showEnd.boundingBox()
    expect(showEndBounds).not.toBeNull()
    const initialLabel = await showEnd.getAttribute('aria-label')
    const initialColumns = await timelineGrid.evaluate((element) => (
      (element as HTMLElement).style.gridTemplateColumns
    ))

    await page.mouse.move(
      showEndBounds!.x + showEndBounds!.width / 2,
      showEndBounds!.y + showEndBounds!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      showEndBounds!.x + showEndBounds!.width / 2 + 80,
      showEndBounds!.y + showEndBounds!.height / 2,
      { steps: 4 },
    )

    await expect(showEnd).toHaveAttribute('data-show-end-dragging', 'true')
    await expect(showEnd).not.toHaveAttribute('aria-label', initialLabel!)
    await expect.poll(async () => timelineGrid.evaluate((element) => (
      (element as HTMLElement).style.gridTemplateColumns
    ))).not.toBe(initialColumns)

    const previewLabel = await showEnd.getAttribute('aria-label')
    await page.mouse.up()
    await expect(showEnd).not.toHaveAttribute('data-show-end-dragging', 'true')
    await expect(showEnd).toHaveAttribute('aria-label', previewLabel!)
  })

  test('signals when Delete targets the final remaining Clip (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select CometLoom', exact: true }).click()
    await page.getByRole('button', { name: 'Delete clip CometLoom' }).click()
    await expect(page.getByRole('button', { name: 'Select CometLoom', exact: true })).toHaveCount(0)

    const finalClip = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    await finalClip.click()
    await finalClip.press('Delete')

    await expect(page.getByTestId('show-clip-delete-blocked')).toBeVisible()
    await expect(page.getByText('Keep one Clip')).toBeVisible()
    await expect(page.getByRole('status', { name: 'Clip deletion unavailable' })).toHaveText(
      'A Show must contain at least one Clip.',
    )
    await expect(finalClip).toBeVisible()
  })

  test('hides the Show End diamond when timeline zoom moves its boundary offscreen (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-101-clips-crossfade')

    const showEnd = page.getByRole('button', { name: /Show End at/ })
    const scrollRegion = page.getByTestId('show-timeline-scroll-region')
    await expect(showEnd).toBeVisible()

    await page.getByRole('button', { name: 'Resize visible range end' }).press('ArrowLeft')
    await expect.poll(async () => {
      const anchor = await page.getByTestId('show-timeline-end-anchor').boundingBox()
      const viewport = await scrollRegion.boundingBox()
      return Boolean(anchor && viewport && anchor.x > viewport.x + viewport.width)
    }).toBe(true)
    await expect(showEnd).toBeHidden()
  })

  test('renders compact truthful property sparklines at desktop and narrow widths (#483)', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-installation-finale')

    const speedLane = page.getByRole('group', { name: 'Animation speed lane for Portal' })
    const brightnessLane = page.getByRole('group', { name: 'Brightness lane for Portal' })
    await expect(speedLane).toBeVisible()
    await expect(brightnessLane).toBeVisible()
    expect((await speedLane.boundingBox())?.height).toBe(18)
    expect((await brightnessLane.boundingBox())?.height).toBe(18)
    await expect(speedLane.locator('polyline')).toHaveCount(1)
    await expect(brightnessLane.locator('polyline')).toHaveCount(1)

    const exactBeat = speedLane.getByRole('button', { name: /Boundary starts at \d+ ms, value 0\.35/ }).first()
    await expect(exactBeat).toBeVisible()
    await exactBeat.focus()
    await expect(exactBeat).toBeFocused()
    await exactBeat.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toContainText('Transition')

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(speedLane).toBeVisible()
    await expect(brightnessLane).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    expect(consoleErrors).toEqual([])
  })

  test('keeps the compact sparkline gutter and time-zero playhead crisp (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-reference-property-animation')

    const speedLane = page.getByRole('group', { name: 'CompassRose animation speed animation for A' })
    const speedLaneLabel = page.getByTestId('show-property-lane-label').filter({ hasText: 'CompassRose animation speed' })
    await expect(speedLane).toBeVisible()
    await expect(speedLaneLabel).toHaveAttribute('data-compact', 'true')
    await expect(speedLaneLabel.getByTestId('show-property-lane-compact-mark')).toBeVisible()
    await expect(speedLaneLabel).toHaveAttribute('title', 'CompassRose animation speed')

    const laneBounds = await speedLane.boundingBox()
    const playheadBounds = await page.getByTestId('show-timeline-playhead').boundingBox()
    expect(laneBounds).not.toBeNull()
    expect(playheadBounds).not.toBeNull()
    expect(playheadBounds!.x).toBeGreaterThanOrEqual(laneBounds!.x)
  })

  test('does not force a property label into a zero-width gutter (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-202-layers-local-animation')

    const localAnimation = page.getByRole('group', { name: 'SignalMandala opacity animation for Main' })
    await expect(localAnimation).toBeVisible()
    await expect(page.getByTestId('show-property-lane-label')).toHaveCount(0)

    const laneBounds = await localAnimation.boundingBox()
    const playheadBounds = await page.getByTestId('show-timeline-playhead').boundingBox()
    expect(laneBounds).not.toBeNull()
    expect(playheadBounds).not.toBeNull()
    expect(playheadBounds!.x).toBeGreaterThanOrEqual(laneBounds!.x)
  })

  test('keeps collapsed Zone summaries aligned, legible, and independently restorable (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-105-built-from-basics')

    await expect(page.locator('[data-show-layout-interval]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Open Zones' }).click()
    const zoneMap = page.getByRole('dialog', { name: 'Zone Map' })
    await zoneMap.getByRole('button', { name: 'Collapse zone Sky' }).click()
    await page.getByRole('button', { name: 'Close Zones' }).click()

    await expect(page.getByRole('button', { name: 'Expand zone Sky' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Collapse zone Signal' })).toBeVisible()

    const collapsed = page.getByRole('img', { name: 'Collapsed zone Sky timeline' })
    const label = collapsed.getByTestId('collapsed-zone-layout-label').first()
    await expect(label).toBeVisible()
    await expect(label).toHaveClass(/text-zinc-100/)

    const geometry = await collapsed.evaluate((element) => {
      const labelElement = element.querySelector<HTMLElement>('[data-testid="collapsed-zone-layout-label"]')
      const railElement = element.querySelector<HTMLElement>('[data-testid="collapsed-zone-density-rail"]')
      if (!labelElement || !railElement) return null
      const row = element.getBoundingClientRect()
      const labelBounds = labelElement.getBoundingClientRect()
      const railBounds = railElement.getBoundingClientRect()
      return {
        rowTop: row.top,
        rowBottom: row.bottom,
        labelTop: labelBounds.top,
        labelBottom: labelBounds.bottom,
        labelBackground: getComputedStyle(labelElement).backgroundColor,
        railBottom: railBounds.bottom,
        railHeight: railBounds.height,
      }
    })
    expect(geometry).not.toBeNull()
    expect(geometry!.labelTop).toBeGreaterThan(geometry!.rowTop)
    expect(geometry!.labelBottom).toBeLessThan(geometry!.rowBottom)
    expect(geometry!.labelBackground).not.toBe('rgba(0, 0, 0, 0)')
    expect(geometry!.railHeight).toBeLessThanOrEqual(8)
    expect(geometry!.railBottom).toBeLessThan(geometry!.rowBottom)

    await page.getByRole('button', { name: 'Expand zone Sky' }).click()
    await expect(collapsed).toHaveCount(0)
  })

  test('keeps Zone Layout names on the ruler and Zone names in collapsed summaries (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-203-dynamic-zone-layouts')

    await page.getByRole('button', { name: 'Open Zones' }).click()
    const zoneMap = page.getByRole('dialog', { name: 'Zone Map' })
    await zoneMap.getByRole('button', { name: 'Collapse zone A' }).click()
    await zoneMap.getByRole('button', { name: 'Collapse zone B' }).click()
    await page.getByRole('button', { name: 'Close Zones' }).click()

    await expect(page.locator('[data-show-layout-interval]')).toHaveText(['Vertical', 'Horizontal'])
    await expect(page.getByTestId('collapsed-zone-layout-label')).toHaveText(['A', 'A', 'B', 'B'])

    const boundary = page.locator('[data-show-layout-boundary]')
    await expect(boundary).toHaveCount(1)
    const boundaryBounds = await boundary.boundingBox()
    const rulerBounds = await page.getByTestId('show-timeline-ruler').boundingBox()
    const collapsedBounds = await page.getByRole('img', { name: 'Collapsed zone B timeline' }).boundingBox()
    expect(boundaryBounds).not.toBeNull()
    expect(rulerBounds).not.toBeNull()
    expect(collapsedBounds).not.toBeNull()
    expect(boundaryBounds!.y).toBeLessThanOrEqual(rulerBounds!.y + 1)
    expect(boundaryBounds!.y + boundaryBounds!.height).toBeGreaterThanOrEqual(
      collapsedBounds!.y + collapsedBounds!.height,
    )
  })

  test('projects one Scene-local animation and summarizes its Clip (#363, #599)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-202-layers-local-animation')

    const localAnimation = page.getByRole('group', { name: 'SignalMandala opacity animation for Main' })
    await expect(localAnimation).toBeVisible()
    await expect(localAnimation.locator('polyline')).toHaveCount(1)
    await expect(localAnimation.locator('[data-property-beat-dot]')).toHaveCount(4)
    await expect(localAnimation.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('group', { name: /animation for Main$/ })).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Animation speed lane for Main' })).toHaveCount(0)

    const clip = page.getByRole('button', { name: 'Select Caustics' })
    await expect(clip.getByTitle('Animation speed 0.28× · Speed 0.24 · Sharpness 0.28')).toBeVisible()
    await expectClipSummaryFits(clip)
    await clip.hover()
    await expect(page.getByRole('tooltip', { name: 'Caustics Clip overrides' })).toHaveCount(0)
    await clip.click()
    const summary = page.getByRole('region', { name: 'Clip summary' })
    await expect(summary.getByRole('group', { name: 'Playback summary' })).toContainText('Animation speed0.28×')
    await expect(summary.getByRole('group', { name: 'Pattern controls summary' })).toContainText('Speed0.24·Sharpness0.28')
    const clipProperties = page.getByRole('region', { name: 'Clip properties' })
    const clipHeader = clipProperties.locator('header')
    await expect(clipHeader.getByRole('heading', { name: 'Caustics' })).toBeVisible()
    await expect(clipHeader.getByRole('region', { name: 'Clip summary' })).toBeVisible()
    await expect(clipProperties.getByRole('table', { name: 'Pattern controls' })).toContainText('sliderSpeed · 0–1')

    await clip.evaluate((element) => {
      element.style.width = '110px'
      element.style.justifySelf = 'start'
    })
    await expect(clip.locator('.show-clip-summary-copy').first()).toBeHidden()
    await expect(clip.locator('.show-clip-summary-section svg')).toHaveCount(2)

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(summary).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
  })

  test('ships the dense Timeline frame across desktop and narrow workspaces', async ({ page }) => {
    await page.setViewportSize({ width: 2200, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const toolbar = page.getByTestId('show-timeline-toolbar')
    await expect(toolbar.getByRole('group', { name: 'Show transport controls' })).toBeVisible()
    await expect(toolbar.getByRole('group', { name: 'Timeline view controls' })).toBeVisible()
    await expect(toolbar.getByRole('group', { name: 'Timeline commands' })).toBeVisible()
    const transportToggle = toolbar.locator('button[aria-label="Play Show preview"], button[aria-label="Pause Show preview"]')
    await expect(transportToggle).toHaveCount(1)
    await expect(transportToggle).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Go to Show start' })).toBeVisible()
    await expect(toolbar.getByLabel('Show time')).toHaveText(/^\d{2}:\d{2}\.\d\/\d{2}:\d{2}\.\d$/)
    await expect(toolbar.getByRole('slider', { name: 'Pan visible timeline range' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Fit timeline to Show' })).toBeVisible()

    const commands = toolbar.getByRole('group', { name: 'Timeline commands' })
    await expect(toolbar.getByRole('button', { name: 'Undo Show edit' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Redo Show edit' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Snap playhead' })).toBeVisible()
    await expect(commands.getByRole('button', { name: 'Split at playhead' })).toBeVisible()
    await expect(commands.getByRole('button', { name: 'Clone selection' })).toBeDisabled()
    const groupCommand = commands.getByRole('button', { name: 'Make Group from selection' })
    const markerCommand = toolbar.getByRole('button', { name: 'Hide Markers' })
    await expect(groupCommand).toBeVisible()
    await expect(markerCommand).toBeVisible()
    await expect(groupCommand.locator('.timeline-command-label')).toHaveCSS('display', 'block')
    const [toolbarBounds, viewBounds, groupBounds, markerBounds, undoBounds, snapBounds] = await Promise.all([
      toolbar.boundingBox(),
      toolbar.getByRole('group', { name: 'Timeline view controls' }).boundingBox(),
      groupCommand.boundingBox(),
      markerCommand.boundingBox(),
      toolbar.getByRole('button', { name: 'Undo Show edit' }).boundingBox(),
      toolbar.getByRole('button', { name: 'Snap playhead' }).boundingBox(),
    ])
    expect(Math.abs(
      (viewBounds!.x + viewBounds!.width / 2)
      - (toolbarBounds!.x + toolbarBounds!.width / 2),
    )).toBeLessThanOrEqual(3)
    expect(groupBounds!.x).toBeGreaterThanOrEqual(toolbarBounds!.x)
    expect(markerBounds!.x + markerBounds!.width)
      .toBeLessThanOrEqual(toolbarBounds!.x + toolbarBounds!.width + 1)
    expect(toolbarBounds!.x + toolbarBounds!.width - (markerBounds!.x + markerBounds!.width))
      .toBeLessThanOrEqual(8)
    expect(undoBounds!.width).toBeLessThanOrEqual(22)
    expect(snapBounds!.width).toBeLessThanOrEqual(22)
    expect(markerBounds!.width).toBeLessThanOrEqual(22)
    await expect(page.getByRole('button', { name: 'Select TestPattern1D', exact: true })).toHaveCSS('min-height', '44px')

    const addLabel = toolbar.getByRole('button', { name: 'Add to Show' }).locator('.timeline-command-label-primary')
    const splitLabel = commands.getByRole('button', { name: 'Split at playhead' }).locator('.timeline-command-label-secondary')
    const cloneLabel = commands.getByRole('button', { name: 'Clone selection' }).locator('.timeline-command-label-secondary')
    const groupLabel = groupCommand.locator('.timeline-command-label-tertiary')
    await page.setViewportSize({ width: 1500, height: 900 })
    await expect(addLabel).toHaveCSS('display', 'block')
    await expect(splitLabel).toHaveCSS('display', 'none')
    await expect(cloneLabel).toHaveCSS('display', 'none')
    await expect(groupLabel).toHaveCSS('display', 'none')
    await page.setViewportSize({ width: 1600, height: 900 })
    await expect(addLabel).toHaveCSS('display', 'block')
    await expect(splitLabel).toHaveCSS('display', 'block')
    await expect(cloneLabel).toHaveCSS('display', 'block')
    await expect(groupLabel).toHaveCSS('display', 'none')

    await page.getByRole('button', { name: 'Collapse rail' }).click()
    await expect(page.getByTestId('left-pane')).toHaveCSS('width', '46px')
    await page.getByRole('radio', { name: 'Patterns' }).click()
    await expect(page.getByRole('button', { name: 'Expand library' })).toBeVisible()
    await page.getByRole('radio', { name: 'Shows' }).click()
    await expect(page.getByTestId('left-pane')).toHaveCSS('width', '46px')
    await page.getByRole('button', { name: 'Expand library' }).click()

    await page.setViewportSize({ width: 760, height: 900 })
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByLabel('Show time')).toBeVisible()
    await expect(toolbar.getByLabel('Show time')).toHaveCSS('display', 'flex')
    await expect(toolbar.getByRole('slider', { name: 'Pan visible timeline range' })).toBeVisible()
    const compactView = await toolbar.getByRole('group', { name: 'Timeline view controls' }).boundingBox()
    expect(compactView!.width).toBeLessThanOrEqual(116)
    expect((await toolbar.getByRole('button', { name: 'Split at playhead' }).boundingBox())!.width)
      .toBeLessThanOrEqual(29)
    expect((await toolbar.getByRole('button', { name: 'Make Group from selection' }).boundingBox())!.width)
      .toBeLessThanOrEqual(29)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)

    await page.setViewportSize({ width: 600, height: 900 })
    await expect(toolbar.getByLabel('Show time')).toHaveCSS('display', 'grid')
    const showPropertiesButton = page.getByRole('button', { name: 'Show properties' })
    await expect(showPropertiesButton).toBeVisible()
    await expect(showPropertiesButton.locator('.show-header-action-label')).toHaveCSS('display', 'none')
    const narrowTransport = await toolbar.getByRole('group', { name: 'Show transport controls' }).boundingBox()
    const narrowView = await toolbar.getByRole('group', { name: 'Timeline view controls' }).boundingBox()
    const narrowCommands = await toolbar.getByRole('group', { name: 'Timeline commands' }).boundingBox()
    expect(narrowView!.width).toBeLessThanOrEqual(104)
    expect(rectanglesOverlap(narrowTransport, narrowView)).toBe(false)
    expect(rectanglesOverlap(narrowView, narrowCommands)).toBe(false)
    expect(rectanglesOverlap(narrowTransport, narrowCommands)).toBe(false)
    const outputSummary = await page.getByTitle('Show output summary').boundingBox()
    const showProperties = await showPropertiesButton.boundingBox()
    expect(
      rectanglesOverlap(outputSummary, showProperties),
      `Show output summary ${JSON.stringify(outputSummary)} overlaps Properties ${JSON.stringify(showProperties)}`,
    ).toBe(false)
    const compileBar = page.getByTestId('show-compile-bar')
    await expect(compileBar).toHaveCSS('font-size', '10px')
    await compileBar.evaluate((element) => { element.scrollLeft = element.scrollWidth })
    const compileBarBox = await compileBar.boundingBox()
    const finalCompileStatusBox = await compileBar.getByText(/worst instant:/i).boundingBox()
    expect(finalCompileStatusBox && compileBarBox && finalCompileStatusBox.x + finalCompileStatusBox.width <= compileBarBox.x + compileBarBox.width + 1).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
  })

  test('authors Show-level Trails and persists its clear-at-target contract (#537)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Show properties' }).click()
    const enabled = page.getByRole('checkbox', { name: 'Enable Trails' })
    await expect(enabled).not.toBeChecked()
    await expect(page.getByText(/scrubbing clears trail history at the destination/i)).toBeVisible()

    await enabled.check()
    const retention = page.getByRole('slider', { name: 'Trails retention' })
    await expect(retention).toHaveValue('0.9375')
    await retention.fill('0.75')
    await expect(page.getByText('75.0%', { exact: true })).toBeVisible()
    await waitForCurrentShow(page, (show) => show.outputEffects?.[0]?.kind === 'trails'
      && show.outputEffects[0].retention === 0.75)
    await expect(page.getByTestId('show-compile-bar')).toContainText('3 planes · previous-rgb')

    await page.setViewportSize({ width: 600, height: 800 })
    await expect(retention).toBeVisible()
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

  test('hides the playhead when Show time wraps outside the panned viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 })
    await page.goto('studio/shows/stock-show-showcase-redline-installation')

    const playhead = page.getByTestId('show-timeline-playhead-hit-target')
    await expect(playhead).toBeVisible()

    await page.getByRole('slider', { name: 'Timeline zoom' }).fill('6')
    await page.getByRole('slider', { name: 'Pan visible timeline range' }).press('ArrowRight')

    await expect(page.getByRole('slider', { name: 'Show playhead' })).toHaveValue('0')
    await expect(playhead).toBeHidden()
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
    await expect(firstDetail.getByRole('button', { name: 'Open Scene 1 editor' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit Scene 1' })).toBeVisible()
    expect((await timeline.boundingBox())?.height).toBe(before?.height)

    await page.getByRole('slider', { name: 'Timeline zoom' }).fill('5.1')
    await expect(xray).toHaveCSS('height', '36px')
    await expect(firstDetail).toHaveCount(0)
    await page.getByRole('button', { name: 'Show Scene 2 Scene X-ray' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Inspect Scene 2 in Super Detail' }).click()
    await expect(page.getByRole('dialog', { name: 'Scene 2 Super Detail' })).toBeVisible()

    await page.setViewportSize({ width: 600, height: 720 })
    await expect(page.getByRole('dialog', { name: 'Scene 2 Super Detail' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Inspect Scene 2 in Super Detail' }).click()
    await expect(page.getByRole('dialog', { name: 'Scene 2 Super Detail' })).toBeVisible()
    const detailBounds = await page.getByRole('dialog', { name: 'Scene 2 Super Detail' }).boundingBox()
    expect(detailBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
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
    const clipOwnerKey = await clip.getAttribute('data-show-selection-key')
    if (!clipOwnerKey) throw new Error('Selected Clip does not expose its timeline owner key.')
    const placementId = clipOwnerKey.slice('clip:'.length)
    await clip.click()

    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(panel).toHaveCount(1)
    await expect(panel).toHaveAttribute('data-owner-key', clipOwnerKey)
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
    await waitForCurrentShow(page, (candidate) => candidate.composition?.scenes.some((scene) => (
      scene.zones?.some((zone) => zone.main?.some((placement) => (
        placement.id === placementId && placement.view?.brightness === 0.63
      )))
    )) === true)

    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(clip).toBeFocused()

    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Select TestPattern1D', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' }).getByRole('spinbutton', { name: 'Brightness' })).toHaveValue('0.63')
    const comparisonClip = page.getByRole('button', { name: 'Select CometLoom', exact: true })
    const comparisonOwnerKey = await comparisonClip.getAttribute('data-show-selection-key')
    if (!comparisonOwnerKey) throw new Error('Comparison Clip does not expose its timeline owner key.')
    await comparisonClip.click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(1)
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', comparisonOwnerKey)

    await page.setViewportSize({ width: 600, height: 700 })
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    await page.getByRole('status', { name: 'Show time' }).click()
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
    await expect(palette.getByRole('button', { name: /Add .* Effect/ })).toHaveCount(22)

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
    await stack.getByRole('spinbutton', { name: 'Frequency' }).blur()
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
    await page.getByRole('searchbox', { name: 'Search Effects' }).fill('vignette')
    await page.getByRole('button', { name: 'Add Vignette Effect' }).click()
    await waitForCurrentShow(page, (show) => show.cells[0].effects?.some((effect) => effect.kind === 'vignette') === true)
    await reloadedStack.getByRole('button', { name: 'Edit Vignette Effect' }).click()
    await reloadedStack.getByRole('spinbutton', { name: 'Radius' }).fill('0.48')
    await reloadedStack.getByRole('spinbutton', { name: 'Radius' }).blur()
    await waitForCurrentShow(page, (show) => show.cells[0].effects?.some((effect) => (
      effect.kind === 'vignette' && effect.radius === 0.48
    )) === true)

    await page.reload()
    await page.getByRole('button', { name: 'Select TestPattern1D', exact: true }).click()
    const vignetteStack = page.getByRole('dialog', { name: 'Entity Detail Panel' }).getByRole('region', { name: 'Clip Effects' })
    await vignetteStack.getByRole('button', { name: 'Edit Vignette Effect' }).click()
    await expect(vignetteStack.getByRole('spinbutton', { name: 'Radius' })).toHaveValue('0.48')
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
    await expect(page.getByTitle('Show output summary')).toContainText('Portable 2D')
    await waitForCurrentShow(page, (show) => (
      show.outputContract?.kind === 'portable-2d'
      && show.outputContract.referencePixelCount === 1024
      && show.outputContract.referenceMapId === 'plane'
    ))

    await page.reload()
    await expect(page.getByTitle('Show output summary')).toContainText('Portable 2D')
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

  test('creates a second Show without route and active-Show synchronization looping', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)
    const firstShowId = new URL(page.url()).pathname.split('/').at(-1)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()

    await createInstallationShow(page)
    await expect.poll(() => new URL(page.url()).pathname.split('/').at(-1)).not.toBe(firstShowId)
    const secondShowId = new URL(page.url()).pathname.split('/').at(-1)

    expect(secondShowId).not.toBe(firstShowId)
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
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
    await expect(page.getByTitle('Show output summary')).toContainText('Portable 2D')
    await waitForCurrentShow(page, (show) => show.outputContract?.kind === 'portable-2d')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Classify this legacy Show' })).toHaveCount(0)
    await expect(page.getByTitle('Show output summary')).toContainText('Portable 2D')

    await page.goto(`studio/shows/${proven.id}`)
    await expect(page.getByRole('heading', { name: 'Classify this legacy Show' })).toHaveCount(0)
    await expect(page.getByTitle('Show output summary')).toContainText('Installation')
    await expect.poll(async () => (await persistedShow(page, proven.id))?.outputContract?.kind).toBe('installation')
  })

  test('returns timeline focus after a discrete edit and supports keyboard preview, start, and five-second seek', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).first().click()
    await page.getByLabel('Source pattern').fill('TestPattern2D')
    await page.getByRole('option', { name: 'TestPattern2D' }).click()
    const editedClip = page.getByRole('button', { name: 'Select TestPattern2D' }).first()
    await expect(editedClip).toBeFocused()

    const timelineToolbar = page.getByTestId('show-timeline-toolbar')
    const play = timelineToolbar.getByRole('button', { name: 'Play Show preview' })
    const pause = timelineToolbar.getByRole('button', { name: 'Pause Show preview' })
    if (await pause.count() === 1) await pause.click()
    await expect(play).toBeVisible()
    await editedClip.click()
    await editedClip.press('Space')
    await expect(pause).toBeVisible()
    await editedClip.press('Space')
    await expect(play).toBeVisible()
    await page.keyboard.press('a')
    await expect(page.getByRole('slider', { name: 'Show playhead' })).toHaveValue('0')
    const navigator = page.getByRole('slider', { name: 'Pan visible timeline range' })
    await timelineToolbar.getByRole('button', { name: 'Resize visible range end' }).press('ArrowLeft')
    const selectedShow = page.locator('[role="treeitem"][aria-selected="true"]')
    await expect(selectedShow).toHaveCount(1)
    await selectedShow.focus()
    await expect(selectedShow).toBeFocused()
    const beforeViewportStart = await navigator.getAttribute('aria-valuenow')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('slider', { name: 'Show playhead' })).toHaveValue('5000')
    await expect(navigator).toHaveAttribute('aria-valuenow', beforeViewportStart ?? '0')
    await expect(play).toBeVisible()

    await page.keyboard.press('Space')
    await expect(pause).toBeVisible()
    await page.keyboard.press('a')
    await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Show playhead' }).inputValue())).toBeLessThan(1000)
    await expect(pause).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to Show start' })).toHaveAttribute('title', 'Go to Show start (A)')
  })

  test('authors, reloads, and lays out the canonical Clip Transform at narrow width (#529)', async ({ page }) => {
    await page.goto('studio/shows')
    await createPortableShow(page)

    const originalClip = page.getByRole('button', { name: 'Select TestPattern1D' }).first()
    const clipOwnerKey = await originalClip.getAttribute('data-show-selection-key')
    if (!clipOwnerKey) throw new Error('Selected Clip does not expose its timeline owner key.')
    const placementId = clipOwnerKey.slice('clip:'.length)
    await originalClip.click()
    await page.getByLabel('Source pattern').fill('TestPattern2D')
    await page.getByRole('option', { name: 'TestPattern2D' }).click()

    const transform = page.getByRole('group', { name: 'Clip Transform' })
    await expect(transform).toBeVisible()
    expect(await transform.evaluate((element) => {
      const effects = document.querySelector('[aria-label="Clip Effects"]')
      return Boolean(effects && (element.compareDocumentPosition(effects) & Node.DOCUMENT_POSITION_FOLLOWING))
    })).toBe(true)
    await transform.getByRole('spinbutton', { name: 'X' }).fill('0.25')
    await transform.getByRole('spinbutton', { name: 'X' }).blur()
    await transform.getByRole('spinbutton', { name: 'Rotation degrees' }).fill('-90')
    await transform.getByRole('spinbutton', { name: 'Rotation degrees' }).blur()
    await transform.getByRole('spinbutton', { name: 'Width' }).fill('1.4')
    await transform.getByRole('spinbutton', { name: 'Width' }).blur()
    await transform.getByRole('spinbutton', { name: 'Height' }).fill('0.8')
    await transform.getByRole('spinbutton', { name: 'Height' }).blur()

    await waitForCurrentShow(page, (show) => show.composition?.scenes.some((scene) => (
      scene.zones?.some((zone) => zone.main?.some((placement) => (
        placement.id === placementId
        && placement.transform?.positionX === 0.25
        && placement.transform?.rotation === -0.25
        && placement.transform?.scaleX === 1.4
        && placement.transform?.scaleY === 0.8
      )))
    )) === true)

    await page.reload()
    await page.getByRole('button', { name: 'Select TestPattern2D' }).first().click()
    await expect(transform.getByRole('spinbutton', { name: 'X' })).toHaveValue('0.25')
    await expect(transform.getByRole('spinbutton', { name: 'Rotation degrees' })).toHaveValue('-90')
    await expect(transform.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1.4')
    await expect(transform.getByRole('spinbutton', { name: 'Height' })).toHaveValue('0.8')

    await page.setViewportSize({ width: 560, height: 900 })
    await expect(transform).toBeVisible()
    const panelBounds = await page.getByRole('dialog', { name: 'Entity Detail Panel' }).boundingBox()
    const fieldBounds = await transform.getByRole('spinbutton').evaluateAll((fields) => fields.map((field) => {
      const bounds = field.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right }
    }))
    expect(panelBounds).not.toBeNull()
    expect(panelBounds!.x).toBeGreaterThanOrEqual(0)
    expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(560)
    expect(fieldBounds.every((bounds) => (
      bounds.left >= panelBounds!.x
      && bounds.right <= panelBounds!.x + panelBounds!.width
    ))).toBe(true)
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

    await expect(page.getByTitle('Show output summary')).toContainText('Installation')
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

  test('persists Freeze at entry and reports the selected capture policy (#533)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).first().click()
    await page.getByText('Advanced clip controls').click()
    await page.getByLabel('Clip evaluation').selectOption('freeze-at-entry')
    await waitForCurrentShow(page, (show) => (
      show.cells.some((clip) => clip.patternName === 'TestPattern1D' && clip.evaluationPolicy === 'freeze-at-entry')
    ))
    await expect(page.getByTestId('show-compile-bar')).toContainText('freeze at entry: 1 selected scene')
    await expect(page.getByTestId('show-compile-bar')).toContainText('capture once, private clock continues')

    await page.reload()
    await page.getByRole('button', { name: 'Select TestPattern1D' }).first().click()
    await page.getByText('Advanced clip controls').click()
    await expect(page.getByLabel('Clip evaluation')).toHaveValue('freeze-at-entry')
    await expect(page.getByTestId('show-compile-bar')).toContainText('freeze at entry: 1 selected scene')

    await page.getByRole('button', { name: 'View code' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
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

    await page.getByRole('button', { name: 'Show properties' }).click()
    await page.getByRole('button', { name: 'Add routing layout' }).click()
    await page.getByLabel('New layout routing layout name').fill('Alternating')
    const ranges = page.getByLabel('Alternating main pixel ranges')
    await ranges.fill('0-29')
    await ranges.blur()
    await page.getByRole('button', { name: 'Set routing layout after Scene 1' }).click()
    await page.getByLabel('Destination routing layout').selectOption({ label: 'Alternating' })
    await page.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (routing)' }).click()
    await page.getByLabel('Routing transfer duration seconds exact time').fill('2')
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
    await expect(page.getByLabel('Routing transfer duration seconds exact time')).toHaveValue('2')
    await expect(page.getByLabel('Routing transfer easing')).toHaveValue('ease-in-out')
    await expect(page.getByLabel('Routing transfer direction')).toHaveValue('reverse')
  })

  test('selects, edits, and reloads an appended Zone Layout interval from the timeline (#624)', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Show properties' }).click()
    await page.getByRole('button', { name: 'Add routing layout' }).click()
    await page.getByLabel('New layout routing layout name').fill('Alternate interval')
    await page.getByRole('button', { name: 'Add to Show' }).click()
    await page.getByRole('menuitem', { name: 'Zone Layout' }).click()
    const actions = page.getByRole('dialog', { name: 'Layout interval actions' })
    await actions.getByLabel('Layout definition').selectOption({ label: 'Alternate interval' })
    await actions.getByLabel('Layout interval duration in seconds exact time').fill('5')
    await actions.getByRole('button', { name: 'Append' }).click()

    const interval = page.getByRole('button', { name: 'Select Alternate interval routing interval 1' })
    await expect(interval).toHaveAttribute('aria-pressed', 'false')
    await interval.click()
    await expect(interval).toHaveAttribute('aria-pressed', 'true')
    const duration = page.getByLabel('Routing transfer duration seconds exact time')
    const easing = page.getByLabel('Routing transfer easing')
    await duration.fill('2')
    await duration.press('Tab')
    await expect(easing).toBeEnabled()
    await easing.selectOption('ease-in-out')
    await page.getByLabel('Routing transfer direction').selectOption('reverse')

    await waitForCurrentShow(page, (show) => show.transitions?.some((transition) => (
      transition.kind === 'routing'
      && transition.layoutId === 'layout-2'
      && transition.durationMs === 2_000
      && showEasingId(transition.easing) === 'ease-in-out'
      && transition.routingDirection === 'reverse'
    )))

    await page.reload()

    await page.getByRole('button', { name: 'Select Alternate interval routing interval 1' }).click()
    await expect(page.getByLabel('Destination routing layout')).toHaveValue('layout-2')
    await expect(page.getByLabel('Routing transfer duration seconds exact time')).toHaveValue('2')
    await expect(page.getByLabel('Routing transfer easing')).toHaveValue('ease-in-out')
    await expect(page.getByLabel('Routing transfer direction')).toHaveValue('reverse')
    await page.getByRole('button', { name: 'View code' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
  })

  test('authors, reloads, compiles, and removes a shared moving-split property (#623)', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)
    await page.getByRole('button', { name: 'Open Zones' }).click()
    await page.getByRole('dialog', { name: 'Zone Map' }).getByRole('button', { name: 'Add zone' }).click()
    await page.getByRole('button', { name: 'Close Zones' }).click()
    await page.getByRole('button', { name: 'Show properties' }).click()
    await page.getByLabel('Default routing mode').selectOption('split-x')
    await page.getByRole('button', { name: 'Show properties' }).click()
    await expect(page.getByRole('group', { name: 'Split position lane' })).toBeVisible()

    await page.getByRole('button', { name: 'Edit split position transition from Scene 1' }).click()
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Animate split position').check()
    await page.getByLabel('Split position start').fill('0.2')
    await page.getByLabel('Split position duration seconds exact time').fill('1.2')
    await page.getByLabel('Split position easing').selectOption('ease-in-out')

    await waitForCurrentShow(page, (show) => (
      show.routingLayouts[0]?.logical?.kind === 'split'
      && show.transitions?.[0]?.propertyTransitions?.routing?.splitPosition?.from === 0.2
      && show.transitions[0].propertyTransitions.routing.splitPosition.durationMs === 1200
      && showEasingId(show.transitions[0].propertyTransitions.routing.splitPosition.easing) === 'ease-in-out'
    ))

    await page.reload()
    await page.getByRole('button', { name: 'Show properties' }).click()
    await expect(page.getByLabel('Default routing mode')).toHaveValue('split-x')
    await page.getByRole('button', { name: 'Show properties' }).click()
    await page.getByRole('button', { name: 'Edit split position transition from Scene 1' }).click()
    await page.getByText('Advanced transition controls').click()
    await expect(page.getByLabel('Animate split position')).toBeChecked()
    await expect(page.getByLabel('Split position start')).toHaveValue('0.2')
    await expect(page.getByLabel('Split position duration seconds exact time')).toHaveValue('1.2')
    await expect(page.getByLabel('Split position easing')).toHaveValue('ease-in-out')
    await expect(page.getByText(/moving split: 1 scalar/i)).toBeVisible()
    await page.getByRole('button', { name: 'View code' }).click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
    await page.getByRole('button', { name: 'Back to show' }).click()

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByRole('group', { name: 'Split position lane' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit split position transition from Scene 1' })).toBeVisible()
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(pageOverflow.scrollWidth - pageOverflow.clientWidth).toBeLessThanOrEqual(8)

    await page.getByRole('button', { name: 'Edit split position transition from Scene 1' }).click()
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Animate split position').uncheck()
    await waitForCurrentShow(page, (show) => (
      show.transitions?.[0]?.propertyTransitions?.routing?.splitPosition === undefined
    ))
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

  test('keeps Scene-local transport bounded and explicit (#487)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Inspect Scene 1 in Super Detail' }).click()
    await page.getByRole('button', { name: 'Open Scene 1 editor' }).click()
    await expect(page.getByTestId('scene-transition-playhead-line')).toBeVisible()

    await expect(page.getByRole('button', { name: 'Go to Scene start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to Show start' })).toHaveCount(0)
    const playhead = page.getByRole('slider', { name: 'Scene playhead' })
    await playhead.fill('5000')
    await playhead.blur()
    await expect(page.getByLabel('Scene local time')).toContainText('00:05.0')

    await page.getByRole('button', { name: 'Go to Scene start' }).click()
    await expect(page.getByLabel('Scene local time')).toContainText('00:00.0')
    await playhead.fill('30000')
    await playhead.blur()
    await page.getByRole('button', { name: 'Play Scene preview' }).click()
    expect(Number(await playhead.inputValue())).toBeLessThan(1_000)
    await page.getByRole('button', { name: 'Pause Scene preview' }).click()

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByRole('group', { name: 'Scene transport controls' })).toBeVisible()
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(pageOverflow.scrollWidth - pageOverflow.clientWidth).toBeLessThanOrEqual(8)
  })

  test('authors and reloads exact Scene-local Property animation (#490)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).click()
    const clipPanel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(clipPanel.getByRole('region', { name: 'Clip properties' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Property to animate' }).selectOption({ label: 'Brightness' })
    await page.getByRole('button', { name: 'Animate selected property' }).click()
    await page.getByRole('button', { name: 'Select keyframe at 30000 ms' }).click()
    await page.getByRole('spinbutton', { name: 'Keyframe value' }).fill('0.42')
    await page.getByRole('spinbutton', { name: 'Keyframe value' }).blur()
    await page.getByRole('combobox', { name: 'Keyframe easing' }).selectOption('steps-4-end')

    await waitForCurrentShow(page, (show) => {
      const track = show.composition?.scenes[0]?.propertyTracks?.[0]
      return track?.target.kind === 'placement-view'
        && track.target.property === 'brightness'
        && track.keyframes[1]?.value === 0.42
        && typeof track.keyframes[1]?.easing === 'object'
        && track.keyframes[1].easing.curve === 'steps'
    })

    await page.reload()
    await page.getByRole('button', { name: 'Select TestPattern1D' }).click()
    await page.getByRole('button', { name: 'Select keyframe at 30000 ms' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Keyframe value' })).toHaveValue('0.42')
    await expect(page.getByRole('combobox', { name: 'Keyframe easing' })).toHaveValue('steps-4-end')
  })

  test('moves Scene-local overlays across layers and keeps diagnostics responsive (#491)', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)
    await page.getByRole('button', { name: 'Inspect Scene 1 in Super Detail' }).click()
    await page.getByRole('button', { name: 'Open Scene 1 editor' }).click()
    await expect(page.getByTestId('scene-transition-playhead-line')).toBeVisible()
    await page.getByRole('button', { name: 'Enable local cuts' }).click()
    await page.getByRole('combobox', { name: 'New Main clip Pattern' }).selectOption({ label: 'TestPattern1D' })
    await page.getByRole('button', { name: 'Overlay layer' }).click()
    await page.getByRole('button', { name: 'Overlay layer' }).click()
    await page.getByRole('button', { name: 'Add clip to Overlay 1 at playhead' }).click()
    await page.getByRole('button', { name: 'Add clip to Overlay 2 at playhead' }).click()

    const clip = page.getByRole('button', { name: 'Select TestPattern1D clip in Overlay 1' })
    const bounds = await clip.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.move(bounds!.x + Math.min(12, bounds!.width / 2), bounds!.y + bounds!.height - 3)
    await page.mouse.down()
    const liftedBounds = await page.getByTestId('scene-overlay-drag-ghost').boundingBox()
    expect(liftedBounds).not.toBeNull()
    expect(Math.abs(liftedBounds!.y - bounds!.y)).toBeLessThanOrEqual(1)
    await page.mouse.move(bounds!.x + Math.min(18, bounds!.width / 2), bounds!.y + bounds!.height / 2 + 48, { steps: 4 })
    await expect(page.getByTestId('scene-overlay-drag-ghost')).toContainText('TestPattern1D')
    await expect(page.locator('[data-drop-target="true"]')).toHaveCount(1)
    await page.mouse.up()
    await expect(page.getByTestId('scene-overlay-drag-ghost')).toHaveCount(0)

    // A fully occupied target has no legal before/after position, so the first
    // drop returns to its source layer without creating a partial edit.
    await expect(page.getByRole('button', { name: 'Select TestPattern1D clip in Overlay 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select TestPattern1D clip in Overlay 2' })).toBeVisible()
    await page.getByRole('button', { name: 'Select TestPattern1D clip in Overlay 2' }).click()
    await page.getByRole('button', { name: 'Delete overlay clip' }).click()

    const retryClip = page.getByRole('button', { name: 'Select TestPattern1D clip in Overlay 1' })
    const retryBounds = await retryClip.boundingBox()
    expect(retryBounds).not.toBeNull()
    const playheadBeforeDrag = await page.getByRole('slider', { name: 'Scene playhead' }).inputValue()
    await page.mouse.move(retryBounds!.x + Math.min(12, retryBounds!.width / 2), retryBounds!.y + retryBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(retryBounds!.x + Math.min(18, retryBounds!.width / 2), retryBounds!.y + retryBounds!.height / 2 + 48, { steps: 4 })
    await expect(page.getByTestId('scene-overlay-drag-ghost')).toContainText('TestPattern1D')
    await page.mouse.up()
    await expect(page.getByTestId('scene-overlay-drag-ghost')).toHaveCount(0)

    await waitForCurrentShow(page, (show) => (
      show.composition?.scenes[0]?.zones?.[0]?.overlays?.[0]?.placements.length === 0
      && show.composition.scenes[0].zones[0].overlays[1]?.placements.length === 1
    ))
    await expect(page.getByRole('button', { name: 'Select TestPattern1D clip in Overlay 2' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('spinbutton', { name: 'Start seconds' })).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Scene playhead' })).toHaveValue(playheadBeforeDrag)

    const layerHandle = page.getByRole('button', { name: 'Reorder Overlay 2 layer' })
    const layerHandleBounds = await layerHandle.boundingBox()
    expect(layerHandleBounds).not.toBeNull()
    await page.mouse.move(layerHandleBounds!.x + layerHandleBounds!.width / 2, layerHandleBounds!.y + layerHandleBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(layerHandleBounds!.x + layerHandleBounds!.width / 2, layerHandleBounds!.y - 54, { steps: 4 })
    await expect(page.getByTestId('scene-layer-drag-ghost')).toContainText('Overlay 2')
    await expect(page.locator('[data-layer-drop-target="true"]')).toHaveCount(1)
    await page.mouse.up()
    await expect(page.getByTestId('scene-layer-drag-ghost')).toHaveCount(0)
    await waitForCurrentShow(page, (show) => show.composition?.scenes[0]?.zones?.[0]?.overlays?.[0]?.name === 'Overlay 2')

    await page.getByRole('button', { name: 'Reorder Overlay 2 layer' }).press('ArrowDown')
    await waitForCurrentShow(page, (show) => show.composition?.scenes[0]?.zones?.[0]?.overlays?.[1]?.name === 'Overlay 2')

    // Keep the narrow check representative of a busy layer rail rather than a
    // two-row happy path.
    await page.getByRole('button', { name: 'Overlay layer' }).click()
    await page.getByRole('button', { name: 'Overlay layer' }).click()
    await page.getByRole('button', { name: 'Add clip to Overlay 3 at playhead' }).click()
    await page.getByRole('button', { name: 'Add clip to Overlay 4 at playhead' }).click()

    await page.getByRole('button', { name: 'Select TestPattern1D clip in Overlay 2' }).click()
    await page.getByRole('button', { name: 'Show Zone outlines' }).click()
    await page.getByRole('button', { name: 'Show Clip outline' }).click()
    await expect(page.getByTestId('show-stage-zone-outlines')).toBeVisible()
    await expect(page.getByTestId('show-stage-clip-outline')).toBeVisible()

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByTestId('show-scene-zone-editor')).toBeVisible()
    const localScroller = page.getByTestId('scene-local-scroll')
    const scrollMetrics = await localScroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
    }))
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth)
    await localScroller.hover()
    await page.mouse.wheel(0, 120)
    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, 120)
    await page.keyboard.up('Shift')
    await expect.poll(() => localScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(scrollMetrics.scrollLeft)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
    expect(consoleErrors).toEqual([])
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

  test('groups a marquee, edits linked choreography, makes one occurrence unique, and undoes (#587)', async ({ page }) => {
    const id = `playwright-group-${Date.now()}`
    const show = {
      ...legacyShowFixture(id, 'Group browser flow', [{ start: 0, end: 59 }]),
      outputContract: {
        version: 1 as const,
        kind: 'installation' as const,
        outputMapId: null,
        pixelCount: 60,
        resolution: 'fixed' as const,
      },
      composition: {
        version: 1,
        executionModel: 'deterministic-loop' as const,
        patternInstances: [
          {
            id: 'instance-main', pattern: { kind: 'stock' as const, id: 'TestPattern1D' }, patternName: 'Main pulse',
            time: { timeScale: 1, timeOffsetMs: 0 },
          },
          {
            id: 'instance-overlay', pattern: { kind: 'stock' as const, id: 'CometLoom' }, patternName: 'Overlay pulse',
            time: { timeScale: 1, timeOffsetMs: 0 },
          },
        ],
        scenes: [
          {
            sceneId: 'scene-1',
            zones: [{
              zoneId: 'zone-1',
              main: [{
                id: 'clip-main', instanceId: 'instance-main', startMs: 0, durationMs: 5_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }],
              overlays: [{
                id: 'overlay-1', name: 'Overlay 1',
                placements: [{
                  id: 'clip-overlay', instanceId: 'instance-overlay', startMs: 0, durationMs: 5_000, opacity: 1,
                  view: { mirror: false, phase: 0, brightness: 1 },
                }],
              }],
            }],
          },
          { sceneId: 'scene-2', zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] },
        ],
      },
    }
    const response = await page.context().request.post('/api/shows', { data: show })
    expect(response.ok(), await response.text()).toBe(true)
    const listed = await page.context().request.get('/api/shows')
    expect(listed.ok(), await listed.text()).toBe(true)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`studio/shows/${id}`)
    const main = page.getByRole('button', { name: 'Select Main pulse' })
    const overlay = page.getByRole('button', { name: 'Select Overlay pulse' })
    const [mainBounds, overlayBounds, gridBounds] = await Promise.all([
      main.boundingBox(),
      overlay.boundingBox(),
      page.getByTestId('show-timeline-grid').boundingBox(),
    ])
    expect(mainBounds).not.toBeNull()
    expect(overlayBounds).not.toBeNull()
    expect(gridBounds).not.toBeNull()
    const clips = [mainBounds!, overlayBounds!]
    await page.mouse.move(
      Math.min(gridBounds!.x + gridBounds!.width - 2, Math.max(...clips.map((bounds) => bounds.x + bounds.width)) + 8),
      Math.max(gridBounds!.y + 2, Math.min(...clips.map((bounds) => bounds.y)) - 4),
    )
    await page.mouse.down()
    await page.mouse.move(
      Math.max(gridBounds!.x + 2, Math.min(...clips.map((bounds) => bounds.x)) - 4),
      Math.min(gridBounds!.y + gridBounds!.height - 2, Math.max(...clips.map((bounds) => bounds.y + bounds.height)) + 4),
      { steps: 5 },
    )
    await page.mouse.up()

    const groupCommand = page.getByRole('button', { name: 'Make Group from selection' })
    await expect(groupCommand).not.toHaveAttribute('aria-disabled', 'true')
    await groupCommand.click()
    await expect(page.getByRole('button', { name: 'Select Group Group' })).toHaveCount(2)

    await page.getByRole('button', { name: 'Duplicate Group occurrence' }).click()
    await expect(page.getByRole('button', { name: 'Select Group Group' })).toHaveCount(4)
    await expect(page.getByRole('region', { name: 'Group properties' })).toContainText('2 linked occurrences')

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Select Group Group' }).last().dblclick()
    await expect(page.getByRole('status', { name: 'Group isolation: Group' })).toBeVisible()
    await page.getByRole('button', { name: 'Select Group Clip Main pulse' }).click()
    await page.getByRole('textbox', { name: 'Duration seconds exact time' }).fill('4')
    await page.getByRole('textbox', { name: 'Duration seconds exact time' }).press('Enter')
    await waitForCurrentShow(page, (saved) => (
      saved.composition?.groupDefinitions?.length === 1
      && saved.composition.groupDefinitions[0].placements.some((placement) => placement.durationMs === 4_000)
      && saved.composition.groupOccurrences?.length === 2
    ))

    await page.keyboard.press('Escape')
    await expect(page.getByRole('status', { name: 'Group isolation: Group' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Select Group Group' }).last().click()
    await page.getByRole('button', { name: 'Make Group unique' }).click()
    await waitForCurrentShow(page, (saved) => saved.composition?.groupDefinitions?.length === 2)

    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await waitForCurrentShow(page, (saved) => saved.composition?.groupDefinitions?.length === 1)
  })
})

type PersistedShow = {
  id: string
  composition?: {
    version: number
    patternInstances?: Array<{ id: string; patternName: string }>
    groupDefinitions?: Array<{
      id: string
      placements: Array<{ id: string; durationMs: number }>
    }>
    groupOccurrences?: Array<{ id: string; definitionId: string }>
    scenes: Array<{
      propertyTracks?: Array<{
        target: { kind: string; property?: string }
        keyframes: Array<{ value: number; easing: string | { curve: string } }>
      }>
      zones?: Array<{
        zoneId: string
        main?: Array<{
          id: string
          instanceId: string
          view?: { brightness: number }
          transform?: { positionX: number; positionY: number; rotation: number; scaleX: number; scaleY: number }
        }>
        overlays: Array<{
          id: string
          name: string
          placements: Array<{ id: string; startMs: number; durationMs: number }>
        }>
      }>
    }>
  } | null
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
    transform?: { positionX: number; positionY: number; rotation: number; scaleX: number; scaleY: number }
    restartOnEntry?: boolean
    evaluationPolicy?: 'live' | 'freeze-at-entry'
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
  outputEffects?: Array<{ id: string; kind: 'trails'; retention: number }>
}

async function createInstallationShow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)
}

async function createPortableShow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Portable Show' }).click()
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

async function expectClipSummaryFits(clip: Locator): Promise<void> {
  const geometry = await clip.evaluate((element) => {
    const summary = element.querySelector<HTMLElement>('.show-clip-summary-inline')
    if (!summary) return null
    const clipBounds = element.getBoundingClientRect()
    const summaryBounds = summary.getBoundingClientRect()
    return {
      clipBottom: clipBounds.bottom,
      summaryBottom: summaryBounds.bottom,
      summaryHeight: summaryBounds.height,
      summaryLineHeight: Number.parseFloat(getComputedStyle(summary).lineHeight),
    }
  })
  expect(geometry).not.toBeNull()
  expect(geometry!.summaryHeight).toBeGreaterThanOrEqual(geometry!.summaryLineHeight - 1)
  expect(geometry!.summaryBottom).toBeLessThanOrEqual(geometry!.clipBottom - 1)
}

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number } | null,
  right: { x: number; y: number; width: number; height: number } | null,
): boolean {
  if (!left || !right) return false
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
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
