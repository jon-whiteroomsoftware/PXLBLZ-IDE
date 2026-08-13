import { bundle, inspectPatternMetadata } from './bundle'
import { CONTROL_SECONDS_PRESENTATIONS, type ControlSecondsPresentation } from '@/pixelblaze/controlDescriptions'

export interface AutomatablePatternControl {
  exportName: string
  label: string
  min: 0
  max: 1
  defaultValue: number
  // Curated for stock Patterns whose raw slider value encodes seconds
  // linearly (value * scale); Show surfaces render an exact seconds field so
  // typed values mean seconds, not percent (#819).
  secondsPresentation?: ControlSecondsPresentation
}

export function bundledPatternSliderNames(
  source: string,
  libraries: Record<string, string>,
): ReadonlySet<string> {
  return new Set(bundle(source, libraries).metadata.controls
    .filter((control) => control.kind === 'slider')
    .map((control) => control.exportName))
}

export function discoverAutomatablePatternControls(
  source: string,
  savedControls: Record<string, number | number[]> = {},
  stockPatternId?: string,
): AutomatablePatternControl[] {
  const seconds = stockPatternId ? CONTROL_SECONDS_PRESENTATIONS[stockPatternId] : undefined
  return inspectPatternMetadata(source).controls.flatMap((control) => {
    if (control.kind !== 'slider') return []
    const saved = savedControls[control.exportName]
    const secondsPresentation = seconds?.[control.exportName]
    return [{
      exportName: control.exportName,
      label: control.label,
      min: 0 as const,
      max: 1 as const,
      defaultValue: typeof saved === 'number' && Number.isFinite(saved)
        ? clamp01(saved)
        : 0.5,
      ...(secondsPresentation ? { secondsPresentation } : {}),
    }]
  })
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
