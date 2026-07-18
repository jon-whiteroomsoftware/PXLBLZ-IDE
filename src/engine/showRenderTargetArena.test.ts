import {
  emitShowRenderTargetArenaSource,
  emitShowRenderTargetRead,
  emitShowRenderTargetWrite,
  planShowRenderTargetArena,
  SHOW_RENDER_TARGET_PLANE_NAMES,
} from './showRenderTargetArena'
import { loadPattern } from './loadPattern'
import { createShim } from './shim'

describe('Show render-target arena (#515)', () => {
  it.each([0, 1, 2_000])('emits three %s-element planes', (pixelCount) => {
    const source = emitShowRenderTargetArenaSource(pixelCount)

    expect(source.match(new RegExp(`array\\(${pixelCount}\\)`, 'g'))).toHaveLength(3)
  })

  it('assigns the sample XY role deterministically onto the shared planes', () => {
    expect(planShowRenderTargetArena(2_000, 'sample-xy')).toEqual({
      elementCount: 2_000,
      planeCount: 3,
      words: 6_012,
      activeRole: 'sample-xy',
      planes: SHOW_RENDER_TARGET_PLANE_NAMES,
      binding: {
        role: 'sample-xy',
        channels: { x: 0, y: 1 },
      },
    })
  })

  it('emits stage RGB reads and writes through named channels', () => {
    const plan = planShowRenderTargetArena(64, 'stage-rgb')

    expect(emitShowRenderTargetRead(plan, 'r', 'index')).toBe('__pxlblz_show_rt_plane_0[index]')
    expect(emitShowRenderTargetWrite(plan, 'b', 'index', 'blue')).toBe('__pxlblz_show_rt_plane_2[index] = blue')
  })

  it('reuses the same arena for XY, scalar-field, and previous-RGB operations', () => {
    const xy = planShowRenderTargetArena(64, 'sample-xy')
    const scalar = planShowRenderTargetArena(64, 'scalar-field')
    const previous = planShowRenderTargetArena(64, 'previous-rgb')

    expect(emitShowRenderTargetWrite(xy, 'x', 'index', 'localX')).toBe('__pxlblz_show_rt_plane_0[index] = localX')
    expect(emitShowRenderTargetRead(xy, 'y', 'index')).toBe('__pxlblz_show_rt_plane_1[index]')
    expect(emitShowRenderTargetWrite(scalar, 'value', 'index', 'distance')).toBe('__pxlblz_show_rt_plane_0[index] = distance')
    expect(emitShowRenderTargetRead(previous, 'g', 'index')).toBe('__pxlblz_show_rt_plane_1[index]')
  })

  it('binds a role to the physical planes selected by the lifetime planner (#517)', () => {
    const scalar = planShowRenderTargetArena(64, 'scalar-field', [2])

    expect(emitShowRenderTargetWrite(scalar, 'value', 'index', 'mask')).toBe(
      '__pxlblz_show_rt_plane_2[index] = mask',
    )
  })

  it('executes generated role operations in the Pattern runtime', () => {
    const plan = planShowRenderTargetArena(2, 'stage-rgb')
    const source = `
${emitShowRenderTargetArenaSource(2)}
export function render(index) {
  ${emitShowRenderTargetWrite(plan, 'r', 'index', 'index')}
  ${emitShowRenderTargetWrite(plan, 'g', 'index', '0.25')}
  ${emitShowRenderTargetWrite(plan, 'b', 'index', '1 - index')}
  rgb(
    ${emitShowRenderTargetRead(plan, 'r', 'index')},
    ${emitShowRenderTargetRead(plan, 'g', 'index')},
    ${emitShowRenderTargetRead(plan, 'b', 'index')}
  )
}
`
    const shim = createShim({ pixelCount: 2, dimensions: 1, mapPoints: [], getVirtualTime: () => 0 })
    const handle = loadPattern(source, { exportedVars: [], patternVars: [], controls: [] }, shim.builtins)

    handle.render(1)
    expect(shim.capturedPixel()).toEqual([1, 0.25, 0])
  })
})
