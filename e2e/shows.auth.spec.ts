import { expect, test } from './fixtures/authenticated'
import type { Locator, Page } from '@playwright/test'

test.describe('authenticated Show authoring', () => {
  test('keeps built-in Show Reset aligned with session-only edits (#363, #619)', async ({ page }) => {
    const showWrites: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/shows') && request.method() !== 'GET') showWrites.push(request.method())
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

    await expect(page.getByRole('region', { name: '101 Clips, Cuts, and Blank Time guide' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()

    // Editable: a real Clip edit creates only a session draft.
    const resetButton = page.getByRole('button', { name: 'Reset built-in Show' })
    await expect(resetButton).toBeDisabled()
    await page.getByRole('button', { name: 'Select MetaballGarden' }).click()
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
    await page.getByRole('button', { name: 'Select MetaballGarden' }).click()
    const editedAgainBrightness = page.getByRole('dialog', { name: 'Entity Detail Panel' })
      .getByRole('textbox', { name: 'Brightness exact percentage' })
    await editedAgainBrightness.fill('50')
    await editedAgainBrightness.blur()
    await expect(resetButton).toBeEnabled()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Reset built-in Show' })).toBeDisabled()
    await page.getByRole('button', { name: 'Select MetaballGarden' }).click()
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })
      .getByRole('textbox', { name: 'Brightness exact percentage' })).toHaveValue('100')
    expect(showWrites).toEqual([])

    await page.setViewportSize({ width: 600, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(8)
  })

  test('previews the fitted timeline continuously while dragging Show End (#592)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

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
    await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

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

  test('keeps the Show End diamond aligned when the preview pane resizes the timeline (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

    const showEnd = page.getByRole('button', { name: /Show End at/ })
    const endAnchor = page.getByTestId('show-timeline-end-anchor')
    const previewSplitter = page.getByRole('separator', { name: 'Resize preview pane' })
    await expect(showEnd).toBeVisible()

    const initialAnchor = await endAnchor.boundingBox()
    expect(initialAnchor).not.toBeNull()
    await previewSplitter.press('Shift+ArrowLeft')

    await expect.poll(async () => {
      const anchor = await endAnchor.boundingBox()
      return anchor?.x ?? initialAnchor!.x
    }).toBeLessThan(initialAnchor!.x - 40)
    await expect.poll(async () => {
      const anchor = await endAnchor.boundingBox()
      const marker = await showEnd.boundingBox()
      if (!anchor || !marker) return Number.POSITIVE_INFINITY
      const horizontalOffset = Math.abs(
        anchor.x + anchor.width / 2 - (marker.x + marker.width / 2),
      )
      const verticalOffset = Math.abs(anchor.y - (marker.y + marker.height / 2))
      return Math.max(horizontalOffset, verticalOffset)
    }).toBeLessThan(1)
    await expect.poll(async () => {
      const marker = await showEnd.boundingBox()
      const splitter = await previewSplitter.boundingBox()
      return Boolean(marker && splitter && marker.x + marker.width <= splitter.x)
    }).toBe(true)
  })

  test('keeps the Stage canvas inside its scrollport across the scrollbar threshold (#686)', async ({ page }) => {
    await page.setViewportSize({ width: 1950, height: 1196 })
    await page.goto('studio/shows/stock-show-106-built-from-basics')

    const previewPane = page.getByTestId('preview-pane')
    const previewSplitter = page.getByRole('separator', { name: 'Resize preview pane' })
    const geometry = () => previewPane.evaluate((pane) => {
      const scrollport = pane.firstElementChild as HTMLElement | null
      const canvas = pane.querySelector('canvas')
      const canvasContainer = canvas?.parentElement?.parentElement
      if (!scrollport || !canvas || !canvasContainer) return null
      const scrollStyle = getComputedStyle(scrollport)
      return {
        paneWidth: Math.round(pane.getBoundingClientRect().width),
        overflowX: scrollStyle.overflowX,
        scrollbarGutter: scrollStyle.scrollbarGutter,
        horizontalOverflow: scrollport.scrollWidth - scrollport.clientWidth,
        canvasOverflow: Math.ceil(
          canvas.getBoundingClientRect().width - canvasContainer.getBoundingClientRect().width,
        ),
      }
    })

    for (let step = 0; step < 5; step += 1) await previewSplitter.press('Shift+ArrowLeft')
    await previewSplitter.press('ArrowLeft')

    for (const targetWidth of [720, 740, 760]) {
      await expect.poll(geometry).toEqual({
        paneWidth: targetWidth,
        overflowX: 'hidden',
        scrollbarGutter: 'stable',
        horizontalOverflow: 0,
        canvasOverflow: 0,
      })
      await previewSplitter.press('ArrowLeft')
      await previewSplitter.press('ArrowLeft')
    }
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
    await page.goto('studio/shows/stock-show-102-transitions-values')

    const localAnimation = page.getByRole('group', { name: 'SignalMandala brightness animation for Main' })
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
    await page.goto('studio/shows/stock-show-106-built-from-basics')

    await expect(page.locator('[data-show-layout-interval]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Open Zones' }).click()
    // Collapse lives on the Zone rail; the map rows stay minimal (#63).
    await page.getByRole('button', { name: 'Collapse zone Sky' }).click()
    await page.getByRole('button', { name: 'Close Zones' }).click()

    await expect(page.getByRole('button', { name: 'Expand zone Sky' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Collapse zone Ground' })).toBeVisible()

    const collapsed = page.getByRole('img', { name: 'Collapsed zone Sky timeline' })
    // The rail is closed here, so the summary is the only thing that can name the
    // Zone; with the rail open its header carries the name instead (#632).
    const label = page.getByTestId('collapsed-zone-layout-label').first()
    await expect(label).toBeVisible()
    await expect(label).toHaveClass(/text-zinc-100/)
    await expect(label).toHaveCSS('position', 'sticky')

    const geometry = await collapsed.evaluate((element) => {
      const labelElement = document.querySelector<HTMLElement>('[data-testid="collapsed-zone-layout-label"]')
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

  // Restored with the Learn 200 rebuild (#363): 206 Changing Zone Layouts
  // carries the three named Zone Layouts and two layout boundaries this
  // ruler and collapsed-summary coverage needs.
  test('keeps Zone Layout names on the ruler and Zone names in collapsed summaries (#63)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-206-changing-zone-layouts')

    await page.getByRole('button', { name: 'Open Zones' }).click()
    // Collapse lives on the Zone rail; the map rows stay minimal (#63).
    await page.getByRole('button', { name: 'Collapse zone Weave' }).click()
    await page.getByRole('button', { name: 'Collapse zone Water' }).click()
    await page.getByRole('button', { name: 'Close Zones' }).click()

    // Kind labels live on the Zone Layouts lane; the split cell also carries
    // its share percentage, and single-zone intervals append their sole Zone
    // (#694).
    await expect(page.locator('[data-show-layout-interval]'))
      .toHaveText(['Full surface · Weave', 'Moving split X50%', 'Rings'])
    await expect(page.getByTestId('collapsed-zone-layout-label'))
      .toHaveText(['Weave', 'Weave', 'Weave', 'Water', 'Water'])

    const boundaries = page.locator('[data-show-layout-boundary]')
    await expect(boundaries).toHaveCount(2)
    const boundaryBounds = await boundaries.last().boundingBox()
    const rulerBounds = await page.getByTestId('show-timeline-ruler').boundingBox()
    const collapsedBounds = await page.getByRole('img', { name: 'Collapsed zone Water timeline' }).boundingBox()
    expect(boundaryBounds).not.toBeNull()
    expect(rulerBounds).not.toBeNull()
    expect(collapsedBounds).not.toBeNull()
    expect(boundaryBounds!.y).toBeLessThanOrEqual(rulerBounds!.y + 1)
    expect(boundaryBounds!.y + boundaryBounds!.height).toBeGreaterThanOrEqual(
      collapsedBounds!.y + collapsedBounds!.height,
    )
  })

  test('projects one Scene-local animation into one main-timeline sparkline (#363, #599)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows/stock-show-102-transitions-values')

    const localAnimation = page.getByRole('group', { name: 'SignalMandala brightness animation for Main' })
    await expect(localAnimation).toBeVisible()
    await expect(localAnimation.locator('polyline')).toHaveCount(1)
    await expect(localAnimation.locator('[data-property-beat-dot]')).toHaveCount(3)
    await expect(localAnimation.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('group', { name: /animation for Main$/ })).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Animation speed lane for Main' })).toHaveCount(0)
  })

  test('navigates from a built-in Clip summary to its field (#599, #650)', async ({ page }) => {
    await page.goto('studio/shows/stock-show-reference-property-animation')

    const clip = page.getByRole('button', { name: 'Select CompassRose' }).first()
    await expect(clip).toBeVisible()
    await clip.click()

    const clipProperties = page.getByRole('region', { name: 'Clip properties' })
    await expect(clipProperties.getByRole('heading', { name: 'CompassRose' })).toBeVisible()
    const summary = clipProperties.getByRole('region', { name: 'Clip summary' })
    await expect(summary).toBeVisible()

    await summary.getByRole('button', {
      name: /^Animation speed .*; go to Pattern Speed field$/,
    }).click()

    await expect(clipProperties.getByRole('tab', { name: /^Pattern/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(
      clipProperties.getByRole('textbox', { name: 'Animation speed exact multiplier' }),
    ).toBeFocused()
  })

  // The dense-toolbar test was 112 lines over five viewports with dozens of
  // pixel assertions, so any early failure hid every later one and incidental
  // values (a 46px pane, a 10px font) broke on cosmetic changes. Split into the
  // promises that actually matter: the groups exist, labels disclose as width
  // allows, and nothing overlaps or overflows when space runs out (#638).

  test('timeline toolbar exposes transport, view, and command groups', async ({ page }) => {
    await page.setViewportSize({ width: 2200, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const toolbar = page.getByTestId('show-timeline-toolbar')
    await expect(toolbar.getByRole('group', { name: 'Show transport controls' })).toBeVisible()
    await expect(toolbar.getByRole('group', { name: 'Timeline view controls' })).toBeVisible()
    await expect(toolbar.getByRole('group', { name: 'Timeline commands' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Go to Show start' })).toBeVisible()
    await expect(toolbar.getByRole('slider', { name: 'Pan visible timeline range' })).toBeVisible()
    await expect(toolbar.getByLabel('Show time')).toHaveText(/^\d{2}:\d{2}\.\d\/\d{2}:\d{2}\.\d$/)
  })

  test('toolbar command labels disclose as width allows', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const toolbar = page.getByTestId('show-timeline-toolbar')
    const commands = toolbar.getByRole('group', { name: 'Timeline commands' })
    const addLabel = toolbar.getByRole('button', { name: 'Add to Show' }).locator('.timeline-command-label-primary')
    const splitLabel = commands.getByRole('button', { name: 'Split at playhead' }).locator('.timeline-command-label-secondary')

    // Narrow: secondary commands give up their labels first.
    await expect(splitLabel).toHaveCSS('display', 'none')

    // Wide: secondary labels return. Asserting the direction of the change,
    // rather than the exact breakpoint, keeps this from breaking every time the
    // rail is resized -- which is what retired the previous 1500/1600 pair.
    await page.setViewportSize({ width: 1900, height: 900 })
    await expect(splitLabel).toHaveCSS('display', 'block')
    await expect(addLabel).toHaveCSS('display', 'block')
  })

  test('toolbar groups stay separated and contained when space runs out', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const toolbar = page.getByTestId('show-timeline-toolbar')
    await expect(toolbar).toBeVisible()
    const transport = await toolbar.getByRole('group', { name: 'Show transport controls' }).boundingBox()
    const view = await toolbar.getByRole('group', { name: 'Timeline view controls' }).boundingBox()
    const commands = await toolbar.getByRole('group', { name: 'Timeline commands' }).boundingBox()

    // Prove all three rendered before asserting they do not overlap: a missing
    // element trivially satisfies a non-overlap check.
    expect(transport).not.toBeNull()
    expect(view).not.toBeNull()
    expect(commands).not.toBeNull()
    expect(rectanglesOverlap(transport, view)).toBe(false)
    expect(rectanglesOverlap(view, commands)).toBe(false)
    expect(rectanglesOverlap(transport, commands)).toBe(false)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(8)
  })

  test('enables Show Trails and keeps its retention after a reload', async ({ page }) => {
    // The previous version asserted the formatted readout ("75.0%") and a
    // compile-bar phrase ("3 planes · previous-rgb"), both presentation. Assert
    // the control's own value and that it survives a round trip (#638).
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Show properties' }).click()
    const enabled = page.getByRole('checkbox', { name: 'Enable Trails' })
    await expect(enabled).not.toBeChecked()
    await enabled.check()

    const retention = page.getByRole('slider', { name: 'Trails retention' })
    await retention.fill('0.75')
    await retention.blur()

    // Barrier, not oracle.
    await waitForCurrentShow(page, (show) => show.outputEffects?.[0]?.kind === 'trails'
      && show.outputEffects[0].retention === 0.75)

    await page.reload()
    await page.getByRole('button', { name: 'Show properties' }).click()
    await expect(page.getByRole('checkbox', { name: 'Enable Trails' })).toBeChecked()
    await expect(page.getByRole('slider', { name: 'Trails retention' })).toHaveValue('0.75')
  })

  test('keeps vertical scroll, horizontal trackpad pan, and Shift-wheel pan distinct (#476)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 500 })
    await page.goto('studio/shows/stock-show-showcase-redline-installation')
    await zoomTimeline(page, 8)

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

    await zoomTimeline(page, 9)
    await page.getByRole('slider', { name: 'Pan visible timeline range' }).press('ArrowRight')

    await expect(page.getByRole('slider', { name: 'Show playhead' })).toHaveValue('0')
    await expect(playhead).toBeHidden()
  })

  // The previous test bundled delete, magnetic drag, undo, redo, Clip clone,
  // Scene clone, Snap persistence, narrow-width overflow, and console
  // cleanliness into one sequence, and every oracle read the persisted record
  // rather than the screen. Its drag target ("Add clip to main in Scene 2") no
  // longer exists, so the move half is rebuilt around an edit that does (#638).

  test('undo restores a deleted Clip and redo removes it again', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const cometLoom = page.getByRole('button', { name: 'Select CometLoom', exact: true })
    await expect(cometLoom).toBeVisible()
    await cometLoom.click()
    await page.keyboard.press('Delete')
    await expect(cometLoom).toHaveCount(0)

    await page.getByRole('button', { name: 'Undo Show edit' }).click()
    await expect(cometLoom).toBeVisible()

    await page.getByRole('button', { name: 'Redo Show edit' }).click()
    await expect(cometLoom).toHaveCount(0)
  })

  test('reclaims Scene-boundary Transition time after resizing its Clip away (#695)', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const leftClip = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    const rightClip = page.getByRole('button', { name: 'Select CometLoom', exact: true })
    const startHandle = page.getByRole('separator', { name: 'Resize CometLoom start' })
    const initialHandle = await startHandle.boundingBox()
    expect(initialHandle).not.toBeNull()

    await page.keyboard.down('Alt')
    await page.mouse.move(initialHandle!.x + initialHandle!.width / 2, initialHandle!.y + initialHandle!.height / 2)
    await page.mouse.down()
    await page.mouse.move(initialHandle!.x + initialHandle!.width / 2 + 40, initialHandle!.y + initialHandle!.height / 2, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await expect(page.getByRole('button', { name: 'Show End at 60 seconds' })).toBeVisible()
    await expect(page.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    })).toHaveCount(0)
    await waitForCurrentShow(page, (show) => show.transitions?.some((transition) => (
      transition.id === 'transition-scene-1'
      && transition.kind === 'cut'
      && transition.durationMs === 0
    )) === true)

    const leftBounds = await leftClip.boundingBox()
    const movedHandle = await startHandle.boundingBox()
    expect(leftBounds).not.toBeNull()
    expect(movedHandle).not.toBeNull()
    expect(movedHandle!.x).toBeGreaterThan(leftBounds!.x + leftBounds!.width)

    await page.mouse.move(movedHandle!.x + movedHandle!.width / 2, movedHandle!.y + movedHandle!.height / 2)
    await page.mouse.down()
    await page.mouse.move(leftBounds!.x + leftBounds!.width, movedHandle!.y + movedHandle!.height / 2, { steps: 4 })
    await page.mouse.up()

    await expect.poll(async () => {
      const left = await leftClip.boundingBox()
      const right = await rightClip.boundingBox()
      return left && right ? Math.abs(right.x - (left.x + left.width)) : Number.POSITIVE_INFINITY
    }).toBeLessThanOrEqual(1.5)
    await waitForCurrentShow(page, (show) => show.composition?.scenes[1]?.zones[0]?.main[0]?.startMs === 0)
  })

  test('keeps the Snap preference after a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const snap = page.getByRole('button', { name: 'Snap playhead' })
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'false')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Snap playhead' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('Option-drags an independent Clip duplicate onto another Layer (#668)', async ({ page }) => {
    const id = `playwright-option-drag-${Date.now()}`
    const show = {
      ...legacyShowFixture(id, 'Option-drag duplicate', [{ start: 0, end: 59 }]),
      outputContract: {
        version: 1 as const,
        kind: 'installation' as const,
        outputMapId: null,
        pixelCount: 60,
        resolution: 'fixed' as const,
      },
      composition: {
        version: 1,
        patternInstances: [{
          id: 'instance-source',
          pattern: { kind: 'stock' as const, id: 'TestPattern1D' },
          patternName: 'Option Copy Rings',
          time: { timeScale: 0.75, timeOffsetMs: 1_250 },
        }],
        scenes: [
          {
            sceneId: 'scene-1',
            zones: [{
              zoneId: 'zone-1',
              main: [{
                id: 'clip-source',
                instanceId: 'instance-source',
                startMs: 0,
                durationMs: 5_000,
                view: { mirror: true, phase: 0.25, brightness: 0.6 },
              }],
              overlays: [{ id: 'overlay-scene-1', name: 'Layer 1', placements: [] }],
            }],
          },
          {
            sceneId: 'scene-2',
            zones: [{
              zoneId: 'zone-1',
              main: [],
              overlays: [{ id: 'overlay-scene-2', name: 'Layer 1', placements: [] }],
            }],
          },
        ],
      },
    }
    const response = await page.context().request.post('/api/shows', { data: show })
    expect(response.ok(), await response.text()).toBe(true)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`studio/shows/${id}`)
    const source = page.getByRole('button', { name: 'Select Option Copy Rings' })
    const overlay = page.locator('[data-show-layer-kind="overlay"]').first()
    const [sourceBounds, overlayBounds] = await Promise.all([
      source.boundingBox(),
      overlay.boundingBox(),
    ])
    expect(sourceBounds).not.toBeNull()
    expect(overlayBounds).not.toBeNull()

    await page.keyboard.down('Alt')
    await page.mouse.move(
      sourceBounds!.x + sourceBounds!.width / 2,
      sourceBounds!.y + sourceBounds!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      overlayBounds!.x + overlayBounds!.width * 0.25,
      overlayBounds!.y + overlayBounds!.height / 2,
      { steps: 8 },
    )
    await expect(page.getByTestId('show-clip-move-preview')).toHaveAttribute('data-drag-mode', 'duplicate')

    // Releasing Option after drag start must not turn the latched copy into a move.
    await page.keyboard.up('Alt')
    await page.mouse.up()

    await expect(page.getByRole('button', { name: 'Select Option Copy Rings' })).toHaveCount(2)
    await waitForCurrentShow(page, (saved) => {
      const composition = saved.composition
      if (!composition || composition.patternInstances?.length !== 2) return false
      const sourceClips = composition.scenes.flatMap((scene) => scene.zones?.[0]?.main ?? [])
      const copiedClips = composition.scenes.flatMap((scene) => (
        scene.zones?.[0]?.overlays.flatMap((layer) => layer.placements) ?? []
      ))
      return sourceClips.length === 1
        && sourceClips[0]?.instanceId === 'instance-source'
        && copiedClips.length === 1
    })

    await page.keyboard.press('Control+z')
    await expect(page.getByRole('button', { name: 'Select Option Copy Rings' })).toHaveCount(1)
  })

  // Split from one 58-line test covering anchoring, no-reflow, edit
  // persistence, Escape dismissal, owner switching, and narrow-width teardown.
  // getByLabel('Brightness') also matched the field's exact textbox, so the
  // edit now targets that control directly rather than tripping strict mode.

  test('places the Entity Detail Panel beside its Clip without reflowing the timeline (#665)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const timeline = page.getByRole('region', { name: 'Show timeline' })
    const before = await timeline.boundingBox()
    const clip = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    const ownerKey = await clip.getAttribute('data-show-selection-key')
    expect(ownerKey).not.toBeNull()
    await clip.click()

    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(panel).toHaveCount(1)
    await expect(panel).toHaveAttribute('data-owner-key', ownerKey!)
    await expect(panel).toHaveAttribute('data-placement', 'right')
    expect((await timeline.boundingBox())?.height).toBe(before?.height)

    const clipBounds = await clip.boundingBox()
    const bounds = await panel.boundingBox()
    expect(clipBounds).not.toBeNull()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(clipBounds!.x + clipBounds!.width + 9)
    expect(bounds!.height).toBe(488)
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
  })

  test('preserves an exact Clip edit across a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await selectClip(page, 'TestPattern1D')
    const brightness = page.getByRole('dialog', { name: 'Entity Detail Panel' })
      .getByRole('textbox', { name: /^Brightness exact/ })
    await brightness.fill('63')
    await brightness.blur()

    // Barrier, not oracle.
    await waitForCurrentShow(page, (show) => show.composition?.scenes.some((scene) => (
      scene.zones?.some((zone) => zone.main?.some((placement) => placement.view?.brightness === 0.63))
    )) === true)

    await page.reload()
    await selectClip(page, 'TestPattern1D')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })
      .getByRole('textbox', { name: /^Brightness exact/ })).toHaveValue('63')
  })

  test('dismisses the panel with Escape and returns focus to the Clip', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const clip = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
    await clip.click()
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(panel).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(clip).toBeFocused()
  })

  test('moves the panel to another Clip owner through keyboard navigation', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(panel).toHaveCount(1)

    const other = page.getByRole('button', { name: 'Select CometLoom', exact: true })
    const otherKey = await other.getAttribute('data-show-selection-key')
    expect(otherKey).not.toBeNull()
    await other.focus()
    await other.press('Enter')

    await expect(panel).toHaveCount(1)
    await expect(panel).toHaveAttribute('data-owner-key', otherKey!)
  })

  // Effects coverage is split by concern. The previous single test authored,
  // previewed, edited, duplicated, reordered, removed, and reloaded in one
  // sequence, so the first failure hid every later concern; it also pinned the
  // catalogue size at 22 and used an oracle that read `?? 0` from a failed API
  // call, which passes when the endpoint is broken (#638).

  test('adds a Clip Effect that survives a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const stack = await openClipEffects(page, 'TestPattern1D')
    await addEffect(page, stack, 'ripple', 'Ripple')
    const addedEffect = stack.getByRole('button', { name: 'More actions for Ripple Effect' })
    await expect(addedEffect).toBeVisible()
    await expect(addedEffect).toBeFocused()

    await page.reload()
    const reloaded = await openClipEffects(page, 'TestPattern1D')
    await expect(reloaded.getByRole('button', { name: 'More actions for Ripple Effect' })).toBeVisible()
  })

  test('adds and removes Mirror only through its fixed Transform row', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const stack = await openClipEffects(page, 'TestPattern1D')
    await addEffect(page, stack, 'mirror', 'Mirror')
    const mirrorRow = stack.getByTestId('show-effect-mirror')
    await expect(mirrorRow).toHaveAttribute('data-fixed', 'true')
    await expect(mirrorRow.getByText('Always first')).toBeVisible()
    await expect(mirrorRow.getByRole('button', { name: /Drag/ })).toHaveCount(0)
    await waitForCurrentShow(page, (show) => show.composition?.scenes.some((scene) => (
      scene.zones?.some((zone) => zone.main?.some((placement) => placement.view.mirror))
    )) === true)

    await page.reload()
    const reloaded = await openClipEffects(page, 'TestPattern1D')
    await reloaded.getByRole('button', { name: 'More actions for Mirror Effect' }).click()
    const menu = page.getByRole('menu', { name: 'Actions for Mirror Effect' })
    await expect(menu.getByRole('menuitem')).toHaveCount(1)
    await menu.getByRole('menuitem', { name: 'Remove Mirror Effect' }).click()

    await expect(reloaded.getByTestId('show-effect-mirror')).toHaveCount(0)
    await waitForCurrentShow(page, (show) => show.composition?.scenes.every((scene) => (
      scene.zones?.every((zone) => zone.main?.every((placement) => !placement.view.mirror))
    )) === true)
  })

  test('keeps edited Effect parameters after a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const stack = await openClipEffects(page, 'TestPattern1D')
    await addEffect(page, stack, 'ripple', 'Ripple')
    await stack.getByRole('spinbutton', { name: 'Amount' }).fill('0.2')
    await stack.getByRole('spinbutton', { name: 'Amount' }).blur()

    // Barrier, not oracle: showPersistenceQueues chains writes per Show, so a
    // second edit's PUT is not dispatched until the first resolves, and
    // page.reload() would discard it. Observe the persisted value before
    // navigating; the assertion after the reload stays on visible state.
    await waitForCurrentShow(page, (show) => show.composition?.scenes.some((scene) => (
      scene.zones?.some((zone) => zone.main?.some((placement) => (
        placement.effects?.some((effect) => effect.kind === 'ripple' && effect.amount === 0.2)
      )))
    )) === true)

    await page.reload()
    const reloaded = await openClipEffects(page, 'TestPattern1D')
    await expect(reloaded.getByRole('spinbutton', { name: 'Amount' })).toHaveValue('0.2')
  })

  test('browsing the Effect palette does not commit an Effect', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const stack = await openClipEffects(page, 'TestPattern1D')
    await stack.getByRole('button', { name: 'Add Effect' }).click()
    const palette = page.getByRole('region', { name: 'Add Effect' })
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    // Positive precondition first: a bare "no Effect was added" assertion would
    // also hold on a page that never rendered the palette at all.
    await expect(palette.getByRole('button', { name: 'Add Ripple Effect' })).toBeVisible()
    await expect(palette.getByRole('searchbox', { name: 'Search Effects' })).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Add Effect' })).toHaveCount(0)
    const desktopPanelBounds = await panel.boundingBox()
    const desktopPaletteBounds = await palette.boundingBox()
    expect(desktopPanelBounds).not.toBeNull()
    expect(desktopPaletteBounds).not.toBeNull()
    expect(desktopPanelBounds!.height).toBeLessThanOrEqual(560)
    expect(desktopPaletteBounds!.height).toBeGreaterThanOrEqual(170)
    expect(desktopPaletteBounds!.height).toBeLessThanOrEqual(300)
    expect(desktopPaletteBounds!.x).toBeGreaterThanOrEqual(desktopPanelBounds!.x)
    expect(desktopPaletteBounds!.x + desktopPaletteBounds!.width)
      .toBeLessThanOrEqual(desktopPanelBounds!.x + desktopPanelBounds!.width)

    const ripple = palette.getByRole('button', { name: 'Add Ripple Effect' })
    await ripple.hover()
    await page.setViewportSize({ width: 600, height: 800 })
    await expect.poll(async () => {
      const [panelBounds, paletteBounds] = await Promise.all([
        panel.boundingBox(),
        palette.boundingBox(),
      ])
      return Boolean(
        panelBounds
        && paletteBounds
        && paletteBounds.x >= panelBounds.x
        && paletteBounds.x + paletteBounds.width <= panelBounds.x + panelBounds.width,
      )
    }).toBe(true)
    const narrowPanelBounds = await panel.boundingBox()
    const narrowPaletteBounds = await palette.boundingBox()
    expect(narrowPanelBounds).not.toBeNull()
    expect(narrowPaletteBounds).not.toBeNull()
    expect(narrowPanelBounds!.height).toBeLessThanOrEqual(560)
    expect(narrowPaletteBounds!.height).toBeGreaterThanOrEqual(262)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(8)
    await page.keyboard.press('Escape')

    await expect(palette).toBeVisible()
    await expect(ripple).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
    await expect(stack.getByRole('button', { name: 'Add Effect' })).toBeFocused()
    await expect(stack.getByRole('button', { name: 'More actions for Ripple Effect' })).toHaveCount(0)
  })

  test('removes one Effect and leaves the rest of the stack', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const stack = await openClipEffects(page, 'TestPattern1D')
    await addEffect(page, stack, 'ripple', 'Ripple')
    await addEffect(page, stack, 'vignette', 'Vignette')
    await expect(stack.getByRole('button', { name: 'More actions for Vignette Effect' })).toBeVisible()

    await stack.getByRole('button', { name: 'More actions for Ripple Effect' }).click()
    await page.getByRole('menuitem', { name: 'Remove Ripple Effect' }).click()

    // Proven by what remains, not only by what is gone.
    await expect(stack.getByRole('button', { name: 'More actions for Vignette Effect' })).toBeVisible()
    await expect(stack.getByRole('button', { name: 'More actions for Ripple Effect' })).toHaveCount(0)
  })

  test('duplicates and reorders Effects through the overflow menu', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const stack = await openClipEffects(page, 'TestPattern1D')
    await addEffect(page, stack, 'ripple', 'Ripple')
    await addEffect(page, stack, 'swirl', 'Swirl')

    await stack.getByRole('button', { name: 'More actions for Ripple Effect' }).click()
    await page.getByRole('menuitem', { name: 'Duplicate Ripple Effect' }).click()
    const duplicate = stack.getByTestId('show-effect-ripple-2')
    await expect(duplicate).toBeVisible()

    await duplicate.getByRole('button', { name: 'More actions for Ripple Effect' }).click()
    await page.getByRole('menuitem', { name: 'Move Ripple Effect later' }).click()
    const distortionRows = stack.locator('[data-effect-stage="distort"]')
    await expect(distortionRows).toHaveCount(3)
    await expect.poll(() => distortionRows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid'))))
      .toEqual(['show-effect-ripple', 'show-effect-swirl', 'show-effect-ripple-2'])
  })

  // Transition coverage split by concern. The previous single test pinned the
  // catalogue at 35 entries and asserted against stringified persisted JSON
  // (`"starPoints":7`), so a storage rename broke it even when the behaviour
  // was intact (#638).

  test('changes a Transition family and keeps it after a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const panel = await openTransition(page)
    await chooseTransition(page, panel, 'star', 'Star')
    await expect(panel.getByRole('button', { name: /Star · Change/ })).toBeVisible()

    await page.reload()
    const reloaded = await openTransition(page)
    await expect(reloaded.getByRole('button', { name: /Star · Change/ })).toBeVisible()
  })

  test('keeps edited Transition parameters after a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const panel = await openTransition(page)
    await chooseTransition(page, panel, 'star', 'Star')
    // Millisecond model values present as seconds (#577), so the control is
    // labelled "Duration (s)" and 3400 ms is entered as 3.4.
    const duration = panel.getByRole('textbox', { name: /^Duration/ })
    await duration.fill('3.4')
    await duration.blur()
    const points = panel.getByRole('textbox', { name: /^Points/ })
    await points.fill('7')
    await points.blur()

    // Barrier, not oracle: showPersistenceQueues chains writes per Show, so a
    // second edit's PUT is not dispatched until the first resolves, and
    // page.reload() would discard it. Observe the persisted value before
    // navigating; the assertion after the reload stays on visible state.
    await waitForCurrentShow(page, (show) => (
      show.transitions?.[0]?.durationMs === 3400 && show.transitions[0].starPoints === 7
    ))

    await page.reload()
    const reloaded = await openTransition(page)
    await expect(reloaded.getByRole('textbox', { name: /^Duration/ })).toHaveValue('3.4')
    await expect(reloaded.getByRole('textbox', { name: /^Points/ })).toHaveValue('7')
  })

  test('browsing the Transition palette does not change the junction', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const panel = await openTransition(page)
    await expect(panel.getByRole('button', { name: /Crossfade · Change/ })).toBeVisible()
    await panel.getByRole('button', { name: /Crossfade · Change/ }).click()
    const palette = page.getByRole('dialog', { name: 'Choose Transition' })
    // Positive precondition: prove the palette rendered before asserting that
    // merely browsing it left the junction alone.
    await expect(palette.getByRole('button', { name: 'Use Star Transition' })).toBeVisible()
    await palette.getByRole('button', { name: 'Use Star Transition' }).hover()
    await page.keyboard.press('Escape')

    await expect(palette).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /Crossfade · Change/ })).toBeVisible()
  })

  test('creates and reloads a Portable output contract at desktop and narrow widths', async ({ page }) => {
    const seriousConsoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') seriousConsoleErrors.push(message.text())
    })
    await page.goto('studio/shows')
    await page.getByRole('button', { name: 'Add show' }).click()
    await page.getByRole('button', { name: 'New show' }).click()

    await expect(page.getByText('LED-resolution independent')).toBeVisible()
    await expect(page.getByText('Exact pixel and map identity')).toBeVisible()
    await page.getByRole('button', { name: 'Create Portable Show' }).click()
    await page.getByLabel('Show name').fill('Touring field')
    await page.getByLabel('Preview pixels').fill('1024')
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
    await page.getByRole('button', { name: 'Show properties' }).click()
    await expect(page.getByText('Portable · Resolution-independent 2D')).toBeVisible()
    await expect(page.getByText('Compatible 2D mapped surfaces at variable resolution.')).toBeVisible()
    await expect(page.getByLabel('Portable reference map')).toHaveValue('plane')
    await expect(page.getByLabel('Portable reference pixels')).toHaveValue('1024')
    await expect(page.getByText(/pixel ranges/i)).toHaveCount(0)

    await page.getByLabel('Portable reference map').selectOption('wide')
    await page.getByLabel('Portable reference pixels').fill('1536')
    await page.getByLabel('Portable reference pixels').blur()
    await page.getByRole('button', { name: 'Show properties' }).click()
    await page.getByRole('button', { name: 'Open Zones' }).click()
    await page.getByRole('button', { name: 'Open Zone Map' }).click()
    const portableZoneMap = page.getByRole('dialog', { name: 'Zone Map' })
    await portableZoneMap.getByRole('button', { name: 'Add Zone', exact: true }).click()
    await portableZoneMap.getByRole('button', { name: 'Add Zone', exact: true }).click()
    await portableZoneMap.getByRole('button', { name: 'Add Zone', exact: true }).click()
    await openZoneLayout(page, 'Default')
    // Adding Zones moves the definition off the one-zone operator: CONTEXT.md
    // pairs a Portable Zone Layout with an operator over its ordered Zones, so
    // three Zones on 'single' would be incoherent.
    await expect(page.getByLabel('Default routing mode')).not.toHaveValue('single')
    await page.getByLabel('Default routing mode').selectOption('grid-2x2')
    await waitForCurrentShow(page, (show) => (
      show.outputContract?.kind === 'portable-2d'
      && show.outputContract.referencePixelCount === 1536
      && show.outputContract.referenceMapId === 'wide'
      && show.routingLayouts[0]?.logical?.kind === 'grid'
    ))

    await page.reload()
    await page.getByRole('button', { name: 'Show properties' }).click()
    await expect(page.getByLabel('Portable reference map')).toHaveValue('wide')
    await expect(page.getByLabel('Portable reference pixels')).toHaveValue('1536')
    // Close Show properties first: its panel covers the Add menu (#694 path).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await openZoneLayout(page, 'Default')
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
    await page.getByRole('button', { name: 'Add show' }).click()
    await page.getByRole('button', { name: 'New show' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('No show selected')).toBeVisible()

    await page.getByRole('button', { name: 'Add show' }).click()
    await page.getByRole('button', { name: 'New show' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('No show selected')).toBeVisible()

    const response = await page.context().request.get('/api/shows')
    const { shows } = await response.json() as { shows: PersistedShow[] }
    expect(shows).toEqual([])
  })

  test('returns timeline focus after a discrete edit and supports keyboard preview, start, and five-second seek', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).first().click()
    await page.getByRole('combobox', { name: 'Source pattern' }).click()
    await page.getByRole('combobox', { name: 'Source pattern' }).fill('TestPattern2D')
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

  test('keeps Clip Transform values after a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await selectClip(page, 'TestPattern1D')
    await showClipTab(page, 'Place')
    const transform = page.getByRole('group', { name: 'Clip Transform' })
    await expect(transform).toBeVisible()
    await expect(transform.getByRole('application', { name: /Placement pad/ })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Clip placement' })).toHaveCount(0)

    const xSliderGrip = transform.locator('button[aria-label="Adjust with position slider"][title="Content X"]')
    await expect(xSliderGrip).toHaveCount(1)
    await xSliderGrip.click()
    await expect(page.getByRole('slider', { name: 'Position slider' })).toBeVisible()
    await page.getByRole('slider', { name: 'Position slider' }).press('Escape')

    await transform.getByRole('textbox', { name: 'Content X exact position' }).fill('0.25')
    await transform.getByRole('textbox', { name: 'Content X exact position' }).blur()
    await transform.getByRole('textbox', { name: 'Rotation exact rotation' }).fill('-90')
    await transform.getByRole('textbox', { name: 'Rotation exact rotation' }).blur()

    // Barrier, not oracle: showPersistenceQueues chains writes per Show, so a
    // second edit's PUT is not dispatched until the first resolves, and
    // page.reload() would discard it. Observe the persisted value before
    // navigating; the assertion after the reload stays on visible state.
    await waitForCurrentShow(page, (show) => show.composition?.scenes.some((scene) => (
      scene.zones?.some((zone) => zone.main?.some((placement) => (
        placement.transform?.positionX === 0.25 && placement.transform?.rotation === -0.25
      )))
    )) === true)

    await page.reload()
    await selectClip(page, 'TestPattern1D')
    await showClipTab(page, 'Place')
    const reloaded = page.getByRole('group', { name: 'Clip Transform' })
    await expect(reloaded.getByRole('textbox', { name: 'Content X exact position' })).toHaveValue('0.25')
    await expect(reloaded.getByRole('textbox', { name: 'Rotation exact rotation' })).toHaveValue('-90')
  })

  test('keeps a soft ellipse aperture after a reload (#591)', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await selectClip(page, 'TestPattern1D')
    await showClipTab(page, 'Place')
    // Selecting the Aperture summary enables the Viewport and focuses it.
    await page.getByRole('button', { name: 'Aperture summary' }).click()
    await page.getByLabel('Aperture shape').selectOption('ellipse')
    await expect(page.getByLabel('Aperture edge', { exact: true })).toHaveValue('soft')
    const width = page.getByRole('textbox', { name: 'Aperture edge width' })
    await width.fill('0.1')
    await width.blur()

    await waitForCurrentShow(page, (show) => show.composition?.scenes.some((scene) => (
      scene.zones?.some((zone) => zone.main?.some((placement) => (
        placement.viewport?.enabled === true
        && placement.viewport.aperture === 'ellipse'
        && placement.viewport.feather === 0.1
      )))
    )) === true)

    await page.reload()
    await selectClip(page, 'TestPattern1D')
    await showClipTab(page, 'Place')
    await page.getByRole('button', { name: 'Aperture summary' }).click()
    await expect(page.getByLabel('Aperture shape')).toHaveValue('ellipse')
    await expect(page.getByLabel('Aperture edge', { exact: true })).toHaveValue('soft')
    await expect(page.getByRole('textbox', { name: 'Aperture edge width' })).toHaveValue('0.1')
  })

  test('keeps the complete Place controls visible without any detail scrollbar', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await selectClip(page, 'TestPattern1D')
    await showClipTab(page, 'Playback')
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(panel).toHaveCSS('height', '360px')
    await showClipTab(page, 'Place')
    await expect(panel).toHaveAttribute('data-placement', /above|below/)
    await expect(panel).toHaveCSS('height', '496px')
    const transform = page.getByRole('group', { name: 'Clip Transform' })
    const content = transform.locator('[aria-label="Move content"]')
    const committedX = await content.getAttribute('x')

    await transform.locator('button[aria-label="Adjust with position slider"][title="Content X"]').click()
    const slider = page.getByRole('slider', { name: 'Position slider' })
    await slider.press('ArrowRight')
    await expect.poll(() => content.getAttribute('x')).not.toBe(committedX)
    await slider.press('Escape')

    await expect.poll(() => panel.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      scrollTop: element.scrollTop,
    }))).toEqual({ overflowY: 'hidden', scrollTop: 0 })

    const tabBody = page.locator('[role="tabpanel"][data-active-tab="place"]')
    const footer = transform.getByTestId('placement-pad-footer')
    const rotation = transform.getByRole('textbox', { name: 'Rotation exact rotation' })
    await expect(rotation).toBeVisible()
    await expect(footer).toBeVisible()
    expect(await tabBody.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      scrollTop: element.scrollTop,
      hasOverflow: element.scrollHeight > element.clientHeight,
    }))).toEqual({
      overflowY: 'hidden',
      scrollTop: 0,
      hasOverflow: false,
    })
    const panelBounds = await panel.boundingBox()
    const footerBounds = await footer.boundingBox()
    expect(panelBounds).not.toBeNull()
    expect(footerBounds).not.toBeNull()
    expect(footerBounds!.y + footerBounds!.height).toBeLessThanOrEqual(
      panelBounds!.y + panelBounds!.height,
    )
    expect(await panel.evaluate((element) => element.scrollTop)).toBe(0)

    await showClipTab(page, 'Effects')
    await page.getByRole('button', { name: 'Add Effect' }).click()
    const choices = page.getByTestId('show-effect-choice-list')
    await expect(choices).toBeVisible()
    expect(await choices.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))).toMatchObject({ overflowY: 'auto' })
    expect(await choices.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
      await choices.evaluate((element) => element.clientHeight),
    )
    expect(await panel.evaluate((element) => element.scrollTop)).toBe(0)
  })

  test('keeps inline placement aligned and usable at the panel floor', async ({ page }) => {
    // Layout is its own concern. Bundling it into the persistence test above
    // meant a broken field hid the layout regression and vice versa.
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await selectClip(page, 'TestPattern1D')
    await showClipTab(page, 'Place')
    const transform = page.getByRole('group', { name: 'Clip Transform' })
    await expect(transform).toBeVisible()
    const pad = transform.getByRole('application', { name: /Placement pad/ })
    const toolbar = transform.getByTestId('placement-pad-toolbar')
    const padFooter = transform.getByTestId('placement-pad-footer')
    const help = transform.getByRole('button', { name: 'Placement help' })
    const summary = transform.getByRole('button', { name: 'Aperture summary' })
    await expect(pad).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Clip placement' })).toHaveCount(0)

    const bounds = await transform.boundingBox()
    const padBounds = await pad.boundingBox()
    const toolbarBounds = await toolbar.boundingBox()
    const padFooterBounds = await padFooter.boundingBox()
    const helpBounds = await help.boundingBox()
    const summaryBounds = await summary.boundingBox()
    expect(bounds).not.toBeNull()
    expect(padBounds).not.toBeNull()
    expect(toolbarBounds).not.toBeNull()
    expect(padFooterBounds).not.toBeNull()
    expect(helpBounds).not.toBeNull()
    expect(summaryBounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
    expect(padBounds!.width).toBeGreaterThanOrEqual(155)
    expect(padBounds!.width).toBeLessThanOrEqual(228)
    expect(padFooterBounds!.y).toBeGreaterThanOrEqual(padBounds!.y + padBounds!.height)
    expect(Math.abs(toolbarBounds!.y - summaryBounds!.y)).toBeLessThanOrEqual(1)
    expect(helpBounds!.x + helpBounds!.width).toBeLessThanOrEqual(toolbarBounds!.x + toolbarBounds!.width + 1)

    const gutterRights = await transform.locator('[data-placement-suffix-gutter]').evaluateAll((gutters) => (
      gutters.map((gutter) => gutter.getBoundingClientRect().right)
    ))
    expect(gutterRights).toHaveLength(5)
    expect(Math.max(...gutterRights) - Math.min(...gutterRights)).toBeLessThanOrEqual(1)
    const panelBounds = await page.getByRole('dialog', { name: 'Entity Detail Panel' }).boundingBox()
    const gripBounds = await transform.locator('button[aria-label^="Adjust with"][title]').evaluateAll((grips) => (
      grips.map((grip) => {
        const bounds = grip.getBoundingClientRect()
        return {
          title: grip.getAttribute('title'),
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
        }
      })
    ))
    const gridBounds = await transform.getByTestId('clip-placement-grid').evaluate((grid) => ({
      columns: getComputedStyle(grid).gridTemplateColumns,
      rect: grid.getBoundingClientRect().toJSON(),
      children: [...grid.children].map((child) => child.getBoundingClientRect().toJSON()),
    }))
    expect(panelBounds).not.toBeNull()
    expect(gripBounds.map((grip) => grip.title)).toEqual([
      'Content X',
      'Content Y',
      'Content Width',
      'Content Height',
      'Rotation',
    ])
    expect(gripBounds.every((grip) => (
      grip.width > 0
      && grip.left >= panelBounds!.x
      && grip.right <= panelBounds!.x + panelBounds!.width
    )), JSON.stringify({ panelBounds, gripBounds, gridBounds })).toBe(true)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(8)

    await pad.focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
  })

  test('selects discontinuous Installation LED ranges on the saved 2D map at desktop and narrow widths', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)
    const openZonesRail = page.getByRole('button', { name: 'Open Zones' })
    if (await openZonesRail.count() > 0) await openZonesRail.click()
    await page.getByRole('button', { name: 'Open zone main properties' }).click()
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

    await openZoneLayout(page, 'Default')
    const ranges = page.getByLabel('Default main pixel ranges')
    await ranges.fill('0-199')
    await ranges.blur()
    await expect(page.getByText(/Default assigns 200 of 256 pixels \(56 missing\)/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'View code' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()

    await page.reload()
    await openZoneLayout(page, 'Default')
    await expect(page.getByLabel('Default main pixel ranges')).toHaveValue('0-199')
    await page.getByLabel('Default main pixel ranges').fill('0-255')
    await page.getByLabel('Default main pixel ranges').blur()

    // The invalid case also surfaces as a diagnostic banner, but the valid
    // coverage line exists only in the Show InspectorPanel. Close the layout
    // panel first: its right-side placement covers the header actions (#694).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Show properties' }).click()
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
    await page.getByRole('button', { name: 'Add show' }).click()
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
    await page.getByRole('button', { name: 'Show properties' }).click()
    await expect(page.getByText('4 px fixed')).toBeVisible()
    await expect(page.getByLabel('Show stage').getByText('Measured four')).toBeVisible()
  })

  test('keeps a Clip evaluation policy after a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await selectClip(page, 'TestPattern1D')
    await openAdvancedClipControls(page)
    await page.getByLabel('Clip evaluation').selectOption('freeze-at-entry')
    await expect(page.getByLabel('Clip evaluation')).toHaveValue('freeze-at-entry')

    await page.reload()
    await selectClip(page, 'TestPattern1D')
    await openAdvancedClipControls(page)
    await expect(page.getByLabel('Clip evaluation')).toHaveValue('freeze-at-entry')
  })

  test('authors every Clip detail tab in one pass and reloads (#658)', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    // One edit per tab against the same Clip. The per-facet reload tests above
    // cannot catch a later facet's write clobbering an earlier facet on the
    // shared placement or instance; this journey exists for that failure.
    await selectClip(page, 'TestPattern1D')
    const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    const speed = panel.getByRole('textbox', { name: 'Animation speed exact multiplier' })
    await speed.fill('2')
    await speed.blur()

    await showClipTab(page, 'Place')
    const transform = page.getByRole('group', { name: 'Clip Transform' })
    const contentX = transform.getByRole('textbox', { name: 'Content X exact position' })
    await contentX.fill('0.25')
    await contentX.blur()

    await showClipTab(page, 'Effects')
    const stack = panel.getByRole('region', { name: 'Clip Effects' })
    await expect(stack).toBeVisible()
    await addEffect(page, stack, 'ripple', 'Ripple')

    await openAdvancedClipControls(page)
    await page.getByLabel('Clip evaluation').selectOption('freeze-at-entry')

    // Barrier, not oracle: showPersistenceQueues chains writes per Show, so a
    // later edit's PUT is not dispatched until the earlier ones resolve, and
    // page.reload() would discard it. Observe all four persisted facets before
    // navigating; the assertions after the reload stay on visible state.
    await waitForCurrentShow(page, (show) => {
      const placement = show.composition?.scenes.flatMap((scene) => (
        scene.zones?.flatMap((zone) => zone.main ?? []) ?? []
      )).find((candidate) => candidate.transform?.positionX === 0.25)
      const instance = show.composition?.patternInstances
        ?.find((candidate) => candidate.patternName === 'TestPattern1D')
      return placement !== undefined
        && (placement.effects ?? []).some((effect) => effect.kind === 'ripple')
        && instance?.time?.timeScale === 2
        && instance?.evaluationPolicy === 'freeze-at-entry'
    })

    await page.reload()
    await selectClip(page, 'TestPattern1D')
    const reloaded = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(reloaded.getByRole('textbox', { name: 'Animation speed exact multiplier' }))
      .toHaveValue('2')
    await showClipTab(page, 'Place')
    await expect(page.getByRole('group', { name: 'Clip Transform' })
      .getByRole('textbox', { name: 'Content X exact position' })).toHaveValue('0.25')
    await showClipTab(page, 'Effects')
    await expect(reloaded.getByRole('button', { name: 'More actions for Ripple Effect' }))
      .toBeVisible()
    await openAdvancedClipControls(page)
    await expect(page.getByLabel('Clip evaluation')).toHaveValue('freeze-at-entry')
  })

  test('selects, edits, and reloads an appended Zone Layout interval from the timeline (#624)', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Add to Show' }).click()
    await page.getByRole('menuitem', { name: 'Zone Layout' }).click()
    const actions = page.getByRole('dialog', { name: 'Zone Layout at playhead' })
    // Append copies the layout under the playhead into a fresh definition
    // and places it (#694); the copy auto-names by kind.
    await actions.getByLabel('Layout interval duration in seconds exact time').fill('5')
    await actions.getByRole('button', { name: 'Append' }).click()

    const adjacentCrossfade = page.getByRole('button', { name: 'Edit crossfade Transition between TestPattern1D and CometLoom' })
    await adjacentCrossfade.click()
    await expect(page.getByRole('button', { name: /Crossfade · Change/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Select CometLoom' }).click()
    await page.getByRole('separator', { name: 'Resize CometLoom end' }).hover()

    const interval = page.getByRole('button', { name: 'Select Physical ranges routing interval 1' })
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

    await page.getByRole('button', { name: 'Select Physical ranges routing interval 1' }).click()
    await expect(page.getByLabel('Destination routing layout')).toHaveValue('layout-2')
    await expect(page.getByLabel('Routing transfer duration seconds exact time')).toHaveValue('2')
    await expect(page.getByLabel('Routing transfer easing')).toHaveValue('ease-in-out')
    await expect(page.getByLabel('Routing transfer direction')).toHaveValue('reverse')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'View code' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
  })

  test('authors, reloads, compiles, and removes a shared moving-split property (#623)', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)
    await page.getByRole('button', { name: 'Open Zones' }).click()
    await page.getByRole('button', { name: 'Open Zone Map' }).click()
    await page.getByRole('dialog', { name: 'Zone Map' }).getByRole('button', { name: 'Add Zone', exact: true }).click()
    await openZoneLayout(page, 'Default')
    await page.getByLabel('Default routing mode').selectOption('split-x')
    // Escape peels exactly one layer per press, topmost first (#672): the
    // Entity Detail panel, then the Zone Layout selection (the editor
    // confirms by focusing the timeline). Opening the inspector through the
    // Add menu dismissed the Zone Map already (#694).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeFocused()
    await page.getByRole('button', { name: 'Close Zones' }).click()
    await expect(page.getByRole('group', { name: 'Zone Layouts lane' })).toBeVisible()

    await page.getByRole('button', { name: /^Edit split position at / }).click()
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
    await openZoneLayout(page, 'Default')
    await expect(page.getByLabel('Default routing mode')).toHaveValue('split-x')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: 'Show timeline' })).toBeFocused()
    await page.getByRole('button', { name: /^Edit split position at / }).click()
    await page.getByText('Advanced transition controls').click()
    await expect(page.getByLabel('Animate split position')).toBeChecked()
    await expect(page.getByLabel('Split position start')).toHaveValue('0.2')
    await expect(page.getByLabel('Split position duration seconds exact time')).toHaveValue('1.2')
    await expect(page.getByLabel('Split position easing')).toHaveValue('ease-in-out')
    // Close the transition Detail panel before reaching for the header: its
    // anchored placement can cover the View code button and intercept the
    // click (#683).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'View code' }).click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
    await page.getByRole('button', { name: 'Back to show' }).click()

    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByRole('group', { name: 'Zone Layouts lane' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Edit split position at / })).toBeVisible()
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(pageOverflow.scrollWidth - pageOverflow.clientWidth).toBeLessThanOrEqual(8)

    await page.getByRole('button', { name: /^Edit split position at / }).click()
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Animate split position').uncheck()
    await waitForCurrentShow(page, (show) => (
      show.transitions?.[0]?.propertyTransitions?.routing?.splitPosition === undefined
    ))
  })

  test('authors and reloads transition-scoped sample repeat tiling (#654)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    let panel = await openTransition(page)
    await panel.getByText('Advanced transition controls').click()
    const animateRepeatScale = panel.getByLabel('Animate repeat scale')
    await expect(animateRepeatScale).toBeVisible()
    await animateRepeatScale.check()

    const repeatLane = page.getByRole('group', { name: 'Sample repeat lane' })
    await expect(repeatLane).toBeVisible()
    await expect(repeatLane.getByRole('button', { name: /^Edit repeat scale at / })).toContainText('1x→1x')

    await panel.getByLabel('Repeat scale start exact multiplier').fill('2x')
    await panel.getByLabel('Repeat scale start exact multiplier').press('Tab')
    await panel.getByLabel('Repeat scale duration seconds exact time').fill('0.8')
    await panel.getByLabel('Repeat scale duration seconds exact time').press('Tab')
    await panel.getByLabel('Repeat scale easing').selectOption('ease-in-out')

    await waitForCurrentShow(page, (show) => {
      const descriptor = show.transitions?.[0]?.propertyTransitions?.sample?.repeatScale
      return descriptor?.from === 2
        && descriptor.durationMs === 800
        && showEasingId(descriptor.easing) === 'ease-in-out'
    })

    await page.reload()

    panel = await openTransition(page)
    await panel.getByText('Advanced transition controls').click()
    await expect(panel.getByLabel('Animate repeat scale')).toBeChecked()
    await expect(panel.getByLabel('Repeat scale start exact multiplier')).toHaveValue('2')
    await expect(panel.getByLabel('Repeat scale duration seconds exact time')).toHaveValue('0.8')
    await expect(panel.getByLabel('Repeat scale easing')).toHaveValue('ease-in-out')
    await expect(page.getByRole('group', { name: 'Sample repeat lane' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Edit repeat scale at / })).toContainText('2x→1x')
  })

  test('drafts, authors, and reloads a per-parameter Property animation (#648)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).click()
    const clipPanel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    const diamond = clipPanel.getByRole('button', { name: 'Animate Brightness' })
    await expect(diamond).toBeVisible()
    await diamond.click()
    const popover = page.getByRole('dialog', { name: 'Brightness animation' })
    await expect(popover.getByRole('textbox', { name: 'Brightness animation from time exact time' })).toHaveValue('0')
    await expect(popover.getByRole('textbox', { name: 'Brightness animation to time exact time' })).toHaveValue('30')
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(clipPanel).toBeVisible()
    await waitForCurrentShow(page, (show) => !show.composition?.scenes[0]?.propertyTracks?.length)

    await diamond.click()
    const from = page.getByRole('textbox', { name: 'Brightness animation from exact percentage' })
    await from.fill('60%')
    await from.blur()
    await waitForCurrentShow(page, (show) => {
      const track = show.composition?.scenes[0]?.propertyTracks?.[0]
      return track?.target.kind === 'placement-view'
        && track.target.property === 'brightness'
        && track.keyframes[0]?.timeMs === 0
        && track.keyframes[0]?.value === 0.6
        && track.keyframes[1]?.timeMs === 30_000
    })
    await expect(clipPanel.getByRole('button', { name: 'Edit Brightness animation' }))
      .toHaveAttribute('data-animated', 'true')

    await page.reload()
    await page.getByRole('button', { name: 'Select TestPattern1D' }).click()
    await page.getByRole('button', { name: 'Edit Brightness animation' }).click()
    await expect(page.getByRole('textbox', { name: 'Brightness animation from exact percentage' }))
      .toHaveValue('60')
  })

  test('reloads, navigates, and removes a Scene-local animation through the overview (#490, #649)', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 900 })
    await page.goto('studio/shows')
    await createInstallationShow(page)

    await page.getByRole('button', { name: 'Select TestPattern1D' }).click()
    const clipPanel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await expect(clipPanel.getByRole('region', { name: 'Clip properties' })).toBeVisible()
    await clipPanel.getByRole('button', { name: 'Animate Brightness' }).click()
    await page.getByRole('textbox', { name: 'Brightness animation to exact percentage' }).fill('42%')
    await page.getByRole('textbox', { name: 'Brightness animation to exact percentage' }).blur()
    await page.getByRole('combobox', { name: 'Brightness animation easing' }).selectOption('steps-4-end')

    await waitForCurrentShow(page, (show) => {
      const track = show.composition?.scenes[0]?.propertyTracks?.[0]
      return track?.target.kind === 'placement-view'
        && track.target.property === 'brightness'
        && track.keyframes[1]?.value === 0.42
        && typeof track.keyframes[0]?.easing === 'object'
        && track.keyframes[0].easing.curve === 'steps'
    })

    await page.reload()
    await page.getByRole('button', { name: 'Select TestPattern1D' }).click()
    const reloadedPanel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    await reloadedPanel.getByRole('button', { name: 'Animations — 1' }).click()
    const overview = reloadedPanel.getByRole('region', { name: 'Animations overview' })
    const brightness = overview.getByRole('group', { name: 'Brightness animation summary' })
    await expect(brightness).toContainText('100% → 42%')
    await expect(brightness).toContainText('0s → 30s')
    await expect(brightness).toContainText('Header')

    await brightness.getByRole('button', { name: 'Go to Brightness field' }).click()
    await expect(reloadedPanel.getByRole('textbox', { name: 'Brightness exact percentage' })).toBeFocused()

    await reloadedPanel.getByRole('button', { name: 'Animations — 1' }).click()
    await reloadedPanel.getByRole('button', { name: 'Remove Brightness animation' }).click()
    await waitForCurrentShow(page, (show) => !show.composition?.scenes[0]?.propertyTracks?.length)
    await expect(reloadedPanel.getByRole('button', { name: /^Animations/ })).toHaveCount(0)
  })

  // Split from one test whose oracle read the persisted transition record,
  // including a clause asserting the previous family's parameters were cleared
  // to undefined. The user-facing promise is that each family shows its own
  // parameters and none of the others; assert that instead (#638).

  test('swaps its parameters when the Transition family changes', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const panel = await openTransition(page)
    await chooseTransition(page, panel, 'diamond', 'Diamond')
    const rotation = panel.getByRole('textbox', { name: 'Rotation exact rotation' })
    const spin = panel.getByRole('textbox', { name: 'Spin exact turns' })
    const ringWidth = panel.getByRole('textbox', { name: 'Ring width', exact: true })
    await expect(rotation).toBeVisible()
    await expect(spin).toBeVisible()
    await expect(ringWidth).toHaveCount(0)

    await chooseTransition(page, panel, 'ring', 'Ring')
    await expect(ringWidth).toBeVisible()
    await expect(rotation).toHaveCount(0)
    await expect(spin).toHaveCount(0)
  })

  test('keeps a spatial Transition parameter after a reload', async ({ page }) => {
    await page.goto('studio/shows')
    await createInstallationShow(page)

    const panel = await openTransition(page)
    await chooseTransition(page, panel, 'ring', 'Ring')
    await page.getByLabel('Ring width').fill('0.2')
    await page.getByLabel('Ring width').blur()

    // Barrier, not oracle: the write must land before the reload discards it.
    await waitForCurrentShow(page, (show) => show.transitions?.[0]?.ringWidth === 0.2)

    await page.reload()
    const reloaded = await openTransition(page)
    await expect(reloaded.getByRole('button', { name: /Ring · Change/ })).toBeVisible()
    await expect(page.getByLabel('Ring width')).toHaveValue('0.2')
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
    patternInstances?: Array<{
      id: string
      patternName: string
      time?: { timeScale: number }
      evaluationPolicy?: string
    }>
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
          viewport?: { enabled: boolean; aperture?: string; edge?: string; feather?: number }
        effects?: Array<{ id: string; kind: string; amount?: number; frequency?: number }>
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

/**
 * Zone Layout definitions live in the Zone Map, reached from the Zone rail, and
 * are edited in the Entity Detail panel (#629).
 */
/** The Clip detail body is tabbed (#642); reach a facet by its tab. */
async function showClipTab(page: Page, name: 'Pattern' | 'Place' | 'Effects' | 'Playback'): Promise<void> {
  await page.getByRole('dialog', { name: 'Entity Detail Panel' })
    .getByRole('tab', { name: new RegExp(`^${name}`) }).click()
}

/** Evaluation policy and the other presentation fields live on the Playback tab. */
async function openAdvancedClipControls(page: Page): Promise<void> {
  await showClipTab(page, 'Playback')
  await expect(page.getByLabel('Clip evaluation')).toBeVisible()
}

/** Select a Clip so its detail panel exists before anything asserts against it. */
async function selectClip(page: Page, patternName: string): Promise<void> {
  await page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeVisible()
}

/**
 * Open the first Clip junction and return its detail panel. The junction label
 * carries both Clip identities and the current kind, so match on shape rather
 * than pinning either.
 */
async function openTransition(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Edit .* Transition between / }).first().click()
  const panel = page.getByRole('dialog', { name: 'Entity Detail Panel' })
  await expect(panel).toBeVisible()
  return panel
}

