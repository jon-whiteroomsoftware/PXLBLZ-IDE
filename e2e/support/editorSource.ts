import type { Locator, Page } from '@playwright/test'
import { expect } from '../fixtures/authenticated'

/** Monaco names its own input textarea; this label is not produced by live source. */
export const MONACO_TEXTBOX_NAME = 'Editor content'

/** Clear the complete Monaco model through its public keyboard surface. */
export async function clearEditorSource(_page: Page, editor: Locator): Promise<void> {
  const input = editor.getByRole('textbox', { name: MONACO_TEXTBOX_NAME })
  const viewLines = editor.locator('.view-lines')
  // textContent preserves the one-line model text without layout-only wraps;
  // Monaco renders ordinary spaces as NBSPs inside view-lines.
  const renderedSource = async () => (await viewLines.textContent() ?? '').replaceAll('\u00a0', ' ')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await viewLines.click()
    await expect(editor).toHaveClass(/focused/)
    await expect(input).toBeFocused()
    // Playwright's Chromium keyboard surface uses Control+A for Monaco's
    // select-all command even when the runner host is macOS.
    await input.press('Control+KeyA')
    // Typing an opening bracket over a selection can auto-surround the old
    // source. Delete first so every caller starts from an empty model.
    await input.press('Backspace')
    if (await renderedSource() === '') break
  }

  await expect.poll(renderedSource).toBe('')
}

/** Replace the complete Monaco model through its public keyboard surface. */
export async function replaceEditorSource(page: Page, editor: Locator, source: string): Promise<void> {
  const viewLines = editor.locator('.view-lines')
  const renderedSource = async () => (await viewLines.textContent() ?? '').replaceAll('\u00a0', ' ')
  await clearEditorSource(page, editor)
  await page.keyboard.type(source)
  await expect.poll(renderedSource).toBe(source)
}

/** Model text as rendered: one entry per `.view-line`, ordered by its CSS `top`, NBSP -> space, joined with '\n'. Valid only for sources whose lines don't soft-wrap. */
export async function renderedEditorLines(editor: Locator): Promise<string> {
  return editor.locator('.view-lines .view-line').evaluateAll((elements) => (
    elements
      .sort((a, b) => parseFloat((a as HTMLElement).style.top) - parseFloat((b as HTMLElement).style.top))
      .map((el) => (el.textContent ?? '').replaceAll('\u00a0', ' '))
      .join('\n')
  ))
}

/** Clear, type a multi-line source, and poll renderedEditorLines(editor) until it equals `source`. */
export async function replaceMultilineEditorSource(page: Page, editor: Locator, source: string): Promise<void> {
  await clearEditorSource(page, editor)
  await page.keyboard.type(source)
  await expect.poll(() => renderedEditorLines(editor)).toBe(source)
}
