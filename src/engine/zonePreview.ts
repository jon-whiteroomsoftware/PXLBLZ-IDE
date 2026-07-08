import {
  normalizeControllerZones,
  type ControllerProfile,
  type ControllerZone,
  type ControllerZoneRange,
} from '@/engine/controllerProfile'

export type PixelColor = [number, number, number]

export interface ZonePreviewStrip {
  id: string
  name: string
  color: string
  pixelCount: number
  samples: PixelColor[]
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
  const start = Math.max(0, Math.min(pixelCount - 1, lo))
  const end = Math.max(0, Math.min(pixelCount - 1, hi))
  if (end < start) return null
  return { start, end }
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
