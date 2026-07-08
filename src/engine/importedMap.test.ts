import { createImportedControllerMapRecord, summarizeControllerMapImport } from './importedMap'

describe('controller map imports', () => {
  it('summarizes arity, point count, and lattice dims', () => {
    const summary = summarizeControllerMapImport([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])

    expect(summary).toEqual({
      dim: 2,
      pixelCount: 4,
      gridDims: { cols: 2, rows: 2 },
    })
  })

  it('creates a frozen custom MapRecord with display-only controller provenance', () => {
    const record = createImportedControllerMapRecord({
      id: 'map-1',
      name: 'Controller map',
      points: [[0], [1]],
      controllerName: 'Bench Pixelblaze',
      deviceId: 'pixelblaze_pb32_abc',
      ip: '192.168.8.224',
      importedAt: 1234,
    })

    expect(record).toMatchObject({
      id: 'map-1',
      name: 'Controller map',
      dim: 1,
      generator: 'custom',
      params: {},
      points: [[0], [1]],
      updatedAt: 1234,
      importMetadata: {
        kind: 'controller',
        controllerName: 'Bench Pixelblaze',
        deviceId: 'pixelblaze_pb32_abc',
        ip: '192.168.8.224',
        pixelCount: 2,
        importedAt: 1234,
        normalization: 'device-fill-normalized',
      },
    })
    expect(record.source).toBeUndefined()
  })
})
