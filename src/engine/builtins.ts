export interface BuiltinFn {
  name: string
  params: string[]
  doc: string
}

export interface BuiltinConst {
  name: string
  doc: string
}

export interface SignatureContext {
  fnName: string
  activeParam: number
}

export const BUILTIN_FUNCTIONS: readonly BuiltinFn[] = [
  // Render callbacks
  { name: 'render',        params: ['index'],
    doc: 'Called for each pixel every frame. Set the pixel color for `index` using `hsv()` or `rgb()`.' },
  { name: 'render2D',      params: ['index', 'x', 'y'],
    doc: 'Called for each pixel every frame with normalized 2D coordinates. Set color using `hsv()` or `rgb()`.' },
  { name: 'beforeRender',  params: ['delta'],
    doc: 'Called once per frame before pixels render. `delta` is elapsed time in milliseconds since the last frame.' },
  { name: 'afterRender',   params: [],
    doc: 'Called once per frame after all pixels have been rendered.' },
  // Color
  { name: 'hsv',           params: ['h', 's', 'v'],
    doc: 'Set pixel color by hue (0–1), saturation (0–1), and value/brightness (0–1). Hue wraps at 1.' },
  { name: 'rgb',           params: ['r', 'g', 'b'],
    doc: 'Set pixel color by red, green, and blue components (0–1).' },
  // Waveform / interpolation
  { name: 'time',          params: ['interval'],
    doc: 'Returns a 0→1 sawtooth that repeats every `interval × 65.536` seconds. Use for smooth animation timing.' },
  { name: 'wave',          params: ['v'],
    doc: 'Maps a 0–1 sawtooth `v` to a smooth 0–1 sine-like wave (peak at 0.5).' },
  { name: 'triangle',      params: ['v'],
    doc: 'Triangle wave: linearly ramps 0→1→0 over one cycle of `v` (0–1).' },
  { name: 'square',        params: ['v', 'duty'],
    doc: 'Square wave: returns 1 when `v < duty`, else 0. `duty` controls the on-fraction.' },
  { name: 'mix',           params: ['lo', 'hi', 'w'],
    doc: 'Linear interpolation: `lo + (hi − lo) × w`. `w = 0` gives `lo`, `w = 1` gives `hi`. Extrapolates outside [0, 1].' },
  { name: 'smoothstep',    params: ['lo', 'hi', 'v'],
    doc: 'Smooth Hermite interpolation that returns 0 when `v ≤ lo` and 1 when `v ≥ hi`, with a smooth S-curve between.' },
  { name: 'bezierQuadratic', params: ['t', 'p0', 'p1', 'p2'],
    doc: 'Quadratic Bézier curve at parameter `t` (0–1) through control points `p0`, `p1`, `p2`.' },
  { name: 'bezierCubic',   params: ['t', 'p0', 'p1', 'p2', 'p3'],
    doc: 'Cubic Bézier curve at parameter `t` (0–1) through four control points.' },
  { name: 'clamp',         params: ['v', 'lo', 'hi'],
    doc: 'Clamps `v` to the range [lo, hi].' },
  { name: 'map',           params: ['v', 'fromLow', 'fromHigh', 'toLow', 'toHigh'],
    doc: 'Maps `v` from one numeric range to another. Extrapolates outside the input range.' },
  // Math
  { name: 'sin',           params: ['v'],
    doc: 'Sine of `v` in radians.' },
  { name: 'cos',           params: ['v'],
    doc: 'Cosine of `v` in radians.' },
  { name: 'tan',           params: ['v'],
    doc: 'Tangent of `v` in radians.' },
  { name: 'asin',          params: ['v'],
    doc: 'Arc sine; returns radians in [−π/2, π/2]. Input clamped to [−1, 1].' },
  { name: 'acos',          params: ['v'],
    doc: 'Arc cosine; returns radians in [0, π]. Input clamped to [−1, 1].' },
  { name: 'atan',          params: ['v'],
    doc: 'Arc tangent of `v`; returns radians in [−π/2, π/2].' },
  { name: 'atan2',         params: ['y', 'x'],
    doc: 'Arc tangent of `y/x`, using both signs to determine the correct quadrant. Returns [−π, π].' },
  { name: 'abs',           params: ['v'],
    doc: 'Absolute value of `v`.' },
  { name: 'floor',         params: ['v'],
    doc: 'Largest integer ≤ `v`.' },
  { name: 'ceil',          params: ['v'],
    doc: 'Smallest integer ≥ `v`.' },
  { name: 'round',         params: ['v'],
    doc: 'Round to nearest integer.' },
  { name: 'trunc',         params: ['v'],
    doc: 'Truncate toward zero (drop the fractional part).' },
  { name: 'frac',          params: ['v'],
    doc: 'Fractional part: `v − trunc(v)`. Negative for negative inputs. Note: hardware uses truncate-based frac, not floor-based.' },
  { name: 'sqrt',          params: ['v'],
    doc: 'Square root of `v`.' },
  { name: 'hypot',         params: ['x', 'y'],
    doc: 'Euclidean distance √(x² + y²).' },
  { name: 'hypot3',        params: ['x', 'y', 'z'],
    doc: '3D Euclidean distance √(x² + y² + z²).' },
  { name: 'pow',           params: ['base', 'exp'],
    doc: '`base` raised to the power `exp`.' },
  { name: 'exp',           params: ['v'],
    doc: 'e raised to the power `v` (eˣ).' },
  { name: 'log',           params: ['v'],
    doc: 'Natural logarithm of `v`.' },
  { name: 'log2',          params: ['v'],
    doc: 'Base-2 logarithm of `v`.' },
  { name: 'mod',           params: ['x', 'y'],
    doc: 'Remainder of `x / y` (same sign as `x`).' },
  { name: 'min',           params: ['a', 'b'],
    doc: 'Smaller of `a` and `b`.' },
  { name: 'max',           params: ['a', 'b'],
    doc: 'Larger of `a` and `b`.' },
  { name: 'random',        params: ['max'],
    doc: 'Random float in [0, max). Re-seeded each frame, so values differ every frame.' },
  { name: 'prng',          params: ['max'],
    doc: 'Pseudo-random float in [0, max). Deterministic sequence within a frame — calling `prng` the Nth time always returns the same value for that N.' },
  { name: 'prngSeed',      params: ['seed'],
    doc: 'Seed the PRNG used by `prng()`. Same seed gives the same sequence of values.' },
  // Array
  { name: 'array',         params: ['n'],
    doc: 'Create a fixed-size array of `n` elements initialized to 0.' },
  { name: 'arrayLength',   params: ['a'],
    doc: 'Number of elements in array `a`.' },
  { name: 'arrayForEach',  params: ['a', 'fn'],
    doc: 'Call `fn(value, index)` for each element of `a`.' },
  { name: 'arrayReduce',   params: ['a', 'fn', 'initialValue'],
    doc: 'Reduce array `a` to a single value, calling `fn(accumulator, value, index)` for each element.' },
  { name: 'arraySum',      params: ['a'],
    doc: 'Sum all elements in array `a`.' },
  { name: 'arraySort',     params: ['a'],
    doc: 'Sort array `a` in ascending order in place.' },
  { name: 'arraySortBy',   params: ['a', 'fn'],
    doc: 'Sort array `a` in place using comparator `fn(a, b)` — return negative if `a < b`, positive if `a > b`.' },
  { name: 'arrayMutate',   params: ['a', 'fn'],
    doc: 'Replace each element of `a` with `fn(value, index)`.' },
  { name: 'arrayMapTo',    params: ['src', 'dest', 'fn'],
    doc: 'Map each element of `src` through `fn(value, index)` and write results into `dest`.' },
  { name: 'arrayReplace',  params: ['a'],
    doc: 'Fill array `a` from another array or value.' },
  { name: 'arrayReplaceAt', params: ['a', 'offset'],
    doc: 'Copy values into array `a` starting at `offset`.' },
  // Clock
  { name: 'clockYear',     params: [],    doc: 'Current year (e.g. 2024). Requires clock sync from the app.' },
  { name: 'clockMonth',    params: [],    doc: 'Current month (1–12). Requires clock sync from the app.' },
  { name: 'clockDay',      params: [],    doc: 'Current day of month (1–31). Requires clock sync from the app.' },
  { name: 'clockHour',     params: [],    doc: 'Current hour (0–23). Requires clock sync from the app.' },
  { name: 'clockMinute',   params: [],    doc: 'Current minute (0–59). Requires clock sync from the app.' },
  { name: 'clockSecond',   params: [],    doc: 'Current second (0–59). Requires clock sync from the app.' },
  { name: 'clockWeekday',  params: [],    doc: 'Current weekday (0 = Sunday … 6 = Saturday). Requires clock sync from the app.' },
  // Perlin noise
  { name: 'perlin',        params: ['x', 'y', 'z', 'seed'],
    doc: 'Classic Perlin noise at 3D coordinate (x, y, z) with given seed. Returns roughly [−1, 1].' },
  { name: 'perlinFbm',     params: ['x', 'y', 'z', 'lacunarity', 'gain', 'octaves'],
    doc: 'Fractal Brownian Motion: layered Perlin octaves for organic, natural-looking noise. `lacunarity` scales frequency each octave; `gain` scales amplitude.' },
  { name: 'perlinRidge',   params: ['x', 'y', 'z', 'lacunarity', 'gain', 'offset', 'octaves'],
    doc: 'Ridged Perlin noise: creates sharp ridges for mountain-like or cracked-surface patterns.' },
  { name: 'perlinTurbulence', params: ['x', 'y', 'z', 'lacunarity', 'gain', 'octaves'],
    doc: 'Turbulence noise: absolute-value Perlin octaves for rough, fiery texture.' },
  { name: 'setPerlinWrap', params: ['x', 'y', 'z'],
    doc: 'Set the wrap period on each axis so Perlin noise tiles seamlessly.' },
]

