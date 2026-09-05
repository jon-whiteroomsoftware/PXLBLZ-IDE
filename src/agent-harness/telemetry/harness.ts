// Provenance: pxlblz-v3 src/telemetry/harness.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Tier-1 telemetry: deterministic low-N headless render of a compiled Show
// (or bare Pattern) with metrics computed inside the render loop — no frames
// are stored. Pure logic: no CLI, MCP, or filesystem imports.
import { createShim } from '@/engine/shim'
import { loadPattern } from '@/engine/loadPattern'
import { SOURCE_STOCK_MAPS } from '@/pixelblaze/stock/maps/stockCatalogue'

type PatternMetadata = Parameters<typeof loadPattern>[1]

export interface TelemetryThresholds {
  /** A pixel at or above this luminance counts as active/lit. */
  activeLuminance: number
  /** A pixel below this luminance counts as dark (the "below 5%" of summaries). */
  darkLuminance: number
  /** A second is a dark second when at least this fraction of pixel samples were dark. */
  darkPixelFraction: number
  /** A second is static when mean per-frame luminance change stays at or below this. */
  staticDeltaEnergy: number
  /** Minimum consecutive seconds before a dark/static run becomes an event. */
  minEventSeconds: number
  /** Extremum-to-extremum luminance swing that counts as a flash transition
   * (WCAG general-flash contrast floor). */
  flashSwingLuminance: number
  /** Flashes per second a pixel may reach before it violates (WCAG allows
   * at most three; more than this fails). */
  flashMaxPerSecond: number
  /** Upper edge of the analyzed flash band; faster alternation is beyond
   * flicker-fusion concern. */
  flashBandTopHz: number
  /** Fraction of pixels that must violate in the same second before the gate
   * fails (WCAG limits flashing area; on an LED fixture, pixel fraction is
   * the available proxy). */
  flashAreaFraction: number
}

export const DEFAULT_THRESHOLDS: TelemetryThresholds = {
  activeLuminance: 0.05,
  darkLuminance: 0.05,
  darkPixelFraction: 0.9,
  staticDeltaEnergy: 0.001,
  minEventSeconds: 5,
  flashSwingLuminance: 0.1,
  flashMaxPerSecond: 3,
  flashBandTopHz: 30,
  flashAreaFraction: 0.25,
}

export interface TelemetryOptions {
  durationMs: number
  /** Modeled pixel count on the square stock map (default 64 → 8×8). */
  pixelCount?: number
  /** Whole frames per second of virtual time (default 30). */
  fps?: number
  /** Shim random seed; fixed by default so reports are reproducible. */
  randomSeed?: number
  thresholds?: Partial<TelemetryThresholds>
}

export interface TelemetryEvent {
  kind: 'dark-stretch' | 'static-stretch'
  startMs: number
  durationMs: number
  /** dark-stretch: mean fraction of dark pixel samples across the stretch. */
  darkFraction?: number
}

export interface FlickerViolation {
  startMs: number
  durationMs: number
  /** Mean flash rate among violating pixels across the interval. */
  meanFlashHz: number
  maxFlashHz: number
  /** Mean fraction of pixels violating across the interval. */
  affectedPixelFraction: number
}

export interface FlickerGateResult {
  /** Hard verdict: false is terminal, never advisory. */
  pass: boolean
  /** Band actually analyzed: [3+ flashes/s floor, min(configured top, Nyquist)]. */
  analyzedBandHz: [number, number]
  /** True when fps caps analysis below the configured band top. */
  bandLimitedByFps: boolean
  perSecondViolatingFraction: number[]
  violations: FlickerViolation[]
}

