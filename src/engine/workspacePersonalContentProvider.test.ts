import {
  browserPersonalContentProvider,
  getPersonalContentProvider,
  initializePersonalContentProvider,
  resetPersonalContentProvider,
} from './personalContentProvider'
import { createWorkspacePersonalContentProvider } from './workspacePersonalContentProvider'
import { patternRecordToWorkspaceFile, mapRecordToWorkspaceFile } from './workspaceContent'
import type { MapRecord, PatternRecord } from './storage'

const pattern: PatternRecord = {
  id: 'p1',
  name: 'Workspace Pattern',
  src: 'export function render(index) { hsv(0, 1, 1) }',
  controls: {},
  updatedAt: Date.UTC(2026, 5, 24),
}

const map: MapRecord = {
  id: 'm1',
  name: 'Workspace Map',
  dim: 2,
  generator: 'custom',
  params: {},
  source: 'function(pixelCount){ return [[0,0]] }',
  points: [[0, 0]],
  updatedAt: Date.UTC(2026, 5, 24),
}

function okFetch(payload: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }) as unknown as typeof fetch
}

describe('workspace personal content provider', () => {
  beforeEach(() => resetPersonalContentProvider())

  it('reads workspace patterns and maps from the dev API', async () => {
    const fetchFn = okFetch({
      ok: true,
      patterns: [patternRecordToWorkspaceFile(pattern)],
      maps: [mapRecordToWorkspaceFile(map)],
    })
    const provider = createWorkspacePersonalContentProvider(browserPersonalContentProvider, fetchFn)

    expect(await provider.listPatterns()).toEqual([pattern])
    expect(await provider.listMaps()).toEqual([map])
  })

  it('writes workspace patterns and maps through the dev API', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, patterns: [patternRecordToWorkspaceFile(pattern)], maps: [mapRecordToWorkspaceFile(map)] }),
    }) as unknown as typeof fetch
    const provider = createWorkspacePersonalContentProvider(browserPersonalContentProvider, fetchFn)

    await provider.createPattern(pattern)
    await provider.updatePattern(pattern.id, { name: 'Renamed Pattern' })
    await provider.deletePattern(pattern.id)
    await provider.createMap(map)
    await provider.updateMap(map.id, { name: 'Renamed Map' })
    await provider.deleteMap(map.id)

    expect(fetchFn).toHaveBeenCalledWith('/__personal-content/patterns', expect.objectContaining({ method: 'POST' }))
    expect(fetchFn).toHaveBeenCalledWith('/__personal-content/patterns/p1', expect.objectContaining({ method: 'DELETE' }))
    expect(fetchFn).toHaveBeenCalledWith('/__personal-content/maps', expect.objectContaining({ method: 'POST' }))
    expect(fetchFn).toHaveBeenCalledWith('/__personal-content/maps/m1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('selects the workspace provider on localhost when the API is available', async () => {
    const provider = await initializePersonalContentProvider({
      location: { hostname: '[::1]' },
      fetchFn: okFetch({ ok: true, patterns: [], maps: [] }),
    })

    expect(provider.id).toBe('workspace-files')
    expect(getPersonalContentProvider().id).toBe('workspace-files')
  })

  it('keeps browser storage in production or localhost fallback', async () => {
    const production = await initializePersonalContentProvider({
      location: { hostname: 'example.com' },
      fetchFn: okFetch({ ok: true, patterns: [], maps: [] }),
    })
    expect(production).toBe(browserPersonalContentProvider)

    const failingFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    const fallback = await initializePersonalContentProvider({
      location: { hostname: 'localhost' },
      fetchFn: failingFetch,
    })
    expect(fallback).toBe(browserPersonalContentProvider)
  })
})
