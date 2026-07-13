import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'

test.describe('authenticated Show authoring', () => {
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
    await page.getByLabel('Transition kind').selectOption('wipe')
    await page.getByLabel('Transition easing').selectOption('ease-in-out')
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Animate time for main').check()
    await page.getByLabel('Time scale target main').fill('0.25')

    await waitForCurrentShow(page, (show) => (
      show.transitions?.[0]?.kind === 'wipe'
      && show.transitions[0].easing === 'ease-in-out'
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
        && transition.easing === 'ease-in-out'
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
      && show.transitions[0].propertyTransitions.routing.splitPosition.easing === 'ease-in-out'
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
      && show.transitions[0].propertyTransitions.sample.repeatScale.easing === 'ease-in-out'
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
    await page.getByLabel('Transition kind').selectOption('portal')
    await page.getByText('Advanced transition controls').click()
    await page.getByLabel('Spatial shape').selectOption('diamond')
    await page.getByLabel('Rotation turns').fill('0.125')
    await page.getByLabel('Spin turns').fill('1')
    await expect(page.getByLabel('Ring width')).toHaveCount(0)

    await waitForCurrentShow(page, (show) => show.transitions?.some((transition) => (
      transition.kind === 'portal'
      && transition.shape === 'diamond'
      && transition.rotation === 0.125
      && transition.spin === 1
    )) ?? false)

    await page.getByLabel('Spatial shape').selectOption('ring')
    await expect(page.getByLabel('Rotation turns')).toHaveCount(0)
    await expect(page.getByLabel('Spin turns')).toHaveCount(0)
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
    await page.getByText('Advanced transition controls').click()
    await expect(page.getByLabel('Spatial shape')).toHaveValue('ring')
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
    sceneId: string
    patternName: string
    restartOnEntry?: boolean
    adaptations: { timeScale: number }
  }>
  transitions?: Array<{
    kind: string
    durationMs: number
    easing: string
    routingDirection?: string
    shape?: string
    rotation?: number
    spin?: number
    ringWidth?: number
    propertyTransitions?: {
      timeScale?: unknown
      routing?: { splitPosition?: { from: number; durationMs: number; easing: string } }
      sample?: { repeatScale?: { from: number; durationMs: number; easing: string } }
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
