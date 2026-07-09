import { crc32 } from './bytecodePush'

export type ArtifactKind = 'pattern' | 'show'

export interface ArtifactStampMeta {
  kind: ArtifactKind
  id: string
  name?: string
  transforms?: string[]
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
}

const HEADER = '// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/'
const META_PREFIX = '// pxlblz:1 '
const TRANSFORMS_PREFIX = '// pxlblz:transforms '
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

  return {
    version: 1,
    kind: fields.kind,
    id: fields.id,
    ...(fields.name ? { name: fields.name } : {}),
    hash: fields.hash,
    stamped: fields.stamped,
    transforms,
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
