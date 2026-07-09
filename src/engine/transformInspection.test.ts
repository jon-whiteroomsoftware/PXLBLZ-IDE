import {
  selectTransformArtifactInspection,
  withTransformArtifactInspection,
  type TransformArtifactInspection,
} from './transformInspection'

describe('transformInspection', () => {
  it('selects exact artifacts, then latest for controller, then latest overall', () => {
    const older = artifact('Older', 1)
    const newer = artifact('Newer', 2)
    const newest = artifact('Newest', 3)
    const store = {
      '10.0.0.5': { 'pat-1': older, 'pat-2': newer },
      '10.0.0.9': { 'pat-3': newest },
    }

    expect(selectTransformArtifactInspection(store, '10.0.0.5', 'pat-1')).toBe(older)
    expect(selectTransformArtifactInspection(store, '10.0.0.5', 'missing')).toBe(newer)
    expect(selectTransformArtifactInspection(store)).toBe(newest)
  })

  it('adds and removes artifacts immutably', () => {
    const stored = withTransformArtifactInspection({}, '10.0.0.5', 'pat-1', artifact('Twinkle', 1))
    const removed = withTransformArtifactInspection(stored, '10.0.0.5', 'pat-1', null)

    expect(stored['10.0.0.5']['pat-1'].patternName).toBe('Twinkle')
    expect(removed).toEqual({})
  })
})

function artifact(patternName: string, updatedAt: number): TransformArtifactInspection {
  return {
    patternName,
    updatedAt,
    generatedSource: '',
    warnings: [],
    summary: {
      passes: [],
      callSitesWrapped: {},
      beforeRender: 'unchanged',
      globalsAdded: [],
      exportsAdded: [],
      bindingsApplied: [],
      estimatedPixelCost: 0,
    },
  }
}
