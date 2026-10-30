// Frozen plain Blend emitted by 58439695f7814b35adb5901b3d495e6ffd8753aa for stock KaleidoBloom.
/* global PI2, abs, array, clamp, floor, frac, hsv, hsv24, hypot, max, min, mod, pixelCount, pow, resetTransform, rgb, rotate, scale, sqrt, translate, wave */
// 16 pixels; position 0.5 (rate 1/4), step 16 ms, width 0, persistence null.
var __pxlblz_slowmo_rate = 0.25
var __pxlblz_slowmo_step = 16
var __pxlblz_slowmo_curve = 1
var __pxlblz_slowmo_shape = 0
var __pxlblz_slowmo_width = 0
var __pxlblz_slowmo_T = 0, __pxlblz_slowmo_acc = 0, __pxlblz_slowmo_f = 0, __pxlblz_slowmo_phase = 0, __pxlblz_slowmo_cap = 0
var __pxlblz_slowmo_position = 0.5
var __pxlblz_slowmo_bypass = 0, __pxlblz_slowmo_wasBypass = 0, __pxlblz_slowmo_refresh = 0
export function slider__pxlblz_slowmo_speed(v) { __pxlblz_slowmo_position = clamp(v,0,1) }
var __pxlblz_slowmo_r = 0, __pxlblz_slowmo_g = 0, __pxlblz_slowmo_b = 0
var __pxlblz_slowmo_ar = array(pixelCount), __pxlblz_slowmo_ag = array(pixelCount), __pxlblz_slowmo_ab = array(pixelCount)
var __pxlblz_slowmo_br = array(pixelCount), __pxlblz_slowmo_bg = array(pixelCount), __pxlblz_slowmo_bb = array(pixelCount)
function __pxlblz_slowmo_time(interval) { return (__pxlblz_slowmo_T % interval) / interval }
function __pxlblz_slowmo_hsv24(h,s,v) { if (__pxlblz_slowmo_bypass) { hsv24(h,s,v); return }; __pxlblz_slowmo_hsv(h,s,v) }
function __pxlblz_slowmo_rgb(r,g,b) { if (__pxlblz_slowmo_bypass) { rgb(r,g,b); return }; __pxlblz_slowmo_r = clamp(r,0,1); __pxlblz_slowmo_g = clamp(g,0,1); __pxlblz_slowmo_b = clamp(b,0,1) }
function __pxlblz_slowmo_hsv(h,s,v) {
  if (__pxlblz_slowmo_bypass) { hsv(h,s,v); return }
  if (s == 0) { __pxlblz_slowmo_rgb(v,v,v); return }
  var __pxlblz_slowmo_h6 = ((h % 1) + 1) % 1 * 6
  var __pxlblz_slowmo_i = floor(__pxlblz_slowmo_h6), __pxlblz_slowmo_hf = __pxlblz_slowmo_h6 - __pxlblz_slowmo_i
  var __pxlblz_slowmo_hp = v * (1-s), __pxlblz_slowmo_hq = v * (1-s*__pxlblz_slowmo_hf), __pxlblz_slowmo_ht = v * (1-s*(1-__pxlblz_slowmo_hf))
  if (__pxlblz_slowmo_i % 6 == 0) __pxlblz_slowmo_rgb(v,__pxlblz_slowmo_ht,__pxlblz_slowmo_hp)
  else if (__pxlblz_slowmo_i % 6 == 1) __pxlblz_slowmo_rgb(__pxlblz_slowmo_hq,v,__pxlblz_slowmo_hp)
  else if (__pxlblz_slowmo_i % 6 == 2) __pxlblz_slowmo_rgb(__pxlblz_slowmo_hp,v,__pxlblz_slowmo_ht)
  else if (__pxlblz_slowmo_i % 6 == 3) __pxlblz_slowmo_rgb(__pxlblz_slowmo_hp,__pxlblz_slowmo_hq,v)
  else if (__pxlblz_slowmo_i % 6 == 4) __pxlblz_slowmo_rgb(__pxlblz_slowmo_ht,__pxlblz_slowmo_hp,v)
  else __pxlblz_slowmo_rgb(v,__pxlblz_slowmo_hp,__pxlblz_slowmo_hq)
}
function __pxlblz_slowmo_offset2D(index,x,y) {
  if (__pxlblz_slowmo_shape == 2) return (index * 0.6180267333984375) % 1
  if (__pxlblz_slowmo_shape == 0) return clamp(x,0,1)
  var dx=x-0.5, dy=y-0.5
  return clamp(sqrt(dx*dx+dy*dy)/0.7071067811865476,0,1)
}
function _SDF_smoothUnion(a, b, k) {
  var h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
}
function _SDF_fillGlow(d, falloff) {
  if (d < 0) return 1;
  return clamp(1 - d / falloff, 0, 1);
}
// Pattern: Kaleido Bloom
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// A fixed lattice of dots and rings spins, breathes, and radiates shifting color.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Speed — How fast the lattice spins and breathes;
//           Zoom — Size of the lattice cells;
//           Breathe — How much the zoom pulses in and out;
//           Color Spread — Width of the radial rainbow spreading from the centre.
//
// Notes:
// The render function draws a fixed field of dots and rings on a repeating
// grid. All of the motion — the spin and the breathing zoom — comes from
// rotate()/scale()/translate() composed in beforeRender. The colour is a
// rotating rainbow that radiates from the centre, so the bloom shifts hue as
// it turns rather than sitting on one tone.

