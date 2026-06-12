export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: InlineNode[] }

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string; id: string }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'blockquote'; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'table'; headers: InlineNode[][]; rows: InlineNode[][][] }
  | { type: 'image'; alt: string; src: string }
  | { type: 'rule' }

export type MarkdownHeading = {
  level: 1 | 2 | 3
  text: string
  id: string
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/
const LIST_RE = /^\s*[-*]\s+(.+)$/
const ORDERED_LIST_RE = /^\s*\d+[.)]\s+(.+)$/
const LIST_CONTINUATION_RE = /^\s+\S/
const BLOCKQUOTE_RE = /^>\s?(.*)$/

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[_*]/g, '')
    .trim()
}

export function slugifyHeading(text: string, used: Map<string, number> = new Map()): string {
  const base = stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function parseInlineUntil(text: string, start: number, stop: string): [InlineNode[], number] | null {
  const end = text.indexOf(stop, start)
  if (end === -1) return null
  return [parseInline(text.slice(start, end)), end + stop.length]
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let i = 0
  let plain = ''

  function flushPlain() {
    if (plain) {
      nodes.push({ type: 'text', text: plain })
      plain = ''
    }
  }

  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const parsed = parseInlineUntil(text, i + 2, '**')
      if (parsed) {
        flushPlain()
        nodes.push({ type: 'strong', children: parsed[0] })
        i = parsed[1]
        continue
      }
    }

    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        flushPlain()
        nodes.push({ type: 'code', text: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    if (text[i] === '[') {
      const labelEnd = text.indexOf(']', i + 1)
      if (labelEnd !== -1 && text[labelEnd + 1] === '(') {
        const hrefEnd = text.indexOf(')', labelEnd + 2)
        if (hrefEnd !== -1) {
          flushPlain()
          nodes.push({
            type: 'link',
            href: text.slice(labelEnd + 2, hrefEnd),
            children: parseInline(text.slice(i + 1, labelEnd)),
          })
          i = hrefEnd + 1
          continue
        }
      }
    }

    plain += text[i]
    i += 1
  }

  flushPlain()
  return nodes
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  const usedHeadingIds = new Map<string, number>()
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '') {
      i += 1
      continue
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ type: 'rule' })
      i += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim() || null
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ type: 'code', language, code: code.join('\n') })
      continue
    }

    const heading = HEADING_RE.exec(trimmed)
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3
      const text = stripInlineMarkdown(heading[2])
      blocks.push({ type: 'heading', level, text, id: slugifyHeading(text, usedHeadingIds) })
      i += 1
      continue
    }

    const image = IMAGE_RE.exec(trimmed)
    if (image) {
      blocks.push({ type: 'image', alt: image[1], src: image[2] })
      i += 1
      continue
    }

    const quote = BLOCKQUOTE_RE.exec(line)
    if (quote) {
      const parts: string[] = [quote[1].trim()]
      i += 1
      while (i < lines.length) {
        const next = BLOCKQUOTE_RE.exec(lines[i])
        if (!next) break
        parts.push(next[1].trim())
        i += 1
      }
      blocks.push({ type: 'blockquote', children: parseInline(parts.join(' ')) })
      continue
    }

    if (i + 1 < lines.length && trimmed.includes('|') && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(trimmed).map(parseInline)
      i += 2
      const rows: InlineNode[][][] = []
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]).map(parseInline))
        i += 1
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    const ordered = !LIST_RE.test(line) && ORDERED_LIST_RE.test(line)
    const itemRe = ordered ? ORDERED_LIST_RE : LIST_RE
    if (itemRe.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const item = itemRe.exec(lines[i])
        if (item) {
          items.push(item[1].trim())
          i += 1
          continue
        }
        // hard-wrapped sources indent an item's continuation lines
        if (
          LIST_CONTINUATION_RE.test(lines[i]) &&
          !LIST_RE.test(lines[i]) &&
          !ORDERED_LIST_RE.test(lines[i])
        ) {
          items[items.length - 1] += ` ${lines[i].trim()}`
          i += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered, items: items.map(parseInline) })
      continue
    }

    const paragraph: string[] = [trimmed]
    i += 1
    while (i < lines.length) {
      const next = lines[i].trim()
      if (
        next === '' ||
        next.startsWith('```') ||
        HEADING_RE.test(next) ||
        IMAGE_RE.test(next) ||
        LIST_RE.test(lines[i]) ||
        ORDERED_LIST_RE.test(lines[i]) ||
        BLOCKQUOTE_RE.test(lines[i]) ||
        /^-{3,}$/.test(next) ||
        (i + 1 < lines.length && next.includes('|') && isTableSeparator(lines[i + 1]))
      ) {
        break
      }
      paragraph.push(next)
      i += 1
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) })
  }

  return blocks
}

export function extractHeadings(blocks: MarkdownBlock[]): MarkdownHeading[] {
  return blocks
    .filter((block): block is Extract<MarkdownBlock, { type: 'heading' }> => block.type === 'heading')
    .map(({ level, text, id }) => ({ level, text, id }))
}
