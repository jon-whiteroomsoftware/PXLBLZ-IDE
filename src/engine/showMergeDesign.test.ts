import { loadPattern, type PatternMetadata } from './loadPattern'

interface FixtureHandle {
  handle: ReturnType<typeof loadPattern>
  pixel: () => [number, number, number]
}

function loadFixture(
  code: string,
  vars: string[],
  controls: PatternMetadata['controls'] = [],
): FixtureHandle {
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(
    code,
    { exportedVars: vars, patternVars: vars, controls },
    {
      pixelCount: 4,
      rgb(r: number, g: number, b: number) {
        pixel = [r, g, b]
      },
      hsv(h: number, s: number, v: number) {
        pixel = [h, s, v]
      },
      floor: Math.floor,
    },
  )
  return { handle, pixel: () => pixel }
}

describe('show merge design fixtures', () => {
  it('keeps renamed member globals independent while local shadowing remains local', () => {
    const code = `
var __pxlblz_show_c0_hue = 0.1
var __pxlblz_show_c1_hue = 0.9

function __pxlblz_show_c0_beforeRender(delta) {
  __pxlblz_show_c0_hue = __pxlblz_show_c0_hue + delta
}

function __pxlblz_show_c1_beforeRender(delta) {
  __pxlblz_show_c1_hue = __pxlblz_show_c1_hue - delta
}

function __pxlblz_show_c0_render(index) {
  var __pxlblz_show_c0_hue = 0.4
  rgb(__pxlblz_show_c0_hue, 0, index)
}

function __pxlblz_show_c1_render(index) {
  rgb(0, __pxlblz_show_c1_hue, index)
}

export function beforeRender(delta) {
  __pxlblz_show_c0_beforeRender(delta)
  __pxlblz_show_c1_beforeRender(delta)
}

export function render(index) {
  if (index < pixelCount / 2) __pxlblz_show_c0_render(index)
  else __pxlblz_show_c1_render(index - pixelCount / 2)
}
`
    const { handle, pixel } = loadFixture(code, ['__pxlblz_show_c0_hue', '__pxlblz_show_c1_hue'])

    handle.beforeRender(0.2)
    handle.render(0)
    expect(pixel()).toEqual([0.4, 0, 0])
    handle.render(3)
    expect(pixel()).toEqual([0, 0.7, 1])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_hue: 0.30000000000000004,
      __pxlblz_show_c1_hue: 0.7,
    })
  })

  it('freezes inactive member time bases and advances both members during transitions', () => {
    const code = `
var __pxlblz_show_phase = 0
var __pxlblz_show_c0_elapsed = 0
var __pxlblz_show_c1_elapsed = 0
var __pxlblz_show_c0_ticks = 0
var __pxlblz_show_c1_ticks = 0

export function sliderShowPhase(v) {
  __pxlblz_show_phase = v
}

function __pxlblz_show_c0_time(interval) {
  return (__pxlblz_show_c0_elapsed / (interval * 65536)) % 1
}

function __pxlblz_show_c1_time(interval) {
  return (__pxlblz_show_c1_elapsed / (interval * 65536)) % 1
}

function __pxlblz_show_c0_beforeRender(delta) {
  __pxlblz_show_c0_elapsed = __pxlblz_show_c0_elapsed + delta
  __pxlblz_show_c0_ticks = __pxlblz_show_c0_ticks + 1
}

function __pxlblz_show_c1_beforeRender(delta) {
  __pxlblz_show_c1_elapsed = __pxlblz_show_c1_elapsed + delta
  __pxlblz_show_c1_ticks = __pxlblz_show_c1_ticks + 1
}

export function beforeRender(delta) {
  if (__pxlblz_show_phase == 0) {
    __pxlblz_show_c0_beforeRender(delta)
  } else if (__pxlblz_show_phase == 1) {
    __pxlblz_show_c0_beforeRender(delta)
    __pxlblz_show_c1_beforeRender(delta)
  } else {
    __pxlblz_show_c1_beforeRender(delta)
  }
}

export function render(index) {
  if (__pxlblz_show_phase < 2) rgb(__pxlblz_show_c0_time(1), 0, 0)
  else rgb(0, __pxlblz_show_c1_time(1), 0)
}
`
    const { handle } = loadFixture(code, [
      '__pxlblz_show_phase',
      '__pxlblz_show_c0_elapsed',
      '__pxlblz_show_c1_elapsed',
      '__pxlblz_show_c0_ticks',
      '__pxlblz_show_c1_ticks',
    ], [{ exportName: 'sliderShowPhase', kind: 'slider', label: 'Show Phase' }])

    handle.beforeRender(10)
    handle.controls.sliderShowPhase(1)
    handle.beforeRender(20)
    handle.controls.sliderShowPhase(2)
    handle.beforeRender(30)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 30,
      __pxlblz_show_c1_elapsed: 50,
      __pxlblz_show_c0_ticks: 2,
      __pxlblz_show_c1_ticks: 2,
    })
  })

  it('surfaces member controls only through explicit public show proxies', () => {
    const code = `
var __pxlblz_show_c0_speed = 0.25
var __pxlblz_show_c1_speed = 0.75

function __pxlblz_show_c0_sliderSpeed(v) {
  __pxlblz_show_c0_speed = v
}

function __pxlblz_show_c1_sliderSpeed(v) {
  __pxlblz_show_c1_speed = v
}

export function sliderLeadSpeed(v) {
  __pxlblz_show_c0_sliderSpeed(v)
}

export function beforeRender(delta) {
  __pxlblz_show_c1_sliderSpeed(0.5)
}

export function render(index) {
  rgb(__pxlblz_show_c0_speed, __pxlblz_show_c1_speed, 0)
}
`
    const { handle } = loadFixture(
      code,
      ['__pxlblz_show_c0_speed', '__pxlblz_show_c1_speed'],
      [{ exportName: 'sliderLeadSpeed', kind: 'slider', label: 'Lead Speed' }],
    )

    expect(handle.controls).toHaveProperty('sliderLeadSpeed')
    expect(handle.controls).not.toHaveProperty('__pxlblz_show_c0_sliderSpeed')
    handle.controls.sliderLeadSpeed(0.9)
    handle.beforeRender(16)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_speed: 0.9,
      __pxlblz_show_c1_speed: 0.5,
    })
  })
})
