import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures/authenticated'
import { convertibleV1Show } from '../src/test/showV2TracerFixture'

// Persisted synthetic bytes exercise native hydration without importing Vite raw modules.
const native = JSON.parse(readFileSync(new URL('./fixtures/showV2PreparedStage.json', import.meta.url), 'utf8'))

test('native prepared Stage retains hold/Restart and later Layout through fidelity, playback and narrow controls', async ({ page }) => {
  const pattern = { id: 'prepared-stage-pattern', name: 'Stage Voice', src: 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 }
  const map = { id: 'prepared-stage-map', name: 'Stage Grid', dim: 2, generator: 'custom', params: {}, points: Array.from({ length: 256 }, (_, i) => [(i % 16) / 15, Math.floor(i / 16) / 15]), normalizeMode: 'contain', updatedAt: 1 }
  const source = convertibleV1Show()
  source.id = native.id
  source.name = native.name
  for (const [resource, value] of [['patterns', pattern], ['maps', map], ['shows', source]] as const) {
    const created = await page.request.post(`/api/${resource}`, { data: value })
    expect(created.ok(), await created.text()).toBe(true)
  }
  const saved = await page.request.put(`/api/shows/${source.id}?show-version=2`, { data: native })
  expect(saved.ok(), await saved.text()).toBe(true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`studio/shows/${source.id}?show-v2-pilot=1&capture`)
  const stage = page.getByTestId('show-stage-preview')
  await expect(stage).toBeVisible()
  await expect(stage).toContainText('Stage Grid')
  const route = page.getByTestId('show-v2-route-pilot')
  const markers = route.getByTestId('show-v2-markers')
  let markerWrites = 0
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/api/shows/${source.id}?show-version=2`)) markerWrites++ })
  await markers.getByRole('button', { name: 'Add Marker' }).click()
  await expect(route.getByText('Marker saved.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker', { exact: true })).toHaveValue('marker:1')
  expect(markerWrites).toBe(1)
  const commitMarker = async (label: string, value: string) => {
    await markers.getByLabel(label, { exact: true }).fill(value)
    await markers.getByLabel(label, { exact: true }).press('Enter')
    await expect(markers.getByRole('button', { name: 'Add Marker' })).toBeEnabled()
  }
  await commitMarker('Marker name', 'Held guide')
  await commitMarker('Marker time', '45000')
  await commitMarker('Marker color', '#ffaa00')
  expect(markerWrites).toBe(4)
  await commitMarker('Marker time', '45000')
  expect(markerWrites).toBe(4)
  await commitMarker('Marker time', '0.5')
  await expect(route.getByText('Marker time must be nonnegative safe integer milliseconds.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker time')).toHaveValue('45000')
  expect(markerWrites).toBe(4)
  await route.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(route.getByText('Undo saved.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker color')).toHaveValue('')
  await route.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(route.getByText('Redo saved.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker color')).toHaveValue('#ffaa00')
  expect(markerWrites).toBe(6)
  await route.getByRole('button', { name: 'Reload saved v2' }).click()
  await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible()
  await expect(markers.getByLabel('Marker', { exact: true })).toHaveValue('marker:1')
  await expect(markers.getByLabel('Marker name')).toHaveValue('Held guide')
  await expect(markers.getByLabel('Marker time')).toHaveValue('45000')
  await markers.getByRole('button', { name: 'Remove Marker' }).click()
  await expect(route.getByText('Marker saved.', { exact: true })).toBeVisible()
  expect(markerWrites).toBe(7)
  await page.getByRole('button', { name: 'Reopen artifacts' }).click()
  await expect(page.getByTestId('show-v2-route-pilot')).toContainText(/Reopened \.pxlshow v2 and \.epe/)
  await page.waitForFunction(() => Boolean(window.__pxlblzShow))
  expect(await page.evaluate(() => window.__pxlblzShow!.loopDurationMs())).toBe(31_000)
  await stage.getByRole('button', { name: 'Pause Show preview' }).click()
  for (const mode of ['Fast', 'Precise'] as const) {
    if (mode === 'Precise') {
      await stage.getByRole('button', { name: 'Renderer', exact: true }).click()
      await page.getByRole('option', { name: 'Precise', exact: true }).click()
      await expect(stage).toContainText('Precise')
    }
    // Existing transport reset/pre-roll/live path runs beyond hold and Restart into later Layout.
    const capture = await page.evaluate(prefix => window.__pxlblzShow!.captureSequence({ frames: 2, fps: 8, startMs: 17_000, prefix }), `prepared-stage-${mode.toLowerCase()}`)
    expect(capture.failures).toEqual([])
    expect(capture.names).toHaveLength(2)
  }
  await expect(stage.getByRole('button', { name: /Solo zone|Show Zone outlines|Show Selected Clip outline/ })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('studio-drawer-layout')).not.toHaveAttribute('data-drawer-mode', 'pinned')
  await page.mouse.move(380, 800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden()
  await stage.scrollIntoViewIfNeeded()
  await expect(stage.getByRole('button', { name: 'Play Show preview' })).toBeVisible()
  const overflow = await stage.evaluate(root => [...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
  }).map(element => element.getAttribute('aria-label') || element.textContent))
  expect(overflow).toEqual([])
})
