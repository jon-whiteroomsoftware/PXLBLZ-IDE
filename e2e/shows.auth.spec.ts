import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'

test.describe('authenticated Show authoring', () => {
  test('repairs an empty clip slot, splits at the playhead, and persists Restart', async ({ page }) => {
    await page.goto('studio/shows')
    await page.getByRole('button', { name: 'New show' }).click()

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
    await page.getByRole('button', { name: 'New show' }).click()

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

    await page.getByRole('button', { name: 'View generated pattern' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to show' })).toBeVisible()
  })

  test('authors and reloads a named routing layout switch', async ({ page }) => {
    await page.goto('studio/shows')
    await page.getByRole('button', { name: 'New show' }).click()

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

  test('authors shape-aware diamond and ring spatial transitions', async ({ page }) => {
    await page.goto('studio/shows')
    await page.getByRole('button', { name: 'New show' }).click()
    await page.getByLabel('Stage map').selectOption('plane')
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
    await page.getByRole('button', { name: 'View generated pattern' }).first().click()
    await expect(page.getByText('Generated pattern - Untitled Show')).toBeVisible()
  })
})

type PersistedShow = {
  id: string
  scenes: Array<{ name: string; durationMs: number }>
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
    propertyTransitions?: { timeScale?: unknown }
  }>
  routingLayouts: Array<{
    name: string
    zones: Array<{ ranges: Array<{ start: number; end: number }> }>
  }>
  routingSwitches: Array<{ afterSceneId: string; layoutId: string }>
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
