import type { MapRecord, PatternRecord } from './storage'
import {
  fromWorkspaceIsoDate,
  toWorkspaceIsoDate,
  workspaceFileNameForRecord,
} from './personalContentMetadata'

export interface WorkspacePatternFile {
  kind: 'pattern'
  id: string
  name: string
  updatedAt: string
  src: string
  controls?: Record<string, number | number[]>
  settings?: PatternRecord['settings']
  params?: PatternRecord['params']
}

export interface WorkspaceMapFile {
  kind: 'map'
  id: string
  name: string
  updatedAt: string
  dim: 1 | 2 | 3
  generator: string
  params: Record<string, number>
  points?: number[][]
  source?: string
  gridDims?: MapRecord['gridDims']
}

export interface WorkspaceContentPayload {
  ok: true
  patterns: WorkspacePatternFile[]
  maps: WorkspaceMapFile[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalRecord(value: unknown): Record<string, number | number[]> | undefined {
  return isObject(value) ? (value as Record<string, number | number[]>) : undefined
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Workspace record missing string ${field}`)
  return value
}

function requireDim(value: unknown): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value
  throw new Error(`Workspace map has invalid dim: ${String(value)}`)
}

export function patternRecordToWorkspaceFile(record: PatternRecord): WorkspacePatternFile {
  return {
    kind: 'pattern',
    id: record.id,
    name: record.name,
    updatedAt: toWorkspaceIsoDate(record.updatedAt),
    src: record.src,
    ...(Object.keys(record.controls).length ? { controls: record.controls } : {}),
    ...(record.settings ? { settings: record.settings } : {}),
    ...(record.params ? { params: record.params } : {}),
  }
}

export function patternRecordFromWorkspaceFile(file: unknown): PatternRecord {
  if (!isObject(file) || file.kind !== 'pattern') throw new Error('Expected workspace pattern record')
  return {
    id: requireString(file.id, 'id'),
    name: requireString(file.name, 'name'),
    updatedAt: fromWorkspaceIsoDate(requireString(file.updatedAt, 'updatedAt')),
    src: requireString(file.src, 'src'),
    controls: optionalRecord(file.controls) ?? {},
    ...(isObject(file.settings) ? { settings: file.settings as PatternRecord['settings'] } : {}),
    ...(isObject(file.params) ? { params: file.params as PatternRecord['params'] } : {}),
  }
}

export function mapRecordToWorkspaceFile(record: MapRecord): WorkspaceMapFile {
  return {
    kind: 'map',
    id: record.id,
    name: record.name,
    updatedAt: toWorkspaceIsoDate(record.updatedAt),
    dim: record.dim,
    generator: record.generator,
    params: record.params,
    ...(record.points ? { points: record.points } : {}),
    ...(record.source !== undefined ? { source: record.source } : {}),
    ...(record.gridDims ? { gridDims: record.gridDims } : {}),
  }
}

export function mapRecordFromWorkspaceFile(file: unknown): MapRecord {
  if (!isObject(file) || file.kind !== 'map') throw new Error('Expected workspace map record')
  return {
    id: requireString(file.id, 'id'),
    name: requireString(file.name, 'name'),
    updatedAt: fromWorkspaceIsoDate(requireString(file.updatedAt, 'updatedAt')),
    dim: requireDim(file.dim),
    generator: requireString(file.generator, 'generator'),
    params: isObject(file.params) ? (file.params as Record<string, number>) : {},
    ...(Array.isArray(file.points) ? { points: file.points as number[][] } : {}),
    ...(typeof file.source === 'string' ? { source: file.source } : {}),
    ...(isObject(file.gridDims) ? { gridDims: file.gridDims as MapRecord['gridDims'] } : {}),
  }
}

export function workspaceFileNameForPattern(record: Pick<PatternRecord, 'id' | 'name'>, used = new Set<string>()): string {
  return workspaceFileNameForRecord(record, used)
}

export function workspaceFileNameForMap(record: Pick<MapRecord, 'id' | 'name'>, used = new Set<string>()): string {
  return workspaceFileNameForRecord(record, used)
}

export function parseWorkspaceContentPayload(payload: unknown): WorkspaceContentPayload {
  if (!isObject(payload) || payload.ok !== true) throw new Error('Workspace API returned an invalid payload')
  const patterns = Array.isArray(payload.patterns)
    ? payload.patterns.map(patternRecordFromWorkspaceFile).map(patternRecordToWorkspaceFile)
    : []
  const maps = Array.isArray(payload.maps)
    ? payload.maps.map(mapRecordFromWorkspaceFile).map(mapRecordToWorkspaceFile)
    : []
  return { ok: true, patterns, maps }
}
