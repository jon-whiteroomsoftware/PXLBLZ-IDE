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
const CREDIT_LINE_RE = /^\s*(?:(?:\/\/+|\/\*+|\*+)\s*)?credit\s*:\s*.+\s+by\s+(.+?)(?:\s+[—-]\s+https?:\/\/\S+)?\s*(?:\*\/)?\s*$/i
const COMMENT_LINE_RE = /^\s*(?:\/\/+|\/\*+|\*+)\s*/
const MAX_HEADER_SCAN_BYTES = 4096
const MAX_AUTHORS = 8
const MAX_AUTHOR_CHARS = 160

// The community signature convention: a header comment line that is nothing but
// a date and a short name, in either order — "// 10/09/2022 ZRanger1". Matching
// is deliberately signature-shaped so dated changelog prose never gains an author.
const SIGNATURE_DATE = String.raw`(?:\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{1,2},?)?\s+\d{4})`
const SIGNATURE_VERSION = String.raw`(?:v?\d+(?:\.\d+)+)`
const SIGNATURE_LABEL = String.raw`(?:(?:original(?:\s+pattern|\s+author)?|adapted\s+from|based\s+on|ported\s+from|pattern)\s*:\s*)`
const SIGNATURE_DATE_FIRST_RE = new RegExp(`^${SIGNATURE_LABEL}?(?:${SIGNATURE_VERSION}\\s+)?${SIGNATURE_DATE}\\s+(.{1,60})$`, 'i')
const SIGNATURE_NAME_FIRST_RE = new RegExp(`^(.{1,60}?)\\s+(?:${SIGNATURE_VERSION}\\s+)?${SIGNATURE_DATE}$`, 'i')
const SIGNATURE_NAME_MAX_WORDS = 3
const SIGNATURE_STOP_WORDS = new Set([
  'added', 'adjusted', 'bugfix', 'bugfixes', 'changed', 'cleaned', 'cleanup',
  'created', 'draft', 'enhanced', 'final', 'fix', 'fixed', 'fixes', 'fixup',
  'hack', 'improved', 'initial',
  'major', 'merged', 'minor', 'misc', 'modified', 'moved', 'optimized',
  'polished', 'port', 'ported', 'redo', 'reduced', 'refactor', 'refactored',
  'release', 'released',
  'removed', 'renamed', 'restored', 'reverted', 'revised', 'reworked',
  'rewritten', 'rewrote', 'simplified', 'tweaked', 'update', 'updated',
  'updates', 'various', 'version', 'wip',
])
// Lowercase particles legitimate inside multi-word names ("Ludwig van
// Beethoven"). Ordinary prose words ("the", "of") stay out: a particle is
// treated as proof of a name, so the set must never overlap plain English.
const SIGNATURE_NAME_PARTICLES = new Set([
  'bin', 'da', 'de', 'del', 'della', 'di', 'du', 'el', 'ibn', 'la', 'le',
  'ten', 'ter', 'van', 'von',
])

export function extractPatternAuthors(source: string): string[] {
  const header = source.slice(0, MAX_HEADER_SCAN_BYTES)
  const beforeCode = header.split(/\bexport\s+function\b|\bfunction\s+(?:beforeRender|render|render2D|render3D)\b/, 1)[0] ?? ''
  const candidates: string[] = []
  for (const line of beforeCode.split(/\r?\n/)) {
    if (!COMMENT_LINE_RE.test(line)) continue
    const creditMatch = line.match(CREDIT_LINE_RE)
    if (creditMatch) {
      candidates.push(...splitAuthorList(creditMatch[1]))
      continue
    }
    const match = line.match(AUTHOR_LINE_RE)
    if (match) {
      candidates.push(...splitAuthorList(match[1]))
      continue
    }
    const signature = signatureAuthor(line)
    if (signature) candidates.push(signature)
  }
  return normalizePatternAuthors(candidates)
}

/** Recognize one bare date+name signature comment line, or return null. */
function signatureAuthor(line: string): string | null {
  const body = line
    .replace(COMMENT_LINE_RE, '')
    .replace(/\s*\*\/\s*$/, '')
    .trim()
  if (!body || /https?:\/\//i.test(body)) return null
  const remainder = body.match(SIGNATURE_DATE_FIRST_RE)?.[1] ?? body.match(SIGNATURE_NAME_FIRST_RE)?.[1]
  if (!remainder) return null
  const name = remainder.trim()
  // Signature-shaped only: a short name or handle, not sentence punctuation,
  // starting with a letter, and never a changelog verb.
  if (/[.,:;!?"()<>]/.test(name)) return null
  const words = name.split(/\s+/)
  if (words.length > SIGNATURE_NAME_MAX_WORDS) return null
  if (!/^[a-z]/i.test(words[0])) return null
  if (words.some((word) => SIGNATURE_STOP_WORDS.has(word.toLowerCase()))) return null
  // Every remainder must begin like a proper name or handle, never lowercase
  // prose or an unbounded past/progressive changelog verb.
  if (!/^[A-Z]/.test(words[0]) && !/\d/.test(words[0])) return null
  if (words[0].length >= 5 && /(?:ed|ing)$/i.test(words[0])) return null
  if (words.length > 1) {
    // Multi-word remainders must read as a proper name or handle, not prose.
    // The changelog-verb space is unbounded, so the no-false-authors invariant
    // wins over completeness: three words are a name only around a lowercase
    // particle ("Ludwig van Beethoven"), never plain prose ("Corrected Render Cache").
    const rest = words.slice(1)
    if (!rest.every((word) => /^[A-Z]/.test(word) || /\d/.test(word) || SIGNATURE_NAME_PARTICLES.has(word))) return null
    if (words.length === 3 && !SIGNATURE_NAME_PARTICLES.has(words[1])) return null
  }
  return name
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
