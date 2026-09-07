import { describe, expect, it } from 'vitest'
import { describeShowPreviewReadout, showStripSectionDefault } from './showStripPanel'

describe('Show strip readouts (#968)', () => {
  it('opens only Preview by default', () => {
    expect(['Stage', 'Preview', 'Zones', 'Source'].map(showStripSectionDefault)).toEqual([false, true, false, false])
  })
  it('reports the renderer controls in their display order without Pattern-only telemetry', () => {
    expect(describeShowPreviewReadout({ lightSize: 0.85, diffusion: 0.75, fidelity: 'fast', fps: 29.83 })).toEqual([
      { glyph: 'light', value: '0.85' },
      { glyph: 'diffusion', value: '75%' },
      { glyph: 'renderer', value: 'Fast' },
      { glyph: 'fps', value: '29.8', live: true },
    ])
    expect(describeShowPreviewReadout({ lightSize: 1, diffusion: 0, fidelity: 'fidelity', fps: null }).map(item => item.value)).toEqual(['1.00', '0%', 'Precise', '—'])
  })
})
