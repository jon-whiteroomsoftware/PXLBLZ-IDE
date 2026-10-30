// Frozen plain Blend emitted by 58439695f7814b35adb5901b3d495e6ffd8753aa for stock WavyBands.
/* global abs, array, clamp, floor, h: writable, hsv, hsv24, perlin, pixelCount, pow, rgb, sin, sqrt, timebase: writable, tx: writable, ty: writable, v: writable */
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
function __pxlblz_slowmo_offset1D(index) {
  if (__pxlblz_slowmo_shape == 2) return (index * 0.6180267333984375) % 1
  if (__pxlblz_slowmo_shape == 0) return index/pixelCount
  
  return abs(2*index/pixelCount-1)
}
function __pxlblz_slowmo_offset2D(index,x,y) {
  if (__pxlblz_slowmo_shape == 2) return (index * 0.6180267333984375) % 1
  if (__pxlblz_slowmo_shape == 0) return clamp(x,0,1)
  var dx=x-0.5, dy=y-0.5
  return clamp(sqrt(dx*dx+dy*dy)/0.7071067811865476,0,1)
}
// Pattern: Wavy Bands
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// Credit: "Wavy Bands" by ZRanger1 - https://patterns.electromage.com/pattern/bG3g3fjrxqxPtqi9d
// License: MIT License.
//
// Perlin distortion turns colorful vertical columns into softly moving bands.
// Runs on: 2D maps with a 1D fallback renderer.
// Controls: None.

// Colorful Wavy Vertical Bands
//
// Best on a correctly configured 2D map, but supports
// 1D as well.
//
// MIT License - use this code to make more cool things!
//
// 6/22/2023 ZRanger1

// number of displayed columns. Could easily have a UI control
export var nColumns = 4

timebase = 0;
 function __pxlblz_slowmo_in_beforeRender(delta) {
  timebase = (timebase + delta / 1000) % 3600

  tx = -timebase / 4    // speed of x axis movement
  ty = timebase / 2    // speed of y axis movement
}

 function __pxlblz_slowmo_in_render2D(index,x,y) {
  // distort y coord with perlin noise to vary width of individual columns
  // (constant multipliers are hand-tuned)
  y -= 0.3 * perlin(x * 2, y * 2, ty, 1.618)

  // distort x coord to create wave patterns
  x += 0.1752 * sin(4 * (tx + y))

  // quantize color into the specified number of column bins
  h = floor(x * nColumns)

  // the original shader colors column edges black. Here, we darken
  // and antialias them, which looks better at low resolution
  v = (x * nColumns - 0.5)
  v =  1-(2*abs(v - h));

  // calculate the final column color, adjust brightness
  // gradient bit and display the pixel
  __pxlblz_slowmo_hsv(h / nColumns, 0.9, pow(v,1.25))
}

 function __pxlblz_slowmo_in_render(index) {
  __pxlblz_slowmo_in_render2D(index,index/pixelCount,0.25);
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
export function render(index) {
  if (__pxlblz_slowmo_bypass) {
    __pxlblz_slowmo_r = 0; __pxlblz_slowmo_g = 0; __pxlblz_slowmo_b = 0
    __pxlblz_slowmo_in_render(index)
    if (index == pixelCount-1) __pxlblz_slowmo_phase = 1
    return
  }
  if (__pxlblz_slowmo_cap) { __pxlblz_slowmo_r = 0; __pxlblz_slowmo_g = 0; __pxlblz_slowmo_b = 0; __pxlblz_slowmo_in_render(index) }
  __pxlblz_slowmo_out(index,__pxlblz_slowmo_width == 0 ? 0 : __pxlblz_slowmo_width * __pxlblz_slowmo_offset1D(index))
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
