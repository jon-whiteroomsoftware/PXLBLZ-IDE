// #708: palette-sink members. A pattern that outputs through
// setPalette()/paint() must lower into per-member palette state and a
// paint helper that feeds the member's rgb sink - before this fix the raw
// builtin calls passed through unrewritten and the member's capture slots
// stayed black in every compiled Show.
import { compileMember } from './showMemberLowering'
import { compileShowForArtifact } from './showPreviewArtifact'
import { createInstallationCompositionFixture } from './showInstallationTestFixture'
import { loadPattern } from './loadPattern'
import { bundle } from './bundle'
import { emitFixedPoint } from './fxEmit'
import { createShim, createFxShim } from './shim'
import { LIBRARIES } from '../pixelblaze/libs'
import { SOURCE_STOCK_MAPS } from '../pixelblaze/stock/maps/stockCatalogue'

const PAINT_SOURCE = `
var coals = [
  0.0, 0, 0, 0,
  0.5, 1, 0.2, 0,
  1.0, 1, 1, 0.8,
]
export function beforeRender(delta) {
  setPalette(coals)
}
export function render2D(index, x, y) {
  if (x < 0.5) {
    paint(y)
  } else {
    paint(y, 0.5)
  }
}
`

describe('palette-sink member lowering (#708)', () => {
  it('rewrites paint and setPalette into member sinks and fills the default brightness', () => {
    const member = compileMember({ id: 'coals', source: PAINT_SOURCE }, 0, {})
    expect(member.usesPaint).toBe(true)
    expect(member.code).toContain(`${member.palettePrefix}_setPalette(`)
    expect(member.code).toContain(`${member.palettePrefix}_paint(`)
    // No raw palette builtins survive in the lowered member body.
    expect(member.code).not.toMatch(/(?<![_a-zA-Z0-9])setPalette\(/)
    expect(member.code).not.toMatch(/(?<![_a-zA-Z0-9])paint\(/)
    // The device VM zero-fills missing arguments, so the single-argument
    // call site gains the firmware default brightness explicitly.
    expect(member.code).toContain(`${member.palettePrefix}_paint(y, 1)`)
    expect(member.code).toContain(`${member.palettePrefix}_paint(y, 0.5)`)
  })

  it('allocates palette runtime names that cannot alias authored bindings', () => {
    // An authored top-level `palette` variable renames to `${prefix}_palette`;
    // the generated runtime must live elsewhere or the member's own selector
    // arithmetic would be clobbered by the palette array.
    const member = compileMember({
      id: 'selector',
      source: `
var palette = 0
var warm = [0, 1, 0, 0, 1, 1, 1, 0]
var cool = [0, 0, 0, 1, 1, 0, 1, 1]
export function beforeRender(delta) {
  palette = time(0.1)
  setPalette(palette < 0.5 ? warm : cool)
}
export function render2D(index, x, y) { paint(x) }
`,
    }, 0, {})
    expect(member.usesPaint).toBe(true)
    expect(member.code).toContain('__pxlblz_show_c0_palette = ')
    expect(member.palettePrefix).not.toBe('__pxlblz_show_c0')
    expect(member.code).toContain(`${member.palettePrefix}_setPalette(`)
    expect(member.code).toContain(`${member.palettePrefix}_paint(x, 1)`)
  })

  it('gives an authored top-level paint function device zero-fill, not the firmware default', () => {
    // A pattern that defines its own paint() is not calling the builtin: the
    // call renames to the member binding and must not gain the firmware
    // default of 1. The device VM zero-fills the omitted argument, and
    // JavaScript preview would pass undefined (NaN output), so the lowered
    // call site carries the explicit zero.
    const member = compileMember({
      id: 'shadow',
      source: `
function paint(pos, level) { hsv(pos, 1, level) }
export function render2D(index, x, y) { paint(x) }
`,
    }, 0, {})
    expect(member.usesPaint).toBe(false)
    expect(member.code).toContain('__pxlblz_show_c0_paint(x, 0)')
    expect(member.code).not.toContain('__pxlblz_show_c0_paint(x, 1)')
    expect(member.code).not.toContain('__pxlblz_show_c0_paint(x, 0, 0)')
  })

  it('zero-fills a zero-argument call to an authored paint function', () => {
    const member = compileMember({
      id: 'shadow-empty',
      source: `
function paint(pos, level) { hsv(pos, 1, level) }
export function render2D(index, x, y) { if (x < 0) { paint() } else { paint(x, y) } }
`,
    }, 0, {})
    expect(member.code).toContain('__pxlblz_show_c0_paint(0, 0)')
    expect(member.code).toContain('__pxlblz_show_c0_paint(x, y)')
  })

  it('keeps hsv/rgb members free of palette runtime', () => {
    const member = compileMember(
      { id: 'plain', source: 'export function render(index) { rgb(index / pixelCount, 0, 0) }' },
      0,
      {},
    )
    expect(member.usesPaint).toBe(false)
  })

  it('renders light from a paint-based stock Pattern through the production compile', () => {
    // The recipe-level regression (#676/#693 lesson): a real ShowRecord, the
    // real compiler, sampled output. PlasmaNebula is the stock exemplar of
    // the palette API and compiled to black before this fix.
    const show = createInstallationCompositionFixture()
    for (const cell of show.cells) {
      if (cell.sceneId === 'wake' && cell.zoneId === 'zone-1') {
        cell.pattern = { kind: 'stock', id: 'PlasmaNebula' }
        cell.patternName = 'PlasmaNebula'
      }
    }
    const compiled = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    const mapId = show.outputContract?.kind === 'installation' ? show.outputContract.outputMapId : 'plane'
    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === mapId)!.resolve(160)
    let virtualTime = 0
    const shim = createShim({
      pixelCount: 160,
      dimensions: 2,
      mapPoints,
      getVirtualTime: () => virtualTime,
      randomSeed: 708,
    })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    virtualTime += 2_000
    handle.beforeRender(2_000)
    // zone-1 owns indices 0-19 and 80-99 in the fixture layout.
    const zoneIndices = [...Array.from({ length: 20 }, (_, i) => i), ...Array.from({ length: 20 }, (_, i) => 80 + i)]
    let luminance = 0
    for (const index of zoneIndices) {
      const [x, y] = mapPoints[index].sample
      handle.render2D(index, x, y)
      const [r, g, b] = shim.capturedPixel()
      luminance += (r + g + b) / 3
    }
    expect(luminance / zoneIndices.length).toBeGreaterThan(0.01)
  })

  it('scales array length reads into 16.16 so the palette helper survives Precise mode', () => {
    expect(emitFixedPoint('var n = pal.length / 4')).toContain('(pal).length << 16')
  })

  it('renders a paint-based member through the Precise (fixed-point) pipeline', () => {
    const show = createInstallationCompositionFixture()
    for (const cell of show.cells) {
      if (cell.sceneId === 'wake' && cell.zoneId === 'zone-1') {
        cell.pattern = { kind: 'stock', id: 'PlasmaNebula' }
        cell.patternName = 'PlasmaNebula'
      }
    }
    const compiled = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    // Precise Show replay re-bundles the artifact and runs its fixed-point
    // emission, exactly like fastReplay does.
    const bundled = bundle(compiled.artifact!.code, LIBRARIES)
    const mapId = show.outputContract?.kind === 'installation' ? show.outputContract.outputMapId : 'plane'
    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === mapId)!.resolve(160)
    let virtualTime = 0
    const shim = createFxShim({
      pixelCount: 160,
      dimensions: 2,
      mapPoints,
      getVirtualTime: () => virtualTime,
      randomSeed: 708,
    })
    const handle = loadPattern(bundled.fxCode, bundled.metadata, shim.builtins)
    virtualTime += 2_000
    handle.beforeRender(2_000)
    const zoneIndices = [...Array.from({ length: 20 }, (_, i) => i), ...Array.from({ length: 20 }, (_, i) => 80 + i)]
    let luminance = 0
    for (const index of zoneIndices) {
      const [x, y] = mapPoints[index].sample
      handle.render2D(index, x, y)
      const [r, g, b] = shim.capturedPixel()
      luminance += (r + g + b) / 3
    }
    expect(luminance / zoneIndices.length).toBeGreaterThan(0.01)
  })
})
