import { createRenderer } from './renderer'

// A unit-square layout (a 2×2 plane) → square canvas at the container width.
const SQUARE_POS: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
]

// jsdom provides no WebGL context, so this exercises the no-op degrade path.
describe('renderer — no GL context', () => {
  it('returns a renderer that no-ops paint and still tracks canvas size from the layout bounds', () => {
    const canvas = document.createElement('canvas')
    const renderer = createRenderer(canvas, { containerWidth: 640, lightSize: 0.5 })

    renderer.set2DPositions(SQUARE_POS, { containerWidth: 640, lightSize: 0.5 })
    // A square (unit-box) layout sizes to a square canvas at the container width.
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(640)

    // paint must not throw without a GL context
    expect(() => renderer.paint([[1, 0, 0]], 1, false)).not.toThrow()

    renderer.resize2D({ containerWidth: 320, lightSize: 0.5 })
    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(320)

    renderer.resize2D({ containerWidth: 640, containerHeight: 240, lightSize: 0.5 })
    expect(canvas.width).toBe(240)
    expect(canvas.height).toBe(240)
  })

  it('sizes a non-square layout to its bounds aspect', () => {
    const canvas = document.createElement('canvas')
    const renderer = createRenderer(canvas, { containerWidth: 640 })
    // A 2:1-wide layout (y range half of x range) → half-height canvas.
    renderer.set2DPositions([[0, 0], [1, 0], [0, 0.5], [1, 0.5]], { containerWidth: 640 })
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(320)
  })

  it('resizes a 3D canvas without replacing its renderer context (#508)', () => {
    const canvas = document.createElement('canvas')
    const renderer = createRenderer(canvas, { containerWidth: 640 })

    renderer.set3DPositions([[0, 0, 0], [1, 1, 1]], { canvasPx: 640 })
    expect(() => renderer.setZoom(2)).not.toThrow()
    renderer.resize3D(320)

    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(320)
  })

  it('applies a light-size change while resizing an active 3D renderer (#881)', () => {
    const buffers: object[] = []
    const contents = new Map<object, Float32Array>()
    let boundBuffer: object | null = null
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      ARRAY_BUFFER: 3,
      STATIC_DRAW: 4,
      DYNAMIC_DRAW: 5,
      BLEND: 6,
      ONE: 7,
      DEPTH_TEST: 8,
      FLOAT: 9,
      COLOR_BUFFER_BIT: 16,
      DEPTH_BUFFER_BIT: 32,
      POINTS: 10,
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      createProgram: () => ({}),
      attachShader: () => undefined,
      linkProgram: () => undefined,
      createBuffer: () => {
        const buffer = {}
        buffers.push(buffer)
        return buffer
      },
      getAttribLocation: () => 0,
      getUniformLocation: () => ({}),
      bindBuffer: (_target: number, buffer: object) => { boundBuffer = buffer },
      bufferData: (_target: number, data: Float32Array) => {
        if (boundBuffer) contents.set(boundBuffer, new Float32Array(data))
      },
      enable: () => undefined,
      disable: () => undefined,
      blendFunc: () => undefined,
      clearColor: () => undefined,
      viewport: () => undefined,
      clear: () => undefined,
      useProgram: () => undefined,
      enableVertexAttribArray: () => undefined,
      disableVertexAttribArray: () => undefined,
      vertexAttribPointer: () => undefined,
      vertexAttrib1f: () => undefined,
      uniform1f: () => undefined,
      uniform1i: () => undefined,
      drawArrays: () => undefined,
      depthMask: () => undefined,
    }
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(gl as unknown as WebGLRenderingContext)
    try {
      const canvas = document.createElement('canvas')
      const renderer = createRenderer(canvas, { containerWidth: 640, lightSize: 0.3 })
      renderer.set3DPositions([[0, 0, 0], [1, 0, 0]], { canvasPx: 640 })
      renderer.paint([[1, 1, 1], [1, 1, 1]], 1, false)
      const before = contents.get(buffers[2])![0]

      renderer.resize3D(640, 0.8)
      renderer.paint([[1, 1, 1], [1, 1, 1]], 1, false)
      const after = contents.get(buffers[2])![0]

      expect(after).toBeGreaterThan(before * 2)
    } finally {
      getContext.mockRestore()
    }
  })
})
