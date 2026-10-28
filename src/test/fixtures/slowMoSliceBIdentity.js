// Frozen executable emitted by 8935633e841f2b18f8e2e978d9095e3b687774f1 for slowMoStaggerIdentity.js.
// 5 pixels; rate 0.25, step 16, blend, scatter width 0.5, persistence null.
/* global array, pixelCount, clamp, floor, rgb, abs, sqrt */
var __pxlblz_slowmo_rate = 0.25
var __pxlblz_slowmo_step = 16
var __pxlblz_slowmo_curve = 1
var __pxlblz_slowmo_shape = 2
var __pxlblz_slowmo_width = 0.5
var __pxlblz_slowmo_T = 0, __pxlblz_slowmo_acc = 0, __pxlblz_slowmo_f = 0, __pxlblz_slowmo_phase = 0, __pxlblz_slowmo_cap = 0
var __pxlblz_slowmo_r = 0, __pxlblz_slowmo_g = 0, __pxlblz_slowmo_b = 0
var __pxlblz_slowmo_ar = array(pixelCount), __pxlblz_slowmo_ag = array(pixelCount), __pxlblz_slowmo_ab = array(pixelCount)
var __pxlblz_slowmo_br = array(pixelCount), __pxlblz_slowmo_bg = array(pixelCount), __pxlblz_slowmo_bb = array(pixelCount)
function __pxlblz_slowmo_time(interval) { return (__pxlblz_slowmo_T % interval) / interval }
function __pxlblz_slowmo_rgb(r,g,b) { __pxlblz_slowmo_r = clamp(r,0,1); __pxlblz_slowmo_g = clamp(g,0,1); __pxlblz_slowmo_b = clamp(b,0,1) }
function __pxlblz_slowmo_hsv(h,s,v) {
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
function __pxlblz_slowmo_offset3D(index,x,y,z) {
  if (__pxlblz_slowmo_shape == 2) return (index * 0.6180267333984375) % 1
  if (__pxlblz_slowmo_shape == 0) return clamp(x,0,1)
  var dx=x-0.5, dy=y-0.5, dz=z-0.5
  return clamp(sqrt(dx*dx+dy*dy+dz*dz)/0.8660254037844386,0,1)
}
/* global pixelCount, rgb, hsv, hsv24 */
export var sinkMode = 0
export var count = 0
var phase = 0
 function __pxlblz_slowmo_in_beforeRender(delta) {
  count += 1
  phase = (phase + delta / 1024) % 1
}
function emit(index,x,y,z) {
  var r = count/64 + x/16, g = y/4, b = z/4
  if (sinkMode == 0) __pxlblz_slowmo_rgb(r,g,b)
  else if (sinkMode == 1) __pxlblz_slowmo_hsv(r,g,b)
  else if (sinkMode == 2) __pxlblz_slowmo_hsv(r,g,b)
}
 function __pxlblz_slowmo_in_render(index) { emit(index,index/pixelCount,0.25,0.75) }
 function __pxlblz_slowmo_in_render2D(index,x,y) { emit(index,x,y,0.75) }
 function __pxlblz_slowmo_in_render3D(index,x,y,z) { emit(index,x,y,z) }

export function beforeRender(delta) {
  __pxlblz_slowmo_cap = 0
  if (__pxlblz_slowmo_phase == 0) { __pxlblz_slowmo_in_beforeRender(0); __pxlblz_slowmo_cap = 1 }
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
  __pxlblz_slowmo_f = __pxlblz_slowmo_acc / __pxlblz_slowmo_step
}
function __pxlblz_slowmo_out(index,o) {
  if (__pxlblz_slowmo_cap) {
    if (__pxlblz_slowmo_phase == 0) { __pxlblz_slowmo_ar[index] = __pxlblz_slowmo_r; __pxlblz_slowmo_br[index] = __pxlblz_slowmo_r }
    else { __pxlblz_slowmo_ar[index] = __pxlblz_slowmo_br[index]; __pxlblz_slowmo_br[index] = __pxlblz_slowmo_r }
    if (__pxlblz_slowmo_phase == 0) { __pxlblz_slowmo_ag[index] = __pxlblz_slowmo_g; __pxlblz_slowmo_bg[index] = __pxlblz_slowmo_g }
    else { __pxlblz_slowmo_ag[index] = __pxlblz_slowmo_bg[index]; __pxlblz_slowmo_bg[index] = __pxlblz_slowmo_g }
    if (__pxlblz_slowmo_phase == 0) { __pxlblz_slowmo_ab[index] = __pxlblz_slowmo_b; __pxlblz_slowmo_bb[index] = __pxlblz_slowmo_b }
    else { __pxlblz_slowmo_ab[index] = __pxlblz_slowmo_bb[index]; __pxlblz_slowmo_bb[index] = __pxlblz_slowmo_b }
  }
  var __pxlblz_slowmo_u = clamp((__pxlblz_slowmo_f-o)/(1-__pxlblz_slowmo_width),0,1)
  var __pxlblz_slowmo_c = __pxlblz_slowmo_curve == 0 ? (__pxlblz_slowmo_u >= 1) : __pxlblz_slowmo_curve == 1 ? __pxlblz_slowmo_u : __pxlblz_slowmo_u*__pxlblz_slowmo_u*(3-2*__pxlblz_slowmo_u)
  rgb(__pxlblz_slowmo_ar[index] + (__pxlblz_slowmo_br[index] - __pxlblz_slowmo_ar[index]) * __pxlblz_slowmo_c, __pxlblz_slowmo_ag[index] + (__pxlblz_slowmo_bg[index] - __pxlblz_slowmo_ag[index]) * __pxlblz_slowmo_c, __pxlblz_slowmo_ab[index] + (__pxlblz_slowmo_bb[index] - __pxlblz_slowmo_ab[index]) * __pxlblz_slowmo_c)
  if (index == pixelCount-1) __pxlblz_slowmo_phase = 1
}
export function render(index) {
  if (__pxlblz_slowmo_cap) { __pxlblz_slowmo_r = 0; __pxlblz_slowmo_g = 0; __pxlblz_slowmo_b = 0; __pxlblz_slowmo_in_render(index) }
  __pxlblz_slowmo_out(index,__pxlblz_slowmo_width == 0 ? 0 : __pxlblz_slowmo_width * __pxlblz_slowmo_offset1D(index))
}
export function render2D(index,x,y) {
  if (__pxlblz_slowmo_cap) { __pxlblz_slowmo_r = 0; __pxlblz_slowmo_g = 0; __pxlblz_slowmo_b = 0; __pxlblz_slowmo_in_render2D(index,x,y) }
  __pxlblz_slowmo_out(index,__pxlblz_slowmo_width == 0 ? 0 : __pxlblz_slowmo_width * __pxlblz_slowmo_offset2D(index,x,y))
}
export function render3D(index,x,y,z) {
  if (__pxlblz_slowmo_cap) { __pxlblz_slowmo_r = 0; __pxlblz_slowmo_g = 0; __pxlblz_slowmo_b = 0; __pxlblz_slowmo_in_render3D(index,x,y,z) }
  __pxlblz_slowmo_out(index,__pxlblz_slowmo_width == 0 ? 0 : __pxlblz_slowmo_width * __pxlblz_slowmo_offset3D(index,x,y,z))
}
