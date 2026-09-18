/**
 * Exact per-pixel readings of two retained captures (#1065).
 *
 * The canonical harness decodes its retained PNGs in the page and calls these, so the positions and
 * RGBA a classification rests on come from the images themselves rather than from anything the page
 * reported about its own DOM. There is no tolerance here and no channel threshold: a pixel differs
 * when any of its four channels differs.
 */

export type Rgba = readonly [number, number, number, number]

export interface RgbaImage {
  width: number
  height: number
  /** RGBA rows, four channels per pixel, as `getImageData` returns them. */
  pixels: ArrayLike<number>
}

export interface ChangedPixel { x: number; y: number; left: Rgba; right: Rgba }
export interface PixelSample { x: number; y: number; rgba: Rgba }

/**
 * One comparison of two retained captures: either a measured difference, or the recorded fact that
 * the pair could not be compared at all (#1065).
 *
 * A pair whose captures have different pixel dimensions has no per-position difference to report, so
 * it carries no changed-pixel count. The absence is modelled rather than filled in with zero,
 * because a consumer that reads an unmeasured pair as zero reads "never compared" as "compared and
 * identical" - which is exactly what an exactly-zero gate exists to prevent.
 */
export type PixelMeasurement =
  | { comparable: true; changedPixels: number; maximumChannelDelta: number }
  | { comparable: false; detail: string }

/** True only for a pair that was measured and had no differing pixel. */
export function measuredExact(measurement: PixelMeasurement): boolean {
  return measurement.comparable && measurement.changedPixels === 0 && measurement.maximumChannelDelta === 0
}

/** Every position where the two captures differ, in row order. Mismatched sizes are not comparable. */
export function changedPixelsBetween(left: RgbaImage, right: RgbaImage): ChangedPixel[] {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Captures are ${left.width}x${left.height} and ${right.width}x${right.height};`
      + ' a changed size is never a pixel difference and must not be classified.')
  }
  const changed: ChangedPixel[] = []
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const offset = (y * left.width + x) * 4
      const a = channels(left, offset)
      const b = channels(right, offset)
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3]) changed.push({ x, y, left: a, right: b })
    }
  }
  return changed
}

/**
 * The RGBA this capture actually holds at each position. A position outside the image is left out
 * rather than guessed, so a control that cannot speak for a position is seen not to.
 */
export function samplesAt(image: RgbaImage, positions: readonly { x: number; y: number }[]): PixelSample[] {
  const samples: PixelSample[] = []
  for (const { x, y } of positions) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue
    samples.push({ x, y, rgba: channels(image, (y * image.width + x) * 4) })
  }
  return samples
}

function channels(image: RgbaImage, offset: number): Rgba {
  return [image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2], image.pixels[offset + 3]]
}
