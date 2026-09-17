// Chapter Marker projection on the opt-in v2 pilot route (#1040). Conversion
// turns former Scene labels into chapter Markers, absorbs a pre-existing
// same-name/time Marker instead of duplicating it, and leaves general Markers
// general. The route projects chapters read-only and never authors a role.
import { expect, test } from './fixtures/authenticated'
import { convertibleV1Show } from '../src/test/showV2TracerFixture'

function chapterRouteShow() {
  const source = convertibleV1Show()
  source.id = 'chapter-route-synthetic'
  source.name = 'Chapter Route'
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
  // An authored Marker that already names the second Scene at its exact start
  // is absorbed; the alignment cue beside it stays general-purpose.
  source.composition!.markers = [
    { id: 'authored-middle', timeMs: 10_000, name: 'Middle', color: '#f97316' },
    { id: 'camera-cue', timeMs: 10_000, name: 'Camera cue' },
  ]
  return source
}

test('converted Scene labels project as ordered chapters and general Markers stay general', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const source = chapterRouteShow()
  const created = await page.request.post('/api/shows', { data: source })
  expect(created.ok(), await created.text()).toBe(true)

  await page.goto(`studio/shows/${source.id}?show-v2-pilot=1`)
  const route = page.getByTestId('show-v2-route-pilot')
  await expect(route).toBeVisible()
  const markers = route.getByTestId('show-v2-markers')
  const chapters = markers.getByTestId('show-v2-chapters')

  // Three chapters, ordered by time; the authored Marker carries the second one
  // and the same-time alignment cue is absent from the projection.
  await expect(chapters.getByRole('listitem')).toHaveCount(3)
  await expect(chapters.getByRole('listitem')).toHaveText([
    'Opening0 ms', 'Middle10000 ms', 'Finale20000 ms',
  ])
  await expect(markers.getByRole('option')).toHaveCount(4)

  // The absorbed chapter kept its authored identity and colour.
  await markers.getByLabel('Marker', { exact: true }).selectOption('authored-middle')
  await expect(markers.getByLabel('Marker color')).toHaveValue('#f97316')

  // Renaming it through the general Marker owner keeps the chapter role.
  await markers.getByLabel('Marker name', { exact: true }).fill('Second movement')
  await markers.getByLabel('Marker name', { exact: true }).press('Enter')
  await expect(route.getByText('Marker saved.', { exact: true })).toBeVisible()
  await expect(chapters.getByRole('listitem')).toHaveText([
    'Opening0 ms', 'Second movement10000 ms', 'Finale20000 ms',
  ])

  // An added Marker is general: the projection does not grow.
  await markers.getByRole('button', { name: 'Add Marker' }).click()
  await expect(route.getByText('Marker saved.', { exact: true })).toBeVisible()
  await expect(chapters.getByRole('listitem')).toHaveCount(3)

  // The role survives the round trip through saved v2 bytes.
  await route.getByRole('button', { name: 'Reload saved v2' }).click()
  await expect(route.getByText('Reloaded v2 bytes from the provider.', { exact: true })).toBeVisible()
  await expect(chapters.getByRole('listitem')).toHaveText([
    'Opening0 ms', 'Second movement10000 ms', 'Finale20000 ms',
  ])
  const stored = await page.request.get('/api/shows?show-version=2')
  expect(stored.ok()).toBe(true)
  const { shows } = await stored.json()
  const saved = shows.find((show: { id: string }) => show.id === source.id)
  expect(saved.composition.markers.filter((marker: { role?: string }) => marker.role === 'chapter')).toHaveLength(3)
  expect(saved.composition.markers.find((marker: { id: string }) => marker.id === 'camera-cue')).not.toHaveProperty('role')

  // Narrow width keeps the chapter list readable and inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.keyboard.press('Escape')
  await chapters.scrollIntoViewIfNeeded()
  await expect(chapters.getByRole('listitem').first()).toBeVisible()
  const overflows = await chapters.evaluate(root => [...root.querySelectorAll<HTMLElement>('li')]
    .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
    .map(element => element.textContent))
  expect(overflows).toEqual([])
})