/** Choose a Transition family through the palette, searching by name. */
async function chooseTransition(page: Page, panel: Locator, query: string, label: string): Promise<void> {
  await panel.getByRole('button', { name: /· Change/ }).click()
  const palette = page.getByRole('dialog', { name: 'Choose Transition' })
  await palette.getByRole('searchbox', { name: 'Search Transitions' }).fill(query)
  await palette.getByRole('button', { name: `Use ${label} Transition` }).click()
  await expect(palette).toHaveCount(0)
}

/**
 * Select a Clip and return its Effects stack. Selecting is a precondition for
 * the stack existing at all, so callers cannot assert against a detached panel.
 */
async function openClipEffects(page: Page, patternName: string): Promise<Locator> {
  await page.getByRole('button', { name: `Select ${patternName}`, exact: true }).first().click()
  await showClipTab(page, 'Effects')
  const stack = page.getByRole('dialog', { name: 'Entity Detail Panel' })
    .getByRole('region', { name: 'Clip Effects' })
  await expect(stack).toBeVisible()
  return stack
}

/** Add one Effect through the palette, searching by name rather than position. */
async function addEffect(page: Page, stack: Locator, query: string, label: string): Promise<void> {
  await stack.getByRole('button', { name: 'Add Effect' }).click()
  const palette = page.getByRole('region', { name: 'Add Effect' })
  await palette.getByRole('searchbox', { name: 'Search Effects' }).fill(query)
  await palette.getByRole('button', { name: `Add ${label} Effect` }).click()
  await expect(palette).toHaveCount(0)
}

