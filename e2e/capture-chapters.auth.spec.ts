// UI proof captures for #1040's chapter projections, run through
// `npm run capture:chapters`. Drives the Gallery band, a Show's reading card
// and the v2 pilot Marker panel and screenshots each under .wrsp/ui-proof.
// Not a gate: it exists so the review proof is the route actually driven.
import { expect, test } from './fixtures/authenticated'
import { convertibleV1Show } from '../src/test/showV2TracerFixture'

test('captures the Gallery band and the Show reading card chapters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto('gallery')
  const band = page.getByRole('button', { name: /, a Show$/ }).first()
  await expect(band).toBeVisible()
  await expect(page.getByTestId('gallery-show-facts').first()).toBeVisible()
  // Let the nearest bands go live so the chapter caption has painted.
  await band.hover()
  await expect(page.getByTestId('gallery-live-chapter').first()).not.toBeEmpty({ timeout: 15_000 })
  await page.screenshot({ path: '.wrsp/ui-proof/1040-chapters-gallery.png' })

  await page.goto('s/overture-installation')
  await expect(page.getByTestId('show-detail-stage')).toBeVisible()
  await expect(page.getByTestId('show-detail-chapters').locator('li')).toHaveCount(4)
  await expect(page.getByTestId('gallery-live-chapter')).not.toBeEmpty({ timeout: 15_000 })
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: '.wrsp/ui-proof/1040-chapters-reading-card.png' })
})

test('captures the pilot Marker panel chapter projection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const source = convertibleV1Show()
  source.id = 'chapter-capture-synthetic'
  source.name = 'Chapter Capture'
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 10_000 },
    { id: 'scene-b', name: 'Middle', durationMs: 10_000 },
    { id: 'scene-c', name: 'Finale', durationMs: 10_000 },
  ]
  source.composition!.durationMs = 30_000
  const zone = source.composition!.scenes[0].zones[0]
  zone.main[0].durationMs = 10_000
  source.composition!.scenes = [
    source.composition!.scenes[0],
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', overlays: [], main: [{ ...zone.main[0], id: 'clip-b' }] }] },
    { sceneId: 'scene-c', zones: [{ zoneId: 'zone', overlays: [], main: [{ ...zone.main[0], id: 'clip-c' }] }] },
  ]
  source.composition!.markers = [
    { id: 'authored-middle', timeMs: 10_000, name: 'Middle', color: '#f97316' },
    { id: 'camera-cue', timeMs: 10_000, name: 'Camera cue' },
  ]
  const created = await page.request.post('/api/shows', { data: source })
  expect(created.ok(), await created.text()).toBe(true)

  await page.goto(`studio/shows/${source.id}?show-v2-pilot=1`)
  const markers = page.getByTestId('show-v2-route-pilot').getByTestId('show-v2-markers')
  await expect(markers.getByTestId('show-v2-chapters').getByRole('listitem')).toHaveCount(3)
  await markers.scrollIntoViewIfNeeded()
  await markers.screenshot({ path: '.wrsp/ui-proof/1040-chapters-pilot.png' })
})
