import { bundle, validateLibraryContent } from './bundle'

// ── tracer bullet ────────────────────────────────────────────────────────────

describe('bundle — no library refs', () => {
  it('returns source unchanged when there are no library references', () => {
    const src = `export var x = 0\nexport function beforeRender(delta) { x += delta }`
    const { code } = bundle(src, {})
    expect(code).toBe(src)
  })

  it('extracts exported vars from the pattern', () => {
    const { metadata } = bundle('export var speed = 0.5\nexport var hue = 0', {})
    expect(metadata.exportedVars).toEqual(['speed', 'hue'])
    expect(metadata.patternVars).toEqual(['speed', 'hue'])
  })

  it('extracts all vars from a multi-declarator export', () => {
    const { metadata } = bundle('export var x = 0, y = 0, z = 0', {})
    expect(metadata.exportedVars).toEqual(['x', 'y', 'z'])
    expect(metadata.patternVars).toEqual(['x', 'y', 'z'])
  })

  it('includes non-exported top-level vars in patternVars but not exportedVars', () => {
    const src = 'export var exported = 1\nvar internal = 2'
    const { metadata } = bundle(src, {})
    expect(metadata.exportedVars).toEqual(['exported'])
    expect(metadata.patternVars).toEqual(['exported', 'internal'])
  })

  it('excludes render function names from patternVars', () => {
    const src = `
      var width = 16
      export function beforeRender(delta) {}
      function render(index) {}
    `
    const { metadata } = bundle(src, {})
    expect(metadata.patternVars).toEqual(['width'])
    expect(metadata.patternVars).not.toContain('beforeRender')
    expect(metadata.patternVars).not.toContain('render')
  })

  it('detects render functions', () => {
    const src = `
      export function beforeRender(delta) {}
      export function render2D(index, x, y) {}
    `
    const { metadata } = bundle(src, {})
    expect(metadata.renderFns.hasBeforeRender).toBe(true)
    expect(metadata.renderFns.hasRender2D).toBe(true)
    expect(metadata.renderFns.hasRender).toBe(false)
    expect(metadata.renderFns.hasRender3D).toBe(false)
  })

  it('detects non-exported render functions', () => {
    const src = `function render(index) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.renderFns.hasRender).toBe(true)
  })

  it('detects render3D', () => {
    const src = `export function render3D(index, x, y, z) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.renderFns.hasRender3D).toBe(true)
    expect(metadata.renderFns.hasRender2D).toBe(false)
  })

  it('extracts slider controls', () => {
    const src = `export function sliderBrightness(v) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.controls).toEqual([
      { exportName: 'sliderBrightness', kind: 'slider', label: 'Brightness' },
    ])
  })

  it('extracts toggle controls', () => {
    const src = `export function toggleLoop(v) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.controls).toEqual([
      { exportName: 'toggleLoop', kind: 'toggle', label: 'Loop' },
    ])
  })

  it('extracts hsvPicker controls', () => {
    const src = `export function hsvPickerColor(h, s, v) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.controls).toEqual([
      { exportName: 'hsvPickerColor', kind: 'hsvPicker', label: 'Color', pickerVars: ['', '', ''] },
    ])
  })

  it('extracts rgbPicker controls', () => {
    const src = `export function rgbPickerColor(r, g, b) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.controls).toEqual([
      { exportName: 'rgbPickerColor', kind: 'rgbPicker', label: 'Color', pickerVars: ['', '', ''] },
    ])
  })

  it('recovers the backing vars a picker assigns its args to, in arg order', () => {
    const src = `
      var hue = 0, saturation = 1, brightness = 1
      export function hsvPickerColor(h, s, v) { hue = h; saturation = s; brightness = v }
    `
    const { metadata } = bundle(src, {})
    expect(metadata.controls[0].pickerVars).toEqual(['hue', 'saturation', 'brightness'])
  })

  it('recovers picker vars regardless of assignment order in the body', () => {
    const src = `
      var ar = 0.5, ag = 0.5, ab = 0.5
      export function rgbPickerA(r, g, b) { ab = b; ar = r; ag = g }
    `
    const { metadata } = bundle(src, {})
    expect(metadata.controls[0].pickerVars).toEqual(['ar', 'ag', 'ab'])
  })

  it('ignores exported functions with unrecognized prefixes', () => {
    const src = `export function fooBarBaz(v) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.controls).toHaveLength(0)
  })

  it('ignores a function named exactly as a prefix with no suffix', () => {
    const src = `export function slider(v) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.controls).toHaveLength(0)
  })

  it('generates a space-separated label from a multi-word camelCase suffix', () => {
    const src = `export function sliderMyPlaybackSpeed(v) {}`
    const { metadata } = bundle(src, {})
    expect(metadata.controls[0].label).toBe('My Playback Speed')
  })
})

