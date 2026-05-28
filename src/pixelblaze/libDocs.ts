import { LIBRARIES } from './libs'

export interface LibFnDoc {
  params: string[]
  doc: string
}

export function parseLibDocs(src: string): Record<string, LibFnDoc> {
  const lines = src.split('\n')
  const docs: Record<string, LibFnDoc> = {}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fnMatch = line.match(/^function\s+(\w+)\s*\(([^)]*)\)/)
    if (!fnMatch) continue

    const name = fnMatch[1]
    const params = fnMatch[2].split(',').map((p) => p.trim()).filter(Boolean)

    const commentLines: string[] = []
    let j = i - 1
    while (j >= 0) {
      const prev = lines[j].trim()
      if (prev.startsWith('//')) {
        const text = prev.replace(/^\/\/\s*/, '')
        // Skip section-header dividers (─── Section ───)
        if (!text.match(/^[─—]+/)) commentLines.unshift(text)
        j--
      } else {
        break
      }
    }

    docs[name] = { params, doc: commentLines.join(' ').trim() }
  }

  return docs
}

// Keyed by lowercase namespace name (sdf, coord, anim, color, noise)
export const LIB_DOCS: Record<string, Record<string, LibFnDoc>> = Object.fromEntries(
  Object.entries(LIBRARIES).map(([name, src]) => [name.toLowerCase(), parseLibDocs(src)])
)