export var speed = 1         // spin + breathe rate
export var zoom = 0.85       // lattice cell size
export var breatheAmt = 0.5  // how much the zoom pulses
export var colorSpread = 0.5 // width of the radial rainbow

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v) { zoom = v }
export function sliderBreathe(v) { breatheAmt = v }
export function sliderColorSpread(v) { colorSpread = v }

export var t
var hueShift = 0
// Lattice geometry and rainbow width are frame-constant (slider-derived) —
// computed once per frame, not per pixel.
var CELL, cellHalf, dotR, ringW, spread

 // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the frozen emitted entry signature.
 function __pxlblz_slowmo_in_beforeRender(delta) {
  CELL = 0.15 + zoom * 0.25
  cellHalf = CELL * 0.5
  dotR = CELL * 0.30
  ringW = CELL * 0.07
  spread = 0.5 + colorSpread * 3.5
  var period = 0.3 - speed * 0.22  // smaller period = faster
  t = __pxlblz_slowmo_time(period)
  // Palette cycles on its own steady clock, independent of the spin, so a
  // given petal sweeps through the whole spectrum rather than holding one hue.
  hueShift = __pxlblz_slowmo_time(0.08)

  var spin = t * PI2               // one clean revolution per period
  var amt = 0.2 + breatheAmt * 0.9
  var breathe = 1.4 + amt * wave(t * 2)

  // Spin and breathe about the grid centre (0.5, 0.5).
  resetTransform()
  translate(-0.5, -0.5)
  rotate(spin)
  scale(breathe, breathe)
  translate(0.5, 0.5)
}

 function __pxlblz_slowmo_in_render2D(index, x, y) {
  // x, y arrive already spun and zoomed by the transform stack.
  // Lattice A — solid dots
  var gx = mod(x, CELL) - cellHalf
  var gy = mod(y, CELL) - cellHalf
  var dot = (hypot((gx) - (0), (gy) - (0)) - (dotR))

  // Lattice B — half-offset rings, interleaved with the dots
  var hx = mod(x + cellHalf, CELL) - cellHalf
  var hy = mod(y + cellHalf, CELL) - cellHalf
  var rng = (abs(hypot((hx) - (0), (hy) - (0)) - (dotR)) - (ringW) * 0.5)

  var field = _SDF_smoothUnion(dot, rng, 0.05)
  var lit = _SDF_fillGlow(field, 0.045)

  // Rainbow radiates from the centre and rotates over time.
  var dx = x - 0.5, dy = y - 0.5
  var rad = sqrt(dx * dx + dy * dy)
  var hue = frac(hueShift + rad * spread + (x + y) * 0.12)
  __pxlblz_slowmo_hsv(hue, 0.9, lit * lit)
}