describe('validateLibraryContent', () => {
  it('accepts comments, function declarations, and top-level var declarations', () => {
    const src = [
      `// shared temporaries are allowed`,
      `var ux = 0, uy = 0;`,
      `function toUV(x, y) { ux = x; uy = y }`,
    ].join('\n')

    expect(validateLibraryContent(src)).toEqual([])
  })

  it('rejects executable top-level statements', () => {
    const errors = validateLibraryContent('var x = 0\nx = 1')

    expect(errors).toEqual([
      {
        message: 'Library top level may contain only function declarations, var declarations, and comments',
        line: 2,
        column: 0,
      },
    ])
  })
})

// ── single library function ──────────────────────────────────────────────────

describe('bundle — library inlining', () => {
  const sdfCircle = `function circle(x, y, r) { return sqrt(x * x + y * y) - r }`

  it('inlines a referenced library function', () => {
    const src = `export function render2D(index, x, y) { var d = sdf.circle(x, y, 0.3) }`
    const { code } = bundle(src, { sdf: sdfCircle })
    expect(code).toContain('function _sdf_circle(')
    expect(code).toContain('_sdf_circle(')
    expect(code).not.toContain('sdf.circle(')
  })

  it('places the inlined function before the pattern code', () => {
    const src = `export function render2D(index, x, y) { sdf.circle(x, y, 0.3) }`
    const { code } = bundle(src, { sdf: sdfCircle })
    const inlinedIdx = code.indexOf('function _sdf_circle(')
    const patternIdx = code.indexOf('export function render2D(')
    expect(inlinedIdx).toBeLessThan(patternIdx)
  })

  it('emits referenced library top-level vars unmangled before inlined functions', () => {
    const lib = [
      `var ux = 0, uy = 0;`,
      `function toUV(x, y) { ux = x * 2 - 1; uy = y * 2 - 1 }`,
      `var nx = 0, ny = 0;`,
      `function normalize2(x, y) { nx = x; ny = y }`,
    ].join('\n')
    const src = `export function render2D(index, x, y) { shader.toUV(x, y); hsv(ux, uy, 1) }`
    const { code } = bundle(src, { shader: lib })

    expect(code).toContain('var ux = 0, uy = 0;')
    expect(code).toContain('var nx = 0, ny = 0;')
    expect(code).not.toContain('var _shader_ux')
    expect(code.indexOf('var ux = 0, uy = 0;')).toBeLessThan(code.indexOf('function _shader_toUV('))
    expect(code.indexOf('var nx = 0, ny = 0;')).toBeLessThan(code.indexOf('function _shader_toUV('))
  })

  it('does not emit extra preamble for a referenced library with no top-level vars', () => {
    const src = `export function render2D(index, x, y) { sdf.circle(x, y, 0.3) }`
    const { code } = bundle(src, { sdf: sdfCircle })

    expect(code.startsWith('function _sdf_circle(')).toBe(true)
  })

  it('does not emit vars from an unreferenced library', () => {
    const src = `export function render2D(index, x, y) { sdf.circle(x, y, 0.3) }`
    const unused = `var outH = 0, outS = 0, outV = 0;\nfunction lerpHSV() {}`
    const { code } = bundle(src, { sdf: sdfCircle, color: unused })

    expect(code).not.toContain('outH')
    expect(code).not.toContain('_color_lerpHSV')
  })

  it('emits transitive cross-library vars once per referenced library', () => {
    const color = [
      `var outH = 0, outS = 0, outV = 0;`,
      `function lerpHSV() { outH = 1; outS = 1; outV = 1 }`,
    ].join('\n')
    const shader = [
      `var cr = 0, cg = 0, cb = 0;`,
      `function palette() { Color.lerpHSV(); cr = outH; cg = outS; cb = outV }`,
    ].join('\n')
    const src = `export function render(index) { Shader.palette(); hsv(cr, cg, cb) }`
    const { code } = bundle(src, { Shader: shader, Color: color })

    expect(code.match(/var cr = 0, cg = 0, cb = 0;/g)).toHaveLength(1)
    expect(code.match(/var outH = 0, outS = 0, outV = 0;/g)).toHaveLength(1)
    expect(code).toContain('function _Shader_palette(')
    expect(code).toContain('function _Color_lerpHSV(')
  })

  it('does not inline unreferenced library functions', () => {
    const lib = [
      `function circle(x, y, r) { return sqrt(x*x + y*y) - r }`,
      `function rect(x, y, hw, hh) { return 0 }`,
    ].join('\n')
    const src = `export function render2D(index, x, y) { sdf.circle(x, y, 0.3) }`
    const { code } = bundle(src, { sdf: lib })
    expect(code).toContain('_sdf_circle')
    expect(code).not.toContain('_sdf_rect')
  })

  it('rewrites multiple call sites in the same pattern', () => {
    const src = [
      `export function render2D(index, x, y) {`,
      `  var a = sdf.circle(x, y, 0.3)`,
      `  var b = sdf.circle(x - 0.5, y, 0.2)`,
      `}`,
    ].join('\n')
    const { code } = bundle(src, { sdf: sdfCircle })
    expect(code).not.toContain('sdf.circle(')
    // 1 definition + 2 call sites = 3 occurrences of `_sdf_circle(`
    const count = (code.match(/_sdf_circle\(/g) ?? []).length
    expect(count).toBe(3)
  })

  it('throws a compile-time error for an unknown library namespace', () => {
    const src = `export function render(index) { MissingLibrary.fn(index) }`

    expect(() => bundle(src, {})).toThrow('Unknown library namespace "MissingLibrary"')
  })

  it('throws a compile-time error for an unknown library function', () => {
    const src = `export function render(index) { MyLib.missing(index) }`

    expect(() => bundle(src, { MyLib: `function present(v) { return v }` })).toThrow(
      'Unknown library function "MyLib.missing"',
    )
  })

  it('does not treat declared object member calls as library namespaces', () => {
    const src = [
      `export function render(index) {`,
      `  var local = { fn: function(v) { return v } }`,
      `  local.fn(index)`,
      `}`,
    ].join('\n')

    expect(() => bundle(src, {})).not.toThrow()
  })
})

// ── transitive deps ──────────────────────────────────────────────────────────

describe('bundle — transitive dependencies', () => {
  it('inlines a transitive dep called by the referenced function', () => {
    const lib = [
      `function _helper(x) { return x * x }`,
      `function circle(x, y, r) { return sqrt(_helper(x) + _helper(y)) - r }`,
    ].join('\n')
    const src = `export function render2D(i, x, y) { sdf.circle(x, y, 0.3) }`
    const { code } = bundle(src, { sdf: lib })
    expect(code).toContain('function _sdf__helper(')
    expect(code).toContain('function _sdf_circle(')
  })

  it('rewrites bare internal calls within the inlined function body', () => {
    const lib = [
      `function _sq(v) { return v * v }`,
      `function circle(x, y, r) { return sqrt(_sq(x) + _sq(y)) - r }`,
    ].join('\n')
    const src = `export function render2D(i, x, y) { sdf.circle(x, y, 0.3) }`
    const { code } = bundle(src, { sdf: lib })
    // The inlined circle body should call _sdf__sq, not the bare _sq
    expect(code).toContain('_sdf__sq(')
    expect(code).not.toMatch(/[^_]_sq\(/)
  })
})

// ── metadata with libraries ──────────────────────────────────────────────────

describe('bundle — metadata extraction with library code', () => {
  it('extracts exportedVars even when library functions are also present', () => {
    const lib = `function circle(x, y, r) { return sqrt(x*x+y*y) - r }`
    const src = [
      `export var hue = 0`,
      `export function render2D(i, x, y) { sdf.circle(x, y, 0.3) }`,
    ].join('\n')
    const { metadata } = bundle(src, { sdf: lib })
    expect(metadata.exportedVars).toEqual(['hue'])
    expect(metadata.patternVars).toEqual(['hue'])
    expect(metadata.renderFns.hasRender2D).toBe(true)
  })
})
