// Provenance: pxlblz-v3 src/shows/stockCatalogue.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Read-only view over the vendored v2 stock pattern catalogue for agent
// consumption. Pure logic — no MCP imports. Descriptions come from each
// pattern's own header comment (upstream text, provenance preserved), never
// invented here.
import { inspectPatternMetadata } from '@/engine/bundle'
import { nativeDimension } from '@/engine/loadPattern'
import { DEMO_AUTHORS, DEMOS } from '@/pixelblaze/stock/patterns'

export interface StockPatternSummary {
  id: string
  dimensions: 1 | 2 | 3
  authors: string[]
  /** First header-comment paragraph of the source, when one exists. */
  description: string
}

export interface StockPatternDetail extends StockPatternSummary {
  /** Declared control exports (sliders, pickers, toggles) by export name. */
  controls: Array<{ exportName: string; kind: string }>
  source: string
  sourceBytes: number
  renderFns: { hasRender: boolean; hasRender2D: boolean; hasRender3D: boolean }
}

// Stock headers follow a house banner ("Pattern: <name>" / "Built with
// PXLBLZ-IDE <url>") ahead of the descriptive paragraph, then labeled
// sections ("Runs on:", "Controls:", "Notes:", credits). The listing wants
// only the descriptive paragraph.
const BANNER_LINE = /^(pattern:|built with\b|https?:\/\/)/i
const SECTION_LINE = /^(runs on|controls|notes|credits?|license|copyright|original|source|based on)\b\s*:?/i

/** First descriptive comment paragraph at the top of a pattern source —
 * banner and labeled sections excluded — collapsed to one line and capped
 * for listings. */
export function extractHeaderDescription(source: string, maxLength = 240): string {
  const collected: string[] = []
  let inBlock = false
  for (const rawLine of source.split('\n')) {
    let line = rawLine.trim()
    if (!inBlock) {
      if (line.startsWith('/*')) {
        inBlock = true
        line = line.replace(/^\/\*+/, '').trim()
        if (line.endsWith('*/')) {
          inBlock = false
          line = line.replace(/\*+\/$/, '').trim()
        }
      } else if (line.startsWith('//')) {
        line = line.replace(/^\/\/+/, '').trim()
      } else if (line === '') {
        continue
      } else {
        break // First code line ends the header.
      }
    } else {
      if (line.endsWith('*/')) {
        inBlock = false
        line = line.replace(/\*+\/$/, '').trim()
      }
      line = line.replace(/^\*+/, '').trim()
    }
    if (SECTION_LINE.test(line) && collected.length > 0) break
    if (line === '') {
      if (collected.length > 0) break // Paragraph boundary.
      continue
    }
    if (BANNER_LINE.test(line) || SECTION_LINE.test(line)) continue
    collected.push(line)
  }
  const paragraph = collected.join(' ').replace(/\s+/g, ' ').trim()
  return paragraph.length > maxLength ? `${paragraph.slice(0, maxLength - 1).trimEnd()}…` : paragraph
}

let cachedCatalogue: StockPatternDetail[] | null = null

function catalogue(): StockPatternDetail[] {
  if (!cachedCatalogue) {
    cachedCatalogue = Object.entries(DEMOS)
      .map(([id, source]) => {
        const metadata = inspectPatternMetadata(source)
        const renderFns = metadata.renderFns ?? { hasRender: false, hasRender2D: false, hasRender3D: false }
        return {
          id,
          dimensions: nativeDimension(metadata.renderFns),
          authors: DEMO_AUTHORS[id] ?? [],
          description: extractHeaderDescription(source),
          source,
          sourceBytes: source.length,
          controls: (metadata.controls ?? []).map((control) => ({ exportName: control.exportName, kind: control.kind })),
          renderFns: {
            hasRender: Boolean(renderFns.hasRender),
            hasRender2D: Boolean(renderFns.hasRender2D),
            hasRender3D: Boolean(renderFns.hasRender3D),
          },
        }
      })
      .sort((a, b) => a.id.localeCompare(b.id))
  }
  return cachedCatalogue
}

export function listStockPatterns(): StockPatternSummary[] {
  return catalogue().map(({ id, dimensions, authors, description }) => ({ id, dimensions, authors, description }))
}

export function getStockPattern(id: string): StockPatternDetail {
  const entry = catalogue().find((pattern) => pattern.id === id)
  if (!entry) {
    const lowered = id.toLowerCase()
    const near = catalogue()
      .filter((pattern) => pattern.id.toLowerCase().includes(lowered))
      .slice(0, 5)
      .map((pattern) => pattern.id)
    throw new Error(
      `Unknown stock pattern "${id}".` +
        (near.length > 0 ? ` Closest ids: ${near.join(', ')}.` : '') +
        ' Call list_stock_patterns for the full catalogue.',
    )
  }
  return entry
}
