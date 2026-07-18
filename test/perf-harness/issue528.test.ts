import { report } from './issue528'

describe('exact coordinate-field cache harness (#528)', () => {
  it('pins Redline and generic parity, operation savings, rebuilds, and zero additional arrays', () => {
    expect(report).toMatchObject({
      pixelCount: 2_000,
      redline: {
        selected: {
          coordinateFields: {
            selectedFieldCount: 7,
            cacheRebuildCountPerLoop: 7,
            additionalArrayWords: 0,
          },
        },
        counterfactual: {
          coordinateFields: {
            selectedFieldCount: 0,
            fields: expect.arrayContaining([expect.objectContaining({ reason: 'disabled' })]),
          },
        },
        equivalence: [
          { fidelity: 'fast', matches: true },
          { fidelity: 'fidelity', matches: true },
        ],
      },
      generic: {
        selected: {
          coordinateFields: {
            selectedFieldCount: 2,
            cacheRebuildCountPerLoop: 2,
            additionalArrayWords: 0,
          },
        },
        equivalence: [
          { fidelity: 'fast', matches: true },
          { fidelity: 'fidelity', matches: true },
        ],
      },
    })
    expect(report.redline.selected.coordinateFields.operationsAvoidedPerCachedFrame).toBeGreaterThan(0)
    expect(report.generic.selected.coordinateFields.operationsAvoidedPerCachedFrame).toBeGreaterThan(0)
    expect(report.redline.selected.resources.renderTargetWords).toBe(report.redline.counterfactual.resources.renderTargetWords)
    expect(report.generic.selected.resources.renderTargetWords).toBe(report.generic.counterfactual.resources.renderTargetWords)
  }, 60_000)
})
