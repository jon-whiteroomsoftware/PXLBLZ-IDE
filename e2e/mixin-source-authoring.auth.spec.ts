import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures/authenticated'
import { renderedEditorLines, replaceMultilineEditorSource } from './support/editorSource'
import { expectStoredPersonalSource, seedPersonalSourceRecord, storedPersonalSource } from './support/personalSourceRecords'

const SEEDED = ['// Seeded Mixin', '// @param VALUE seeded value', '// @target CONTROL', '// @wraps beforeRender', 'export function beforeRender(d) { CONTROL(VALUE) }'].join('\n')
const EDITED = ['// Authored Mixin', '// @param GAIN authored gain', '// @target CONTROL', '// @wraps beforeRender', 'export function beforeRender(d) { CONTROL(GAIN) }'].join('\n')
const BROKEN = ['// Authored Mixin', '// @param GAIN authored gain', '// @wraps beforeRender', 'export function beforeRender(d) { CONTROL(GAIN) }'].join('\n')
const REPAIRED = ['// Repaired Mixin', '// @param LEVEL repaired level', '// @target CONTROL', '// @wraps beforeRender', 'export function beforeRender(d) { CONTROL(LEVEL) }'].join('\n')
const SYNC_TICK_MS = 4000 // src/components/Editor.tsx:12

function placeTrigger(page: Page): Locator {
  return page.getByTestId('top-bar').locator('[aria-haspopup="listbox"]')
}

async function choosePlace(page: Page, name: string): Promise<void> {
  await placeTrigger(page).click()
  await page.getByRole('listbox', { name: 'Places' }).getByRole('option', { name: new RegExp(`^${name}`) }).click()
}

test('authenticated Studio saves, reloads, guards and repairs personal Mixin source', async ({ page, request }) => {
  const token = Date.now()
  const id = `mixin-authoring-${token}`
  await seedPersonalSourceRecord(request, 'mixins', {
    id, name: `Mixin authoring ${token}`, kind: 'inject', src: SEEDED, updatedAt: token,
  })
  await page.goto(`studio/mixins/${id}`)
  const editor = page.locator('.monaco-editor').first()
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(SEEDED)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')

  await replaceMultilineEditorSource(page, editor, EDITED)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expectStoredPersonalSource(request, 'mixins', id, EDITED)
  await expect(page.getByTestId('save-status')).toHaveCount(0)

  await page.reload()
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(EDITED)
  const reloadedEditor = await renderedEditorLines(editor)
  expect(await storedPersonalSource(request, 'mixins', id)).toBe(EDITED)
  // The provenance pane (preview-pane) lists header params; the editor also renders GAIN as a token.
  await expect(page.getByTestId('preview-pane').getByText('GAIN', { exact: true })).toBeVisible()

  await replaceMultilineEditorSource(page, editor, BROKEN)
  // Header validation drives both compile-status and the provenance errors:
  // src/engine/mixins.ts:44-99; src/components/MixinProvenancePane.tsx:48-59.
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'wont-save')
  await expect(page.getByTestId('preview-pane').getByText('Mixin header needs @target')).toBeVisible()
  // two autosave ticks: a broken buffer must not be written
  await page.waitForTimeout(SYNC_TICK_MS * 2 + 500)
  expect(await storedPersonalSource(request, 'mixins', id)).toBe(EDITED)

  await choosePlace(page, 'Patterns')
  const dialog = page.getByRole('alertdialog', { name: 'Discard broken source?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/studio/mixins/${id}$`))
  await expect.poll(() => renderedEditorLines(editor)).toBe(BROKEN)
  const invalidEditorAfterCancel = await renderedEditorLines(editor)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  const storedAfterCancel = await storedPersonalSource(request, 'mixins', id)
  expect(storedAfterCancel).toBe(EDITED)
  await test.info().attach('mixin-invalid-after-cancel.png', { body: await page.screenshot(), contentType: 'image/png' })

  await replaceMultilineEditorSource(page, editor, REPAIRED)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expectStoredPersonalSource(request, 'mixins', id, REPAIRED)
  await page.reload()
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(REPAIRED)
  const repairedReloadedEditor = await renderedEditorLines(editor)
  const repairedStored = await storedPersonalSource(request, 'mixins', id)
  expect(repairedStored).toBe(REPAIRED)
  await expect(page.getByTestId('preview-pane').getByText('LEVEL', { exact: true })).toBeVisible()
  await test.info().attach('mixin-source-record.json', {
    body: JSON.stringify({ id, saved: EDITED, reloadedEditor, invalidEditorAfterCancel, storedAfterCancel, repairedStored, repairedReloadedEditor }, null, 2),
    contentType: 'application/json',
  })
})

test('authenticated Studio discards a broken personal Mixin buffer back to its durable source', async ({ page, request }) => {
  const token = Date.now()
  const id = `mixin-authoring-${token}`
  await seedPersonalSourceRecord(request, 'mixins', {
    id, name: `Mixin authoring ${token}`, kind: 'inject', src: SEEDED, updatedAt: token,
  })
  await page.goto(`studio/mixins/${id}`)
  const editor = page.locator('.monaco-editor').first()
  await expect(editor.locator('.view-lines')).toBeVisible()
  const brokenSeeded = ['// Seeded Mixin', '// @param VALUE seeded value', '// @wraps beforeRender', 'export function beforeRender(d) { CONTROL(VALUE) }'].join('\n')
  await replaceMultilineEditorSource(page, editor, brokenSeeded)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')

  await choosePlace(page, 'Patterns')
  const dialog = page.getByRole('alertdialog', { name: 'Discard broken source?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard and continue' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/studio\/mixins\//)
  await expect.poll(() => page.url()).not.toContain('/studio/mixins/')
  expect(await storedPersonalSource(request, 'mixins', id)).toBe(SEEDED)

  await page.goto(`studio/mixins/${id}`)
  await expect(editor.locator('.view-lines')).toBeVisible()
  await expect.poll(() => renderedEditorLines(editor)).toBe(SEEDED)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await expect(page.getByTestId('save-status')).toHaveCount(0)
  expect(await storedPersonalSource(request, 'mixins', id)).toBe(SEEDED)
})
