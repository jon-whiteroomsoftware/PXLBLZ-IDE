// #914 hand-generated pass output: Rule B lazy position-only memoization
// applied mechanically to the shipped CoronalMassEjection (ZRanger1).
// Site: atan2(y,x) in render2D — position-only, expensive callee atan2.
// Generated shape: bare module cache + built stamp, allocate-once in
// beforeRender when pixelCount > 0, floored/bounded index, sentinel 0
// (a 0-valued result recomputes each frame; exact either way).
// Pattern: Coronal Mass Ejection
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// Credit: "Coronal Mass Ejection 2D" by ZRanger1 — https://github.com/zranger1/PixelblazePatterns
//
// A white-hot star throws off discrete Perlin-noise flares that cool as they arc into the dark.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: None.
//
// Notes:
// ZRanger1's demonstration of Pixelblaze's Perlin noise and smoothstep
// functions, shipped verbatim below. Pixels convert to radial coordinates, a
// scrolling turbulence field is thresholded with smoothstep into discrete
// flares, and hue rides the flare field so the core stays white-hot while
// ejecta cool toward the rim. This is the Pattern the built-in "Coronal Mass
// Ejection Remix" Show choreographs.

// Coronal Mass Ejection 2D
// A demonstration of Pixelblaze's Perlin noise and smoothstep functions
//
// 10/09/2022 ZRanger1


var __pxlblz_memo0
var __pxlblz_memo0_built = 0

var coreSize = 0.1;
var c2 = coreSize / 4;
translate(-0.5,-0.5);
setPerlinWrap(3,256,256);
export function beforeRender(delta) {
  if (__pxlblz_memo0_built == 0 && pixelCount > 0) {
    __pxlblz_memo0 = array(pixelCount)
    __pxlblz_memo0_built = pixelCount
  }

  // per-frame animation timers
  t1 = time(.2);
  noiseTime = time(10) * 256;
  noiseYTime = time(8) * 256;
}

export function render2D(index, x, y) {
  // convert to radial coords
  tmp = hypot(x,y);
  var __pxlblz_ix0 = floor(index)
  var __pxlblz_v0 = 0
  if (__pxlblz_ix0 < __pxlblz_memo0_built) __pxlblz_v0 = __pxlblz_memo0[__pxlblz_ix0]
  if (__pxlblz_v0 == 0) {
    __pxlblz_v0 = atan2(y,x)
    if (__pxlblz_ix0 < __pxlblz_memo0_built) __pxlblz_memo0[__pxlblz_ix0] = __pxlblz_v0
  }
  x = __pxlblz_v0; y = tmp;

  // generate noise field
  v = 1-perlinTurbulence(x,y - noiseYTime,noiseTime,1.5,.25,3)

  // convert noise field to discrete radial "flares"
  v = max(smoothstep(0.675,1,v),(1-((y*v)-c2)/coreSize));
  v = v * v * v;

  // draw star + stellar flares, always white hot at center
  // occasionally throwing off super hot flare bits
  hsv(t1 - (0.125*v),6.5*y-v,v);
}
