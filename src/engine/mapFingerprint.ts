import { crc32 } from './bytecodePush'
import { encodeMapData, type MapCoord } from './mapPush'
import { bakeMapSource, stockMapSpec, STOCK_MAP_SPECS } from './maps'
import type { ControllerMapFingerprint, ControllerProfile } from './controllerProfile'
import type { MapRecord } from './personalContentRecords'

export type StudioMapKind = 'stock' | 'user'
export type InstalledMapIdentityKind = StudioMapKind | 'historical'

export interface StudioMapFingerprintCandidate {
  id: string
  name: string
  kind: StudioMapKind
  hash: string
}

export interface MapFingerprintMatch {
  id: string
  name: string
  kind: InstalledMapIdentityKind
  hash: string
  via: 'profile-record' | 'candidate'
}

export function mapDataHash(bytes: Uint8Array): string {
  return crc32(bytes).toString(16).padStart(8, '0')
}

export function mapFingerprintForPoints(points: MapCoord[]): string {
  return mapDataHash(encodeMapData(points))
}

export function withMapFingerprintRecord(
  records: ControllerMapFingerprint[] | undefined,
  record: ControllerMapFingerprint,
  limit = 20,
): ControllerMapFingerprint[] {
  const kept = (records ?? []).filter((item) => item.hash !== record.hash)
  return [record, ...kept].slice(0, limit)
}

export function buildStudioMapFingerprintCandidates(args: {
  userMaps: MapRecord[]
  pixelCount: number
}): StudioMapFingerprintCandidate[] {
  const candidates: StudioMapFingerprintCandidate[] = []

  for (const spec of STOCK_MAP_SPECS) {
    const stock = stockMapSpec(spec.id)
    if (!stock) continue
    const hash = hashSourceAtPixelCount(stock.source, args.pixelCount)
    if (hash) candidates.push({ id: stock.id, name: stock.name, kind: 'stock', hash })
  }

  for (const map of args.userMaps) {
    const hash =
      typeof map.source === 'string'
        ? hashSourceAtPixelCount(map.source, args.pixelCount)
        : hashFrozenPoints(map.points, args.pixelCount)
    if (hash) candidates.push({ id: map.id, name: map.name, kind: 'user', hash })
  }

  return candidates
}

export function matchInstalledMapFingerprint(args: {
  hash: string
  profile?: ControllerProfile | null
  candidates: StudioMapFingerprintCandidate[]
}): MapFingerprintMatch | null {
  const byId = new Map(args.candidates.map((candidate) => [candidate.id, candidate]))
  const profileRecord = args.profile?.mapFingerprints?.find((record) => record.hash === args.hash)
  if (profileRecord) {
    const candidate = byId.get(profileRecord.mapId)
    if (candidate) return { ...candidate, hash: args.hash, via: 'profile-record' }
    return {
      id: profileRecord.mapId,
      name: profileRecord.mapName,
      kind: 'historical',
      hash: args.hash,
      via: 'profile-record',
    }
  }

  const matches = args.candidates.filter((item) => item.hash === args.hash)
  return matches.length === 1 ? { ...matches[0], via: 'candidate' } : null
}

function hashSourceAtPixelCount(source: string, pixelCount: number): string | null {
  try {
    return mapFingerprintForPoints(bakeMapSource(source, pixelCount).points)
  } catch {
    return null
  }
}

function hashFrozenPoints(points: number[][] | undefined, pixelCount: number): string | null {
  if (!points || points.length !== pixelCount) return null
  try {
    return mapFingerprintForPoints(points)
  } catch {
    return null
  }
}
