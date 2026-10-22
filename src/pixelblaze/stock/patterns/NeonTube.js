// Pattern: Neon Tube
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// One uniform grayscale tube of light with a health envelope. A Show
// ingredient rather than a finished piece: tint it and key its Health from a
// Show to make a lamp that ignites, fails and recovers.
// Runs on: 1D strips and rings, and any 2D or 3D map through the 1D adapter;
// every pixel always holds the same value.
// Controls: Health — 1 holds the tube dead steady, 0 keeps it dark; between,
//           it fails in bursts and is off for about (1 - Health) of the time;
//           Seed — Picks a different, repeatable failure texture.
//
// Notes:
// The failure is two octaves of perlin noise over a wrapped clock, thresholded
// at the noise's Health quantile (MU and SIGMA are the measured mean and
// spread of the noise at Seed 0.37, the After Hours weak letter). All frame
// work happens in beforeRender; render writes one constant, so the texture is
// a deterministic function of time and seeks exactly.

var health = 1
var seed = 0
var level = 1
var MU = 0.5
var SIGMA = 0.1071
export function sliderHealth(v) { health = v }
export function sliderSeed(v) { seed = v }
export function beforeRender(delta) {
  if (health >= 0.999) { level = 1; return }
  if (health <= 0.001) { level = 0; return }
  var t = time(1) * 256
  var n = perlin(t, seed * 64, 0, 0) * 0.7 + perlin(t * 6, seed * 64 + 17, 0, 0) * 0.3
  level = n > MU + SIGMA * 0.5876 * log((1 - health) / health) ? 1 : 0
}
export function render(index) { hsv(0, 0, level) }
