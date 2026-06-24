import type { MapRecord, PatternRecord } from './storage'
import {
  mapRecordFromWorkspaceFile,
  mapRecordToWorkspaceFile,
  parseWorkspaceContentPayload,
  patternRecordFromWorkspaceFile,
  patternRecordToWorkspaceFile,
  workspaceFileNameForMap,
  workspaceFileNameForPattern,
} from './workspaceContent'

const pattern: PatternRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'My Pattern',
  src: 'export function render(index) { hsv(0, 1, 1) }',
  controls: {},
  settings: { brightness: 0.5 },
  updatedAt: Date.UTC(2026, 5, 24),
}

const map: MapRecord = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'My Map',
  dim: 2,
  generator: 'custom',
  params: {},
  source: 'function(pixelCount){ return [[0,0]] }',
  points: [[0, 0]],
  updatedAt: Date.UTC(2026, 5, 24),
}

describe('workspace content file format', () => {
  it('round-trips pattern records through ISO workspace metadata', () => {
    const file = patternRecordToWorkspaceFile(pattern)
    expect(file.updatedAt).toBe('2026-06-24T00:00:00.000Z')
    expect(patternRecordFromWorkspaceFile(file)).toEqual(pattern)
  })

  it('round-trips map records through ISO workspace metadata', () => {
    const file = mapRecordToWorkspaceFile(map)
    expect(file.updatedAt).toBe('2026-06-24T00:00:00.000Z')
    expect(mapRecordFromWorkspaceFile(file)).toEqual(map)
  })

  it('validates workspace API payloads', () => {
    const payload = parseWorkspaceContentPayload({
      ok: true,
      patterns: [patternRecordToWorkspaceFile(pattern)],
      maps: [mapRecordToWorkspaceFile(map)],
    })
    expect(payload.patterns).toHaveLength(1)
    expect(payload.maps).toHaveLength(1)
  })

  it('derives safe filenames for patterns and maps', () => {
    expect(workspaceFileNameForPattern(pattern)).toBe('my-pattern--00000000-0000-4000-8000-000000000001.json')
    expect(workspaceFileNameForMap(map)).toBe('my-map--00000000-0000-4000-8000-000000000002.json')
  })
})
