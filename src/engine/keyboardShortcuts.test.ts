import { describe, expect, it } from 'vitest'
import { claimStudioPreviewSpace, studioControlOwnsKeyboardEvent } from './keyboardShortcuts'

describe('studioControlOwnsKeyboardEvent', () => {
  it('lets only one preview surface claim a Space keydown', () => {
    const event = new KeyboardEvent('keydown', { code: 'Space', cancelable: true })

    expect(claimStudioPreviewSpace(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(claimStudioPreviewSpace(event)).toBe(false)
    expect(claimStudioPreviewSpace(new KeyboardEvent('keydown', { code: 'KeyA' }))).toBe(false)
  })

  it.each(['input', 'textarea', '[role="textbox"]'])(
    'keeps Space with %s text-entry controls',
    (selector) => {
      const target = selector.startsWith('[') ? document.createElement('div') : document.createElement(selector)
      if (selector === '[role="textbox"]') target.setAttribute('role', 'textbox')
      if (selector === '[role="slider"]') target.setAttribute('role', 'slider')
      if (target instanceof HTMLAnchorElement) target.href = '/test'
      document.body.append(target)

      expect(studioControlOwnsKeyboardEvent(target)).toBe(true)
      target.remove()
    },
  )

  it.each(['select', 'button', 'a', '[role="slider"]'])(
    'lets Preview own Space from non-editing %s controls',
    (selector) => {
      const target = selector.startsWith('[') ? document.createElement('div') : document.createElement(selector)
      if (selector === '[role="slider"]') target.setAttribute('role', 'slider')
      if (target instanceof HTMLAnchorElement) target.href = '/test'
      document.body.append(target)

      expect(studioControlOwnsKeyboardEvent(target)).toBe(false)
      target.remove()
    },
  )

  it('lets the Studio surface own Space from ordinary content', () => {
    expect(studioControlOwnsKeyboardEvent(document.body)).toBe(false)
  })

  it('lets entity chooser rows delegate Space to preview transport', () => {
    const target = document.createElement('li')
    target.setAttribute('role', 'button')
    target.setAttribute('data-studio-space-preview', 'true')
    document.body.append(target)

    expect(studioControlOwnsKeyboardEvent(target)).toBe(false)
    target.remove()
  })

  it('keeps Space in a text input nested inside a preview-enabled entity row', () => {
    const row = document.createElement('li')
    row.setAttribute('data-studio-space-preview', 'true')
    const input = document.createElement('input')
    input.type = 'text'
    row.append(input)
    document.body.append(row)

    expect(studioControlOwnsKeyboardEvent(input)).toBe(true)
    row.remove()
  })

  it('lets Preview own Space from a non-text input', () => {
    const target = document.createElement('input')
    target.type = 'range'
    document.body.append(target)

    expect(studioControlOwnsKeyboardEvent(target)).toBe(false)
    target.remove()
  })

  it('keeps Space inside a nested contenteditable editor surface', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const target = document.createElement('span')
    editor.append(target)
    document.body.append(editor)

    expect(studioControlOwnsKeyboardEvent(target)).toBe(true)
    editor.remove()
  })
})
