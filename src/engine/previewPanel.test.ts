import { describe, expect, it } from 'vitest'
import { panelSectionKey, panelSectionDefault, panelFieldColumns, describePreviewReadout, describeVariablesReadout } from './previewPanel'

describe('Pattern panel readouts and preferences', () => {
  it('keeps independent section and mode identities and tier defaults', () => {
    expect(panelSectionKey('pattern', 'Preview')).not.toBe(panelSectionKey('map', 'Preview'))
    expect(panelSectionKey('pattern', 'Preview')).not.toBe(panelSectionKey('pattern', 'Controls'))
    expect(['Pixelblaze', 'Preview', 'Controls', 'Variables'].map(panelSectionDefault)).toEqual([false, false, true, false])
    expect([340, 379, 380, 420, 520].map(panelFieldColumns)).toEqual([1, 1, 2, 2, 2])
  })
  it('formats the ordered live preview and variable values at their public readout boundary', () => {
    expect(describePreviewReadout({ lightSize: 0.85, diffusion: 0.5, fidelity: 'fidelity', speed: 1, fps: 60, elapsed: 12400, layout: '32×32' }).map(x => x.value)).toEqual(['0.85', '50%', 'Precise', '1×', '60.0', '12.4s', '32×32'])
    expect(describeVariablesReadout(['speed', 'missing'], { speed: 0.2 }).map(x => x.value)).toEqual(['2', '0.20', '—'])
  })
})
