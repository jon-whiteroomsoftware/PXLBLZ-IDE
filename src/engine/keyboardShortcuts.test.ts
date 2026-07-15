import { describe, expect, it } from 'vitest'
import { studioControlOwnsKeyboardEvent } from './keyboardShortcuts'

describe('studioControlOwnsKeyboardEvent', () => {
  it.each(['input', 'select', 'textarea', 'button', 'a', '[role="textbox"]', '[role="slider"]'])(
    'keeps Space with %s controls',
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
})
