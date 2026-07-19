// Pattern: Event Horizon
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Orbiting accretion arcs, a photon ring, and polar jets surround a dark central hole.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Speed — Orbital rate of the accretion disk;
//           Feed — How hard the hole is feeding — arc density, turbulence, and jet response;
//           Jets — Strength of the twin polar jets;
//           Color — Re-temperatures the disk from ember-orange through x-ray blue.
//
// Notes:
// A dark hole rimmed by a razor-thin photon ring, fed by orbiting accretion
// arcs. Differential rotation smears hot spots into trailing arcs,
// relativistic beaming brightens the approaching side, and twin jets vent
// along the axis when the disk feeds hard. Everything is an analytic field in
// (radius, angle) space; the beaming direction and flicker solve per frame.

export var speed = 0.42
export var feed = 0.55 // Recommended pot: how hard the hole feeds - arc density, turbulence, and jet response.
export var color = 0.07 // Recommended pot: re-temperatures the disk from ember-orange through x-ray blue.
export var jets = 0.5

export function sliderSpeed(v) { speed = v }
export function sliderFeed(v) { feed = v }
export function sliderColor(v) { color = v }
export function sliderJets(v) { jets = v }

export var t = 0
var HORIZON = 0.10
var beamC = 1, beamS = 0
var flicker = 1
var arcCount = 3
var jetPower = 0

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.15 + speed * 0.75)
  var beamAngle = t * 0.7
  beamC = cos(beamAngle)
  beamS = sin(beamAngle)
  flicker = 0.72 + 0.28 * wave(t * 3.1) * wave(t * 1.9 + 0.37)
  arcCount = floor(2 + feed * 4)
  jetPower = jets * (0.35 + feed * 0.65)
}

export function render2D(index, x, y) {
  var px = x - 0.5
  var py = y - 0.5
  var r = max(hypot(px, py), 0.001)
  var angle = atan2(py, px)

  // Photon ring: the thin bright rim at the shadow's edge.
  var rim = clamp(1 - abs(r - HORIZON) / 0.02, 0, 1)
  rim = rim * rim

  // Disk envelope: from just outside the horizon, thinning outward.
  var disk = smoothstep(HORIZON + 0.005, HORIZON + 0.05, r) * clamp(1 - (r - HORIZON) / 0.42, 0, 1)

  // Differential rotation: inner material laps the outer, smearing spots
  // into arcs. The 1/r term is what shears them.
  var arcs = 0.5 + 0.5 * sin(angle * arcCount + 2.2 / max(r, HORIZON) - t * 5)
  arcs = arcs * arcs

  // Relativistic beaming: the side sweeping toward us runs brighter.
  var beam = 0.55 + 0.45 * (px * beamC + py * beamS) / r

  var diskV = disk * arcs * beam * flicker

  // Twin jets vent along +/- y, tight near the hole, flaring with feed.
  var jetV = 0
  var above = abs(py) - HORIZON
  if (above > 0 && jetPower > 0) {
    var cone = clamp(1 - abs(px) / (0.028 + above * 0.16), 0, 1)
    jetV = jetPower * cone * cone * clamp(1 - above / 0.42, 0, 1) * flicker
  }

  var value = 0.006 + diskV
  // frac() truncates, so keep the argument positive for the r subtraction.
  var hue = frac(color + 1 + beam * 0.06 - r * 0.10)
  var saturation = clamp(0.95 - diskV * 0.35, 0, 1)
  if (jetV > value) {
    value = jetV
    hue = frac(color + 0.52)
    saturation = 0.65
  }
  if (rim > value) {
    value = rim
    saturation = 0.25
  }
  hsv(hue, saturation, clamp(value, 0, 1))
}
