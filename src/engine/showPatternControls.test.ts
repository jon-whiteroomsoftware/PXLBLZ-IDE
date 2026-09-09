import { discoverAutomatablePatternControls, resolveBundledPatternSliderNames } from './showPatternControls'

describe('Show Pattern control discovery (#419)', () => {
  const source = `
var privateSpeed = 0.2
export var publicButUnbounded = 12
export function sliderSpeed(v) { privateSpeed = v }
export function toggleMirror(v) {}
export function render(index) { rgb(privateSpeed, 0, 0) }
`

  it('exposes only public sliders with honest name, range, and Studio default', () => {
    expect(discoverAutomatablePatternControls(source, { sliderSpeed: 0.7 })).toEqual([{
      exportName: 'sliderSpeed',
      label: 'Speed',
      min: 0,
      max: 1,
      defaultValue: 0.7,
    }])
  })

  it('uses the existing Studio slider fallback and clamps saved positions', () => {
    expect(discoverAutomatablePatternControls(source)[0].defaultValue).toBe(0.5)
    expect(discoverAutomatablePatternControls(source, { sliderSpeed: 4 })[0].defaultValue).toBe(1)
  })

  it('rejects invalid source instead of silently returning incomplete metadata', () => {
    expect(() => discoverAutomatablePatternControls('export function sliderBroken(')).toThrow()
  })
})

describe('replacement metadata availability (#953)', () => {
  it.each([undefined, 'export function render(index) { Personal.paint(index) }'])('refuses unavailable source or Library without inventing an empty export set', source => {
    expect(resolveBundledPatternSliderNames(source, {})).toBeNull()
  })
  it('distinguishes authoritative empty exports from unavailable metadata', () => {
    expect(resolveBundledPatternSliderNames('export function render(index) { rgb(1, 0, 0) }', {})).toEqual(new Set())
    expect(resolveBundledPatternSliderNames('export function sliderSpeed(v) {} export function render(index) { Personal.paint(index) }', { Personal: 'function paint(index) { rgb(1, 0, 0) }' })).toEqual(new Set(['sliderSpeed']))
  })
})
