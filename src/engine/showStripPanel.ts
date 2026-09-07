import type { PanelReadout } from './previewPanel'
import { formatPercentageValue } from './percentageValue'

export function showStripSectionDefault(section: string): boolean { return section === 'Preview' }
export function describeShowPreviewReadout(state: { lightSize: number; diffusion: number; fidelity: string; fps: number | null }): PanelReadout[] {
  return [
    { glyph: 'light', value: state.lightSize.toFixed(2) },
    { glyph: 'diffusion', value: formatPercentageValue(state.diffusion) },
    { glyph: 'renderer', value: state.fidelity === 'fast' ? 'Fast' : 'Precise' },
    { glyph: 'fps', value: state.fps === null ? '—' : state.fps.toFixed(1), live: true },
  ]
}
