// Coronal Mass Ejection 2D
// A demonstration of Pixelblaze's Perlin noise and smoothstep functions.
//
// Original Pattern: 10/09/2022 ZRanger1
// Source: https://electromage.com/patterns/

var coreSize = 0.1;
var c2 = coreSize / 4;

translate(-0.5,-0.5);
setPerlinWrap(3,256,256);

export function beforeRender(delta) {
  // per-frame animation timers
  t1 = time(.2);
  noiseTime = time(10) * 256;
  noiseYTime = time(8) * 256;
}
export function render2D(index, x, y) {
  // convert to radial coords
  tmp = hypot(x,y); x = atan2(y,x); y = tmp;

  // generate noise field
  v = 1-perlinTurbulence(x,y - noiseYTime,noiseTime,1.5,.25,3)

  // convert noise field to discrete radial "flares"
  v = max(smoothstep(.675,1,v),(1-((y*v)-c2)/coreSize));
  v = v * v * v;

  // draw star + stellar flares, always white hot at center
  // occasionally throwing off super hot flare bits
  hsv(t1-(.125*v),6.5*y-v,v);
}
