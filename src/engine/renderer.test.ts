import { createRenderer } from './renderer'

// jsdom provides no WebGL context, so this exercises the no-op degrade path.
describe('renderer — no GL context', () => {
  it('returns a renderer that no-ops paint and still tracks canvas size', () => {
    const canvas = document.createElement('canvas')
    const renderer = createRenderer(canvas, { rows: 16, cols: 32, spacing: 20 })

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(320)

    // paint must not throw without a GL context
    expect(() => renderer.paint([[1, 0, 0]], 1, false)).not.toThrow()

    renderer.updateGrid({ rows: 8, cols: 8, spacing: 10 })
    expect(canvas.width).toBe(80)
    expect(canvas.height).toBe(80)
  })

  it('clamps oversized grid dimensions on construction', () => {
    const canvas = document.createElement('canvas')
    createRenderer(canvas, { rows: 5000, cols: 5000, spacing: 1 })
    expect(canvas.width).toBe(256)
    expect(canvas.height).toBe(256)
  })
})
