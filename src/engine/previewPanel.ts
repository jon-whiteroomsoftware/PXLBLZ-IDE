import { formatWatchValue } from './watchValue'
import { formatPercentageValue } from './percentageValue'

export interface PanelReadout { glyph?: 'light' | 'diffusion' | 'renderer' | 'speed' | 'fps' | 'elapsed' | 'layout' | 'view' | 'fit' | 'pixels'; value: string; label?: string; live?: boolean }
export function panelSectionKey(mode: string, section: string): string { return `${mode}:${section.toLowerCase()}` }
export function panelSectionDefault(section: string): boolean { return section === 'Controls' }
/** CSS container queries use the same 380px panel breakpoint. */
export function panelFieldColumns(width: number): 1 | 2 { return width < 380 ? 1 : 2 }
export function describePreviewReadout(s: { lightSize: number; diffusion: number; fidelity: string; speed: number; fps: number | null; elapsed: number | null; layout: string | null }): PanelReadout[] {
  return [
    { glyph: 'light', value: s.lightSize.toFixed(2) },
    { glyph: 'diffusion', value: formatPercentageValue(s.diffusion) },
    { glyph: 'renderer', value: s.fidelity === 'fast' ? 'Fast' : 'Precise' },
    { glyph: 'speed', value: `${s.speed}×` },
    { glyph: 'fps', value: s.fps === null ? '—' : s.fps.toFixed(1), live: true },
    { glyph: 'elapsed', value: s.elapsed === null ? '—' : `${(s.elapsed / 1000).toFixed(1)}s`, live: true },
    ...(s.layout ? [{ glyph: 'layout' as const, value: s.layout }] : []),
  ]
}
export function describeVariablesReadout(names: string[], values: Record<string, unknown>): PanelReadout[] {
  return [{ value: String(names.length) }, ...names.map(name => ({ label: name, value: formatWatchValue(values[name]), live: true }))]
}
export function describeControlsReadout(controls: { exportName: string; label: string; kind: string; secondsPresentation?: { scale: number } }[], values: Record<string, number | number[]>): PanelReadout[] {
  return controls.map(c => {
    const raw = values[c.exportName]
    const value = typeof raw === 'number' ? raw : c.kind === 'toggle' ? 0 : 0.5
    const formatted = c.kind === 'toggle' ? (value === 1 ? 'on' : 'off')
      : c.secondsPresentation ? `${Number((value * c.secondsPresentation.scale).toFixed(3))}s`
      : c.kind === 'slider' ? formatPercentageValue(value)
      : (Array.isArray(raw) ? raw : [1, 1, 1]).map(n => n.toFixed(2)).join(', ')
    return { label: c.label.toLowerCase(), value: formatted, live: true }
  })
}

export function describePixelblazeReadout(s: { coordinateView?: string; mapped: boolean; normalize: string; pixelCount: number }): PanelReadout[] {
  return [
    ...(s.coordinateView ? [{ glyph: 'view' as const, value: s.coordinateView }] : []),
    ...(s.mapped ? [{ glyph: 'fit' as const, value: s.normalize === 'fill' ? 'Fill' : 'Contain' }] : []),
    { glyph: 'pixels', value: `${s.pixelCount.toLocaleString()} px` },
  ]
}
