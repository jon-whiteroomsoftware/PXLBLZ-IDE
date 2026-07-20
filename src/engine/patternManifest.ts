export const PXLBLZ_PATTERN_URL = 'https://pxlblz-ide.whiteroomsoftware.com/'

export interface PatternManifest {
  name: string
  credits: string[]
  license?: string
  description: string
  runsOn: string
  controls: string
}

const PATTERN_PREFIX = '// Pattern: '
const BUILT_WITH_LINE = `// Built with PXLBLZ-IDE ${PXLBLZ_PATTERN_URL}`
const CREDIT_PREFIX = '// Credit: '
const LICENSE_PREFIX = '// License: '
const RUNS_ON_PREFIX = '// Runs on: '
const CONTROLS_PREFIX = '// Controls: '

/**
 * Removes the canonical, human-facing PXLBLZ manifest before Pattern source is
 * embedded in a generated Show artifact. Structured attribution is collected
 * separately, while implementation notes and arbitrary comments remain code.
 */
export function stripPatternManifest(source: string): string {
  if (!parsePatternManifest(source)) return source

  let offset = 0
  let sawControls = false
  while (offset < source.length) {
    let lineEnd = offset
    while (lineEnd < source.length && source[lineEnd] !== '\r' && source[lineEnd] !== '\n') lineEnd += 1

    const line = source.slice(offset, lineEnd)
    let nextLine = lineEnd
    if (source[nextLine] === '\r') nextLine += 1
    if (source[nextLine] === '\n') nextLine += 1

    if (sawControls && line === '') return source.slice(nextLine)
    if (line.startsWith(CONTROLS_PREFIX)) sawControls = true

    if (nextLine === offset) break
    offset = nextLine
  }

  return sawControls ? '' : source
}

export function parsePatternManifest(source: string): PatternManifest | null {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  if (!lines[0]?.startsWith(PATTERN_PREFIX) || lines[1] !== BUILT_WITH_LINE) return null

  const name = lines[0].slice(PATTERN_PREFIX.length).trim()
  const credits: string[] = []
  const descriptionLines: string[] = []
  const controlLines: string[] = []
  let license = ''
  let runsOn = ''
  let readingControls = false
  let sawControls = false

  for (const line of lines.slice(2)) {
    if (!line.startsWith('//')) break
    if (line.startsWith(CREDIT_PREFIX)) {
      credits.push(line.slice(CREDIT_PREFIX.length).trim())
      continue
    }
    if (line.startsWith(LICENSE_PREFIX)) {
      license = line.slice(LICENSE_PREFIX.length).trim()
      continue
    }
    if (line.startsWith(RUNS_ON_PREFIX)) {
      runsOn = line.slice(RUNS_ON_PREFIX.length).trim()
      readingControls = false
      continue
    }
    if (line.startsWith(CONTROLS_PREFIX)) {
      controlLines.push(line.slice(CONTROLS_PREFIX.length).trim())
      readingControls = true
      sawControls = true
      continue
    }
    const prose = line.slice(2).trim()
    if (!prose) {
      if (sawControls) break
      readingControls = false
      continue
    }
    if (readingControls) controlLines.push(prose)
    else descriptionLines.push(prose)
  }

  const description = descriptionLines.join(' ').trim()
  const controls = controlLines.join(' ').trim()
  if (!name || !description || !runsOn || !controls) return null
  return {
    name,
    credits,
    ...(license ? { license } : {}),
    description,
    runsOn,
    controls,
  }
}
