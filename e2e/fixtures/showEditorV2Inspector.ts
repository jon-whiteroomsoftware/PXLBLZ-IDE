import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'

/**
 * A stored v2 record for the ordinary editor route's Clip inspector: one
 * ordinary Clip that restarts its shared Pattern instance on entry, two held
 * Group Clip uses of the same instance, and an animated instance control the
 * replacement Pattern does not export.
 */
export const inspectorRecord: ShowRecordV2 = JSON.parse(
  readFileSync(new URL('./showEditorV2Inspector.json', import.meta.url), 'utf8'),
)

export const inspectorPatterns = [
  {
    id: 'inspector-voice',
    name: 'Inspector Voice',
    src: 'export var elapsed=0;var level=.4;var lost=.2;export function sliderGain(v){level=v}export function sliderLost(v){lost=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,lost,.1+.6*y)}',
    controls: {},
    updatedAt: 1,
  },
  {
    id: 'inspector-other',
    name: 'Inspector Other',
    src: 'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(.1+.6*x,level,.1+.6*y)}',
    controls: {},
    updatedAt: 1,
  },
]

/** Seed the row, its Patterns and the stored v2 bytes, then open the ordinary route. */
export async function openShowEditorV2Inspector(page: Page) {
  const legacy = convertibleV1Show()
  legacy.id = inspectorRecord.id
  legacy.name = inspectorRecord.name
  for (const pattern of inspectorPatterns) {
    const created = await page.request.post('/api/patterns', { data: pattern })
    expect(created.ok(), await created.text()).toBe(true)
  }
  const row = await page.request.post('/api/shows', { data: legacy })
  expect(row.ok(), await row.text()).toBe(true)
  const seeded = await page.request.put(`/api/shows/${legacy.id}?show-version=2`, { data: inspectorRecord })
  expect(seeded.ok(), await seeded.text()).toBe(true)

  const writes: string[] = []
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes(`/api/shows/${legacy.id}?show-version=2`)) {
      writes.push(request.url())
    }
  })
  await page.goto(`studio/shows/${legacy.id}?show-v2-editor=1&capture`)

  const readSaved = async (): Promise<ShowRecordV2> => {
    const response = await page.request.get('/api/shows?show-version=2')
    expect(response.ok()).toBe(true)
    const saved = (await response.json()).shows.find((candidate: ShowRecordV2) => candidate.id === legacy.id)
    expect(saved).toBeDefined()
    return saved
  }
  return { showId: legacy.id, inspector: page.getByTestId('show-clip-inspector-v2'), readSaved, writes }
}
