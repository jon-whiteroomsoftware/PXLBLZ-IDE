import { describe, expect, it } from 'vitest'
import { SOURCE_STOCK_MAPS } from './stockCatalogue'

const ZONES = [
  ['F', 0, 49], ['O1', 50, 109], ['O2', 110, 169], ['D', 170, 236],
  ['border', 237, 377], ['arrow1', 378, 393], ['arrow2', 394, 409],
  ['arrow3', 410, 425], ['head', 426, 441],
] as const
const ZONES_300 = [
  ['F', 0, 33], ['O1', 34, 74], ['O2', 75, 114], ['D', 115, 159],
  ['border', 160, 255], ['arrow1', 256, 266], ['arrow2', 267, 277],
  ['arrow3', 278, 288], ['head', 289, 299],
] as const
type Zone = readonly [string, number, number]
const resolve = (n: number) => SOURCE_STOCK_MAPS.find((m) => m.id === 'after-hours-sign')!.resolve(n)
type Points = ReturnType<typeof resolve>
const distance = (a: Points[number], b: Points[number]) => Math.hypot(
  a.sample[0] - b.sample[0], a.sample[1] - b.sample[1],
)
const distances = (points: Points, start: number, end: number, skip = -1) =>
  Array.from({ length: end - start }, (_, i) => start + i)
    .filter((i) => i !== skip).map((i) => distance(points[i], points[i + 1]))
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function pitches(points: Points, zones: readonly Zone[], skip: number) {
  return zones.filter(([name]) => name !== 'border')
    .map(([name, start, end]) => ({ name, values: distances(points, start, end, skip) }))
    .map((zone) => ({ ...zone, median: median(zone.values) }))
}
function checkBorder(points: Points, zones: readonly Zone[], skip: number) {
  const [, start, end] = zones.find(([name]) => name === 'border')!
  const count = end - start + 1
  expect(count % 3).toBe(0)
  expect(count).toBeLessThanOrEqual(150)
  const tubePitch = median(pitches(points, zones, skip).flatMap((p) => p.values))
  const borderDistances = distances(points, start, end)
  const borderPitch = median(borderDistances)
  expect(borderPitch).toBeGreaterThanOrEqual(2 * tubePitch)
  for (const value of [...borderDistances, distance(points[end], points[start])]) {
    expect(value).toBeGreaterThanOrEqual(0.95 * borderPitch)
  }
}

describe('After Hours sign (#1196)', () => {
  it('resolves the 442-pixel Zone contract with matching position and sample', () => {
    const points = resolve(442)
    expect(points).toHaveLength(442)
    let next = 0
    for (const [, start, end] of ZONES) {
      expect(start).toBe(next)
      next = end + 1
    }
    expect(next).toBe(442)
    for (const point of points) expect(point.pos).toEqual(point.sample)
  })

  it('holds a common tube pitch, including exact spacing on straight strokes', () => {
    const points = resolve(442)
    const tube = pitches(points, ZONES, 37)
    expect(Math.max(...tube.map((p) => p.median)) / Math.min(...tube.map((p) => p.median))).toBeLessThanOrEqual(1.1)
    for (const zone of tube) {
      for (const value of zone.values) {
        expect(value, zone.name).toBeGreaterThanOrEqual(0.6 * zone.median)
        expect(value, zone.name).toBeLessThanOrEqual(1.1 * zone.median)
      }
    }
    for (const [start, end] of [[38, 49], [378, 393], [394, 409], [410, 425]]) {
      const values = distances(points, start, end)
      for (const value of values) expect(Math.abs(value / values[0] - 1)).toBeLessThanOrEqual(1e-9)
    }
  })

  it('spaces 141 border bulbs with a median pitch at least twice the tube pitch', () => {
    expect(ZONES[4][2] - ZONES[4][1] + 1).toBe(141)
    checkBorder(resolve(442), ZONES, 37)
  })

  it('places FOOD above a rightward arrow inside the border', () => {
    const points = resolve(442)
    const word = points.slice(0, 237)
    const arrow = points.slice(378)
    expect(Math.max(...word.map((p) => p.sample[1]))).toBeLessThan(Math.min(...arrow.map((p) => p.sample[1])))
    for (let i = 378; i < 425; i++) expect(points[i].sample[0]).toBeLessThan(points[i + 1].sample[0])
    const head = points.slice(426)
    expect(head[Math.floor(head.length / 2)].sample[0]).toBeCloseTo(Math.max(...head.map((p) => p.sample[0])), 12)
    const border = points.slice(237, 378)
    const inner = [...word, ...arrow]
    for (const axis of [0, 1]) {
      expect(Math.min(...border.map((p) => p.sample[axis]))).toBeLessThan(Math.min(...inner.map((p) => p.sample[axis])))
      expect(Math.max(...border.map((p) => p.sample[axis]))).toBeGreaterThan(Math.max(...inner.map((p) => p.sample[axis])))
    }
  })

  it('re-solves the pitch and border at 300 pixels in the same Zone order', () => {
    const points = resolve(300)
    expect(points).toHaveLength(300)
    expect(ZONES_300.map(([name, start, end]) => [name, end - start + 1])).toEqual([
      ['F', 34], ['O1', 41], ['O2', 40], ['D', 45], ['border', 96],
      ['arrow1', 11], ['arrow2', 11], ['arrow3', 11], ['head', 11],
    ])
    const tube = pitches(points, ZONES_300, 25)
    expect(Math.max(...tube.map((p) => p.median)) / Math.min(...tube.map((p) => p.median))).toBeLessThanOrEqual(1.1)
    checkBorder(points, ZONES_300, 25)
  })

  it.each([7, 200])('resolves exactly %i finite points', (count) => {
    const points = resolve(count)
    expect(points).toHaveLength(count)
    expect(points.every((point) => point.sample.every(Number.isFinite))).toBe(true)
  })
})
