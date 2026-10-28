/* global pixelCount, rgb, hsv, hsv24 */
export var sinkMode = 0
export var count = 0
var phase = 0
export function beforeRender(delta) {
  count += 1
  phase = (phase + delta / 1024) % 1
}
function emit(index,x,y,z) {
  var r = count/64 + x/16, g = y/4, b = z/4
  if (sinkMode == 0) rgb(r,g,b)
  else if (sinkMode == 1) hsv(r,g,b)
  else if (sinkMode == 2) hsv24(r,g,b)
}
export function render(index) { emit(index,index/pixelCount,0.25,0.75) }
export function render2D(index,x,y) { emit(index,x,y,0.75) }
export function render3D(index,x,y,z) { emit(index,x,y,z) }
