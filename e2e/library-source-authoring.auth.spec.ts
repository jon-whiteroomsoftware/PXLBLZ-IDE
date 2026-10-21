import { readFile } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import { parseEpe } from '../src/engine/epeImport'
import { expect, test } from './fixtures/authenticated'
import { renderedEditorLines, replaceMultilineEditorSource } from './support/editorSource'
import { expectStoredPersonalSource, seedPersonalSourceRecord, storedPersonalSource } from './support/personalSourceRecords'

const SEEDED = ['// Seeded level.', 'function level(v) { return 0 }'].join('\n')
const EDITED = ['// Authored level gain.', 'function level(gain) { return gain }'].join('\n')
const BROKEN = ['// Broken level draft.', 'function level(gain) { return gain }', 'level(1)'].join('\n')
const REPAIRED = ['// Repaired level amount.', 'function level(amount) { return amount }'].join('\n')
const SYNC_TICK_MS = 4000 // src/components/Editor.tsx:12

function placeTrigger(page: Page): Locator {
  return page.getByTestId('top-bar').locator('[aria-haspopup="listbox"]')
}

async function choosePlace(page: Page, name: string): Promise<void> {
  await placeTrigger(page).click()
  await page.getByRole('listbox', { name: 'Places' }).getByRole('option', { name: new RegExp(`^${name}`) }).click()
}

async function pixels(page: Page) {
  return page.getByTestId('preview-pane').locator('canvas.rounded-sm').evaluate((element) => {
    const target = element as HTMLCanvasElement
    const gl = target.getContext('webgl')!
    const frame = new Uint8Array(target.width * target.height * 4)
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, frame)
    let checksum = 2166136261
    let maxChannel = 0
    for (let index = 0; index < frame.length; index += 4) {
      maxChannel = Math.max(maxChannel, frame[index], frame[index + 1], frame[index + 2])
      checksum = Math.imul(checksum ^ frame[index], 16777619)
      checksum = Math.imul(checksum ^ frame[index + 1], 16777619)
      checksum = Math.imul(checksum ^ frame[index + 2], 16777619)
    }
    return { checksum, maxChannel }
  })
}

async function openConsumer(page: Page, patternId: string): Promise<void> {
  await page.goto(`studio/patterns/${patternId}?capture`)
  await expect(page.locator('.monaco-editor .view-lines')).toBeVisible()
  await expect(page.locator('.monaco-editor').first().locator('.view-lines')).toContainText('.level(1)')
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  const transport = page.getByTestId('preview-pane')
  const play = transport.getByRole('button', { name: 'Run', exact: true })
  const pause = transport.getByRole('button', { name: 'Pause', exact: true })
  await expect(play.or(pause)).toBeVisible()
  if (await pause.isVisible()) await pause.click()
  const disclosure = transport.getByRole('button', { name: 'Preview', exact: true })
  if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
}

async function hoverLevel(page: Page): Promise<Locator> {
  const editor = page.locator('.monaco-editor').first()
  const level = editor.locator('.view-lines span').filter({ hasText: /^level$/ }).first()
  await expect(level).toBeVisible()
  await level.hover()
  return page.locator('.monaco-hover').filter({ hasText: 'level(' })
}

async function downloadEpeSrc(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pattern actions' }).click()
  await page.getByRole('menuitem', { name: 'Download .epe' }).click()
  const download = await downloadPromise
  const text = await readFile((await download.path())!, 'utf8')
  return parseEpe(text).src
}