export interface TelemetryReport {
  input: {
    pixelCount: number
    fps: number
    durationMs: number
    frameCount: number
    randomSeed: number
    map: string
    thresholds: TelemetryThresholds
  }
  luminance: {
    mean: number
    stdDev: number
    frameMin: number
    frameMax: number
    perSecondMean: number[]
  }
  temporal: {
    /** Mean absolute per-pixel luminance change between consecutive frames. */
    meanDeltaEnergy: number
    perSecondDeltaEnergy: number[]
  }
  spatial: {
    /** Fraction of pixels that were active in at least one frame. */
    everActiveFraction: number
    /** Mean fraction of pixels active per frame. */
    meanActiveFraction: number
  }
  palette: {
    /** Share of colored samples per 30° hue band (12 bands from red). */
    hueBinShares: number[]
    dominantHueBinShare: number
    activeHueBins: number
    meanSaturation: number
    /** Fraction of all pixel samples that were colored (visible and saturated). */
    coloredSampleFraction: number
  }
  events: TelemetryEvent[]
  flicker: FlickerGateResult
  summary: string
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

function luminanceOf(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Hue bin (0..11) and saturation for an RGB sample, or null when the sample
 * is too dim or too gray to have a meaningful hue. */
function hueSample(r: number, g: number, b: number): { bin: number; saturation: number } | null {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < 0.05) return null
  const saturation = (max - min) / max
  if (saturation < 0.15) return null
  const delta = max - min
  let hue: number
  if (max === r) hue = ((g - b) / delta + 6) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  const bin = Math.floor((hue / 6) * 12) % 12
  return { bin, saturation }
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const percent = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`

export function runTelemetry(
  code: string,
  metadata: PatternMetadata,
  options: TelemetryOptions,
): TelemetryReport {
  const pixelCount = options.pixelCount ?? 64
  const fps = options.fps ?? 30
  if (!Number.isInteger(fps) || fps <= 0) throw new Error(`fps must be a positive integer, got ${fps}`)
  const randomSeed = options.randomSeed ?? 207
  const thresholds: TelemetryThresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds }
  const frameCount = Math.max(1, Math.round((options.durationMs / 1000) * fps))
  const deltaMs = 1000 / fps

  const planeMap = SOURCE_STOCK_MAPS.find((map) => map.id === 'plane')
  if (!planeMap) throw new Error('stock map "plane" missing from the vendored catalogue')
  const mapPoints = planeMap.resolve(pixelCount)

  let virtualTime = 0
  const shim = createShim({
    pixelCount,
    dimensions: 2,
    mapPoints,
    getVirtualTime: () => virtualTime,
    randomSeed,
  })
  const handle = loadPattern(code, metadata, shim.builtins)
  const renderFns = metadata.renderFns
  const renderPixel: (index: number) => void = renderFns?.hasRender2D
    ? (index) => {
        const [x, y] = mapPoints[index].sample
        handle.render2D(index, x, y)
      }
    : renderFns?.hasRender
      ? (index) => handle.render(index)
      : (index) => {
          const [x, y] = mapPoints[index].sample
          handle.render3D(index, x, y, 0)
        }

  // In-loop accumulators — nothing per-frame is retained beyond these.
  const previousLuminance = new Float64Array(pixelCount)
  const everActive = new Uint8Array(pixelCount)
  const hueBins = new Array<number>(12).fill(0)
  let meanOfFrameMeans = 0
  let m2OfFrameMeans = 0
  let frameMin = Infinity
  let frameMax = -Infinity
  let activeFractionSum = 0
  let deltaEnergySum = 0
  let saturationSum = 0
  let coloredSamples = 0

  const perSecondMean: number[] = []
  const perSecondDelta: number[] = []
  const perSecondDarkFraction: number[] = []
  let secondLumSum = 0
  let secondDeltaSum = 0
  let secondDeltaFrames = 0
  let secondDarkSamples = 0
  let secondFrames = 0

  // Flicker gate state: per-pixel direction/extremum tracking plus a
  // per-second count of contrast-qualified transitions (direction reversals
  // whose extremum-to-extremum swing reaches flashSwingLuminance).
  const flashDirection = new Int8Array(pixelCount)
  const flashExtremum = new Float64Array(pixelCount)
  const flashTransitions = new Uint16Array(pixelCount)
  const nyquistHz = fps / 2
  const bandTopHz = Math.min(thresholds.flashBandTopHz, nyquistHz)
  const perSecondFlashViolatingFraction: number[] = []
  const perSecondFlashMeanHz: number[] = []
  const perSecondFlashMaxHz: number[] = []

  for (let frame = 0; frame < frameCount; frame += 1) {
    virtualTime += deltaMs
    handle.beforeRender(deltaMs)

    let frameLumSum = 0
    let frameActive = 0
    let frameDeltaSum = 0
    let frameDark = 0
    for (let index = 0; index < pixelCount; index += 1) {
      renderPixel(index)
      const [rawR, rawG, rawB] = shim.capturedPixel()
      const r = clamp01(rawR)
      const g = clamp01(rawG)
      const b = clamp01(rawB)
      const luminance = luminanceOf(r, g, b)
      frameLumSum += luminance
      if (luminance >= thresholds.activeLuminance) {
        frameActive += 1
        everActive[index] = 1
      }
      if (luminance < thresholds.darkLuminance) frameDark += 1
      if (frame > 0) frameDeltaSum += Math.abs(luminance - previousLuminance[index])
      if (frame === 0) {
        flashExtremum[index] = luminance
      } else {
        const step = luminance - previousLuminance[index]
        const direction = step > 0 ? 1 : step < 0 ? -1 : 0
        if (direction !== 0) {
          if (flashDirection[index] === 0) {
            flashDirection[index] = direction
          } else if (direction !== flashDirection[index]) {
            // Direction reversed: the previous frame's value was an extremum.
            if (Math.abs(previousLuminance[index] - flashExtremum[index]) >= thresholds.flashSwingLuminance) {
              flashTransitions[index] += 1
            }
            flashExtremum[index] = previousLuminance[index]
            flashDirection[index] = direction
          }
        }
      }
      previousLuminance[index] = luminance
      const colored = hueSample(r, g, b)
      if (colored) {
        hueBins[colored.bin] += 1
        saturationSum += colored.saturation
        coloredSamples += 1
      }
    }

    const frameMean = frameLumSum / pixelCount
    const delta = frameMean - meanOfFrameMeans
    meanOfFrameMeans += delta / (frame + 1)
    m2OfFrameMeans += delta * (frameMean - meanOfFrameMeans)
    if (frameMean < frameMin) frameMin = frameMean
    if (frameMean > frameMax) frameMax = frameMean
    activeFractionSum += frameActive / pixelCount
    if (frame > 0) deltaEnergySum += frameDeltaSum / pixelCount

    secondLumSum += frameMean
    secondDarkSamples += frameDark
    secondFrames += 1
    if (frame > 0) {
      secondDeltaSum += frameDeltaSum / pixelCount
      secondDeltaFrames += 1
    }
    if (secondFrames === fps || frame === frameCount - 1) {
      perSecondMean.push(round6(secondLumSum / secondFrames))
      perSecondDelta.push(round6(secondDeltaFrames > 0 ? secondDeltaSum / secondDeltaFrames : 0))
      perSecondDarkFraction.push(round6(secondDarkSamples / (secondFrames * pixelCount)))

      // Close the flicker window: a pixel violates when its flash rate is
      // past the allowed count but within the analyzed band.
      const windowSeconds = secondFrames / fps
      let violating = 0
      let violatingRateSum = 0
      let violatingRateMax = 0
      for (let index = 0; index < pixelCount; index += 1) {
        const flashHz = flashTransitions[index] / 2 / windowSeconds
        if (flashHz > thresholds.flashMaxPerSecond && flashHz <= bandTopHz) {
          violating += 1
          violatingRateSum += flashHz
          if (flashHz > violatingRateMax) violatingRateMax = flashHz
        }
        flashTransitions[index] = 0
      }
      perSecondFlashViolatingFraction.push(round6(violating / pixelCount))
      perSecondFlashMeanHz.push(violating > 0 ? violatingRateSum / violating : 0)
      perSecondFlashMaxHz.push(violatingRateMax)

      secondLumSum = 0
      secondDeltaSum = 0
      secondDeltaFrames = 0
      secondDarkSamples = 0
      secondFrames = 0
    }
  }

  const events = detectEvents(perSecondDarkFraction, perSecondDelta, thresholds)
  const flicker = buildFlickerGate(
    perSecondFlashViolatingFraction,
    perSecondFlashMeanHz,
    perSecondFlashMaxHz,
    thresholds,
    bandTopHz,
  )
  const everActiveFraction = everActive.reduce((sum, active) => sum + active, 0) / pixelCount
  const totalSamples = frameCount * pixelCount

  const report: TelemetryReport = {
    input: {
      pixelCount,
      fps,
      durationMs: options.durationMs,
      frameCount,
      randomSeed,
      map: 'plane',
      thresholds,
    },
    luminance: {
      mean: round6(meanOfFrameMeans),
      stdDev: round6(frameCount > 1 ? Math.sqrt(m2OfFrameMeans / (frameCount - 1)) : 0),
      frameMin: round6(frameMin),
      frameMax: round6(frameMax),
      perSecondMean,
    },
    temporal: {
      meanDeltaEnergy: round6(frameCount > 1 ? deltaEnergySum / (frameCount - 1) : 0),
      perSecondDeltaEnergy: perSecondDelta,
    },
    spatial: {
      everActiveFraction: round6(everActiveFraction),
      meanActiveFraction: round6(activeFractionSum / frameCount),
    },
    palette: {
      hueBinShares: hueBins.map((count) => round6(coloredSamples > 0 ? count / coloredSamples : 0)),
      dominantHueBinShare: round6(coloredSamples > 0 ? Math.max(...hueBins) / coloredSamples : 0),
      activeHueBins: hueBins.filter((count) => count > 0).length,
      meanSaturation: round6(coloredSamples > 0 ? saturationSum / coloredSamples : 0),
      coloredSampleFraction: round6(coloredSamples / totalSamples),
    },
    events,
    flicker,
    summary: '',
  }
  report.summary = describeTelemetry(report)
  return report
}

function buildFlickerGate(
  perSecondViolatingFraction: number[],
  perSecondMeanHz: number[],
  perSecondMaxHz: number[],
  thresholds: TelemetryThresholds,
  bandTopHz: number,
): FlickerGateResult {
  const violations: FlickerViolation[] = []
  let runStart = -1
  for (let second = 0; second <= perSecondViolatingFraction.length; second += 1) {
    const inViolation =
      second < perSecondViolatingFraction.length &&
      perSecondViolatingFraction[second] >= thresholds.flashAreaFraction
    if (inViolation) {
      if (runStart < 0) runStart = second
      continue
    }
    if (runStart >= 0) {
      const length = second - runStart
      const fractions = perSecondViolatingFraction.slice(runStart, second)
      const meanRates = perSecondMeanHz.slice(runStart, second)
      violations.push({
        startMs: runStart * 1000,
        durationMs: length * 1000,
        meanFlashHz: round6(meanRates.reduce((sum, rate) => sum + rate, 0) / length),
        maxFlashHz: round6(Math.max(...perSecondMaxHz.slice(runStart, second))),
        affectedPixelFraction: round6(fractions.reduce((sum, value) => sum + value, 0) / length),
      })
      runStart = -1
    }
  }
  return {
    pass: violations.length === 0,
    analyzedBandHz: [thresholds.flashMaxPerSecond, round6(bandTopHz)],
    bandLimitedByFps: bandTopHz < thresholds.flashBandTopHz,
    perSecondViolatingFraction,
    violations,
  }
}

function detectEvents(
  perSecondDarkFraction: number[],
  perSecondDelta: number[],
  thresholds: TelemetryThresholds,
): TelemetryEvent[] {
  const events: TelemetryEvent[] = []
  const collectRuns = (
    flags: boolean[],
    build: (startSecond: number, length: number) => TelemetryEvent,
  ) => {
    let runStart = -1
    for (let second = 0; second <= flags.length; second += 1) {
      if (second < flags.length && flags[second]) {
        if (runStart < 0) runStart = second
        continue
      }
      if (runStart >= 0) {
        const length = second - runStart
        if (length >= thresholds.minEventSeconds) events.push(build(runStart, length))
        runStart = -1
      }
    }
  }

  collectRuns(
    perSecondDarkFraction.map((fraction) => fraction >= thresholds.darkPixelFraction),
    (startSecond, length) => {
      const slice = perSecondDarkFraction.slice(startSecond, startSecond + length)
      return {
        kind: 'dark-stretch',
        startMs: startSecond * 1000,
        durationMs: length * 1000,
        darkFraction: round6(slice.reduce((sum, value) => sum + value, 0) / length),
      }
    },
  )
  collectRuns(
    perSecondDelta.map((delta) => delta <= thresholds.staticDeltaEnergy),
    (startSecond, length) => ({
      kind: 'static-stretch',
      startMs: startSecond * 1000,
      durationMs: length * 1000,
    }),
  )
  return events.sort((a, b) => a.startMs - b.startMs || (a.kind < b.kind ? -1 : 1))
}

/** Language-form summary citing timestamps and magnitudes, written to be
 * acted on by an authoring agent. */
export function describeTelemetry(report: TelemetryReport): string {
  const { input, luminance, temporal, spatial, palette, events, flicker } = report
  const lines: string[] = []
  lines.push(
    `Rendered ${input.frameCount} frames (${formatTimestamp(input.durationMs)}) at ${input.fps} fps ` +
      `across ${input.pixelCount} pixels.`,
  )
  if (flicker.pass) {
    lines.push(
      `Flicker gate passed: no high-contrast flashing above ${input.thresholds.flashMaxPerSecond} ` +
        `flashes/second (analyzed up to ${flicker.analyzedBandHz[1]} Hz` +
        `${flicker.bandLimitedByFps ? `, limited by ${input.fps} fps sampling` : ''}).`,
    )
  } else {
    for (const violation of flicker.violations) {
      lines.push(
        `FLICKER GATE FAILED: high-contrast flashing at ~${Math.round(violation.meanFlashHz)} Hz ` +
          `(peaks ${Math.round(violation.maxFlashHz)} Hz) affected ${percent(violation.affectedPixelFraction)} ` +
          `of pixels for ${Math.round(violation.durationMs / 1000)} seconds starting at ` +
          `${formatTimestamp(violation.startMs)}. This Show must not run on physical hardware until fixed.`,
      )
    }
  }
  lines.push(
    `Mean luminance ${percent(luminance.mean, 1)} (deviation ${percent(luminance.stdDev, 1)}), ` +
      `frame means ranged ${percent(luminance.frameMin, 1)} to ${percent(luminance.frameMax, 1)}.`,
  )
  lines.push(
    `${percent(spatial.everActiveFraction)} of pixels lit at least once; ` +
      `a typical frame lit ${percent(spatial.meanActiveFraction)} of them.`,
  )
  lines.push(
    `Mean frame-to-frame luminance change was ${percent(temporal.meanDeltaEnergy, 2)} per pixel.`,
  )
  if (palette.coloredSampleFraction > 0) {
    lines.push(
      `Color used ${palette.activeHueBins} of 12 hue bands; the dominant band held ` +
        `${percent(palette.dominantHueBinShare)} of colored samples at ` +
        `${percent(palette.meanSaturation)} mean saturation.`,
    )
  } else {
    lines.push('No colored samples: output stayed grayscale or dark throughout.')
  }
  for (const event of events) {
    if (event.kind === 'dark-stretch') {
      lines.push(
        `${percent(event.darkFraction ?? 0)} of pixels sat below ` +
          `${percent(input.thresholds.darkLuminance)} luminance for ` +
          `${Math.round(event.durationMs / 1000)} seconds starting at ${formatTimestamp(event.startMs)}.`,
      )
    } else {
      lines.push(
        `Output was near-static (per-pixel change at or below ` +
          `${percent(input.thresholds.staticDeltaEnergy, 1)}) for ` +
          `${Math.round(event.durationMs / 1000)} seconds starting at ${formatTimestamp(event.startMs)}.`,
      )
    }
  }
  if (events.length === 0) {
    lines.push(
      `No dark or static stretches of ${input.thresholds.minEventSeconds} seconds or longer.`,
    )
  }
  return lines.join('\n')
}
