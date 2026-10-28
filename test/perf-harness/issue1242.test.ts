import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { compareIridescentSources, LIMIT, type EquivalenceReport, type CaseReport } from './issue1242'

let report: EquivalenceReport
beforeAll(() => {
  report = compareIridescentSources(
    readFileSync('test/perf-harness/fixtures/issue1242/IridescentFibers.preedit.js', 'utf8'),
    readFileSync('src/pixelblaze/stock/patterns/IridescentFibers.js', 'utf8'),
  )
  mkdirSync('.wrsp', { recursive: true })
  writeFileSync('.wrsp/issue1242-report.json', JSON.stringify(report, null, 2) + '\n')
  for (const { id, max, p99, sampleCount, blackPixelCount } of report.cases) {
    console.log(JSON.stringify({ id, max, p99, sampleCount, blackPixelCount }))
  }
  console.log(JSON.stringify({ costs: report.costs }))
}, 120000)

function assertRows(rows: CaseReport[], count: number, maxError = LIMIT) {
  expect(rows).toHaveLength(count)
  for (const row of rows) {
    expect(row.invalidChannels, row.id).toBe(0)
    expect(row.max, `${row.id}: ${JSON.stringify(row.maxWitness)}`).toBeLessThanOrEqual(maxError)
    expect(row.sampleCount, row.id).toBeGreaterThan(0)
  }
}
describe('issue1242 raw RGB and per-pixel cost', () => {
  it('T1 Fast default', () => assertRows(report.cases.filter((r) => r.group === 'default' && r.mode === 'fast'), 2))
  it('T2 Precise default', () => assertRows(report.cases.filter((r) => r.group === 'default' && r.mode === 'precise'), 2))
  it('T3 controls', () => {
    const rows = report.cases.filter((r) => r.group === 'controls')
    const acceptedCorner = (row: CaseReport) =>
      row.mode === 'precise' && row.controls?.zoom === 1 && row.controls?.thickness === 0
    assertRows(rows.filter((row) => !acceptedCorner(row)), 14)
    const acceptedRows = rows.filter(acceptedCorner)
    expect(acceptedRows).toHaveLength(2)
    // Jon accepted these measured Precise corners without further fidelity work:
    // https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1242#issuecomment-6480240939
    assertRows(acceptedRows.filter((row) => row.map === 'plane16x16'), 1, 0.0093994140625)
    assertRows(acceptedRows.filter((row) => row.map === 'stockPlane1024'), 1, 0.0121002197265625)
  })
  it('T4 large t', () => assertRows(report.cases.filter((r) => r.group === 'large-t'), 2))
  it('T5 early-out', () => {
    const rows = report.cases.filter((r) => r.group === 'early-out')
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.invalidChannels, row.id).toBe(0)
      expect(row.outerRowWitnessCount, row.id).toBeGreaterThan(0)
      expect(row.outerRowNonblackCount, row.id).toBe(0)
    }
  })
  it('T6 cost', () => {
    for (const row of report.cases.filter((r) => r.group === 'default')) {
      for (const calls of row.trig.before.pixel) expect(calls / row.trig.pixelCount, row.id).toBe(40)
      for (const calls of row.trig.after.pixel) expect(calls / row.trig.pixelCount, row.id).toBe(4)
    }
    expect(report.costs.before.arrayCount).toBe(1)
    expect(report.costs.before.elementWords).toBe(10)
    expect(report.costs.after.arrayCount).toBe(4)
    expect(report.costs.after.elementWords).toBe(80)
    expect(report.costs.after.pixelDivisions).toBe(0)
    expect(report.costs.after.pixelLoopTrigSites).toBe(0)
  })
})
