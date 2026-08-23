// Shared silhouette gauge emission (#690): one generated-code source for the
// spatial SDF catalogue, used by both the Portal transition and the Clip
// aperture emitters. Each helper returns the shape's gauge (Minkowski) metric
// over pre-rotated, aspect- or frame-normalized coordinates: 1 on the
// boundary, scaling linearly from the shape's center, so `gauge <= radius`
// tests a radius-scaled silhouette and `(gauge - 1) * minorRadius` restores an
// approximately real-width signed distance for feather bands.

import { HEART_HALF_DIAGONAL } from './showShapeReveal'

const PI = Math.PI
const TAU = Math.PI * 2

/** Catalogue shapes whose metric needs emitted helper support. */
export type SpatialGaugeShape =
  | 'cross' | 'heart' | 'star' | 'polygon' | 'cloud'
  | 'cat-head' | 'cat-side-profile' | 'bastet'

export interface SpatialGaugeParameters {
  crossWidth?: number
  starPoints?: number
  starInner?: number
  polygonSides?: number
}

/** Ordered so dependencies precede dependents in the emitted program. */
const HELPER_SOURCES: ReadonlyArray<{ name: string; source: string }> = [
  // Pixelblaze frac() truncates toward zero, so every frac argument below is
  // shifted by an exact whole period to stay non-negative for any atan2 angle
  // (#691: the sign-preserving negative branch mirrors the fold and corrupted
  // upper-half-plane metrics on the firmware-accurate runtime).
  {
    name: '__pxlblz_show_gauge_tent',
    source: `function __pxlblz_show_gauge_tent(angle, target, width) {
  return max(0, 1 - abs(frac((angle - target + ${PI} + ${TAU}) / ${TAU}) * ${TAU} - ${PI}) / width)
}`,
  },
  {
    name: '__pxlblz_show_gauge_bump',
    source: `function __pxlblz_show_gauge_bump(angle, target, width) {
  return 0.5 + 0.5 * cos(${PI} * min(abs(frac((angle - target + ${PI} + ${TAU}) / ${TAU}) * ${TAU} - ${PI}) / width, 1))
}`,
  },
  {
    name: '__pxlblz_show_gauge_cross',
    source: `function __pxlblz_show_gauge_cross(u, v, width) {
  return min(max(abs(u), abs(v) / width), max(abs(u) / width, abs(v)))
}`,
  },
  {
    name: '__pxlblz_show_gauge_polygon',
    source: `function __pxlblz_show_gauge_polygon(u, v, sides) {
  var sector = ${TAU} / sides
  var local = frac((atan2(v, u) + sector / 2 + ${TAU}) / sector) * sector - sector / 2
  return hypot(u, v) * cos(local) / cos(${PI} / sides)
}`,
  },
  {
    name: '__pxlblz_show_gauge_star',
    source: `function __pxlblz_show_gauge_star(u, v, points, inner) {
  var half = ${PI} / points
  var phase = frac((atan2(v, u) + ${PI / 2} + ${TAU}) / ${TAU} * points)
  var psi = min(phase, 1 - phase) * 2 * half
  return hypot(u, v) * (inner * sin(half - psi) + sin(psi)) / (inner * sin(half))
}`,
  },
  {
    name: '__pxlblz_show_gauge_heart',
    source: `function __pxlblz_show_gauge_heart(u, v) {
  var r2 = u * u + v * v
  var g = (abs(u) + abs(v)) / ${HEART_HALF_DIAGONAL}
  var left = ${-HEART_HALF_DIAGONAL / 2} * (u + v)
  var right = ${HEART_HALF_DIAGONAL / 2} * (u - v)
  if (left > 0.001 && r2 * 0.5 < left * g) g = r2 / (2 * left)
  if (right > 0.001 && r2 * 0.5 < right * g) g = r2 / (2 * right)
  return g
}`,
  },
  {
    name: '__pxlblz_show_gauge_cloud',
    source: `function __pxlblz_show_gauge_cloud(u, v) {
  var angle = atan2(v, u)
  var crown = 0.58 + max(0.36 * __pxlblz_show_gauge_bump(angle, ${-PI / 2}, 0.9), max(0.3 * __pxlblz_show_gauge_bump(angle, -2.3, 0.85), 0.3 * __pxlblz_show_gauge_bump(angle, -0.84, 0.85)))
  return hypot(u, v) / min(crown, 0.44 / max(sin(angle), 0.05))
}`,
  },
  {
    name: '__pxlblz_show_gauge_cat_head',
    source: `function __pxlblz_show_gauge_cat_head(u, v) {
  var angle = atan2(v, u)
  return hypot(u, v) / (0.72 + 0.42 * (__pxlblz_show_gauge_tent(angle, -2.2, 0.38) + __pxlblz_show_gauge_tent(angle, -0.94, 0.38)))
}`,
  },
  {
    name: '__pxlblz_show_gauge_cat_side',
    source: `function __pxlblz_show_gauge_cat_side(u, v) {
  var angle = atan2(v, u)
  return hypot(u, v) / (0.62 + 0.3 * __pxlblz_show_gauge_tent(angle, -0.2, 0.65) + 0.38 * __pxlblz_show_gauge_tent(angle, -2.75, 0.42) + 0.22 * __pxlblz_show_gauge_tent(angle, 1.35, 0.34))
}`,
  },
  {
    name: '__pxlblz_show_gauge_bastet',
    source: `function __pxlblz_show_gauge_bastet(u, v) {
  var angle = atan2(v, u)
  return hypot(u, v) / (0.55 + 0.34 * (__pxlblz_show_gauge_tent(angle, -1.96, 0.3) + __pxlblz_show_gauge_tent(angle, -1.18, 0.3)) + 0.38 * __pxlblz_show_gauge_tent(angle, ${PI / 2}, 0.68))
}`,
  },
]