export const BUILTIN_CONSTANTS: readonly BuiltinConst[] = [
  { name: 'PI',         doc: 'π — ratio of a circle\'s circumference to its diameter (≈ 3.14159).' },
  { name: 'E',          doc: 'Euler\'s number e, the base of the natural logarithm (≈ 2.71828).' },
  { name: 'pixelCount', doc: 'Number of LEDs in the current strip or matrix.' },
]

// ── Signature context resolution ────────────────────────────────────────────

/**
 * Given line content and a 0-based column, walks backwards to find which
 * function call the cursor is inside and which parameter position is active.
 * Returns null if the cursor is not inside a known call.
 */
export function resolveSignatureContext(
  line: string,
  column: number,
): SignatureContext | null {
  let depth = 0
  let activeParam = 0

  for (let i = column - 1; i >= 0; i--) {
    const ch = line[i]
    if (ch === ')') {
      depth++
    } else if (ch === '(') {
      if (depth > 0) {
        depth--
        continue
      }
      // Found the opening paren for this call — read the function name.
      const end = i
      let start = end - 1
      while (start >= 0 && /[\w$]/.test(line[start])) start--
      start++
      const fnName = line.slice(start, end)
      if (!fnName) return null
      return { fnName, activeParam }
    } else if (ch === ',' && depth === 0) {
      activeParam++
    }
  }

  return null
}