test('authenticated Studio edits, reloads, guards and repairs a personal Library and its consuming Pattern', async ({ page, request }) => {
  test.setTimeout(90_000)
  // Three consumer opens, two .epe downloads and an 8.5 s autosave wait exceed the 30 s default.
  const token = Date.now()
  const ns = `K${token}`
  const libraryId = `library-authoring-${token}`
  const patternId = `library-consumer-${token}`
  const patternSrc = `export function render(index) { rgb(${ns}.level(1), 0, 0) }`
  await seedPersonalSourceRecord(request, 'libraries', { id: libraryId, name: ns, src: SEEDED, updatedAt: token })
  const created = await request.post('/api/patterns', {
    data: { id: patternId, name: `Library consumer ${token}`, src: patternSrc, controls: {}, updatedAt: token },
  })
  expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)

  await openConsumer(page, patternId)
  const samples: Awaited<ReturnType<typeof pixels>>[] = []
  await expect.poll(async () => {
    samples.push(await pixels(page))
    return samples.length
  }, { intervals: [500] }).toBe(3)
  const baseline = samples[2]

  await page.goto(`studio/libraries/${libraryId}`)
  const editor = page.locator('.monaco-editor').first()
  const reference = page.getByTestId('preview-pane')
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(SEEDED)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expect(reference.getByText(`${ns}.level(v)`, { exact: true })).toBeVisible()
  await expect(reference.getByText('Seeded level.', { exact: true })).toBeVisible()

  await replaceMultilineEditorSource(page, editor, EDITED)
  await expect(reference.getByText(`${ns}.level(gain)`, { exact: true })).toBeVisible()
  await expect(reference.getByText('Authored level gain.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expectStoredPersonalSource(request, 'libraries', libraryId, EDITED)
  await expect(page.getByTestId('save-status')).toHaveCount(0)

  await page.reload()
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(EDITED)
  const reloadedEditor = await renderedEditorLines(editor)
  expect(await storedPersonalSource(request, 'libraries', libraryId)).toBe(EDITED)
  await expect(reference.getByText(`${ns}.level(gain)`, { exact: true })).toBeVisible()
  await expect(reference.getByText('Authored level gain.', { exact: true })).toBeVisible()

  await openConsumer(page, patternId)
  let hover = await hoverLevel(page)
  await expect(hover).toBeVisible()
  await expect(hover).toContainText(`${ns}.level(gain)`)
  await expect(hover).toContainText('Authored level gain.')
  await test.info().attach('library-consumer-hover-edited.png', { body: await page.screenshot(), contentType: 'image/png' })
  await expect.poll(async () => (await pixels(page)).maxChannel).toBeGreaterThan(baseline.maxChannel)
  await expect.poll(async () => (await pixels(page)).checksum).not.toBe(baseline.checksum)
  const editedPixels = await pixels(page)
  const editedEpeSrc = await downloadEpeSrc(page)
  expect(editedEpeSrc, `BRIEF GAP: flattened edited .epe source: ${editedEpeSrc}`).toContain('return gain')
  expect(editedEpeSrc).not.toContain('return 0')

  await page.goto(`studio/libraries/${libraryId}`)
  await expect(editor.locator('.view-lines')).toBeVisible()
  await replaceMultilineEditorSource(page, editor, BROKEN)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'wont-save')
  await expect(reference.getByText('Broken level draft.', { exact: true })).toBeVisible()
  // Two autosave ticks prove the invalid draft never replaces durable source.
  await page.waitForTimeout(SYNC_TICK_MS * 2 + 500)
  expect(await storedPersonalSource(request, 'libraries', libraryId)).toBe(EDITED)

  await choosePlace(page, 'Patterns')
  const dialog = page.getByRole('alertdialog', { name: 'Discard broken source?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/studio/libraries/${libraryId}$`))
  await expect.poll(() => renderedEditorLines(editor)).toBe(BROKEN)
  const invalidEditorAfterCancel = await renderedEditorLines(editor)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  const storedAfterCancel = await storedPersonalSource(request, 'libraries', libraryId)
  expect(storedAfterCancel).toBe(EDITED)
  await test.info().attach('library-invalid-after-cancel.png', { body: await page.screenshot(), contentType: 'image/png' })

  await replaceMultilineEditorSource(page, editor, REPAIRED)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expectStoredPersonalSource(request, 'libraries', libraryId, REPAIRED)
  await page.reload()
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(REPAIRED)
  const repairedReloadedEditor = await renderedEditorLines(editor)
  const repairedStored = await storedPersonalSource(request, 'libraries', libraryId)
  expect(repairedStored).toBe(REPAIRED)
  await expect(reference.getByText(`${ns}.level(amount)`, { exact: true })).toBeVisible()
  await expect(reference.getByText('Repaired level amount.', { exact: true })).toBeVisible()

  await openConsumer(page, patternId)
  hover = await hoverLevel(page)
  await expect(hover).toBeVisible()
  await expect(hover).toContainText(`${ns}.level(amount)`)
  await expect(hover).toContainText('Repaired level amount.')
  await expect(hover).not.toContainText('Authored level gain.')
  await test.info().attach('library-consumer-hover-repaired.png', { body: await page.screenshot(), contentType: 'image/png' })
  await expect.poll(async () => (await pixels(page)).maxChannel).toBeGreaterThan(baseline.maxChannel)
  const repairedPixels = await pixels(page)
  const repairedEpeSrc = await downloadEpeSrc(page)
  expect(repairedEpeSrc, `BRIEF GAP: flattened repaired .epe source: ${repairedEpeSrc}`).toContain('return amount')
  await test.info().attach('library-source-record.json', {
    body: JSON.stringify({ libraryId, patternId, ns, saved: EDITED, reloadedEditor, invalidEditorAfterCancel, storedAfterCancel, repairedStored, repairedReloadedEditor, baseline, editedPixels, repairedPixels, editedEpeSrc, repairedEpeSrc }, null, 2),
    contentType: 'application/json',
  })
})

test('authenticated Studio discards a broken personal Library draft and its Pattern keeps the durable docs', async ({ page, request }) => {
  const token = Date.now()
  const ns = `K${token}`
  const libraryId = `library-authoring-${token}`
  const patternId = `library-consumer-${token}`
  const patternSrc = `export function render(index) { rgb(${ns}.level(1), 0, 0) }`
  await seedPersonalSourceRecord(request, 'libraries', { id: libraryId, name: ns, src: SEEDED, updatedAt: token })
  const created = await request.post('/api/patterns', {
    data: { id: patternId, name: `Library consumer ${token}`, src: patternSrc, controls: {}, updatedAt: token },
  })
  expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)
  await page.goto(`studio/libraries/${libraryId}`)
  const editor = page.locator('.monaco-editor').first()
  await expect(editor.locator('.view-lines')).toBeVisible()
  const brokenSeeded = ['// Broken level draft.', 'function level(v) { return 0 }', 'level(1)'].join('\n')
  await replaceMultilineEditorSource(page, editor, brokenSeeded)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  await expect(page.getByTestId('preview-pane').getByText('Broken level draft.', { exact: true })).toBeVisible()

  await choosePlace(page, 'Patterns')
  const dialog = page.getByRole('alertdialog', { name: 'Discard broken source?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard and continue' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/studio\/libraries\//)
  expect(await storedPersonalSource(request, 'libraries', libraryId)).toBe(SEEDED)

  await openConsumer(page, patternId)
  const hover = await hoverLevel(page)
  await expect(hover).toBeVisible()
  await expect(hover).toContainText(`${ns}.level(v)`)
  await expect(hover).toContainText('Seeded level.')
  await expect(hover).not.toContainText('Broken level draft.')

  await page.goto(`studio/libraries/${libraryId}`)
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(SEEDED)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expect(page.getByTestId('save-status')).toHaveCount(0)
})
