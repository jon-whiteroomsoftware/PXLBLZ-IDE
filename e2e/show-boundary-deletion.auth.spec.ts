import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Page, Request } from '@playwright/test'
import { expect, test } from './fixtures/authenticated'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { createShowWithOutputContract } from '../src/engine/showModel'
import { createInstallationShowOutputContract } from '../src/engine/showOutputContract'
import {
  boundaryClipDeletionFixture,
  boundaryDeletionPlacement,
} from '../src/test/showBoundaryClipDeletionFixture'
import { findStoredShowV2, seedShowV2 } from './support/showBackingRecords'

async function savedShow(page: Page, showId: string): Promise<ShowRecordV2> {
  const show = await findStoredShowV2(page, showId)
  expect(show).toBeDefined()
  return show!
}

/** A version-2 save of one Show: PUT /api/shows/<id>?show-version=2 (replaceShowV2). */
function isShowV2Save(request: Request, showId: string): boolean {
  return request.method() === 'PUT' && request.url().endsWith(`/api/shows/${showId}?show-version=2`)
}

function clipOf(show: ShowRecordV2, clipId: string) {
  return show.composition.clips.find((clip) => clip.id === clipId)
}

function patternNameOf(show: ShowRecordV2, instanceId: string): string | undefined {
  return show.composition.patternInstances.find((instance) => instance.id === instanceId)?.patternName
}

async function captureIssue1023(page: Page, name: string): Promise<void> {
  const captureOutput = process.env.PXLBLZ_CAPTURE_OUTPUT
  if (!captureOutput) return
  await mkdir(captureOutput, { recursive: true })
  await page.screenshot({ path: join(captureOutput, name), fullPage: true })
}

/**
 * Seed one converted Installation Show as a version-2 document and open it.
 *
 * The converted default Show carries the Scene-boundary crossfade whose Clip
 * delete repairs into a cut (#1028, converted-boundary repair on v2: see
 * src/engine/showConvertedBoundaryRepairV2.test.ts). The record is what the
 * creation flow's Installation defaults built, including the 2D output map its
 * map list preselects.
 */