// The rail toggle and map control render only after the Show editor loads,
// which can lag a goto or reload under full-suite parallel load. The bare
// count() checks below decide whether a step is needed; without first waiting
// for whichever control currently applies, they race that render and silently
// skip the step (#683).
async function awaitZoneRailControls(page: Page): Promise<void> {
  const openZones = page.getByRole('button', { name: 'Open Zones' })
  const openMap = page.getByRole('button', { name: 'Open Zone Map' })
  const zoneMap = page.getByRole('dialog', { name: 'Zone Map' })
  await expect(openZones.or(openMap).or(zoneMap).first()).toBeVisible()
}

async function openZoneLayout(page: Page, layoutName: string): Promise<void> {
  // Layouts are per-interval (#694): the inspector opens from the Add menu's
  // Edit link for the interval under the playhead.
  await page.getByRole('button', { name: 'Add to Show' }).click()
  await page.getByRole('menuitem', { name: 'Zone Layout' }).click()
  void layoutName
  await page.getByRole('button', { name: "Open this interval's Zone Layout" }).click()
}

async function createInstallationShow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)
}

// The 'Timeline zoom' slider was retired with the 2.0 timeline; zoom is now
// Ctrl/Meta + wheel around the playhead, 1.25x per notch (ShowEditor.tsx).
async function zoomTimeline(page: Page, notches: number): Promise<void> {
  await page.getByTestId('show-timeline-scroll-region').hover()
  await page.keyboard.down('Control')
  for (let index = 0; index < notches; index += 1) await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
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
