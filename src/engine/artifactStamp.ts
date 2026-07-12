import { crc32 } from './bytecodePush'

export type ArtifactKind = 'pattern' | 'show'
export type ArtifactMapClass = 'path' | 'surface' | 'shell' | 'volume' | 'custom'

export type ArtifactPreferredMap =
  | { kind: 'stock'; id: string; name: string }
  | { kind: 'custom'; name: string }

export interface ArtifactMapCompatibility {
  portability: 'adaptive' | 'installation-bound'
  dimensions: Array<1 | 2 | 3>
  mapClasses: ArtifactMapClass[]
  resolution: 'adaptive' | 'fixed'
  aspectRatio?: { min: number; max: number }
  exactMap: boolean
}

export interface ArtifactStampMeta {
  kind: ArtifactKind
  id: string
  name?: string
  transforms?: string[]
  preferredMap?: ArtifactPreferredMap
  compatibility?: ArtifactMapCompatibility
  stampedAt?: Date | string
}

export interface ParsedPxlblzBanner {
  version: 1
  kind: ArtifactKind
  id: string
  name?: string
  hash: string
  stamped: string
  transforms: string[]
  preferredMap?: ArtifactPreferredMap
  compatibility?: ArtifactMapCompatibility
}

const HEADER = '// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/'
const META_PREFIX = '// pxlblz:1 '
const TRANSFORMS_PREFIX = '// pxlblz:transforms '
const MAP_PREFIX = '// pxlblz:map '
const COMPAT_PREFIX = '// pxlblz:compat '
const HASH_BYTES = new TextEncoder()

export function artifactHash(code: string): string {
  return crc32(HASH_BYTES.encode(stripPxlblzBanner(code)))
    .toString(16)
    .padStart(8, '0')
}

export function stampArtifact(code: string, meta: ArtifactStampMeta): string {
  const body = stripPxlblzBanner(code)
  const hash = artifactHash(body)
  const stamped = stampDate(meta.stampedAt)
  const lines = [
    HEADER,
    `${META_PREFIX}kind=${meta.kind} id=${tokenValue(meta.id)} name=${quotedValue(meta.name ?? '')} hash=${hash} stamped=${stamped}`,
  ]
  const transforms = uniqueSafeTokens(meta.transforms ?? [])
  if (transforms.length > 0) lines.push(`${TRANSFORMS_PREFIX}${transforms.join(' ')}`)
  if (meta.preferredMap) lines.push(formatPreferredMap(meta.preferredMap))
  if (meta.compatibility) lines.push(formatCompatibility(meta.compatibility))
  return `${lines.join('\n')}\n${body}`
}

export function parsePxlblzBanner(code: string): ParsedPxlblzBanner | null {
  const lines = code.split('\n')
  if (lines[0] !== HEADER) return null
  if (!lines[1]?.startsWith(META_PREFIX)) return null

  const fields = parseFields(lines[1].slice(META_PREFIX.length))
  if (fields.kind !== 'pattern' && fields.kind !== 'show') return null
  if (!fields.id || !fields.hash || !fields.stamped) return null

  const transforms = lines[2]?.startsWith(TRANSFORMS_PREFIX)
    ? lines[2].slice(TRANSFORMS_PREFIX.length).trim().split(/\s+/).filter(Boolean)
    : []
  const preferredMap = parsePreferredMap(lines.find((line) => line.startsWith(MAP_PREFIX)))
  const compatibility = parseCompatibility(lines.find((line) => line.startsWith(COMPAT_PREFIX)))

  return {
    version: 1,
    kind: fields.kind,
    id: fields.id,
    ...(fields.name ? { name: fields.name } : {}),
    hash: fields.hash,
    stamped: fields.stamped,
    transforms,
    ...(preferredMap ? { preferredMap } : {}),
    ...(compatibility ? { compatibility } : {}),
  }
}

