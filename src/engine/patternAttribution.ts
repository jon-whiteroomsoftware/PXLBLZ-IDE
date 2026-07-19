export interface PatternAttribution {
  name: string
  authors: string[]
}

export interface ShowPatternAttribution extends PatternAttribution {
  kind: 'stock' | 'user'
  id: string
}

export interface ShowArtifactAttribution {
  by: string[]
  patterns: ShowPatternAttribution[]
}

export const PXLBLZ_AUTHOR = 'PXLBLZ <pxlblz@whiteroomsoftware.com>'

const AUTHOR_LINE_RE = /^\s*(?:(?:\/\/+|\/\*+|\*+)\s*)?(?:@?authors?|by|created by|written by)\s*:?\s*(.+?)\s*(?:\*\/)?\s*$/i
const COMMENT_LINE_RE = /^\s*(?:\/\/+|\/\*+|\*+)\s*/
const MAX_HEADER_SCAN_BYTES = 4096
const MAX_AUTHORS = 8
const MAX_AUTHOR_CHARS = 160

export function extractPatternAuthors(source: string): string[] {
  const header = source.slice(0, MAX_HEADER_SCAN_BYTES)
  const beforeCode = header.split(/\bexport\s+function\b|\bfunction\s+(?:beforeRender|render|render2D|render3D)\b/, 1)[0] ?? ''
  const candidates: string[] = []
  for (const line of beforeCode.split(/\r?\n/)) {
    if (!COMMENT_LINE_RE.test(line)) continue
    const match = line.match(AUTHOR_LINE_RE)
    if (!match) continue
    candidates.push(...splitAuthorList(match[1]))
  }
  return normalizePatternAuthors(candidates)
}

export function normalizePatternAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const authors: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const author = cleanAuthor(item)
    if (!author || seen.has(author)) continue
    seen.add(author)
    authors.push(author)
    if (authors.length >= MAX_AUTHORS) break
  }
  return authors
}

export function buildShowPatternCreditLines(patterns: readonly PatternAttribution[]): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const pattern of patterns) {
    const name = commentText(pattern.name.trim() || 'Untitled Pattern')
    const authors = normalizePatternAuthors(pattern.authors)
    const line = authors.length > 0
      ? `- ${name} by ${authors.map(commentText).join('; ')}`
      : `- ${name}`
    if (seen.has(line)) continue
    seen.add(line)
    lines.push(line)
  }
  return lines
}

function splitAuthorList(value: string): string[] {
  return value
    .replace(/\s*\*\/\s*$/, '')
    .split(/\s*(?:;|\band\b)\s*/i)
    .flatMap((part) => splitCommaOutsideEmail(part))
}

function splitCommaOutsideEmail(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let insideAngle = false
  for (const char of value) {
    if (char === '<') insideAngle = true
    if (char === '>') insideAngle = false
    if (char === ',' && !insideAngle) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

function cleanAuthor(value: string): string {
  return value
    .replace(/^\s*(?:@?authors?|by|created by|written by)\s*:?\s*/i, '')
    .replace(/\s*\*\/\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_AUTHOR_CHARS)
}

function commentText(value: string): string {
  return value.replace(/\*\//g, '* /').replace(/\r?\n/g, ' ').trim()
}
