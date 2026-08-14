import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import type { MapRecord, PatternRecord } from './personalContentRecords'
import {
  buildShowFileBundle,
  parseShowFileBundle,
  serializeShowFileBundle,
} from './showFileBundle'

describe('Show file bundle export', () => {
  it('collects the reachable user Pattern and custom output Map without mutating the library', () => {
    const show = createDefaultShow('show-original', 'Voltage Bloom', 100)
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'user', id: 'pattern-user' },
      patternName: 'Squiggles',
    }
    show.stageMapId = 'map-custom'
    show.outputContract = {
      version: 1,
      kind: 'installation',
      outputMapId: 'map-custom',
      pixelCount: 2,
      resolution: 'fixed',
    }
    const pattern: PatternRecord = {
      id: 'pattern-user',
      name: 'Squiggles',
      src: 'export function render(index) { hsv(index, 1, 1) }',
      controls: { speed: 0.5 },
      authors: ['Pattern Author'],
      updatedAt: 50,
    }
    const map: MapRecord = {
      id: 'map-custom',
      name: 'Warehouse Grid',
      dim: 2,
      generator: 'custom',
      params: {},
      points: [[0, 0], [1, 1]],
      source: 'function (pixelCount) { return [[0, 0], [1, 1]] }',
      updatedAt: 60,
    }
    const library = { patterns: [pattern], maps: [map] }
    const before = structuredClone({ show, library })

    const result = buildShowFileBundle(show, library, {
      appVersion: '1.0.0',
      exportedAt: '2026-08-14T12:00:00.000Z',
    })

    expect(result.filename).toBe('voltage-bloom.pxlshow')
    expect(result.bundle).toEqual({
      version: 1,
      show,
      patterns: [pattern],
      maps: [map],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: 'show-original',
      },
    })
    expect({ show, library }).toEqual(before)
    expect(result.bundle.show).not.toBe(show)
    expect(result.bundle.patterns[0]).not.toBe(pattern)
    expect(result.bundle.maps[0]).not.toBe(map)
  })

  it('serializes a bundle as gzip and parses it back without changing the authored Show', async () => {
    const show = createDefaultShow('show-round-trip', 'Round Trip', 100)
    const { bundle } = buildShowFileBundle(show, { patterns: [], maps: [] }, {
      appVersion: '1.0.0',
      exportedAt: '2026-08-14T12:00:00.000Z',
    })

    const bytes = await serializeShowFileBundle(bundle)
    const parsed = await parseShowFileBundle(bytes)

    expect([...bytes.slice(0, 2)]).toEqual([0x1f, 0x8b])
    expect(parsed).toEqual(bundle)
  })

  it('rejects a version-1 JSON object that is not a complete bundle', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, show: {} }))

    await expect(parseShowFileBundle(bytes)).rejects.toMatchObject({
      name: 'ShowFileBundleError',
      code: 'invalid_file',
      message: expect.stringContaining('Show record'),
    })
  })

  it.each([
    ['missing points', 2, undefined],
    ['empty points', 2, []],
    ['zero-coordinate points', 2, [[]]],
    ['mixed coordinate arity', 2, [[0, 0], [1]]],
    ['dimension mismatch', 3, [[0, 0]]],
  ] as const)('rejects a custom Map with %s', async (_label, dim, points) => {
    const show = createDefaultShow('show-invalid-map', 'Invalid Map', 100)
    show.stageMapId = 'map-invalid'
    show.outputContract = {
      version: 1,
      kind: 'installation',
      outputMapId: 'map-invalid',
      pixelCount: 2,
      resolution: 'fixed',
    }
    const malformedMap = {
      id: 'map-invalid',
      name: 'Invalid Map',
      dim,
      generator: 'custom',
      params: {},
      ...(points === undefined ? {} : { points }),
      updatedAt: 10,
    }
    const bytes = new TextEncoder().encode(JSON.stringify({
      version: 1,
      show,
      patterns: [],
      maps: [malformedMap],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: show.id,
      },
    }))

    await expect(parseShowFileBundle(bytes)).rejects.toMatchObject({
      code: 'invalid_file',
      message: expect.stringContaining('Map list'),
    })
  })

  it.each(['sceneId', 'zoneId', 'sceneSpan', 'adaptations'] as const)(
    'rejects a flat cell missing %s before planning can persist it',
    async (field) => {
      const show = createDefaultShow('show-invalid-cell', 'Invalid Cell', 100)
      const malformedCell = { ...show.cells[0] } as Record<string, unknown>
      delete malformedCell[field]
      const bytes = new TextEncoder().encode(JSON.stringify({
        version: 1,
        show: { ...show, cells: [malformedCell] },
        patterns: [],
        maps: [],
        provenance: {
          appVersion: '1.0.0',
          exportedAt: '2026-08-14T12:00:00.000Z',
          originalShowId: show.id,
        },
      }))

      await expect(parseShowFileBundle(bytes)).rejects.toMatchObject({
        code: 'invalid_file',
        message: expect.stringContaining('cell'),
      })
    },
  )

  it.each([
    ['sceneId', 'missing-scene'],
    ['zoneId', 'missing-zone'],
  ] as const)('rejects a flat cell whose %s does not name an owner in the Show', async (field, missingId) => {
    const show = createDefaultShow('show-dangling-cell', 'Dangling Cell', 100)
    const bytes = new TextEncoder().encode(JSON.stringify({
      version: 1,
      show: {
        ...show,
        cells: [{ ...show.cells[0], [field]: missingId }],
      },
      patterns: [],
      maps: [],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: show.id,
      },
    }))

    await expect(parseShowFileBundle(bytes)).rejects.toMatchObject({
      code: 'invalid_file',
      message: expect.stringContaining('cell'),
    })
  })

  it.each([
    ['restartOnEntry', 'false'],
    ['evaluationPolicy', 'sometimes'],
    ['presentation', { mode: 'strobe', cadenceMs: 'fast' }],
    ['blink', { rateHz: 2, duty: 'half', phase: 0 }],
    ['controlTargets', { sliderSpeed: 'fast' }],
    ['transform', { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 'wide' }],
    ['viewport', { enabled: 'yes', x: 0, y: 0, width: 1, height: 1 }],
    ['effects', [{ id: 'fx-1', kind: 'brightness', brightness: 'high' }]],
    ['effects', [{ id: 'fx-prototype', kind: 'constructor' }]],
  ])('rejects invalid optional flat-cell %s state', async (field, invalidValue) => {
    const show = createDefaultShow('show-invalid-optional-cell', 'Invalid Optional Cell', 100)
    const malformedCell = { ...show.cells[0], [field]: invalidValue }
    const bytes = new TextEncoder().encode(JSON.stringify({
      version: 1,
      show: { ...show, cells: [malformedCell] },
      patterns: [],
      maps: [],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: show.id,
      },
    }))

    await expect(parseShowFileBundle(bytes)).rejects.toMatchObject({
      code: 'invalid_file',
      message: expect.stringContaining('cell'),
    })
  })

  it('rejects an Effect kind inherited from a polluted Object prototype', async () => {
    const inheritedKind = 'issue853InheritedEffect'
    Object.defineProperty(Object.prototype, inheritedKind, { value: [], configurable: true })
    try {
      const show = createDefaultShow('show-inherited-effect', 'Inherited Effect', 100)
      const bytes = new TextEncoder().encode(JSON.stringify({
        version: 1,
        show: {
          ...show,
          cells: [{ ...show.cells[0], effects: [{ id: 'fx-inherited', kind: inheritedKind }] }],
        },
        patterns: [],
        maps: [],
        provenance: {
          appVersion: '1.0.0',
          exportedAt: '2026-08-14T12:00:00.000Z',
          originalShowId: show.id,
        },
      }))

      await expect(parseShowFileBundle(bytes)).rejects.toMatchObject({
        code: 'invalid_file',
        message: expect.stringContaining('cell'),
      })
    } finally {
      Reflect.deleteProperty(Object.prototype, inheritedKind)
    }
  })

  it('accepts the inspectable raw-JSON form', async () => {
    const show = createDefaultShow('show-json', 'Raw JSON', 100)
    const { bundle } = buildShowFileBundle(show, { patterns: [], maps: [] }, {
      appVersion: '1.0.0',
      exportedAt: '2026-08-14T12:00:00.000Z',
    })

    await expect(parseShowFileBundle(
      new TextEncoder().encode(`\n  ${JSON.stringify(bundle)}`),
    )).resolves.toEqual(bundle)
  })

  it('rejects newer versions and corrupt gzip with typed, actionable errors', async () => {
    await expect(parseShowFileBundle(new TextEncoder().encode(JSON.stringify({ version: 2 })))).rejects.toMatchObject({
      code: 'unsupported_version',
      message: expect.stringContaining('Update PXLBLZ'),
    })
    await expect(parseShowFileBundle(Uint8Array.from([0x1f, 0x8b, 0x08, 0x00]))).rejects.toMatchObject({
      code: 'invalid_file',
      message: expect.stringMatching(/truncated|corrupt/),
    })
  })

  it('names a referenced user Pattern that cannot be embedded', () => {
    const show = createDefaultShow('show-missing-pattern', 'Missing Pattern', 100)
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'user', id: 'not-in-library' },
      patternName: 'Lost Pattern',
    }

    expect(() => buildShowFileBundle(show, { patterns: [], maps: [] }, {
      appVersion: '1.0.0',
    })).toThrow(expect.objectContaining({
      code: 'missing_user_pattern',
      message: expect.stringContaining('not-in-library'),
    }))
  })

  it('embeds user Patterns referenced only by a reusable Group definition', () => {
    const show = createDefaultShow('show-group', 'Grouped Show', 100)
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: show.zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
      })),
      groupDefinitions: [{
        id: 'phrase',
        name: 'Phrase',
        patternInstances: [{
          id: 'inside-instance',
          pattern: { kind: 'user', id: 'group-pattern' },
          patternName: 'Group Pattern',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [{
          id: 'inside-placement',
          instanceId: 'inside-instance',
          layerOffset: 0,
          startMs: 0,
          durationMs: 1_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }],
      groupOccurrences: [{
        id: 'phrase-use',
        definitionId: 'phrase',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        startMs: 0,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }
    const groupPattern = patternRecord('group-pattern', 'Group Pattern', 'export function render(i) { hsv(i, 1, 1) }')

    const { bundle } = buildShowFileBundle(show, { patterns: [groupPattern], maps: [] }, {
      appVersion: '1.0.0',
    })

    expect(bundle.patterns).toEqual([groupPattern])
  })
})

function patternRecord(id: string, name: string, src: string): PatternRecord {
  return { id, name, src, controls: {}, updatedAt: 10 }
}
