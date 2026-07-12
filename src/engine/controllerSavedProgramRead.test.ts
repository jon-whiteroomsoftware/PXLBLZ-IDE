import { stampArtifact } from './artifactStamp'
import { recoverSavedProgram } from './controllerSavedProgramRead'
import { encodePbp } from './pbpEncode'

function programBlob(name: string, sourceCode: string): Uint8Array {
  return encodePbp({
    id: 'DEVICE_PROGRAM_01',
    name,
    sourceCode,
    byteCode: Uint8Array.from([1, 2, 3]),
  })
}

describe('recoverSavedProgram', () => {
  it('recovers clean source and parsed metadata from an IDE-owned PBP blob', () => {
    const source = 'export function render(index) { hsv(index, 1, 1) }'
    const stamped = stampArtifact(source, {
      kind: 'pattern',
      id: 'studio-pattern-1',
      name: 'Aurora Drift',
      transforms: ['power-cap'],
      stampedAt: '2026-07-09T00:00:00.000Z',
    })

    expect(recoverSavedProgram('DEVICE_PROGRAM_01', programBlob('Aurora Drift', stamped))).toEqual({
      ok: true,
      value: {
        programId: 'DEVICE_PROGRAM_01',
        deviceName: 'Aurora Drift',
        sourceCode: source,
        stamp: expect.objectContaining({
          kind: 'pattern',
          id: 'studio-pattern-1',
          name: 'Aurora Drift',
          transforms: ['power-cap'],
        }),
      },
    })
  })

  it('recovers source from a foreign PBP without inventing Studio provenance', () => {
    const source = 'export function render(index) { rgb(index, 0, 1) }'

    expect(recoverSavedProgram('FOREIGN_PROGRAM', programBlob('Foreign lights', source))).toEqual({
      ok: true,
      value: {
        programId: 'FOREIGN_PROGRAM',
        deviceName: 'Foreign lights',
        sourceCode: source,
        stamp: null,
      },
    })
  })

  it('recovers preferred-map and compatibility metadata from a Controller-read Show (#411)', () => {
    const source = 'export function render2D(index, x, y) { hsv(x, 1, y) }'
    const stamped = stampArtifact(source, {
      kind: 'show',
      id: 'show-1',
      name: 'Adaptive stage',
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
      compatibility: {
        portability: 'adaptive',
        dimensions: [2],
        mapClasses: ['surface'],
        resolution: 'adaptive',
        exactMap: false,
      },
      stampedAt: '2026-07-12T00:00:00.000Z',
    })

    expect(recoverSavedProgram('SHOW_PROGRAM', programBlob('Adaptive stage', stamped))).toMatchObject({
      ok: true,
      value: {
        sourceCode: source,
        stamp: {
          preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
          compatibility: { portability: 'adaptive', dimensions: [2], exactMap: false },
        },
      },
    })
  })

  it('keeps a valid sourceless PBP recoverable', () => {
    expect(recoverSavedProgram('SOURCELESS', programBlob('Compiled only', ''))).toEqual({
      ok: true,
      value: {
        programId: 'SOURCELESS',
        deviceName: 'Compiled only',
        sourceCode: null,
        stamp: null,
      },
    })
  })

  it('returns a clean error result for an undecodable blob', () => {
    expect(recoverSavedProgram('BROKEN', Uint8Array.from([1, 2, 3]))).toEqual({
      ok: false,
      error: {
        kind: 'undecodable',
        message: 'Saved program BROKEN is not a readable PBP blob.',
      },
    })
  })
})
