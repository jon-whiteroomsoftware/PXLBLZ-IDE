import { inspectPatternMetadata } from './bundle'

export interface AutomatablePatternControl {
  exportName: string
  label: string
  min: 0
  max: 1
  defaultValue: number
}

export function discoverAutomatablePatternControls(
  source: string,
  savedControls: Record<string, number | number[]> = {},
): AutomatablePatternControl[] {
  return inspectPatternMetadata(source).controls.flatMap((control) => {
    if (control.kind !== 'slider') return []
    const saved = savedControls[control.exportName]
    return [{
      exportName: control.exportName,
      label: control.label,
      min: 0 as const,
      max: 1 as const,
      defaultValue: typeof saved === 'number' && Number.isFinite(saved)
        ? clamp01(saved)
        : 0.5,
    }]
  })
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
