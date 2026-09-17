import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'

/**
 * The stored v2 record the animation route spec drives: one Show-owned Property
 * track with a nonlinear curve, two linked Group occurrences sharing the
 * ordinary runtime, two Layout occurrences, and a dormant Marker beyond Show
 * End. It is the same fixture the component and artifact sequences use, so the
 * route and the owners are judged on one record.
 *
 * The bytes are committed rather than imported from
 * `src/test/showV2EditorSequenceFixture.ts`, because the Playwright loader
 * cannot resolve the engine's schema dependency.
 * `showV2EditorSequenceFixture.test.ts` keeps the two identical.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./showEditorV2Animation.json', import.meta.url), 'utf8'),
) as { record: ShowRecordV2; patterns: Array<{ id: string; name: string; src: string; controls: Record<string, never>; updatedAt: number }> }

export const animationRecord = fixture.record
export const animationPatterns = fixture.patterns

/** Seed the row, its Pattern and the stored v2 bytes, then open the ordinary route. */
export async function openShowEditorV2Animation(page: Page) {
  const legacy = convertibleV1Show()
  legacy.id = animationRecord.id
  legacy.name = animationRecord.name
  for (const pattern of animationPatterns) {
    const created = await page.request.post('/api/patterns', { data: pattern })
    expect(created.ok(), await created.text()).toBe(true)
  }
  const row = await page.request.post('/api/shows', { data: legacy })
  expect(row.ok(), await row.text()).toBe(true)
  const seeded = await page.request.put(`/api/shows/${legacy.id}?show-version=2`, { data: animationRecord })
  expect(seeded.ok(), await seeded.text()).toBe(true)

  const writes: string[] = []
  page.on('request', (request) => {
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
  return {
    showId: legacy.id,
    clipInspector: page.getByTestId('show-clip-inspector-v2'),
    showInspector: page.getByTestId('show-inspector-v2'),
    lanes: page.getByTestId('show-v2-animation-lanes'),
    sidePanel: page.getByTestId('show-editor-v2-side-panel'),
    readSaved,
    writes,
  }
}