export function beforeRender(delta) {
  __pxlblz_slowmo_cap = 0
  __pxlblz_slowmo_refresh = 0
  if (__pxlblz_slowmo_position >= 0) {
    __pxlblz_slowmo_rate = pow(2,-4*(1-__pxlblz_slowmo_position))
    if (__pxlblz_slowmo_position >= 0.97) __pxlblz_slowmo_bypass = 1
    else if (__pxlblz_slowmo_position < 0.94) __pxlblz_slowmo_bypass = 0
    if (__pxlblz_slowmo_bypass) __pxlblz_slowmo_rate = 1
  } else __pxlblz_slowmo_bypass = 0
  if (__pxlblz_slowmo_bypass) {
    __pxlblz_slowmo_T += delta * 0.0000152587890625
    if (__pxlblz_slowmo_T >= 16384) __pxlblz_slowmo_T -= 16384
    __pxlblz_slowmo_in_beforeRender(delta)
  }
  else if (__pxlblz_slowmo_phase == 0) { __pxlblz_slowmo_in_beforeRender(0); __pxlblz_slowmo_cap = 1 }
  else {
    __pxlblz_slowmo_acc += delta * __pxlblz_slowmo_rate
    var __pxlblz_slowmo_n = 0
    while (__pxlblz_slowmo_acc >= __pxlblz_slowmo_step && __pxlblz_slowmo_n < 4) {
      __pxlblz_slowmo_acc -= __pxlblz_slowmo_step
      __pxlblz_slowmo_T += __pxlblz_slowmo_step * 0.0000152587890625
      if (__pxlblz_slowmo_T >= 16384) __pxlblz_slowmo_T -= 16384
      __pxlblz_slowmo_in_beforeRender(__pxlblz_slowmo_step); __pxlblz_slowmo_n += 1
    }
    if (__pxlblz_slowmo_acc >= __pxlblz_slowmo_step) __pxlblz_slowmo_acc = __pxlblz_slowmo_acc % __pxlblz_slowmo_step
    __pxlblz_slowmo_cap = __pxlblz_slowmo_n > 0
  }
  if (__pxlblz_slowmo_wasBypass && !__pxlblz_slowmo_bypass) { __pxlblz_slowmo_cap = 1; __pxlblz_slowmo_refresh = 1 }
  __pxlblz_slowmo_wasBypass = __pxlblz_slowmo_bypass
  __pxlblz_slowmo_f = __pxlblz_slowmo_acc / __pxlblz_slowmo_step
}
function __pxlblz_slowmo_out(index,o) {
  if (__pxlblz_slowmo_cap) {
    if (__pxlblz_slowmo_phase == 0 || __pxlblz_slowmo_refresh) { __pxlblz_slowmo_ar[index] = __pxlblz_slowmo_r; __pxlblz_slowmo_br[index] = __pxlblz_slowmo_r }
    else { __pxlblz_slowmo_ar[index] = __pxlblz_slowmo_br[index]; __pxlblz_slowmo_br[index] = __pxlblz_slowmo_r }
    if (__pxlblz_slowmo_phase == 0 || __pxlblz_slowmo_refresh) { __pxlblz_slowmo_ag[index] = __pxlblz_slowmo_g; __pxlblz_slowmo_bg[index] = __pxlblz_slowmo_g }
    else { __pxlblz_slowmo_ag[index] = __pxlblz_slowmo_bg[index]; __pxlblz_slowmo_bg[index] = __pxlblz_slowmo_g }
    if (__pxlblz_slowmo_phase == 0 || __pxlblz_slowmo_refresh) { __pxlblz_slowmo_ab[index] = __pxlblz_slowmo_b; __pxlblz_slowmo_bb[index] = __pxlblz_slowmo_b }
    else { __pxlblz_slowmo_ab[index] = __pxlblz_slowmo_bb[index]; __pxlblz_slowmo_bb[index] = __pxlblz_slowmo_b }
  }
  var __pxlblz_slowmo_u = clamp((__pxlblz_slowmo_f-o)/(1-__pxlblz_slowmo_width),0,1)
  var __pxlblz_slowmo_c = __pxlblz_slowmo_curve == 0 ? (__pxlblz_slowmo_u >= 1) : __pxlblz_slowmo_curve == 1 ? __pxlblz_slowmo_u : __pxlblz_slowmo_u*__pxlblz_slowmo_u*(3-2*__pxlblz_slowmo_u)
  rgb(__pxlblz_slowmo_ar[index] + (__pxlblz_slowmo_br[index] - __pxlblz_slowmo_ar[index]) * __pxlblz_slowmo_c, __pxlblz_slowmo_ag[index] + (__pxlblz_slowmo_bg[index] - __pxlblz_slowmo_ag[index]) * __pxlblz_slowmo_c, __pxlblz_slowmo_ab[index] + (__pxlblz_slowmo_bb[index] - __pxlblz_slowmo_ab[index]) * __pxlblz_slowmo_c)
  if (index == pixelCount-1) __pxlblz_slowmo_phase = 1
}
export function render2D(index,x,y) {
  if (__pxlblz_slowmo_bypass) {
    __pxlblz_slowmo_r = 0; __pxlblz_slowmo_g = 0; __pxlblz_slowmo_b = 0
    __pxlblz_slowmo_in_render2D(index,x,y)
    if (index == pixelCount-1) __pxlblz_slowmo_phase = 1
    return
  }
  if (__pxlblz_slowmo_cap) { __pxlblz_slowmo_r = 0; __pxlblz_slowmo_g = 0; __pxlblz_slowmo_b = 0; __pxlblz_slowmo_in_render2D(index,x,y) }
  __pxlblz_slowmo_out(index,__pxlblz_slowmo_width == 0 ? 0 : __pxlblz_slowmo_width * __pxlblz_slowmo_offset2D(index,x,y))
}