const HELPER_NAME_BY_SHAPE: Record<SpatialGaugeShape, string> = {
  'cross': '__pxlblz_show_gauge_cross',
  'heart': '__pxlblz_show_gauge_heart',
  'star': '__pxlblz_show_gauge_star',
  'polygon': '__pxlblz_show_gauge_polygon',
  'cloud': '__pxlblz_show_gauge_cloud',
  'cat-head': '__pxlblz_show_gauge_cat_head',
  'cat-side-profile': '__pxlblz_show_gauge_cat_side',
  'bastet': '__pxlblz_show_gauge_bastet',
}

/** The gauge-metric call for `shape` over normalized coordinate expressions. */
export function spatialGaugeCallExpression(
  shape: SpatialGaugeShape,
  uExpression: string,
  vExpression: string,
  parameters: SpatialGaugeParameters = {},
): string {
  const helper = HELPER_NAME_BY_SHAPE[shape]
  if (shape === 'cross') {
    return `${helper}(${uExpression}, ${vExpression}, ${parameters.crossWidth ?? 0.32})`
  }
  if (shape === 'star') {
    return `${helper}(${uExpression}, ${vExpression}, ${parameters.starPoints ?? 5}, ${parameters.starInner ?? 0.45})`
  }
  if (shape === 'polygon') {
    return `${helper}(${uExpression}, ${vExpression}, ${parameters.polygonSides ?? 6})`
  }
  return `${helper}(${uExpression}, ${vExpression})`
}

/**
 * Prepends the gauge helper functions a generated program references,
 * dependency-closed and in declaration-before-use order. Programs without
 * gauge calls pass through untouched.
 */
export function injectSpatialGaugeHelpers(code: string): string {
  const needed = new Set(
    HELPER_SOURCES.filter(({ name }) => code.includes(`${name}(`)).map(({ name }) => name),
  )
  if (needed.size === 0) return code
  // One closure pass suffices: shape helpers only reference the leaf bumps.
  for (const { name, source } of HELPER_SOURCES) {
    if (!needed.has(name)) continue
    for (const dependency of HELPER_SOURCES) {
      if (dependency.name !== name && source.includes(`${dependency.name}(`)) {
        needed.add(dependency.name)
      }
    }
  }
  const sources = HELPER_SOURCES
    .filter(({ name }) => needed.has(name))
    .map(({ source }) => source)
  return `${sources.join('\n')}\n${code}`
}
