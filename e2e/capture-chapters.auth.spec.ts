// UI proof capture for #1040's v2 pilot chapter projection. Drives the real
// pilot route with a converted multi-Scene Show and screenshots the Marker
// panel. Not a gate: it exists so the review proof is the route actually driven.
import { expect, test } from './fixtures/authenticated'
import { convertibleV1Show } from '../src/test/showV2TracerFixture'

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
