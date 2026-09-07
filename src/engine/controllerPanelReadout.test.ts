import { describe, expect, it } from 'vitest'
import { controllerPanelMode, controllerPanelFieldColumns, describeControllerControlsReadout, describeControllerPixelblazeReadout, describeControllerVariablesReadout, shapeControllerControls } from './controllerPanelView'

describe('Controller summary sections', () => {
  it('retains reported control kinds and unset semantics in folded values', () => {
    const controls = shapeControllerControls({ sliderSpeed: 0.3, toggleMirror: 1, sliderDrift: 1.98, unfamiliar: 0.125, rgbPickerHue: 0.7 })
    expect(describeControllerControlsReadout(controls).map(x => [x.label, x.value])).toEqual([
      ['speed', '30%'], ['mirror', 'on'], ['drift', '—'], ['unfamiliar', '12.5%'], ['hue', '70%'],
    ])
  })
  it('uses the expanded telemetry strings without fabricating unknown values', () => {
    expect(describeControllerPixelblazeReadout({ fpsLabel: '—', address: '10.0.0.9', pixelsLabel: '256' }).map(x => x.value)).toEqual(['—', '10.0.0.9', '256 px'])
    expect(describeControllerVariablesReadout([{ name: 'phase', value: '0.50' }])).toEqual([{ value: '1' }, { label: 'phase', value: '0.50', live: true }])
  })
  it('isolates Controller preferences by Studio mode, not entity identity', () => {
    expect(controllerPanelMode({ kind: 'studio', entity: { kind: 'patterns', id: 'a' } })).toBe(controllerPanelMode({ kind: 'studio', entity: { kind: 'patterns', id: 'b' } }))
    expect(controllerPanelMode({ kind: 'studio', entity: { kind: 'shows', id: 'a' } })).not.toBe(controllerPanelMode({ kind: 'studio', entity: { kind: 'patterns', id: 'a' } }))
    expect(controllerPanelFieldColumns(400)).toBe(2)
    expect(controllerPanelFieldColumns(360)).toBe(2)
    expect(controllerPanelFieldColumns(359)).toBe(1)
    expect(controllerPanelFieldColumns(320)).toBe(1)
  })
})
