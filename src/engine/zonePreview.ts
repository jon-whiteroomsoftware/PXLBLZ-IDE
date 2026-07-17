import {
  controllerZonePixelCount,
  findControllerZoneByName,
  normalizeControllerZones,
  type ControllerProfile,
  type ControllerZone,
  type ControllerZoneRange,
} from '@/engine/controllerProfile'
import type { MapPoint } from '@/engine/maps'
import type { ShowZone } from '@/engine/personalContentRecords'
import { routeShowLogicalPoint, type ShowLogicalRouting } from '@/engine/showLogicalRouting'

export type PixelColor = [number, number, number]

export interface ZonePreviewStrip {
  id: string
  name: string
  color: string
  pixelCount: number
  offStage?: boolean
  samples: PixelColor[]
}

export interface ShowStageZone {
  id: string
  name: string
  color: string
  pixelCount: number
  offStage: boolean
}

export interface ShowStageProjection {
  zones: ShowStageZone[]
  pixelZoneIds: Array<string | null>
  unstagedPixelCount: number
}

interface PreviewControllerEntry {
  ip: string
  deviceId?: string | null
  phase: string
}

export interface ControllerPreviewZoneSource {
  activeIp: string | null
  controllers: Record<string, PreviewControllerEntry>
}

interface BuildZonePreviewOptions {
  maxSamples?: number
  fallbackColors?: string[]
}

const DEFAULT_ZONE_COLORS = [
  '#38bdf8',
  '#f97316',
  '#a78bfa',
  '#22c55e',
  '#f43f5e',
  '#eab308',
  '#14b8a6',
  '#fb7185',
]

const BLACK: PixelColor = [0, 0, 0]

function normalizeRange(range: ControllerZoneRange, pixelCount: number): ControllerZoneRange | null {
  if (pixelCount <= 0) return null
  const rawStart = Math.floor(range.start)
  const rawEnd = Math.floor(range.end)
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null

  const lo = Math.min(rawStart, rawEnd)
  const hi = Math.max(rawStart, rawEnd)
  if (hi < 0 || lo > pixelCount - 1) return null
  const start = Math.max(0, lo)
  const end = Math.min(pixelCount - 1, hi)
  if (end < start) return null
  return { start, end }
}

function pixelIndexesForRanges(ranges: ControllerZoneRange[], pixelCount: number): Set<number> {
  const indexes = new Set<number>()
  for (const range of ranges) {
    const normalized = normalizeRange(range, pixelCount)
    if (!normalized) continue
    for (let index = normalized.start; index <= normalized.end; index += 1) {
      indexes.add(index)
    }
  }
  return indexes
}

function sequentialRange(start: number, count: number): ControllerZoneRange {
  const safeCount = Math.max(0, Math.floor(count))
  return { start, end: start + safeCount - 1 }
}

function stageRangesForShowZones(
  zones: ShowZone[],
  controllerZones: ControllerZone[] | undefined,
): Array<{ zone: ShowZone; ranges: ControllerZoneRange[]; nominalPixelCount: number }> {
  const normalizedControllerZones = controllerZones ? normalizeControllerZones(controllerZones) : []
  let freestyleStart = 0
  return zones.map((zone) => {
    const bound = normalizedControllerZones.length
      ? findControllerZoneByName(normalizedControllerZones, zone.name)
      : undefined
    if (bound) {
      return { zone, ranges: bound.ranges, nominalPixelCount: controllerZonePixelCount(bound) }
    }

    const count = Math.max(0, Math.floor(zone.nominalPixelCount))
    const range = sequentialRange(freestyleStart, count)
    freestyleStart += count
    return { zone, ranges: count > 0 ? [range] : [], nominalPixelCount: count }
  })
}

function stripRangesForShowZones(
  zones: ShowZone[],
  controllerZones: ControllerZone[] | undefined,
): Array<{ zone: ShowZone; ranges: ControllerZoneRange[]; nominalPixelCount: number }> {
  const normalizedControllerZones = controllerZones ? normalizeControllerZones(controllerZones) : []
  let start = 0
  return zones.map((zone) => {
    const bound = normalizedControllerZones.length
      ? findControllerZoneByName(normalizedControllerZones, zone.name)
      : undefined
    const count = bound ? controllerZonePixelCount(bound) : Math.max(0, Math.floor(zone.nominalPixelCount))
    const range = sequentialRange(start, count)
    start += count
    return { zone, ranges: count > 0 ? [range] : [], nominalPixelCount: count }
  })
}

