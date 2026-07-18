import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bundle } from './bundle'
import { parseEpe } from './epeImport'
import { loadPattern } from './loadPattern'
import { createShim } from './shim'
import { sampleShowSpatialOperator } from './showSpatialOperators'

describe('adaptive Show spatial operators (#410)', () => {
  it.each([16, 32, 64])('keeps grid ownership and local coordinates resolution independent at %sx%s', (size) => {
    const counts = [0, 0, 0, 0]
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const sample = sampleShowSpatialOperator(
          { kind: 'grid', columns: 2, rows: 2, zoneIds: ['nw', 'ne', 'sw', 'se'] },
          column / (size - 1),
          row / (size - 1),
          0,
        )
        counts[sample.region] += 1
        expect(sample.localX).toBeGreaterThanOrEqual(0)
        expect(sample.localX).toBeLessThanOrEqual(1)
        expect(sample.localY).toBeGreaterThanOrEqual(0)
        expect(sample.localY).toBeLessThanOrEqual(1)
        expect(sample.mix).toBeGreaterThanOrEqual(0)
        expect(sample.mix).toBeLessThanOrEqual(1)
      }
    }
    expect(counts).toEqual(Array.from({ length: 4 }, () => size * size / 4))
  })

  it.each([
    { kind: 'stripes' as const, axis: 'x' as const, zoneIds: ['a', 'b', 'c', 'd', 'e'] },
    { kind: 'checker' as const, columns: 6, rows: 4, zoneIds: ['a', 'b'] as [string, string] },
    { kind: 'rings' as const, rings: 5, zoneIds: ['a', 'b'] },
    { kind: 'pinwheel' as const, arms: 6, twist: Math.PI * 2 * 1.35, rotation: Math.PI * 2 * 0.1, zoneIds: ['a', 'b'] },
    { kind: 'wave' as const, axis: 'y' as const, bands: 4, amplitude: 0.3, frequency: 2.5, phase: 0, zoneIds: ['a', 'b'] },
    { kind: 'soft-split' as const, axis: 'x' as const, feather: 0.2, zoneIds: ['a', 'b'] as [string, string] },
  ])('returns finite bounded samples for $kind across 2048 points', (operator) => {
    for (let index = 0; index < 2048; index += 1) {
      const x = (index % 64) / 63
      const y = Math.floor(index / 64) / 31
      const sample = sampleShowSpatialOperator(operator, x, y, 0.37)
      expect(Object.values(sample).every(Number.isFinite)).toBe(true)
      expect(sample.localX).toBeGreaterThanOrEqual(0)
      expect(sample.localX).toBeLessThanOrEqual(1)
      expect(sample.localY).toBeGreaterThanOrEqual(0)
      expect(sample.localY).toBeLessThanOrEqual(1)
      expect(sample.mix).toBeGreaterThanOrEqual(0)
      expect(sample.mix).toBeLessThanOrEqual(1)
    }
  })

  it('exposes a continuous mix only inside a soft boundary', () => {
    const operator = { kind: 'soft-split' as const, axis: 'x' as const, feather: 0.2, zoneIds: ['a', 'b'] as [string, string] }

    expect(sampleShowSpatialOperator(operator, 0.2, 0.5, 0).mix).toBe(0)
    expect(sampleShowSpatialOperator(operator, 0.5, 0.5, 0).mix).toBe(0.5)
    expect(sampleShowSpatialOperator(operator, 0.8, 0.5, 0).mix).toBe(1)
  })

  it.each([
    { rows: 16, columns: 16 },
    { rows: 32, columns: 32 },
    { rows: 32, columns: 64 },
  ])('runs one unchanged showcase artifact through every operator at $rows x $columns', ({ rows, columns }) => {
    const parsed = parseEpe(readFileSync(resolve('artifacts/electromage/adaptive-spatial-operator-showcase.epe'), 'utf8'))
    const compiled = bundle(parsed.src, {})
    const pixelCount = rows * columns
    const shim = createShim({ pixelCount, dimensions: 2, mapPoints: [], getVirtualTime: () => 0 })
    const handle = loadPattern(compiled.code, compiled.metadata, shim.builtins)

    for (const [scene, delta] of [16, 4000, 4000, 4000, 4000, 4000, 4000].entries()) {
      handle.beforeRender(delta)
      let brightest = 0
      for (let index = 0; index < pixelCount; index += 1) {
        const x = (index % columns) / (columns - 1)
        const y = Math.floor(index / columns) / (rows - 1)
        handle.render2D(index, x, y)
        const pixel = shim.capturedPixel()
        expect(pixel.every(Number.isFinite)).toBe(true)
        brightest = Math.max(brightest, ...pixel)
      }
      expect(brightest, `scene ${scene}`).toBeGreaterThan(0)
    }
  })
})
