// Eclipse Dome authoring vocabulary (#1134), shared by the Eclipse
// Installations in `showsV2.ts`. It lives in its own module because the
// catalogue array there is built at module load, before that file's own
// constants would initialise.
import type { ShowClipEffect, ShowClipViewport, ShowStructuredEasing } from '@/engine/personalContentRecords'
import type { ShowPropertyTargetV2, ShowRecordV2 } from '@/engine/showCompositionV2'
import {
  SINE_IN_OUT,
  installationOutputContract,
  nativeShowV2,
  occurrence,
  physicalZones,
  propertyKey,
  propertyTrack,
  singleLayout,
  type NativeShowV2Input,
} from './showsV2Authoring'

// Eclipse Dome (#1134): a 400-LED dome wound apex to rim as one spiral strip,
// inside a 90-LED halo ring (#1135). Each Eclipse Installation drives one
// logical Zone over all 490 pixels, so Patterns and Apertures read the map's
// true frontal coordinates and the dome and halo are regions of that Zone,
// separated by geometry. (Physical Zone ranges sample a synthetic index grid,
// which would scramble the spiral.) The halo lies on the frame's outer circle.
const ECLIPSE_PIXELS = 490
export const ECLIPSE_ZONE = 'zone-1'
/** Dome radius in Stage units: a 26.6 cm dome inside a 47.7 cm halo. */
export const ECLIPSE_DOME_RADIUS = 26.6 / (2 * 47.7)

export function eclipseDomeShowV2(
  input: Pick<NativeShowV2Input, 'id' | 'name' | 'showEndMs' | 'patternInstances' | 'layers' | 'clips' | 'propertyTracks' | 'markers'>,
): ShowRecordV2 {
  const zones = physicalZones(['Eclipse Dome'], [ECLIPSE_PIXELS])
  return nativeShowV2({
    ...input,
    zones,
    zoneLayouts: [singleLayout(zones, 'layout-eclipse', 'Eclipse Dome')],
    stageMapId: 'eclipse-dome-2d',
    outputContract: installationOutputContract('eclipse-dome-2d', ECLIPSE_PIXELS),
    executionModel: 'continuous',
    layoutOccurrences: [occurrence(1, 'layout-eclipse', 0, input.showEndMs)],
  })
}

/** A centred square frame `f` dome radii across, for round Apertures. */
export function eclipseDisc(f: number): Pick<ShowClipViewport, 'x' | 'y' | 'width' | 'height'> {
  const size = Math.max(0.01, 2 * f * ECLIPSE_DOME_RADIUS)
  return { x: 0.5 - size / 2, y: 0.5 - size / 2, width: size, height: size }
}

/** Dome-relative horizontal position (0 the left rim, 1 the right) in Stage x. */
export function eclipseAcross(v: number): number {
  return 0.5 - ECLIPSE_DOME_RADIUS + 2 * ECLIPSE_DOME_RADIUS * v
}

/** Halo-only confinement: an inverted disc just wider than the dome. */
export const ECLIPSE_HALO_ONLY: ShowClipViewport = { enabled: true, ...eclipseDisc(1.15), aperture: 'ellipse', edge: 'hard', invert: true }

/** Colour-only dome confinement, which leaves the Clip's one Aperture free. */
export function eclipseDomeOnly(id: string): ShowClipEffect {
  return { id, kind: 'vignette', amount: 1, radius: ECLIPSE_DOME_RADIUS + 0.004, softness: 0.012, centerX: 0.5, centerY: 0.5, aspect: 1 }
}

export function eclipseTint(id: string, shadow: readonly number[], highlight: readonly number[]): ShowClipEffect {
  return {
    id, kind: 'color-map', amount: 1,
    shadowR: shadow[0], shadowG: shadow[1], shadowB: shadow[2],
    highlightR: highlight[0], highlightG: highlight[1], highlightB: highlight[2],
  }
}

export type EclipseKey = [timeMs: number, value: number, easing?: ShowStructuredEasing]

/** A track active from its first key to its last; keys default to sine in-out. */
export function eclipseTrack(id: string, target: ShowPropertyTargetV2, keys: readonly EclipseKey[]) {
  const startMs = keys[0][0]
  return propertyTrack(id, target, startMs, keys[keys.length - 1][0] - startMs,
    keys.map(([timeMs, value, easing], index) => propertyKey(`${id}:k${index + 1}`, timeMs, value, easing ?? SINE_IN_OUT)))
}
