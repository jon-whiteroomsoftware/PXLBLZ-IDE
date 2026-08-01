/**
 * Incremental drag accumulation with a modifier-scaled gain (#667).
 *
 * A fine-adjust drag accumulates per-sample pointer deltas instead of mapping
 * absolute pointer coordinates, so toggling the fine modifier mid-gesture
 * re-anchors implicitly: the accumulated position never jumps, only its rate
 * of change does. With the modifier up the accumulation is exactly equivalent
 * to absolute tracking from the anchor; with it down every pixel of travel
 * counts for a tenth.
 *
 * The position is deliberately left unclamped so an overshoot past a bound
 * unwinds over the same travel that produced it, matching how an absolute
 * mapping behaves; clamp at the point of use.
 */
export const FINE_ADJUST_GAIN = 0.1

export interface FineAdjustDrag {
  lastX: number
  position: number
}

export function beginFineAdjust(x: number, position: number): FineAdjustDrag {
  return { lastX: x, position }
}

export function moveFineAdjust(
  drag: FineAdjustDrag,
  x: number,
  options: {
    /** Fine modifier state for this sample. */
    fine: boolean
    /** Position units per pixel of pointer travel. */
    scale: number
    gain?: number
  },
): FineAdjustDrag {
  const gain = options.fine ? options.gain ?? FINE_ADJUST_GAIN : 1
  return { lastX: x, position: drag.position + (x - drag.lastX) * options.scale * gain }
}
