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
        storedArtifact: { sourceCode: stamped, pbp: programBlob('Aurora Drift', stamped) },
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
        storedArtifact: { sourceCode: source, pbp: programBlob('Foreign lights', source) },
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
      showOutputContract: {
        version: 1,
        kind: 'portable-2d',
        dimensions: [2],
        mapClasses: ['surface'],
        resolution: 'variable',
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
          showOutputContract: { kind: 'portable-2d', resolution: 'variable' },
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
        storedArtifact: { sourceCode: '', pbp: programBlob('Compiled only', '') },
      },
    })
  })

  const full = programBlob('Example', 'export function render(i) {}')
  const invalidSource = full.slice()
  // An odd compressed-source length cannot be decoded by LZString.
  new DataView(invalidSource.buffer).setUint32(32, 1, true)
  it.each([
    ['empty', new Uint8Array()],
    ['short header', full.slice(0, 35)],
    ['truncated section', full.slice(0, full.length - 1)],
    ['undecodable compressed source', invalidSource],
  ])('reports only response evidence for %s', (_name, bytes) => {
    expect(recoverSavedProgram('BROKEN', bytes)).toEqual({
      ok: false,
      error: {
        kind: 'undecodable',
        message: 'Saved program BROKEN response could not be decoded as PBP. Retry reading this saved program.',
      },
    })
  })

  it('retains the exact source and defensive PBP copy including JPEG and bytecode', () => {
    const sourceCode = stampArtifact('// old comment\nexport function render(i) { rgb(i,0,0) }', {
      kind: 'pattern', id: 'old', stampedAt: '2026-01-01',
    })
    const bytes = encodePbp({ id: 'old', name: 'Old', sourceCode,
      byteCode: Uint8Array.of(1, 2, 3), previewImage: Uint8Array.of(255, 216, 255, 217) })
    const original = bytes.slice()
    const result = recoverSavedProgram('old', bytes)
    bytes.fill(0)
    expect(result).toMatchObject({ ok: true, value: { storedArtifact: { pbp: original, sourceCode } } })
  })
})