export function stripPxlblzBanner(code: string): string {
  const lines = code.split('\n')
  if (lines[0] !== HEADER) return code
  if (!lines[1]?.startsWith(META_PREFIX)) return code
  let bodyStart = 2
  while (lines[bodyStart]?.startsWith('// pxlblz:')) bodyStart += 1
  return lines.slice(bodyStart).join('\n')
}

function stampDate(value: Date | string | undefined): string {
  if (typeof value === 'string') return value
  return (value ?? new Date()).toISOString()
}

function quotedValue(value: string): string {
  return JSON.stringify(value)
}

function tokenValue(value: string): string {
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : quotedValue(value)
}

function uniqueSafeTokens(values: string[]): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const value of values) {
    if (!/^[A-Za-z0-9._:-]+$/.test(value)) continue
    if (seen.has(value)) continue
    seen.add(value)
    tokens.push(value)
  }
  return tokens
}

function formatPreferredMap(map: ArtifactPreferredMap): string {
  const preferred = map.kind === 'stock' ? `stock:${tokenValue(map.id)}` : 'custom'
  return `${MAP_PREFIX}preferred=${preferred} name=${quotedValue(map.name)}`
}

function formatCompatibility(compatibility: ArtifactMapCompatibility): string {
  const fields = [
    `portability=${compatibility.portability}`,
    `dimensions=${compatibility.dimensions.join(',')}`,
    `classes=${compatibility.mapClasses.join(',')}`,
    ...(compatibility.aspectRatio
      ? [`aspect=${compatibility.aspectRatio.min}:${compatibility.aspectRatio.max}`]
      : []),
    `resolution=${compatibility.resolution}`,
    `exact=${compatibility.exactMap}`,
  ]
  return `${COMPAT_PREFIX}${fields.join(' ')}`
}

function parsePreferredMap(line: string | undefined): ArtifactPreferredMap | null {
  if (!line) return null
  const fields = parseFields(line.slice(MAP_PREFIX.length))
  const name = fields.name?.trim()
  if (!name) return null
  if (fields.preferred === 'custom') return { kind: 'custom', name }
  if (!fields.preferred?.startsWith('stock:')) return null
  const id = fields.preferred.slice('stock:'.length)
  return id ? { kind: 'stock', id, name } : null
}

function parseCompatibility(line: string | undefined): ArtifactMapCompatibility | null {
  if (!line) return null
  const fields = parseFields(line.slice(COMPAT_PREFIX.length))
  if (fields.portability !== 'adaptive' && fields.portability !== 'installation-bound') return null
  if (fields.resolution !== 'adaptive' && fields.resolution !== 'fixed') return null
  if (fields.exact !== 'true' && fields.exact !== 'false') return null
  const dimensions = uniqueSafeTokens((fields.dimensions ?? '').split(','))
    .map(Number)
    .filter((value): value is 1 | 2 | 3 => value === 1 || value === 2 || value === 3)
  const allowedClasses = new Set<ArtifactMapClass>(['path', 'surface', 'shell', 'volume', 'custom'])
  const mapClasses = uniqueSafeTokens((fields.classes ?? '').split(','))
    .filter((value): value is ArtifactMapClass => allowedClasses.has(value as ArtifactMapClass))
  const aspect = parseAspectRatio(fields.aspect)
  return {
    portability: fields.portability,
    dimensions,
    mapClasses,
    resolution: fields.resolution,
    ...(aspect ? { aspectRatio: aspect } : {}),
    exactMap: fields.exact === 'true',
  }
}

function parseAspectRatio(value: string | undefined): { min: number; max: number } | null {
  if (!value) return null
  const [min, max, extra] = value.split(':').map(Number)
  if (extra !== undefined || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return null
  return { min, max }
}

function parseFields(input: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const re = /([A-Za-z][A-Za-z0-9_-]*)=("(?:\\.|[^"\\])*"|[^\s]+)/g
  for (const match of input.matchAll(re)) {
    const [, key, rawValue] = match
    fields[key] = rawValue.startsWith('"') ? parseQuoted(rawValue) : rawValue
  }
  return fields
}

function parseQuoted(value: string): string {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : ''
  } catch {
    return ''
  }
}
