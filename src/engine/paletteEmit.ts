// Shared #708 palette lookup. Keep this formatting stable: Show artifacts are
// byte-identical when Slow-Mo reuses the lookup with its own capture sink.
export function emitPaletteLookup(paletteState: string, rgbSink: string): string {
  return `  var pal = ${paletteState}
  var stops = floor(pal.length / 4)
  if (stops < 2) { return }
  var p = pos - floor(pos)
  var lo = 0
  for (var s = 0; s < stops - 1; s++) {
    if (pal[s * 4] <= p) lo = s
  }
  var hi = lo + 1
  if (hi > stops - 1) hi = stops - 1
  var span = pal[hi * 4] - pal[lo * 4]
  var mix = 0
  if (span > 0) mix = clamp((p - pal[lo * 4]) / span, 0, 1)
  ${rgbSink}(
    (pal[lo * 4 + 1] + (pal[hi * 4 + 1] - pal[lo * 4 + 1]) * mix) * v,
    (pal[lo * 4 + 2] + (pal[hi * 4 + 2] - pal[lo * 4 + 2]) * mix) * v,
    (pal[lo * 4 + 3] + (pal[hi * 4 + 3] - pal[lo * 4 + 3]) * mix) * v
  )`
}