async function createInstallationShow(page: Page): Promise<string> {
  const show = createShowWithOutputContract(
    randomUUID(),
    'Untitled Show',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }),
  )
  await seedShowV2(page, show, 'fresh boundary Show')
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
  expect(original.composition.transitions).toHaveLength(1)

  const firstClip = page.getByRole('button', { name: 'Select TestPattern1D', exact: true })
  const secondStarterClip = page.getByRole('button', { name: 'Select CometLoom', exact: true })
  await secondStarterClip.click()
  await page.keyboard.press('Delete')

  // A v2 cut is the absence of a Transition.
  await expect.poll(async () => (await savedShow(page, showId)).composition.transitions.length).toBe(0)
  let repaired = await savedShow(page, showId)
  expect(repaired.composition.showEndMs).toBe(62_000)
  expect(repaired.composition.clips.map((clip) => [clip.startMs, clip.durationMs])).toEqual([[0, 30_000]])
  await expect(secondStarterClip).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Edit crossfade Transition/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo Show edit' }).click()
  await expect.poll(async () => (await savedShow(page, showId)).composition.transitions.map((transition) => transition.kind)).toEqual(['crossfade'])
  await expect(secondStarterClip).toBeVisible()
  await page.getByRole('button', { name: 'Redo Show edit' }).click()
  await expect.poll(async () => (await savedShow(page, showId)).composition.transitions.length).toBe(0)
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
    return saved.composition.clips
      .find((clip) => patternNameOf(saved, clip.instanceId) === 'Kishimisu')?.startMs ?? null
  }).toBe(30_000)
  repaired = await savedShow(page, showId)
  expect(repaired.composition.showEndMs).toBe(62_000)
  expect(repaired.composition.transitions).toEqual([])
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
  const show = await seedShowV2(page, boundaryClipDeletionFixture('boundary-delete-success-1023'), 'boundary delete success')
  const writes: string[] = []
  page.on('request', (request) => {
    if (isShowV2Save(request, show.id)) writes.push(request.method())
  })
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`studio/shows/${show.id}`)
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()

  await page.locator('[data-show-selection-key="clip:starter-a"]').click()
  await page.keyboard.press('Delete')
  await expect.poll(async () => clipOf(await savedShow(page, show.id), 'starter-a')).toBeUndefined()
  // v1 kept the crossfade until both starters were gone; the v2 owner removes a
  // converted boundary with either boundary Clip and keeps survivor time
  // (src/engine/showConvertedBoundaryRepairV2.test.ts 'deletes either boundary
  // Clip preserving survivor time and Show End').
  expect((await savedShow(page, show.id)).composition.transitions).toEqual([])

  await page.locator('[data-show-selection-key="clip:starter-b"]').click()
  await page.keyboard.press('Delete')
  await expect.poll(async () => clipOf(await savedShow(page, show.id), 'starter-b')).toBeUndefined()
  const repaired = await savedShow(page, show.id)
  expect(writes).toEqual(['PUT', 'PUT'])
  expect(repaired.composition.showEndMs).toBe(62_000)
  expect(repaired.composition.markers).toEqual(show.composition.markers)
  expect(repaired.composition.clips.map((clip) => [clip.id, clip.startMs, clip.startMs + clip.durationMs]))
    .toEqual(['a', 'b', 'c', 'd'].map((suffix) => [`overlay-${suffix}`, 0, 30_000]))

  await page.getByRole('button', { name: 'Undo Show edit' }).click()
  await expect.poll(async () => clipOf(await savedShow(page, show.id), 'starter-b')).toEqual(clipOf(show, 'starter-b'))
  await page.getByRole('button', { name: 'Redo Show edit' }).click()
  await expect.poll(async () => clipOf(await savedShow(page, show.id), 'starter-b')).toBeUndefined()
  expect(writes).toEqual(['PUT', 'PUT', 'PUT', 'PUT'])

  const overlayA = clipOf(show, 'overlay-a')!
  await page.locator('[data-show-selection-key="clip:overlay-a"]').click()
  await page.getByRole('button', { name: 'Clone selection' }).click()
  await expect.poll(async () => (await savedShow(page, show.id)).composition.clips
    .some((clip) => clip.id !== 'overlay-a' && clip.layerId === overlayA.layerId && clip.startMs === 30_000 && clip.durationMs === 30_000)).toBe(true)
  await captureIssue1023(page, '1023-free-former-transition-interval.png')
  expect(errors).toEqual([])
})

// #1042 BRIEF GAP: the two refusals below are v1-only (ShowEditor.tsx
// blockedDeleteCopyForRefusal reads a v1 ShowRecord). The v2 owner deletes a
// converted boundary Clip and keeps survivor time instead
// (src/engine/showConvertedBoundaryRepairV2.test.ts 'deletes either boundary
// Clip preserving survivor time and Show End'), and no v2 test covers this
// refusal copy, so these stay fixme on v2 seeding until the coordinator
// chooses between retiring them and specifying a v2 refusal.
test.fixme('reports shared animation state through the existing Clip feedback without saving (#1023)', async ({ page }) => {
  const show = boundaryClipDeletionFixture('boundary-delete-shared-1023')
  show.composition!.scenes[1].zones[0].overlays[0].placements.push({
    ...boundaryDeletionPlacement('shared-later', 1_000, 1_000, 'instance-starter-a'),
    opacity: 1,
  })
  await seedShowV2(page, show, 'boundary delete shared state')
  const before = await savedShow(page, show.id)
  const writes: string[] = []
  page.on('request', (request) => {
    if (isShowV2Save(request, show.id)) writes.push(request.method())
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

test.fixme('reports actual Trails state through the existing Clip feedback at narrow width without saving (#1023)', async ({ page }) => {
  const show = boundaryClipDeletionFixture('boundary-delete-trails-1023')
  show.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.8 }]
  await seedShowV2(page, show, 'boundary delete Trails')
  const before = await savedShow(page, show.id)
  const writes: string[] = []
  page.on('request', (request) => {
    if (isShowV2Save(request, show.id)) writes.push(request.method())
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
