import { afterEach, describe, expect, it, vi } from 'vitest'

describe('jsdom canvas substitute (#603)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null for an unconfigured context without reporting an error', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const canvas = document.createElement('canvas')

    expect(HTMLCanvasElement.prototype.getContext.name).toBe(
      'getContextWithoutCanvas',
    )
    expect(canvas.getContext('webgl')).toBeNull()
    expect(report).not.toHaveBeenCalled()
  })

  it('leaves unrelated console errors observable', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    console.error('unrelated test failure')

    expect(report).toHaveBeenCalledWith('unrelated test failure')
  })

  it('allows a test to replace the default with a context-specific fake', () => {
    const original = HTMLCanvasElement.prototype.getContext
    const fakeContext = { kind: 'test-webgl' }
    const replacement = vi.fn(() => fakeContext)
    try {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        writable: true,
        value: replacement,
      })

      const canvas = document.createElement('canvas')
      expect(canvas.getContext('webgl')).toBe(fakeContext)
      expect(replacement).toHaveBeenCalledWith('webgl')
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        writable: true,
        value: original,
      })
    }
  })
})
