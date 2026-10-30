/** The wrapper clock uses Pixelblaze time units and wraps after 2^30 ms. */
export const SLOW_MO_CLOCK_VAR = '__pxlblz_slowmo_T'

export function createSlowMoElapsed(): (clock: number) => number {
  let previous = 0
  let elapsed = 0
  return clock => {
    const delta = clock - previous
    elapsed += (delta < 0 ? delta + 16384 : delta) * 65536
    previous = clock
    return elapsed
  }
}