function buildProjectionFromRows(
  rows: Array<{ zone: ShowZone; ranges: ControllerZoneRange[]; nominalPixelCount: number }>,
  stagePixelCount: number,
  fallbackColors?: string[],
): ShowStageProjection {
  const colors = fallbackColors?.length ? fallbackColors : DEFAULT_ZONE_COLORS
  const pixelZoneIds: Array<string | null> = Array.from({ length: Math.max(0, stagePixelCount) }, () => null)
  const projectedZones: ShowStageZone[] = rows.map(({ zone, ranges, nominalPixelCount }, index) => {
    const indexes = pixelIndexesForRanges(ranges, pixelZoneIds.length)
    for (const pixelIndex of indexes) {
      if (pixelZoneIds[pixelIndex] === null) pixelZoneIds[pixelIndex] = zone.id
    }
    return {
      id: zone.id,
      name: zone.name,
      color: zone.color ?? colors[index % colors.length],
      pixelCount: indexes.size || nominalPixelCount,
      offStage: indexes.size === 0,
    }
  })

  return {
    zones: projectedZones,
    pixelZoneIds,
    unstagedPixelCount: pixelZoneIds.filter((zoneId) => zoneId === null).length,
  }
}

export function buildShowStripControllerZones(
  zones: ShowZone[],
  controllerZones?: ControllerZone[],
): ControllerZone[] {
  return stripRangesForShowZones(zones, controllerZones).map(({ zone, ranges }) => ({
    id: zone.id,
    name: zone.name,
    ranges,
  }))
}

function collectZonePixels(pixels: PixelColor[], zone: ControllerZone): PixelColor[] {
  const collected: PixelColor[] = []
  for (const range of zone.ranges) {
    const normalized = normalizeRange(range, pixels.length)
    if (!normalized) continue
    for (let index = normalized.start; index <= normalized.end; index += 1) {
      collected.push(pixels[index])
    }
  }
  return collected
}

function samplePixels(pixels: PixelColor[], maxSamples: number): PixelColor[] {
  if (pixels.length <= maxSamples) return pixels
  const step = pixels.length / maxSamples
  return Array.from({ length: maxSamples }, (_, index) => pixels[Math.floor(index * step)])
}

export function buildZonePreviewStrips(
  pixels: PixelColor[],
  zones: ControllerZone[],
  options: BuildZonePreviewOptions = {},
): ZonePreviewStrip[] {
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? 96))
  const colors = options.fallbackColors?.length ? options.fallbackColors : DEFAULT_ZONE_COLORS

  return zones
    .map((zone, index) => {
      const zonePixels = collectZonePixels(pixels, zone)
      return {
        id: zone.id,
        name: zone.name,
        color: colors[index % colors.length],
        pixelCount: zonePixels.length,
        samples: samplePixels(zonePixels, maxSamples),
      }
    })
    .filter((strip) => strip.pixelCount > 0)
}

export function buildShowStageProjection(
  zones: ShowZone[],
  stagePixelCount: number,
  options: { controllerZones?: ControllerZone[]; fallbackColors?: string[] } = {},
): ShowStageProjection {
  const rows = stageRangesForShowZones(zones, options.controllerZones)
  return buildProjectionFromRows(rows, stagePixelCount, options.fallbackColors)
}

export function buildShowLogicalStageProjection(
  zones: ShowZone[],
  mapPoints: MapPoint[],
  logical: ShowLogicalRouting,
  parameters: { splitPosition?: number } = {},
  fallbackColors?: string[],
): ShowStageProjection {
  const colors = fallbackColors?.length ? fallbackColors : DEFAULT_ZONE_COLORS
  const pixelZoneIds = mapPoints.map((point) => {
    const sample = point.sample.length >= 2 ? point.sample : point.pos ?? point.sample
    return routeShowLogicalPoint(logical, sample[0] ?? 0.5, sample[1] ?? 0.5, parameters).zoneId
  })
  return {
    zones: zones.map((zone, index) => {
      const pixelCount = pixelZoneIds.filter((zoneId) => zoneId === zone.id).length
      return {
        id: zone.id,
        name: zone.name,
        color: zone.color ?? colors[index % colors.length],
        pixelCount,
        offStage: pixelCount === 0,
      }
    }),
    pixelZoneIds,
    unstagedPixelCount: 0,
  }
}

