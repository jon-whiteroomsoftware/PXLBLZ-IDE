import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/authenticated'
import type { ShowRecord } from '../src/engine/personalContentRecords'
import { createShowWithOutputContract, projectShowTimeline } from '../src/engine/showModel'
import { createInstallationShowOutputContract } from '../src/engine/showOutputContract'
import { projectShowUnifiedTimeline } from '../src/engine/showUnifiedTimelineProjection'
import {
  boundaryClipDeletionFixture,
  boundaryDeletionPlacement,
} from '../src/test/showBoundaryClipDeletionFixture'

async function savedShow(page: Page, showId: string): Promise<ShowRecord> {
  const response = await page.context().request.get('/api/shows')
  expect(response.ok(), await response.text()).toBe(true)
  const shows = (await response.json() as { shows: ShowRecord[] }).shows
  const show = shows.find((candidate) => candidate.id === showId)
  expect(show).toBeDefined()
  return show!
}

async function captureIssue1023(page: Page, name: string): Promise<void> {
  const captureOutput = process.env.PXLBLZ_CAPTURE_OUTPUT
  if (!captureOutput) return
  await mkdir(captureOutput, { recursive: true })
  await page.screenshot({ path: join(captureOutput, name), fullPage: true })
}

/**
 * Seed one version-1 Installation Show and open it.
 *
 * Since #1039 flipped the production default a fresh Show is authored as a
 * version-2 record on the v2 editor; this spec covers the v1 editor's boundary
 * behavior, which still holds every row storage keeps as version 1. The record
 * is what the creation flow's Installation defaults built, including the 2D
 * output map its map list preselects.
 */
async function createInstallationShow(page: Page): Promise<string> {
  const show = createShowWithOutputContract(
    randomUUID(),
    'Untitled Show',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }),
  )
  const created = await page.context().request.post('/api/shows', { data: show })
  expect(created.ok(), await created.text()).toBe(true)
  await page.goto(`studio/shows/${show.id}`)
  await expect(page).toHaveURL(new RegExp(`/studio/shows/${show.id}$`))
  return show.id
}

async function expectFeedbackFitsClip(page: Page, clipId: string): Promise<void> {
  const clip = page.locator(`[data-show-selection-key="clip:${clipId}"]`)
  const feedback = clip.getByTestId('show-clip-delete-blocked')
  const label = feedback.locator('.show-clip-delete-blocked-label')
  const boxes = await Promise.all([feedback.boundingBox(), label.boundingBox()])
  expect(boxes[0]).not.toBeNull()
  expect(boxes[1]).not.toBeNull()
  expect(boxes[1]!.x).toBeGreaterThanOrEqual(boxes[0]!.x - 1)
  expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.y - 1)
  expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[0]!.x + boxes[0]!.width + 1)
  expect(boxes[1]!.y + boxes[1]!.height).toBeLessThanOrEqual(boxes[0]!.y + boxes[0]!.height + 1)
}

