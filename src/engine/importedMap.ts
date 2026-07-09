import { detectGridDims, inferDim } from './maps'
import type { MapRecord } from './personalContentRecords'

export interface ControllerMapImportArgs {
  id: string
  name: string
  points: number[][]
  controllerName: string
  deviceId?: string | null
  ip?: string | null
  mapHash?: string
  importedAt: number
}

export interface ControllerMapImportSummary {
  dim: 1 | 2 | 3
  pixelCount: number
  gridDims: MapRecord['gridDims'] | null
}

export function summarizeControllerMapImport(points: number[][]): ControllerMapImportSummary {
  return {
    dim: inferDim(points),
    pixelCount: points.length,
    gridDims: detectGridDims(points),
  }
}

export function createImportedControllerMapRecord(args: ControllerMapImportArgs): MapRecord {
  const summary = summarizeControllerMapImport(args.points)
  return {
    id: args.id,
    name: args.name,
    dim: summary.dim,
    generator: 'custom',
    params: {},
    points: args.points.map((point) => [...point]),
    ...(summary.gridDims ? { gridDims: summary.gridDims } : {}),
    importMetadata: {
      kind: 'controller',
      controllerName: args.controllerName,
      ...(args.deviceId !== undefined ? { deviceId: args.deviceId } : {}),
      ...(args.ip !== undefined ? { ip: args.ip } : {}),
      ...(args.mapHash !== undefined ? { mapHash: args.mapHash } : {}),
      pixelCount: summary.pixelCount,
      importedAt: args.importedAt,
      normalization: 'device-fill-normalized',
    },
    updatedAt: args.importedAt,
  }
}