export function showLogicalAspectAdvisory(
  mapPoints: MapPoint[],
  logical: ShowLogicalRouting,
): string | null {
  if (logical.kind === 'single' || mapPoints.length === 0) return null
  const samples = mapPoints.map((point) => point.sample.length >= 2 ? point.sample : point.pos ?? point.sample)
  const xs = samples.map((sample) => sample[0] ?? 0.5)
  const ys = samples.map((sample) => sample[1] ?? 0.5)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const usesX = logical.kind === 'grid' || logical.kind === 'pinwheel' || logical.axis === 'x'
  const usesY = logical.kind === 'grid' || logical.kind === 'pinwheel' || logical.axis === 'y'
  const narrowAxis = usesY && spanY < spanX * 0.75
    ? { name: 'Y', min: Math.min(...ys), max: Math.max(...ys), ratio: spanX / Math.max(spanY, Number.EPSILON) }
    : usesX && spanX < spanY * 0.75
      ? { name: 'X', min: Math.min(...xs), max: Math.max(...xs), ratio: spanY / Math.max(spanX, Number.EPSILON) }
      : null
  if (!narrowAxis) return null
  return `Reference map preserves about a ${narrowAxis.ratio.toFixed(1)}:1 aspect. ${narrowAxis.name} boundaries use its ${narrowAxis.min.toFixed(2)}-${narrowAxis.max.toFixed(2)} normalized coordinate range, so some position-based zones may be narrow or empty.`
}

export function buildShowStageStrips(
  pixels: PixelColor[],
  zones: ShowZone[],
  options: { controllerZones?: ControllerZone[]; maxSamples?: number; fallbackColors?: string[] } = {},
): ZonePreviewStrip[] {
  const rows = stripRangesForShowZones(zones, options.controllerZones)
  return buildZonePreviewStrips(
    pixels,
    rows.map(({ zone, ranges }) => ({
      id: zone.id,
      name: zone.name,
      ranges,
    })),
    options,
  ).map((strip, index) => ({
    ...strip,
    color: zones[index]?.color ?? strip.color,
  }))
}

export function buildShowStripsLayout(
  zones: ShowZone[],
  options: { controllerZones?: ControllerZone[] } = {},
): {
  mapPoints: MapPoint[]
  positions: [number, number][]
  projection: ShowStageProjection
} {
  const rows = stripRangesForShowZones(zones, options.controllerZones)
  const totalPixels = rows.reduce((sum, row) => sum + row.nominalPixelCount, 0)
  const projection = buildProjectionFromRows(rows, totalPixels)
  const rowCount = Math.max(1, rows.length)
  const maxRowPixels = Math.max(1, ...rows.map((row) => row.nominalPixelCount))
  const positions: [number, number][] = []
  const mapPoints: MapPoint[] = []

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const count = rows[rowIndex].nominalPixelCount
    const y = rowCount === 1 ? 0.5 : rowIndex / (rowCount - 1)
    for (let column = 0; column < count; column += 1) {
      const x = maxRowPixels === 1 ? 0.5 : column / (maxRowPixels - 1)
      const pos: [number, number] = [x, y]
      positions.push(pos)
      mapPoints.push({ sample: [], pos })
    }
  }

  return { mapPoints, positions, projection }
}

export function applyShowStageMask(
  pixels: PixelColor[],
  projection: ShowStageProjection,
  soloZoneId: string | null,
  unstagedColor: PixelColor = [0.055, 0.055, 0.06],
): PixelColor[] {
  return pixels.map((pixel, index) => {
    const zoneId = projection.pixelZoneIds[index] ?? null
    if (!zoneId) return unstagedColor
    if (soloZoneId && zoneId !== soloZoneId) return BLACK
    return pixel
  })
}

export interface ShowStageMaskPlan {
  pixelCount: number
  completeCoverage: boolean
  zoneOrdinals: Int32Array
  zoneOrdinalById: ReadonlyMap<string, number>
  output: Float64Array
}

