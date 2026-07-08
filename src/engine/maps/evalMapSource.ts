// The no-shim map-source evaluator. A stock or custom map's authoring
// source is either a literal coordinate array or a single top-level
// `function(pixelCount){ … return coords }` written in plain JavaScript — the
// exact shapes a real Pixelblaze Mapper tab accepts. We run it the same way the
// device's browser does: a bare `new Function`, float64, with NO fixed-point
// shim wrapper (that layer is for patterns only). `Math` and language built-ins
// are in scope for function sources; there are no IDE helpers, no library
// namespaces, no pattern globals.

// Evaluate a map source for the requested pixel count and return its RAW
// coordinate array (natural-unit geometry — the shared normalize pass maps it to
// [0,1] afterwards). Throws a descriptive error if the source is neither a
// function nor an array, or does not produce equal-arity numeric coords.
export function evalMapSource(source: string, pixelCount: number): number[][] {
  let value: unknown
  try {
    // `return (<source>)` so the function expression or array literal is the
    // evaluated value.
    value = new Function(`return (${source})`)()
  } catch (e) {
    throw new Error(`map source failed to compile: ${(e as Error).message}`, { cause: e })
  }

  let raw: unknown = value
  if (typeof value === 'function') {
    try {
      raw = value(pixelCount)
    } catch (e) {
      throw new Error(`map source threw while generating: ${(e as Error).message}`, { cause: e })
    }
  } else if (!Array.isArray(value)) {
    throw new Error('map source must be a coordinate array or a function(pixelCount){ … }')
  }

  if (!Array.isArray(raw)) {
    throw new Error('map source must return an array of coordinates')
  }
  const coords: number[][] = []
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (!Array.isArray(c) || c.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error(`map source coord ${i} is not an array of finite numbers`)
    }
    coords.push(c as number[])
  }
  return coords
}
