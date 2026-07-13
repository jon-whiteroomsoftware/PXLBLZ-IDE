import { parseEpe } from './epeImport'
import { stampArtifact } from './artifactStamp'

const validEpe = JSON.stringify({
  name: 'Doom Fire',
  id: 'abc123',
  sources: { main: 'export function render(i) { hsv(i, 1, 1) }' },
  preview: 'base64...',
})

describe('parseEpe', () => {
  it('extracts name and src from a valid EPE', () => {
    const result = parseEpe(validEpe)
    expect(result.name).toBe('Doom Fire')
    expect(result.src).toBe('export function render(i) { hsv(i, 1, 1) }')
  })

  it('trims whitespace from the name', () => {
    const epe = JSON.stringify({ name: '  My Pattern  ', sources: { main: 'code' } })
    expect(parseEpe(epe).name).toBe('My Pattern')
  })

  it('recovers PXLBLZ map compatibility metadata from sources.main (#411)', () => {
    const src = stampArtifact('export function render2D(index, x, y) {}', {
      kind: 'show',
      id: 'show-1',
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

    expect(parseEpe(JSON.stringify({ name: 'Adaptive Show', sources: { main: src } })).stamp).toMatchObject({
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
      compatibility: { portability: 'adaptive', dimensions: [2], exactMap: false },
      showOutputContract: { kind: 'portable-2d', resolution: 'variable' },
    })
  })

  it('throws on invalid JSON', () => {
    expect(() => parseEpe('not json')).toThrow('invalid JSON')
  })

  it('throws when name is missing', () => {
    const epe = JSON.stringify({ sources: { main: 'code' } })
    expect(() => parseEpe(epe)).toThrow('missing a name')
  })

  it('throws when name is empty string', () => {
    const epe = JSON.stringify({ name: '   ', sources: { main: 'code' } })
    expect(() => parseEpe(epe)).toThrow('missing a name')
  })

  it('throws when sources is missing', () => {
    const epe = JSON.stringify({ name: 'Test' })
    expect(() => parseEpe(epe)).toThrow('missing sources')
  })

  it('throws when sources.main is missing', () => {
    const epe = JSON.stringify({ name: 'Test', sources: {} })
    expect(() => parseEpe(epe)).toThrow('missing sources.main')
  })

  it('throws when sources.main is not a string', () => {
    const epe = JSON.stringify({ name: 'Test', sources: { main: 42 } })
    expect(() => parseEpe(epe)).toThrow('missing sources.main')
  })
})
