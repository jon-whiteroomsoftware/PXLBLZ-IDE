import {
  buildShowToolkitPresentationCatalogue,
  filterShowToolkitPresentationCatalogue,
  validateShowToolkitPresentationSummaries,
} from './showVisualToolkitPresentation'

describe('Show visual-toolkit presentation catalogue', () => {
  it('presents every frozen runtime variant through stable catalogue keys', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })

    expect(catalogue).toHaveLength(64)
    expect(new Set(catalogue.map((item) => item.key)).size).toBe(catalogue.length)
    expect(catalogue.every((item) => item.summary.length > 0)).toBe(true)
  })

  it('finds variants through family, summary, and preset language', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })

    expect(filterShowToolkitPresentationCatalogue(catalogue, {
      kind: 'effect',
      query: 'pinch',
      compatibleOnly: true,
    }).map((item) => item.key)).toEqual(['effect:distortion:bulge'])
  })

  it.each([
    ['flip', 'effect:affine:mirror'],
    ['address', 'effect:affine:wrap'],
    ['segments', 'effect:distortion:kaleidoscope'],
    ['pinch', 'effect:distortion:bulge'],
  ])('finds an Effect through %s search vocabulary', (query, key) => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })

    expect(filterShowToolkitPresentationCatalogue(catalogue, {
      kind: 'effect',
      query,
      compatibleOnly: true,
    }).map((item) => item.key)).toContain(key)
  })

  it('reports compatibility and the actual Effect pipeline stage', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 1 })
    const byKey = new Map(catalogue.map((item) => [item.key, item]))

    expect(byKey.get('effect:affine:translate')).toMatchObject({
      compatible: false,
      effectStage: 'transform',
    })
    expect(byKey.get('effect:affine:mirror')).toMatchObject({
      compatible: true,
      effectStage: 'transform',
      authoringTarget: 'placement-mirror',
    })
    expect(byKey.get('effect:affine:wrap')).toMatchObject({
      compatible: false,
      effectStage: 'address',
    })
    expect(byKey.get('effect:output:opacity')).toMatchObject({
      compatible: true,
      effectStage: 'color-output',
    })
  })

  it('rejects missing and unknown presentation families without changing runtime ids', () => {
    expect(validateShowToolkitPresentationSummaries()).toEqual([])
    expect(validateShowToolkitPresentationSummaries({
      'effect:output': 'Output presentation.',
      'effect:not-runtime': 'Unknown presentation.',
    })).toEqual(expect.arrayContaining([
      'Missing presentation family property-animation:property.',
      'Unknown presentation family effect:not-runtime.',
    ]))
  })
})