export function createShowStageMaskPlan(
  projection: ShowStageProjection,
  pixelCount: number,
): ShowStageMaskPlan {
  const boundedPixelCount = Math.max(0, Math.floor(pixelCount))
  const zoneOrdinalById = new Map(projection.zones.map((zone, index) => [zone.id, index]))
  const zoneOrdinals = new Int32Array(boundedPixelCount)
  zoneOrdinals.fill(-1)
  let completeCoverage = true
  for (let index = 0; index < boundedPixelCount; index += 1) {
    const zoneId = projection.pixelZoneIds[index]
    const ordinal = zoneId === null || zoneId === undefined ? undefined : zoneOrdinalById.get(zoneId)
    if (ordinal === undefined) completeCoverage = false
    else zoneOrdinals[index] = ordinal
  }
  return {
    pixelCount: boundedPixelCount,
    completeCoverage,
    zoneOrdinals,
    zoneOrdinalById,
    output: new Float64Array(boundedPixelCount * 3),
  }
}

export function applyShowStageMaskPacked(
  frame: Float64Array,
  plan: ShowStageMaskPlan,
  soloZoneId: string | null,
  unstagedColor: PixelColor = [0.055, 0.055, 0.06],
): Float64Array {
  if (!soloZoneId && plan.completeCoverage && frame.length === plan.pixelCount * 3) return frame

  const soloOrdinal = soloZoneId ? plan.zoneOrdinalById.get(soloZoneId) : undefined
  const output = plan.output
  for (let index = 0; index < plan.pixelCount; index += 1) {
    const ordinal = plan.zoneOrdinals[index]
    const offset = index * 3
    if (ordinal < 0) {
      output[offset] = unstagedColor[0]
      output[offset + 1] = unstagedColor[1]
      output[offset + 2] = unstagedColor[2]
    } else if (soloZoneId && ordinal !== soloOrdinal) {
      output[offset] = 0
      output[offset + 1] = 0
      output[offset + 2] = 0
    } else {
      output[offset] = frame[offset] ?? 0
      output[offset + 1] = frame[offset + 1] ?? 0
      output[offset + 2] = frame[offset + 2] ?? 0
    }
  }
  return output
}

export function filterPixelsForSolo(
  pixels: PixelColor[],
  zones: ControllerZone[],
  soloZoneId: string | null,
): PixelColor[] {
  if (!soloZoneId) return pixels
  const zone = zones.find((candidate) => candidate.id === soloZoneId)
  if (!zone) return pixels

  const soloIndexes = new Set<number>()
  for (const range of zone.ranges) {
    const normalized = normalizeRange(range, pixels.length)
    if (!normalized) continue
    for (let index = normalized.start; index <= normalized.end; index += 1) {
      soloIndexes.add(index)
    }
  }

  return pixels.map((pixel, index) => (soloIndexes.has(index) ? pixel : BLACK))
}

export function selectControllerPreviewZones(
  profiles: ControllerProfile[],
  source: ControllerPreviewZoneSource,
): ControllerZone[] {
  const zonedProfiles = profiles.filter((profile) => profile.zones.length > 0)
  const active = source.activeIp ? source.controllers[source.activeIp] : undefined

  if (active) {
    if (active.deviceId) {
      const byDeviceId = zonedProfiles.find((profile) => profile.deviceId === active.deviceId)
      if (byDeviceId) return normalizeControllerZones(byDeviceId.zones)
    }

    const byIp = zonedProfiles.find((profile) => profile.lastSeenIp === active.ip)
    if (byIp) return normalizeControllerZones(byIp.zones)
  }

  const liveDeviceIds = Object.values(source.controllers)
    .filter((entry) => entry.phase === 'live' && entry.deviceId)
    .map((entry) => entry.deviceId)
  if (liveDeviceIds.length === 1) {
    const byOnlyLiveDevice = zonedProfiles.find((profile) => profile.deviceId === liveDeviceIds[0])
    if (byOnlyLiveDevice) return normalizeControllerZones(byOnlyLiveDevice.zones)
  }

  if (zonedProfiles.length === 1) return normalizeControllerZones(zonedProfiles[0].zones)
  return []
}