test('repairs a fresh Show deletion and lets a replacement move into the former Transition (#1028)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows')
  const showId = await createInstallationShow(page)
  const original = await savedShow(page, showId)
  expect(original.composition).toBeUndefined()

  const firstClip = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
  const secondStarterClip = page.getByRole('button', { name: 'Select CometLoom', exact: true })
  await secondStarterClip.click()
  await page.keyboard.press('Delete')

  await expect.poll(async () => (await savedShow(page, showId)).transitions[0]?.kind).toBe('cut')
  let repaired = await savedShow(page, showId)
  expect(repaired.transitions[0]).toMatchObject({ id: 'transition-scene-1', kind: 'cut', durationMs: 0 })
  expect(repaired.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 32_000])
  expect(projectShowTimeline(repaired)).toMatchObject({ durationMs: 62_000, transitions: [] })
  expect(repaired.composition?.scenes[0].zones[0].main).toEqual([
    expect.objectContaining({ id: 'placement-cell-1-scene-1', startMs: 0, durationMs: 30_000 }),
  ])
  expect(repaired.composition?.scenes[1].zones[0].main).toEqual([])
  await expect(secondStarterClip).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Edit crossfade Transition/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo Show edit' }).click()
  await expect.poll(async () => (await savedShow(page, showId)).transitions[0]?.kind).toBe('crossfade')
  await expect(secondStarterClip).toBeVisible()
  await page.getByRole('button', { name: 'Redo Show edit' }).click()
  await expect.poll(async () => (await savedShow(page, showId)).transitions[0]?.kind).toBe('cut')
  await expect(secondStarterClip).toHaveCount(0)

  const playhead = page.getByRole('slider', { name: 'Show playhead' })
  await playhead.fill('35000')
  await page.getByRole('button', { name: 'Add to Show' }).click()
  await page.getByRole('menuitem', { name: 'Clip', exact: true }).click()
  const addDialog = page.getByRole('dialog', { name: 'Add Clip at playhead' })
  await addDialog.getByRole('combobox', { name: 'Pattern for new Clip' }).click()
  await page.getByRole('option', { name: 'Kishimisu', exact: true }).click()

  const replacement = page.getByRole('button', { name: 'Select Kishimisu', exact: true })
  await expect(replacement).toBeVisible()
  await page.keyboard.press('Escape')
  const [firstBounds, replacementBounds] = await Promise.all([
    firstClip.boundingBox(),
    replacement.boundingBox(),
  ])
  expect(firstBounds).not.toBeNull()
  expect(replacementBounds).not.toBeNull()
  await page.mouse.move(
    replacementBounds!.x + replacementBounds!.width / 2,
    replacementBounds!.y + replacementBounds!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    firstBounds!.x + firstBounds!.width + replacementBounds!.width / 2,
    replacementBounds!.y + replacementBounds!.height / 2,
    { steps: 8 },
  )
  await expect(page.getByTestId('show-clip-move-preview')).toBeVisible()
  await page.mouse.up()

  await expect.poll(async () => {
    const saved = await savedShow(page, showId)
    if (!saved.composition) return null
    return projectShowUnifiedTimeline(saved, saved.composition).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((clip) => clip.patternName === 'Kishimisu')?.startMs ?? null
  }).toBe(30_000)
  repaired = await savedShow(page, showId)
  expect(projectShowTimeline(repaired)).toMatchObject({ durationMs: 62_000, transitions: [] })
  await expect(page.getByRole('button', { name: 'Show End at 62 seconds' })).toBeVisible()
  await expect.poll(async () => {
    const [left, right] = await Promise.all([firstClip.boundingBox(), replacement.boundingBox()])
    return left && right ? Math.abs(right.x - (left.x + left.width)) : Number.POSITIVE_INFINITY
  }).toBeLessThanOrEqual(1.5)

  await page.reload()
  await expect(firstClip).toBeVisible()
  await expect(replacement).toBeVisible()
  await expect(page.getByRole('button', { name: /Edit crossfade Transition/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show End at 62 seconds' })).toBeVisible()
  await captureIssue1023(page, '1028-fresh-show-replacement-at-former-transition.png')
  expect(errors).toEqual([])
})

test('deletes both starter Clips, exposes the former Transition time, and Clones into it (#1023)', async ({ page }) => {
  const show = boundaryClipDeletionFixture('boundary-delete-success-1023')
  const created = await page.context().request.post('/api/shows', { data: show })
  expect(created.ok(), await created.text()).toBe(true)
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/api/shows/${show.id}`)) writes.push(request.method())
  })
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`studio/shows/${show.id}`)
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()

  await page.locator('[data-show-selection-key="clip:starter-a"]').click()
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await savedShow(page, show.id)).composition?.scenes[0].zones[0].main.length).toBe(0)
  expect((await savedShow(page, show.id)).transitions[0]).toMatchObject({ kind: 'crossfade', durationMs: 2_000 })

  await page.locator('[data-show-selection-key="clip:starter-b"]').click()
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await savedShow(page, show.id)).transitions[0].kind).toBe('cut')
  const repaired = await savedShow(page, show.id)
  expect(writes).toEqual(['PATCH', 'PATCH'])
  expect(repaired.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 32_000])
  expect(repaired.composition?.durationMs).toBe(62_000)
  expect(repaired.composition?.markers).toEqual(show.composition?.markers)
  expect(projectShowTimeline(repaired)).toMatchObject({ durationMs: 62_000, transitions: [] })
  expect(projectShowUnifiedTimeline(repaired, repaired.composition!).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    .map((clip) => [clip.id, clip.startMs, clip.endMs]))
    .toEqual(['a', 'b', 'c', 'd'].map((suffix) => [`overlay-${suffix}`, 0, 30_000]))

  await page.getByRole('button', { name: 'Undo Show edit' }).click()
  await expect.poll(async () => (await savedShow(page, show.id)).transitions[0].kind).toBe('crossfade')
  expect((await savedShow(page, show.id)).composition?.scenes[1].zones[0].main)
    .toEqual(show.composition?.scenes[1].zones[0].main)
  await page.getByRole('button', { name: 'Redo Show edit' }).click()
  await expect.poll(async () => (await savedShow(page, show.id)).transitions[0].kind).toBe('cut')
  expect(writes).toEqual(['PATCH', 'PATCH', 'PATCH', 'PATCH'])

  await page.locator('[data-show-selection-key="clip:overlay-a"]').click()
  await page.getByRole('button', { name: 'Clone selection' }).click()
  await expect.poll(async () => projectShowUnifiedTimeline(
    await savedShow(page, show.id),
    (await savedShow(page, show.id)).composition!,
  ).zones.flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    .some((clip) => clip.id !== 'overlay-a' && clip.layerIndex === 0 && clip.startMs === 30_000 && clip.endMs === 60_000)).toBe(true)
  await captureIssue1023(page, '1023-free-former-transition-interval.png')
  expect(errors).toEqual([])
})

test('reports shared animation state through the existing Clip feedback without saving (#1023)', async ({ page }) => {
  const show = boundaryClipDeletionFixture('boundary-delete-shared-1023')
  show.composition!.scenes[1].zones[0].overlays[0].placements.push({
    ...boundaryDeletionPlacement('shared-later', 1_000, 1_000, 'instance-starter-a'),
    opacity: 1,
  })
  const created = await page.context().request.post('/api/shows', { data: show })
  expect(created.ok(), await created.text()).toBe(true)
  const before = await savedShow(page, show.id)
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/api/shows/${show.id}`)) writes.push(request.method())
  })
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`studio/shows/${show.id}`)
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  const clip = page.locator('[data-show-selection-key="clip:starter-b"]')
  await clip.click()
  await page.keyboard.press('Delete')

  await expect(clip.getByText('Cannot delete: shared animation state')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Clip deletion unavailable' }))
    .toHaveText('Cannot delete: shared animation state')
  await expect(clip).toBeFocused()
  await expectFeedbackFitsClip(page, 'starter-b')
  await captureIssue1023(page, '1023-shared-state-delete-refusal-desktop.png')
  expect(await savedShow(page, show.id)).toEqual(before)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('reports actual Trails state through the existing Clip feedback at narrow width without saving (#1023)', async ({ page }) => {
  const show = boundaryClipDeletionFixture('boundary-delete-trails-1023')
  show.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.8 }]
  const created = await page.context().request.post('/api/shows', { data: show })
  expect(created.ok(), await created.text()).toBe(true)
  const before = await savedShow(page, show.id)
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/api/shows/${show.id}`)) writes.push(request.method())
  })
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 900, height: 900 })
  await page.goto(`studio/shows/${show.id}`)
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
  const clip = page.locator('[data-show-selection-key="clip:starter-b"]')
  await clip.click()
  await page.getByRole('button', { name: 'Delete clip starter-b' }).click()

  await expect(clip.getByText('Cannot delete while Trails is enabled.')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Clip deletion unavailable' }))
    .toHaveText('Cannot delete while Trails is enabled.')
  await expectFeedbackFitsClip(page, 'starter-b')
  await captureIssue1023(page, '1023-trails-delete-refusal-narrow.png')
  expect(await savedShow(page, show.id)).toEqual(before)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
